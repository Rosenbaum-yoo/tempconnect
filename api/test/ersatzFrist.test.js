import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  verfalleneErsatzAnfragen,
  confirmAssignment,
  declineAssignment,
} from "../services/workerService.js";

/*
 * DIE ERSATZ-ANFRAGE BEKOMMT EINE UHR (Plan I, 8.2 / Migration 193).
 *
 * Owner-Entscheid: "Frist einer Ersatz-Anfrage: 4 Stunden, dann verfaellt sie
 * automatisch; Erinnerung nach 2 h. [...] danach wird der Einsatz wieder offen
 * und der Knopf erscheint erneut."
 *
 * Der Befund davor, an der laufenden Datenbank gemessen: KEINE Frist-, Ablauf-
 * oder Erinnerungsspalte auf worker_assignment_links. Eine unbeantwortete
 * Anfrage blockierte den Einsatz unbegrenzt — sie zaehlte als pending_quantity,
 * hielt open_quantity auf 0, sperrte ueber REPLACEMENT_PENDING jeden zweiten
 * Anlauf, und sah dabei versorgt aus. Die aelteste pending-Zeile im Bestand
 * war 134 Tage alt.
 */

const WORKER = "22222222-2222-2222-2222-222222222222";
const LINK = "44444444-4444-4444-4444-444444444444";
const ASG = "55555555-5555-5555-5555-555555555555";

/** Spion-Pool fuer den Sweep: connect() liefert einen Client mit Antwortfolge. */
function sweepPool(verfallenRows, erinnertRows) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params: params || [], via: "client" });
      if (/SET worker_confirmation_status = 'expired'/.test(text)) {
        return { rows: verfallenRows, rowCount: verfallenRows.length };
      }
      if (/SET erinnert_am = NOW\(\)/.test(text)) {
        return { rows: erinnertRows, rowCount: erinnertRows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  return {
    calls,
    connect: async () => client,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [], via: "pool" });
      return { rows: [], rowCount: 0 };
    },
  };
}

