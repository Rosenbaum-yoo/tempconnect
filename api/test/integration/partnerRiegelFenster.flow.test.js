/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DER PARTNER-RIEGEL KENNT JETZT BEIDE FENSTERSEITEN (U6.7, DB-gebunden)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Freigabe 2026-10-01. Bis dahin prüfte der Riegel in `assignmentService`
 * `valid_until`, aber **nicht** `valid_from`: ein Pooleintrag mit einem Beginn in
 * der ZUKUNFT galt dort schon heute als Partnerschaft, während
 * `istLieferantImPool` (U6.2) ihn ablehnte. Zwei Wahrheiten über demselben Feld.
 *
 * WARUM DIESE DATEI DB-GEBUNDEN SEIN MUSS, obwohl daneben eine Form-Probe steht:
 * die Form-Probe (`test/wirkungDesEntfernens.test.js`) belegt, dass der Riegel
 * `poolBedingungenSql` AUFRUFT. Was sie grundsätzlich nicht kann: belegen, dass
 * Postgres daraus das Richtige rechnet. Ein Muster-Pool nimmt jede Abfrage an,
 * auch eine mit vertauschter Vergleichsrichtung. Genau hier entscheidet sich, ob
 * ein vordatierter Eintrag wirklich abgewiesen wird.
 *
 * DIE PROBE STELLT IHREN GEGENSTAND SELBST HER: `vendor_pool` hat **0 Zeilen**
 * (gemessen). „Ein vordatierter Eintrag wird abgewiesen" wäre damit leer grün —
 * wahr, weil es nie einen Eintrag gab. Jede Zeile wird hier angelegt und
 * zurückgerollt.
 *
 * UND SIE PRÜFT IN BEIDE RICHTUNGEN. Eine Zusicherung „wird abgewiesen" besteht
 * auch dann, wenn der Riegel ALLES abweist. Zu jedem abgewiesenen Fall gehört
 * deshalb ein gültiger, der durchkommt.
 *
 * Run: node --test --test-force-exit test/integration/partnerRiegelFenster.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { poolBedingungenSql } from "../../services/poolMitgliedschaftSql.js";
import { todayDE } from "../../utils/dateDE.js";

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

/* Eine Zusicherung, die IMMER läuft — sonst liefert die Datei ohne Datenbank
   `tests 0`, und das sieht im Tor aus wie Erfolg. */
describe("U6.7 — die Datei trägt auch ohne Datenbank eine Zahl", () => {
  it("die gemeinsame Bedingung ist importierbar und nennt beide Fensterseiten", () => {
    const sql = poolBedingungenSql({ kunde: "$1", lieferant: "$2", datum: "$3" });
    assert.match(sql, /valid_from/, "der Fensterbeginn fehlt");
    assert.match(sql, /valid_until/, "das Fensterende fehlt");
  });
});

