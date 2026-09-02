/**
 * Der Betriebstakt — ein Herzschlag je Aufgabe (M1.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD, UND WARUM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Leitentscheidung M-L9: kein Automatismus gilt als geliefert, solange nicht
 * messbar ist, wann er zuletzt lief.
 *
 * Der Anlass ist gemessen (M0, 2026-09-01): die Marktplatz-Automatik war
 * vollstaendig gebaut und lief nie. Ein Jahr lang, ohne dass es auffiel — weil
 * es keinen Ort gab, an dem ihr SCHWEIGEN sichtbar wurde.
 *
 * Der schwerste Fall ist deshalb nicht "laeuft zu selten", sondern
 * **"hat noch NIE gelaufen"** — und den uebersieht jede Ueberwachung, die von
 * der Tabelle ausgeht statt von der Erwartung. Eine Aufgabe, die nie lief, hat
 * keine Zeile; wer Zeilen zaehlt, zaehlt sie nicht.
 *
 * DIE STRUKTUR WIRD MITGEPRUEFT, nicht nur die Rechnung: dass der Herzschlag
 * VOR den Routen haengt und nicht in ihnen, ist der Unterschied zwischen
 * "28 Endpunkte tragen ihn" und "der 29. vergisst ihn".
 *
 * Run: node --test --test-force-exit test/betriebsTakt.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TAKTE, TOLERANZ, taktNotieren, bewerteAufgabe, taktStand
} from "../services/betriebsTaktService.js";
import { loadOperationsSnapshot } from "../services/staffControlService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");

/* ── Werkzeug ─────────────────────────────────────────────────────────── */

function musterPool(fn) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      const r = fn ? await fn(String(sql || ""), params || []) : null;
      return r === undefined || r === null ? { rows: [], rowCount: 0 } : r;
    },
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); }
  };
}

const JETZT = Date.parse("2026-09-01T12:00:00Z");
const vorMinuten = (n) => new Date(JETZT - n * 60000);

/* ── Die Rechnung ─────────────────────────────────────────────────────── */

