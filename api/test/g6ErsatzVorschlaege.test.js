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

import { getSuggestionQuickAssignState, scoreWorkersForAssignment } from "../services/assignmentStaffingService.js";

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
 * 3b. Und auch nicht EINLADBAR — die zweite Haelfte des Gates
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Eine Kandidatenzeile, wie sie aus queryWorkerSuggestionBase kommt.
 *
 * WARUM VERHALTEN STATT QUELLTEXT: Die erste Fassung dieser Gruppe hat im Code
 * nach der Zeichenkette "absenceConflictCount > 0" gesucht. Eine Mutation zu
 * `if (false && absenceConflictCount > 0)` UEBERLEBTE das — die Zeichenkette
 * steht ja weiterhin da. Ein Test, der Quelltext liest, prueft Schreibweise;
 * geprueft werden muss die Entscheidung.
 */
function kandidat(extra) {
  return Object.assign({
    user_id: "u1", first_name: "Test", last_name: "Person", is_active: true,
    skill_tags: [], qualifications: [], verified_doc_names: [],
    active_assignment_count: 0, current_assignment_count: 0, conflict_count: 0,
    reservation_conflict_count: 0, current_reservation_count: 0,
    absence_conflict_count: 0, open_invite_count: 0, historical_invite_count: 0,
    confirmed_assignment_count: 0, same_client_assignment_count: 0,
    verified_doc_count: 0, expired_doc_count: 0,
  }, extra || {});
}

const EINSATZ = Object.freeze({
  id: "a1", start_date: "2026-08-20", planned_end_date: "2026-08-25",
  org_id: "o1", supplier_org_id: "s1",
});

const bewerte = (extra, filters) =>
  scoreWorkersForAssignment(null, EINSATZ, [kandidat(extra)], filters || {})[0];

describe("G6 — ein Abwesender ist auch nicht einladbar", () => {
  it("VERHALTEN: eine Abwesenheit macht is_selectable und can_invite falsch", () => {
    /* DIE RESTLUECKE DER ERSTEN FASSUNG: Der Zaehler wurde erhoben und die
     * Schnellzuweisung gesperrt — aber is_selectable und can_invite blieben
     * wahr. Ein Abwesender ueberlebte hardOnly und includeBlocked=false, konnte
     * Rang 1 mit "hoch" tragen und wurde an SECHS Stellen als einladbar
     * behandelt, darunter die Wartelisten-Saat der Kampagne.
     *
     * Das Gate verlangt "vorgeschlagen UND EINGELADEN" — die halbe Sperre liess
     * genau die zweite Haelfte offen. */
    const abwesend = bewerte({ absence_conflict_count: 1 });
    assert.equal(abwesend.is_selectable, false,
      "ein Abwesender ueberlebt includeBlocked=false und steht waehlbar in der Liste");
    assert.equal(abwesend.can_invite, false,
      "ein Abwesender laesst sich EINLADEN — genau die Haelfte des Gates, die " +
      "die erste Fassung offengelassen hat");
    assert.equal(abwesend.quick_assign_eligible, false);
    assert.equal(abwesend.is_absent, true);
  });

  it("VERHALTEN: der Grund steht als harte Sperre drin, nicht nur als Notiz", () => {
    const abwesend = bewerte({ absence_conflict_count: 1 });
    assert.ok(abwesend.hard_failures.some((f) => f.code === "worker_absent"),
      "worker_absent fehlt in den hard_failures — dann erben die sechs " +
      "can_invite-Filter die Sperre nicht");
    assert.equal(abwesend.suggestion_status, "blocked");
  });

  it("VERHALTEN: die Gegenprobe — ohne Abwesenheit bleibt alles offen", () => {
    /* Ohne diese Probe koennte der Fix alles sperren und der Test bliebe gruen. */
    const anwesend = bewerte({});
    assert.equal(anwesend.is_selectable, true);
    assert.equal(anwesend.can_invite, true);
    assert.equal(anwesend.quick_assign_eligible, true);
    assert.equal(anwesend.is_absent, false);
  });

  it("VERHALTEN: onlyAvailable wirft den Abwesenden ganz aus der Liste", () => {
    const mitFilter = scoreWorkersForAssignment(
      null, EINSATZ, [kandidat({ absence_conflict_count: 1 })], { onlyAvailable: true });
    assert.equal(mitFilter.length, 0,
      "onlyAvailable behaelt den Abwesenden — der Name traegt eine Zusage, die " +
      "er nicht einloest");
    const ohneFilter = scoreWorkersForAssignment(
      null, EINSATZ, [kandidat({ absence_conflict_count: 1 })], {});
    assert.equal(ohneFilter.length, 1,
      "ohne den Filter soll er SICHTBAR bleiben — mit Begruendung, denn ein " +
      "fehlender Name ist nur eine Luecke, 'ist selbst abwesend' eine Auskunft");
  });

  it("VERHALTEN: eine Terminkollision sperrt weiterhin unabhaengig davon", () => {
    const kollision = bewerte({ conflict_count: 1 });
    assert.equal(kollision.is_selectable, false);
    assert.ok(kollision.hard_failures.some((f) => f.code === "schedule_conflict"));
    assert.equal(kollision.is_absent, false, "die neue Flagge faerbt auf fremde Sperren ab");
  });

  it("QUELLTEXT: is_selectable und can_invite haengen an den harten Sperren", () => {
    /* DIE RESTLUECKE DER ERSTEN FASSUNG: Der Zaehler wurde erhoben und die
     * Schnellzuweisung gesperrt — aber `is_selectable` und `can_invite` blieben
     * wahr. Ein Abwesender ueberlebte `hardOnly` und `includeBlocked=false`,
     * konnte Rang 1 mit "hoch" tragen und wurde an SECHS Stellen als einladbar
     * behandelt, darunter die Wartelisten-Saat der Kampagne.
     *
     * Das Gate verlangt "vorgeschlagen UND EINGELADEN" — die halbe Sperre liess
     * genau die zweite Haelfte offen. */
    /* Die Verbindung, die den Fix an EINER Stelle wirksam macht: Steht die
     * Abwesenheit in hard_failures, erben alle sechs can_invite-Filter sie —
     * ohne dass jemand sie einzeln nachziehen muss. Diese eine Kopplung laesst
     * sich nur im Quelltext festhalten; alles andere darueber prueft Verhalten. */
    const s = quelle();
    assert.match(s, /is_selectable: hardFailures\.length === 0/,
      "is_selectable haengt nicht mehr an den harten Sperren — dann traegt der Fix nicht");
    assert.match(s, /can_invite: hardFailures\.length === 0/,
      "can_invite haengt nicht mehr an den harten Sperren");
  });

  it("der Sperrcode ist derselbe wie bei der Schnellzuweisung", () => {
    /* Zwei Namen fuer dieselbe Sache waeren zwei Wahrheiten in der Oberflaeche.
     * dedupeQuickAssignBlockers fasst sie ueber den Code zusammen — der muss
     * deshalb woertlich uebereinstimmen. */
    const zustand = getSuggestionQuickAssignState({ is_absent: true });
    const codes = zustand.quick_assign_blockers.map((b) => b.code);
    assert.ok(codes.includes("worker_absent"));
    assert.equal(new Set(codes).size, codes.length, "ein Code wird doppelt gefuehrt");
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
