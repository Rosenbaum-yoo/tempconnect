/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.1 — DAS GESAMTANGEBOT ENTSTEHT MIT, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe: "bei 10 Skills 10 Angebote plus eines fuer alle Skills". Der
 * Takt erzeugte bis M4c.1 nur die Einzelangebote; Buendel gab es nur, wenn ein
 * Mensch sie von Hand anlegte — gemessen am 2026-09-24 zwei auf der ganzen
 * Plattform, beide Entwuerfe, also im Markt unsichtbar.
 *
 * Ein Buendel traegt eine MOMENTAUFNAHME: die Zahl im Titel, die Liste der
 * Faehigkeiten, die Leitfaehigkeit. Deshalb pruefen diese Ablaeufe nicht nur,
 * DASS es entsteht, sondern dass es nicht LUEGT:
 *
 *   entstehen     Kraft mit N >= 2 freigegebenen Faehigkeiten -> genau ein Buendel
 *   nachfuehren   Faehigkeit dazu oder weg -> Titel, Liste und Rolle ziehen nach
 *   zuruecknehmen unter zwei Faehigkeiten -> das Buendel verschwindet
 *   nicht doppeln ein offenes Buendel (auch ein handgemachtes) haelt den Platz
 *   nicht luegen  ein gebundener Mensch bekommt keines
 *
 * Datenbankgebunden: ohne DATABASE_URL uebersprungen. Der Lauf nennt das
 * ausdruecklich als Luecke im Nachweis.
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/gesamtangebotEntstehtMit.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { sweepMarktpraesenz } from "../../services/marktpraesenzService.js";
import { buendelTitel } from "../../services/buendelTitel.js";
import { buildBundleOfferData } from "../../services/capacityOfferGeneratorService.js";

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

/*
 * DER UEBERSPRUNG IST SICHTBAR, und das ist eine Korrektur:
 *
 * Hier stand `describe(..., { skip: !hasDb })`. Eine uebersprungene GRUPPE
 * meldet `tests 0, skipped 0` — die Datei erscheint im Tor weder als Zahl noch
 * als Luecke. Gemessen am 2026-09-26 in der Gegenpruefung: genau deshalb blieben
 * Rueckmutationen gruen, die das Verhalten grob verletzen. Ein stiller Uebersprung
 * ist kein gruenes Ergebnis.
 *
 * Jede Probe ueberspringt sich jetzt SELBST. Der Lauf zaehlt sie dann als
 * `skipped`, und die Luecke steht im Ergebnis. Die Zusicherungen selbst sind
 * unveraendert; was sich aendert, ist die Sichtbarkeit ihres Fehlens.
 */
