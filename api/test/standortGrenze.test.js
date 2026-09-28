/**
 * ═══════════════════════════════════════════════════════════════════════════
 * U0.2 / U2.4 — DIE STANDORTGRENZE, ENTDECKEND GEPRUEFT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM DIESE PROBE EXISTIERT
 *
 * Der Plan U vermutete einen Sicherheitsbefund: `assertLocationBelongsToOrg`
 * stand in nur vier Routendateien, waehrend viele Routen `location_id`
 * annehmen. Die Vermutung war in der Zahl falsch und in der Sache richtig.
 *
 * FALSCH IN DER ZAHL: die Pruefung liegt eine Schicht tiefer. Elf Routendateien
 * nehmen einen Standort an, sechs DIENSTE tragen die Pruefung — wer die
 * Aufrufer in `routes/` zaehlt, zaehlt die falsche Schicht.
 *
 * RICHTIG IN DER SACHE: gemessen am 2026-09-20 ueber alle 967 Wege (Verhalten,
 * nicht Quelltextsuche) erreichte ein FREMDER Standort von drei Wegen aus die
 * Datenbank, ohne dass ihn jemand geprueft haette:
 *
 *   PUT  /organizations/:id/departments/:deptId   UPDATE org_departments SET location_id
 *   POST /organizations/:id/members               INSERT INTO org_memberships
 *   PATCH /org/members/:membershipId/scope        UPDATE org_memberships (Route prueft,
 *                                                 der Dienst nicht — zweite Tuer)
 *
 * Und der Fremdschluessel faengt das nicht: er zeigt auf `org_locations(id)`,
 * nicht auf `(id, org_id)` (Migration 019/112), und prueft damit nur, dass es
 * die Zeile IRGENDWO gibt.
 *
 * WARUM DAS EIN SICHERHEITSBEFUND IST UND KEINE UNSAUBERKEIT
 *
 * `middleware/orgContext.js` loest `req.locationId` ueber
 * `resolveLocation(pool, req.orgId, ...)` auf — ein fremder Standort liefert
 * dort nichts. Wenige Zeilen spaeter steht: "if no location resolved, user sees
 * org-wide". Eine Mitgliedschaft, die formal an einen Standort GEBUNDEN ist,
 * wirkt damit ORG-WEIT. Fuer eine Standortleitung ist das die Umkehrung ihrer
 * Absicht, und sie passiert lautlos: es entsteht nirgends ein Fehler.
 * Teil C stellt genau das nach.
 *
 * WAS DIE PROBE NICHT KANN, und das steht hier, damit niemand mehr hineinliest
 * als drinsteht: von 967 Wegen loesen 298 keine einzige Abfrage aus — sie
 * weisen vorher ab (Schema, Vorbedingung). Ueber die sagt der Durchlauf nichts.
 * Deshalb Teil B: die Dienste, die diese Wege benutzen, werden EINZELN und
 * direkt geprueft.
 *
 * Lauf: node --test --test-force-exit test/standortGrenze.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { baseDeps, mockReq, mockRes, USER_A, ORG_A } from "./helpers/security-mocks.js";
import { spionPool, istSchreibend } from "./helpers/orgGrenzenSpion.js";
import { OrgBoundaryError } from "../utils/orgBoundary.js";
import * as rbacService from "../services/rbacService.js";
import * as organizationService from "../services/organizationService.js";
import * as requisitionService from "../services/requisitionService.js";
import * as rateCardService from "../services/rateCardService.js";
import * as vendorPoolService from "../services/vendorPoolService.js";
import { orgContextMiddleware } from "../middleware/orgContext.js";

/* Pfade relativ zur Testdatei — sonst haengt das Ergebnis am Startverzeichnis. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

const FREMD_LOC = "99999999-9999-4999-a999-999999999999";
const FREMD_DEPT = "88888888-8888-4888-a888-888888888888";
const ORG_UUID  = "77777777-7777-4777-a777-777777777777";

/* ═══════════════════════════════════════════════════════════════════════════
   A) DER ENTDECKENDE DURCHLAUF — jede Route, beide Richtungen
   ═══════════════════════════════════════════════════════════════════════════ */

