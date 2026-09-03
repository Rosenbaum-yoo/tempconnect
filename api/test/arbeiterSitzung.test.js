/**
 * M2.5 — Was eine ARBEITERSITZUNG von der Plattform-API zu sehen bekommt.
 *
 * Diesen Test gab es nicht. Es gab Einheitstests fuer einzelne Guards und einen
 * Waechter, der Middleware-Namen liest — aber nichts, was eine Sitzung mit der
 * Rolle `worker` durch die echten Router schickt und nachsieht, was zurueckkommt.
 * Genau diese Luecke ist M2.5 in docs/features/M_MARKTPLATZ_FLOW.md.
 *
 * WER HIER ANFRAGT
 * Ein Arbeiter entsteht in `workerService.acceptInvite`. Dabei wird er Mitglied
 * in der Org SEINER ZEITARBEITSFIRMA — `INSERT INTO org_memberships …
 * role_key='worker'` mit der `supplier_org_id` der Einladung. Er bekommt KEINE
 * eigene Org: seine Sitzung traegt req.orgId = die Kennung der Zeitarbeitsfirma.
 * Gemessen in der Datenbank am 2026-09-02: 31 Menschen in einer Agentur-Org,
 * 3 in einer Unternehmens-Org. Den Org-Typ 'worker' gibt es nicht.
 *
 * ZWEI EBENEN, BEWUSST GETRENNT
 *   `gemessen` ist eine TATSACHE. Der Muster-Pool entscheidet an den Parametern
 *   der Abfrage, welche Zeile er zurueckgibt (siehe helpers/arbeiterSitzungMessung.js);
 *   steht das Org-Erkennungswort im Antwortrumpf, hat der Handler
 *   org-geschluesselte Daten herausgegeben. Dagegen ist kein Einspruch moeglich.
 *
 *   `art` ist ein URTEIL. Es darf der Messung widersprechen — aber nur mit
 *   geschriebener Begruendung. Beispiel: `GET /me` gibt org-geschluesselte Daten
 *   heraus (seine Mitgliedschaft nennt den Namen des Arbeitgebers), und das ist
 *   trotzdem in Ordnung: er arbeitet dort.
 *
 * WARUM DIESE TRENNUNG NOETIG WURDE
 * Die erste Fassung stufte von Hand ein — nach Pfadnamen und Gefuehl — und lag
 * bei mindestens vier Routen daneben: /credits/balance, /credits/transactions,
 * /payment/history und /support-requests lesen mit `WHERE user_id = $1` bzw.
 * `WHERE sc.reporter_user_id = $1`. Das sind SEINE Daten. Ein Register, das
 * falschen Alarm schlaegt, verliert seinen Wert genauso wie eines, das schweigt —
 * und es haette die Owner-Entscheidung M2.6 in die falsche Richtung gefaerbt.
 *
 * Lauf: node --test --test-force-exit test/arbeiterSitzung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";
import { messe, baueDeps, API, WORT_ORG, WORT_ICH, WORT_FREI, UID, OID }
  from "./helpers/arbeiterSitzungMessung.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const REGISTER = JSON.parse(
  fs.readFileSync(path.join(HIER, "fixtures", "arbeiterSitzung.json"), "utf8")
);

/* Untergrenzen. Ein Waechter, der nichts mehr prueft, sieht sonst gruen aus —
   das ist der haeufigste Weg zu einer Zusicherung, die nie zuschlagen kann. */
const MINDESTENS_ROUTER = 70;
const MINDESTENS_ROUTEN = 250;

const { ungebaut, fabriken, ziele, gemessen, code } = await messe();
const erlaubt = new Map(REGISTER.erlaubt.map((e) => [e.route, e]));

