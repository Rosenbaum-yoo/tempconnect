/**
 * Wird jeder erwartete Takt auch wirklich eingeplant?
 *
 * `betriebsTaktService.TAKTE` ist das SOLL — die eingefrorene Registratur dessen,
 * was laufen muss. Ob etwas es auch AUSLOEST, steht woanders: in den
 * `upsertJobScheduler`-Aufrufen in `api/workers/index.js`. Zwischen beiden lag
 * bis zum 2026-09-03 eine Luecke, die nur im laufenden Betrieb sichtbar war —
 * die Kachel im Staff CC zeigt `still`, sobald ein Takt nie lief.
 *
 * GEMESSEN AM 2026-09-03: von zehn erwarteten Takten waren FUENF eingeplant.
 * Die anderen fuenf sind Geld und Lebenszyklus:
 *
 *   recurring-billing            wiederkehrende Abo-Rechnungen erzeugen
 *   dunning-sweep                Mahnstufen und Hard-Lock bei Zahlungsausfall
 *   invoice-overdue-scan         Rechnungen auf faellig setzen
 *   subscription-lifecycle-tick  Abo-Aktivierung zum Stichtag
 *   expire-reservations          abgelaufene Reservierungen freigeben
 *
 * Das ist kein Versehen im Code, sondern eine offene BETRIEBSENTSCHEIDUNG
 * (F5/F29 im M0-Bericht). Deshalb faerbt dieser Waechter sie nicht rot — er
 * verlangt, dass jede Abweichung BENANNT ist (`ohne_einplanung` in der
 * Registratur) und dass eine Benennung verschwindet, sobald der Takt laeuft.
 *
 * WARUM UEBERHAUPT EIN TEST, WO DIE KACHEL ES DOCH ZEIGT
 * Die Kachel zeigt es dem, der hinsieht, und erst im Betrieb. Ein neuer Takt,
 * der heute in die Registratur geschrieben und morgen vergessen wird, faellt
 * dort erst auf, wenn jemand ihn vermisst. Hier faellt er beim Bauen auf.
 *
 * Lauf: node --test --test-force-exit test/takteEingeplant.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TAKTE } from "../services/betriebsTaktService.js";
import { LAEUFE } from "../services/betriebsTaktLaeufe.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");
const WORKER_DATEI = path.join(API, "workers", "index.js");

/**
 * Welche Aufgaben legt `workers/index.js` als wiederkehrenden Auftrag an?
 * Rein aus dem Quelltext gelesen — der Test soll kein Redis brauchen.
 */
export function findeEingeplant(quelle) {
  const gefunden = new Map();
  const muster = /upsertJobScheduler\(\s*"([^"]+)"\s*,\s*\{\s*pattern:\s*"([^"]+)"\s*\}\s*,\s*\{\s*name:\s*"([^"]+)"/g;
  for (const m of quelle.matchAll(muster)) {
    gefunden.set(m[3], { schluessel: m[1], muster: m[2] });
  }
  return gefunden;
}

/* Die Capacity-Takte stehen in der Registratur mit Praefix, im Worker ohne. */
function nachschlagen(eingeplant, aufgabe) {
  return eingeplant.get(aufgabe.replace(/^capacity:/, "")) || eingeplant.get(aufgabe) || null;
}

const quelle = fs.readFileSync(WORKER_DATEI, "utf8");
const eingeplant = findeEingeplant(quelle);

