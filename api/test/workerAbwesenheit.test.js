/**
 * Welle E2 — Abwesenheit gehoert zum Menschen.
 *
 * WAS HIER GEPRUEFT WIRD UND WARUM SO
 * Die durchgehende Lektion dieser Codebasis: ein Test, der das ERGEBNIS prueft
 * statt WELCHE Abfrage lief, beweist nichts. Ein Mock-Pool antwortet auf jede
 * Abfrage gleich — faellt der Code in einen anderen Zweig oder verliert die
 * Mandantengrenze, sieht das Ergebnis identisch aus und die Suite bleibt gruen.
 *
 * Deshalb prueft dieser Test durchgehend die STATEMENTS: steht die
 * Mandantengrenze im INSERT/UPDATE selbst (und nicht als nachgelagerter
 * Vergleich, den ein spaeterer Aufrufer vergessen kann), haengt die Abwesenheit
 * am Profil (nicht am Konto), und wird die Ueberlappung von der Datenbank
 * abgewiesen statt von einem Vorab-SELECT, an dem zwei gleichzeitige Anfragen
 * vorbeilaufen.
 *
 * Der Beweis, dass die EXCLUDE-Bedingung aus Migration 177 wirklich greift,
 * gehoert in test/integration/workerAbwesenheit.flow.test.js — ein Mock kann
 * einen Constraint nicht erzwingen, nur seine Behandlung.
 *
 * Run: node --test --test-force-exit test/workerAbwesenheit.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ABSENCE_ARTEN,
  createAbsence,
  listAbsences,
  cancelAbsence
} from "../services/workerAbsenceService.js";
import { getWorkerLiveBoard } from "../services/workforceService.js";
import {
  STATUS_EVENT_ZUSTAENDE,
  STATUS_EVENT_AUSLOESER,
  getStatusTimeline,
  aufbewahrungDurchsetzen
} from "../services/workerStatusEventService.js";
import { todayDE } from "../utils/dateDE.js";

const ORG = "11111111-1111-1111-1111-111111111111";
const FREMDE_ORG = "22222222-2222-2222-2222-222222222222";
const PROFIL = "33333333-3333-3333-3333-333333333333";
const NUTZER = "44444444-4444-4444-4444-444444444444";
const ABW = "55555555-5555-5555-5555-555555555555";

/** Mock-Pool, der jedes Statement mitschreibt. */
function spionPool(antwort) {
  const gesehen = [];
  const pool = {
    query: async (sql, params) => {
      gesehen.push({ sql, params });
      const r = typeof antwort === "function" ? await antwort(sql, params, gesehen.length) : antwort;
      return r || { rows: [], rowCount: 0 };
    }
  };
  return { pool, gesehen };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Erfassen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("workerAbsenceService — createAbsence", () => {
  it("die Mandantengrenze steht IM Insert, nicht daneben", async () => {
    const { pool, gesehen } = spionPool({ rows: [{ id: ABW }], rowCount: 1 });
    const res = await createAbsence(pool, ORG, {
      workerProfileId: PROFIL, art: "krank", von: "2026-08-17", erfasstVon: NUTZER
    });

    assert.ok(res.absence, "Abwesenheit angelegt");
    assert.strictEqual(gesehen.length, 1, "genau ein Statement — kein Vorab-SELECT, an dem ein Wettlauf vorbeikommt");

    const sql = gesehen[0].sql;
    assert.ok(/INSERT INTO worker_absences/.test(sql));
    assert.ok(/FROM worker_profiles wp/.test(sql), "das Profil wird im Insert selbst aufgeloest");
    assert.ok(/wp\.id = \$2 AND wp\.supplier_org_id = \$1/.test(sql),
      "Profil UND Org im selben WHERE — ein fremdes Profil erzeugt gar keine Zeile");
    assert.ok(/SELECT wp\.id, wp\.supplier_org_id/.test(sql),
      "supplier_org_id kommt aus dem Profil, nicht aus der Anfrage — sie kann nicht falsch sein");
    assert.strictEqual(gesehen[0].params[0], ORG);
    assert.strictEqual(gesehen[0].params[1], PROFIL);
  });

  it("haengt am Profil, nicht am Konto — sonst koennte sich die importierte Belegschaft nicht abmelden", async () => {
    const { pool, gesehen } = spionPool({ rows: [{ id: ABW }], rowCount: 1 });
    await createAbsence(pool, ORG, { workerProfileId: PROFIL, art: "urlaub", von: "2026-08-17" });
    const sql = gesehen[0].sql;
    assert.ok(/worker_profile_id/.test(sql));
    assert.ok(!/worker_user_id/.test(sql),
      "kein Bezug auf das Konto: Profile ohne user_id (Mig 175) sind genau der Fall dieser Welle");
  });

  it("weist eine erfundene Art ab, bevor die Datenbank sie sieht", async () => {
    const { pool, gesehen } = spionPool({ rows: [], rowCount: 0 });
    const res = await createAbsence(pool, ORG, { workerProfileId: PROFIL, art: "elternzeit", von: "2026-08-17" });
    assert.strictEqual(res.error, "INVALID_ART");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(gesehen.length, 0, "keine Abfrage fuer eine Eingabe, die ohnehin nicht zulaessig ist");
  });

  it("kennt genau die vier Arten aus dem CHECK der Migration", () => {
    assert.deepEqual([...ABSENCE_ARTEN], ["krank", "urlaub", "termin", "sonstiges"]);
  });

  it("weist ein Ende vor dem Beginn ab — mit einer Meldung statt eines Constraint-Namens", async () => {
    const { pool, gesehen } = spionPool({ rows: [], rowCount: 0 });
    const res = await createAbsence(pool, ORG, {
      workerProfileId: PROFIL, art: "urlaub", von: "2026-08-20", bis: "2026-08-17"
    });
    assert.strictEqual(res.error, "INVALID_RANGE");
    assert.strictEqual(gesehen.length, 0);
  });

  it("nimmt ein offenes Ende an — 'krank ab Montag' ist der Normalfall", async () => {
    const { pool, gesehen } = spionPool({ rows: [{ id: ABW }], rowCount: 1 });
    const res = await createAbsence(pool, ORG, { workerProfileId: PROFIL, art: "krank", von: "2026-08-17", bis: null });
    assert.ok(res.absence);
    assert.strictEqual(gesehen[0].params[4], null, "bis bleibt NULL statt auf ein geratenes Datum zu fallen");
  });

  it("verweigert ein rohes Datum, das kein Kalendertag ist", async () => {
    const { pool } = spionPool({ rows: [], rowCount: 0 });
    const res = await createAbsence(pool, ORG, { workerProfileId: PROFIL, art: "krank", von: "17.08.2026" });
    assert.strictEqual(res.error, "INVALID_DATE");
  });

  it("Ueberlappung kommt aus der Datenbank (23P01) und nennt den Eintrag, der im Weg steht", async () => {
    let n = 0;
    const { pool, gesehen } = spionPool(async (sql) => {
      n++;
      if (n === 1) {
        const err = new Error("conflicting key value violates exclusion constraint");
        err.code = "23P01";
        throw err;
      }
      assert.ok(/daterange\(von, bis, '\[\]'\) && daterange/.test(sql),
        "der Konflikt wird ueber Bereichs-Ueberschneidung gesucht, nicht ueber Gleichheit des Starttags");
      return { rows: [{ id: ABW, art: "urlaub", von: "2026-08-15", bis: "2026-08-25" }], rowCount: 1 };
    });

    const res = await createAbsence(pool, ORG, {
      workerProfileId: PROFIL, art: "krank", von: "2026-08-17", bis: "2026-08-20"
    });

    assert.strictEqual(res.error, "ABSENCE_OVERLAP");
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.conflict.art, "urlaub", "der Nutzer erfaehrt, WELCHE Abwesenheit blockiert");
    assert.strictEqual(gesehen[1].params[0], ORG, "auch die Konfliktsuche bleibt org-gebunden");
  });

  it("trennt 'gibt es nicht' von 'gehoert einem anderen Betrieb' — und nur auf dem Fehlerpfad", async () => {
    // Insert trifft nichts -> genau eine Nachfrage, die den Unterschied klaert.
    let n = 0;
    const { pool, gesehen } = spionPool(async () => {
      n++;
      if (n === 1) return { rows: [], rowCount: 0 };
      return { rows: [{ supplier_org_id: FREMDE_ORG }], rowCount: 1 };
    });

    const res = await createAbsence(pool, ORG, { workerProfileId: PROFIL, art: "krank", von: "2026-08-17" });
    assert.strictEqual(res.error, "ORG_BOUNDARY_VIOLATION");
    assert.strictEqual(res.status, 403);
    assert.strictEqual(gesehen.length, 2);

    const { pool: p2 } = spionPool(async () => ({ rows: [], rowCount: 0 }));
    const res2 = await createAbsence(p2, ORG, { workerProfileId: PROFIL, art: "krank", von: "2026-08-17" });
    assert.strictEqual(res2.error, "NOT_FOUND");
    assert.strictEqual(res2.status, 404);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Lesen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("workerAbsenceService — listAbsences", () => {
  it("ohne Org: Zero-State statt Fehler", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    const res = await listAbsences(pool, null);
    assert.strictEqual(res.available, false);
    assert.deepEqual(res.items, []);
    assert.strictEqual(gesehen.length, 0);
  });

  it("liest standardmaessig nur gueltige Eintraege und bleibt org-gebunden", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    await listAbsences(pool, ORG);
    const sql = gesehen[0].sql;
    assert.ok(/a\.supplier_org_id = \$1/.test(sql));
    assert.ok(/a\.aufgehoben_am IS NULL/.test(sql), "zurueckgenommene Eintraege sind nicht der Normalfall");
    assert.strictEqual(gesehen[0].params[0], ORG);
  });

  it("mitAufgehobenen zeigt die Akte vollstaendig (Grundlage fuer den Zeitstrahl aus E5)", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    await listAbsences(pool, ORG, { mitAufgehobenen: true });
    assert.ok(!/aufgehoben_am IS NULL/.test(gesehen[0].sql));
  });

  it("'aktuell' rechnet in Europe/Berlin, nicht in UTC", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    const res = await listAbsences(pool, ORG, { nurAktuelle: true });
    assert.strictEqual(res.scope.aktiv_am, todayDE(),
      "der Stichtag ist der DACH-Kalendertag — ein UTC-Schnitt liefert hier ganztaegig den Vortag");
    assert.ok(gesehen[0].params.includes(todayDE()));
    assert.ok(/a\.von <= \$\d+::date AND \(a\.bis IS NULL OR a\.bis >= \$\d+::date\)/.test(gesehen[0].sql),
      "ein offenes Ende gilt weiter — sonst verschwaende die Krankmeldung ohne Rueckkehrdatum am naechsten Tag");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Zuruecknehmen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("workerAbsenceService — cancelAbsence", () => {
  it("hebt auf statt zu loeschen, mit Org-Grenze im UPDATE selbst", async () => {
    const { pool, gesehen } = spionPool({ rows: [{ id: ABW, aufgehoben_am: "2026-08-17T08:00:00Z" }], rowCount: 1 });
    const res = await cancelAbsence(pool, ORG, ABW, { userId: NUTZER, grund: "Krankmeldung zurueckgezogen" });

    assert.ok(res.absence);
    const sql = gesehen[0].sql;
    assert.ok(/UPDATE worker_absences/.test(sql));
    assert.ok(!/DELETE/.test(sql), "die Zeile bleibt in der Akte — E5 braucht sie fuer den Zeitstrahl");
    assert.ok(/WHERE id = \$2 AND supplier_org_id = \$1/.test(sql),
      "ein fremder Betrieb kann sie nicht per ID aufheben");
    assert.ok(/aufgehoben_am IS NULL/.test(sql), "zweimal aufheben ist kein stiller Erfolg");
  });

  it("unterscheidet 'schon zurueckgenommen' von 'nicht gefunden' und 'fremde Org'", async () => {
    const faelle = [
      { zeile: null, erwartet: "NOT_FOUND", status: 404 },
      { zeile: { supplier_org_id: FREMDE_ORG, aufgehoben_am: null }, erwartet: "ORG_BOUNDARY_VIOLATION", status: 403 },
      { zeile: { supplier_org_id: ORG, aufgehoben_am: "2026-08-16T10:00:00Z" }, erwartet: "ALREADY_CANCELLED", status: 409 }
    ];
    for (const fall of faelle) {
      let n = 0;
      const { pool } = spionPool(async () => {
        n++;
        if (n === 1) return { rows: [], rowCount: 0 };
        return { rows: fall.zeile ? [fall.zeile] : [], rowCount: fall.zeile ? 1 : 0 };
      });
      const res = await cancelAbsence(pool, ORG, ABW, { userId: NUTZER });
      assert.strictEqual(res.error, fall.erwartet);
      assert.strictEqual(res.status, fall.status);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Die Tafel — Gate E2: die Abwesenheit erscheint in der Live-Belegschaft
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Live-Belegschaft — der Zustand 'abwesend'", () => {
  it("fragt die Abwesenheit org-gebunden, am Profil und tagesaktuell ab", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    await getWorkerLiveBoard(pool, ORG);
    const sql = gesehen[0].sql;

    assert.ok(/FROM worker_absences ab/.test(sql), "die Tafel liest die neue Quelle");
    assert.ok(/ab\.worker_profile_id = wp\.id/.test(sql),
      "Verknuepfung ueber das Profil — ueber wp.user_id faenden kontolose Mitarbeiter nie statt");
    assert.ok(/ab\.supplier_org_id = \$1/.test(sql), "Mandantengrenze auch in der Abwesenheit");
    assert.ok(/ab\.aufgehoben_am IS NULL/.test(sql), "zurueckgenommene Abmeldungen faerben die Tafel nicht");
    assert.ok(/ab\.von <= CURRENT_DATE/.test(sql));
    assert.ok(/ab\.bis IS NULL OR ab\.bis >= CURRENT_DATE/.test(sql),
      "ein offenes Ende bleibt abwesend, bis jemand es beendet");
    assert.ok(/WHEN abw\.id IS NOT NULL THEN 'abwesend'/.test(sql));
  });

  it("Rangfolge: inaktiv schlaegt abwesend, abwesend schlaegt den laufenden Einsatz", async () => {
    const sql = (await (async () => {
      const { pool, gesehen } = spionPool({ rows: [] });
      await getWorkerLiveBoard(pool, ORG);
      return gesehen[0].sql;
    })());

    const posInaktiv  = sql.indexOf("THEN 'inaktiv'");
    const posAbwesend = sql.indexOf("THEN 'abwesend'");
    const posVerfueg  = sql.indexOf("THEN 'verfuegbar'");
    assert.ok(posInaktiv >= 0 && posAbwesend > posInaktiv,
      "inaktiv wird zuerst geprueft — wer nicht mehr beschaeftigt ist, wird nicht krank gemeldet");
    assert.ok(posVerfueg > posAbwesend,
      "abwesend steht vor den Einsatz-Zweigen: wer krank ist, ist heute nicht da, auch wenn der Einsatz laeuft");
  });

  it("zaehlt abwesend getrennt nach Art — und niemand faellt zwischen zwei Reiter (Gate E4)", async () => {
    const { pool } = spionPool({
      rows: [
        { id: "p1", live_status: "abwesend",   absence_art: "krank",  open_timesheets: 0 },
        { id: "p2", live_status: "abwesend",   absence_art: "urlaub", open_timesheets: 0 },
        { id: "p3", live_status: "abwesend",   absence_art: "krank",  open_timesheets: 1 },
        { id: "p4", live_status: "im_einsatz", open_timesheets: 0 },
        { id: "p5", live_status: "verfuegbar", open_timesheets: 0 },
        { id: "p6", live_status: "endet_bald", open_timesheets: 0 },
        { id: "p7", live_status: "inaktiv",    open_timesheets: 0 }
      ]
    });
    const res = await getWorkerLiveBoard(pool, ORG);

    assert.strictEqual(res.kpis.abwesend, 3);
    assert.strictEqual(res.kpis.abwesend_nach_art.krank, 2);
    assert.strictEqual(res.kpis.abwesend_nach_art.urlaub, 1);
    assert.strictEqual(res.kpis.abwesend_nach_art.termin, 0);

    const summe = res.kpis.abwesend + res.kpis.im_einsatz + res.kpis.verfuegbar +
                  res.kpis.endet_bald + res.kpis.inaktiv;
    assert.strictEqual(summe, res.kpis.total,
      "die Zustaende sind ausschliessend: kein Mensch doppelt, keiner unsichtbar");

    // Abwesende sind einsatzfaehige Belegschaft, aber nicht im Einsatz -> sie druecken
    // die Auslastung. Eine Kennzahl, die sie herausrechnet, beschoenigt.
    // onAssignment = 1 + 1 = 2; aktiv = 7 - 1 = 6 -> 33 %
    assert.strictEqual(res.kpis.auslastung_pct, 33);
  });

  it("eine unbekannte Art verfaelscht die Aufschluesselung nicht", async () => {
    const { pool } = spionPool({
      rows: [{ id: "p1", live_status: "abwesend", absence_art: "elternzeit", open_timesheets: 0 }]
    });
    const res = await getWorkerLiveBoard(pool, ORG);
    assert.strictEqual(res.kpis.abwesend, 1, "gezaehlt wird sie trotzdem — sonst verschwaende ein Mensch");
    assert.deepEqual(res.kpis.abwesend_nach_art, { krank: 0, urlaub: 0, termin: 0, sonstiges: 0 });
  });

  it("Zero-State kennt den neuen Zustand ebenfalls", async () => {
    const { pool } = spionPool({ rows: [] });
    const res = await getWorkerLiveBoard(pool, null);
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.kpis.abwesend, 0);
    assert.deepEqual(res.kpis.abwesend_nach_art, { krank: 0, urlaub: 0, termin: 0, sonstiges: 0 });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Welle E3 — Montage als Eigenschaft des Einsatzortes
 *
 * Der Plan liess offen, ob das Feld an `assignments` oder an
 * `worker_assignment_links` gehoert. Das Schema hat geantwortet: `assignments`
 * kennt keinen Ort, `worker_assignment_links` traegt die gesamte Ortswahrheit
 * (location_address, meeting_point, contact_*). Montage heisst "auswaerts mit
 * Uebernachtung" — eine Aussage ueber den Ort.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Live-Belegschaft — der Zustand 'montage'", () => {
  it("liest das Feld am Einsatz-Link, nicht am Auftrag", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    await getWorkerLiveBoard(pool, ORG);
    const sql = gesehen[0].sql;
    assert.ok(/wal\.is_montage/.test(sql), "die Quelle ist der Einsatz-Link");
    assert.ok(!/a\.is_montage/.test(sql), "nicht der Auftrag — der kennt keinen Ort");
    assert.ok(/WHEN cur\.is_montage THEN 'montage'/.test(sql));
  });

  it("Rangfolge: montage ueberdeckt 'endet bald' und 'im Einsatz', nicht aber Abwesenheit", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    await getWorkerLiveBoard(pool, ORG);
    const sql = gesehen[0].sql;
    const pos = (t) => sql.indexOf(t);
    assert.ok(pos("THEN 'abwesend'") < pos("THEN 'montage'"),
      "wer krank ist, ist nicht auf Montage — er ist zu Hause");
    assert.ok(pos("THEN 'montage'") < pos("THEN 'endet_bald'"),
      "sonst verschwaende eine Kraft aus dem Montage-Reiter, nur weil ihr Einsatz bald endet — " +
      "der Reiter wuerde die Frage 'wer uebernachtet gerade auswaerts' falsch beantworten");
  });

  it("das nahende Ende geht nicht verloren, obwohl der Zustand es ueberdeckt", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    await getWorkerLiveBoard(pool, ORG);
    assert.ok(/\) AS endet_bald/.test(gesehen[0].sql),
      "als eigenes Feld neben dem Zustand — die Zeile zeigt den Hinweis weiter an");
  });

  it("zaehlt Montage als Einsatz in der Auslastung — die Kraft arbeitet, sie schlaeft nur woanders", async () => {
    const { pool } = spionPool({
      rows: [
        { id: "p1", live_status: "montage",    open_timesheets: 0 },
        { id: "p2", live_status: "montage",    open_timesheets: 0 },
        { id: "p3", live_status: "im_einsatz", open_timesheets: 0 },
        { id: "p4", live_status: "verfuegbar", open_timesheets: 0 }
      ]
    });
    const res = await getWorkerLiveBoard(pool, ORG);
    assert.strictEqual(res.kpis.montage, 2);
    // onAssignment = 2 Montage + 1 im Einsatz = 3; aktiv = 4 -> 75 %
    assert.strictEqual(res.kpis.auslastung_pct, 75,
      "waere Montage nicht mitgezaehlt, saenke die Auslastung genau dann, wenn der Betrieb am meisten leistet");
  });

  it("die Summe der Zustaende bleibt die Gesamtzahl (Gate E4)", async () => {
    const { pool } = spionPool({
      rows: [
        { id: "p1", live_status: "montage",    open_timesheets: 0 },
        { id: "p2", live_status: "abwesend",   absence_art: "krank", open_timesheets: 0 },
        { id: "p3", live_status: "endet_bald", open_timesheets: 0 },
        { id: "p4", live_status: "im_einsatz", open_timesheets: 0 },
        { id: "p5", live_status: "verfuegbar", open_timesheets: 0 },
        { id: "p6", live_status: "inaktiv",    open_timesheets: 0 }
      ]
    });
    const k = (await getWorkerLiveBoard(pool, ORG)).kpis;
    assert.strictEqual(
      k.montage + k.abwesend + k.endet_bald + k.im_einsatz + k.verfuegbar + k.inaktiv,
      k.total, "kein Mensch doppelt, keiner unsichtbar");
  });

  it("Zero-State kennt den Reiter ebenfalls", async () => {
    const { pool } = spionPool({ rows: [] });
    const res = await getWorkerLiveBoard(pool, null);
    assert.strictEqual(res.kpis.montage, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Welle E5 — der Zeitstrahl
 *
 * Das Protokoll selbst entsteht in der Datenbank (Trigger, Mig 179); dass es
 * sich nicht umgehen laesst, belegt test/integration/zustandsprotokoll.flow.test.js
 * mit rohem SQL. Hier geht es um den LESENDEN Dienst: bleibt er an der
 * Mandantengrenze, fragt er das richtige Fenster ab, und verweigert er die
 * Auskunft ueber ein fremdes Profil?
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("workerStatusEventService — getStatusTimeline", () => {
  it("ohne Org oder Profil: Zero-State statt Fehler", async () => {
    const { pool, gesehen } = spionPool({ rows: [] });
    const res = await getStatusTimeline(pool, null, PROFIL);
    assert.strictEqual(res.available, false);
    assert.deepEqual(res.items, []);
    assert.strictEqual(gesehen.length, 0);
  });

  it("holt den Menschen org-gebunden, bevor er sein Protokoll herausgibt", async () => {
    const { pool, gesehen } = spionPool(async (sql) => {
      if (/FROM worker_profiles wp/.test(sql)) return { rows: [{ id: PROFIL, first_name: "A", last_name: "B" }] };
      return { rows: [] };
    });
    await getStatusTimeline(pool, ORG, PROFIL, { tage: 90 });
    assert.ok(/wp\.id = \$2 AND wp\.supplier_org_id = \$1/.test(gesehen[0].sql),
      "Profil UND Org im selben WHERE");

    const abfrage = gesehen[1];
    assert.ok(/FROM worker_status_events e/.test(abfrage.sql));
    assert.ok(/e\.supplier_org_id = \$1/.test(abfrage.sql), "auch das Protokoll bleibt org-gebunden");
    assert.ok(/e\.zeitpunkt >= NOW\(\) - \(\$3 \|\| ' days'\)::interval/.test(abfrage.sql),
      "das Zeitfenster ist ein Parameter, keine eingebaute Zahl");
    assert.strictEqual(abfrage.params[2], "90");
    assert.ok(/ORDER BY e\.zeitpunkt DESC/.test(abfrage.sql), "neueste zuerst — der Disponent liest von oben");
  });

  it("ein fremdes Profil bekommt 403, ein unbekanntes 404", async () => {
    let n = 0;
    const { pool } = spionPool(async () => {
      n++;
      if (n === 1) return { rows: [] };
      return { rows: [{ supplier_org_id: FREMDE_ORG }] };
    });
    const res = await getStatusTimeline(pool, ORG, PROFIL);
    assert.strictEqual(res.error, "ORG_BOUNDARY_VIOLATION");
    assert.strictEqual(res.status, 403);

    const { pool: p2 } = spionPool({ rows: [] });
    const res2 = await getStatusTimeline(p2, ORG, PROFIL);
    assert.strictEqual(res2.error, "NOT_FOUND");
    assert.strictEqual(res2.status, 404);
  });

  it("das Fenster ist gedeckelt — 90 Tage Standard, hoechstens zwei Jahre", async () => {
    const bau = (tage) => {
      const { pool, gesehen } = spionPool(async (sql) => {
        if (/FROM worker_profiles wp/.test(sql)) return { rows: [{ id: PROFIL }] };
        return { rows: [] };
      });
      return getStatusTimeline(pool, ORG, PROFIL, { tage }).then((r) => ({ r, gesehen }));
    };
    assert.strictEqual((await bau(undefined)).r.scope.tage, 90);
    assert.strictEqual((await bau(99999)).r.scope.tage, 730, "nicht mehr, als die Aufbewahrung hergibt");
    assert.strictEqual((await bau(0)).r.scope.tage, 90);
  });

  it("kennt genau die Zustaende und Ausloeser aus dem CHECK der Migration", () => {
    assert.deepEqual([...STATUS_EVENT_ZUSTAENDE], ["verfuegbar", "im_einsatz", "montage", "abwesend", "inaktiv"]);
    assert.ok(!STATUS_EVENT_ZUSTAENDE.includes("endet_bald"),
      "eine Frist ist kein Zustand — sie hat keinen Ausloeser und gehoert nicht ins Protokoll");
    assert.deepEqual([...STATUS_EVENT_AUSLOESER], ["abwesenheit", "einsatz", "profil"]);
  });

  it("die Aufbewahrungsfrist steht in der Datenbank, nicht im Dienst", async () => {
    // Zwei Zahlen an zwei Orten heisst, dass die zweite irgendwann die falsche ist.
    const { pool, gesehen } = spionPool({ rows: [{ geloescht: 7 }] });
    const res = await aufbewahrungDurchsetzen(pool);
    assert.strictEqual(res.geloescht, 7);
    assert.ok(/worker_status_events_aufraeumen\(\)/.test(gesehen[0].sql));
    assert.ok(!/24|months|INTERVAL/i.test(gesehen[0].sql),
      "der Dienst nennt keine Frist — er loest nur aus");
  });
});