describe("M1.1 · der Zustand einer Aufgabe — die reine Rechnung", () => {
  it("OHNE ZEILE heisst STILL, nicht ok — der schwerste Fall", () => {
    /* Genau der Zustand der Marktplatz-Automatik: nichts da, nichts alt,
     * nichts auffaellig. Wer von der Tabelle ausgeht, sieht ihn nie. */
    const a = bewerteAufgabe("staffing-maintenance", undefined, JETZT);
    assert.equal(a.zustand, "still");
    assert.equal(a.minuten_her, null);
    assert.match(a.grund, /nie gelaufen/);
    assert.equal(a.soll_min, 15, "das Soll kommt aus der Registratur, nicht aus der Zeile");
  });

  it("eine Zeile ohne Zeitstempel zaehlt ebenfalls als STILL", () => {
    for (const kaputt of [{ zuletzt_um: null }, { zuletzt_um: "keine Zeit" }, {}]) {
      assert.equal(bewerteAufgabe("staffing-maintenance", kaputt, JETZT).zustand, "still");
    }
  });

  it("innerhalb des Solls ist der Zustand ok", () => {
    const a = bewerteAufgabe("staffing-maintenance",
      { zuletzt_um: vorMinuten(10), ergebnis: "ok", laeufe: 42 }, JETZT);
    assert.equal(a.zustand, "ok");
    assert.equal(a.minuten_her, 10);
    assert.equal(a.laeufe, 42);
    assert.equal(a.grund, null);
  });

  it("EIN verpasster Lauf ist noch kein Alarm — drei sind einer", () => {
    /* Die Toleranz ist die Stelle, an der ein Waechter nuetzlich oder laestig
     * wird. Ein Neustart oder ein kurz fehlendes Redis darf keinen Alarm
     * ausloesen; drei verpasste Laeufe hintereinander schon. */
    const soll = TAKTE["staffing-maintenance"].intervall_min;   // 15
    const grenze = soll * TOLERANZ;                             // 45

    for (const her of [soll + 1, grenze - 1, grenze]) {
      assert.equal(
        bewerteAufgabe("staffing-maintenance", { zuletzt_um: vorMinuten(her), ergebnis: "ok" }, JETZT).zustand,
        "ok", `${her} Minuten sind noch im Rahmen`);
    }
    const spaet = bewerteAufgabe("staffing-maintenance",
      { zuletzt_um: vorMinuten(grenze + 1), ergebnis: "ok" }, JETZT);
    assert.equal(spaet.zustand, "spaet");
    assert.match(spaet.grund, /still/);
  });

  it("ein gescheiterter letzter Lauf faellt auf, auch wenn er puenktlich war", () => {
    const a = bewerteAufgabe("staffing-maintenance",
      { zuletzt_um: vorMinuten(2), ergebnis: "fehler", fehler: "HTTP 500", fehler_in_folge: 3 }, JETZT);
    assert.equal(a.zustand, "fehler");
    assert.equal(a.letzter_fehler, "HTTP 500");
    assert.equal(a.fehler_in_folge, 3);
  });

  it("SPAET schlaegt FEHLER — wer schweigt, ist schlimmer dran als wer stolpert", () => {
    /* Eine Aufgabe, die seit Tagen still ist, hat vielleicht vor Tagen einen
     * Fehler gemeldet. Der interessante Befund ist das Schweigen. */
    const a = bewerteAufgabe("staffing-maintenance",
      { zuletzt_um: vorMinuten(500), ergebnis: "fehler" }, JETZT);
    assert.equal(a.zustand, "spaet");
  });

  it("eine Aufgabe ohne Eintrag in der Registratur wird nicht ueberwacht", () => {
    /* Absicht: die 28 internen Endpunkte sind zum groessten Teil Werkzeuge fuer
     * den Betrieb, keine Automatismen mit Erwartung. Ueberwacht wird, was
     * laufen MUSS — sonst ertrinkt der echte Alarm im Rauschen. */
    const a = bewerteAufgabe("cleanup-idempotency",
      { zuletzt_um: vorMinuten(100000), ergebnis: "ok" }, JETZT);
    assert.equal(a.zustand, "ok", "ohne Soll gibt es kein Zu-spaet");
    assert.equal(a.soll_min, null);
  });
});

/* ── Die Registratur ──────────────────────────────────────────────────── */

describe("M1.1 · die Registratur nennt, was laufen MUSS", () => {
  it("die Marktplatz-Automatik steht darin — sie ist der Anlass", () => {
    assert.ok(TAKTE["staffing-maintenance"], "der Grund fuer diese ganze Phase");
    assert.equal(TAKTE["staffing-maintenance"].intervall_min, 15);
  });

  it("die vier bereits laufenden BullMQ-Takte stehen darin", () => {
    /* Sie liefen schon (api/workers/index.js:24-47) — nur konnte es niemand
     * nachweisen. Genau das ist der Unterschied, den M-L9 verlangt. */
    for (const t of ["capacity:capacity-expiry", "capacity:capacity-stale-check",
      "capacity:worker-status-events-retention", "capacity:ersatz-frist"]) {
      assert.ok(TAKTE[t], `${t} fehlt in der Registratur`);
    }
    assert.equal(TAKTE["capacity:ersatz-frist"].intervall_min, 10,
      "die 4-h-Frist braucht einen 10-Minuten-Takt, kein Tagesintervall");
  });

  it("jeder Eintrag nennt Intervall UND Zweck", () => {
    /* Ein Alarm ohne Zweck ist ein Alarm, den niemand einordnen kann. */
    for (const [name, soll] of Object.entries(TAKTE)) {
      assert.ok(Number.isFinite(soll.intervall_min) && soll.intervall_min > 0,
        `${name}: kein brauchbares Intervall`);
      assert.ok(soll.zweck && soll.zweck.length > 10,
        `${name}: ohne Zweck ist der Alarm nicht einzuordnen`);
    }
  });

  it("die Registratur ist eingefroren — Takte entstehen nicht zur Laufzeit", () => {
    assert.ok(Object.isFrozen(TAKTE));
  });
});

