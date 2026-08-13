/**
 * Gate E2 gegen das REALE Schema — Abwesenheit gehoert zum Menschen.
 *
 * WARUM ES DIESEN ZWEITEN TEST BRAUCHT
 * test/workerAbwesenheit.test.js sichert ueber einen Mock-Pool ab, WELCHE
 * Statements laufen und wie ihre Fehler behandelt werden. Was ein Mock
 * grundsaetzlich nicht kann: einen Constraint erzwingen. Er kann nur bestaetigen,
 * dass der Code auf 23P01 richtig reagiert — nicht, dass Postgres 23P01
 * ueberhaupt wirft. Genau das ist aber die Zusage von Welle E2:
 *
 *   "Ein Test belegt, dass sich zwei ueberlappende Abwesenheiten nicht anlegen
 *    lassen."
 *
 * Diese Datei belegt sie an der echten Datenbank — inklusive der Feinheiten, an
 * denen ein Teil-Index gescheitert waere: verschiedene Starttage mit
 * Ueberschneidung, ein offenes Ende, und zwei luecklos aneinander grenzende
 * Zeitraeume, die ERLAUBT bleiben muessen.
 *
 * Der zweite Teil des Gates — "laesst sich fuer einen Mitarbeiter OHNE laufenden
 * Einsatz erfassen und erscheint in der Live-Belegschaft" — wird am haertesten
 * denkbaren Fall geprueft: einem Profil ganz OHNE Benutzerkonto (Mig 175).
 * Haette die Abwesenheit am Konto gehangen, waere dieser Mensch unsichtbar.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool, createSupplierOrg } from "./helpers.js";
import * as svc from "../../services/workerAbsenceService.js";
import { getWorkerLiveBoard } from "../../services/workforceService.js";
import { resolveAvailability } from "../../services/workerAvailabilityService.js";
import { checkOfferCoverage } from "../../services/capacityOfferMatchService.js";

describe("Welle E2 — Abwesenheit am realen Schema", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let orgA;
  let orgB;
  let profilOhneKonto;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    orgA = await createSupplierOrg(pool, "E2 Testagentur A");
    orgB = await createSupplierOrg(pool, "E2 Testagentur B");

    // Der harte Fall: erfasst, aber nie eingeladen. user_id IS NULL ist seit
    // Mig 175 erlaubt, verlangt aber eine Personalnummer.
    const { rows } = await pool.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name, personnel_number)
       VALUES (NULL, $1, 'Erika', 'Ohnekonto', $2)
       RETURNING id`,
      [orgA, `E2-${Date.now()}`]
    );
    profilOhneKonto = rows[0].id;
  });

  after(async () => {
    if (!hasDb || !pool) return;
    await pool.query("DELETE FROM worker_absences WHERE supplier_org_id = ANY($1::uuid[])", [[orgA, orgB]]).catch(() => {});
    await pool.query("DELETE FROM worker_profiles WHERE supplier_org_id = ANY($1::uuid[])", [[orgA, orgB]]).catch(() => {});
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [[orgA, orgB]]).catch(() => {});
    await pool.end();
  });

  it("ein Mitarbeiter OHNE Konto und OHNE Einsatz laesst sich abmelden", async () => {
    const res = await svc.createAbsence(pool, orgA, {
      workerProfileId: profilOhneKonto, art: "krank", von: heute(), bis: null, notiz: "Gate E2"
    });
    assert.ok(res.absence, res.error || "Abwesenheit wurde nicht angelegt");
    assert.strictEqual(res.absence.art, "krank");
    assert.strictEqual(res.absence.supplier_org_id, orgA, "die Org kommt aus dem Profil, nicht aus der Anfrage");
  });

  it("und erscheint sofort in der Live-Belegschaft — der zweite Teil des Gates", async () => {
    const board = await getWorkerLiveBoard(pool, orgA);
    const zeile = board.workers.find((w) => w.id === profilOhneKonto);

    assert.ok(zeile, "das Profil steht auf der Tafel");
    assert.strictEqual(zeile.live_status, "abwesend",
      "ohne laufenden Einsatz waere die Zeile frueher 'verfuegbar' gewesen — genau die Luecke aus E1");
    assert.strictEqual(zeile.absence_art, "krank");
    assert.strictEqual(zeile.absence_bis, null, "offenes Ende bleibt offen");
    assert.strictEqual(board.kpis.abwesend, 1);
    assert.strictEqual(board.kpis.abwesend_nach_art.krank, 1);
  });

  it("zwei ueberlappende Abwesenheiten lassen sich nicht anlegen (Gate E2)", async () => {
    // Anderer Starttag, trotzdem Ueberschneidung: an dieser Stelle waere ein
    // Teil-Index auf (worker_profile_id, von) gruen geblieben.
    const res = await svc.createAbsence(pool, orgA, {
      workerProfileId: profilOhneKonto, art: "urlaub", von: plusTage(3), bis: plusTage(9)
    });
    assert.strictEqual(res.error, "ABSENCE_OVERLAP");
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.conflict?.art, "krank", "der blockierende Eintrag wird benannt");
  });

  it("das offene Ende sperrt auch weit in der Zukunft — bis es beendet wird", async () => {
    const res = await svc.createAbsence(pool, orgA, {
      workerProfileId: profilOhneKonto, art: "termin", von: plusTage(200), bis: plusTage(200)
    });
    assert.strictEqual(res.error, "ABSENCE_OVERLAP",
      "'krank ab heute, Ende offen' ist ein nach oben unbegrenzter Bereich — das ist die ehrliche Lesart");
  });

  it("nach dem Zuruecknehmen ist derselbe Zeitraum wieder frei", async () => {
    const { rows } = await pool.query(
      `SELECT id FROM worker_absences
        WHERE worker_profile_id = $1 AND aufgehoben_am IS NULL ORDER BY von ASC LIMIT 1`,
      [profilOhneKonto]
    );
    const aufgehoben = await svc.cancelAbsence(pool, orgA, rows[0].id, { userId: null, grund: "Test" });
    assert.ok(aufgehoben.absence);
    assert.ok(aufgehoben.absence.aufgehoben_am, "die Zeile bleibt bestehen, sie wird nur entwertet");

    const neu = await svc.createAbsence(pool, orgA, {
      workerProfileId: profilOhneKonto, art: "urlaub", von: heute(), bis: plusTage(5)
    });
    assert.ok(neu.absence, "die Sperre gilt nur fuer gueltige Eintraege — sonst blockierte ein Irrtum fuer immer");

    // Ein zweites Zuruecknehmen ist kein stiller Erfolg.
    const nochmal = await svc.cancelAbsence(pool, orgA, rows[0].id, { userId: null });
    assert.strictEqual(nochmal.error, "ALREADY_CANCELLED");
  });

  it("luecklos aneinander grenzende Zeitraeume bleiben erlaubt", async () => {
    // bis = letzter Abwesenheitstag; der Folgetag ist frei. Waere die Sperre auf
    // '[)' gebaut, kollidierten diese beiden — und ein Urlaub direkt im Anschluss
    // an eine Krankmeldung waere nicht erfassbar.
    const res = await svc.createAbsence(pool, orgA, {
      workerProfileId: profilOhneKonto, art: "termin", von: plusTage(6), bis: plusTage(6)
    });
    assert.ok(res.absence, res.error || "der Folgetag muss frei sein");
  });

  it("eine fremde Agentur kann weder erfassen noch lesen", async () => {
    const res = await svc.createAbsence(pool, orgB, {
      workerProfileId: profilOhneKonto, art: "krank", von: plusTage(400)
    });
    assert.strictEqual(res.error, "ORG_BOUNDARY_VIOLATION");
    assert.strictEqual(res.status, 403);

    const liste = await svc.listAbsences(pool, orgB, { workerProfileId: profilOhneKonto });
    assert.deepEqual(liste.items, [], "keine Zeile, kein Name, kein Grund");

    const board = await getWorkerLiveBoard(pool, orgB);
    assert.strictEqual(board.kpis.abwesend, 0);
  });

  it("die Liste liest die Akte inklusive zurueckgenommener Eintraege", async () => {
    const nurGueltige = await svc.listAbsences(pool, orgA, { workerProfileId: profilOhneKonto });
    const mitAkte = await svc.listAbsences(pool, orgA, { workerProfileId: profilOhneKonto, mitAufgehobenen: true });
    assert.ok(mitAkte.total > nurGueltige.total,
      "der Zeitstrahl aus Welle E5 braucht auch das, was zurueckgenommen wurde");
    assert.ok(mitAkte.items.every((z) => z.first_name === "Erika"), "der Mensch haengt an der Zeile");
  });

  it("ein Ende vor dem Beginn weist die Datenbank ebenfalls ab, nicht nur der Service", async () => {
    await assert.rejects(
      () => pool.query(
        `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von, bis)
         VALUES ($1, $2, 'urlaub', $3::date, $4::date)`,
        [profilOhneKonto, orgA, plusTage(900), plusTage(890)]
      ),
      (err) => err.code === "23514",
      "der CHECK haelt auch dann, wenn jemand am Service vorbei schreibt"
    );
  });

  it("die redundante Org kann nicht driften — der zusammengesetzte Fremdschluessel haelt", async () => {
    await assert.rejects(
      () => pool.query(
        `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von)
         VALUES ($1, $2, 'krank', $3::date)`,
        [profilOhneKonto, orgB, plusTage(950)]
      ),
      (err) => err.code === "23503",
      "ein Profil aus Org A mit der Org B in derselben Zeile darf nicht existieren"
    );
  });
});

/* ── Die zweite Wahrheit darf keine Schattenwahrheit werden ────────────────
 * Welle E2 hat eine neue Verfuegbarkeits-Quelle eingefuehrt. Wer sie nicht
 * liest, bietet einen krank gemeldeten Menschen weiter einem Kunden an. Beide
 * Leser bekommen deshalb einen Smoke gegen das ECHTE Schema — ein vertippter
 * Alias in einem LATERAL faellt im Mock nie auf. */

