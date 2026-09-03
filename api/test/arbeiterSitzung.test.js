/**
 * M2.5 — Was eine ARBEITERSITZUNG von der Plattform-API zu sehen bekommt.
 *
 * Diesen Test gab es nicht. Es gab Einheitstests fuer einzelne Guards und einen
 * Waechter, der Middleware-Namen liest — aber nichts, was eine Sitzung mit der
 * Rolle `worker` durch die echten Router schickt und nachsieht, was zurueckkommt.
 * Genau diese Luecke ist M2.5 in docs/features/M_MARKTPLATZ_FLOW.md.
 *
 * WER HIER ANFRAGT
 * Ein Arbeiter entsteht in workerService.acceptInvite. Dabei wird er Mitglied in
 * der Org SEINER ZEITARBEITSFIRMA — `INSERT INTO org_memberships … role_key='worker'`
 * mit der `supplier_org_id` der Einladung. Er bekommt also KEINE eigene Org:
 * seine Sitzung traegt req.orgId = die Kennung der Zeitarbeitsfirma. Gemessen in
 * der Datenbank am 2026-09-02: 31 Menschen in einer Agentur-Org, 3 in einer
 * Unternehmens-Org. Der Org-Typ 'worker' existiert nicht.
 *
 * WORAN GEMESSEN WIRD — NICHT AM STATUSCODE
 * Ein 200 sagt nur, dass der Guard durchgelassen hat; es kann eine leere Liste
 * sein. Deshalb entscheidet der ANTWORTRUMPF: der Muster-Pool beantwortet jede
 * Abfrage mit einer Zeile, deren Textspalten ein Erkennungswort tragen. Steht das
 * Wort in der Antwort, hat der Handler Daten der Traegerorg durchgereicht.
 *
 * Das Verfahren kann UNTER-, aber nie ueberberichten: ein Handler, der Felder
 * umbenennt, faellt durch (Untererfassung); ein Handler ohne Mandantendaten kann
 * das Wort nicht erfinden. Ein Befund ist damit immer echt.
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

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am Startverzeichnis
   und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const REGISTER = JSON.parse(
  fs.readFileSync(path.join(HIER, "fixtures", "arbeiterSitzung.json"), "utf8")
);

const WORT = "GEHEIMTRAEGERORG";
const UID = "11111111-1111-1111-1111-111111111111";
const OID = "22222222-2222-2222-2222-222222222222";

/* Untergrenzen. Ein Waechter, der nichts mehr prueft, sieht sonst gruen aus —
   das ist der haeufigste Weg zu einer Zusicherung, die nie zuschlagen kann. */
const MINDESTENS_ROUTER = 70;
const MINDESTENS_ROUTEN = 250;

/* ── Der Muster-Pool: jede Zeile traegt das Erkennungswort ─────────────────── */
const TEXTSPALTEN = ["name", "title", "titel", "description", "beschreibung", "customer_name",
  "invoice_number", "status", "email", "city", "role_key", "label", "code", "type",
  "company_name", "org_name", "note", "message", "kind", "category", "slug", "reason"];
const ZEILE = {
  id: "99999999-9999-9999-9999-999999999999", org_id: OID, user_id: UID,
  created_at: "2026-09-02T00:00:00.000Z", total_cents: 1499900, amount_cents: 1499900,
  balance_cents: 1499900, count: 7, total: 7, is_active: true
};
for (const s of TEXTSPALTEN) ZEILE[s] = WORT;

function antwort(sql) {
  const s = String(sql);
  /* Die Mitgliedschaft OHNE Erkennungswort — sonst meldete jede Route, die nur
     die Sitzung aufloest, faelschlich einen Befund. */
  if (/FROM\s+org_memberships/i.test(s)) {
    return { rows: [{ user_id: UID, org_id: OID, role_key: "worker", is_active: true,
      org_name: "Traeger", org_type: "agency", org_plan: "PRO" }] };
  }
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] };
  return { rows: [ZEILE] };
}

const still = () => {};
const logger = { info: still, warn: still, error: still, debug: still, child: () => logger };
const durchreiche = (_q, _r, n) => n();