/* ── Das Festhalten ───────────────────────────────────────────────────── */

describe("M1.1 · ein Lauf wird festgehalten", () => {
  it("die Bindungen stimmen und der Eintrag wird fortgeschrieben, nicht verdoppelt", async () => {
    const p = musterPool();
    await taktNotieren(p, { aufgabe: "staffing-maintenance", dauerMs: 1234, ergebnis: "ok" });

    assert.equal(p.calls.length, 1);
    const [c] = p.calls;
    assert.match(c.sql, /INSERT INTO betriebs_takt/);
    assert.match(c.sql, /ON CONFLICT \(aufgabe\) DO UPDATE/,
      "eine Zeile je Aufgabe — ein Laufprotokoll waechst unbegrenzt");
    assert.deepEqual(c.params, ["staffing-maintenance", 1234, "ok", null, "intern"]);
  });

  it("ein Fehlschlag traegt seinen Grund, ein Gutfall loescht ihn", async () => {
    const p = musterPool();
    await taktNotieren(p, { aufgabe: "x", ergebnis: "fehler", fehler: "Redis weg" });
    assert.equal(p.calls[0].params[3], "Redis weg");
    assert.match(p.calls[0].sql, /fehler\s*=\s*CASE WHEN EXCLUDED\.ergebnis = 'fehler'/,
      "der Grund bleibt stehen, bis ein Lauf gelingt");
  });

  it("die Fehlerfolge zaehlt am Stueck und wird bei Erfolg zurueckgesetzt", async () => {
    const p = musterPool();
    await taktNotieren(p, { aufgabe: "x", ergebnis: "fehler" });
    assert.match(p.calls[0].sql,
      /fehler_in_folge = CASE WHEN EXCLUDED\.ergebnis = 'fehler'\s*\n?\s*THEN betriebs_takt\.fehler_in_folge \+ 1 ELSE 0 END/,
      "einmal gestolpert ist etwas anderes als seit Tagen tot");
  });

  it("eine ueberlange Fehlermeldung wird gekuerzt, nicht verworfen", async () => {
    const p = musterPool();
    await taktNotieren(p, { aufgabe: "x", ergebnis: "fehler", fehler: "A".repeat(5000) });
    assert.equal(p.calls[0].params[3].length, 500,
      "eine Zeile, die wegen eines langen Stapelverlaufs nicht geschrieben wird, "
      + "ist der schlechteste aller Zustaende");
  });

  it("OHNE AUFGABENNAMEN wird gar nicht geschrieben", async () => {
    const p = musterPool();
    for (const leer of [undefined, null, "", "   ", 0]) {
      assert.equal(await taktNotieren(p, { aufgabe: leer }), false);
    }
    assert.equal(p.calls.length, 0, "ein namenloser Herzschlag ist keiner");
  });

  it("DER HERZSCHLAG WIRFT NIE — auch nicht, wenn die Tabelle fehlt", async () => {
    /* Ein Herzschlag, der den Lauf zum Scheitern bringt, den er beobachtet,
     * waere schlimmer als keiner: der Takt fiele aus, WEIL er ueberwacht wird. */
    const kaputt = { query: async () => { throw new Error("relation does not exist"); } };
    assert.equal(await taktNotieren(kaputt, { aufgabe: "x" }), false);
  });

  it("eine unbekannte Quelle faellt auf 'intern' zurueck, nicht auf einen CHECK-Verstoss", async () => {
    const p = musterPool();
    await taktNotieren(p, { aufgabe: "x", quelle: "erfunden" });
    assert.equal(p.calls[0].params[4], "intern");
    await taktNotieren(p, { aufgabe: "x", quelle: "takt" });
    assert.equal(p.calls[1].params[4], "takt");
  });
});