describe("Betriebstakte — Soll und Einplanung", () => {

  it("die Registratur und der Worker sind beide auffindbar", () => {
    /* Ohne diese Probe waere der ganze Waechter lautlos gruen, sobald jemand
       die Datei verschiebt oder das Muster aendert: eine leere Menge besteht
       jede Schleife. */
    assert.ok(Object.keys(TAKTE).length >= 8,
      `nur ${Object.keys(TAKTE).length} Eintraege in TAKTE — die Registratur ist `
      + "geschrumpft oder wird nicht mehr gefunden");
    assert.ok(eingeplant.size >= 4,
      `nur ${eingeplant.size} upsertJobScheduler-Aufrufe gefunden — entweder plant `
      + "der Worker nichts mehr ein, oder das Muster im Quelltext hat sich geaendert "
      + "und dieser Waechter liest ins Leere");
  });

  it("jede erwartete Aufgabe ist entweder eingeplant oder benannt", () => {
    const stumm = [];
    for (const [aufgabe, soll] of Object.entries(TAKTE)) {
      if (nachschlagen(eingeplant, aufgabe)) continue;
      if (typeof soll.ohne_einplanung === "string" && soll.ohne_einplanung.length >= 60) continue;
      stumm.push(`${aufgabe}: steht als Soll (alle ${soll.intervall_min} min) und wird `
        + "von nichts ausgeloest. Entweder in api/workers/index.js einplanen ODER "
        + "`ohne_einplanung` mit einem tragfaehigen Grund setzen (mind. 60 Zeichen).");
    }
    assert.deepStrictEqual(stumm, [],
      "Diese Aufgaben laufen nie. Der Zustand ist dauerhaft `still` — die Kachel im "
      + "Staff CC zeigt es, aber erst im Betrieb und nur dem, der hinsieht.\n  "
      + stumm.join("\n  "));
  });

  it("eine Benennung verschwindet, sobald der Takt laeuft", () => {
    /*
     * Die andere Richtung, und die wichtigere: ein Grund, der stehen bleibt,
     * nachdem die Aufgabe eingeplant wurde, behauptet dauerhaft eine Luecke, die
     * es nicht mehr gibt. Ein Register, das geschlossene Luecken weiter als offen
     * fuehrt, ist genauso irrefuehrend wie eines, das offene verschweigt.
     */
    const veraltet = [];
    for (const [aufgabe, soll] of Object.entries(TAKTE)) {
      if (!soll.ohne_einplanung) continue;
      const g = nachschlagen(eingeplant, aufgabe);
      if (g) {
        veraltet.push(`${aufgabe}: traegt einen Grund fuer die fehlende Einplanung, `
          + `wird aber eingeplant (${g.muster}). Den Grund entfernen.`);
      }
    }
    assert.deepStrictEqual(veraltet, [], veraltet.join("\n  "));
  });

  it("der eingeplante Takt ist nicht traeger als das Soll", () => {
    /*
     * Ein Takt, der seltener laeuft als die Registratur erwartet, faerbt den
     * Waechter im Betrieb dauerhaft `spaet` — und wer das ein paar Tage sieht,
     * hoert auf hinzusehen. Geprueft wird nur das grobe Raster (Minuten-Muster
     * gegen Stunden-/Tagesmuster), nicht die exakte Cron-Semantik: ein Waechter,
     * der Cron nachbaut, hat selbst Fehler.
     */
    const zuTraege = [];
    for (const [aufgabe, soll] of Object.entries(TAKTE)) {
      const g = nachschlagen(eingeplant, aufgabe);
      if (!g) continue;
      const minutentakt = /^\*\/(\d+) \* \* \* \*$/.exec(g.muster);
      if (minutentakt) {
        const ist = Number(minutentakt[1]);
        if (ist > soll.intervall_min) {
          zuTraege.push(`${aufgabe}: laeuft alle ${ist} min, erwartet alle ${soll.intervall_min} min`);
        }
        continue;
      }
      /* Kein Minutenmuster: taeglich/stuendlich. Ein Tagesmuster fuer eine
         Aufgabe, die stuendlich erwartet wird, ist eine Attrappe. */
      const taeglich = /^\d+ \d+ \* \* \*$/.test(g.muster);
      if (taeglich && soll.intervall_min < 1440) {
        zuTraege.push(`${aufgabe}: laeuft taeglich (${g.muster}), erwartet alle ${soll.intervall_min} min`);
      }
    }
    assert.deepStrictEqual(zuTraege, [],
      "Ein Takt, der seltener laeuft als sein Soll, faerbt den Herzschlag dauerhaft "
      + "`spaet` — und ein Waechter, der immer warnt, wird ueberlesen.\n  "
      + zuTraege.join("\n  "));
  });

  it("Selbstprobe: die Erkennung liest wirklich, was dasteht", () => {
    const beispiel = `
      q.upsertJobScheduler("abc-15min", { pattern: "*/15 * * * *" }, { name: "abc" });
      q.upsertJobScheduler("xyz-daily", { pattern: "0 3 * * *" }, { name: "xyz" })
        .catch(() => {});
      // kein Aufruf, nur ein Wort: upsertJobScheduler
    `;
    const gefunden = findeEingeplant(beispiel);
    assert.deepStrictEqual([...gefunden.keys()].sort(), ["abc", "xyz"],
      "die Erkennung findet die Auftraege nicht oder erfindet welche");
    assert.equal(gefunden.get("abc").muster, "*/15 * * * *");
    assert.deepStrictEqual([...findeEingeplant("nichts hier").keys()], [],
      "die Erkennung meldet Treffer, wo keine sind");
  });
});