function baueDeps() {
  const pool = {
    query: async (s) => antwort(s),
    connect: async () => ({ query: async (s) => antwort(s), release() {} }),
    on() {}
  };
  const bekannt = {
    pool, logger, stripe: null,
    config: { NODE_ENV: "test", SCIM_ENABLED: false },
    sendMail: async () => ({ ok: true }),
    requireAuth: (req, _r, n) => { req.session = { userId: UID, userRole: "worker" }; req.orgId = OID; n(); },
    getUserAndPlan: async () => ({ user: { id: UID, role: "worker" }, plan: "PRO" }),
    requireFeature: () => durchreiche,
    cronRateLimit: durchreiche
  };
  /* Unbekannte Begrenzer sind Middleware — alles andere bleibt undefined, damit
     eine echte fehlende Abhaengigkeit auffaellt statt still ueberdeckt zu werden. */
  return new Proxy(bekannt, {
    get: (z, k) => (k in z ? z[k]
      : (typeof k === "string" && /[Ll]imiter$/.test(k) ? durchreiche : undefined))
  });
}

/* ── Alle Router aus app.js montieren ─────────────────────────────────────── */
const appQuelle = fs.readFileSync(path.join(API, "app.js"), "utf8");
const fabriken = [...appQuelle.matchAll(/v1\.use\((create\w+Router)\(deps\)\)/g)].map((m) => m[1]);
const wo = new Map();
for (const d of fs.readdirSync(path.join(API, "routes")).filter((f) => f.endsWith(".js"))) {
  const s = fs.readFileSync(path.join(API, "routes", d), "utf8");
  for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+(create\w+Router)/g)) wo.set(m[1], d);
}

const deps = baueDeps();
const app = express();
app.use(express.json());
app.use((req, _r, n) => { req.session = { userId: UID, userRole: "worker" }; req.orgId = OID; n(); });
const v1 = express.Router();
const ungebaut = [];
const ziele = [];
for (const name of fabriken) {
  const datei = wo.get(name);
  if (!datei) { ungebaut.push(`${name}: keine Datei gefunden`); continue; }
  try {
    const r = await (await import(`../routes/${datei}`))[name](deps);
    if (!r) { ungebaut.push(`${name}: liefert keinen Router`); continue; }
    v1.use(r);
    for (const l of r.stack) {
      if (!l.route || !l.route.methods.get) continue;
      if (l.route.path.includes(":") || l.route.path.includes("*")) continue;
      ziele.push({ datei, route: `GET ${l.route.path}` });
    }
  } catch (e) { ungebaut.push(`${name} (${datei}): ${e.message}`); }
}
app.use("/api/v1", v1);
app.use((err, _q, res, _n) => res.status(err.status || 500).json({ fehler: String(err.message).slice(0, 40) }));