describe("Welle E2 — die neue Quelle wird ueberall gelesen", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let org;
  let profil;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    org = await createSupplierOrg(pool, "E2 Leser-Test");
    const { rows } = await pool.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name, personnel_number)
       VALUES (NULL, $1, 'Lese', 'Test', $2) RETURNING id`,
      [org, `E2L-${Date.now()}`]
    );
    profil = rows[0].id;
    await pool.query(
      `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von, bis)
       VALUES ($1, $2, 'krank', CURRENT_DATE - 1, CURRENT_DATE + 4)`,
      [profil, org]
    );
  });

  after(async () => {
    if (!hasDb || !pool) return;
    await pool.query("DELETE FROM worker_absences WHERE supplier_org_id = $1", [org]).catch(() => {});
    await pool.query("DELETE FROM worker_profiles WHERE supplier_org_id = $1", [org]).catch(() => {});
    await pool.query("DELETE FROM organizations WHERE id = $1", [org]).catch(() => {});
    await pool.end();
  });

  it("der Verfuegbarkeits-Dienst verschiebt 'frei ab' hinter die Krankmeldung", async () => {
    const out = await resolveAvailability(pool, profil);
    assert.ok(out, "das Profil wird gefunden");
    assert.strictEqual(out.abwesenheit_quelle, "profil");
    assert.strictEqual(out.abwesenheitsgrund, "krank");
    assert.strictEqual(out.available_from, plusTage(5), "der Tag nach dem letzten Krankheitstag");
  });

  it("der Angebotsgenerator zaehlt die Kraft nicht als frei", async () => {
    // Eine Faehigkeit aus dem echten Katalog — ohne sie ist die Pruefung nicht
    // auswertbar und der Test wuerde nichts aussagen.
    const { rows: skills } = await pool.query(`SELECT id, name FROM platform_skills LIMIT 1`);
    if (!skills[0]) return;   // leerer Katalog: nichts zu pruefen, nichts zu behaupten

    // Die Kraft muss die Faehigkeit wirklich haben, sonst taucht sie in der
    // Kandidatenliste gar nicht auf und die Pruefung waere leer.
    await pool.query(
      `INSERT INTO worker_profile_skills (worker_profile_id, skill_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [profil, skills[0].id]
    );

    const out = await checkOfferCoverage(pool, {
      orgId: org, skillTags: [skills[0].name], headcount: 1, from: heute(), to: plusTage(2)
    });
    assert.strictEqual(out.auswertbar, true, "die Abfrage laeuft gegen das echte Schema durch");
    const eintrag = out.kandidaten.find((k) => k.worker_profile_id === profil);
    assert.ok(eintrag, "die Kraft steht in der Kandidatenliste");
    assert.strictEqual(eintrag.zustand, "abwesend",
      "sonst boete der Generator eine krank gemeldete Kraft einem Kunden an");
    assert.strictEqual(eintrag.grund, "krank");
    assert.strictEqual(out.frei, 0);
  });
});

/* Kalendertag in Europe/Berlin — kein roher UTC-Schnitt (Waechter kalendertagDE). */
function heute() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
function plusTage(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);
}
