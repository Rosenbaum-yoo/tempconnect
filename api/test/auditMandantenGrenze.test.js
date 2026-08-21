/**
 * Die Mandantengrenze im Audit-Log (8.1.1).
 *
 * DER BEFUND, gemessen am 2026-08-21 gegen die laufende Datenbank:
 *   139 Zeilen trugen eine `org_id`, in der der Handelnde NIE Mitglied war
 *   (103 `notification.mark_read`, 16 `auth.register`, 13 `auth.login`,
 *   4 `demo.login`, 3 `subscription_request.apply_approved_change`).
 *   1796 von 2740 Zeilen trugen gar keine `org_id`.
 *
 * Zwei Defekte in einer Tabelle mit gegenlaeufiger Wirkung: ein Teil lag in der
 * FALSCHEN Organisation (Leck), der groessere Teil in KEINER (Luecke in der
 * Nachvollziehbarkeit). Wer nur den ersten behebt, macht das Audit dichter — und
 * gleichzeitig noch loechriger.
 *
 * URSACHE, an der Quelle behoben: `routes/demo.js` setzte `req.session.userId`
 * ohne `session.regenerate()`, sodass der `_orgCache` des zuvor angemeldeten
 * Kontos die ganze Sitzung ueberlebte; und die Audit-Schreibseite stempelte
 * `req.orgId`, der VOR der Route aufgeloest wird. Bestandsreparatur:
 * `sql/migrations/187_audit_log_mandant_an_der_quelle.sql`.
 *
 * ZWEI SCHICHTEN, wie in diesem Repo ueblich:
 *   1. OHNE Datenbank (laeuft immer): die Schreibseite darf nirgends mehr blind
 *      auf `req.orgId` zurueckfallen. Ein Quelltext-Riegel, der jeden neuen
 *      Rueckfall rot macht — auch in einem Pfad, den es heute noch nicht gibt.
 *   2. MIT Datenbank (laeuft im Container): die Abnahme selbst. Ein Mock kann
 *      kein `WHERE` erzwingen und kennt keine Policies; ob die Grenze haelt,
 *      weiss nur Postgres.
 *
 * Schicht 2 ueberspringt sich ohne `DB_HOST` — aber LAUT (CLAUDE.md §0.9).
 *
 * NICHT hier geprueft, weil es Rollen-Rechte braucht: der Verhaltensnachweis mit
 * einer Nicht-Superuser-Rolle. Er wurde am 2026-08-21 von Hand gefuehrt und ist
 * in `docs/features/I_AUDIT_ZUWEISUNG_SUPPORT.md` protokolliert: ohne Kontext
 * 0 Zeilen, Org A 303 (nur eigene), Org B 140 (nur eigene), Staff 2742, org-lose
 * Zeilen fuer A 0 — und die Rueckmutation auf die alte Policy liess dieselbe
 * Abfrage wieder 495 fremde Zeilen sehen.
 *
 * Run: node --test --test-force-exit test/auditMandantenGrenze.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");

/* ═══════════════════════════════════════════════════════════════════════════
 * Schicht 1 — die Schreibseite raet nicht mehr (laeuft immer)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Audit-Mandantengrenze — die Schreibseite", () => {
  const auditLogQuelle = fs.readFileSync(path.join(API, "services/auditLog.js"), "utf8");
  const auditWriteQuelle = fs.readFileSync(path.join(API, "middleware/auditWrite.js"), "utf8");

  it("es gibt einen zentralen Aufloeser statt eines Rueckfalls je Schreibstelle", () => {
    assert.match(auditLogQuelle, /export function bestimmeAuditOrg\(/,
      "bestimmeAuditOrg() fehlt — dann steht die Regel wieder verstreut in den Aufrufern");
  });

  it("keine Schreibstelle stempelt `req.orgId` ungeprueft", () => {
    /*
     * Der Riegel. Frueher stand an beiden Schreibstellen woertlich
     *     org_id: req.orgId || null            (middleware/auditWrite.js)
     *     org_id: params.org_id ?? req.orgId   (services/auditLog.js)
     * — und genau das erzeugte die 139 falsch gestempelten Zeilen. `req.orgId`
     * wird aufgeloest, BEVOR die Route laeuft; bei `/auth/login` also, bevor es
     * den angemeldeten Nutzer ueberhaupt gibt.
     *
     * Geprueft wird das Muster, nicht die Zeile: jede kuenftige Schreibstelle,
     * die `org_id` direkt aus `req.orgId` nimmt, faellt hier auf.
     */
    const verdaechtig = /org_id\s*:\s*(?:[^,\n]*\?\?\s*)?req\.orgId/;
    for (const [name, quelle] of [
      ["services/auditLog.js", auditLogQuelle],
      ["middleware/auditWrite.js", auditWriteQuelle],
    ]) {
      const treffer = quelle.split("\n")
        .map((z, i) => ({ z: z.trim(), nr: i + 1 }))
        .filter(({ z }) => verdaechtig.test(z) && !z.startsWith("*") && !z.startsWith("//"));
      assert.deepEqual(treffer.map((t) => `${name}:${t.nr}  ${t.z}`), [],
        `${name} stempelt die Organisation wieder aus dem Anfragekontext. ` +
        "Sie gehoert an die Quelle der Wahrheit — bestimmeAuditOrg() benutzen.");
    }
  });

  it("der Aufloeser bindet den Kontext an den Handelnden", async () => {
    const { bestimmeAuditOrg } = await import("../services/auditLog.js");

    // 1. Ausdruecklich uebergeben gewinnt — der Aufrufer kennt die Ressource.
    assert.equal(bestimmeAuditOrg({ orgId: "kontext" }, "wer", "aus-ressource"), "aus-ressource");

    // 2. Kontext zaehlt nur fuer denselben Handelnden.
    assert.equal(
      bestimmeAuditOrg({ orgId: "org-A", orgIdGiltFuerNutzer: "nutzer-1" }, "nutzer-1"),
      "org-A", "der eigene Kontext muss gestempelt werden");
    assert.equal(
      bestimmeAuditOrg({ orgId: "org-A", orgIdGiltFuerNutzer: "nutzer-VORHER" }, "nutzer-NEU"),
      null, "der Kontext des Vorgaengers darf NICHT gestempelt werden — das war der Befund");

    // 3. Ohne Vermerk lieber keine Org als die falsche.
    assert.equal(bestimmeAuditOrg({ orgId: "org-A" }, "wer"), null);

    // 4. Maschinen-Auth: die Org steht IM Schluessel und ist damit belegt.
    assert.equal(
      bestimmeAuditOrg({ orgId: "org-A", isApiKeyAuth: true }, null),
      "org-A", "SCIM/M2M haette sonst seine Organisation verloren");

    // 5. Kein Kontext, keine Org.
    assert.equal(bestimmeAuditOrg({}, "wer"), null);
    assert.equal(bestimmeAuditOrg(null, "wer"), null);
  });

  it("der Demo-Login erzeugt die Sitzung neu — sonst erbt er die fremde Org", () => {
    /*
     * `/auth/login` tut das seit SEC-001 gegen Session-Fixation; in
     * `routes/demo.js` fehlte es. Die Folge war groesser als Fixation: die alte
     * Sitzung behielt ihren `_orgCache`, und `req.orgId` zeigte fuer den
     * Demo-Nutzer auf die Organisation des Vorgaengers — nicht nur im Audit,
     * sondern in der Mandantengrenze von 45 Routen.
     */
    const demo = fs.readFileSync(path.join(API, "routes/demo.js"), "utf8");
    const regenerierung = demo.indexOf("session.regenerate");
    const eintragung = demo.indexOf("req.session.userId   = user.id");
    assert.ok(regenerierung !== -1, "routes/demo.js erzeugt die Sitzung nicht neu");
    assert.ok(eintragung !== -1, "die Stelle, an der der Demo-Nutzer gesetzt wird, hat sich verschoben");
    assert.ok(regenerierung < eintragung,
      "regenerate() muss VOR dem Eintragen des Demo-Nutzers stehen — danach ist es wirkungslos");
  });

  it("der Sitzungs-Zwischenspeicher gilt nur fuer seinen Nutzer", () => {
    const orgContext = fs.readFileSync(path.join(API, "middleware/orgContext.js"), "utf8");
    assert.match(orgContext, /_orgCache\?\.userId/,
      "orgContext prueft nicht mehr, FUER WEN der Zwischenspeicher aufgeloest wurde — " +
      "dann erbt jede uebernommene Sitzung wieder die Org ihres Vorgaengers");
    assert.match(orgContext, /userId: req\.session\.userId/,
      "der Zwischenspeicher wird ohne Nutzer geschrieben und ist damit nicht pruefbar");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Schicht 2 — die Abnahme gegen die echte Datenbank
 * ═══════════════════════════════════════════════════════════════════════════ */

const hatDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe("Audit-Mandantengrenze — die Abnahme", { skip: !hatDb }, () => {
  let pool = null;

  before(async () => {
    const { default: pg } = await import("pg");
    pool = new pg.Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
          }
    );
  });

  after(async () => { if (pool) await pool.end(); });

  it("prueft ueberhaupt etwas — sonst ist die Abnahme wertlos", async () => {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM audit_log");
    assert.ok(rows[0].n > 100, `nur ${rows[0].n} Audit-Zeilen — ist das die richtige Datenbank?`);
  });

  it("ABNAHME: keine Zeile traegt eine Organisation, in der ihr Akteur nie Mitglied war", async () => {
    /* Die Zahl, an der 8.1.1 gemessen wird. Sie stand am 2026-08-21 auf 139. */
    const { rows } = await pool.query(`
      SELECT al.action, count(*)::int AS n
      FROM audit_log al
      WHERE al.org_id IS NOT NULL AND al.actor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM org_memberships m
          WHERE m.user_id = al.actor_id AND m.org_id = al.org_id
        )
      GROUP BY al.action ORDER BY 2 DESC`);
    assert.deepEqual(rows, [],
      "Diese Aktionen stempeln wieder eine fremde Organisation. Die Schreibseite raet " +
      "irgendwo erneut aus dem Anfragekontext — bestimmeAuditOrg() umgangen?");
  });

  it("die Policy laesst org-lose Zeilen nicht mehr an jeden Mandanten durch", async () => {
    /*
     * `al_same_org` lautete `org_id = current_org_id() OR org_id IS NULL` und
     * zeigte damit JEDER Organisation alle org-losen Zeilen, sobald RLS die
     * Grenze ist — waehrend der Anwendungspfad (`al.org_id = $n`) sie korrekt
     * herausfiltert. Datenbank und Anwendung widersprachen sich.
     *
     * Nachgewiesen mit einer Nicht-Superuser-Rolle: mit der alten Policy sah
     * Org A 495 fremde Zeilen, mit der neuen 0.
     */
    const { rows } = await pool.query(`
      SELECT polname, pg_get_expr(polqual, polrelid) AS ausdruck
      FROM pg_policy WHERE polrelid = 'audit_log'::regclass ORDER BY polname`);
    const same = rows.find((r) => r.polname === "al_same_org");
    assert.ok(same, "die Policy al_same_org fehlt — dann gibt es keine Org-Grenze in der Datenbank");
    assert.ok(!/IS NULL/i.test(same.ausdruck),
      `al_same_org enthaelt wieder eine NULL-Ausnahme: ${same.ausdruck}\n` +
      "Damit sieht jede Organisation alle org-losen Zeilen.");
    assert.ok(rows.some((r) => r.polname === "al_staff_bypass"),
      "der Staff-Bypass fehlt — dann sieht das Staff Center die Plattformsicht nicht mehr");
  });

  it("RLS ist auf audit_log ueberhaupt aktiv", async () => {
    const { rows } = await pool.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'audit_log'::regclass");
    assert.equal(rows[0].relrowsecurity, true,
      "ohne aktives RLS ist die Policy oben ein Papiertiger");
  });

  it("jede org-lose Zeile hat einen Grund — keine faellt still hinten runter", async () => {
    /*
     * Die zweite Haelfte des Befunds. Eine Zeile darf org-los sein, wenn sie
     * keinen Akteur hat (Systemlauf) oder der Akteur keiner oder mehreren
     * Organisationen angehoert. Alles andere waere wieder eine Luecke in der
     * Nachvollziehbarkeit — der Admin, der die Zeile braucht, saehe sie nie.
     */
    const { rows } = await pool.query(`
      SELECT count(*)::int AS n FROM audit_log al
      WHERE al.org_id IS NULL
        AND al.actor_id IS NOT NULL
        AND (SELECT count(*) FROM org_memberships m WHERE m.user_id = al.actor_id) = 1`);
    assert.equal(rows[0].n, 0,
      `${rows[0].n} org-lose Zeile(n), deren Akteur genau EINER Organisation angehoert. ` +
      "Sie waeren eindeutig zuordenbar und sind in keinem Org-Audit sichtbar — " +
      "Migration 187 Schritt 2 nicht gelaufen, oder die Schreibseite laesst die Org wieder weg.");
  });
});

if (!hatDb) {
  describe("Audit-Mandantengrenze — Hinweis", () => {
    it("die Abnahme wurde NICHT geprueft (keine Datenbank)", () => {
      console.log(
        "    ℹ Schicht 2 (fremde_org = 0, RLS-Policy, org-lose Zeilen) uebersprungen — " +
        "DB_HOST ist nicht gesetzt. Im Container laeuft sie mit."
      );
      assert.ok(true);
    });
  });
}
