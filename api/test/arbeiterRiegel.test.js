/**
 * Der Arbeiterriegel auf dem v1-Router (M2.6, Owner-Entscheid 2026-09-03).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD, UND WARUM ES NICHT DIE ROUTEN SIND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * M2.5 hat 64 Routen von Hand eingestuft und sechs Befunde geschlossen. Alle
 * sechs trugen dieselbe Falle: `mine`/`me` im Pfad, gemeint war die ORG. Eine
 * Konvention, die sechsmal in dieselbe Richtung taeuscht, taeuscht auch beim
 * siebten Mal — und sie hat beim Einstufen auch mich getaeuscht.
 *
 * Deshalb prueft diese Datei NICHT, ob einzelne Routen richtig eingestuft sind.
 * Sie prueft die EIGENSCHAFT, die das ueberfluessig macht: dass eine nicht
 * eingetragene Route zu ist. Danach kostet ein Einstufungsfehler eine
 * 403-Meldung im Portal statt Firmendaten in einer fremden Hand.
 *
 * DIE VIER STELLEN, AN DENEN SO EIN RIEGEL LAUTLOS AUSFAELLT, und jede hat hier
 * ihre Probe:
 *   1. Er haengt am Mount statt am Router  -> `/api/...` umgeht ihn.
 *   2. Er rutscht unter einen Router       -> der ist ungeschuetzt, funktioniert
 *                                             aber weiter.
 *   3. Er laeuft vor `orgContext`          -> erkennt niemanden als Arbeiter.
 *   4. Die Wegpruefung ist zu woertlich    -> ein Fragezeichen umgeht sie.
 *
 * Run: node --test --test-force-exit test/arbeiterRiegel.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import http from "node:http";

import { istErlaubt, ERLAUBT, GESPERRT_MIT_ABSICHT } from "../config/arbeiterRiegel.js";
import { arbeiterRiegel } from "../middleware/arbeiterRiegel.js";
import { arbeiterSitzung } from "../middleware/orgAccess.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const APP = fs.readFileSync(path.join(API, "app.js"), "utf8");
const MESSUNG = JSON.parse(
  fs.readFileSync(path.join(API, "test", "fixtures", "arbeiterSitzung.json"), "utf8"));

/* ── Hilfen ──────────────────────────────────────────────────────────── */

function arbeiterAnfrage(methode, pfad) {
  return {
    method: methode, path: pfad,
    session: { userId: "u-1", userRole: "worker" },
    orgId: "o-1",
    orgMembership: { role_key: "worker", org_type: "agency" }
  };
}

function firmenAnfrage(methode, pfad) {
  return {
    method: methode, path: pfad,
    session: { userId: "u-2", userRole: "user" },
    orgId: "o-1",
    orgMembership: { role_key: "owner", org_type: "company" }
  };
}

function fahren(req) {
  const ergebnis = { weiter: false, status: null, rumpf: null };
  const res = {
    status(c) { ergebnis.status = c; return this; },
    json(b) { ergebnis.rumpf = b; return this; }
  };
  arbeiterRiegel({})(req, res, () => { ergebnis.weiter = true; });
  return ergebnis;
}

/* ── 1. Das Verhalten ────────────────────────────────────────────────── */