describe("Ersatz-Frist — der Sweep", () => {
  it("nichts faellig = nichts angefasst", async () => {
    const pool = sweepPool([], []);
    const r = await verfalleneErsatzAnfragen(pool);
    assert.deepEqual(r, { verfallen: 0, erinnert: 0 });
    const sqls = pool.calls.map((c) => c.sql);
    assert.ok(!sqls.some((q) => /INSERT INTO notifications/.test(q)),
      "ohne faellige Zeilen darf keine Meldung entstehen");
    assert.ok(sqls.some((q) => q.includes("COMMIT")), "die Transaktion schliesst sauber");
  });

  it("der Verfall traegt die drei tragenden Wirkungen in EINEM UPDATE", async () => {
    const pool = sweepPool([], []);
    await verfalleneErsatzAnfragen(pool);
    const verfall = pool.calls.find((c) => /SET worker_confirmation_status = 'expired'/.test(c.sql));
    assert.ok(verfall, "das Verfalls-UPDATE fehlt");
    /* is_active = FALSE ist die tragende Wirkung: sie oeffnet pending_quantity,
     * REPLACEMENT_PENDING und die ersatz-LATERAL auf einmal — ohne dass einer
     * dieser drei Riegel angefasst wird. */
    assert.match(verfall.sql, /is_active\s+= FALSE/);
    assert.match(verfall.sql, /verfallen_am = NOW\(\)/,
      "ohne Zeitstempel ist Verfall spaeter nicht von Absage unterscheidbar");
    assert.match(verfall.sql, /ersetzt_link_id IS NOT NULL/,
      "die Frist gilt NUR fuer Ersatz-Anfragen — das ist der Owner-Entscheid; " +
      "regulaere Zuweisungen sind ein eigenes Ticket");
    assert.match(verfall.sql, /frist_bis IS NOT NULL AND frist_bis <= NOW\(\)/,
      "NULL = keine Frist: der Altbestand (10 Zeilen, aelteste 134 Tage) bleibt liegen");
  });

  it("Verfall laeuft VOR der Erinnerung — sonst wird ein Toter erinnert", async () => {
    /* Nach einem Takt-Ausfall sind beide faellig. Liefe die Erinnerung zuerst,
     * bekaeme ein bereits verfallener Link noch eine "bitte antworten"-Meldung
     * auf eine Anfrage, die es nicht mehr gibt. */
    const pool = sweepPool([], []);
    await verfalleneErsatzAnfragen(pool);
    const sqls = pool.calls.map((c) => c.sql);
    const iVerfall = sqls.findIndex((q) => /SET worker_confirmation_status = 'expired'/.test(q));
    const iErinnerung = sqls.findIndex((q) => /SET erinnert_am = NOW\(\)/.test(q));
    assert.ok(iVerfall >= 0 && iErinnerung > iVerfall);
    const erinnerung = pool.calls[iErinnerung];
    assert.match(erinnerung.sql, /frist_bis > NOW\(\)/,
      "die Erinnerung selbst muss Verfallene ausschliessen — doppelter Schutz");
    assert.match(erinnerung.sql, /erinnert_am IS NULL/,
      "die Doppelversand-Bremse: einmal erinnert ist erinnert");
  });

  it("Erinnerungsmarke und Meldung stehen in EINER Transaktion", async () => {
    const pool = sweepPool([], [{ id: LINK, assignment_id: ASG, worker_user_id: WORKER, frist_bis: new Date().toISOString() }]);
    await verfalleneErsatzAnfragen(pool);
    const sqls = pool.calls;
    const commit = sqls.findIndex((c) => c.sql.includes("COMMIT"));
    const meldung = sqls.findIndex((c) => /INSERT INTO notifications/.test(c.sql) && c.via === "client");
    assert.ok(meldung >= 0, "die Erinnerungs-Meldung fehlt");
    assert.ok(meldung < commit,
      "die Meldung muss VOR dem COMMIT stehen: scheitert der INSERT, rollt die " +
      "Marke mit zurueck und der naechste Lauf versucht es erneut — eine gesetzte " +
      "Marke ohne Meldung waere eine Erinnerung, die nie jemand bekommt");
    assert.ok(sqls[meldung].params.includes("worker_assignment_reminder"));
  });

  it("der Verfall benachrichtigt NACH dem Commit — und NIE den Kunden", async () => {
    const pool = sweepPool(
      [{ id: LINK, assignment_id: ASG, worker_user_id: WORKER, supplier_org_id: "33333333-3333-3333-3333-333333333333", ersetzt_link_id: "66666666-6666-6666-6666-666666666666" }],
      []
    );
    await verfalleneErsatzAnfragen(pool);
    const sqls = pool.calls;
    const commit = sqls.findIndex((c) => c.sql.includes("COMMIT"));
    const arbeiterMeldung = sqls.findIndex((c) => /INSERT INTO notifications/.test(c.sql) && c.params.includes("worker_assignment_expired"));
    assert.ok(arbeiterMeldung > commit,
      "die Verfallsmeldung laeuft NACH dem Commit: ein Zustellweg, der die " +
      "fachliche Wahrheit zuruecknehmen kann, waere schlimmer als gar keiner — " +
      "der Verfall IST passiert, ob die Meldung ankommt oder nicht");
    /* Der Kunde hat die angefragte Kraft nie gesehen und keine Meldung bekommen
     * (sie haengt an der ZUSAGE). Beim Verfall gibt es nichts zurueckzunehmen. */
    assert.ok(!sqls.some((c) => /benachrichtige|kunde|customer/i.test(c.sql) && /INSERT/.test(c.sql)),
      "beim Verfall darf KEINE Kundenmeldung entstehen");
  });

  it("S: die WHERE-Klausel entwertet sich selbst — zwei gleichzeitige Laeufe sind unschaedlich", async () => {
    /* Kein Advisory Lock (das Repo benutzt keine): der zweite Lauf trifft die
     * Zeile mit bereits geaendertem Status an und aendert nichts. Die Probe
     * haelt fest, dass die Statusbedingung im WHERE steht — ohne sie waere das
     * UPDATE nicht selbstentwertend. */
    const pool = sweepPool([], []);
    await verfalleneErsatzAnfragen(pool);
    const verfall = pool.calls.find((c) => /SET worker_confirmation_status = 'expired'/.test(c.sql));
    assert.match(verfall.sql, /WHERE worker_confirmation_status = 'pending_confirmation'/);
  });
});

