/**
 * Die Empfaenger der Produkt-Mails gegen die ECHTE Datenbank (Versand in Paketen, 2026-10-01).
 *
 * WARUM ES DIESE PROBE GIBT
 * Seit dem Versand in Paketen bestimmt EINE Abfrage die Fakten aller Nutzer
 * (`productReleaseService.EMPFAENGER_SQL`), statt je Nutzer `getUserAndPlan`
 * zu rufen. Die Tarifregel ist dieselbe Funktion (`effektiverPlan`), aber die
 * FAKTEN liest die Abfrage selbst — Mitgliedschaft, Organisationstarif,
 * Pilotstatus, juengstes Abo. Liest sie eines davon anders als `getUserAndPlan`,
 * bekommt jemand eine Mail, die ihm in der App nicht angezeigt wird (oder
 * umgekehrt), und kein Muster-Pool merkt das: er nimmt jede Abfrage an.
 *
 * Diese Probe vergleicht deshalb fuer JEDEN Nutzer, den die Abfrage liefert,
 * den Kontext aus der Abfrage mit dem aus `loadReleaseContext` (also ueber
 * `getUserAndPlan`). Ohne Datenbank laeuft sie nicht — die Form- und
 * Bindungsproben in `test/produktUpdateVersand.test.js` sind ihr Gegenstueck
 * ohne Datenbank.
 *
 * ALLES IN EINER TRANSAKTION, DIE ZURUECKGEROLLT WIRD: `getUserAndPlan`
 * SCHREIBT (es schliesst faellige Kuendigungen ab). Genau das ist einer der
 * Gruende, warum der Versand es nicht mehr benutzt.
 *
 * Run: DATABASE_URL=… node --test --test-force-exit test/integration/produktUpdateEmpfaenger.flow.test.js
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as svc from "../../services/productReleaseService.js";
import * as versand from "../../services/produktUpdateVersandService.js";
import { getUserAndPlan } from "../../services/userService.js";
import { mailNotieren } from "../../services/mailProtokollService.js";

const hasDb = !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));
const createPool = () => new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB || process.env.DB_NAME
      }
);

describe("Produkt-Mails: die Empfaenger-Abfrage liest dieselben Fakten wie getUserAndPlan",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;

  /** Die Faelle, die die Regel unterscheiden muss — in der Transaktion angelegt, danach weg. */
  const F = {};

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const nr = Date.now().toString(36);
    const org = async (typ, plan, pilot) => (await client.query(
      `INSERT INTO organizations (name, slug, type, plan, pilot_status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`Probe ${typ} ${plan} ${pilot}`, `probe-pu-${nr}-${typ}-${plan}-${pilot}`.toLowerCase(), typ, plan, pilot]
    )).rows[0].id;
    const nutzer = async (name, rolle, { orgId = null, demo = false, email = null } = {}) => (await client.query(
      `INSERT INTO users (role, email, password_hash, is_demo, org_id) VALUES ($1, $2, 'x', $3, $4) RETURNING id`,
      [rolle, email || `pu-${name}-${nr}@probe.tempconnect.test`, demo, orgId]
    )).rows[0].id;
    const mitglied = (userId, orgId, rolle, { aktiv = true, vorTagen = 0 } = {}) => client.query(
      `INSERT INTO org_memberships (user_id, org_id, role_key, is_active, created_at)
       VALUES ($1, $2, $3, $4, NOW() - make_interval(days => $5))`,
      [userId, orgId, rolle, aktiv, vorTagen]
    );
    /* `created_at` liegt 30 Tage zurueck, wie im Betrieb. Ohne das trueben zwei Abos
     * derselben Transaktion (das gekuendigte und das DEMO-Abo, das getUserAndPlan beim
     * Abschliessen anlegt) denselben Zeitstempel, und `ORDER BY created_at DESC`
     * waehlt zufaellig — gemessen am 2026-10-01: die Probe meldete dann PRO statt DEMO. */
    const abo = (userId, plan, status, cancelAt = null) => client.query(
      `INSERT INTO subscriptions (user_id, plan, status, cancel_at, created_at)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '30 days')`,
      [userId, plan, status, cancelAt]
    );

    const plus = await org("company", "PLUS", "eligible");
    const pilot = await org("agency", "BASIS", "active");
    const demoOrg = await org("company", "DEMO", "eligible");

    // 1. Die Organisation geht vor dem Abo.
    F.orgVorAbo = await nutzer("orgvorabo", "company", { orgId: plus });
    await mitglied(F.orgVorAbo, plus, "owner");
    await abo(F.orgVorAbo, "PRO", "active");
    // 2. Aktiver Pilot -> INDIVIDUELL.
    F.pilot = await nutzer("pilot", "agency", { orgId: pilot });
    await mitglied(F.pilot, pilot, "admin");
    // 3. Faellige Kuendigung ohne Organisation -> DEMO (getUserAndPlan schreibt dabei).
    F.gekuendigt = await nutzer("gekuendigt", "company");
    await abo(F.gekuendigt, "PRO", "canceling", new Date(Date.now() - 86400000));
    // 4. Ohne eigene Organisation zaehlt die AELTESTE aktive Mitgliedschaft.
    F.aelteste = await nutzer("aelteste", "company");
    await mitglied(F.aelteste, demoOrg, "member", { vorTagen: 2 });
    await mitglied(F.aelteste, plus, "finance", { vorTagen: 1 });
    // 5. Eigene Organisation, dort aber nicht (mehr) aktiv -> keine Mitgliedschaft, Abo zaehlt.
    F.inaktivDort = await nutzer("inaktivdort", "company", { orgId: plus });
    await mitglied(F.inaktivDort, plus, "member", { aktiv: false });
    await mitglied(F.inaktivDort, demoOrg, "member");
    await abo(F.inaktivDort, "BASIS", "active");
    // 6. Plattform-Admin ueber die Mitgliedschaft -> intern.
    F.intern = await nutzer("intern", "worker", { orgId: plus });
    await mitglied(F.intern, plus, "platform_admin");
    // Gegenproben: diese duerfen gar nicht erst auftauchen.
    F.demo = await nutzer("demo", "company", { demo: true });
    F.anonym = await nutzer("anonym", "company", { email: `deleted_${nr.slice(0, 8)}@anonymized.local` });
  });

  after(async () => {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    if (pool) await pool.end();
  });

  it("die Abfrage laeuft am echten Schema (Postgres plant sie vollstaendig)", async () => {
    const { rows } = await client.query(svc.EMPFAENGER_SQL, ["product_updates", "%@anonymized.local", null, 1]);
    assert.ok(Array.isArray(rows));
  });

  /** Alle Zeilen der Abfrage, seitenweise wie im Dienst. */
  async function alleZeilen() {
    const alle = [];
    let nach = null;
    for (;;) {
      const { rows } = await client.query(svc.EMPFAENGER_SQL, ["product_updates", "%@anonymized.local", nach, 1000]);
      alle.push(...rows);
      if (rows.length < 1000) return alle;
      nach = rows[rows.length - 1].id;
    }
  }

  it("die angelegten Faelle tauchen auf — Demo und anonymisiert nicht (Gegenprobe)", async () => {
    const ids = new Set((await alleZeilen()).map((z) => String(z.id)));
    for (const k of ["orgVorAbo", "pilot", "gekuendigt", "aelteste", "inaktivDort", "intern"]) {
      assert.ok(ids.has(String(F[k])), `${k} fehlt in der Abfrage`);
    }
    assert.equal(ids.has(String(F.demo)), false, "ein Demo-Konto ist kein Empfaenger");
    assert.equal(ids.has(String(F.anonym)), false, "ein anonymisiertes Konto ist kein Empfaenger");
  });

  it("die Faelle ergeben den erwarteten Tarif", async () => {
    const zeilen = new Map((await alleZeilen()).map((z) => [String(z.id), z]));
    const ctx = (k) => svc.kontextAusZeile(zeilen.get(String(F[k])));
    assert.equal(ctx("orgVorAbo").plan, "PLUS");
    assert.equal(ctx("pilot").plan, "INDIVIDUELL");
    assert.equal(ctx("gekuendigt").plan, "DEMO");
    assert.equal(ctx("aelteste").plan, "DEMO", "die aeltere Mitgliedschaft (DEMO-Organisation) gewinnt");
    assert.equal(ctx("aelteste").orgRole, "member");
    assert.equal(ctx("inaktivDort").plan, "BASIS");
    assert.equal(ctx("inaktivDort").orgRole, null);
    assert.equal(ctx("intern").isInternalViewer, true);
  });

  it("fuer jeden Nutzer derselbe Kontext wie ueber getUserAndPlan", async () => {
    const jetzt = new Date();
    // Die angelegten Faelle zuerst, dann hoechstens 500 weitere — getUserAndPlan
    // kostet je Nutzer etwa sieben Abfragen.
    const alle = await alleZeilen();
    const eigene = new Set(Object.values(F).map(String));
    const rows = [...alle.filter((z) => eigene.has(String(z.id))), ...alle.filter((z) => !eigene.has(String(z.id))).slice(0, 500)];
    assert.ok(rows.length >= 6, "ohne die angelegten Faelle vergliche diese Probe nichts");
    const abweichend = [];
    for (const z of rows) {
      const ausAbfrage = svc.kontextAusZeile(z, jetzt);
      const ueberGup = await svc.loadReleaseContext(client, z.id, (id) => getUserAndPlan(client, id));
      const a = { userRole: ausAbfrage.userRole, orgRole: ausAbfrage.orgRole, plan: ausAbfrage.plan, intern: ausAbfrage.isInternalViewer };
      const b = { userRole: ueberGup.userRole, orgRole: ueberGup.orgRole, plan: ueberGup.plan, intern: ueberGup.isInternalViewer };
      if (JSON.stringify(a) !== JSON.stringify(b)) abweichend.push({ id: z.id, abfrage: a, getUserAndPlan: b });
    }
    assert.deepEqual(abweichend.slice(0, 10), [],
      `${abweichend.length} von ${rows.length} Nutzern bekaemen einen anderen Kontext als in der App`);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * DER VERSAND SELBST AM ECHTEN SCHEMA (gefunden am laufenden System, 2026-10-01)
 * ═══════════════════════════════════════════════════════════════════════════
 * Zwei Fehler hat erst die Live-Pruefung gezeigt, und beide haette jeder
 * Muster-Pool fuer immer durchgelassen:
 *   - `abschliessen` scheiterte bei JEDEM Empfaenger: PostgreSQL leitete fuer
 *     `$3` zwei Typen ab (Spaltenwert und Vergleich). Nach der ersten Mail warf
 *     das Paket — ausgerechnet die Sicherung „hoechstens einmal" hat dabei
 *     verhindert, dass etwas doppelt rausging.
 *   - `mailNotieren` (M1.3) scheiterte bei JEDEM Aufruf an `$5 IS NULL` ohne
 *     Typ; der catch machte daraus eine Warnung. Die Tabelle `mail_versand` war
 *     leer, seit es sie gibt.
 * Diese Probe fuehrt deshalb jede Abfrage des Versands einmal wirklich aus.
 */
describe("Produkt-Mails: der Versandzyklus am echten Schema",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  let rel;
  const nutzer = [];

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const nr = Date.now().toString(36);
    rel = (await client.query(
      `INSERT INTO product_release_entries (title, summary, visibility, status, published_at)
       VALUES ('Probe Paketversand', 'Kurz', 'public', 'published', NOW() - INTERVAL '1 minute') RETURNING id`
    )).rows[0].id;
    for (const name of ["a", "b", "c", "d"]) {
      nutzer.push((await client.query(
        `INSERT INTO users (role, email, password_hash) VALUES ('company', $1, 'x') RETURNING id`,
        [`pv-${name}-${nr}@probe.tempconnect.test`]
      )).rows[0].id);
    }
  });

  after(async () => {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    if (pool) await pool.end();
  });

  it("einfrieren: einmal, ohne Dubletten; der zweite Start friert nichts ein", async () => {
    const erst = await versand.versandEinfrieren(client, rel, [...nutzer, nutzer[0]]);
    assert.deepEqual(erst, { gestartet: true, eingereiht: 4 });
    const zweit = await versand.versandEinfrieren(client, rel, nutzer);
    assert.deepEqual(zweit, { gestartet: false, grund: "SCHON_GESTARTET" });
  });

  it("ein Paket: gesendet, abgelehnt (erneut), abgemeldet (entfallen) — und der Stand stimmt", async () => {
    await client.query(
      `INSERT INTO notification_preferences (user_id, event_category, channel_in_app, channel_email)
       VALUES ($1, 'product_updates', TRUE, FALSE)`, [nutzer[2]]);
    const antworten = new Map([[nutzer[0], true], [nutzer[1], false], [nutzer[3], true]]);
    const kopfzeilen = [];
    const r = await versand.paketSenden(client, rel, {
      schluessel: "probe-schluessel", baseUrl: "https://tempconnect.de", groesse: 10,
      sendMail: async (_to, _s, _h, opts) => {
        kopfzeilen.push(opts.headers["List-Unsubscribe"]);
        const id = /u=([^&]+)/.exec(opts.headers["List-Unsubscribe"])[1];
        return antworten.get(decodeURIComponent(id));
      }
    });
    assert.equal(r.gesendet, 2);
    assert.equal(r.erneut, 1);
    assert.equal(r.entfallen, 1);
    assert.equal(kopfzeilen.length, 3, "an den Abbesteller geht nichts");

    const stand = (await versand.versandStaende(client, [{ id: rel, email_sent_at: new Date().toISOString(), status: "published" }])).get(String(rel));
    assert.equal(stand.gesamt, 4);
    assert.equal(stand.gesendet, 2);
    assert.equal(stand.offen, 1);
    assert.equal(stand.entfallen, 1);
    assert.equal(stand.fertig, false);
  });

  it("der Takt findet die Mitteilung; Anhalten trifft nur Offenes", async () => {
    const { rows } = await client.query(
      `SELECT e.release_id FROM product_release_mail_empfaenger e
         JOIN product_release_entries r ON r.id = e.release_id AND r.status = 'published'
        WHERE e.status = 'offen' AND e.release_id = $1`, [rel]);
    assert.equal(rows.length, 1);
    assert.equal(await versand.versandAnhalten(client, rel), 1);
    const z = (await client.query(
      `SELECT status, COUNT(*)::int AS n FROM product_release_mail_empfaenger WHERE release_id = $1 GROUP BY 1 ORDER BY 1`, [rel])).rows;
    assert.deepEqual(z, [{ status: "entfallen", n: 2 }, { status: "gesendet", n: 2 }]);
  });

  it("das Versandprotokoll schreibt wirklich (M1.3) — mit und ohne Fehlertext", async () => {
    assert.equal(await mailNotieren(client, { zweck: "produkt-update", ergebnis: "zugestellt", weg: "smtp" }), true);
    assert.equal(await mailNotieren(client, { zweck: "produkt-update", ergebnis: "fehlgeschlagen", weg: "smtp", fehler: "550 nein" }), true);
    const { rows } = await client.query(
      `SELECT versucht, zugestellt, fehlgeschlagen, letzter_fehler FROM mail_versand WHERE zweck = 'produkt-update' ORDER BY tag DESC LIMIT 1`);
    assert.ok(rows[0].versucht >= 2);
    assert.ok(rows[0].zugestellt >= 1);
    assert.ok(rows[0].fehlgeschlagen >= 1);
    assert.equal(rows[0].letzter_fehler, "550 nein");
  });
});
