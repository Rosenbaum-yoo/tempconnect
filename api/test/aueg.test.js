/**
 * Die Überlassungshöchstdauer nach § 1 Abs. 1b AÜG — Welle K3.4, E-K3-1.
 *
 * WARUM DIESE DATEI SO AUSFÜHRLICH IST
 * Die Rechtsfolge einer Überschreitung ist erheblich: der Arbeitsvertrag mit dem
 * Verleiher wird unwirksam, es entsteht ein fingiertes Arbeitsverhältnis mit dem
 * Entleiher (§ 9 Abs. 1 Nr. 1b, § 10 Abs. 1), dazu ein Bußgeld. Die Prüfung war
 * deshalb bis zum 31.08.2026 bewusst NICHT gebaut — eine geratene gesetzliche
 * Frist ist schlimmer als gar keine. Sie existiert auf ausdrückliche Anweisung
 * (E-K3-1) und muss den Aufwand rechtfertigen.
 *
 * ZWEI FEHLER, DIE DIESE PROBEN BEIM BAUEN GEFANGEN HABEN — beide hätten einen
 * FALSCHALARM erzeugt, und ein Alarm, den man einmal als falsch erlebt hat,
 * wird beim nächsten Mal nicht geglaubt:
 *
 *   (1) Eine Kette vom 12.03. bis 12.04.2026 hat ihren rechnerischen
 *       18-Monats-Punkt am 12.09.2027. Wer den September 2027 aufschlug, bekam
 *       eine Überschreitung gemeldet — für eine Überlassung, die anderthalb
 *       Jahre vorher geendet hatte. Ursache: ein Rückfall auf „die letzte
 *       Kette", wenn keine ins Fenster reicht.
 *
 *   (2) `ueberschritten` rechnete gegen HEUTE, der Härtegrad gegen das FENSTER.
 *       Dieselbe Zeile sagte „hart" und „nicht überschritten".
 *
 * Run: node --test --test-force-exit test/aueg.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  monateSpaeter, tageZwischen, ketten, bewerteKette, auegBefunde,
  konfigurationen, ueberlassungen,
  HOECHSTDAUER_MONATE, UNTERBRECHUNG_MONATE, VORWARNUNG_MONATE
} from "../services/auegService.js";

function musterPool(fn) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      const s = String(sql || "");
      calls.push({ sql: s, params: params || [] });
      const r = fn ? await fn(s, params || []) : null;
      return r === undefined || r === null ? { rows: [], rowCount: 0 } : r;
    },
    find(teil) { return calls.filter((c) => c.sql.includes(teil)); }
  };
  return pool;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Die Datumsrechnung — bei einer gesetzlichen Frist kein Detail
 * ══════════════════════════════════════════════════════════════════════════ */