const durch = (_q, _s, n) => n();
function deps(pool) {
  return {
    ...baseDeps(pool),
    requireFeature: () => durch,
    getUserAndPlan: async () => ({ plan: "PRO", id: USER_A, role: "company" }),
    sendMail: async () => {},
    requestLimiter: durch, authLimiter: durch, cronRateLimit: durch,
    occRateLimit: durch, supportRateLimit: durch, config: {}
  };
}

function alleRouteDateien(verzeichnis, praefix = "") {
  const raus = [];
  for (const e of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    const rel = praefix ? `${praefix}/${e.name}` : e.name;
    if (e.isDirectory()) raus.push(...alleRouteDateien(path.join(verzeichnis, e.name), rel));
    else if (e.name.endsWith(".js")) raus.push(rel);
  }
  return raus;
}

function enthaelt(params, wert) {
  return (params || []).some((p) => p === wert
    || (Array.isArray(p) && p.includes(wert))
    || (p && typeof p === "object" && JSON.stringify(p).includes(wert)));
}

/**
 * Ein KARGER Koerper ist der leere Gruen-Macher: fast jede schreibende Route
 * prueft zuerst ihr Schema und weist ab, bevor sie den Standort anfasst. Dann
 * bestaetigt die Messung nur, dass Pflichtfelder fehlen. Deshalb grosszuegig.
 */
const KOERPER = {
  location_id: FREMD_LOC, department_id: FREMD_DEPT,
  user_id: "22222222-2222-4222-a222-222222222222",
  supplier_org_id: "33333333-3333-4333-a333-333333333333",
  org_id: ORG_A, role_key: "member", role: "member",
  name: "Probe", title: "Probe", email: "probe@example.de",
  reason: "Begruendung fuer die Messung, lang genug fuer Mindestlaengen",
  category: "Lager", tier: "PREFERRED", status: "active",
  quantity: 1, headcount: 1, amount: 10, currency: "EUR",
  start_date: "2026-10-01", end_date: "2026-10-31",
  confirmed: true, is_active: true
};

async function durchlauf() {
  const befunde = [];
  const angefasst = [];
  const nieErreicht = [];
  let geprueft = 0, mitAbfrage = 0;

  for (const datei of alleRouteDateien(path.join(API, "routes")).sort()) {
    let fabriken;
    try {
      const mod = await import(`../routes/${datei}`);
      fabriken = Object.keys(mod).filter((k) => /^create\w*Router$/.test(k)).map((n) => mod[n]);
    } catch { continue; }
    if (!fabriken.length) continue;

    for (const fabrik of fabriken) {
      let vorlage;
      try { vorlage = fabrik(deps(spionPool({ zeile: null }))); } catch { continue; }

      for (const layer of vorlage.stack) {
        if (!layer.route) continue;
        const methode = Object.keys(layer.route.methods)[0];
        const pfad = layer.route.path;

        /* Eigener Router je Weg, damit der Spion nur DIESEN Weg mitschreibt. */
        const pool = spionPool({ zeile: null });
        let eigener;
        try { eigener = fabrik(deps(pool)); } catch { continue; }
        const treffer = eigener.stack.find(
          (l) => l.route && l.route.path === pfad && Object.keys(l.route.methods)[0] === methode);
        const handler = treffer?.route.stack[treffer.route.stack.length - 1]?.handle;
        if (typeof handler !== "function") continue;

        const req = mockReq({
          body: { ...KOERPER },
          query: { ...KOERPER },
          /* Die EIGENE Org in den Pfad: mehrere Routen ziehen die Org aus
             `req.params.id` (gebunden von `sameOrgParam`), nicht aus
             `req.orgId`. Eine fremde Kennung dort liesse die Pruefabfrage wie
             eine ungebundene aussehen — die Messung wuerde drei Routen
             anklagen, die richtig pruefen. Fremd ist hier der STANDORT. */
          params: { id: ORG_A, orgId: ORG_A, deptId: "44444444-4444-4444-a444-444444444444",
                    membershipId: "55555555-5555-4555-a555-555555555555", locationId: FREMD_LOC },
          headers: { "x-location-id": FREMD_LOC }
        });
        geprueft++;
        try {
          await Promise.race([
            handler(req, mockRes(), () => {}),
            new Promise((ok) => setTimeout(ok, 400))
          ]);
        } catch { /* ein Wurf IST die Ablehnung, kein Befund */ }

        if (!pool.calls.length) { nieErreicht.push(`${datei} ${methode} ${pfad}`); continue; }
        mitAbfrage++;
        const mitStandort = pool.calls.filter((c) => enthaelt(c.params, FREMD_LOC));
        if (!mitStandort.length) continue;
        angefasst.push(`${datei} ${methode} ${pfad}`);

        /* Geurteilt wird ueber die ERSTE Abfrage, die den fremden Standort
           traegt: schreibend heisst ungeprueft geschrieben; lesend ohne die
           eigene Org heisst, dass nichts ihn eingrenzt. Lesend MIT der Org ist
           die Pruefung selbst (oder ein org-gebundener Filter, der aus
           demselben Grund nicht lecken kann). */
        const erste = mitStandort[0];
        if (istSchreibend(erste.sql) || !enthaelt(erste.params, ORG_A)) {
          befunde.push(`[${istSchreibend(erste.sql) ? "SCHREIBT ungeprueft" : "LIEST ohne Org"}] `
            + `${datei} ${methode} ${pfad} :: ${erste.sql.replace(/\s+/g, " ").slice(0, 120)}`);
        }
      }
    }
  }
  return { befunde, angefasst, nieErreicht, geprueft, mitAbfrage };
}

