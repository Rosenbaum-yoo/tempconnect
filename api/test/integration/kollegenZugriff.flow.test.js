/**
 * D-M4 und D-M5 am REALEN Schema — die Zusammenarbeit innerhalb einer Firma.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Beide Owner-Entscheidungen vom 2026-08-20 WEITEN Zugriff:
 *
 *   D-M4 — `PATCH /requisitions/:id` band per `created_by`. Eine Kollegin durfte
 *          die Ausschreibung STORNIEREN (`transitionStatus` bindet nur per id),
 *          aber keinen Tippfehler im Titel korrigieren. Die Grenze ist jetzt
 *          die Organisation.
 *
 *   D-M5 — `marketplace` und `capacityExchange` prueften Namensgleichheit
 *          (`supplier_company_id !== req.session.userId`). Damit war der Deal
 *          bei Urlaub oder Personalwechsel fuer die Firma unerreichbar. Sie
 *          fragen jetzt `canAccessAsOwner`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM AM ECHTEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bei einer Weitung ist die interessante Frage nicht „geht es jetzt?", sondern
 * **„endet es dort, wo es enden muss?"** — und die kann ein Mock nicht
 * beantworten: er bestaetigt JEDE Mitgliedschaft, die man ihn fragt. Nur an
 * echten Zeilen laesst sich zeigen, dass der Arbeiter derselben Firma
 * draussenbleibt und die beiden Marktseiten getrennt bleiben.
 *
 * Der Mantel unten bildet den inneren Transaktionsblock von `withTransaction`
 * auf SICHERUNGSPUNKTE ab. Ohne das waere es ein verschachteltes BEGIN in der
 * Probe-Transaktion, und Postgres bricht ab (`CheckTransactionBlock`).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as reqSvc from "../../services/requisitionService.js";
import * as mpSvc from "../../services/marketplaceService.js";

/* Bewusst OHNE `./helpers.js`: dessen `createPool` kommt zusammen mit einem
 * Import von `../../app.js` — dem gesamten Express-Aufbau samt allen Routen und
 * Diensten. Diese Probe ruft aber nur zwei Dienstfunktionen auf. Den ganzen
 * Server dafuer hochzufahren macht den Test langsam, an fremden Teilen zerbrechlich
 * und in einem nackten `node`-Aufruf sogar unbenutzbar (er kehrt dort nicht zurueck).
 * Die Gatterbedingung ist dieselbe wie in helpers.js. */
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