describe("M2.6 · der Riegel laesst durch, was eingetragen ist — und sonst nichts", () => {
  it("ein eingetragener Weg kommt durch", () => {
    const e = fahren(arbeiterAnfrage("GET", "/worker/dashboard"));
    assert.equal(e.weiter, true);
    assert.equal(e.status, null);
  });

  it("ein NICHT eingetragener Weg endet mit 403 und benennt sich", () => {
    const e = fahren(arbeiterAnfrage("GET", "/invoices"));
    assert.equal(e.weiter, false, "der Riegel hat einen nicht eingetragenen Weg durchgelassen");
    assert.equal(e.status, 403);
    assert.equal(e.rumpf.error, "WORKER_ROUTE_NOT_ALLOWED",
      "der Fehlercode muss den Riegel benennen — sonst sucht der naechste Mensch "
      + "die Ursache in der Route statt hier");
  });

  it("eine erlaubte ROUTE mit unerlaubter METHODE ist zu", () => {
    /* Die Haelfte, die man beim Bauen einer Wegliste am leichtesten vergisst.
     * `/notifications` ist zum Lesen offen; loeschen darf sie das Portal nicht. */
    assert.equal(fahren(arbeiterAnfrage("GET", "/notifications")).weiter, true);
    assert.equal(fahren(arbeiterAnfrage("DELETE", "/notifications")).status, 403);
  });

  it("wer kein Arbeiter ist, merkt vom Riegel nichts", () => {
    /* Die wichtigste Nicht-Wirkung: fuer Unternehmen und Agenturen aendert
     * sich nichts. Ein Riegel, der zu breit greift, wird zurueckgebaut — und
     * nimmt den Schutz mit. */
    for (const weg of [["GET", "/invoices"], ["POST", "/me/plan"], ["GET", "/workers"]]) {
      const e = fahren(firmenAnfrage(weg[0], weg[1]));
      assert.equal(e.weiter, true, `${weg[0]} ${weg[1]} wurde einer Firmensitzung verweigert`);
    }
  });

  it("eine Sitzung ohne Mitgliedschaft ist kein Arbeiter — und wird nicht gesperrt", () => {
    /* Bewusst so: der Riegel ist fail-closed fuer ARBEITER, nicht fuer
     * Unbekannte. Wer keine Sitzung hat, scheitert eine Schicht weiter an
     * `requireAuth`. Hier zusaetzlich zu sperren hiesse, die Anmeldung selbst
     * zu verriegeln. */
    const e = fahren({ method: "GET", path: "/invoices" });
    assert.equal(e.weiter, true);
  });

  it("Grossschreibung und Leerzeichen aendern nichts an der Erkennung", () => {
    /*
     * GEFUNDEN DURCH DIE MUTATIONSPRUEFUNG (Trennwand, 2026-09-04): `.trim()`
     * und `.toLowerCase()` in `arbeiterSitzung` liessen sich ENTFERNEN, ohne
     * dass eine Probe rot wurde. Alle Vorrichtungen schrieben "worker" schon
     * klein und ohne Leerzeichen.
     *
     * Das ist kein Schoenheitsfehler. `role_key` kommt aus der Datenbank; ein
     * "Worker" oder ein " worker " — aus einem Import, einer Migration, einer
     * Hand — waere dann KEIN Arbeiter mehr, und der Riegel oeffnete sich fuer
     * genau die Sitzung, die er schliessen soll. Ein Riegel, der an der
     * Schreibweise haengt, ist keiner.
     */
    for (const schreibweise of ["worker", "Worker", "WORKER", "  worker  ", "\tWorker\n"]) {
      const ueberOrg = { orgMembership: { role_key: schreibweise } };
      const ueberSitzung = { session: { userRole: schreibweise } };
      assert.equal(arbeiterSitzung(ueberOrg).istArbeiter, true,
        `role_key ${JSON.stringify(schreibweise)} wurde nicht als Arbeiter erkannt`);
      assert.equal(arbeiterSitzung(ueberSitzung).istArbeiter, true,
        `userRole ${JSON.stringify(schreibweise)} wurde nicht als Arbeiter erkannt`);
      assert.equal(fahren({ ...ueberOrg, method: "GET", path: "/invoices" }).status, 403,
        `der Riegel liess ${JSON.stringify(schreibweise)} durch`);
    }

    /* Und die Gegenrichtung: was nur AEHNLICH heisst, ist kein Arbeiter. */
    for (const fremd of ["workers", "coworker", "work", "owner", ""]) {
      assert.equal(arbeiterSitzung({ orgMembership: { role_key: fremd } }).istArbeiter, false,
        `${JSON.stringify(fremd)} wurde faelschlich als Arbeiter erkannt`);
    }
  });

  it("EINE der beiden Quellen genuegt, um Arbeiter zu sein", () => {
    /* `||`, nicht `&&`. Ein Riegel, den ein fehlendes Feld oeffnet, ist keiner. */
    const nurSitzung = { method: "GET", path: "/invoices", session: { userRole: "worker" } };
    const nurMitglied = { method: "GET", path: "/invoices", orgMembership: { role_key: "worker" } };
    assert.equal(fahren(nurSitzung).status, 403, "die Kontorolle allein muss greifen");
    assert.equal(fahren(nurMitglied).status, 403, "die Org-Rolle allein muss greifen");
    assert.equal(arbeiterSitzung(nurSitzung).istArbeiter, true);
    assert.equal(arbeiterSitzung(nurMitglied).istArbeiter, true);
  });
});

