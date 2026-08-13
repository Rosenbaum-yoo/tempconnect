# Spur E — Echte Live-Belegschaft

**Owner-Abschnitt 6.** Wellen und Gates. Die Owner-Entscheidungen sind am
2026-08-13 gefallen und unten festgehalten.

---

## E1 ist erledigt *(2026-08-13)* — gemessen, nicht vermutet

Die Reihenfolge war bewusst: erst messen, welche Zustände überhaupt eine
Datenquelle haben, dann entscheiden. Sonst fallen Entscheidungen über Reiter,
die sich nicht befüllen lassen.

**Was heute schon berechnet wird** (`api/services/workforceService.js:567`):

| Zustand | Herleitung |
|---|---|
| `inaktiv` | `worker_profiles.is_active = FALSE` |
| `verfuegbar` | kein laufender Einsatz |
| `endet_bald` | Einsatz endet innerhalb `LIVE_BOARD_ENDS_SOON_DAYS` |
| `im_einsatz` | laufender Einsatz vorhanden |

Zwei der vier vom Owner gewünschten Zustände sind damit bereits da: *verfügbar*
und *besetzt* (als `im_einsatz`, mit `endet_bald` als Verfeinerung).

**Für „krank" gibt es nur eine halbe Quelle.** Migration 073 legte
`unavailable_from`, `unavailable_reason` und `unavailable_reported_at` an — aber
auf `worker_assignment_links`, also am **Einsatz**, nicht am Menschen. Zwei
Folgen:

1. Der Grund ist **Freitext**. Krank, Urlaub und Arzttermin sind nicht
   unterscheidbar, ohne in Text zu raten.
2. Wer gerade **keinen** Einsatz hat, kann sich überhaupt nicht abmelden — die
   Abwesenheit hängt an einem Auftrag, den es nicht gibt.

**Für „Montage" gibt es keine Quelle.** Es ist auch kein Zustand des Menschen,
sondern eine Eigenschaft des Einsatzes (auswärts mit Übernachtung). Muss erst
erfasst werden.

---

## Owner-Entscheidungen *(2026-08-13)*

| Kennung | Frage | Entscheidung |
|---|---|---|
| **E-E1** | Welche Zustände führt die Live-Belegschaft? | ✅ **Alles zusammen** — die vier vorhandenen plus `abwesend`, plus getrennte Abwesenheitsgründe, plus Montage/Auswärtseinsatz |
| **E-E2** | Abmeldung am Einsatz oder am Profil? | ✅ **Ans Profil verlagern.** Abwesenheit gehört zum Menschen, nicht zum Auftrag — eine Zeitarbeitsfirma will wissen, wer nächste Woche krank ist, auch ohne laufenden Einsatz |
| **E-E3** | Verlauf ableiten oder protokollieren? | ✅ **Echtes Zustands-Protokoll.** Jede Änderung wird mitgeschrieben — genauer und audit-fest |

---

## E.2 Wellen

### Welle E2 — Das Datenmodell für Abwesenheit ✅ *(erledigt 2026-08-13)*

Ohne sie kann E3 nichts anzeigen und E4 nichts protokollieren.

- Neue Tabelle `worker_absences`: `worker_profile_id` (nicht `assignment_id`!),
  `von`, `bis`, `art`, `notiz`, `erfasst_von`, `erfasst_am`.
- `art` als **CHECK-Liste**, nicht Freitext: `krank`, `urlaub`, `termin`,
  `sonstiges`. Freitext war genau der Grund, warum die vorhandenen Felder
  nichts hergeben.
- Die alten Felder auf `worker_assignment_links` bleiben zunächst — sie tragen
  Bestandsdaten. **Migrationspfad und Stichtag im Rollback-Block benennen.**
- Überlappungen: höchstens eine aktive Abwesenheit je Mensch und Tag
  (Teil-Index), sonst zeigt die Tafel zwei Zustände gleichzeitig.