describe("D-M4/D-M5 — Zusammenarbeit innerhalb einer Firma", { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {
  let pool;
  before(() => { pool = createPool(); });
  after(async () => { await pool?.end(); });

  /** Ein Mantel, der `withTransaction` in einer offenen Transaktion erlaubt. */
  function mantel(db) {
    let n = 0;
    return {
      query: (...a) => db.query(...a),
      connect: async () => {
        let tiefe = 0;
        return {
          query: async (text, ...rest) => {
            const wort = String(text).trim().toUpperCase();
            if (wort.startsWith("BEGIN"))    { tiefe++; return db.query(`SAVEPOINT tx${tiefe}`); }
            if (wort.startsWith("COMMIT"))   { const t = tiefe--; return db.query(`RELEASE SAVEPOINT tx${t}`); }
            if (wort.startsWith("ROLLBACK")) { const t = tiefe--; return db.query(`ROLLBACK TO SAVEPOINT tx${t}`); }
            return db.query(text, ...rest);
          },
          release() {}
        };
      },
      _n: () => ++n
    };
  }

  /** Baut die immer gleiche Kulisse: zwei Firmen, eine Agentur, ein Arbeiter. */
  async function kulisse(db) {
    const marke = `dm-${process.pid}-${process.hrtime.bigint()}`;
    const nutzer = async (kennung, rolle) => {
      const { rows: [u] } = await db.query(
        `INSERT INTO users (email, password_hash, role, company_name)
         VALUES ($1, 'x', $2, 'DM') RETURNING id`,
        [`${kennung}-${marke}@example.test`, rolle]);
      return u.id;
    };
    const org = async (kennung, typ) => {
      const { rows: [o] } = await db.query(
        "INSERT INTO organizations (name, slug, type) VALUES ($1,$2,$3) RETURNING id",
        [`DM ${kennung}`, `dm-${kennung}-${marke}`, typ]);
      return o.id;
    };
    const mitglied = (o, u, rolle) => db.query(
      "INSERT INTO org_memberships (org_id, user_id, role_key, is_active) VALUES ($1,$2,$3,TRUE)",
      [o, u, rolle]);

    const k = {
      kundeOrg: await org("kunde", "company"),
      agenturOrg: await org("agentur", "agency"),
      fremdOrg: await org("fremd", "company"),
      einkaeuferin: await nutzer("einkaeuferin", "company"),
      kollege: await nutzer("kollege", "company"),
      arbeiter: await nutzer("arbeiter", "worker"),
      fremder: await nutzer("fremder", "company"),
      disponent: await nutzer("disponent", "agency"),
      disKollegin: await nutzer("diskollegin", "agency")
    };
    await mitglied(k.kundeOrg, k.einkaeuferin, "owner");
    await mitglied(k.kundeOrg, k.kollege, "member");
    await mitglied(k.kundeOrg, k.arbeiter, "worker");
    await mitglied(k.fremdOrg, k.fremder, "owner");
    await mitglied(k.agenturOrg, k.disponent, "owner");
    await mitglied(k.agenturOrg, k.disKollegin, "member");
    return k;
  }

  async function inTransaktion(lauf) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await lauf(db, mantel(db), await kulisse(db));
    } finally {
      await db.query("ROLLBACK");
      db.release();
    }
  }

  it("D-M4: der Kollege darf die Ausschreibung eines anderen aendern", async () => {
    await inTransaktion(async (db, m, k) => {
      const { rows: [aus] } = await db.query(
        `INSERT INTO requisitions (org_id, created_by, title, role, status)
         VALUES ($1, $2, 'Urspruenglicher Titel', 'Lagerhelfer', 'DRAFT') RETURNING id`,
        [k.kundeOrg, k.einkaeuferin]);

      const geaendert = await reqSvc.updateRequisition(
        m, aus.id, k.kollege, { title: "Vom Kollegen korrigiert" }, k.kundeOrg);

      assert.ok(geaendert, "vor D-M4 war das NIE moeglich");
      assert.equal(geaendert.title, "Vom Kollegen korrigiert");
    });
  });

  it("D-M4: eine FREMDE Organisation aendert nichts", async () => {
    await inTransaktion(async (db, m, k) => {
      const { rows: [aus] } = await db.query(
        `INSERT INTO requisitions (org_id, created_by, title, role, status)
         VALUES ($1, $2, 'Unberuehrt', 'Lagerhelfer', 'DRAFT') RETURNING id`,
        [k.kundeOrg, k.einkaeuferin]);

      const versuch = await reqSvc.updateRequisition(
        m, aus.id, k.fremder, { title: "Uebernommen" }, k.fremdOrg);
      const { rows: [jetzt] } = await db.query(
        "SELECT title FROM requisitions WHERE id = $1", [aus.id]);

      assert.equal(versuch, null, "die Weitung reicht bis zur Org-Grenze und nicht weiter");
      assert.equal(jetzt.title, "Unberuehrt", "und der Titel bleibt stehen");
    });
  });

  it("D-M4: ohne Organisation im Kontext wird nicht geschrieben", async () => {
    await inTransaktion(async (db, m, k) => {
      const { rows: [aus] } = await db.query(
        `INSERT INTO requisitions (org_id, created_by, title, role, status)
         VALUES ($1, $2, 'Unberuehrt', 'Lagerhelfer', 'DRAFT') RETURNING id`,
        [k.kundeOrg, k.einkaeuferin]);

      assert.equal(
        await reqSvc.updateRequisition(m, aus.id, k.kollege, { title: "X" }, null), null,
        "sonst haette die Reparatur die Grenze nur auf einen weglassbaren Parameter verschoben"
      );
    });
  });

  async function angebot(db, k) {
    const { rows: [bedarf] } = await db.query(
      `INSERT INTO demand_requests (requester_company_id, title, role, status, headcount,
                                    start_date, location_city)
       VALUES ($1, 'Bedarf', 'Lagerhelfer', 'open', 2, CURRENT_DATE, 'Koeln') RETURNING id`,
      [k.einkaeuferin]);
    /* `offers` fuehrt KEIN requester_company_id — die Kundenseite kommt aus dem
       Join auf demand_requests (marketplaceService.js:728). Genau die Sorte
       Annahme, die ein Mock durchgehen liesse. */
    const { rows: [o] } = await db.query(
      `INSERT INTO offers (demand_request_id, supplier_company_id, status, offered_quantity)
       VALUES ($1, $2, 'sent', 2) RETURNING id`,
      [bedarf.id, k.disponent]);
    return o.id;
  }

  it("D-M5: die Kollegin der Kundenfirma darf ein Angebot annehmen", async () => {
    await inTransaktion(async (db, m, k) => {
      const ergebnis = await mpSvc.updateOfferStatus(m, await angebot(db, k), "accepted", k.kollege);
      assert.ok(!ergebnis.error, `erwartet: angenommen, bekommen: ${ergebnis.error}`);
    });
  });

  it("D-M5: der ARBEITER derselben Firma nicht — hier endet die Weitung", async () => {
    await inTransaktion(async (db, m, k) => {
      const ergebnis = await mpSvc.updateOfferStatus(m, await angebot(db, k), "accepted", k.arbeiter);
      assert.equal(ergebnis.error, "FORBIDDEN",
        "org_memberships fuehrt auch Arbeiter — sie duerfen keine Deals annehmen");
    });
  });

  it("D-M5: eine fremde Organisation ohnehin nicht", async () => {
    await inTransaktion(async (db, m, k) => {
      const ergebnis = await mpSvc.updateOfferStatus(m, await angebot(db, k), "accepted", k.fremder);
      assert.equal(ergebnis.error, "FORBIDDEN");
    });
  });

  it("D-M5: die beiden Marktseiten bleiben getrennt", async () => {
    /* Die wichtigste Gegenprobe. Die Weitung laeuft entlang der Organisation —
       sie darf NICHT dazu fuehren, dass die Kundenseite Handlungen der
       Lieferantenseite ausfuehren kann. */
    await inTransaktion(async (db, m, k) => {
      const id = await angebot(db, k);
      assert.equal(
        (await mpSvc.withdrawOffer(m, id, k.kollege)).error, "FORBIDDEN",
        "die Kundenseite darf das Angebot der Gegenseite nicht zurueckziehen"
      );
      assert.ok(
        !(await mpSvc.withdrawOffer(m, id, k.disKollegin)).error,
        "die Kollegin der Agentur schon"
      );
    });
  });
});