/* ── 2. Die Wegpruefung selbst ───────────────────────────────────────── */

describe("M2.6 · die Wegpruefung laesst sich nicht mit Schreibweisen umgehen", () => {
  it("Abfrageteil und Schlussschraegstrich entscheiden nicht", () => {
    /* Waere das nicht so, genuegte ein Fragezeichen. Genau diese Sorte
     * Umgehung faellt in keiner Messung auf, weil niemand sie versucht —
     * bis jemand sie versucht. */
    assert.equal(istErlaubt("GET", "/notifications?ungelesen=1"), true);
    assert.equal(istErlaubt("GET", "/notifications/"), true);
    assert.equal(istErlaubt("GET", "/invoices?x=1"), false);
    assert.equal(istErlaubt("GET", "/invoices/"), false);
    assert.equal(istErlaubt("GET", "/invoices#x"), false);
  });

  it("die Methode wird verglichen, nicht geraten", () => {
    assert.equal(istErlaubt("get", "/worker/me"), true, "Kleinschreibung muss zaehlen");
    assert.equal(istErlaubt("PUT", "/me/profile"), true);
    assert.equal(istErlaubt("POST", "/me/profile"), false);
    assert.equal(istErlaubt("", "/me/profile"), false);
    assert.equal(istErlaubt(null, null), false);
  });

  it("das Portal-Praefix trifft NUR das Portal", () => {
    /*
     * DIE GEFAEHRLICHSTE ZEILE DER GANZEN LISTE. `/worker/` ist das einzige
     * Praefix, und es liegt einen Buchstaben neben der Agentursteuerung:
     *
     *   /worker/me            Portal  — der Mensch
     *   /workers/:id          Agentur — die Personalakte eines Menschen
     *   /worker-invites       Agentur — Einladungen verschicken
     *   /worker-submissions   Agentur — Stundenzettel PRUEFEN statt abgeben
     *   /worker-billing       Agentur — Abrechnung
     *
     * Ein Praefix "/worker" ohne Schraegstrich haette alle vier geoeffnet.
     */
    assert.equal(istErlaubt("GET", "/worker/me"), true);
    assert.equal(istErlaubt("POST", "/worker/assignments/abc/confirm"), true);
    for (const p of ["/workers", "/workers/u-9", "/worker-invites", "/worker-submissions",
                     "/worker-billing/dashboard", "/worker-assignment-links"]) {
      assert.equal(istErlaubt("GET", p), false, `${p} gehoert der Agentur und muss zu sein`);
      assert.equal(istErlaubt("POST", p), false, `${p} gehoert der Agentur und muss zu sein`);
    }
  });

  it("ein Parameter trifft genau EINEN Abschnitt", () => {
    assert.equal(istErlaubt("GET", "/me/entitlements/feature/marktplatz"), true);
    assert.equal(istErlaubt("GET", "/me/entitlements/feature"), false,
      "ein fehlender Abschnitt darf nicht als Treffer zaehlen");
    assert.equal(istErlaubt("GET", "/me/entitlements/feature/a/b"), false,
      "ein Parameter darf sich nicht ueber mehrere Abschnitte strecken");
  });

  it("jeder Eintrag traegt einen Grund", () => {
    /* Eine Ausnahme ohne Begruendung ist in einem Jahr nicht mehr zu bewerten —
     * und wird dann entweder blind uebernommen oder blind gestrichen. */
    const ohne = ERLAUBT.filter((e) => !e.grund || String(e.grund).trim().length < 20)
      .map((e) => `${e.methoden} ${e.pfad}`);
    assert.deepStrictEqual(ohne, [], "Eintraege ohne tragfaehigen Grund:\n  " + ohne.join("\n  "));
    assert.ok(Object.isFrozen(ERLAUBT), "die Liste muss eingefroren sein");
  });
});

