/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.3b — EIN MENSCH, EINE BINDUNG, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Muster-Pool-Proben pinnen den SQL-TEXT der Reservierung. Sie koennen ihn
 * nicht AUSFUEHREN — und genau darin lag der Fehler, den der Audit vom
 * 2026-09-24 gefunden hat: alle Proben waren gruen, und die Abnahme von M4c.3
 * ("Kraft buchen → beide Arten weg") war trotzdem nicht erfuellt. Sie prueften
 * den EIGENEN Begriff von gebunden (eine aktive Einsatz-Verknuepfung) statt den
 * des Owners ("ein Mensch, fuenfmal gebucht, waere Betrug").
 *
 * Diese Probe stellt die drei Ablaeufe her, die der Audit beschrieben hat, und
 * misst das VERHALTEN — in EINER Transaktion, die zurueckgerollt wird:
 *
 *   1. Eine Buchung bindet den Menschen. Seine uebrigen Darstellungen —
 *      weitere Einzelangebote, das Gesamtangebot — verschwinden aus dem Markt.
 *   2. Der Takt legt fuer einen gebuchten Platz keinen ZWILLING an. Vorher war
 *      'reserved' fuer sein NOT EXISTS kein belegter Platz: derselbe Mensch
 *      stand zweimal im Markt, einmal reserviert, einmal aktiv fuer alle.
 *   3. Die Wiederherstellung laeuft nicht in einen besetzten Platz. Vorher
 *      brach EINE kollidierende Zeile den mengenbasierten Lauf fuer die GANZE
 *      Plattform ab — und der Markt leerte sich alle 15 Minuten weiter.
 *
 * Datenbankgebunden: ohne DATABASE_URL (bzw. DB_HOST + POSTGRES_PASSWORD)
 * uebersprungen. Der Lauf nennt das ausdruecklich als Luecke im Nachweis.
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/bindungHaeltDenMarkt.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { sweepMarktpraesenz, BELEGENDE_ZUSTAENDE } from "../../services/marktpraesenzService.js";
import { sweepReservations } from "../../services/workerOfferReservationService.js";
import { runMarktTakt } from "../../services/marktTakt.js";

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

