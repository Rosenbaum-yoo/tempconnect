/**
 * Verdeckte Routen — eine Route, die es gibt und die niemand erreicht.
 *
 * Express nimmt die ERSTE Schicht, deren Muster passt. Steht `/x/:id` vor
 * `/x/liste`, dann faengt die Detailroute jeden Aufruf von `/x/liste` mit
 * id="liste" ab. Die Liste ist damit unerreichbar — nicht "manchmal falsch",
 * sondern nie erreicht.
 *
 * WARUM DAS EIN WAECHTER SEIN MUSS UND KEINE KONVENTION
 * In `routes/invoices.js` stand die Regel bereits als Kommentar im Quelltext
 * ("Bewusst VOR `/invoices/:id` registriert"). Sie war also bekannt. Trotzdem
 * lagen am 2026-09-02 drei Routen im Schatten:
 *
 *   GET /invoices/operational        verdeckt durch /invoices/:id
 *   GET /timesheets/status-meta      verdeckt durch /timesheets/:id
 *   GET /timesheets/worker-summary   verdeckt durch /timesheets/:id
 *
 * `/invoices/operational` wurde von ZWEI Seiten aufgerufen
 * (companyTimesheets.js, workerSubmissionsReview.js) und antwortete jedes Mal
 * mit 500: der Handler von `/invoices/:id` reichte den Text "operational" als
 * Kennung an Postgres weiter, und `WHERE i.id = 'operational'` wirft
 * "invalid input syntax for type uuid" — gegen die echte Datenbank nachgestellt.
 *
 * Die beiden Stundenzettel-Routen hatten sogar Tests
 * (`timesheets.scope.test.js`) — gruen, weil diese den Handler direkt am Pfad
 * greifen, statt eine Anfrage leiten zu lassen. Ein Test, der die Zuordnung
 * ueberspringt, kann eine verdeckte Route nicht bemerken.
 *
 * Eine Konvention, an die man sich erinnern muss, versagt genau so. Ein
 * Waechter nicht.
 *
 * Lauf: node --test --test-force-exit test/routenSchatten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

/* Untergrenzen: ein Waechter, der nichts mehr findet, sieht gruen aus. */
const MINDESTENS_ROUTER = 70;
const MINDESTENS_SCHICHTEN = 700;

const durch = (_q, _r, n) => n();
const pool = {
  query: async () => ({ rows: [] }),
  connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
  on() {}
};
const still = () => {};
const logger = { info: still, warn: still, error: still, debug: still, child: () => logger };
const deps = new Proxy({
  pool, logger, stripe: null,
  config: { NODE_ENV: "test", SCIM_ENABLED: false },
  sendMail: async () => ({ ok: true }),
  requireAuth: durch,
  getUserAndPlan: async () => ({ user: {}, plan: "PRO" }),
  requireFeature: () => durch,
  cronRateLimit: durch
}, {
  get: (z, k) => (k in z ? z[k]
    : (typeof k === "string" && /[Ll]imiter$/.test(k) ? durch : undefined))
});

/**
 * Welche Routen verdeckt eine frueher registrierte Platzhalter-Route?
 * Reine Funktion auf einem Express-Router — dadurch mit einem eigenen Beispiel
 * pruefbar, ohne die echten Router zu veraendern.
 */
export function findeSchatten(router, datei = "") {
  const gefunden = [];
  const schichten = router.stack
    .filter((l) => l.route)
    .map((l, i) => ({ i, l, pfad: l.route.path, methoden: Object.keys(l.route.methods) }));

  for (const s of schichten) {
    /* Nur feste Pfade koennen verdeckt werden. Ein Platzhalter, der einen
       anderen Platzhalter verdeckt, ist eine doppelte Route — anderer Befund. */
    if (s.pfad.includes(":") || s.pfad.includes("*")) continue;
    for (const frueher of schichten) {
      if (frueher.i >= s.i) break;
      if (!frueher.pfad.includes(":")) continue;
      const gemeinsam = frueher.methoden.filter((m) => s.methoden.includes(m));
      if (!gemeinsam.length) continue;
      if (frueher.l.regexp.test(s.pfad)) {
        gefunden.push({
          datei,
          verdeckt: `${gemeinsam[0].toUpperCase()} ${s.pfad}`,
          durch: frueher.pfad
        });
        break;
      }
    }
  }
  return gefunden;
}