/* ── 3. Gegen die Messung aus M2.5 ───────────────────────────────────── */

describe("M2.6 · Riegel und Messung muessen dasselbe meinen", () => {
  /*
   * Die beiden Verzeichnisse pruefen einander, statt sich zu wiederholen:
   *   arbeiterSitzung.json  WAS eine Sitzung sieht  — Messung, Tatsache
   *   config/arbeiterRiegel WAS sie erreichen darf  — Entscheidung
   *
   * Ohne diese beiden Proben koennte der Riegel etwas sperren, das als
   * unbedenklich belegt ist (dann bricht etwas), oder etwas durchlassen, das
   * M2.5 bereits geschlossen hat (dann ist er schwaecher als der Bestand).
   */

  it("alles, was M2.5 als unbedenklich gemessen hat, kommt durch", () => {
    const gesperrt = MESSUNG.erlaubt
      .map((e) => e.route)
      .filter((r) => { const [m, p] = r.split(" "); return !istErlaubt(m, p); });
    assert.deepStrictEqual(gesperrt, [],
      "Der Riegel sperrt Wege, die M2.5 als eigene Daten des Menschen belegt hat. "
      + "Entweder gehoeren sie in config/arbeiterRiegel.js, oder die Messung ist "
      + "ueberholt und der Eintrag gehoert aus arbeiterSitzung.json heraus:\n  "
      + gesperrt.join("\n  "));
  });

  it("alles, was M2.5 geschlossen hat, bleibt zu", () => {
    const offen = MESSUNG.geschlossen
      .map((e) => e.route)
      .filter((r) => { const [m, p] = r.split(" "); return istErlaubt(m, p); });
    assert.deepStrictEqual(offen, [],
      "Der Riegel liesse Wege durch, die M2.5 einzeln geschlossen hat — er waere "
      + "damit schwaecher als der Bestand:\n  " + offen.join("\n  "));
  });

  it("die Messung ist nicht leer — sonst prueft der Abgleich nichts", () => {
    assert.ok(MESSUNG.erlaubt.length >= 40, `nur ${MESSUNG.erlaubt.length} erlaubte Eintraege`);
    assert.ok(MESSUNG.geschlossen.length >= 10, `nur ${MESSUNG.geschlossen.length} geschlossene`);
  });

  it("die absichtlich gesperrten Wege stehen NIE auf der Liste", () => {
    /*
     * Diese fuenf tragen `me` im Pfad und meinen die Organisation. `POST
     * /me/plan` kauft der FIRMA einen Tarif. Genau solche Pfade sind beim
     * Einstufen sechsmal durchgerutscht; hier ist festgehalten, dass sie es
     * nicht wieder tun.
     */
    const durchgerutscht = [];
    for (const g of GESPERRT_MIT_ABSICHT) {
      for (const m of g.methoden) {
        if (istErlaubt(m, g.pfad)) durchgerutscht.push(`${m} ${g.pfad} — ${g.grund}`);
      }
    }
    assert.deepStrictEqual(durchgerutscht, [],
      "Diese Wege sind ausdruecklich gesperrt und stehen trotzdem auf der Liste:\n  "
      + durchgerutscht.join("\n  "));
    assert.ok(GESPERRT_MIT_ABSICHT.length >= 5);
  });
});

/* ── 4. Das Portal muss weiter arbeiten koennen ──────────────────────── */