describe("M4c.3b — ein Mensch, eine Bindung, am realen Schema",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  /** Eine Kraft, die alle Praesenz-Bedingungen erfuellt — der Gegenstand. */
  let kraft = null;

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    /* Der Gegenstand wird nicht angenommen, sondern gesucht: eine aktive,
       praesente Kraft mit Ort, Agentur-Nutzer, mindestens zwei freigegebenen
       Katalog-Faehigkeiten und ohne laufende Bindung. Gibt es sie nicht, wird
       sichtbar uebersprungen statt gruen gemeldet. */
    const { rows } = await client.query(`
      SELECT wp.id, wp.supplier_org_id,
             (SELECT om.user_id FROM org_memberships om
               WHERE om.org_id = wp.supplier_org_id AND om.is_active AND om.role_key <> 'worker'
               ORDER BY om.created_at LIMIT 1) AS agentur_nutzer,
             ARRAY(SELECT ps.id FROM worker_profile_skills wps
                     JOIN platform_skills ps ON ps.id = wps.skill_id
                    WHERE wps.worker_profile_id = wp.id
                      AND ps.is_active AND ps.status = 'approved'
                    ORDER BY ps.name) AS skills
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

  /* Jede Probe bekommt ihren eigenen Sicherungspunkt: sie sehen einander nicht,
     und eine gescheiterte hinterlaesst der naechsten keinen halben Zustand.
     Danach wird der Ausgangszustand HERGESTELLT statt angenommen — die Kraft
     bringt aus dem Bestand offene Angebote mit, und der Eindeutigkeits-Index
     (Mig 145) laesst daneben keine zweite offene Zeile fuer denselben Platz zu.
     Ohne diesen Schritt misst die Probe den Bestand des Tages, nicht die Regel. */
  beforeEach(async () => {
    if (!kraft) return;
    await client.query("SAVEPOINT probe");
    await client.query(
      `UPDATE capacity_posts SET status = 'archived', is_active = FALSE
        WHERE worker_profile_id = $1 AND status IN ('draft', 'active', 'paused', 'reserved', 'filled')`,
      [kraft.id]);
  });
  afterEach(async () => { if (kraft) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  /** Legt ein aktives, personengebundenes Einzelangebot fuer eine Faehigkeit an. */
  async function angebotAnlegen(skillId, status = "active") {
    const { rows } = await client.query(`
      INSERT INTO capacity_posts (
        supplier_company_id, title, role, skill_tags, headcount,
        availability_from, location_city, status, is_active, org_id,
        worker_profile_id, primary_skill_id, offer_kind, quelle)
      SELECT $1, ps.name, ps.name, ARRAY[ps.name], 1,
             CURRENT_DATE, wp.city, $4, $4 <> 'archived', wp.supplier_org_id,
             wp.id, ps.id, 'single_skill', 'live_belegschaft'
        FROM worker_profiles wp, platform_skills ps
       WHERE wp.id = $2 AND ps.id = $3
      RETURNING id`, [kraft.agentur_nutzer, kraft.id, skillId, status]);
    return rows[0].id;
  }

  /** Bucht ein Angebot so, wie `accept-deal` es tut: angenommenes Angebot am Posten. */
  async function buchen(postenId) {
    const { rows: bedarf } = await client.query(`
      INSERT INTO demand_requests (requester_company_id, title, role, headcount, status, start_date, location_city)
      SELECT $1, 'Probe-Bedarf', 'Probe', 1, 'open', CURRENT_DATE, wp.city
        FROM worker_profiles wp WHERE wp.id = $2 RETURNING id`, [kraft.agentur_nutzer, kraft.id]);
    await client.query(`
      INSERT INTO offers (demand_request_id, supplier_company_id, capacity_post_id, status, offered_quantity)
      VALUES ($1, $2, $3, 'accepted', 1)`, [bedarf[0].id, kraft.agentur_nutzer, postenId]);
    await client.query("UPDATE capacity_posts SET status = 'reserved' WHERE id = $1", [postenId]);
  }

  const zustand = async (id) => (await client.query(
    "SELECT status, worker_reserved FROM capacity_posts WHERE id = $1", [id])).rows[0];

  /* Wie viele Zeilen BELEGEN den Platz dieser Kraft fuer diese Faehigkeit.
     Archivierte zaehlen bewusst nicht mit — sie belegen nichts, und
     `beforeEach` erzeugt sie. Die Liste kommt aus dem Dienst, nicht von Hand:
     eine Abschrift hier liesse die Probe stillschweigend etwas anderes messen
     als der Takt entscheidet. */
  const belegteZeilen = async (skillId) => (await client.query(
    `SELECT count(*)::int AS n FROM capacity_posts
      WHERE worker_profile_id = $1 AND primary_skill_id = $2
        AND offer_kind = 'single_skill'
        AND status = ANY($3::text[])`,
    [kraft.id, skillId, [...BELEGENDE_ZUSTAENDE]])).rows[0].n;

  it("es gibt eine Kraft, an der sich die Bindung zeigen laesst", (t) => {
    if (!kraft) t.skip("keine praesente Kraft mit >= 2 freigegebenen Katalog-Faehigkeiten");
    assert.ok(kraft);
  });

  it("eine BUCHUNG bindet den Menschen — seine uebrigen Angebote verschwinden", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    const gebucht = await angebotAnlegen(kraft.skills[0]);
    const anderes = await angebotAnlegen(kraft.skills[1]);

    /* Vor der Buchung ist das andere Angebot aktiv — sonst beweist der Rest nichts. */
    assert.equal((await zustand(anderes)).status, "active", "der Gegenstand war von Anfang an nicht aktiv");

    await buchen(gebucht);
    const r = await sweepReservations(client);

    const nachher = await zustand(anderes);
    assert.equal(nachher.status, "paused",
      "das zweite Angebot desselben Menschen bleibt nach der Buchung buchbar — er ist doppelt verkaeuflich");
    assert.equal(nachher.worker_reserved, true, "es wurde pausiert, aber nicht als reserviert markiert");
    assert.ok(r.reserved >= 1, `die Reservierung meldet ${r.reserved} statt mindestens 1`);
  });

  it("der Takt legt fuer einen gebuchten Platz KEINEN Zwilling an", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    const gebucht = await angebotAnlegen(kraft.skills[0]);
    await buchen(gebucht);

    const vorher = await client.query(
      `SELECT count(*)::int AS n FROM capacity_posts
        WHERE worker_profile_id = $1 AND primary_skill_id = $2 AND offer_kind = 'single_skill'`,
      [kraft.id, kraft.skills[0]]);
    await sweepMarktpraesenz(client);
    const nachher = await client.query(
      `SELECT count(*)::int AS n FROM capacity_posts
        WHERE worker_profile_id = $1 AND primary_skill_id = $2 AND offer_kind = 'single_skill'`,
      [kraft.id, kraft.skills[0]]);

    assert.equal(nachher.rows[0].n, vorher.rows[0].n,
      "der Takt hat fuer den gebuchten Platz eine zweite Zeile angelegt — derselbe Mensch steht zweimal im Markt");
  });

  it("ein GEBUNDENER Mensch bekommt auch fuer eine noch leere Faehigkeit nichts Neues", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    /*
     * Diese Probe trennt zwei Riegel, die sich sonst gegenseitig decken. Die
     * Rueckmutation "Takt legt auch fuer gebundene Menschen an" blieb gruen,
     * weil der ZWEITE Riegel (reserved belegt den Platz) denselben Fall fing —
     * aber nur fuer die gebuchte Faehigkeit. Fuer eine ANDERE Faehigkeit
     * desselben Menschen gibt es keine belegte Zeile, die schuetzen koennte:
     * dort haengt alles an `NOT gebunden`.
     *
     * Ohne ihn erschiene ein bereits verkaufter Mensch 15 Minuten spaeter mit
     * seiner zweiten Faehigkeit neu im Markt — als waere er frei.
     */
    const gebucht = await angebotAnlegen(kraft.skills[0]);
    await buchen(gebucht);

    /* Die zweite Faehigkeit hat KEINE belegende Zeile — der andere Riegel
       greift hier nicht. Archivierte zaehlen nicht mit: `beforeEach` hat den
       Bestand der Kraft archiviert, und archiviert belegt keinen Platz. */
    assert.equal(await belegteZeilen(kraft.skills[1]), 0,
      "die zweite Faehigkeit traegt schon eine belegende Zeile — die Probe pruefte den falschen Riegel");

    await sweepMarktpraesenz(client);

    assert.equal(await belegteZeilen(kraft.skills[1]), 0,
      "der Takt hat fuer einen bereits gebuchten Menschen ein neues Angebot angelegt — er ist wieder doppelt verkaeuflich");
  });

  it("eine BESETZTE Zeile schuetzt ihren Platz, auch wenn der Mensch frei ist", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    /*
     * Die Gegenrichtung zur Probe darueber, und der zweite der beiden Riegel.
     * Eine Zeile auf 'filled' traegt ein abgeschlossenes Geschaeft; der Mensch
     * selbst kann laengst wieder frei sein (der Einsatz ist vorbei, es gibt
     * keine Buchung mehr). `NOT gebunden` schuetzt hier also NICHT — der Platz
     * haengt allein daran, dass 'filled' als belegt zaehlt.
     *
     * Vorher zaehlten nur draft/active/paused. Der Takt legte daneben eine
     * zweite Zeile an — und wurde das Geschaeft danach storniert, kollidierte
     * die Rueckkehr des Originals mit dem Zwilling: 23505 mitten in der
     * Storno-Transaktion, die damit vollstaendig zurueckrollte.
     */
    const besetzt = await angebotAnlegen(kraft.skills[0]);
    await client.query("UPDATE capacity_posts SET status = 'filled' WHERE id = $1", [besetzt]);

    await sweepMarktpraesenz(client);

    /*
     * HIER AUSDRUECKLICH NICHT `belegteZeilen`. Diese Zusicherung handelt DAVON,
     * welche Zustaende einen Platz belegen — sie darf ihre Antwort nicht aus
     * derselben Liste beziehen, ueber die sie urteilt. Die erste Fassung tat
     * genau das und blieb bei der Rueckmutation gruen: nahm man 'filled' aus
     * `BELEGENDE_ZUSTAENDE`, hoerte die Probe auf, die besetzte Zeile
     * mitzuzaehlen, und die neu entstandene ergab wieder die erwartete Eins.
     *
     * Gemessen wird deshalb die WIRKUNG: der Takt legt immer 'active' an. Ist
     * danach eine aktive Zeile da, ist ein Zwilling entstanden — gleich, wie
     * irgendeine Liste im Dienst gerade aussieht.
     */
    const { rows: neu } = await client.query(
      `SELECT count(*)::int AS n FROM capacity_posts
        WHERE worker_profile_id = $1 AND primary_skill_id = $2
          AND offer_kind = 'single_skill' AND status = 'active'`,
      [kraft.id, kraft.skills[0]]);
    assert.equal(neu[0].n, 0,
      "neben der besetzten Zeile ist eine neue aktive entstanden — die Stornierung des Geschaefts wuerde daran scheitern");
  });

  it("die Wiederherstellung laeuft nicht in einen besetzten Platz — und bricht nichts ab", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    /* Der Ablauf aus dem Audit: das Auto-Angebot ist archiviert (Abwesenheit),
       die Agentur legt in der Zwischenzeit von Hand eine offene Zeile fuer
       dieselbe Kraft und dieselbe Faehigkeit an. */
    const archiviert = await angebotAnlegen(kraft.skills[0], "archived");
    const vonHand = await angebotAnlegen(kraft.skills[0], "draft");
    await client.query("UPDATE capacity_posts SET quelle = 'manuell' WHERE id = $1", [vonHand]);

    const ergebnis = await sweepMarktpraesenz(client);

    assert.equal((await zustand(archiviert)).status, "archived",
      "die archivierte Zeile wurde in einen besetzten Platz zurueckgeholt");
    assert.equal((await zustand(vonHand)).status, "draft", "die Zeile von Hand wurde angefasst");
    assert.ok(ergebnis.wiederherstellung_aufgehalten >= 1,
      "die aufgehaltene Wiederherstellung wird nicht gezaehlt — sie faellt lautlos aus");
  });

  it("zwei archivierte Zeilen desselben Platzes kehren NICHT gemeinsam zurueck", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    /* Genau der Bestand, der am 2026-09-24 gemessen wurde: Paare archivierter
       Auto-Zeilen je Faehigkeit. Ohne den Riegel setzte EINE Anweisung beide
       auf 'active' und scheiterte an sich selbst. */
    const a = await angebotAnlegen(kraft.skills[0], "archived");
    const b = await angebotAnlegen(kraft.skills[0], "archived");

    const ergebnis = await sweepMarktpraesenz(client);

    const zustaende = [(await zustand(a)).status, (await zustand(b)).status].sort();
    assert.deepEqual(zustaende, ["active", "archived"],
      `von zwei archivierten Zeilen desselben Platzes kamen ${JSON.stringify(zustaende)} zurueck — erwartet genau eine`);
    assert.ok(ergebnis.wiederhergestellt >= 1, "es kam gar keine zurueck");
  });

  it("der Takt laeuft beide Schritte — und ein gescheiterter haelt den anderen nicht auf", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    const ergebnis = await runMarktTakt(client);
    assert.deepEqual(ergebnis.fehler, [], `der Takt meldet Fehler: ${JSON.stringify(ergebnis.fehler)}`);
    assert.ok(ergebnis.marktpraesenz, "die Marktbefuellung lief nicht");
    assert.ok(ergebnis.reservierung, "die Reservierung lief nicht — genau das war der Befund F3");
  });

  it("zweimal laufen aendert nichts — der Takt ist folgenlos wiederholbar", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    await runMarktTakt(client);
    const zweiter = await runMarktTakt(client);
    assert.equal(zweiter.marktpraesenz.materialisiert, 0, "der zweite Lauf legt erneut an");
    assert.equal(zweiter.marktpraesenz.zurueckgenommen, 0, "der zweite Lauf nimmt erneut zurueck");
    assert.equal(zweiter.reservierung.reserved, 0, "der zweite Lauf reserviert erneut");
  });
});