describe("U2.4 · der entdeckende Waechter ueber alle Wege", () => {
  let mess;
  before(async () => { mess = await durchlauf(); });

  it("der Durchlauf sieht ueberhaupt hin", () => {
    /* Ohne diese Probe waere der ganze Waechter lautlos gruen, sobald das
       Montieren scheitert: eine leere Menge besteht jede Schleife. */
    assert.ok(mess.geprueft >= 900, `nur ${mess.geprueft} Wege montiert — erwartet ueber 900`);
    assert.ok(mess.mitAbfrage >= 600, `nur ${mess.mitAbfrage} Wege erreichten die Datenbank`);
    assert.ok(mess.angefasst.length >= 20,
      `nur ${mess.angefasst.length} Wege fassen einen Standort an — erwartet ueber 20. `
      + "Faellt diese Zahl, prueft der Waechter weniger, als er behauptet.");
  });

  it("kein Weg schreibt oder liest einen FREMDEN Standort ungeprueft", () => {
    assert.deepStrictEqual(mess.befunde, [],
      "Ein fremder Standort erreicht die Datenbank, ohne gegen die eigene Org geprueft "
      + "zu werden. Der Fremdschluessel faengt ihn NICHT (er zeigt auf org_locations(id), "
      + "nicht auf (id, org_id)), und eine nicht aufloesbare Bindung macht aus "
      + "'standortgebunden' still 'org-weit'.");
  });

  it("die Wege, die der Durchlauf NICHT erreicht, sind benannt — nicht verschwiegen", () => {
    /* Sie weisen vor der ersten Abfrage ab (Schema, Vorbedingung). Darueber
       sagt der Durchlauf nichts, und das darf nicht wie ein Freispruch
       aussehen. Die Dienste dahinter prueft Teil B einzeln. */
    assert.ok(mess.nieErreicht.length > 0 && mess.nieErreicht.length < mess.geprueft / 2,
      `nicht erreichte Wege: ${mess.nieErreicht.length} von ${mess.geprueft} — `
      + "bei ueber der Haelfte misst der Durchlauf zu wenig, um etwas zu belegen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   B) DIE SCHREIBWEGE, DIREKT AM DIENST — fail-closed, mit Gegenprobe
   ═══════════════════════════════════════════════════════════════════════════

   Die Grenze gehoert in den DIENST, nicht in die Route: `addMember` haengt an
   `POST /organizations/:id/members` UND an der Einladungsstrecke, `addToPool`
   an der Lieferanten-Einladung UND am bevorzugten Lieferanten. Zwei Tueren,
   eine Grenze. Deshalb hier je Dienst, nicht je Route.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Pool, dessen Eigentums-Abfrage NICHTS findet — der fremde Standort. */
function poolOhneStandort() {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      if (/FROM\s+org_locations/i.test(sql) || /FROM\s+org_departments/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [{ id: "neu" }] };
    }
  };
}

/** Gegenprobe: derselbe Weg mit einem EIGENEN Standort darf nicht werfen. */
function poolMitStandort() {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      return { rows: [{ id: "vorhanden", ok: 1 }] };
    }
  };
}

const SCHREIBWEGE = [
  {
    name: "rbacService.addMember",
    lauf: (pool) => rbacService.addMember(pool, ORG_A, USER_A, "member",
      { location_id: FREMD_LOC, department_id: null })
  },
  {
    name: "rbacService.updateMemberScope",
    lauf: (pool) => rbacService.updateMemberScope(pool, ORG_A, "55555555-5555-4555-a555-555555555555",
      { location_id: FREMD_LOC, department_id: null })
  },
  {
    name: "organizationService.updateDepartment",
    lauf: (pool) => organizationService.updateDepartment(pool, "44444444-4444-4444-a444-444444444444",
      ORG_A, { name: "Lager", location_id: FREMD_LOC })
  },
  {
    name: "organizationService.createDepartment",
    lauf: (pool) => organizationService.createDepartment(pool, ORG_A,
      { name: "Lager", location_id: FREMD_LOC })
  },
  {
    name: "requisitionService.createRequisition",
    lauf: (pool) => requisitionService.createRequisition(pool, USER_A,
      { org_id: ORG_A, location_id: FREMD_LOC, department_id: null, title: "Probe", headcount: 1 })
  },
  {
    /* U0.2b (2026-09-28, auf Bitte der gegenpruefenden Sitzung nachgemessen):
       `createRequisition` stand in dieser Liste, `updateRequisition` nicht - und
       die `allowed`-Liste des Dienstes enthaelt `location_id` und
       `department_id`. Genau das Paar, dessen Lehre im Nachbarcode steht:
       "Eine Grenze, die beim Anlegen gilt und beim Aendern nicht, ist keine." */
    name: "requisitionService.updateRequisition",
    lauf: (pool) => requisitionService.updateRequisition(pool,
      "66666666-6666-4666-a666-666666666666", USER_A,
      { location_id: FREMD_LOC }, ORG_A)
  },
  {
    /* U0.2b: dieselbe Klasse in `rateCardService`. Die Route prueft, dass die
       KARTE der Org gehoert; der Dienst schreibt danach `location_id` und
       `department_id` aus dem Rumpf, ohne sie zu pruefen. */
    name: "rateCardService.updateRateCard",
    lauf: (pool) => rateCardService.updateRateCard(pool,
      "77777777-7777-4777-a777-777777777777",
      { location_id: FREMD_LOC }, USER_A, ORG_A)
  },
  {
    /* U0.2b: DIE ABTEILUNG WAR NIE ABGESICHERT. Alle Wege oben setzen
       `location_id`; eine Rueckmutation, die nur
       `assertDepartmentBelongsToOrg` entfernte, blieb deshalb gruen. Der
       Riegel stand da und niemand hat ihn je ausgeloest - eine Zusicherung,
       die ihren Gegenstand nicht herstellt, ist keine. */
    name: "requisitionService.updateRequisition (Abteilung)",
    lauf: (pool) => requisitionService.updateRequisition(pool,
      "66666666-6666-4666-a666-666666666666", USER_A,
      { department_id: FREMD_LOC }, ORG_A)
  },
  {
    name: "rateCardService.updateRateCard (Abteilung)",
    lauf: (pool) => rateCardService.updateRateCard(pool,
      "77777777-7777-4777-a777-777777777777",
      { department_id: FREMD_LOC }, USER_A, ORG_A)
  },
  {
    name: "organizationService.createDepartment (Standort der Abteilung)",
    lauf: (pool) => organizationService.createDepartment(pool, ORG_A,
      { name: "Lager", location_id: FREMD_LOC })
  },
  {
    name: "vendorPoolService.addToPool",
    lauf: (pool) => vendorPoolService.addToPool(pool, {
      client_org_id: ORG_A, supplier_org_id: "33333333-3333-4333-a333-333333333333",
      tier: "PREFERRED", assigned_by: USER_A, location_id: FREMD_LOC, reason: "Probe"
    })
  }
];

describe("U0.2 · jeder Schreibweg weist einen fremden Standort ab", () => {
  for (const weg of SCHREIBWEGE) {
    it(`${weg.name} — fremder Standort wird abgewiesen`, async () => {
      const pool = poolOhneStandort();
      await assert.rejects(
        () => weg.lauf(pool),
        (err) => err instanceof OrgBoundaryError,
        `${weg.name} schreibt einen fremden Standort in die Datenbank. Der Fremdschluessel `
        + "faengt ihn nicht, und eine nicht aufloesbare Bindung wirkt org-weit statt gebunden."
      );
      /* Und zwar VOR dem Schreiben: eine Ablehnung nach dem INSERT waere keine. */
      const geschrieben = pool.calls.filter((c) => istSchreibend(c.sql));
      assert.deepStrictEqual(geschrieben.map((c) => String(c.sql).replace(/\s+/g, " ").slice(0, 60)), [],
        `${weg.name} hat vor der Ablehnung bereits geschrieben`);
    });
  }

  it("updateRateCard ohne Organisation weist ab, statt die Pruefung zu ueberspringen", async () => {
    /*
     * U0.2b: `orgId` ist bei `updateRateCard` ein NACHTRAEGLICHER Parameter, und
     * genau das ist die Gefahr - ein Aufrufer, der ihn weglaesst, kaeme sonst
     * lautlos an der Pruefung vorbei. Deshalb wirft die Funktion, sobald
     * wirklich ein Standort oder eine Abteilung gesetzt wird und die Org fehlt.
     *
     * Die Gegenprobe steht gleich daneben: wer nur Preise aendert, braucht keine
     * Org und darf nicht behindert werden. Ein fail-closed, das auch dort
     * zuschlaegt, wo nichts zu schuetzen ist, wird wieder ausgebaut.
     */
    await assert.rejects(
      () => rateCardService.updateRateCard(poolMitStandort(),
        "77777777-7777-4777-a777-777777777777", { location_id: FREMD_LOC }, USER_A),
      (err) => err instanceof OrgBoundaryError,
      "ohne orgId wird die Standortpruefung stillschweigend uebersprungen");

    await assert.rejects(
      () => rateCardService.updateRateCard(poolMitStandort(),
        "77777777-7777-4777-a777-777777777777", { department_id: FREMD_LOC }, USER_A),
      (err) => err instanceof OrgBoundaryError,
      "ohne orgId wird die Abteilungspruefung stillschweigend uebersprungen");

    /* Ohne Standort und ohne Abteilung: kein Grund zu werfen. */
    const pool = poolMitStandort();
    await rateCardService.updateRateCard(pool,
      "77777777-7777-4777-a777-777777777777", { notes: "nur ein Hinweis" }, USER_A);
    assert.ok(pool.calls.length > 0, "der reine Preis-Weg wurde blockiert");
  });

  it("GEGENPROBE: mit einem EIGENEN Standort wirft keiner der Wege", async () => {
    /* Ohne sie bestuende die Reihe oben auch dann, wenn ein Dienst
       grundsaetzlich wirft — und ein Dienst, der immer wirft, ist kaputt,
       nicht sicher. */
    for (const weg of SCHREIBWEGE) {
      const pool = poolMitStandort();
      await weg.lauf(pool);   // wirft er hier, faellt die Probe mit seinem Fehler
      assert.ok(pool.calls.length > 0, `${weg.name} hat gar nichts getan`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   C) WARUM ES ZAEHLT — gebunden wird still org-weit
   ═══════════════════════════════════════════════════════════════════════════ */

describe("U0.2b · die Route reicht die Organisation auch wirklich durch", () => {
  /*
   * WARUM DAS EINE EIGENE PROBE BRAUCHT: Teil B prueft die DIENSTE, und das ist
   * richtig - die Grenze gehoert dorthin. Aber ein Dienst, dem niemand die
   * Organisation gibt, ist so sicher wie keiner. Genau das hat der
   * Rueckmutationslauf am 2026-09-28 gezeigt: die Mutation "Route reicht die Org
   * nicht mehr durch" blieb GRUEN, obwohl sie den Riegel vollstaendig
   * ausgehebelt haette (ohne orgId wirft der Dienst zwar - aber dann ist der
   * Weg kaputt statt sicher, und das faellt erst im Betrieb auf).
   *
   * `updateRateCard` hat `orgId` als NACHTRAEGLICHEN Parameter am Ende. Solche
   * Parameter verschwinden beim naechsten Umbau am leisesten.
   */
  const ROUTE = path.resolve(HIER, "..", "routes", "rateCards.js");

  it("die Datei ist da und wird gelesen", () => {
    assert.ok(fs.existsSync(ROUTE), `routes/rateCards.js fehlt: ${ROUTE}`);
  });

  it("PATCH /rate-cards/:id uebergibt req.orgId an updateRateCard", () => {
    const quelle = fs.readFileSync(ROUTE, "utf8");
    const aufruf = /rateCardService\.updateRateCard\(([^;]*?)\);/s.exec(quelle);
    assert.ok(aufruf, "der Aufruf von updateRateCard wurde nicht gefunden — ist er umgezogen?");
    assert.match(aufruf[1], /req\.orgId/,
      "die Route ruft updateRateCard OHNE req.orgId auf — der Dienst kann den "
      + "Standort dann nicht pruefen und wirft stattdessen. Der Weg ist damit "
      + "kaputt, nicht sicher.");
  });
});

describe("U0.2 · eine Bindung, die sich nicht aufloesen laesst, wirkt org-weit", () => {
  it("Mitgliedschaft mit fremdem Standort -> kein locationId, Sichtbereich 'org'", async () => {
    /*
     * Das ist der Grund, warum der Schreibweg gepruefte Werte braucht: die
     * LESENDE Seite laesst einen fremden Standort korrekt fallen — und faellt
     * dabei auf ORG-WEIT zurueck statt auf "nichts". Wer also einen fremden
     * Standort in eine Mitgliedschaft schreibt, hebt ihre Standortbindung auf.
     */
    const pool = {
      async query(sql) {
        if (/FROM\s+org_locations/i.test(sql)) return { rows: [] };          // fremd -> nicht auffindbar
        if (/org_memberships/i.test(sql)) {
          return { rows: [{ id: "mem-1", org_id: ORG_UUID, user_id: USER_A, role_key: "location_manager",
                            org_name: "Firma A", location_id: FREMD_LOC, is_active: true }] };
        }
        return { rows: [] };
      }
    };
    /* Die Kontext-Middleware weist eine Org-Kennung ab, die keine UUID ist
       (Regel 1, 400 INVALID_ORG_ID) — die Kennungen aus den Vorrichtungen
       ("org-alpha-001") kaemen hier also gar nicht erst durch. Deshalb eine
       echte UUID; der zu pruefende fremde Wert ist ohnehin der Standort. */
    const req = {
      session: { userId: USER_A },
      headers: { "x-org-id": ORG_UUID },
      query: {}, body: {}, params: {}
    };
    let weiter = false;
    await orgContextMiddleware(pool)(req, mockRes(), () => { weiter = true; });

    assert.ok(weiter, "die Kontext-Middleware hat gar nicht durchgelassen");
    assert.equal(req.locationId, undefined,
      "ein fremder Standort wird als Kontext uebernommen — das waere das groessere Leck");
    assert.equal(req.locationScope, "org",
      "der Rueckfall ist nicht mehr org-weit. Wenn sich das aendert, aendert sich die "
      + "Begruendung dieser ganzen Welle — dann bitte den Text oben mitziehen.");
  });
});
