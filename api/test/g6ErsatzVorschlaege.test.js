/**
 * Welle G6 — Umdisponieren mit Vorschlaegen.
 *
 * DER BEFUND, DEN DIESE DATEI FESTHAELT:
 * Die Vorschlagsliste kannte `worker_absences` nicht. Ein krank Gemeldeter
 * wurde als ERSATZ FUER EINEN KRANKEN vorgeschlagen — und der Disponent
 * verliess sich darauf, bis auch der zweite nicht erschien.
 *
 * Schlimmer als eine fehlende Pruefung war die FALSCHE ZUSICHERUNG: Der
 * Bewertungsfaktor heisst `availabilityMatch` und wiegt 25 Punkte, wertet aber
 * nur das Freitextfeld `availability_note` aus. Und die Filteroption heisst
 * `onlyAvailable`, pruefte aber ausschliesslich Doppelbelegungen mit anderen
 * Einsaetzen. Beide Namen versprachen Verfuegbarkeit und meinten etwas anderes.
 *
 * Warum der bestehende Konflikt-Block das nicht abdeckte: Eine Abwesenheit ist
 * kein Einsatz. Sie haengt am PROFIL (Mig 177), nicht am Konto, und erzeugt
 * deshalb keinen einzigen Konflikt in `worker_assignment_links`.
 *
 * Run: node --test --test-force-exit test/g6ErsatzVorschlaege.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getSuggestionQuickAssignState } from "../services/assignmentStaffingService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const DIENST = path.join(HIER, "..", "services", "assignmentStaffingService.js");
const quelle = () => fs.readFileSync(DIENST, "utf8");

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Die Abfrage kennt die Abwesenheit
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G6 — die Vorschlagsliste sieht Abwesenheiten", () => {
  it("die Abfrage joint worker_absences", () => {
    const s = quelle();
    assert.match(s, /FROM worker_absences ab/,
      "die Kandidatenabfrage kennt worker_absences nicht — ein Kranker waere als " +
      "Ersatz fuer einen Kranken vorschlagbar");
  });

  it("sie zaehlt nur WIRKSAME, nicht aufgehobene Meldungen", () => {
    /* Eine beantragte Meldung (Freigabepflicht, G-E2) ist noch nicht
     * entschieden; eine zurueckgenommene ist keine. Dieselbe Bedingung, die
     * `fuerKunde()` in `faellt_aus` kodiert. */
    const s = quelle();
    const block = s.slice(s.indexOf("FROM worker_absences ab"), s.indexOf(") absences ON TRUE"));
    assert.match(block, /aufgehoben_am IS NULL/, "aufgehobene Meldungen wuerden mitgezaehlt");
    assert.match(block, /zustand = 'wirksam'/, "eine nur BEANTRAGTE Meldung wuerde jemanden aussperren");
  });

  it("sie prueft die UEBERSCHNEIDUNG mit dem Einsatzzeitraum, nicht nur das Datum", () => {
    const s = quelle();
    const block = s.slice(s.indexOf("FROM worker_absences ab"), s.indexOf(") absences ON TRUE"));
    assert.match(block, /ab\.von <= \$4/, "der Anfang wird nicht gegen das Einsatzende geprueft");
    assert.match(block, /ab\.bis IS NULL OR ab\.bis >= \$3/,
      "ein offenes Ende (bis IS NULL) muss als dauerhaft gelten — sonst faellt " +
      "die laengste Abwesenheit durch");
  });

  it("sie bindet die Mandantengrenze IM Statement", () => {
    const s = quelle();
    const block = s.slice(s.indexOf("FROM worker_absences ab"), s.indexOf(") absences ON TRUE"));
    assert.match(block, /ab\.supplier_org_id = \$1/,
      "ohne Org-Bedingung zaehlte die Abwesenheit eines fremden Betriebs mit");
  });

  it("sie haengt am PROFIL, nicht am Konto", () => {
    /* Die Feinheit des Schemas: Abwesenheiten haengen an `worker_profiles.id`,
     * Einsaetze an `worker_profiles.user_id`. Wer hier user_id nimmt, findet
     * nie etwas — und der Test bliebe gruen, weil "nichts gefunden" wie
     * "niemand abwesend" aussieht. */
    const s = quelle();
    const block = s.slice(s.indexOf("FROM worker_absences ab"), s.indexOf(") absences ON TRUE"));
    assert.match(block, /ab\.worker_profile_id = wp\.id/,
      "die Verknuepfung laeuft ueber das falsche Feld — sie faende nie eine Abwesenheit");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Der Filter heisst, was er tut
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G6 — onlyAvailable meint jetzt auch 'nicht abwesend'", () => {
  it("der Filter wertet den Abwesenheitszaehler aus", () => {
    const s = quelle();
    const zeile = s.split("\n").find((z) => z.includes("filters.onlyAvailable &&"));
    assert.ok(zeile, "der onlyAvailable-Filter fehlt");
    assert.match(zeile, /absenceConflictCount > 0/,
      "onlyAvailable prueft die Abwesenheit nicht — der Name traegt eine Zusage, " +
      "die er nicht einloest");
  });

  it("der Zaehler wird nach aussen gegeben, samt Klartext-Flagge", () => {
    /* Damit die Oberflaeche den GRUND nennen kann, statt jemanden wortlos
     * wegzulassen: "ist selbst abwesend" ist eine Auskunft, ein fehlender Name
     * ist nur eine Luecke. */
    const s = quelle();
    assert.match(s, /absence_conflict_count: absenceConflictCount/, "der Zaehler bleibt intern");
    assert.match(s, /is_absent: absenceConflictCount > 0/, "es fehlt die einfache Flagge fuer die Anzeige");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Die Schnellzuweisung bleibt zu
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G6 — ein Abwesender ist nie schnellzuweisbar", () => {
  it("is_absent sperrt die Schnellzuweisung", () => {
    const zustand = getSuggestionQuickAssignState({ is_absent: true });
    assert.equal(zustand.quick_assign_eligible, false,
      "ein Abwesender waere per Ein-Klick einsetzbar — genau dort verlaesst sich " +
      "der Disponent darauf, dass die Liste schon geprueft hat");
    assert.ok(zustand.quick_assign_blockers.some((b) => b.code === "worker_absent"),
      "der Grund wird nicht genannt");
  });

  it("der Grund ist lesbar, nicht nur ein Code", () => {
    const zustand = getSuggestionQuickAssignState({ is_absent: true });
    const blocker = zustand.quick_assign_blockers.find((b) => b.code === "worker_absent");
    assert.ok(blocker.label && blocker.label.length > 10,
      "ohne Klartext sieht der Disponent nur einen Schluessel");
    assert.match(blocker.label, /abwesend/i);
  });

  it("wer NICHT abwesend ist, bleibt schnellzuweisbar", () => {
    /* Die Gegenprobe: Der neue Blocker darf nicht alles sperren. */
    const zustand = getSuggestionQuickAssignState({ is_absent: false });
    assert.equal(zustand.quick_assign_eligible, true,
      "der neue Blocker sperrt auch Anwesende — dann waere die Liste unbrauchbar");
  });

  it("die bestehenden Sperrgruende gelten unveraendert weiter", () => {
    for (const [feld, code] of [["has_open_invite", "open_invite"], ["already_contacted", "already_contacted"]]) {
      const z = getSuggestionQuickAssignState({ [feld]: true });
      assert.equal(z.quick_assign_eligible, false, `${code} sperrt nicht mehr`);
      assert.ok(z.quick_assign_blockers.some((b) => b.code === code));
    }
  });

  it("ohne Vorschlag bleibt es bei der bisherigen Antwort", () => {
    const z = getSuggestionQuickAssignState(null);
    assert.equal(z.quick_assign_eligible, false);
    assert.ok(z.quick_assign_blockers.some((b) => b.code === "not_suggested"));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Was der Name verspricht  (der eigentliche Befund)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G6 — availabilityMatch ist keine Verfuegbarkeitspruefung", () => {
  it("der Bewertungsfaktor speist sich weiterhin nur aus Freitext — das ist dokumentiert", () => {
    /* Dieser Test aendert nichts, er HAELT EINEN BEFUND FEST: `availabilityMatch`
     * (Gewicht 25) vergleicht Stichworte aus `availability_note`, einem
     * Freitextfeld. Er sagt NICHTS darueber, ob jemand an dem Tag da ist.
     *
     * Die echte Pruefung liegt seit dieser Welle im Abwesenheits-Block und im
     * onlyAvailable-Filter. Sollte jemand den Faktor spaeter fuer eine
     * Verfuegbarkeitszusage halten, faellt es hier auf. */
    const s = quelle();
    assert.match(s, /availabilityMatch: 25/, "das Gewicht hat sich geaendert — Kommentar pruefen");
    assert.match(s, /tokenizeText\(worker\.availability_note\)/,
      "der Faktor speist sich nicht mehr aus dem Freitext — dann darf dieser " +
      "Test umgeschrieben werden, aber bewusst");
  });
});