describe("M2.6 · das Einsatzportal bleibt vollstaendig bedienbar", () => {
  /*
   * Gemessen am 2026-09-04 aus den Aufrufen von
   * `frontend/public/js/workerPortal/*.js` und `einsatzportal-*.html`.
   *
   * Diese Probe ist die Gegenkraft zum Riegel. Fail-closed ist nur so lange
   * richtig, wie das, was der Mensch WIRKLICH braucht, offen bleibt — sonst
   * ist es kein Schutz, sondern ein Ausfall.
   */
  const PORTAL = [
    ["GET", "/csrf"], ["GET", "/auth/sessions"], ["POST", "/auth/logout"],
    ["POST", "/auth/logout-all"],
    ["GET", "/skills/catalog"], ["POST", "/skills/propose"],
    ["GET", "/notifications/stream"],
    ["GET", "/worker/dashboard"], ["GET", "/worker/me"], ["PATCH", "/worker/me"],
    ["GET", "/worker/me/skills"], ["PUT", "/worker/me/skills"],
    ["GET", "/worker/me/availability"], ["PATCH", "/worker/me/availability"],
    ["GET", "/worker/me/onboarding"], ["DELETE", "/worker/me/photo"],
    ["GET", "/worker/me/abwesenheiten"], ["POST", "/worker/me/abwesenheit"],
    ["GET", "/worker/me/abwesenheit/folgen"], ["POST", "/worker/me/abwesenheit/vorgang"],
    ["POST", "/worker/me/verspaetung"],
    ["GET", "/worker/assignments"], ["GET", "/worker/assignments/a-1"],
    ["POST", "/worker/assignments/a-1/confirm"], ["POST", "/worker/assignments/a-1/decline"],
    ["GET", "/worker/submissions"], ["POST", "/worker/submissions"],
    ["PUT", "/worker/submissions/s-1"], ["DELETE", "/worker/submissions/s-1/entries/e-1"],
    ["GET", "/worker/documents"], ["DELETE", "/worker/documents/d-1"],
    ["GET", "/worker/schedule"], ["GET", "/worker/notifications"],
    ["PATCH", "/worker/notifications/n-1/read"], ["PATCH", "/worker/notifications/read-all"],
    ["GET", "/worker/staffing-requests"], ["POST", "/worker/staffing-requests/i-1/respond"],
    ["GET", "/worker/staffing-choice-sets"], ["POST", "/worker/staffing-choice-sets/c-1/respond"]
  ];

  it("jeder gemessene Portalweg kommt durch", () => {
    const kaputt = PORTAL.filter(([m, p]) => !istErlaubt(m, p)).map(([m, p]) => `${m} ${p}`);
    assert.deepStrictEqual(kaputt, [],
      "Diese Wege ruft das Einsatzportal wirklich auf und der Riegel sperrt sie. "
      + "Fuer den Menschen im Portal ist das ein kaputter Knopf:\n  " + kaputt.join("\n  "));
  });

  it("das eigene Passwort und die eigene Auskunft bleiben offen", () => {
    /* Ein Riegel, der das Passwortaendern sperrt, ist ein Sicherheitsproblem.
     * Und DSGVO-Auskunft und -Loeschung sind Rechte, keine Funktionen. */
    assert.equal(istErlaubt("POST", "/me/change-password"), true);
    assert.equal(istErlaubt("GET", "/me/export"), true);
    assert.equal(istErlaubt("DELETE", "/me"), true);
  });
});

/* ── 5. Die Montage ──────────────────────────────────────────────────── */