describe("M1.9 · eingeplant, verarbeitbar, benannt — die drei muessen dasselbe meinen", () => {
  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * DIE NEUE FEHLERMOEGLICHKEIT, DIE M1.9 UEBERHAUPT ERST SCHAFFT
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Ab jetzt haengen DREI Verzeichnisse aneinander:
   *
   *   TAKTE                     was laufen muss        (betriebsTaktService.js)
   *   upsertJobScheduler(...)   was ausgeloest wird    (workers/index.js)
   *   LAEUFE                    was verarbeitet wird   (betriebsTaktLaeufe.js)
   *
   * Der Waechter darueber prueft die ersten beiden. Das dritte ist neu — und die
   * Luecke dazwischen waere besonders unangenehm, weil sie erst NACHTS auffaellt
   * und dann als Fehlermeldung, nicht als Ausfall: ein eingeplanter Auftrag
   * ohne Lauf wirft im Arbeiter ("Unbekannter Betriebstakt"), scheitert bei
   * jedem Versuch neu und faerbt den Herzschlag auf `fehler`.
   *
   * Die Gegenrichtung ist stiller und deshalb schlimmer: ein Lauf, den niemand
   * einplant, ist eine fertig gebaute Funktion, die nie aufgerufen wird — genau
   * der Befund, mit dem diese ganze Phase angefangen hat.
   */

  /** Nur die Auftraege, die der Betriebs-Arbeiter verarbeitet. */
  function betriebsAuftraege(quelle) {
    const von = quelle.indexOf("function scheduleBetriebsWirtschaft");
    assert.notEqual(von, -1,
      "scheduleBetriebsWirtschaft nicht gefunden — wurde die Einplanung umbenannt? "
      + "Dieser Waechter laese sonst ins Leere und waere lautlos gruen");
    const bis = quelle.indexOf("\nexport function startWorkers", von);
    assert.notEqual(bis, -1, "Ende der Einplanungsfunktion nicht gefunden");
    return findeEingeplant(quelle.slice(von, bis));
  }

  it("jeder eingeplante Betriebstakt hat einen Lauf, der ihn verarbeitet", () => {
    const auftraege = [...betriebsAuftraege(quelle).keys()].sort();
    assert.ok(auftraege.length >= 5,
      `nur ${auftraege.length} Betriebstakte gefunden — erwartet werden mindestens die `
      + "fuenf aus dem Owner-Entscheid 2026-09-04");
    const ohneLauf = auftraege.filter((a) => typeof LAEUFE[a] !== "function");
    assert.deepStrictEqual(ohneLauf, [],
      "Diese Auftraege werden eingeplant, aber der Arbeiter kennt sie nicht. Jeder "
      + "Lauf wirft 'Unbekannter Betriebstakt', scheitert, wird wiederholt — und "
      + "faerbt den Herzschlag dauerhaft rot:\n  " + ohneLauf.join("\n  "));
  });

  it("jeder Lauf wird auch eingeplant — sonst ist er gebaut und stumm", () => {
    const auftraege = betriebsAuftraege(quelle);
    const nichtGeplant = Object.keys(LAEUFE).filter((n) => !auftraege.has(n)).sort();
    assert.deepStrictEqual(nichtGeplant, [],
      "Diese Laeufe existieren, werden aber von nichts ausgeloest — die stille "
      + "Variante des Fehlers, mit dem diese Phase angefangen hat:\n  "
      + nichtGeplant.join("\n  "));
  });

  it("jeder Lauf steht auch in der Registratur — sonst ueberwacht ihn niemand", () => {
    /* Die dritte Kante. Ein Lauf, der laeuft und eingeplant ist, aber nicht in
     * TAKTE steht, erscheint in der Kachel nur unter "laeuft, aber unbeobachtet"
     * — ohne Soll-Intervall faellt sein Ausfall nirgends auf. */
    const ohneSoll = Object.keys(LAEUFE).filter((n) => !TAKTE[n]).sort();
    assert.deepStrictEqual(ohneSoll, [],
      "Diese Laeufe haben kein Soll in TAKTE — ihr Schweigen loest keinen Alarm "
      + "aus:\n  " + ohneSoll.join("\n  "));
  });
});
