/**
 * Eine Einladung darf kein bestehendes Konto zerstoeren (M2.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `acceptInvite` legte den Nutzer mit
 * `ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`
 * an und die Mitgliedschaft mit
 * `ON CONFLICT (user_id, org_id) DO UPDATE SET role_key = 'worker'`.
 *
 * Auf ein BESTEHENDES Konto wirkte das dreifach:
 *
 *   1. Passwort ersetzt, is_verified gesetzt
 *   2. Mitgliedschaft in der einladenden Org auf 'worker' HERABGESTUFT
 *   3. `users.role` blieb unangetastet (z. B. 'company')
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER SCHADEN IST "BEIDSEITIG TOT", NICHT "PASSWORT WEG"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Aus 2 und 3 zusammen folgt der eigentliche Schaden, und genau darauf zielt
 * die letzte Probe dieser Datei:
 *
 *   - `rbacService` fragt `role_key` — das ist jetzt 'worker', also gibt es
 *     ueber die Org keine Berechtigung mehr.
 *   - `requireWorkerRole` (routes/workerPortal.js:217) fragt
 *     `session.userRole`, und das kommt aus `users.role` — das ist noch
 *     'company', also auch kein Zugang zum Arbeiter-Portal.
 *
 * Ein Riegel, der nur die Passwort-Ueberschreibung verhindert, loest den
 * halben Schaden. Deshalb prueft die Probe den ZUSTAND, nicht das Passwort.
 *
 * KEIN ANGRIFFSWEG: der Token verlaesst den Server nur ins Postfach des
 * Eingeladenen (drei Austrittsstellen geprueft — `listInvites` waehlt keinen
 * Token, `resend` antwortet `{ok:true}`, `POST /worker-invites` baut ihn nur
 * in die Mail-URL). Es braucht den echten Adressinhaber, der annimmt — und
 * genau der verliert dabei sein Konto.
 *
 * Run: node --test --test-force-exit test/einladungRiegel.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as workerService from "../services/workerService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ohneKommentare = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MORGEN = new Date(Date.now() + 86400000).toISOString();

/**
 * Pool mit Buchfuehrung: merkt sich JEDE Abfrage, damit die Proben zeigen
 * koennen, dass eine Schreiboperation gar nicht erst lief.
 */
function musterPool({ bestand = null, einladung = null } = {}) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      const q = String(sql || "");
      calls.push({ sql: q, params: params || [], via: "client" });
      if (q.includes("INSERT INTO users")) {
        return { rows: [{ id: "neu-1", email: einladung?.email, role: "worker" }] };
      }
      if (q.includes("SELECT") && q.includes("worker_profiles")) return { rows: [] };
      return { rows: [{}] };
    },
    release: () => {}
  };
  return {
    calls,
    connect: async () => client,
    query: async (sql, params) => {
      const q = String(sql || "");
      calls.push({ sql: q, params: params || [], via: "pool" });
      if (q.includes("FROM worker_invites")) return { rows: einladung ? [einladung] : [] };
      if (q.includes("FROM users WHERE LOWER(email)")) return { rows: bestand ? [bestand] : [] };
      return { rows: [] };
    },
    schrieb: (teil) => calls.some((c) => c.sql.includes(teil))
  };
}

const EINLADUNG = {
  id: "inv-1", email: "chef@firma.de", status: "pending",
  expires_at: MORGEN, supplier_org_id: "org-agentur", first_name: "Max"
};