describe("M4c.1 — das Gesamtangebot entsteht mit, am realen Schema", () => {

  let pool;
  let client;
  let kraft = null;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT wp.id, wp.supplier_org_id,
             (SELECT om.user_id FROM org_memberships om
               WHERE om.org_id = wp.supplier_org_id AND om.is_active AND om.role_key <> 'worker'
               ORDER BY om.created_at LIMIT 1) AS agentur_nutzer,
             ARRAY(SELECT ps.id FROM worker_profile_skills wps
                     JOIN platform_skills ps ON ps.id = wps.skill_id
                    WHERE wps.worker_profile_id = wp.id
                      AND ps.is_active AND ps.status = 'approved'
                    ORDER BY wps.is_primary DESC, ps.name) AS skills
        FROM worker_profiles wp
       WHERE wp.is_active
         AND wp.marktpraesenz_deaktiviert IS NOT TRUE
         AND NULLIF(btrim(COALESCE(wp.city, ' ')), '') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM worker_absences wa
                          WHERE wa.worker_profile_id = wp.id AND wa.zustand = 'wirksam'
                            AND wa.aufgehoben_am IS NULL AND wa.von <= CURRENT_DATE
                            AND (wa.bis IS NULL OR wa.bis >= CURRENT_DATE))
         AND NOT EXISTS (SELECT 1 FROM worker_assignment_links wal
                           JOIN worker_profiles w2 ON w2.id = wp.id
                          WHERE wal.worker_user_id = w2.user_id AND wal.is_active)
       ORDER BY cardinality(ARRAY(SELECT 1 FROM worker_profile_skills wps
                                    JOIN platform_skills ps ON ps.id = wps.skill_id
                                   WHERE wps.worker_profile_id = wp.id
                                     AND ps.is_active AND ps.status = 'approved')) DESC
       LIMIT 1`);
    const k = rows[0];
    if (k && k.agentur_nutzer && Array.isArray(k.skills) && k.skills.length >= 2) kraft = k;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  /* Der Ausgangszustand wird HERGESTELLT, nicht angenommen: die Kraft bringt aus
     dem Bestand offene Angebote mit, und der Eindeutigkeits-Index laesst daneben
     kein zweites offenes Buendel zu. Ohne diesen Schritt misst die Probe den
     Bestand des Tages statt der Regel. */
  beforeEach(async () => {
    if (!kraft) return;
    await client.query("SAVEPOINT probe");
    await client.query(
      `UPDATE capacity_posts SET status = 'archived', is_active = FALSE
        WHERE worker_profile_id = $1 AND status IN ('draft', 'active', 'paused', 'reserved', 'filled')`,
      [kraft.id]);
  });
  afterEach(async () => { if (kraft) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  /** Die offenen Buendel dieser Kraft, mit ihrem Inhalt. */
  const buendel = async () => (await client.query(
    `SELECT id, title, role, skill_tags, primary_skill_id, worker_category, quelle, status
       FROM capacity_posts
      WHERE worker_profile_id = $1 AND offer_kind = 'bundle'
        AND status IN ('draft', 'active', 'paused')
      ORDER BY created_at`, [kraft.id])).rows;

  /** Nimmt der Kraft eine Faehigkeit weg (innerhalb des Sicherungspunkts). */
  const faehigkeitWeg = (skillId) => client.query(
    "DELETE FROM worker_profile_skills WHERE worker_profile_id = $1 AND skill_id = $2",
    [kraft.id, skillId]);

  it("es gibt eine Kraft mit mindestens zwei freigegebenen Faehigkeiten", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) t.skip("keine praesente Kraft mit >= 2 freigegebenen Katalog-Faehigkeiten");
    assert.ok(kraft);
  });

  it("N Faehigkeiten ergeben N Einzelangebote UND genau EIN Gesamtangebot", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    const n = kraft.skills.length;

    const ergebnis = await sweepMarktpraesenz(client);

    const einzel = await client.query(
      `SELECT count(*)::int AS n FROM capacity_posts
        WHERE worker_profile_id = $1 AND offer_kind = 'single_skill'
          AND status IN ('draft', 'active', 'paused')`, [kraft.id]);
    assert.equal(einzel.rows[0].n, n, `${n} Faehigkeiten ergaben ${einzel.rows[0].n} Einzelangebote`);

    const b = await buendel();
    assert.equal(b.length, 1, `erwartet genau ein Gesamtangebot, gefunden ${b.length}`);
    assert.equal(ergebnis.buendel_materialisiert, 1, "der Takt meldet die Anlage nicht");
    assert.equal(b[0].quelle, "live_belegschaft", "das Gesamtangebot traegt nicht die Herkunft der Automatik");
    assert.equal(b[0].status, "active",
      "ein Entwurf waere im Markt unsichtbar — die Automatik IST die Veroeffentlichung");
    /*
     * DAS GERADE ANGELEGTE BUENDEL MUSS SCHON RICHTIG SEIN.
     *
     * Diese Zeile ist nach einer ueberlebenden Rueckmutation entstanden: ersetzt
     * man im Anlegen den geteilten Titel durch eine Abschrift, bleibt alles
     * gruen — denn das Nachfuehren laeuft im SELBEN Lauf danach, sieht die
     * Abweichung und schreibt den richtigen Titel hinein. Die Selbstheilung ist
     * eine gute Eigenschaft, aber sie verdeckt, dass die Anlage etwas anderes
     * schreibt als das Nachfuehren erwartet — und beim naechsten Umbau faellt
     * das niemandem auf.
     *
     * Gemessen wird deshalb: ein frisch angelegtes Buendel gibt dem Nachfuehren
     * NICHTS zu tun.
     */
    assert.equal(ergebnis.buendel_nachgefuehrt, 0,
      "das gerade angelegte Gesamtangebot musste sofort nachgefuehrt werden — "
      + "die Anlage schreibt einen anderen Inhalt, als das Nachfuehren erwartet");
  });

  it("ein GEBUCHTES Gesamtangebot haelt den Platz — auch wenn der Index es nicht sieht", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    /*
     * Der Eindeutigkeits-Index (Mig 220) deckt nur draft/active/paused. Ein
     * GEBUCHTES Buendel steht auf 'reserved' und faellt damit aus dem Index —
     * dort ist das `NOT EXISTS` der Anlage der EINZIGE Riegel. Ohne ihn legte
     * der Takt neben dem verkauften Buendel ein zweites aktives an, und bei der
     * Stornierung kollidierte die Rueckkehr des Originals (derselbe Ablauf, den
     * Audit-Befund F4 fuer die Einzelangebote beschreibt).
     *
     * Eine Rueckmutation ohne diese Probe blieb gruen: der Index fing den Fall
     * der OFFENEN Zeilen, und `ON CONFLICT DO NOTHING` verschluckte ihn
     * geraeuschlos.
     */
    await client.query(`
      INSERT INTO capacity_posts (
        supplier_company_id, title, role, skill_tags, headcount, availability_from,
        location_city, status, is_active, org_id, worker_profile_id, offer_kind, quelle)
      SELECT $1, 'Gebuchtes Buendel', 'Gebucht', ARRAY['x']::text[], 1, CURRENT_DATE,
             wp.city, 'reserved', TRUE, wp.supplier_org_id, wp.id, 'bundle', 'live_belegschaft'
        FROM worker_profiles wp WHERE wp.id = $2`, [kraft.agentur_nutzer, kraft.id]);

    const ergebnis = await sweepMarktpraesenz(client);

    const alle = await client.query(
      `SELECT count(*)::int AS n FROM capacity_posts
        WHERE worker_profile_id = $1 AND offer_kind = 'bundle' AND status = 'active'`, [kraft.id]);
    assert.equal(alle.rows[0].n, 0,
      "neben dem gebuchten Gesamtangebot ist ein aktives entstanden — derselbe Mensch ist zweimal verkaeuflich");
    assert.equal(ergebnis.buendel_materialisiert, 0,
      "der Takt meldet eine Anlage, obwohl der Platz besetzt ist");
  });

  it("Titel und Liste des Gesamtangebots sind dieselben wie auf dem Weg von Hand", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    await sweepMarktpraesenz(client);
    const [b] = await buendel();
    assert.ok(b, "kein Gesamtangebot entstanden");

    /* Gegen die JS-Fassung gehalten, nicht gegen eine Abschrift: beide Wege
       setzen die Bestandteile aus `buendelTitel.js` ein, und genau das wird hier
       gemessen — an denselben Faehigkeiten muessen sie denselben Titel ergeben. */
    assert.equal(b.title, buendelTitel(kraft.skills.length),
      "der Takt und die Hand vergeben verschiedene Titel");

    const namen = await client.query(
      `SELECT ps.name::text AS name FROM worker_profile_skills wps
         JOIN platform_skills ps ON ps.id = wps.skill_id
        WHERE wps.worker_profile_id = $1 AND ps.is_active AND ps.status = 'approved'
        ORDER BY wps.is_primary DESC, ps.name`, [kraft.id]);
    const erwartet = namen.rows.map((r) => r.name);
    assert.deepEqual(b.skill_tags, erwartet, "die Liste der Faehigkeiten weicht ab");
    assert.equal(b.role, erwartet[0],
      "die Leitfaehigkeit ist eine andere als auf dem Weg von Hand (is_primary DESC, dann Name)");

    const vonHand = buildBundleOfferData({
      worker: { id: kraft.id, city: "x", postal_code: null },
      skills: erwartet.map((name, i) => ({ skill_id: `s${i}`, name, category: null, is_primary: i === 0 })),
      orgId: kraft.supplier_org_id
    });
    assert.equal(b.title, vonHand.title, "Takt und Erzeuger vergeben verschiedene Titel");
    assert.deepEqual(b.skill_tags, vonHand.skill_tags, "Takt und Erzeuger vergeben verschiedene Listen");
  });

  it("faellt eine Faehigkeit weg, zieht das Gesamtangebot nach", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft || kraft.skills.length < 3) return t.skip("weniger als drei Faehigkeiten");
    await sweepMarktpraesenz(client);
    const [vorher] = await buendel();
    assert.equal(vorher.title, buendelTitel(kraft.skills.length));

    await faehigkeitWeg(kraft.skills[kraft.skills.length - 1]);
    const ergebnis = await sweepMarktpraesenz(client);

    const [nachher] = await buendel();
    assert.equal(nachher.id, vorher.id, "es entstand ein neues Buendel statt das vorhandene nachzufuehren");
    assert.equal(nachher.title, buendelTitel(kraft.skills.length - 1),
      "der Titel wirbt weiter mit der alten Zahl — genau die Luege, die das Nachfuehren verhindert");
    assert.equal(nachher.skill_tags.length, kraft.skills.length - 1, "die Liste wurde nicht nachgefuehrt");
    assert.ok(ergebnis.buendel_nachgefuehrt >= 1, "der Takt meldet das Nachfuehren nicht");
  });

  it("unter zwei Faehigkeiten verschwindet das Gesamtangebot", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    await sweepMarktpraesenz(client);
    assert.equal((await buendel()).length, 1, "kein Gesamtangebot zum Zurueckziehen");

    /* Bis auf eine alle weg — ein "Allround-Kraft mit 1 Faehigkeit" ist keines. */
    for (const s of kraft.skills.slice(1)) await faehigkeitWeg(s);
    const ergebnis = await sweepMarktpraesenz(client);

    assert.equal((await buendel()).length, 0,
      "das Gesamtangebot steht weiter im Markt, obwohl nur eine Faehigkeit uebrig ist");
    assert.ok(ergebnis.buendel_zurueckgenommen >= 1, "der Takt meldet die Ruecknahme nicht");
  });

  it("ein Gesamtangebot VON HAND haelt den Platz — der Takt legt kein zweites an", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    await client.query(`
      INSERT INTO capacity_posts (
        supplier_company_id, title, role, skill_tags, headcount, availability_from,
        location_city, status, is_active, org_id, worker_profile_id, offer_kind, quelle)
      SELECT $1, 'Von Hand', 'Von Hand', ARRAY['x']::text[], 1, CURRENT_DATE,
             wp.city, 'draft', TRUE, wp.supplier_org_id, wp.id, 'bundle', 'manuell'
        FROM worker_profiles wp WHERE wp.id = $2`, [kraft.agentur_nutzer, kraft.id]);

    const ergebnis = await sweepMarktpraesenz(client);

    const b = await buendel();
    assert.equal(b.length, 1, `neben dem handgemachten Buendel entstand ein zweites (${b.length} offen)`);
    assert.equal(b[0].quelle, "manuell", "das handgemachte Buendel wurde ersetzt statt respektiert");
    assert.equal(b[0].title, "Von Hand", "der Takt hat ein fremdes Buendel ueberschrieben");
    assert.equal(ergebnis.buendel_materialisiert, 0, "der Takt meldet eine Anlage, die es nicht geben darf");
  });

  it("ein GEBUNDENER Mensch bekommt kein Gesamtangebot", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    /* Gebucht heisst gebunden (M4c.3b). Ohne diesen Riegel erschiene ein bereits
       verkaufter Mensch 15 Minuten spaeter mit einem Gesamtangebot neu im Markt —
       und das Gesamtangebot ist die Darstellung, die KEINE Buchung verbraucht. */
    const { rows: [posten] } = await client.query(`
      INSERT INTO capacity_posts (
        supplier_company_id, title, role, skill_tags, headcount, availability_from,
        location_city, status, is_active, org_id, worker_profile_id, primary_skill_id,
        offer_kind, quelle)
      SELECT $1, 'Gebucht', 'Gebucht', ARRAY['x']::text[], 1, CURRENT_DATE,
             wp.city, 'active', TRUE, wp.supplier_org_id, wp.id, $3, 'single_skill', 'live_belegschaft'
        FROM worker_profiles wp WHERE wp.id = $2 RETURNING id`,
      [kraft.agentur_nutzer, kraft.id, kraft.skills[0]]);
    const { rows: [bedarf] } = await client.query(`
      INSERT INTO demand_requests (requester_company_id, title, role, headcount, status, start_date, location_city)
      SELECT $1, 'Probe-Bedarf', 'Probe', 1, 'open', CURRENT_DATE, wp.city
        FROM worker_profiles wp WHERE wp.id = $2 RETURNING id`, [kraft.agentur_nutzer, kraft.id]);
    await client.query(`
      INSERT INTO offers (demand_request_id, supplier_company_id, capacity_post_id, status, offered_quantity)
      VALUES ($1, $2, $3, 'accepted', 1)`, [bedarf.id, kraft.agentur_nutzer, posten.id]);

    const ergebnis = await sweepMarktpraesenz(client);

    assert.equal((await buendel()).length, 0,
      "ein gebuchter Mensch hat ein Gesamtangebot bekommen — er ist wieder doppelt verkaeuflich");
    assert.equal(ergebnis.buendel_materialisiert, 0, "der Takt meldet eine Anlage fuer einen gebundenen Menschen");
  });

  it("zweimal laufen legt kein zweites an und schreibt nichts neu", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    await sweepMarktpraesenz(client);
    const [erst] = await buendel();
    const zweiter = await sweepMarktpraesenz(client);

    assert.equal(zweiter.buendel_materialisiert, 0, "der zweite Lauf legt ein weiteres Gesamtangebot an");
    assert.equal(zweiter.buendel_nachgefuehrt, 0,
      "der zweite Lauf schreibt ohne Aenderung — `updated_at` und damit die Feed-Sortierung springen dauernd");
    assert.equal(zweiter.buendel_zurueckgenommen, 0, "der zweite Lauf nimmt das eben Angelegte zurueck");
    const [nachher] = await buendel();
    assert.equal(nachher.id, erst.id, "das Gesamtangebot wurde ersetzt");
  });
});