/* ── Der Stand ────────────────────────────────────────────────────────── */

describe("M1.1 · der Stand geht von der ERWARTUNG aus, nicht von der Tabelle", () => {
  it("eine nie gelaufene Aufgabe erscheint trotzdem — und ganz oben", async () => {
    /* DIE ZENTRALE PROBE DIESER PHASE. Waere der Stand ein SELECT ueber die
     * Tabelle, faehlte die Marktplatz-Automatik in der Liste vollstaendig —
     * genau so, wie sie ein Jahr lang gefehlt hat. */
    const p = musterPool(() => ({ rows: [
      { aufgabe: "capacity:ersatz-frist", zuletzt_um: vorMinuten(3), ergebnis: "ok", laeufe: 900,
        fehler_in_folge: 0, dauer_ms: 40, quelle: "takt" }
    ] }));

    const stand = await taktStand(p, { jetzt: JETZT });
    const namen = stand.ueberwacht.map((a) => a.aufgabe);
    assert.ok(namen.includes("staffing-maintenance"),
      "die nie gelaufene Aufgabe MUSS in der Liste stehen");
    assert.equal(stand.ueberwacht[0].zustand, "still",
      "am dringendsten zuerst: was nie lief, steht oben");
    assert.equal(stand.zusammenfassung.ueberwacht, Object.keys(TAKTE).length);
    assert.equal(stand.zusammenfassung.ok, 1);
    assert.equal(stand.zusammenfassung.still, Object.keys(TAKTE).length - 1);
  });

  it("EINE Abfrage fuer alle Aufgaben, nicht eine je Aufgabe", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await taktStand(p, { jetzt: JETZT });
    assert.equal(p.calls.length, 1,
      `${p.calls.length} Abfragen — bei ${Object.keys(TAKTE).length} Aufgaben `
      + "waere eine je Aufgabe genau das Muster, das die Skalierungsregel verbietet");
  });

  it("was laeuft, ohne ueberwacht zu sein, steht getrennt daneben", async () => {
    const p = musterPool(() => ({ rows: [
      { aufgabe: "cleanup-idempotency", zuletzt_um: vorMinuten(30), ergebnis: "ok",
        laeufe: 5, fehler_in_folge: 0, quelle: "intern" }
    ] }));
    const stand = await taktStand(p, { jetzt: JETZT });
    assert.equal(stand.beobachtet.length, 1);
    assert.equal(stand.beobachtet[0].aufgabe, "cleanup-idempotency");
    assert.ok(!stand.ueberwacht.some((a) => a.aufgabe === "cleanup-idempotency"),
      "beobachtet ist nicht ueberwacht — sonst ertrinkt der echte Alarm im Rauschen");
  });

  it("OHNE TABELLE ist der ehrliche Befund 'alles still', nicht 'alles gut'", async () => {
    const kaputt = { query: async () => { throw new Error("relation does not exist"); } };
    const stand = await taktStand(kaputt, { jetzt: JETZT });
    assert.equal(stand.zusammenfassung.still, Object.keys(TAKTE).length);
    assert.equal(stand.zusammenfassung.ok, 0,
      "eine Ueberwachung, die beim eigenen Ausfall Entwarnung gibt, ist schlimmer als keine");
  });

  it("EINE AUFGABE AUSSETZEN → DER WAECHTER WIRD ROT", async () => {
    /* Die Abnahme aus dem Plan, woertlich: "Eine Aufgabe kuenstlich aussetzen
     * → Waechter rot." Hier wird sie gefahren. */
    const laeuft = () => ({ rows: Object.keys(TAKTE).map((a) => ({
      aufgabe: a, zuletzt_um: vorMinuten(1), ergebnis: "ok", laeufe: 10,
      fehler_in_folge: 0, dauer_ms: 20, quelle: "takt"
    })) });

    const gesund = await taktStand(musterPool(laeuft), { jetzt: JETZT });
    assert.equal(gesund.zusammenfassung.spaet, 0);
    assert.equal(gesund.zusammenfassung.still, 0);
    assert.equal(gesund.zusammenfassung.ok, Object.keys(TAKTE).length,
      "Ausgangslage: alles laeuft");

    // Jetzt setzt die Marktplatz-Automatik aus — vier Intervalle lang.
    const ausgesetzt = () => ({ rows: laeuft().rows.map((z) =>
      z.aufgabe === "staffing-maintenance"
        ? { ...z, zuletzt_um: vorMinuten(TAKTE["staffing-maintenance"].intervall_min * 4) }
        : z) });

    const krank = await taktStand(musterPool(ausgesetzt), { jetzt: JETZT });
    assert.equal(krank.zusammenfassung.spaet, 1, "der Ausfall MUSS auffallen");
    assert.equal(krank.ueberwacht[0].aufgabe, "staffing-maintenance",
      "und er steht ganz oben");
    assert.match(krank.ueberwacht[0].grund, /60 Minuten still/);
  });
});

