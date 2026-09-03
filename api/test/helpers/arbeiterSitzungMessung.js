/**
 * Die Messung hinter M2.5: eine Arbeitersitzung faehrt gegen die echten Router.
 *
 * Liegt als Helfer und nicht im Test, weil zwei Aufrufer sie brauchen: der
 * Waechter (`test/arbeiterSitzung.test.js`) und das Werkzeug, das das Register
 * daraus fortschreibt. Zwei Kopien derselben Messung waeren zwei Wahrheiten.
 *
 * WAS GEMESSEN WIRD — UND WAS NICHT
 * Der Muster-Pool antwortet mit einer Zeile, deren Textspalten ein Erkennungswort
 * tragen. WELCHES, entscheidet er an den PARAMETERN der Abfrage:
 *
 *   Org-Kennung in den Parametern   -> Zeile der Traegerorg   (WORT_ORG)
 *   nur Nutzer-Kennung              -> Zeile des Menschen     (WORT_ICH)
 *   keine von beiden                -> kein Mandantenbezug    (WORT_FREI)
 *
 * Steht am Ende WORT_ORG im Antwortrumpf, hat der Handler org-geschluesselte
 * Daten herausgegeben. Das ist eine TATSACHE. Ob sie ein Problem ist, ist ein
 * URTEIL und steht im Register — mit Begruendung, wenn es der Messung
 * widerspricht.
 *
 * GRENZEN, ehrlich benannt:
 *   - gemessen wird das PRAEDIKAT, nicht die Semantik. Ein `WHERE user_id = $1`,
 *     das ueber einen JOIN doch org-weit wird, zaehlt als "eigen".
 *   - die Zeile des Musters traegt nur die hier gelisteten Spalten. Ein Handler,
 *     der ausschliesslich andere Spalten weitergibt, faellt durch.
 *   Beides sind Unter-, keine Ueberschaetzungen: ein Befund ist immer echt.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const API = path.resolve(HIER, "..", "..");

export const WORT_ORG = "ZEILEDERTRAEGERORG";
export const WORT_ICH = "ZEILEDESMENSCHEN";
export const WORT_FREI = "ZEILEOHNEMANDANT";
export const UID = "11111111-1111-1111-1111-111111111111";
export const OID = "22222222-2222-2222-2222-222222222222";

const TEXTSPALTEN = ["name", "title", "titel", "description", "beschreibung", "customer_name",
  "invoice_number", "status", "email", "city", "role_key", "label", "code", "type",
  "company_name", "org_name", "note", "message", "kind", "category", "slug", "reason"];

function zeileMit(wort) {
  const z = {
    id: "99999999-9999-9999-9999-999999999999", org_id: OID, user_id: UID,
    created_at: "2026-09-02T00:00:00.000Z", total_cents: 1499900, amount_cents: 1499900,
    balance_cents: 1499900, count: 7, total: 7, is_active: true
  };
  for (const s of TEXTSPALTEN) z[s] = wort;
  return z;
}
const ZEILE_ORG = zeileMit(WORT_ORG);
const ZEILE_ICH = zeileMit(WORT_ICH);
const ZEILE_FREI = zeileMit(WORT_FREI);

export function antwort(sql, params = []) {
  const s = String(sql);
  /* Die Mitgliedschaft OHNE Erkennungswort — sonst meldete jede Route, die nur
     die Sitzung aufloest, faelschlich einen Befund. */
  if (/FROM\s+org_memberships/i.test(s)) {
    return { rows: [{ user_id: UID, org_id: OID, role_key: "worker", is_active: true,
      org_name: "Traeger", org_type: "agency", org_plan: "PRO" }] };
  }
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] };
  /* Die Org sticht: fragt die Abfrage nach BEIDEM, gehoert die Zeile der Org. */
  const p = (Array.isArray(params) ? params : []).map((x) => String(x));
  if (p.includes(OID)) return { rows: [ZEILE_ORG] };
  if (p.includes(UID)) return { rows: [ZEILE_ICH] };
  return { rows: [ZEILE_FREI] };
}

const still = () => {};
const logger = { info: still, warn: still, error: still, debug: still, child: () => logger };
const durchreiche = (_q, _r, n) => n();

export function baueDeps() {
  const pool = {
    query: async (s, p) => antwort(s, p),
    connect: async () => ({ query: async (s, p) => antwort(s, p), release() {} }),
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

/**
 * Faehrt die Sitzung und liefert den Befund.
 * @returns {Promise<{ungebaut: string[], fabriken: string[], ziele: object[],
 *                     gemessen: Map<string,"org"|"eigen">, code: Map<string,number>}>}
 */
export async function messe() {
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
      const r = await (await import(`../../routes/${datei}`))[name](deps);
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

  const gemessen = new Map();
  const code = new Map();
  for (const z of ziele) {
    const pfad = z.route.slice(4);
    try {
      const res = await request(app).get("/api/v1" + pfad).timeout({ deadline: 5000 });
      code.set(pfad, res.status);
      if (res.status >= 400) continue;
      const rumpf = typeof res.text === "string" ? res.text : "";
      /* Die Org sticht auch hier: steht BEIDES im Rumpf, sind Firmendaten dabei. */
      if (rumpf.includes(WORT_ORG)) gemessen.set(z.route, "org");
      else if (rumpf.includes(WORT_ICH)) gemessen.set(z.route, "eigen");
    } catch { code.set(pfad, 0); }
  }

  return { ungebaut, fabriken, ziele, gemessen, code, deps };
}