describe("U6.7 — das Gültigkeitsfenster an echtem SQL", { skip: !hasDb && "keine Datenbank (DATABASE_URL / DB_HOST fehlt) — läuft im Container und in CI" }, () => {
  let pool;
  let client;
  let kunde;
  let lieferant;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    /* Zwei VORHANDENE Organisationen, damit keine Pflichtfelder geraten werden
       müssen — zwei Anläufe in U6.1 sind genau daran gescheitert, und zwar VOR
       dem eigentlichen Gegenstand. */
    const { rows } = await client.query("SELECT id FROM organizations ORDER BY id LIMIT 2");
    if (rows.length === 2) { kunde = rows[0].id; lieferant = rows[1].id; }
  });

  after(async () => {
    if (client) client.release();
    if (pool) await pool.end();
  });

  it("der Gegenstand ist da", () => {
    assert.ok(kunde && lieferant, "keine zwei Organisationen gefunden");
    assert.notEqual(kunde, lieferant);
  });

  /**
   * Legt eine Poolzeile mit dem gegebenen Fenster an und fragt die Bedingung —
   * genau den Text, den der Partner-Riegel benutzt. Rollt immer zurück.
   */
  async function gilt(fenster) {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO vendor_pool (client_org_id, supplier_org_id, status, tier, valid_from, valid_until)
         VALUES ($1, $2, 'active', 'SECONDARY', $3, $4)`,
        [kunde, lieferant, fenster.von ?? null, fenster.bis ?? null]
      );
      const { rows } = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM vendor_pool vp
            WHERE ${poolBedingungenSql({ kunde: "$1", lieferant: "$2", datum: "$3", alias: "vp" })}
         ) AS partner`,
        [kunde, lieferant, fenster.stichtag || todayDE()]
      );
      return rows[0].partner === true;
    } finally {
      await client.query("ROLLBACK");
    }
  }

  it("ein VORDATIERTER Eintrag gilt NICHT — das ist die Verengung aus U6.7", async () => {
    /* Der Fall, der vorher durchkam: Beginn in der Zukunft, Ende offen. */
    assert.equal(await gilt({ von: "2099-01-01", bis: null }), false,
      "ein Pooleintrag, der erst 2099 beginnt, gilt heute als Partnerschaft — " +
      "genau die Abweichung, die U6.7 schliessen sollte");
  });

  it("derselbe Eintrag gilt, sobald sein Beginn erreicht ist — die Gegenprobe", async () => {
    /*
     * OHNE DIESE HÄLFTE wäre die Zusicherung oben auch dann wahr, wenn der
     * Riegel ALLES abweist. Zwei Stichtage auf DERSELBEN Zeile: einen Tag vor
     * dem Beginn abgewiesen, am Beginn angenommen.
     */
    assert.equal(await gilt({ von: "2030-06-01", bis: null, stichtag: "2030-05-31" }), false,
      "am Tag VOR dem Beginn darf der Eintrag nicht gelten");
    assert.equal(await gilt({ von: "2030-06-01", bis: null, stichtag: "2030-06-01" }), true,
      "AM Tag des Beginns muss er gelten — die Grenze ist einschliessend");
  });

  it("ein abgelaufener Eintrag gilt nicht, ein offenes Fenster gilt", async () => {
    /* Die andere Fensterseite, die der Riegel schon vorher prüfte — mitgeprüft,
       damit eine Rückmutation daran nicht unbemerkt bleibt. */
    assert.equal(await gilt({ von: null, bis: "2020-01-01" }), false,
      "ein Eintrag, der 2020 endete, gilt heute noch");
    assert.equal(await gilt({ von: null, bis: null }), true,
      "ein Eintrag ohne Fenster ist unbegrenzt und muss gelten");
    assert.equal(await gilt({ von: "2020-01-01", bis: "2099-01-01" }), true,
      "ein Fenster, in dem HEUTE liegt, muss gelten");
  });

  it("am letzten Tag des Fensters gilt er noch", async () => {
    /* Beide Grenzen sind einschliessend. Ein Off-by-one hier kostet genau einen
       Tag — und zwar immer den, an dem jemand arbeitet. */
    assert.equal(await gilt({ von: "2030-01-01", bis: "2030-06-30", stichtag: "2030-06-30" }), true,
      "am letzten Tag muss er noch gelten");
    assert.equal(await gilt({ von: "2030-01-01", bis: "2030-06-30", stichtag: "2030-07-01" }), false,
      "einen Tag nach dem Ende darf er nicht mehr gelten");
  });

  it("der Stichtag wird GEBUNDEN — nicht aus der Server-Zeitzone genommen", async () => {
    /*
     * Der eigentliche Fund dieser Welle, als Verhaltensprobe. Vorher stand im
     * Riegel `CURRENT_DATE`, und gemessen pinnte NICHTS im Repo die Zeitzone der
     * Datenbank — sie kam vom Host. Migration 227 pinnt sie jetzt; hier wird
     * belegt, dass der Stichtag trotzdem von aussen kommt und wirkt.
     *
     * Beweisführung: dieselbe Zeile, zwei verschiedene Stichtage, zwei
     * verschiedene Antworten. Käme das Datum aus der Datenbank, wäre die Antwort
     * beide Male gleich.
     */
    const fenster = { von: "2030-01-01", bis: "2030-12-31" };
    assert.equal(await gilt({ ...fenster, stichtag: "2030-07-01" }), true);
    assert.equal(await gilt({ ...fenster, stichtag: "2029-07-01" }), false);
  });

  it("und die Zeitzone der Datenbank ist gepinnt, nicht geerbt (Migration 227)", async () => {
    /*
     * Gemessen vor U6.7a: NICHTS im Repo setzte sie — nicht docker-compose.yml
     * (TZ stand nur am api-Dienst), nicht sql/init.sql, keine Migration. Das
     * Europe/Berlin kam vom HOST. 57 Stellen im Korpus rechnen mit CURRENT_DATE.
     *
     * Die datenbankfreie Probe daneben (test/zeitzoneIstGepinnt.test.js) prüft die
     * Momentaufnahme; hier wird die laufende Datenbank gefragt, damit eine
     * veraltete Momentaufnahme nicht grün aussieht.
     */
    const { rows } = await client.query(
      `SELECT current_setting('TimeZone') AS zone,
              (CURRENT_DATE = (now() AT TIME ZONE 'Europe/Berlin')::date) AS deckt_sich,
              EXISTS (SELECT 1 FROM pg_db_role_setting s
                        JOIN pg_database d ON d.oid = s.setdatabase
                       WHERE d.datname = current_database() AND s.setrole = 0
                         AND 'TimeZone=Europe/Berlin' = ANY(s.setconfig)) AS im_katalog`
    );
    assert.equal(rows[0].zone, "Europe/Berlin",
      "die laufende Datenbank steht auf " + rows[0].zone);
    assert.equal(rows[0].deckt_sich, true,
      "CURRENT_DATE deckt sich nicht mit dem deutschen Kalendertag");
    assert.equal(rows[0].im_katalog, true,
      "die Zone steht NICHT im Katalog (pg_db_role_setting) — sie ist dann vom Host " +
      "geerbt und mit dem naechsten Container womoeglich eine andere. " +
      "Migration 227 anwenden.");
  });
});