/* ── Alle Router aus app.js bauen ─────────────────────────────────────────── */
const appQuelle = fs.readFileSync(path.join(API, "app.js"), "utf8");
const fabriken = [...appQuelle.matchAll(/v1\.use\((create\w+Router)\(deps\)\)/g)].map((m) => m[1]);
const wo = new Map();
for (const d of fs.readdirSync(path.join(API, "routes")).filter((f) => f.endsWith(".js"))) {
  const s = fs.readFileSync(path.join(API, "routes", d), "utf8");
  for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+(create\w+Router)/g)) wo.set(m[1], d);
}

const ungebaut = [];
const schatten = [];
let schichten = 0;
for (const name of fabriken) {
  const datei = wo.get(name);
  if (!datei) { ungebaut.push(`${name}: keine Datei gefunden`); continue; }
  try {
    const r = await (await import(`../routes/${datei}`))[name](deps);
    if (!r) { ungebaut.push(`${name}: liefert keinen Router`); continue; }
    schichten += r.stack.filter((l) => l.route).length;
    schatten.push(...findeSchatten(r, datei));
  } catch (e) { ungebaut.push(`${name} (${datei}): ${e.message}`); }
}

describe("Verdeckte Routen", () => {

  it("baut JEDEN Router — ein uebersprungener Router ist ein blinder Fleck", () => {
    assert.deepStrictEqual(ungebaut, [],
      "Diese Router liessen sich nicht bauen und wurden NICHT auf Schatten geprueft. "
      + "Fehlende Abhaengigkeit in `deps` ergaenzen.\n  " + ungebaut.join("\n  "));
  });

  it("prueft genug, um etwas zu beweisen", () => {
    assert.ok(fabriken.length >= MINDESTENS_ROUTER,
      `nur ${fabriken.length} Router in app.js gefunden — das Muster `
      + "v1.use(createXRouter(deps)) trifft nicht mehr.");
    assert.ok(schichten >= MINDESTENS_SCHICHTEN,
      `nur ${schichten} Routen-Schichten gefunden (erwartet mindestens `
      + `${MINDESTENS_SCHICHTEN}).`);
  });

  it("keine Route liegt im Schatten einer frueheren Platzhalter-Route", () => {
    const zeilen = schatten.map((s) => `${s.datei}: ${s.verdeckt}  —  verdeckt durch ${s.durch}`);
    assert.deepStrictEqual(zeilen, [],
      "Diese Routen sind unerreichbar: Express nimmt die erste passende Schicht, und "
      + "das ist hier die Platzhalter-Route. Der Aufruf landet in ihrem Handler, mit dem "
      + "festen Wort als Kennung — meist ein 500 aus der Datenbank, nie die gemeinte "
      + "Antwort.\n\n"
      + "Fix: die Route mit dem festen Pfad VOR der Platzhalter-Route registrieren.\n  "
      + zeilen.join("\n  "));
  });

  it("Selbstprobe: die Erkennung findet den Schatten und meldet nichts Falsches", () => {
    const r = express.Router();
    r.get("/x/:id", durch);
    r.get("/x/liste", durch);          // verdeckt
    r.post("/x/liste", durch);         // NICHT verdeckt: andere Methode
    r.get("/x/tief/liste", durch);     // NICHT verdeckt: /x/:id passt nicht auf zwei Abschnitte
    r.get("/y/liste", durch);
    r.get("/y/:id", durch);            // richtige Reihenfolge — kein Schatten

    assert.deepStrictEqual(findeSchatten(r), [
      { datei: "", verdeckt: "GET /x/liste", durch: "/x/:id" }
    ], "die Erkennung findet entweder den Schatten nicht oder meldet zu viel");
  });

  it("Selbstprobe: die richtige Reihenfolge allein genuegt nicht — die Methode zaehlt", () => {
    const r = express.Router();
    r.patch("/z/:id", durch);
    r.get("/z/liste", durch);          // PATCH verdeckt kein GET
    assert.deepStrictEqual(findeSchatten(r), [],
      "eine Platzhalter-Route mit ANDERER Methode verdeckt nichts — "
      + "wird sie trotzdem gemeldet, faerbt der Waechter gesunde Router rot");
  });
});