describe("M2.1 · eine fremde Rolle wird abgelehnt", () => {
  it("ein Firmenkonto wird NICHT ueberschrieben", async () => {
    const pool = musterPool({
      einladung: EINLADUNG,
      bestand: { id: "u-chef", role: "company", password_hash: "ALT" }
    });
    const r = await workerService.acceptInvite(pool, { token: "t", passwordHash: "NEU" });
    assert.equal(r.error, "EMAIL_EXISTS_OTHER_ROLE");
    assert.equal(r.role, "company");
  });

  it("und KEINE der beiden Schreibabfragen laeuft ueberhaupt", async () => {
    /* Das ist der Kern: der Riegel greift VOR der Transaktion. Ein Riegel,
     * der erst danach zurueckrollt, hat die Zeilen schon angefasst. */
    const pool = musterPool({
      einladung: EINLADUNG,
      bestand: { id: "u-chef", role: "company", password_hash: "ALT" }
    });
    await workerService.acceptInvite(pool, { token: "t", passwordHash: "NEU" });
    assert.ok(!pool.schrieb("INSERT INTO users"), "das Konto wurde angefasst");
    assert.ok(!pool.schrieb("INSERT INTO org_memberships"), "die Mitgliedschaft wurde angefasst");
    assert.ok(!pool.schrieb("BEGIN"), "die Transaktion wurde ueberhaupt geoeffnet");
  });

  it("DER ZUSTANDSNACHWEIS: das Konto bleibt in BEIDEN Welten lebendig", async () => {
    /*
     * Die wichtigste Probe der Welle. Der Schaden war nicht "Passwort weg",
     * sondern:
     *   users.role bleibt 'company'  -> requireWorkerRole sperrt das Portal
     *   role_key wird 'worker'       -> rbacService gibt keine Berechtigung
     * Beides zusammen = tot. Geprueft wird deshalb, dass WEDER das eine noch
     * das andere geschrieben wurde.
     */
    const pool = musterPool({
      einladung: EINLADUNG,
      bestand: { id: "u-chef", role: "company", password_hash: "ALT" }
    });
    await workerService.acceptInvite(pool, { token: "t", passwordHash: "NEU" });

    const rollenSchreiber = pool.calls.filter((c) =>
      /UPDATE\s+users[\s\S]*role|INSERT INTO users/.test(c.sql));
    assert.deepEqual(rollenSchreiber, [], "users.role oder das Konto wurden beruehrt");

    const mitgliedSchreiber = pool.calls.filter((c) => c.sql.includes("org_memberships"));
    assert.deepEqual(mitgliedSchreiber, [], "role_key wurde beruehrt");
  });
});

describe("M2.1 · ein bestehender Arbeiter behaelt sein Passwort", () => {
  it("die Einladung ist eine Einladung, kein Zuruecksetzen", async () => {
    /*
     * Die subtilere Haelfte. Ein Arbeiter mit Konto bei Agentur A, den
     * Agentur B einlaedt, hat `role === 'worker'` — der Riegel oben greift
     * bei ihm NICHT. Trotzdem wurde ihm bisher das Passwort ueberschrieben.
     */
    const pool = musterPool({
      einladung: { ...EINLADUNG, email: "kraft@arbeit.de" },
      bestand: { id: "u-kraft", role: "worker", password_hash: "ALT" }
    });
    const r = await workerService.acceptInvite(pool, { token: "t", passwordHash: "NEU" });
    assert.ok(!r.error, `unerwarteter Fehler: ${r.error}`);
    assert.ok(!pool.schrieb("INSERT INTO users"),
      "das bestehende Konto wurde neu geschrieben — damit auch sein Passwort");
  });

  it("aber die Mitgliedschaft entsteht", async () => {
    const pool = musterPool({
      einladung: { ...EINLADUNG, email: "kraft@arbeit.de" },
      bestand: { id: "u-kraft", role: "worker", password_hash: "ALT" }
    });
    await workerService.acceptInvite(pool, { token: "t", passwordHash: "NEU" });
    const m = pool.calls.find((c) => c.sql.includes("INSERT INTO org_memberships"));
    assert.ok(m, "ohne Mitgliedschaft waere die Einladung wirkungslos");
    assert.deepEqual(m.params, ["u-kraft", "org-agentur"]);
  });

  it("eine BESTEHENDE Mitgliedschaft wird nicht herabgestuft", async () => {
    const s = ohneKommentare(quelle("services/workerService.js"));
    assert.ok(!/ON CONFLICT \(user_id, org_id\) DO UPDATE SET role_key = 'worker'/.test(s),
      "die Herabstufung steht wieder da");
    assert.ok(/ON CONFLICT \(user_id, org_id\) DO UPDATE SET is_active = TRUE/.test(s),
      "nur der Aktiv-Zustand darf nachgezogen werden");
  });
});

describe("M2.1 · ein neues Konto entsteht wie bisher", () => {
  it("ohne Bestand wird angelegt, mit Passwort und Mitgliedschaft", async () => {
    const pool = musterPool({ einladung: EINLADUNG, bestand: null });
    const r = await workerService.acceptInvite(pool, { token: "t", passwordHash: "NEU" });
    assert.ok(!r.error, `unerwarteter Fehler: ${r.error}`);
    const ins = pool.calls.find((c) => c.sql.includes("INSERT INTO users"));
    assert.ok(ins, "das Konto wurde nicht angelegt");
    assert.deepEqual(ins.params, ["chef@firma.de", "NEU"]);
    assert.ok(pool.schrieb("INSERT INTO org_memberships"));
  });

  it("der Anlege-Weg traegt KEIN ON CONFLICT mehr auf die E-Mail", () => {
    /* Das war der Ursprung des ganzen Befunds. Ohne den Zweig gibt es die
     * Ueberschreibung nicht mehr, unabhaengig von jedem Riegel davor. */
    const s = ohneKommentare(quelle("services/workerService.js"));
    assert.ok(!/ON CONFLICT \(email\) DO UPDATE\s*\n?\s*SET password_hash/.test(s),
      "die Passwort-Ueberschreibung steht wieder da");
  });
});