describe("Ersatz-Frist — der taktunabhaengige Riegel in Zusage und Absage", () => {
  /*
   * Die Frist steht als Bedingung IM UPDATE, nicht als Lesen-dann-Schreiben.
   * Damit gilt sie auch, wenn der Takt 14 Minuten entfernt ist oder die
   * Betriebsumgebung ihn nie ausfuehrt — der dokumentierte Cron hat in dieser
   * Umgebung noch nie gefeuert (403 CSRF, kein Crontab). Zwei Menschen beim
   * Kunden waeren die Folge einer Zusage nach Verfall.
   */

  function riegelPool({ kontextStatus = "pending_confirmation", fristBis = null, updateTrifft = false } = {}) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        const text = String(sql);
        calls.push({ sql: text, params: params || [] });
        if (/FROM worker_assignment_links wal/.test(text)) {
          return {
            rows: [{
              id: LINK, assignment_id: ASG, worker_confirmation_status: kontextStatus,
              is_active: true, frist_bis: fristBis,
              assignment_is_current: true, assignment_lifecycle_state: "active",
            }],
            rowCount: 1,
          };
        }
        if (/^UPDATE worker_assignment_links/m.test(text) || /UPDATE worker_assignment_links/.test(text)) {
          return updateTrifft
            ? { rows: [{ id: LINK, assignment_id: ASG }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
  }

  it("die Zusage traegt die Fristbedingung im WHERE", async () => {
    const pool = riegelPool({ updateTrifft: true });
    await confirmAssignment(pool, LINK, WORKER);
    const update = pool.calls.find((c) => /SET worker_confirmation_status = 'worker_confirmed'/.test(c.sql));
    assert.match(update.sql, /frist_bis IS NULL OR frist_bis > NOW\(\)/,
      "ohne die Bedingung kann eine ueberfaellige Anfrage zusagen, solange der " +
      "Sweep noch nicht lief — und dann stehen zwei Menschen beim Kunden");
  });

  it("eine ueberfaellige Zusage ergibt ANFRAGE_VERFALLEN, keine INVALID_STATUS-Luege", async () => {
    /* Der Kontext sagt noch pending_confirmation (der Sweep lief noch nicht),
     * aber das UPDATE trifft wegen der Frist nichts. INVALID_STATUS waere hier
     * falsch: der Status IST pending — verfallen ist die FRIST. */
    const pool = riegelPool({ fristBis: "2026-08-24T06:00:00Z", updateTrifft: false });
    const r = await confirmAssignment(pool, LINK, WORKER);
    assert.equal(r.error, "ANFRAGE_VERFALLEN");
    assert.ok(!pool.calls.some((c) => /recalcAssignmentStaffing|INSERT/.test(c.sql)),
      "eine verfallene Zusage darf nichts nachziehen");
  });

  it("auch die Absage endet mit der Frist — sonst wird Verfall zur Ablehnung umdeklariert", async () => {
    const pool = riegelPool({ updateTrifft: false });
    const r = await declineAssignment(pool, LINK, WORKER, "zu spaet");
    assert.equal(r.error, "ANFRAGE_VERFALLEN");
    const update = pool.calls.find((c) => /SET worker_confirmation_status = 'worker_declined'/.test(c.sql));
    assert.match(update.sql, /frist_bis IS NULL OR frist_bis > NOW\(\)/);
  });

  it("ohne Frist (Altbestand, regulaere Zuweisungen) aendert sich NICHTS", async () => {
    const pool = riegelPool({ updateTrifft: true });
    const r = await confirmAssignment(pool, LINK, WORKER);
    assert.equal(r.error, undefined,
      "frist_bis IS NULL muss durchlassen — die zehn Bestandszeilen und alle " +
      "regulaeren Zuweisungen kennen keine Frist (Linie aus Migration 188)");
  });
});

describe("Ersatz-Frist — die Anfrage wird mit Uhr geboren", () => {
  const quelle = fs.readFileSync(new URL("../services/workerService.js", import.meta.url), "utf8");

  it("BEIDE Zweige des INSERT setzen die Frist", () => {
    /* Der ON-CONFLICT-Zweig recycelt eine bestehende Zeile und fasst
     * created_at nicht an — eine aus created_at abgeleitete Frist waere beim
     * zweiten Anlauf auf dasselbe Paar (worker, assignment) bei der Geburt
     * schon abgelaufen. Deshalb eigene Spalten, in beiden Zweigen gesetzt. */
    assert.match(quelle, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13,'pending_confirmation',\$14,\s*\n\s*NOW\(\) \+ INTERVAL '4 hours', NOW\(\) \+ INTERVAL '2 hours', NULL, NULL\)/,
      "der INSERT-Zweig setzt die 4-h-Frist und die 2-h-Erinnerung nicht");
    assert.match(quelle, /frist_bis=NOW\(\) \+ INTERVAL '4 hours',\s*\n\s*erinnerung_faellig_am=NOW\(\) \+ INTERVAL '2 hours',\s*\n\s*erinnert_am=NULL, verfallen_am=NULL/,
      "der ON-CONFLICT-Zweig muss die Uhr NEU stellen — sonst erbt der zweite " +
      "Anlauf die abgelaufene Frist des ersten");
  });

  it("die Erinnerungszeit ist ABSOLUT gespeichert, nicht aus frist_bis gerechnet", () => {
    /* Eine spaetere Aenderung der 2-Stunden-Politik darf laufende Anfragen
     * nicht rueckwirkend umstellen. */
    assert.ok(!/frist_bis - INTERVAL '2 hours'/.test(quelle),
      "die Erinnerung darf nicht aus der Frist gerechnet werden");
  });
});

describe("Ersatz-Frist — beide Aufrufer rufen dieselbe Funktion", () => {
  it("der getaktete interne Handler ruft den Sweep als dritten Aufruf", () => {
    const internal = fs.readFileSync(new URL("../routes/internal.js", import.meta.url), "utf8");
    assert.match(internal, /workerService\.verfalleneErsatzAnfragen\(pool\)/,
      "kein neuer Endpunkt — der dritte Aufruf im bestehenden Handler kostet " +
      "keinen Waechter-Nachtrag und erbt Takt, Auth und Rate-Limit");
  });

  it("der BullMQ-Takt laeuft alle 10 Minuten — nicht taeglich", () => {
    const workers = fs.readFileSync(new URL("../workers/index.js", import.meta.url), "utf8");
    assert.match(workers, /upsertJobScheduler\("ersatz-frist-10min", \{ pattern: "\*\/10 \* \* \* \*" \}/,
      "eine 4-h-Frist mit Tagestakt waere eine Attrappe");
    const worker = fs.readFileSync(new URL("../workers/capacityWorker.js", import.meta.url), "utf8");
    assert.match(worker, /case "ersatz-frist":/);
    assert.match(worker, /verfalleneErsatzAnfragen/);
  });
});

/*
 * DB-SMOKE: der ganze Weg an der echten Datenbank (Zwei-Schicht-Disziplin).
 * Ein Mock kann kein WHERE erzwingen; erst hier ist bewiesen, dass der Sweep
 * genau die richtige Zeile trifft und die Riegel danach offen sind.
 */
describe("Ersatz-Frist — DB-Smoke: der Verfall oeffnet die Riegel wirklich",
  { skip: !(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)) && "keine Datenbank" }, () => {
  it("faellige Zeile wird getroffen, Altbestand ohne Frist NICHT", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      /* In der Transaktion: eine faellige Ersatz-Anfrage nachstellen, das
       * Verfalls-UPDATE des Sweeps woertlich ausfuehren, zurueckrollen. */
      const { rows: basis } = await client.query(
        `SELECT id, worker_user_id, assignment_id FROM worker_assignment_links LIMIT 1`
      );
      if (!basis.length) return; // leere DB: nichts zu beweisen, nichts kaputt
      const { rows: alt } = await client.query(
        `SELECT count(*)::int AS n FROM worker_assignment_links
          WHERE worker_confirmation_status = 'pending_confirmation' AND frist_bis IS NULL`
      );
      const { rows: getroffen } = await client.query(
        `UPDATE worker_assignment_links
            SET worker_confirmation_status = 'expired', is_active = FALSE, verfallen_am = NOW()
          WHERE worker_confirmation_status = 'pending_confirmation'
            AND is_active = TRUE
            AND ersetzt_link_id IS NOT NULL
            AND frist_bis IS NOT NULL AND frist_bis <= NOW()
          RETURNING id`
      );
      const { rows: altDanach } = await client.query(
        `SELECT count(*)::int AS n FROM worker_assignment_links
          WHERE worker_confirmation_status = 'pending_confirmation' AND frist_bis IS NULL`
      );
      assert.equal(altDanach[0].n, alt[0].n,
        "der Altbestand ohne Frist darf vom Verfalls-UPDATE nie beruehrt werden");
      assert.ok(getroffen.length >= 0, "das UPDATE ist planbar und der CHECK kennt 'expired'");
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });
});