/* ── Die Sitzung faehrt ───────────────────────────────────────────────────── */
const durchgereicht = [];   // Route gab Daten der Traegerorg heraus
const abgewiesen = new Map();
for (const z of ziele) {
  const pfad = z.route.slice(4);
  try {
    const res = await request(app).get("/api/v1" + pfad).timeout({ deadline: 5000 });
    abgewiesen.set(pfad, res.status);
    const rumpf = typeof res.text === "string" ? res.text : "";
    if (res.status < 400 && rumpf.includes(WORT)) durchgereicht.push(z);
  } catch { abgewiesen.set(pfad, 0); }
}

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

  it("das Erkennungswort erreicht die Antwort ueberhaupt", () => {
    /* Ohne diese Probe waere ein kaputter Muster-Pool ununterscheidbar von einer
       makellosen Plattform: NICHTS gefunden saehe aus wie NICHTS zu finden. */
    assert.ok(durchgereicht.length > 0,
      "keine einzige Route hat das Erkennungswort durchgereicht. Entweder ist der "
      + "Muster-Pool kaputt oder die Antwort wird nicht mehr als Text gelesen — "
      + "in beiden Faellen misst dieser Test nichts.");
  });

  it("jede Route, die dem Arbeiter Daten der Traegerorg gibt, steht im Register", () => {
    const unbekannt = durchgereicht.filter((d) => !erlaubt.has(d.route));
    assert.deepStrictEqual(unbekannt.map((u) => `${u.route}  (${u.datei})`), [],
      "Diese Routen reichen einer Arbeitersitzung Daten ihrer Zeitarbeitsfirma durch "
      + "und stehen in keinem Register.\n\n"
      + "Neu gebaute Route? Dann ist das hier die Frage, die vor dem Ausliefern zu "
      + "beantworten ist: darf ein Arbeiter das sehen?\n"
      + "  - Es sind SEINE Daten          -> art 'eigenes' in test/fixtures/arbeiterSitzung.json\n"
      + "  - Es ist ohnehin oeffentlich   -> art 'oeffentlich'\n"
      + "  - Es gehoert der Firma         -> Guard einbauen, NICHT eintragen\n"
      + "Eintragen ohne Urteil macht aus einer Luecke eine genehmigte Luecke.");
  });

  it("die geschlossenen Wege bleiben geschlossen", () => {
    const wiederOffen = [];
    for (const g of REGISTER.geschlossen) {
      const pfad = g.route.slice(4);
      const code = abgewiesen.get(pfad);
      if (code === undefined) {
        wiederOffen.push(`${g.route}: gibt es nicht mehr — Eintrag entfernen oder Route pruefen`);
      } else if (code < 400) {
        wiederOffen.push(`${g.route}: antwortet ${code} statt 4xx`);
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

  it("die Zahl der offenen Befunde faellt, sie steigt nie", () => {
    const befunde = REGISTER.erlaubt.filter((e) => e.art === "befund");
    const offen = befunde.filter((b) => durchgereicht.some((d) => d.route === b.route));
    assert.ok(offen.length <= befunde.length,
      "mehr offene Befunde als im Register — der Zaehler darf nur fallen.");
    for (const b of befunde) {
      assert.ok(typeof b.was === "string" && b.was.length >= 20,
        `${b.route}: ein Befund ohne Beschreibung ist keiner. Benennen, WAS herausgeht.`);
    }
    /* Geschlossene Befunde gehoeren aus dem Register entfernt — sonst waechst eine
       Liste mit, die nur noch behauptet, es gaebe ein Problem. */
    const erledigt = befunde.filter((b) => !durchgereicht.some((d) => d.route === b.route));
    assert.deepStrictEqual(erledigt.map((e) => e.route), [],
      "Diese Befunde treffen nicht mehr zu — die Route gibt nichts mehr heraus. "
      + "Eintrag nach 'geschlossen' verschieben (mit Grund) oder loeschen.\n  "
      + erledigt.map((e) => e.route).join("\n  "));
  });

  it("das Register beschreibt die Wirklichkeit, nicht die Vergangenheit", () => {
    const verwaist = REGISTER.erlaubt.filter((e) => !ziele.some((z) => z.route === e.route));
    assert.deepStrictEqual(verwaist.map((v) => v.route), [],
      "Diese Eintraege zeigen auf Routen, die es nicht mehr gibt. Ein Register, das "
      + "die Wirklichkeit nicht mehr trifft, erlaubt irgendwann etwas, das niemand "
      + "geprueft hat.\n  " + verwaist.map((v) => v.route).join("\n  "));
  });

  it("Selbstprobe: eine neue undichte Route faellt auf", async () => {
    /* Ohne diese Probe koennte die Erkennung leise aufhoeren zu greifen und alles
       saehe weiter gruen aus. */
    const prueflauf = express();
    const r = express.Router();
    r.get("/frisch/undicht", async (_q, res) => res.json((await deps.pool.query("SELECT * FROM listings")).rows));
    r.get("/frisch/dicht", (_q, res) => res.json({ ok: true }));
    prueflauf.use("/api/v1", r);

    const undicht = await request(prueflauf).get("/api/v1/frisch/undicht");
    const dicht = await request(prueflauf).get("/api/v1/frisch/dicht");

    assert.ok(undicht.status < 400 && undicht.text.includes(WORT),
      "die undichte Probe-Route wurde nicht erkannt — die Erkennung greift nicht mehr");
    assert.ok(!dicht.text.includes(WORT),
      "die dichte Probe-Route wurde faelschlich als undicht erkannt");
    assert.ok(!erlaubt.has("GET /frisch/undicht"),
      "eine unbekannte undichte Route darf nicht im Register stehen");
  });
});