describe("AÜG · Monate rechnen, ohne am Monatsende zu verrutschen", () => {
  it("der 31. Januar plus ein Monat ist der 28. Februar, nicht der 3. März", () => {
    assert.equal(monateSpaeter("2026-01-31", 1), "2026-02-28");
    assert.equal(monateSpaeter("2024-01-31", 1), "2024-02-29", "Schaltjahr");
    assert.equal(monateSpaeter("2026-03-31", 1), "2026-04-30");
    assert.equal(monateSpaeter("2026-05-31", 1), "2026-06-30");
  });

  it("die 18 Monate der Regelfrist landen auf dem richtigen Tag", () => {
    assert.equal(monateSpaeter("2025-01-01", 18), "2026-07-01");
    assert.equal(monateSpaeter("2026-03-10", 18), "2027-09-10");
    assert.equal(monateSpaeter("2026-03-31", 18), "2027-09-30", "31.03. + 18 = 30.09.");
  });

  it("die Jahresgrenze wird nicht übersprungen", () => {
    assert.equal(monateSpaeter("2026-11-15", 3), "2027-02-15");
    assert.equal(monateSpaeter("2026-12-31", 24), "2028-12-31");
  });

  it("Tage zählen ohne Zeitzonen-Rutsch", () => {
    assert.equal(tageZwischen("2026-01-01", "2026-01-31"), 30);
    assert.equal(tageZwischen("2026-03-01", "2026-04-01"), 31);
    // Über die Sommerzeit-Umstellung: DACH wechselt Ende März.
    assert.equal(tageZwischen("2026-03-28", "2026-03-30"), 2);
    assert.equal(tageZwischen("2026-10-24", "2026-10-26"), 2);
    assert.equal(tageZwischen("2027-09-10", "2026-08-31"), -375, "rückwärts ist negativ");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Der rechtliche Kern: § 1 Abs. 1b Satz 2 — die Anrechnungskette
 * ══════════════════════════════════════════════════════════════════════════ */

describe("AÜG · die Anrechnungskette", () => {
  it("eine Pause von höchstens drei Monaten setzt die Kette FORT", () => {
    /* Satz 2: vorherige Überlassungen werden vollständig angerechnet, wenn
     * dazwischen nicht mehr als drei Monate liegen. */
    const k = ketten([
      { von: "2024-01-01", bis: "2024-06-30" },
      { von: "2024-08-01", bis: "2024-12-31" }   // Pause: ein Monat
    ]);
    assert.equal(k.length, 1, "zwei Überlassungen, eine Kette");
    assert.equal(k[0].von, "2024-01-01", "der Kettenbeginn bleibt stehen — daran hängt die Frist");
    assert.equal(k[0].bis, "2024-12-31");
    assert.equal(k[0].teile.length, 2);
  });

  it("eine Pause von MEHR als drei Monaten beginnt eine neue Kette", () => {
    const k = ketten([
      { von: "2024-01-01", bis: "2024-06-30" },
      { von: "2024-10-01", bis: "2024-12-31" }   // Pause: gut drei Monate
    ]);
    assert.equal(k.length, 2, "die Uhr wurde zurückgesetzt");
    assert.equal(k[1].von, "2024-10-01");
  });

  it("die Grenze liegt bei GENAU drei Monaten — sie zählt noch dazu", () => {
    /* Das Gesetz sagt „nicht mehr als drei Monate". Der letzte zulässige
     * Anschlusstag gehört also noch zur Kette. Ein Off-by-one an dieser Stelle
     * verschöbe die Frist um eine ganze Überlassung. */
    const anschluss = ketten([
      { von: "2024-01-01", bis: "2024-06-30" },
      { von: "2024-09-30", bis: "2024-12-31" }   // exakt drei Monate später
    ]);
    assert.equal(anschluss.length, 1, "genau drei Monate schließen noch an");

    const zuSpaet = ketten([
      { von: "2024-01-01", bis: "2024-06-30" },
      { von: "2024-10-01", bis: "2024-12-31" }   // ein Tag mehr
    ]);
    assert.equal(zuSpaet.length, 2, "ein Tag darüber unterbricht");
  });

  it("überlappende Überlassungen sind derselbe Zeitraum, nicht zwei Ketten", () => {
    const k = ketten([
      { von: "2024-01-01", bis: "2024-08-31" },
      { von: "2024-06-01", bis: "2024-12-31" }
    ]);
    assert.equal(k.length, 1);
    assert.equal(k[0].bis, "2024-12-31", "die Kette reicht bis zum späteren Ende");
  });

  it("eine Überlassung ohne Enddatum lässt die Kette offen", () => {
    const k = ketten([
      { von: "2024-01-01", bis: "2024-06-30" },
      { von: "2024-07-01", bis: null }
    ]);
    assert.equal(k.length, 1);
    assert.equal(k[0].offen, true);
    assert.equal(k[0].bis, null);
  });

  it("nach einer offenen Kette beginnt keine neue — sie hat kein Ende", () => {
    /* Eine offene Überlassung kann nicht unterbrochen sein. Alles, was danach
     * beginnt, gehört dazu. */
    const k = ketten([
      { von: "2024-01-01", bis: null },
      { von: "2030-01-01", bis: "2030-06-30" }
    ]);
    assert.equal(k.length, 1);
    assert.equal(k[0].offen, true);
  });

  it("die Reihenfolge der Eingabe ist gleichgültig", () => {
    const vorwaerts = ketten([
      { von: "2024-01-01", bis: "2024-06-30" },
      { von: "2024-08-01", bis: "2024-12-31" }
    ]);
    const rueckwaerts = ketten([
      { von: "2024-08-01", bis: "2024-12-31" },
      { von: "2024-01-01", bis: "2024-06-30" }
    ]);
    assert.deepEqual(rueckwaerts.map((k) => [k.von, k.bis]), vorwaerts.map((k) => [k.von, k.bis]));
  });

  it("eine abweichende Unterbrechungsfrist wird beachtet", () => {
    const eng = ketten(
      [{ von: "2024-01-01", bis: "2024-06-30" }, { von: "2024-08-01", bis: "2024-12-31" }],
      { unterbrechungMonate: 0 }
    );
    assert.equal(eng.length, 2, "ohne zulässige Pause unterbricht jeder Abstand");
  });

  it("leere und unbrauchbare Eingaben ergeben keine Kette", () => {
    assert.deepEqual(ketten([]), []);
    assert.deepEqual(ketten(null), []);
    assert.deepEqual(ketten([{ bis: "2024-01-01" }]), [], "ohne Beginn kein Zeitraum");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Die Bewertung gegen die Frist
 * ══════════════════════════════════════════════════════════════════════════ */

describe("AÜG · wann eine Kette die Frist erreicht", () => {
  const kette = { von: "2026-03-10", bis: "2027-09-11", offen: false, teile: [1, 2] };

  it("der Überschreitungstag ist Kettenbeginn plus Höchstdauer", () => {
    const b = bewerteKette(kette, { heute: "2026-08-31" });
    assert.equal(b.ueberschreitung_am, "2027-09-10");
    assert.equal(b.hoechstdauer_monate, HOECHSTDAUER_MONATE);
    assert.equal(HOECHSTDAUER_MONATE, 18, "§ 1 Abs. 1b Satz 1");
    assert.equal(UNTERBRECHUNG_MONATE, 3, "§ 1 Abs. 1b Satz 2");
  });

  it("am Stichtag VOR der Frist ist sie nicht erreicht", () => {
    /* Der Fehler, den diese Probe fängt: `ueberschritten` rechnete gegen heute,
     * der Härtegrad gegen das Fenster — dieselbe Zeile sagte „hart" und „nicht
     * überschritten". */
    const b = bewerteKette(kette, { heute: "2026-08-31", stichtag: "2027-06-30" });
    assert.equal(b.ueberschritten, false, "am 30.06. ist der 10.09. noch nicht erreicht");
    assert.equal(b.stichtag, "2027-06-30");
  });

  it("am Stichtag NACH der Frist ist sie erreicht", () => {
    const b = bewerteKette(kette, { heute: "2026-08-31", stichtag: "2027-09-30" });
    assert.equal(b.ueberschritten, true);
  });

  it("`bereits_ueberschritten` bleibt auf HEUTE bezogen", () => {
    /* Zwei verschiedene Fragen: „ist die Frist in dem Monat, den ich ansehe,
     * gerissen?" und „ist sie jetzt gerissen?". Beide werden gebraucht. */
    const b = bewerteKette(kette, { heute: "2026-08-31", stichtag: "2027-09-30" });
    assert.equal(b.ueberschritten, true);
    assert.equal(b.bereits_ueberschritten, false);
    assert.equal(b.tage_bis_ueberschreitung, 375);
  });

  it("eine offene Kette läuft bis zum Stichtag", () => {
    const offen = { von: "2026-03-10", bis: null, offen: true, teile: [1] };
    assert.equal(bewerteKette(offen, { stichtag: "2027-09-30" }).ueberschritten, true);
    assert.equal(bewerteKette(offen, { stichtag: "2027-01-01" }).ueberschritten, false);
  });

  it("eine abweichende Höchstdauer verschiebt die Frist", () => {
    /* § 1 Abs. 1b Sätze 3 ff.: Tarifverträge der Einsatzbranche dürfen abweichen.
     * In der Metall- und Elektroindustrie sind 24, 36 oder 48 Monate üblich. */
    const b = bewerteKette(kette, { hoechstdauerMonate: 36, stichtag: "2027-09-30" });
    assert.equal(b.ueberschreitung_am, "2029-03-10");
    assert.equal(b.ueberschritten, false, "mit 36 Monaten ist 2027 noch lange nichts");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Die Befunde — hier saßen beide Falschalarme
 * ══════════════════════════════════════════════════════════════════════════ */

describe("AÜG · welche Kette für ein Fenster zählt", () => {
  function befundPool(zeitraeume, konfig = null) {
    return musterPool((s) => {
      if (/FROM aueg_konfiguration/.test(s)) return { rows: konfig ? [konfig] : [] };
      if (/FROM worker_assignment_links l/.test(s)) {
        return { rows: zeitraeume.map((z) => ({
          worker_user_id: "w-1", org_id: "org-1",
          von: z.von, bis: z.bis ?? "9999-12-31",
          assignment_id: z.assignment_id || "a-1", supplier_org_id: "lief-1"
        })) };
      }
      return { rows: [] };
    });
  }

  const paar = [{ worker_user_id: "w-1", org_id: "org-1", kraft_name: "Meier", assignment_id: "a-1" }];

  it("FALSCHALARM (1): eine längst beendete Kette ist kein Befund", async () => {
    /* Kette 12.03. bis 12.04.2026 — rechnerischer 18-Monats-Punkt am 12.09.2027.
     * Die erste Fassung meldete im September 2027 eine Überschreitung für eine
     * Überlassung, die anderthalb Jahre vorher geendet hatte. */
    const p = befundPool([{ von: "2026-03-12", bis: "2026-04-12" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-09-01", fensterBis: "2027-09-30", heute: "2026-08-31"
    });
    assert.deepEqual(r.befunde, [],
      "eine Kette, die das Fenster nicht erreicht, ist für dieses Fenster kein Befund");
  });

  it("eine Kette, die das Fenster erreicht UND die Frist reißt, ist ein harter Befund", async () => {
    const p = befundPool([{ von: "2026-03-10", bis: "2027-09-11" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-09-01", fensterBis: "2027-09-30", heute: "2026-08-31"
    });
    assert.equal(r.befunde.length, 1);
    assert.equal(r.befunde[0].grad, "hart");
    assert.equal(r.befunde[0].ueberschreitung_am, "2027-09-10");
    assert.equal(r.befunde[0].ueberschritten, true);
    assert.equal(r.befunde[0].kraft_name, "Meier");
  });

  it("drei Monate vorher ist es eine weiche Vorwarnung, kein Alarm", async () => {
    const p = befundPool([{ von: "2026-03-10", bis: "2027-09-11" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-06-01", fensterBis: "2027-06-30", heute: "2026-08-31"
    });
    assert.equal(r.befunde.length, 1);
    assert.equal(r.befunde[0].grad, "weich");
    assert.equal(r.befunde[0].ueberschritten, false,
      "im Juni ist der September noch nicht erreicht — sonst widerspräche die Zeile sich selbst");
    assert.equal(VORWARNUNG_MONATE, 3);
  });

  it("weit vor der Frist gibt es gar nichts zu melden", async () => {
    const p = befundPool([{ von: "2026-03-10", bis: "2027-09-11" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2026-04-01", fensterBis: "2026-04-30", heute: "2026-08-31"
    });
    assert.deepEqual(r.befunde, []);
  });

  it("eine beendete Überlassung bekommt keine Vorwarnung mehr", async () => {
    /* Bei einer Überlassung, die im Fenster endet, gibt es nichts zu verhindern —
     * eine Warnung dort wäre Lärm. */
    const p = befundPool([{ von: "2026-03-10", bis: "2027-06-15" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-06-01", fensterBis: "2027-06-30", heute: "2026-08-31"
    });
    assert.deepEqual(r.befunde, []);
  });

  it("die Kette wächst über mehrere Überlassungen — und die Frist mit ihr", async () => {
    /* Genau der Fall, den § 1 Abs. 1b Satz 2 im Blick hat: drei kurze
     * Überlassungen mit kurzen Pausen ergeben eine lange Kette. Wer nur die
     * einzelne Überlassung ansieht, sieht nie eine Überschreitung. */
    const p = befundPool([
      { von: "2026-01-01", bis: "2026-06-30", assignment_id: "a-1" },
      { von: "2026-08-01", bis: "2026-12-31", assignment_id: "a-2" },
      { von: "2027-02-01", bis: null, assignment_id: "a-3" }
    ]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-07-01", fensterBis: "2027-07-31", heute: "2027-07-15"
    });
    assert.equal(r.befunde.length, 1);
    assert.equal(r.befunde[0].von, "2026-01-01", "die Frist hängt am Kettenbeginn");
    assert.equal(r.befunde[0].ueberschreitung_am, "2027-07-01");
    assert.equal(r.befunde[0].grad, "hart");
    assert.equal(r.befunde[0].ueberlassungen, 3, "alle drei zählen");
  });

  it("eine tariflich abweichende Frist wird beachtet — mit Grundlage", async () => {
    const p = befundPool([{ von: "2026-03-10", bis: "2027-09-11" }], {
      org_id: "org-1", hoechstdauer_monate: 48, unterbrechung_monate: 3,
      grundlage: "TV BZ ME NRW, § 3 Abs. 2 — 48 Monate"
    });
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-09-01", fensterBis: "2027-09-30", heute: "2026-08-31"
    });
    assert.deepEqual(r.befunde, [], "mit 48 Monaten reißt 2027 nichts");
  });

  it("die Grenze der Datenlage steht in JEDER Antwort — auch in der leeren", async () => {
    /* Wir sehen nur Überlassungen auf DIESER Plattform. Lief dieselbe Kraft
     * zuvor über einen anderen Verleiher, fehlt die Zeit — obwohl das Gesetz
     * sie anrechnen würde. Eine Frist, die sich sicherer gibt, als sie ist,
     * wäre die schlechtere Variante von gar keiner. */
    const leer = await auegBefunde(musterPool(() => ({ rows: [] })), [], {});
    assert.equal(leer.nur_plattformdaten, true);
    assert.deepEqual(leer.befunde, []);
  });

  it("FALSCHALARM (1), ISOLIERT: eine Kette, die das Fenster nicht erreicht, zählt nie", async () => {
    /* DIESE PROBE TRENNT ZWEI RIEGEL, DIE SICH SONST GEGENSEITIG DECKEN.
     *
     * Beim Rückmutieren fiel auf: entfernt man den Rückfall auf „die letzte
     * Kette", bleibt die Suite grün — weil der zweite Riegel (`ueberschritten`)
     * denselben Fall auch abfängt. Und umgekehrt. Zwei Riegel, die einander
     * verdecken, sind beim nächsten Umbau einer zu viel und einer zu wenig.
     *
     * Hier reißt die alte Kette ihre Frist WIRKLICH (drei Jahre, 2020–2022),
     * liegt aber Jahre vor dem Fenster. Ohne den Rückfall-Riegel würde sie im
     * September 2027 als harter Befund gemeldet. */
    const p = befundPool([{ von: "2020-01-01", bis: "2022-12-31" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-09-01", fensterBis: "2027-09-30", heute: "2026-08-31"
    });
    assert.deepEqual(r.befunde, [],
      "eine Überlassung, die 2022 endete, ist kein Befund für den September 2027 — "
      + "auch dann nicht, wenn sie damals zu lang war");
  });

  it("FALSCHALARM (2), ISOLIERT: das Fristdatum im Fenster genügt nicht", async () => {
    /* Der Gegenschnitt zur Probe darüber: die Kette REICHT ins Fenster, endet
     * dort aber, BEVOR sie ihre eigene Frist erreicht. Das Fristdatum liegt
     * trotzdem im Fenster. Ohne den `ueberschritten`-Riegel würde das als
     * harter Befund gemeldet — für eine Überlassung, die vorher aufgehört hat. */
    const p = befundPool([{ von: "2026-01-15", bis: "2027-07-05" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-07-01", fensterBis: "2027-07-31", heute: "2026-08-31"
    });
    assert.deepEqual(r.befunde, [],
      "die Überlassung endete am 05.07., die Frist wäre am 15.07. gerissen — "
      + "sie ist es nicht");
  });

  it("und genau einen Tag später reißt sie doch", async () => {
    /* Die Gegenprobe, ohne die die beiden darüber nur streng wären statt
     * richtig: dieselbe Kette, zehn Tage länger. */
    const p = befundPool([{ von: "2026-01-15", bis: "2027-07-15" }]);
    const r = await auegBefunde(p, paar, {
      fensterVon: "2027-07-01", fensterBis: "2027-07-31", heute: "2026-08-31"
    });
    assert.equal(r.befunde.length, 1);
    assert.equal(r.befunde[0].grad, "hart");
    assert.equal(r.befunde[0].ueberschreitung_am, "2027-07-15");
  });

  it("stornierte Einsätze zählen nicht mit", async () => {
    const p = befundPool([{ von: "2026-01-01", bis: null }]);
    await auegBefunde(p, paar, { fensterVon: "2026-04-01", fensterBis: "2026-04-30" });
    const [c] = p.find("FROM worker_assignment_links l");
    assert.match(c.sql, /a\.status <> 'cancelled'/,
      "ein stornierter Einsatz hat nie stattgefunden und darf die Frist nicht anschieben");
  });

  it("die Geschichte wird NICHT auf das Fenster beschränkt", async () => {
    /* Ein Ausschnitt ergäbe eine zu kurze Kette und damit eine übersehene
     * Überschreitung — der gefährlichste Fehler, den diese Prüfung machen kann. */
    const p = befundPool([{ von: "2026-01-01", bis: null }]);
    await auegBefunde(p, paar, { fensterVon: "2027-07-01", fensterBis: "2027-07-31" });
    const [c] = p.find("FROM worker_assignment_links l");

    /* Die Zusicherung zielt auf den SQL-TEXT, nicht auf das Ergebnis: der
     * Muster-Pool beantwortet jede Abfrage gleich und würde eine zusätzliche
     * Datumsschranke nie zeigen. Beim Rückmutieren ist genau das passiert —
     * eine eingefügte `AND l.start_date >= DATE '...'` blieb unbemerkt.
     *
     * Deshalb: die WHERE-Bedingungen werden AUFGEZÄHLT. Jede weitere Schranke
     * auf `start_date` oder `end_date` fällt damit auf, egal in welche
     * Richtung sie zeigt. */
    const bedingungen = c.sql
      .slice(c.sql.indexOf("WHERE"))
      .split(/\bAND\b/)
      .map((t) => t.trim())
      .filter(Boolean);

    const datumsschranken = bedingungen.filter((b) => /start_date|end_date/.test(b));
    assert.deepEqual(datumsschranken, [],
      "die Abfrage darf die Geschichte NICHT am Fenster abschneiden — ein Ausschnitt "
      + "ergäbe eine zu kurze Kette und damit eine übersehene Überschreitung. "
      + `Gefunden: ${JSON.stringify(datumsschranken)}`);

    assert.match(c.sql, /worker_user_id = ANY/, "alle Kräfte in EINER Abfrage — kein N+1");
    assert.match(c.sql, /l\.org_id = ANY/);
    assert.equal(c.params.length, 2, "nur Kräfte und Entleiher — kein Zeitfenster");
  });
});

describe("AÜG · die Konfiguration", () => {
  it("ohne Eintrag gilt die gesetzliche Voreinstellung", async () => {
    const map = await konfigurationen(musterPool(() => ({ rows: [] })), ["org-1"]);
    assert.equal(map.size, 0, "keine Zeile heißt: 18 und 3 gelten");
  });

  it("WIRFT NIE — ein Ausfall führt zur STRENGEREN Annahme", async () => {
    /* Wenn die Konfiguration nicht lesbar ist, gilt überall 18/3. Ein Ausfall
     * darf hier nicht dazu führen, dass eine Überschreitung unbemerkt bleibt. */
    const p = musterPool(() => { throw new Error("relation aueg_konfiguration does not exist"); });
    const map = await konfigurationen(p, ["org-1"]);
    assert.equal(map.size, 0);
  });

  it("alle Organisationen in EINER Abfrage", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await konfigurationen(p, ["org-1", "org-2", "org-1", null]);
    assert.equal(p.calls.length, 1);
    assert.deepEqual(p.calls[0].params[0], ["org-1", "org-2"], "doppelte und leere fallen weg");
  });

  it("ohne Organisationen wird gar nicht gefragt", async () => {
    const p = musterPool(() => ({ rows: [] }));
    await konfigurationen(p, []);
    assert.equal(p.calls.length, 0);
  });
});

describe("AÜG · die Überlassungen kommen ohne N+1", () => {
  it("eine Abfrage, egal wie viele Paare", async () => {
    const viele = Array.from({ length: 200 }, (_, i) => ({
      worker_user_id: `w-${i}`, org_id: `o-${i % 7}`
    }));
    const p = musterPool(() => ({ rows: [] }));
    await ueberlassungen(p, viele);
    assert.equal(p.calls.length, 1);
  });

  it("ohne Paare wird nicht gefragt", async () => {
    const p = musterPool(() => ({ rows: [] }));
    assert.equal((await ueberlassungen(p, [])).size, 0);
    assert.equal(p.calls.length, 0);
  });

  it("die Platzhalter-Unendlichkeit wird nicht als Datum ausgeliefert", async () => {
    const p = musterPool(() => ({ rows: [{
      worker_user_id: "w-1", org_id: "o-1", von: "2026-01-01", bis: "9999-12-31",
      assignment_id: "a-1", supplier_org_id: "s-1"
    }] }));
    const map = await ueberlassungen(p, [{ worker_user_id: "w-1", org_id: "o-1" }]);
    assert.equal(map.get("w-1|o-1")[0].bis, null,
      "`9999-12-31` ist die Unendlichkeit der Abfrage, kein Enddatum");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   K3.6 · die Grenzen der Kettenbildung, aus der Mutationsprobe

   Stryker hat gegen `auegService` 255 Mutanten gefahren; 56 haben überlebt, und
   die interessanten saßen alle im selben Bereich: den ENTSCHEIDUNGEN der
   Kettenbildung und der Bewertung. Ein stiller Flip dort ändert nicht die
   Darstellung, sondern die RECHTSFOLGE — § 9 Abs. 1 Nr. 1b und § 10 Abs. 1 AÜG
   knüpfen an die Überschreitung ein fingiertes Arbeitsverhältnis beim Entleiher.

   Die Projektregel verlangt für solche Logik null Überlebende im
   Entscheidungs-Zweig. Diese Proben sind genau dafür geschrieben: jede pinnt
   eine GRENZE, nicht einen Normalfall.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("K3.6 · die Kettenbildung an ihren Grenzen", () => {
  const REGEL = { hoechstdauerMonate: 18, unterbrechungMonate: 3 };

  it("die Pause zählt AB DEM TAG NACH dem Ende — der letzte zulässige Anschluss zählt noch dazu", () => {
    /* Ende 30.06., drei Monate Pause → spätester Anschluss 30.09. Wer am 30.09.
     * beginnt, setzt die Kette FORT; wer am 01.10. beginnt, beginnt eine neue.
     * Ein Flip von `<=` auf `<` verschiebt die Grenze um einen Tag — und mit ihr
     * den Fristbeginn um Monate. */
    const gerade = ketten([
      { von: "2025-01-01", bis: "2025-06-30" },
      { von: "2025-09-30", bis: "2025-12-31" }
    ], REGEL);
    assert.equal(gerade.length, 1, "am letzten zulässigen Tag wird fortgesetzt");
    assert.equal(gerade[0].von, "2025-01-01", "der Kettenbeginn bleibt stehen — daran hängt die Frist");

    const knapp = ketten([
      { von: "2025-01-01", bis: "2025-06-30" },
      { von: "2025-10-01", bis: "2025-12-31" }
    ], REGEL);
    assert.equal(knapp.length, 2, "einen Tag später ist die Kette unterbrochen");
    assert.equal(knapp[1].von, "2025-10-01", "die neue Kette beginnt neu — die Frist auch");
    /* Und sie ist GESCHLOSSEN. Eine neue Kette, die faelschlich als offen gilt,
     * endet nie — sie waechst gegen jede spaetere Ueberlassung weiter und
     * meldet irgendwann eine Ueberschreitung, die es nicht gibt. */
    assert.equal(knapp[1].offen, false, "sie hat ein Ende, also ist sie nicht offen");
    assert.equal(knapp[1].bis, "2025-12-31");
    assert.equal(knapp[0].offen, false, "auch die erste Kette ist geschlossen");
  });

  it("eine OFFENE Überlassung schluckt alles Spätere — sie kann nicht unterbrochen sein", () => {
    const k = ketten([
      { von: "2025-01-01", bis: null },
      { von: "2027-06-01", bis: "2027-08-31" }
    ], REGEL);
    assert.equal(k.length, 1, "was kein Ende hat, hat keine Pause danach");
    assert.equal(k[0].offen, true);
    assert.equal(k[0].bis, null, "eine offene Kette bekommt kein Enddatum angehängt");
    assert.equal(k[0].teile.length, 2);
  });

  it("eine geschlossene Kette wird durch eine offene Fortsetzung selbst offen", () => {
    const k = ketten([
      { von: "2025-01-01", bis: "2025-06-30" },
      { von: "2025-08-01", bis: null }
    ], REGEL);
    assert.equal(k.length, 1);
    assert.equal(k[0].offen, true, "ohne Ende ist die Kette offen");
    assert.equal(k[0].bis, null, "das alte Ende darf nicht stehen bleiben");
  });

  it("eine kürzere Fortsetzung verkürzt die Kette NICHT", () => {
    /* Zwei Überlassungen, die zweite endet FRÜHER als die erste. Ohne den
     * Vergleich `z.bis > letzte.bis` schrumpfte die Kette — und eine Frist,
     * die längst gerissen ist, sähe wieder eingehalten aus. */
    const k = ketten([
      { von: "2025-01-01", bis: "2025-12-31" },
      { von: "2025-03-01", bis: "2025-06-30" }
    ], REGEL);
    assert.equal(k.length, 1);
    assert.equal(k[0].bis, "2025-12-31", "das spätere Ende gewinnt");
  });

  it("eine einzelne Überlassung ohne Ende ist von Anfang an offen", () => {
    const [k] = ketten([{ von: "2025-01-01", bis: null }], REGEL);
    assert.equal(k.offen, true);
    assert.equal(k.bis, null);
  });

  it("Zeiträume kommen in ZEITLICHER Reihenfolge in die Kette, nicht in Eingabereihenfolge", () => {
    /* Verdrehte Eingabe: die spätere zuerst. Ohne Sortierung entstünde als
     * Kettenbeginn der 01.06. statt des 01.01. — und die Frist begänne fünf
     * Monate zu spät. */
    const k = ketten([
      { von: "2025-06-01", bis: "2025-08-31" },
      { von: "2025-01-01", bis: "2025-03-31" }
    ], REGEL);
    assert.equal(k.length, 1);
    assert.equal(k[0].von, "2025-01-01", "der früheste Beginn trägt die Frist");
  });
});

describe("K3.6 · die Bewertung an ihren Grenzen", () => {
  const REGEL = { hoechstdauerMonate: 18, unterbrechungMonate: 3, heute: "2026-01-01" };

  it("die Frist ist AM Überschreitungstag erreicht, nicht erst danach", () => {
    /* Beginn 01.01.2025 + 18 Monate = 01.07.2026. Eine Kette bis zum 30.06.
     * hält; eine bis zum 01.07. reisst. Ein Flip von `>=` auf `>` verschöbe die
     * Rechtsfolge um einen Tag. */
    const haelt = bewerteKette(
      { von: "2025-01-01", bis: "2026-06-30", offen: false, teile: [] },
      { ...REGEL, stichtag: "2026-06-30" });
    assert.equal(haelt.ueberschreitung_am, "2026-07-01");
    assert.equal(haelt.ueberschritten, false, "einen Tag vorher hält sie noch");

    const reisst = bewerteKette(
      { von: "2025-01-01", bis: "2026-07-01", offen: false, teile: [] },
      { ...REGEL, stichtag: "2026-07-01" });
    assert.equal(reisst.ueberschritten, true, "am Überschreitungstag selbst ist sie erreicht");
  });

  it("der Stichtag klemmt das Ende — eine Kette zählt nur bis dahin", () => {
    /* Eine Kette, die bis zum 30.09. geplant ist, hat am 30.06. die Frist NOCH
     * NICHT erreicht. Ohne die Klemme meldete jeder Monat vor der Frist bereits
     * eine Überschreitung — und der erste Falschalarm entwertet alle weiteren. */
    const kette = { von: "2025-01-01", bis: "2026-09-30", offen: false, teile: [] };

    const imJuni = bewerteKette(kette, { ...REGEL, stichtag: "2026-06-30" });
    assert.equal(imJuni.ueberschritten, false, "am 30.06. ist die Frist noch nicht erreicht");

    const imJuli = bewerteKette(kette, { ...REGEL, stichtag: "2026-07-31" });
    assert.equal(imJuli.ueberschritten, true, "im Juli schon");
  });

  it("eine OFFENE Kette wird am Stichtag gemessen, nicht an einem Ende, das sie nicht hat", () => {
    const offen = { von: "2025-01-01", bis: null, offen: true, teile: [] };
    assert.equal(bewerteKette(offen, { ...REGEL, stichtag: "2026-06-30" }).ueberschritten, false);
    assert.equal(bewerteKette(offen, { ...REGEL, stichtag: "2026-07-01" }).ueberschritten, true);
  });

  it("`bereits_ueberschritten` misst gegen HEUTE, `ueberschritten` gegen den Stichtag", () => {
    /* Zwei verschiedene Fragen, und sie dürfen sich nicht vermischen: die eine
     * ist ein Zustand, die andere eine Vorhersage. Genau hier lagen in K3.4
     * zwei Falschalarme. */
    const kette = { von: "2025-01-01", bis: null, offen: true, teile: [] };
    const b = bewerteKette(kette, { ...REGEL, heute: "2026-01-01", stichtag: "2027-09-30" });
    assert.equal(b.ueberschritten, true, "am Stichtag im Jahr 2027 ist sie gerissen");
    assert.equal(b.bereits_ueberschritten, false, "heute (01.01.2026) noch nicht");

    const c = bewerteKette(kette, { ...REGEL, heute: "2026-07-01", stichtag: "2026-07-01" });
    assert.equal(c.bereits_ueberschritten, true, "am Überschreitungstag ist es auch heute so weit");
  });

  it("eine abweichende Höchstdauer verschiebt den Überschreitungstag mit", () => {
    /* Tarifverträge der Einsatzbranche dürfen abweichen (24, 36, 48 Monate sind
     * in der Metall- und Elektroindustrie üblich). Eine fest verdrahtete 18 wäre
     * für einen Teil der Kunden falsch — und zwar in der gefährlichen Richtung. */
    const kette = { von: "2025-01-01", bis: "2027-06-30", offen: false, teile: [] };
    const gesetzlich = bewerteKette(kette, { ...REGEL, stichtag: "2027-06-30" });
    assert.equal(gesetzlich.ueberschreitung_am, "2026-07-01");
    assert.equal(gesetzlich.ueberschritten, true);

    const tariflich = bewerteKette(kette,
      { ...REGEL, hoechstdauerMonate: 36, stichtag: "2027-06-30" });
    assert.equal(tariflich.ueberschreitung_am, "2028-01-01");
    assert.equal(tariflich.ueberschritten, false, "mit 36 Monaten hält dieselbe Kette");
    assert.equal(tariflich.hoechstdauer_monate, 36, "die geltende Dauer steht in der Antwort");
  });
});
