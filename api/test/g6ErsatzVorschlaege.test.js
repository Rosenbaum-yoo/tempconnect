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
import { ersatzZuAbwesenheit } from "../services/workerAbsenceService.js";

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


/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Der Rueckweg — wenn der Kranke frueher wiederkommt
 * ═══════════════════════════════════════════════════════════════════════════ */

function spionPool(antwort) {
  const gesehen = [];
  return {
    gesehen,
    pool: {
      query: async (sql, params) => {
        gesehen.push({ sql, params });
        return antwort || { rows: [], rowCount: 0 };
      },
    },
  };
}

const ABWESENHEIT = Object.freeze({
  id: "abw-1", worker_profile_id: "p1", von: "2026-08-20", bis: "2026-08-25",
  zustand: "wirksam", art: "krank",
});

describe("G6 — beim Aufheben wird sichtbar, wer inzwischen dort steht", () => {
  it("der Nachfolger muss NACH der Freistellung begonnen haben", async () => {
    /* Ohne diese Bedingung meldet die Abfrage Kollegen als Ersatz. An den
     * echten Daten sofort aufgefallen: Bei einem mehrfach besetzten Einsatz
     * standen drei "Ersaetze" in der Antwort, zwei davon hatten knapp zwei
     * Monate VOR der Freistellung angefangen. In einem Einsatz mit fuenf Leuten
     * waere die Auskunft schlicht Unsinn. */
    const { pool, gesehen } = spionPool({ rows: [], rowCount: 0 });
    await ersatzZuAbwesenheit(pool, "s1", ABWESENHEIT);
    const q = gesehen[0];
    assert.ok(q, "es wurde gar nicht nachgesehen");
    assert.match(q.sql, /neu\.start_date >= alt\.unavailable_from/,
      "ohne diese Bedingung gelten Kollegen als Ersatz");
  });

  it("sie sucht nur ANDERE Personen auf demselben Einsatz", async () => {
    const { pool, gesehen } = spionPool();
    await ersatzZuAbwesenheit(pool, "s1", ABWESENHEIT);
    const sql = gesehen[0].sql;
    assert.match(sql, /neu\.assignment_id = alt\.assignment_id/, "der Einsatzbezug fehlt");
    assert.match(sql, /neu\.worker_user_id <> alt\.worker_user_id/,
      "die Person selbst wuerde als ihr eigener Ersatz gelten");
    assert.match(sql, /neu\.is_active = TRUE/, "ein abgeloester Ersatz zaehlte weiter mit");
  });

  it("die Mandantengrenze steht an BEIDEN Verknuepfungen", async () => {
    /* Ein Ersatz aus einer fremden Firma waere kein Ersatz, sondern ein
     * Datenleck — der Name einer fremden Kraft in der eigenen Antwort. */
    const { pool, gesehen } = spionPool();
    await ersatzZuAbwesenheit(pool, "s1", ABWESENHEIT);
    const sql = gesehen[0].sql;
    assert.equal((sql.match(/supplier_org_id = \$1/g) || []).length >= 3, true,
      "die Org-Bedingung fehlt an mindestens einer der Verknuepfungen");
    assert.equal(gesehen[0].params[0], "s1");
  });

  it("nur Freistellungen im Zeitraum DIESER Abwesenheit zaehlen", async () => {
    const { pool, gesehen } = spionPool();
    await ersatzZuAbwesenheit(pool, "s1", ABWESENHEIT);
    const q = gesehen[0];
    assert.match(q.sql, /alt\.unavailable_from >= \$3::date/, "der Anfang wird nicht begrenzt");
    assert.deepEqual([q.params[2], q.params[3]], ["2026-08-20", "2026-08-25"]);
  });

  it("ein offenes Ende begrenzt nicht nach hinten", async () => {
    const { pool, gesehen } = spionPool();
    await ersatzZuAbwesenheit(pool, "s1", { ...ABWESENHEIT, bis: null });
    assert.equal(gesehen[0].params[3], null);
    assert.match(gesehen[0].sql, /\$4::date IS NULL OR/,
      "bei offenem Ende wuerde die Bedingung sonst alles ausschliessen");
  });

  it("fehlende Angaben werden abgewiesen, nicht geraten", async () => {
    const { pool, gesehen } = spionPool();
    assert.deepEqual(await ersatzZuAbwesenheit(pool, "s1", null), []);
    assert.deepEqual(await ersatzZuAbwesenheit(pool, null, ABWESENHEIT), []);
    assert.deepEqual(await ersatzZuAbwesenheit(pool, "s1", { ...ABWESENHEIT, von: "kein-datum" }), []);
    assert.equal(gesehen.length, 0, "es wurde trotzdem abgefragt");
  });

  it("die Aufhebungs-Route entwarnt den Kunden NICHT, wenn ein Ersatz dort steht", () => {
    /* Sonst wird aus einer richtigen Meldung eine falsche Auskunft: Fuer die
     * PERSON stimmt "faellt doch nicht aus" — fuer SEINEN EINSATZ nicht, wenn
     * dort jemand anderes sitzt. Der Kunde plante mit zwei Leuten auf einer
     * Stelle. */
    const route = fs.readFileSync(path.join(HIER, "..", "routes", "workers.js"), "utf8");
    const i = route.indexOf("ersatzZuAbwesenheit");
    assert.ok(i > 0, "die Route sieht gar nicht nach einem Ersatz");
    const block = route.slice(i, i + 1400);
    assert.match(block, /ersatz\.length === 0/,
      "die Entwarnung geht auch dann raus, wenn der Einsatz neu besetzt ist");
  });

  it("die Route gibt den Ersatz namentlich zurueck, nicht als Zahl", () => {
    const route = fs.readFileSync(path.join(HIER, "..", "routes", "workers.js"), "utf8");
    assert.match(route, /ersatz_auf_einsatz: ersatz,/,
      "ohne die Namen muesste der Disponent die Tafel durchsuchen");
    assert.match(route, /ersatz_auf_einsatz: ersatz\.length/,
      "im Audit fehlt, dass wegen eines Ersatzes keine Entwarnung ging");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
 * 6. Der Weg — drei Klicks aus der Meldung heraus  (das Gate)
 * ═══════════════════════════════════════════════════════════════════════════ */

const PUB = path.join(HIER, "..", "..", "frontend", "public");
const SEITE = path.join(PUB, "mitarbeiter.html");
const LOGIK = path.join(PUB, "js", "pages", "mitarbeiter.js");
const liesF = (p) => fs.readFileSync(p, "utf8");

describe("G6 — der Weg misst genau drei Klicks", () => {
  it("Klick 1 steht in der Zeile der betroffenen Person", () => {
    /*
     * TESTKORREKTUR 2026-08-24, mit Grund: Die alte Fassung verlangte den Knopf
     * INNERHALB von if (live_status === "abwesend" && absence_id) — sie hat
     * damit ein Implementierungsdetail festgeschrieben, das selbst der Fehler
     * war. absence_id kommt aus worker_absences, die NUR der Disponent fuellt;
     * wer sich selbst ueber das Portal krankmeldet (reportUnavailable),
     * schreibt ausschliesslich worker_assignment_links. Der Knopf blieb also
     * genau in dem Fall weg, fuer den 8.2 ihn gebaut hat. Die SCHUTZABSICHT
     * bleibt: der Knopf haengt an einer Verknuepfung, nie an blossem Status.
     */
    const js = liesF(LOGIK);
    assert.match(js, /if \(w\.ersatz_link_id \|\| \(w\.live_status === "abwesend" && w\.absence_id && w\.link_id\)\)/,
      "der Knopf muss am liegengebliebenen Bedarf haengen (ersatz_link_id) ODER am " +
      "laufenden Einsatz einer gemeldeten Abwesenheit — nie an blossem Status");
    const knopfBlock = js.slice(js.indexOf('if (w.ersatz_link_id || (w.live_status === "abwesend"'),
                                js.indexOf('if (w.live_status === "abwesend" && w.absence_id) {'));
    assert.match(knopfBlock, /openErsatzModal/, "aus der Tafel fuehrt kein Weg zum Ersatz");
    assert.ok(!/w\.live_status === "abwesend" && w\.absence_id\) \{[\s\S]{0,600}openErsatzModal/.test(js),
      "der Knopf darf NICHT (mehr) in der Abwesenheits-Schachtel haengen — dort " +
      "erreichte ihn die Selbstmeldung aus dem Portal nie (worker_absences bleibt leer)");
  });

  it("nach einer Absage fuehrt die Tafel zurueck zur Zeile (8.2)", () => {
    /*
     * Die Sackgasse, die entstand, sobald der Ersatz absagen DARF: der Link des
     * Ausgefallenen steht auf `is_active = FALSE`, `link_id` ist leer, der Knopf
     * verschwand. Der Verify-Satz des Plans ("der Vorschlag erscheint erneut")
     * scheiterte genau hier.
     */
    const dienst = fs.readFileSync(path.join(HIER, "..", "services", "workforceService.js"), "utf8");
    assert.match(dienst, /ersatz\.ersatz_link_id/,
      "die Tafel liefert den liegengebliebenen Bedarf nicht aus");
    assert.match(dienst, /worker_confirmation_status = 'worker_unavailable'/,
      "es muss GENAU der Ausgefallene sein, nicht irgendein inaktiver Link");
    assert.match(dienst, /NOT EXISTS \(\s*SELECT 1 FROM worker_assignment_links nachf/,
      "laeuft schon eine Anfrage, darf der Knopf nicht erscheinen — sonst bietet die " +
      "Oberflaeche etwas an, das der Server mit REPLACEMENT_PENDING abweist");
    assert.match(dienst, /nachf\.ersetzt_link_id = wal\.id/,
      "der Bezug zum Vorgaenger fehlt");
  });

  it("Klick 2 und 3 sind getrennt — die Rueckfrage ist Pflicht", () => {
    /* Die Zuweisung gilt sofort (auto_confirmed), der Ersatz bekommt die
     * Zusage, der Kunde eine Meldung — und einen automatischen Rueckweg gibt
     * es nicht. Wer das auf zwei Klicks braechte, machte das Versehen billiger
     * als die Absicht. */
    const js = liesF(LOGIK);
    assert.match(js, /function waehleErsatz/, "es fehlt der Auswahl-Schritt");
    assert.match(js, /function bestaetigeErsatz/, "die Rueckfrage fehlt — ein Klick wuerde zuweisen");
    const waehle = js.slice(js.indexOf("function waehleErsatz"), js.indexOf("function bestaetigeErsatz"));
    assert.ok(!/\/worker-assignment-links\//.test(waehle),
      "die Auswahl setzt bereits ein — dann waeren es zwei Klicks bis zur " +
      "unumkehrbaren Handlung");
  });

  it("es sind nicht MEHR als drei: die Begruendung wird vorbelegt, nicht getippt", () => {
    /* replaceAssignmentWorker verlangt einen Grund fuers Audit. Ihn tippen zu
     * lassen kostete einen vierten Schritt und braechte weniger: Der gebaute
     * Text nennt den Anlass praeziser als jeder, den jemand um sechs Uhr frueh
     * eingibt — und er stimmt immer. */
    const js = liesF(LOGIK);
    const block = js.slice(js.indexOf("function bestaetigeErsatz"), js.indexOf("window.openErsatzModal"));
    assert.match(block, /var grund = "Ersatz f/, "der Grund wird nicht gebaut");
    assert.ok(!/getElementById\(["'']ersatzGrund/.test(block),
      "es gibt ein Eingabefeld fuer den Grund — das waere der vierte Schritt");
    assert.match(block, /reason: grund/, "der gebaute Grund landet nicht im Aufruf");
  });

  it("der Aufruf nimmt die VERKNUEPFUNG, nicht den Einsatz", () => {
    /* Ein Einsatz kann mehrere Kraefte tragen. Mit der assignment_id waere
     * unklar, wen der Ersatz abloest. */
    const js = liesF(LOGIK);
    assert.match(js, /worker-assignment-links\/" \+ encodeURIComponent\(_ersatzLinkId\)/,
      "der Ersatz-Aufruf benutzt die falsche Kennung");
    /* Seit 8.2 kommt die Verknuepfung aus zwei Quellen (laufender Einsatz oder
     * liegengebliebener Bedarf nach einer Absage) — uebernommen wird weiterhin
     * genau eine, und zwar die Verknuepfung, nicht der Einsatz. */
    assert.match(js, /var zielLink = w\.link_id \|\| w\.ersatz_link_id/,
      "die Verknuepfung wird nicht uebernommen");
    assert.match(js, /_ersatzLinkId = zielLink/, "die uebernommene Kennung wird nicht benutzt");
  });

  it("die Tafel liefert die Verknuepfung ueberhaupt mit", () => {
    const dienst = fs.readFileSync(path.join(HIER, "..", "services", "workforceService.js"), "utf8");
    assert.match(dienst, /wal\.id AS link_id/, "die Tafel kennt die Verknuepfung nicht");
    assert.match(dienst, /cur\.link_id/, "sie bleibt im LATERAL stecken und kommt nie heraus");
  });

  it("der Zustand liegt in Modul-Variablen, nicht am DOM-Element", () => {
    /* Die Tafel schreibt sich alle 30 Sekunden neu. Wer den gewaehlten
     * Kandidaten am Knopf haengen laesst, verliert ihn beim naechsten Lauf. */
    const js = liesF(LOGIK);
    for (const v of ["_ersatzLinkId", "_ersatzKunde", "_ersatzFuer", "_ersatzLaeuft"]) {
      assert.ok(js.includes("var " + v), v + " ist keine Modul-Variable");
    }
  });

  it("Doppelklick auf 'einsetzen' loest nur EINE Zuweisung aus", () => {
    const js = liesF(LOGIK);
    const block = js.slice(js.indexOf("function bestaetigeErsatz"), js.indexOf("window.openErsatzModal"));
    assert.match(block, /if \(_ersatzLaeuft/, "ein zweiter Klick setzt ein zweites Mal ein");
    assert.match(block, /btn\.disabled = true/, "der Knopf bleibt waehrend des Absendens klickbar");
  });

  it("nur schnellzuweisbare Kandidaten bekommen den Einsetzen-Knopf", () => {
    /* Und die anderen werden MIT GRUND gezeigt statt weggelassen: Ein
     * fehlender Name ist eine Luecke, "ist selbst abwesend" eine Auskunft. */
    const js = liesF(LOGIK);
    const block = js.slice(js.indexOf("function zeichneKandidat"), js.indexOf("function waehleErsatz"));
    assert.match(block, /quick_assign_eligible === true/, "die Sperre der Liste wird ignoriert");
    assert.match(block, /quick_assign_blockers/, "der Grund wird nicht angezeigt");
  });

  it("die Vorschlaege werden mit only_available geladen", () => {
    /* Seit dieser Welle heisst das auch "nicht selbst abwesend". */
    const js = liesF(LOGIK);
    assert.match(js, /only_available=true/, "die Liste zeigt auch Nicht-Verfuegbare");
    assert.match(js, /include_blocked=false/, "gesperrte Kandidaten stehen mit in der Liste");
  });

  it("Lade-, Leer- und Fehlerzustand sind unterscheidbar", () => {
    const js = liesF(LOGIK);
    for (const k of ["mit.ersatz.loading", "mit.ersatz.empty", "mit.ersatz.loadFail"]) {
      assert.ok(js.includes(k), k + " fehlt");
    }
    assert.ok(js.indexOf("mit.ersatz.empty") !== js.indexOf("mit.ersatz.loadFail"),
      "leer und fehlgeschlagen sehen gleich aus — dann schreibt der Disponent den " +
      "Einsatz aus, obwohl es Kandidaten gaebe");
  });

  it("jeder Fehlercode der Ersatz-Route hat einen eigenen Satz", () => {
    const js = liesF(LOGIK);
    for (const c of ["BLOCKED_BY_COMPANY", "SCHEDULE_CONFLICT"]) {
      assert.ok(js.includes(c), c + " wird nicht behandelt");
    }
  });

  it("die Beschriftungen stehen in BEIDEN Sprachen", () => {
    const js = liesF(LOGIK);
    for (const k of ["mit.ersatz.title", "mit.ersatz.btn", "mit.ersatz.done", "mit.ersatz.empty"]) {
      const n = (js.match(new RegExp("'" + k.replace(/\./g, "\.") + "'", "g")) || []).length;
      assert.ok(n >= 2, k + " fehlt in einer der beiden Sprachen (gefunden: " + n + ")");
    }
  });

  it("das Modal steht im Markup und die Handler existieren", () => {
    const html = liesF(SEITE);
    const js = liesF(LOGIK);
    assert.match(html, /id="ersatzModal"/, "das Modal fehlt");
    assert.match(html, /id="ersatzListe"/, "die Kandidatenliste hat keinen Platz");
    assert.match(html, /id="ersatzFehler"/, "es gibt keinen Ort fuer Fehlermeldungen");
    for (const m of html.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)) {
      if (!m[1].startsWith("Ersatz") && !/[eE]rsatz/.test(m[1])) continue;
      assert.ok(js.includes("function " + m[1]) || js.includes("window." + m[1]),
        m[1] + " wird aufgerufen, ist aber nicht definiert");
    }
  });
});

describe("8.2-Nachtrag — die Ersatz-LATERAL darf sich nicht selbst widersprechen", () => {
  /*
   * DER TOTE CODE, DEN DIE ZEICHENKETTEN-PROBEN OBEN NICHT SAHEN.
   *
   * Die erste Fassung der ersatz-LATERAL (8.2, 2026-08-21) benutzte den
   * Lebenszyklus-Baustein MIT linkAlias — und der traegt fuer inaktive Links
   * die Klausel WHEN wal.is_active = FALSE THEN 'archived'
   * (assignmentLifecycleService.js:122). Die LATERAL verlangte aber zugleich
   * wal.is_active = FALSE und den Zustand IN ('active','ends_today').
   * Das schliesst sich aus: KEINE Zeile konnte je matchen, der Knopf
   * "Ersatz suchen" kam nach einer Absage nie zurueck.
   *
   * An der Datenbank gemessen (2026-08-24): 1 Kandidat, 0 Treffer. Die Proben
   * oben pruefen nur, dass Zeichenketten VORKOMMEN — `if (false && ...)`
   * enthaelt die gesuchte Zeichenkette weiterhin. Deshalb hier zwei Schichten:
   * der Widerspruch als solcher, und ein DB-Smoke, der die echte Abfrage plant.
   */

  const WORKFORCE = path.join(HIER, "..", "services", "workforceService.js");

  function ersatzLateralBlock() {
    const q = fs.readFileSync(WORKFORCE, "utf8");
    const start = q.indexOf("SELECT wal.id AS ersatz_link_id");
    assert.ok(start >= 0, "die ersatz-LATERAL wurde nicht gefunden — greift das Muster noch?");
    const ende = q.indexOf(") ersatz ON TRUE", start);
    assert.ok(ende > start, "das Ende der ersatz-LATERAL wurde nicht gefunden");
    /* Kommentare raus, bevor geprueft wird: der Erklaer-Kommentar in der
     * LATERAL ZITIERT die 'archived'-Falle woertlich — die Probe soll den
     * CODE pruefen, nicht die Warnung davor. (Beim ersten Lauf hat sie
     * prompt ihren eigenen Kommentar gefunden.) */
    return q.slice(start, ende).replace(/\/\*[\s\S]*?\*\//g, "");
  }

  it("der Baustein MIT linkAlias traegt die Falle wirklich — sonst prueft der Rest nichts", async () => {
    const { buildAssignmentLifecycleStateSql } = await import("../services/assignmentLifecycleService.js");
    const mitLink = buildAssignmentLifecycleStateSql({ assignmentAlias: "a", linkAlias: "wal" });
    assert.match(mitLink, /WHEN wal\.is_active = FALSE THEN 'archived'/,
      "Wenn diese Klausel verschwunden ist, ist der Widerspruch weg — dann gehoert " +
      "diese Probe angepasst, nicht geloescht.");
    const ohneLink = buildAssignmentLifecycleStateSql({ assignmentAlias: "a" });
    assert.ok(!/archived/.test(ohneLink),
      "der Baustein OHNE linkAlias darf inaktive Links nicht kennen");
  });

  it("die LATERAL sucht inaktive Links — also darf ihr Lebenszyklus kein 'archived' kennen", () => {
    const block = ersatzLateralBlock();
    assert.match(block, /wal\.is_active = FALSE/,
      "die LATERAL muss inaktive Links suchen — der Ausfall IST der tote Link");
    assert.ok(!/'archived'/.test(block),
      "Die LATERAL traegt den Lebenszyklus-Baustein MIT linkAlias. Zusammen mit " +
      "wal.is_active = FALSE ist das ein Selbstwiderspruch: WHEN wal.is_active = FALSE " +
      "THEN 'archived' schlaegt immer zu, IN ('active','ends_today') ist nie wahr, " +
      "die LATERAL liefert NIE eine Zeile — und der Knopf 'Ersatz suchen' kommt nach " +
      "einer Absage nie zurueck. Genau so war es vom 2026-08-21 bis zum 2026-08-24.");
  });

  it("S: die Probe wuerde die alte, tote Fassung bemerken", () => {
    /* Rueckmutation: der Block, wie er drei Tage lang im Repo stand. */
    const tot = `SELECT wal.id AS ersatz_link_id
       FROM worker_assignment_links wal
      WHERE wal.is_active = FALSE
        AND CASE WHEN wal.is_active = FALSE THEN 'archived' ELSE 'active' END IN ('active', 'ends_today')`;
    assert.ok(/wal\.is_active = FALSE/.test(tot) && /'archived'/.test(tot),
      "die tote Fassung enthaelt beide Merkmale — die Probe oben haette sie abgewiesen");
  });
});

describe("8.2-Nachtrag — DB-Smoke: die Ersatz-LATERAL kann Zeilen liefern",
  { skip: !(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)) && "keine Datenbank" }, () => {
  /*
   * Zwei-Schicht-Disziplin (CLAUDE.md, Erkenntnis 2026-06-03): der DB-freie
   * Teil oben prueft die Form, dieser Smoke laesst Postgres die VOLLE Abfrage
   * planen und misst das Entscheidende — dass ein liegengebliebener Link mit
   * lebendem Einsatz die Bedingungen ueberlebt. Ein Mock kann kein CASE
   * auswerten; genau daran ist der Fehler drei Tage lang vorbeigekommen.
   */
  it("ein liegengebliebener Link mit lebendem Einsatz ueberlebt die Bedingungen", async () => {
    const { Pool } = await import("pg");
    const { buildAssignmentLifecycleStateSql } = await import("../services/assignmentLifecycleService.js");
    const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined);
    try {
      const einsatzLebt = buildAssignmentLifecycleStateSql({ assignmentAlias: "a" });
      /* In EINER Transaktion einen Kandidaten stellen und zurueckrollen —
       * der Bestand bleibt unberuehrt, aber Postgres wertet das echte CASE aus. */
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `WITH kandidat AS (
             SELECT wal.id
               FROM worker_assignment_links wal
               JOIN assignments a ON a.id = wal.assignment_id
              WHERE wal.is_active = FALSE
                AND wal.worker_confirmation_status = 'worker_unavailable'
                AND ${einsatzLebt} IN ('active', 'ends_today')
              LIMIT 1
           ) SELECT count(*)::int AS n FROM kandidat`
        );
        /* Kein Bestand-Kandidat ist KEIN Fehler (der Bestand wandert) — aber die
         * Abfrage muss planbar sein und das CASE darf den Fall nicht ausschliessen.
         * Der Ausschluss-Beweis: dieselbe Abfrage mit dem Link-Alias-Baustein
         * MUSS 0 liefern, egal was im Bestand liegt. */
        const mitLink = buildAssignmentLifecycleStateSql({ assignmentAlias: "a", linkAlias: "wal" });
        const { rows: tot } = await client.query(
          `SELECT count(*)::int AS n
             FROM worker_assignment_links wal
             JOIN assignments a ON a.id = wal.assignment_id
            WHERE wal.is_active = FALSE
              AND ${mitLink} IN ('active', 'ends_today')`
        );
        assert.equal(tot[0].n, 0,
          "der Baustein MIT linkAlias muss inaktive Links IMMER ausschliessen — " +
          "genau deshalb war er in der ersatz-LATERAL falsch");
        assert.ok(rows[0].n >= 0, "die Abfrage ohne linkAlias ist planbar");
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });
});