describe("M2.6 · die Montage — hier faellt so ein Riegel lautlos aus", () => {
  it("er haengt am ROUTER, nicht am Mount — sonst umgeht ihn `/api` ohne `/v1`", () => {
    /*
     * Der v1-Router ist ZWEIMAL montiert. Am Mount `/api/v1` waere der Riegel
     * vollstaendig zu umgehen gewesen, indem man "/v1" weglaesst — und der
     * geschuetzte Weg haette dabei funktioniert, der ungeschuetzte auch.
     */
    assert.match(APP, /v1\.use\(arbeiterRiegel\(/,
      "der Riegel haengt nicht am v1-Router");
    assert.ok(/app\.use\("\/api\/v1", v1\)/.test(APP) && /app\.use\("\/api", v1\)/.test(APP),
      "die Doppelmontage ist weg — dann ist der Grund fuer diese Probe zu pruefen");
    assert.ok(!/app\.use\(\s*"\/api\/v1",\s*arbeiterRiegel/.test(APP),
      "der Riegel haengt am Mount statt am Router und ist ueber /api umgehbar");
  });

  it("er ist die ERSTE Schicht des Routers", () => {
    /*
     * Rutscht er unter einen Router, ist genau der ungeschuetzt — und zwar
     * lautlos, denn er funktioniert ja weiter. Geprueft wird die Reihenfolge im
     * Quelltext: der Riegel muss vor JEDEM `v1.use(create…Router(` stehen.
     */
    const riegelBei = APP.indexOf("v1.use(arbeiterRiegel(");
    assert.notEqual(riegelBei, -1, "der Riegel steht nicht in app.js");
    const ersterRouter = APP.search(/v1\.use\(create[A-Za-z]+Router\(/);
    assert.notEqual(ersterRouter, -1, "kein einziger v1-Router gefunden — liest diese Probe ins Leere?");
    assert.ok(riegelBei < ersterRouter,
      "Der Riegel steht NACH dem ersten Router. Alles davor ist fuer Arbeiter offen, "
      + "ohne dass irgendetwas kaputt aussieht.");
  });

  it("der Org-Kontext steht VOR dem Riegel — sonst erkennt er niemanden", () => {
    /*
     * `orgContextMiddleware` setzt `req.orgMembership`. Liefe der Riegel davor,
     * saehe JEDE Sitzung aus wie keine Arbeitersitzung: er liesse alles durch
     * und meldete nie etwas. Ein Riegel, der niemanden erkennt, sieht im
     * Protokoll genauso aus wie einer, den niemand ausloest.
     */
    const orgBei = APP.indexOf("app.use(orgContextMiddleware(");
    const mountBei = APP.search(/app\.use\("\/api(\/v1)?", v1\)/);
    assert.notEqual(orgBei, -1, "orgContextMiddleware nicht gefunden");
    assert.notEqual(mountBei, -1, "der v1-Mount wurde nicht gefunden");
    assert.ok(orgBei < mountBei,
      "orgContextMiddleware laeuft NACH dem v1-Mount — der Riegel bekaeme eine "
      + "Anfrage ohne Mitgliedschaft und liesse jeden Arbeiter durch");
  });
});

/* ── 6. Durch echtes Express, ueber BEIDE Adressen ───────────────────── */

describe("M2.6 · derselbe Router haengt an zwei Adressen — der Riegel muss an beiden greifen", () => {
  /*
   * Die Proben oben lesen `app.js` als TEXT. Das faengt eine verschobene Zeile,
   * aber es beweist nicht, dass Express sich so verhaelt, wie der Text nahelegt.
   * Der entscheidende Punkt haengt naemlich an einer Express-Eigenschaft: dass
   * `req.path` INNERHALB eines Routers relativ zu dessen Mount ist. Stimmte das
   * nicht, saehe der Riegel `/api/worker/me` statt `/worker/me` und sperrte das
   * ganze Portal aus — waehrend jede Textprobe weiter gruen bliebe.
   *
   * Deshalb hier ein echter Server mit derselben Montage wie in `app.js`:
   * EIN Router, ZWEI Mounts.
   */

  function serverBauen(rolle) {
    const app = express();
    /* Steht in app.js global vor beiden Mounts (orgContextMiddleware). */
    app.use((req, _res, next) => {
      if (rolle) {
        req.session = { userId: "u-1", userRole: rolle };
        req.orgMembership = { role_key: rolle, org_type: "agency" };
        req.orgId = "o-1";
      }
      next();
    });
    const v1 = express.Router();
    v1.use(arbeiterRiegel({}));
    /* Abschluss-Handler wie der 404-Fallback in app.js — bewusst `use` statt
     * einer Wildcard-Route: die Schreibweise dafuer hat sich zwischen Express 4
     * und 5 geaendert, `use` nicht. */
    v1.use((req, res) => res.status(200).json({ durch: true, pfad: req.path }));
    app.use("/api/v1", v1);
    app.use("/api", v1);
    return app;
  }

  function anfragen(server, methode, weg) {
    return new Promise((fertig, scheitern) => {
      const port = server.address().port;
      const r = http.request({ host: "127.0.0.1", port, method: methode, path: weg }, (res) => {
        let rumpf = "";
        res.on("data", (d) => { rumpf += d; });
        res.on("end", () => fertig({ status: res.statusCode, rumpf }));
      });
      r.on("error", scheitern);
      r.end();
    });
  }

  async function mitServer(rolle, fn) {
    const server = serverBauen(rolle).listen(0, "127.0.0.1");
    await new Promise((f) => server.once("listening", f));
    try { await fn((m, w) => anfragen(server, m, w)); }
    finally { await new Promise((f) => server.close(f)); }
  }

  it("der Arbeiter kommt ueber BEIDE Adressen nur ans Portal", async () => {
    await mitServer("worker", async (ruf) => {
      /* Der Weg ohne "/v1" ist der, den die Oberflaeche wirklich benutzt —
       * und der, ueber den ein Riegel am Mount vollstaendig zu umgehen waere. */
      assert.equal((await ruf("GET", "/api/worker/me")).status, 200);
      assert.equal((await ruf("GET", "/api/v1/worker/me")).status, 200);

      const kurz = await ruf("GET", "/api/invoices");
      const lang = await ruf("GET", "/api/v1/invoices");
      assert.equal(kurz.status, 403,
        "Ueber /api ohne /v1 kam ein gesperrter Weg durch — genau die Umgehung, "
        + "gegen die der Riegel am Router und nicht am Mount haengt");
      assert.equal(lang.status, 403);
      assert.match(kurz.rumpf, /WORKER_ROUTE_NOT_ALLOWED/);
    });
  });

  it("`req.path` im Router ist der Weg OHNE Mount — sonst passte keine einzige Regel", async () => {
    await mitServer(null, async (ruf) => {
      const a = JSON.parse((await ruf("GET", "/api/worker/me")).rumpf);
      const b = JSON.parse((await ruf("GET", "/api/v1/worker/me")).rumpf);
      assert.equal(a.pfad, "/worker/me",
        "Express reicht den Weg samt Mount durch — dann trifft die Wegliste nie");
      assert.equal(b.pfad, "/worker/me",
        "die beiden Adressen erzeugen unterschiedliche Wege — dann braeuchte die "
        + "Liste jede Regel zweimal");
    });
  });

  it("eine Firmensitzung geht ueber beide Adressen ueberall durch", async () => {
    await mitServer("owner", async (ruf) => {
      assert.equal((await ruf("GET", "/api/invoices")).status, 200);
      assert.equal((await ruf("GET", "/api/v1/invoices")).status, 200);
    });
  });
});

/* ── 7. Keine Ausnahme fuer eine Route, die es nicht gibt ────────────── */

describe("M2.6 · eine leergelaufene Ausnahme ist schlimmer als keine", () => {
  /*
   * DIE GEGENRICHTUNG, und sie ist die unauffaelligere.
   *
   * Der Riegel faengt eine VERGESSENE Route: sie ist zu, und das faellt beim
   * ersten Klick auf. Er faengt nicht die umgekehrte Drift — einen Eintrag, der
   * auf eine Route zeigt, die inzwischen umbenannt oder geloescht wurde. So ein
   * Eintrag tut nichts und sieht aus wie eine Regel. Er kostet nichts, bis
   * jemand ihn zum Anlass nimmt, eine gleichnamige neue Route fuer erlaubt zu
   * halten.
   *
   * Dieselbe Lehre wie bei `ohne_einplanung` in der Takt-Registratur (M1.9): ein
   * Register, das geschlossene Luecken weiter als offen fuehrt, ist genauso
   * irrefuehrend wie eines, das offene verschweigt.
   */

  /** Alle im Quelltext angelegten Routen, roh — Methode + Pfadmuster. */
  function alleRouten() {
    const gefunden = new Set();
    const verz = path.join(API, "routes");
    for (const datei of fs.readdirSync(verz).filter((n) => n.endsWith(".js"))) {
      const quelle = fs.readFileSync(path.join(verz, datei), "utf8");
      for (const m of quelle.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
        gefunden.add(m[1].toUpperCase() + " " + m[2]);
      }
    }
    return gefunden;
  }

  /* Ein Abschnitt trifft, wenn er woertlich gleich ist ODER eine der beiden
     Seiten dort einen Parameter fuehrt (`:id` gegen `abc`). */
  function trifftRoute(routenPfad, listenPfad) {
    const a = routenPfad.split("/");
    const b = listenPfad.split("/");
    if (a.length !== b.length) return false;
    return a.every((seg, i) => seg === b[i] || seg.startsWith(":") || b[i].startsWith(":"));
  }

  const ROUTEN = alleRouten();

  it("die Routensuche findet ueberhaupt etwas", () => {
    /* Ohne diese Probe waere der Abgleich unten lautlos gruen, sobald sich die
       Schreibweise der Routen aendert: eine leere Menge besteht jede Schleife. */
    assert.ok(ROUTEN.size >= 400,
      `nur ${ROUTEN.size} Routen gefunden — entweder ist das Verzeichnis leer, oder `
      + "das Muster passt nicht mehr und dieser Abgleich liest ins Leere");
  });

  it("jeder Eintrag zeigt auf eine Route, die es wirklich gibt", () => {
    const leer = [];
    for (const e of ERLAUBT) {
      if (e.pfad.endsWith("/")) continue;   // Praefixe unten getrennt
      const methoden = e.methoden === "*"
        ? ["GET", "POST", "PUT", "PATCH", "DELETE"] : e.methoden;
      const trifft = methoden.some((m) =>
        [...ROUTEN].some((r) => {
          const [rm, rp] = r.split(" ");
          return rm === m && trifftRoute(rp, e.pfad);
        }));
      if (!trifft) leer.push(`${methoden.join("/")} ${e.pfad} — ${e.grund}`);
    }
    assert.deepStrictEqual(leer, [],
      "Diese Ausnahmen zeigen auf keine existierende Route. Sie tun nichts und sehen "
      + "aus wie eine Regel — bis jemand sie zum Anlass nimmt, eine gleichnamige neue "
      + "Route fuer erlaubt zu halten:\n  " + leer.join("\n  "));
  });

  it("das Portal-Praefix deckt wirklich Routen ab", () => {
    /* Ein Praefix ist die weitreichendste Form einer Ausnahme. Deckt es nichts
       mehr ab, ist der Namensraum umgezogen — und dann ist das Portal entweder
       ausgesperrt oder laeuft ueber Wege, die niemand geprueft hat. */
    for (const e of ERLAUBT.filter((x) => x.pfad.endsWith("/"))) {
      const treffer = [...ROUTEN].filter((r) => r.split(" ")[1].startsWith(e.pfad));
      assert.ok(treffer.length >= 5,
        `Das Praefix ${e.pfad} deckt nur ${treffer.length} Routen ab — ist der `
        + "Namensraum umgezogen?");
    }
  });

  it("auch die absichtlich gesperrten Wege existieren noch", () => {
    /* Sonst warnt die Liste vor einer Gefahr, die es nicht mehr gibt — und
       verliert damit genau die Glaubwuerdigkeit, die sie tragen soll. */
    const weg = [];
    for (const g of GESPERRT_MIT_ABSICHT) {
      const trifft = g.methoden.some((m) =>
        [...ROUTEN].some((r) => {
          const [rm, rp] = r.split(" ");
          return rm === m && trifftRoute(rp, g.pfad);
        }));
      if (!trifft) weg.push(`${g.methoden.join("/")} ${g.pfad}`);
    }
    assert.deepStrictEqual(weg, [],
      "Diese Wege stehen als 'absichtlich gesperrt', existieren aber nicht mehr:\n  "
      + weg.join("\n  "));
  });
});