describe("M2.5 · Eine Arbeitersitzung gegen die Plattform-API", () => {

  it("baut JEDEN Router — ein uebersprungener Router ist eine unbemerkte Luecke", () => {
    assert.deepStrictEqual(ungebaut, [],
      "Diese Router liessen sich nicht bauen und wurden deshalb NICHT geprueft. "
      + "Das ist keine Nebensaechlichkeit: ihre Routen fehlen still in der Messung. "
      + "Fehlende Abhaengigkeit in baueDeps() ergaenzen.\n  " + ungebaut.join("\n  "));
  });

  it("prueft genug, um etwas zu beweisen", () => {
    assert.ok(fabriken.length >= MINDESTENS_ROUTER,
      `nur ${fabriken.length} Router in app.js gefunden — das Muster `
      + "v1.use(createXRouter(deps)) trifft nicht mehr, die Messung liefe ins Leere.");
    assert.ok(ziele.length >= MINDESTENS_ROUTEN,
      `nur ${ziele.length} aufrufbare GET-Routen gefunden (erwartet mindestens `
      + `${MINDESTENS_ROUTEN}) — ein Waechter, der nichts prueft, sieht gruen aus.`);
  });

  it("BEIDE Erkennungswoerter erreichen die Antwort", () => {
    /* Ohne diese Probe waere ein kaputter Muster-Pool ununterscheidbar von einer
       makellosen Plattform: NICHTS gefunden saehe aus wie NICHTS zu finden.
       Beide Woerter, weil die UNTERSCHEIDUNG der ganze Punkt ist — findet nur
       eines den Weg, ist die Einstufung wieder blind. */
    const org = [...gemessen.values()].filter((x) => x === "org").length;
    const eigen = [...gemessen.values()].filter((x) => x === "eigen").length;
    assert.ok(org > 0,
      "keine einzige Route hat das ORG-Erkennungswort durchgereicht. Entweder ist "
      + "der Muster-Pool kaputt oder die Antwort wird nicht mehr als Text gelesen.");
    assert.ok(eigen > 0,
      "keine einzige Route hat das EIGEN-Erkennungswort durchgereicht — dann "
      + "unterscheidet der Pool nicht mehr nach Parametern, und jede Route saehe "
      + "wieder wie ein Befund aus.");
  });

  it("jede erreichbare Route mit Mandantenbezug steht im Register", () => {
    const unbekannt = [...gemessen.keys()].filter((r) => !erlaubt.has(r));
    assert.deepStrictEqual(unbekannt, [],
      "Diese Routen antworten einer Arbeitersitzung mit Daten und stehen in keinem "
      + "Register.\n\n"
      + "Neu gebaute Route? Dann ist das hier die Frage, die vor dem Ausliefern zu "
      + "beantworten ist: darf ein Arbeiter das sehen?\n"
      + "  - Es sind SEINE Daten   -> art 'eigenes'\n"
      + "  - Es gehoert der Firma  -> Guard einbauen; nur wenn er ausbleibt, art 'befund'\n"
      + "Eintragen ohne Urteil macht aus einer Luecke eine genehmigte Luecke.\n  "
      + unbekannt.join("\n  "));
  });

  it("das Feld `gemessen` ist eine Tatsache — es muss stimmen", () => {
    const falsch = [];
    for (const [route, art] of gemessen) {
      const e = erlaubt.get(route);
      if (!e) continue;                       // deckt die Probe darueber ab
      if (e.gemessen !== art) {
        falsch.push(`${route}: Register sagt '${e.gemessen}', gemessen '${art}'`);
      }
    }
    /*
     * Und die andere Richtung, die zuerst gefehlt hat: ein Eintrag, dessen Route
     * GAR NICHTS Mandantengebundenes mehr herausgibt.
     *
     * Gefunden am eigenen Werk. `GET /me` lieferte die Standortliste der Traegerorg
     * (ueber getAllowedLocationsForMembership); nachdem die fuer Arbeiter leer
     * bleibt, gibt die Route nichts Org-Gebundenes mehr heraus — und der Eintrag
     * behauptete weiter `gemessen: "org"`. Die Schleife oben laeuft nur ueber
     * GEMESSENE Routen und schaut an so einem Eintrag vorbei. Ein Register, das
     * geschlossene Luecken weiter als offen fuehrt, ist genauso irrefuehrend wie
     * eines, das offene verschweigt.
     */
    for (const e of REGISTER.erlaubt) {
      if (!gemessen.has(e.route) && ziele.some((z) => z.route === e.route)) {
        falsch.push(`${e.route}: Register sagt '${e.gemessen}', gemessen: NICHTS — `
          + "die Route gibt keine mandantengebundenen Daten mehr heraus. Eintrag entfernen.");
      }
    }
    assert.deepStrictEqual(falsch, [],
      "Gemessen wird am PRAEDIKAT der Abfrage: steht die Org-Kennung in den "
      + "Parametern, gehoert die Zeile der Traegerorg; steht nur die Nutzer-Kennung "
      + "darin, dem Menschen. Das Register wird angepasst, nicht die Messung.\n  "
      + falsch.join("\n  "));
  });

  it("wer der Messung widerspricht, begruendet es", () => {
    /*
     * Der einzige erlaubte Weg, eine org-geschluesselte Route als unbedenklich
     * zu fuehren. Ohne Begruendung waere `art` wieder eine Meinung, die sich
     * still von der Messung entfernt — genau der Fehler, den diese Fassung
     * behebt.
     */
    const ohne = [];
    for (const e of REGISTER.erlaubt) {
      if (e.gemessen === "org" && e.art === "eigenes") {
        const g = e.warum_unbedenklich;
        if (typeof g !== "string" || g.length < 60) {
          ohne.push(`${e.route}: fuehrt org-geschluesselte Daten als 'eigenes', ohne `
            + "tragfaehige Begruendung (Feld warum_unbedenklich, mind. 60 Zeichen)");
        }
      }
      if (e.gemessen === "eigen" && e.art === "befund") {
        ohne.push(`${e.route}: als 'befund' gefuehrt, obwohl KEINE org-geschluesselten `
          + "Daten herausgehen — ein Befund, den es nicht gibt, entwertet die Liste");
      }
      if (e.art === "befund" && (typeof e.was !== "string" || e.was.length < 20)) {
        ohne.push(`${e.route}: ein Befund ohne Beschreibung ist keiner. Benennen, WAS herausgeht.`);
      }
    }
    assert.deepStrictEqual(ohne, [], ohne.join("\n  "));
  });

  it("die geschlossenen Wege bleiben geschlossen", () => {
    const wiederOffen = [];
    for (const g of REGISTER.geschlossen) {
      const pfad = g.route.slice(4);
      const c = code.get(pfad);
      if (c === undefined) {
        wiederOffen.push(`${g.route}: gibt es nicht mehr — Eintrag entfernen oder Route pruefen`);
      } else if (c < 400) {
        wiederOffen.push(`${g.route}: antwortet ${c} statt 4xx`);
      }
    }
    assert.deepStrictEqual(wiederOffen, [],
      "Hier wurde ein Guard wieder entfernt. Eine geschlossene Luecke, die niemand "
      + "bewacht, geht wieder auf.\n  " + wiederOffen.join("\n  "));
  });

  it("jeder geschlossene Weg traegt eine Begruendung", () => {
    for (const g of REGISTER.geschlossen) {
      assert.ok(typeof g.grund === "string" && g.grund.length >= 60,
        `${g.route}: nennt keinen tragfaehigen Grund. Warum die Route zu ist, `
        + "gehoert aufgeschrieben — sonst baut sie der naechste wieder auf.");
    }
  });

  it("erledigte Befunde bleiben nicht als Behauptung stehen", () => {
    const erledigt = REGISTER.erlaubt
      .filter((e) => e.art === "befund" && gemessen.get(e.route) !== "org")
      .map((e) => e.route);
    assert.deepStrictEqual(erledigt, [],
      "Diese Befunde treffen nicht mehr zu — die Route gibt nichts Org-Gebundenes "
      + "mehr heraus. Eintrag nach 'geschlossen' verschieben (mit Grund) oder auf "
      + "'eigenes' setzen.\n  " + erledigt.join("\n  "));
  });

  it("das Register beschreibt die Wirklichkeit, nicht die Vergangenheit", () => {
    const verwaist = REGISTER.erlaubt.filter((e) => !ziele.some((z) => z.route === e.route));
    assert.deepStrictEqual(verwaist.map((v) => v.route), [],
      "Diese Eintraege zeigen auf Routen, die es nicht mehr gibt. Ein Register, das "
      + "die Wirklichkeit nicht mehr trifft, erlaubt irgendwann etwas, das niemand "
      + "geprueft hat.\n  " + verwaist.map((v) => v.route).join("\n  "));
  });

  it("Selbstprobe: die Erkennung unterscheidet Firma, Mensch und keins von beidem", async () => {
    /* Drei Faelle, weil die UNTERSCHEIDUNG der Punkt ist: eine Erkennung, die
       alles als Befund meldet, ist genauso wertlos wie eine, die nichts meldet. */
    const deps = baueDeps();
    const prueflauf = express();
    const r = express.Router();
    const hol = async (sql, params) => (await deps.pool.query(sql, params)).rows;
    r.get("/frisch/firma", async (_q, res) =>
      res.json(await hol("SELECT * FROM listings WHERE org_id = $1", [OID])));
    r.get("/frisch/ich", async (_q, res) =>
      res.json(await hol("SELECT * FROM listings WHERE user_id = $1", [UID])));
    r.get("/frisch/katalog", async (_q, res) =>
      res.json(await hol("SELECT * FROM skills", [])));
    r.get("/frisch/dicht", (_q, res) => res.json({ ok: true }));
    prueflauf.use("/api/v1", r);

    const hole = (p) => request(prueflauf).get("/api/v1/frisch/" + p);
    const firma = await hole("firma");
    const ich = await hole("ich");
    const katalog = await hole("katalog");
    const dicht = await hole("dicht");

    assert.ok(firma.text.includes(WORT_ORG) && !firma.text.includes(WORT_ICH),
      "eine org-gebundene Abfrage wird nicht als Firmendatum erkannt");
    assert.ok(ich.text.includes(WORT_ICH) && !ich.text.includes(WORT_ORG),
      "eine nutzergebundene Abfrage wird als Firmendatum gemeldet — genau der "
      + "Fehler, den diese Fassung beheben soll");
    assert.ok(katalog.text.includes(WORT_FREI)
      && !katalog.text.includes(WORT_ORG) && !katalog.text.includes(WORT_ICH),
      "eine Abfrage ohne Mandantenbezug wird einer Seite zugeschlagen");
    for (const w of [WORT_ORG, WORT_ICH, WORT_FREI]) {
      assert.ok(!dicht.text.includes(w),
        "die dichte Probe-Route wurde faelschlich als undicht erkannt");
    }
    assert.ok(!erlaubt.has("GET /frisch/firma"),
      "eine unbekannte undichte Route darf nicht im Register stehen");
    assert.ok(fs.existsSync(path.join(API, "app.js")), "API-Wurzel nicht aufloesbar");
  });
});