describe("M2.1 · der Fall wird nach aussen unterscheidbar gemeldet", () => {
  it("die Route antwortet 409, nicht 400", () => {
    /* 400 hiesse "Eingabe pruefen" — und ein erneuter Versuch hilft hier nie. */
    const s = ohneKommentare(quelle("routes/auth.js"));
    assert.match(s, /result\.error === "EMAIL_EXISTS_OTHER_ROLE" \? 409/);
  });

  it("die fremde Rolle wird NICHT nach aussen gegeben", () => {
    /* Sie verriete einem Unbefugten, dass es zu dieser Adresse ein
     * Firmenkonto gibt. Der Dienst liefert sie, die Route schickt sie nicht. */
    const s = ohneKommentare(quelle("routes/auth.js"));
    const stelle = s.slice(s.indexOf("EMAIL_EXISTS_OTHER_ROLE"), s.indexOf("EMAIL_EXISTS_OTHER_ROLE") + 400);
    assert.ok(!/json\(\{[^}]*role/.test(stelle), "die Rolle steht in der Antwort");
  });

  it("dasselbe Fehlerwort wie im Import-Weg — keine zweite Benennung", () => {
    const s = quelle("services/workerService.js");
    assert.ok((s.match(/EMAIL_EXISTS_OTHER_ROLE/g) || []).length >= 2,
      "zwei Namen fuer dieselbe Ablehnung waeren der Anfang der naechsten Doppelung");
  });
});

describe("M2.1 · die Einladung entsteht gar nicht erst", () => {
  /*
   * Der Riegel in `acceptInvite` allein genuegt nicht: ohne diese Pruefung
   * entstuende trotzdem eine Einladung, die Mail ginge raus, und der
   * Empfaenger erfuehre erst NACH dem Setzen eines Passworts, dass es nicht
   * geht. Eine Einladung, die nicht angenommen werden KANN, soll nicht
   * entstehen — und der Disponent erfaehrt den Grund dort, wo er noch etwas
   * daran aendern kann.
   */
  function anlegePool(fremdeRolle) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        const q = String(sql || "");
        calls.push({ sql: q, params: params || [] });
        if (q.includes("FROM worker_invites")) return { rows: [] };
        if (q.includes("role <> 'worker'")) {
          return { rows: fremdeRolle ? [{ role: fremdeRolle }] : [] };
        }
        return { rows: [{ id: "inv-neu", email: "x@y.de" }] };
      },
      schrieb: (teil) => calls.some((c) => c.sql.includes(teil))
    };
  }

  it("eine Adresse mit Firmenkonto wird abgelehnt, BEVOR etwas entsteht", async () => {
    const pool = anlegePool("company");
    const r = await workerService.createWorkerInvite(pool, {
      supplierOrgId: "o1", invitedBy: "u1", email: "chef@firma.de",
      firstName: "Max", lastName: "Mustermann"
    });
    assert.equal(r.error, "EMAIL_EXISTS_OTHER_ROLE");
    assert.equal(r.role, "company");
    assert.ok(!pool.schrieb("INSERT INTO worker_invites"),
      "die Einladung wurde trotzdem angelegt — die Mail waere rausgegangen");
  });

  it("eine unbekannte Adresse geht weiterhin durch", async () => {
    const pool = anlegePool(null);
    const r = await workerService.createWorkerInvite(pool, {
      supplierOrgId: "o1", invitedBy: "u1", email: "neu@firma.de",
      firstName: "Anna", lastName: "Beck"
    });
    assert.ok(!r.error, `unerwarteter Fehler: ${r.error}`);
    assert.ok(pool.schrieb("INSERT INTO worker_invites"));
  });

  it("die Pruefung schliesst Arbeiter aus — sie duerfen eingeladen werden", () => {
    /* Ein Arbeiter mit Konto bei Agentur A darf von B eingeladen werden. Der
     * Riegel gilt fremden ROLLEN, nicht fremden Agenturen. */
    const s = ohneKommentare(quelle("services/workerService.js"));
    assert.match(s, /role <> 'worker'/,
      "ohne den Ausschluss sperrte der Riegel genau die, fuer die er nicht gedacht ist");
  });
});