**Gate E2:** Eine Abwesenheit lässt sich für einen Mitarbeiter **ohne laufenden
Einsatz** erfassen und erscheint in der Live-Belegschaft. Ein Test belegt, dass
sich zwei überlappende Abwesenheiten nicht anlegen lassen.

> **Gate E2 ist erfüllt und gegen die echte Datenbank belegt**
> (`api/test/integration/workerAbwesenheit.flow.test.js`, 10/10 grün — geprüft
> an einem Profil **ohne Benutzerkonto und ohne Einsatz**, dem härtesten Fall).

**Was gebaut wurde**

| Teil | Ort |
|---|---|
| Migration | `sql/migrations/177_abwesenheit_gehoert_zum_menschen.sql` |
| Dienst | `api/services/workerAbsenceService.js` |
| Endpunkte | `GET/POST /api/workers/absences`, `POST /api/workers/absences/:id/aufheben` |
| Tafel | `getWorkerLiveBoard` führt `abwesend` + `abwesend_nach_art` |
| Oberfläche | `mitarbeiter.html` (Dialog) + `js/pages/mitarbeiter.js` (Abmelden / Zurücknehmen, DE + EN) |
| **Die Leser** | `workerAvailabilityService` und `capacityOfferMatchService` lesen die neue Quelle mit |
| Tests | `workerAbwesenheit.test.js` (20) · `abwesenheitOberflaeche.test.js` (13) · Integration (12) · je 7/3 neue in den beiden Leser-Suiten |

**Warum die beiden Leser dazugehören und nicht in eine spätere Welle**

Eine neue Wahrheitsquelle ist erst fertig, wenn ihre Leser mitgeliefert sind.
Ohne diesen Schritt hätte E2 eine Schattenwahrheit erzeugt: der Disponent meldet
jemanden krank, die Tafel zeigt es — und der Angebotsgenerator bietet denselben
Menschen im selben Moment einem Kunden an. Beide Dienste kannten bisher nur die
einsatzgebundene Abmeldung.

- `resolveAvailability`: eine laufende Abwesenheit schlägt jede Herleitung, auch
  die *ausdrückliche* Angabe — die wurde geschrieben, bevor jemand krank wurde.
  Bei offenem Ende wird „verfügbar ab" ehrlich **unbekannt** statt geraten.
- `checkOfferCoverage`: ein zusätzliches `LATERAL` im bestehenden Statement
  (kein N+1). Anders als die alte Abmeldung kennt die neue ein Ende — die
  Antwort kann jetzt sagen, ab wann es wieder geht.

**Drei Entscheidungen, die der Plan offen ließ — und warum sie so fielen**

1. **Ein Teil-Index reicht nicht.** Der Plan nannte einen Teil-Index gegen
   Überlappungen. Ein Index auf `(worker_profile_id, von)` verhindert aber nur
   denselben *Starttag*, nicht die Überschneidung: 10.–20. und 15.–25. haben
   verschiedene Starttage und überlappen trotzdem. Gebaut wurde deshalb eine
   `EXCLUDE`-Bedingung über `daterange` (erste Nutzung von `btree_gist` im
   Repo). Sie hält auch gegen zwei gleichzeitige Anfragen — eine Prüfung im
   Anwendungscode täte das nicht.
2. **Zurücknehmen statt Löschen.** Eine zurückgezogene Krankmeldung ist ein
   Vorgang, kein Nichts. `aufgehoben_am` entwertet die Zeile, ohne sie zu
   entfernen — sonst hätte der Zeitstrahl aus E5 eine Lücke, die niemand
   erklären kann. Die Überlappungssperre gilt nur für gültige Zeilen, sonst
   blockierte ein Irrtum den Zeitraum für immer.