/* ── Die Struktur ─────────────────────────────────────────────────────── */

describe("M1.1 · der Herzschlag haengt VOR den Routen, nicht in ihnen", () => {
  /*
   * OHNE KOMMENTARE LESEN. Beim Rueckmutieren ist genau hier eine Probe
   * durchgefallen: der Satz `res.on("finish")` steht auch im ERKLAERENDEN
   * Kommentar ueber dem Tor. Als die echte Zeile entfernt wurde, war der
   * Waechter von der eigenen Dokumentation zufrieden.
   *
   * Dieselbe Falle ist in dieser Codebasis mehrfach zugeschnappt — zuletzt beim
   * Erreichbarkeits-Waechter, wo `// import "./typeParsers.js";` als gueltiger
   * Import durchging. Ein Waechter, der Prosa fuer Code haelt, bewacht Prosa.
   */
  const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8")
    .split(/\r?\n/)
    .map((z) => z.replace(/\/\/.*$/, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("ein Tor vor allen internen Endpunkten — nicht 28 einzelne Einbauten", () => {
    /* Der Unterschied zwischen "28 Endpunkte tragen ihn" und "der 29. vergisst
     * ihn". Dieselbe Bauart wie das Praefix-Tor in support.js:773. */
    const s = quelle("routes/internal.js");
    assert.match(s, /router\.use\("\/internal",/,
      "ohne Praefix-Tor muss jeder neue Endpunkt daran denken");
    assert.match(s, /res\.on\("finish"/,
      "gemessen wird am Abschluss — so faellt auch ein Lauf mit 500 auf");

    /* Das Tor muss VOR der ersten Route stehen, sonst greift es fuer sie nicht. */
    const torPos = s.indexOf('router.use("/internal"');
    const ersteRoute = s.search(/router\.(post|get)\("\/internal\//);
    assert.ok(torPos > 0 && torPos < ersteRoute,
      "ein Tor hinter den Routen ist kein Tor");
  });

  it("die Zahl der internen Endpunkte ist bekannt — und alle liegen hinter dem Tor", () => {
    const s = quelle("routes/internal.js");
    const routen = s.match(/router\.(post|get)\("\/internal\//g) || [];
    assert.ok(routen.length >= 28,
      `nur ${routen.length} interne Endpunkte gefunden — erwartet werden mindestens 28`);
  });

  it("jeder BullMQ-Arbeiter wird beobachtet, weil ALLE durch dieselbe Naht gehen", () => {
    const m = quelle("utils/metrics.js");
    assert.match(m, /taktNotieren/,
      "der Herzschlag haengt an instrumentWorker, nicht an vier Aufrufstellen");
    assert.match(m, /quelle: "takt"/);

    /* NICHT NUR ERWAEHNT, SONDERN VERDRAHTET. Die erste Fassung dieser Probe
     * pruefte allein, dass `taktNotieren` in der Datei vorkommt — beim
     * Rueckmutieren blieb sie gruen, als der Aufruf aus dem `completed`-Zweig
     * entfernt wurde: die Hilfsfunktion stand ja noch da. Eine Funktion, die
     * niemand ruft, ist kein Herzschlag. */
    const completed = m.match(/worker\.on\("completed"[\s\S]*?\n  \}\);/);
    assert.ok(completed, "der completed-Zweig muss auffindbar sein");
    assert.match(completed[0], /herzschlag\(/,
      "ein gelungener Lauf MUSS einen Herzschlag schreiben");
    assert.match(m, /worker\.on\("failed", \(job, err\)/,
      "auch ein gescheiterter Takt ist ein Herzschlag — gerade der");

    const w = quelle("workers/index.js");
    const mit = (w.match(/instrumentWorker\([^)]*\{ pool \}\)/g) || []).length;
    const alle = (w.match(/instrumentWorker\(/g) || []).length;
    assert.equal(mit, alle,
      `${mit} von ${alle} Arbeitern bekommen den Pool — ohne ihn schreibt keiner`);
  });

  it("M1.2 · der Takt ist wirklich eingeplant, nicht nur dokumentiert", () => {
    /* Der Kern von M1.2: "als Dienst im Stack, nicht als Zeile in der Doku".
     * Gemessen war der Zustand vorher: der Mechanismus vollstaendig gebaut,
     * ein Aufrufer, und den rief niemand. */
    const w = quelle("workers/index.js");
    assert.ok(w.includes('upsertJobScheduler("staffing-maintenance-15min"'),
      "ohne eingeplanten Job laeuft die Marktbefuellung weiterhin nie");
    assert.ok(w.includes('pattern: "*/15 * * * *"'),
      "15 Minuten — an dieser Aufgabe haengen Fristen im Stundenbereich");

    /* Der Takt muss am Arbeiter haengen, der ihn verarbeitet. Ein Job in einer
     * Warteschlange ohne Arbeiter ist eine Zeile in Redis, die niemand abholt. */
    const von = w.indexOf("const staffing = startStaffingWorker();");
    const bis = w.indexOf("const queues = [", von);
    assert.ok(von > 0 && bis > von, "der Staffing-Block muss auffindbar sein");
    assert.ok(w.slice(von, bis).includes("scheduleBetriebsTakte()"),
      "der Takt haengt am falschen Arbeiter — ein Job ohne Arbeiter wird nie abgeholt");

    const sw = quelle("workers/staffingWorker.js");
    assert.ok(sw.includes('job.name === "staffing-maintenance"'),
      "der Arbeiter muss den Takt von einem Zustelljob unterscheiden");
    assert.ok(sw.includes("sweepMarktpraesenz"),
      "die Marktbefuellung ist der Grund fuer diesen Takt");
    assert.ok(sw.includes("runStaffingMaintenance"));
  });

  it("der Takt ruft die Dienste direkt, nicht den eigenen HTTP-Endpunkt", () => {
    /* Ein Dienst, der sich selbst ueber das Netz aufruft, braucht ein
     * Geheimnis, eine erreichbare Adresse und einen zweiten Fehlerpfad. */
    const sw = quelle("workers/staffingWorker.js");
    assert.ok(!sw.includes("internal/staffing-maintenance"),
      "der Takt darf nicht den eigenen Endpunkt ueber HTTP rufen");
  });
  it("die Migration legt eine Zeile je Aufgabe an, kein Laufprotokoll", () => {
    const sql = fs.readFileSync(
      path.join(API, "..", "sql", "migrations", "212_betriebs_takt.sql"), "utf8");
    assert.match(sql, /aufgabe\s+TEXT\s+PRIMARY KEY/,
      "der Aufgabenname ist der Schluessel — ein Protokoll waechst unbegrenzt");
    assert.match(sql, /betriebs_takt_ergebnis_chk/);
    assert.match(sql, /betriebs_takt_quelle_chk/);
  });
});

/* ── Erreichbarkeit: der Stand muss im Staff CC ankommen ──────────────── */

describe("M1.1 · der Stand erreicht die Operations-Aufnahme", () => {
  /*
   * M-L8: "verdrahtet, aber unerreichbar" zaehlt nicht als geliefert. Der Takt
   * kann noch so genau rechnen — solange niemand ihn sieht, ist er derselbe
   * stille Automatismus, gegen den er gebaut wurde.
   */
  it("die Aufnahme traegt den Takt, und zwar gerechnet, nicht leer", async () => {
    const pool = musterPool((sql) => {
      if (sql.includes("betriebs_takt")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const auf = await loadOperationsSnapshot(pool);
    assert.ok(auf.betriebs_takt, "betriebs_takt fehlt in der Aufnahme");
    assert.equal(auf.betriebs_takt.zusammenfassung.ueberwacht, Object.keys(TAKTE).length);
    /* Ohne Zeilen ist der ehrliche Befund "alles still", nicht "alles gut". */
    assert.equal(auf.betriebs_takt.zusammenfassung.still, Object.keys(TAKTE).length);
    assert.equal(auf.betriebs_takt.zusammenfassung.ok, 0);
  });

  it("VORNE kommt nichts dazu — sonst verrutschen fremde Proben", async () => {
    /*
     * Muster-Pool-Proben zaehlen Abfragen der Reihe nach. Beim ersten Anlauf
     * stand der Takt ganz oben in der Aufnahme und haette jede bestehende
     * Sequenz um eins verschoben.
     *
     * Die erste Fassung dieser Probe verlangte, der Takt sei die LETZTE
     * Abfrage — und wurde prompt rot, als M1.3 das Versandprotokoll dahinter
     * haengte. Sie prueft jetzt, was wirklich zugesagt ist: die ERSTEN beiden
     * Abfragen bleiben, wo sie sind. Daran haengen die fremden Sequenzen;
     * was danach kommt, darf wachsen.
     */
    const pool = musterPool();
    await loadOperationsSnapshot(pool);
    assert.ok(pool.calls.length >= 2, "keine zwei Abfragen — die Aufnahme ist leer");
    assert.ok(pool.calls[0].sql.includes("staff_control_runbook_runs"),
      `erste Abfrage war: ${pool.calls[0].sql.slice(0, 60)}`);
    assert.ok(pool.calls[1].sql.includes("infrastructure_snapshots"),
      `zweite Abfrage war: ${pool.calls[1].sql.slice(0, 60)}`);
    /* Und der Takt laeuft ueberhaupt — sonst waere die Probe oben zufaellig. */
    assert.ok(pool.calls.some((c) => c.sql.includes("betriebs_takt")),
      "der Takt wurde gar nicht abgefragt");
  });

  it("ein Ausfall des Takts kostet EINE Kachel, nicht die Seite", async () => {
    const pool = musterPool((sql) => {
      if (sql.includes("betriebs_takt")) throw new Error("relation fehlt");
      return { rows: [{ runbook_key: "x", status: "success" }], rowCount: 1 };
    });
    const auf = await loadOperationsSnapshot(pool);
    /* taktStand faengt selbst ab und liefert "alles still" — die Aufnahme
     * darf davon nichts merken, und der Rest muss stehen bleiben. */
    assert.ok(auf.betriebs_takt, "der Takt haette einen ehrlichen Leerstand liefern muessen");
    assert.ok(Array.isArray(auf.recent_runs), "recent_runs wurde mitgerissen");
  });
});