3. **Abwesend schlägt den laufenden Einsatz.** Die Zustände der Tafel sind
   ausschließend (Gate E4: Summe = Gesamtzahl). Rangfolge: `inaktiv` >
   `abwesend` > `endet_bald`/`im_einsatz`/`verfügbar`. Wer krank ist, ist heute
   nicht da — auch wenn der Einsatz formal läuft; genau deswegen schaut der
   Disponent auf die Tafel. Der Einsatzkontext bleibt in der Zeile stehen, damit
   sichtbar ist, **wo** die Kraft fehlt. Folge: Abwesende drücken die
   Auslastungsquote. Das ist gewollt — wer krank ist, bringt keinen Umsatz.

**Was E2 offen lässt** — die Abwesenheit wird bisher nur vom Disponenten
erfasst. Eine Selbstabmeldung durch den Mitarbeiter im Worker-Portal ist
bewusst *nicht* gebaut: sie ist ein eigener Vertrauens- und
Benachrichtigungspfad (wer erfährt davon, wie schnell, mit welchem Nachweis)
und gehört nicht nebenbei in eine Datenmodell-Welle.

### Welle E3 — Montage als Eigenschaft des Einsatzes

- Feld am Einsatz (`worker_assignment_links` oder `assignments` — **erst prüfen,
  wo es fachlich hingehört**), nicht am Menschen.
- Erfassung in der Oberfläche, sonst bleibt das Feld leer und der Reiter tot.

**Gate E3:** Ein als Montage erfasster Einsatz erscheint in der Live-Belegschaft
unter Montage statt unter „im Einsatz". Ohne Erfassung kein Reiter — ein leerer
Reiter ist schlimmer als keiner.

### Welle E4 — Die Reiter

- Reiter je Zustand: verfügbar · im Einsatz · endet bald · Montage · abwesend
  (mit Untergliederung nach Art) · inaktiv.
- Zählwerte je Reiter, aus **einer** Abfrage — nicht sechs.
- Jeder Reiter mit Leerzustand („Niemand ist gerade krank gemeldet"), nicht mit
  leerer Tabelle.
- Deep-Link je Zeile auf den konkreten Mitarbeiter, nicht auf die Übersicht.
- Zweisprachig DE/EN mit identischen Schlüsseln.

**Gate E4:** Jeder Reiter ist real auslösbar und zeigt echte Daten. Die Summe
der Reiter-Zählwerte entspricht der Gesamtzahl — kein Mensch fällt zwischen zwei
Reiter, keiner erscheint doppelt.

### Welle E5 — Das Zustands-Protokoll

- Tabelle `worker_status_events`: `worker_profile_id`, `von_zustand`,
  `nach_zustand`, `ausgeloest_durch`, `zeitpunkt`, `bezug` (Einsatz/Abwesenheit).
- Geschrieben **an der Quelle** jeder Änderung, nicht durch einen Cron, der
  hinterherpollt — sonst fehlen genau die kurzen Zustände.
- Zeitstrahl je Mitarbeiter aus dieser Tabelle.

> **Wirtschaftlichkeit mitdenken:** ein Ereignis je Zustandswechsel je Mensch.
> Bei 300 Kunden × 200 Mitarbeitern sind das keine großen Mengen — aber die
> Tabelle wächst unbegrenzt. Aufbewahrungsfrist **vor** dem Bau festlegen, nicht
> danach.

**Gate E5:** Der Zeitstrahl eines Mitarbeiters zeigt jede Änderung der letzten
90 Tage mit Zeitpunkt und Auslöser. Ein Test belegt, dass ein Zustandswechsel
ohne Protokolleintrag nicht möglich ist.

---

## Reihenfolge

**~~E2~~ → E3 → E4 → E5.** Erst die Quellen, dann die Anzeige, dann der Verlauf.
Nächster Schritt: **E3** (Montage als Eigenschaft des Einsatzes).

Die Versuchung ist, mit den Reitern anzufangen — sie sind das Sichtbare. Das
wäre falsch: ein Reiter ohne Datenquelle ist eine Zusage, die das Produkt nicht
halten kann, und genau davon hat dieses Repo schon genug (siehe
`docs/FRONTEND_REIFEGRAD_AUDIT.md`).
