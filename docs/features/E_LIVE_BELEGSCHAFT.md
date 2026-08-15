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

> **Fortsetzung:** Die Selbsterfassung durch den Mitarbeiter ist als eigene Spur
> geplant — [G_ABWESENHEIT_SELBSTERFASSUNG.md](G_ABWESENHEIT_SELBSTERFASSUNG.md).

**Was E2 offen lässt** — die Abwesenheit wird bisher nur vom Disponenten
erfasst. Eine Selbstabmeldung durch den Mitarbeiter im Worker-Portal ist
bewusst *nicht* gebaut: sie ist ein eigener Vertrauens- und
Benachrichtigungspfad (wer erfährt davon, wie schnell, mit welchem Nachweis)
und gehört nicht nebenbei in eine Datenmodell-Welle.

### Welle E3 — Montage als Eigenschaft des Einsatzes ✅ *(erledigt 2026-08-13)*

- Feld am Einsatz (`worker_assignment_links` oder `assignments` — **erst prüfen,
  wo es fachlich hingehört**), nicht am Menschen.
- Erfassung in der Oberfläche, sonst bleibt das Feld leer und der Reiter tot.

**Gate E3:** Ein als Montage erfasster Einsatz erscheint in der Live-Belegschaft
unter Montage statt unter „im Einsatz". Ohne Erfassung kein Reiter — ein leerer
Reiter ist schlimmer als keiner.

> **Gate E3 ist erfüllt und gegen die echte Datenbank belegt** — ein real
> angelegter Einsatz mit `is_montage = TRUE` steht unter *Montage*, nicht unter
> *im Einsatz* (`workerAbwesenheit.flow.test.js`, 15/15).

**Die offene Frage aus dem Plan — vom Schema beantwortet, nicht geraten**

| Tabelle | kennt sie einen Ort? |
|---|---|
| `assignments` | **nein** — Auftraggeber, Zeitraum, Satz, Kopfzahl. Kein Ortsfeld. |
| `worker_assignment_links` | **ja, vollständig** — `location_address`, `location_lat/lng`, `meeting_point`, `client_name`, `instructions`, `dress_code`, `contact_*` |

Montage heißt „auswärts mit Übernachtung" — eine Aussage über den **Ort**, an den
dieser Mensch fährt. Sie gehört neben `location_address`, nicht in eine Tabelle,
die keinen Ort kennt. Der Nebeneffekt ist fachlich richtig: zwei Kräfte
desselben Auftrags können auf verschiedene Baustellen gehen — dieses Schema
sieht das ausdrücklich vor, und nur dort lässt es sich abbilden.

**Was gebaut wurde**

| Teil | Ort |
|---|---|
| Migration | `sql/migrations/178_montage_gehoert_zum_einsatzort.sql` (`is_montage`) |
| Erfassung | Einsatz-Editor in `js/pages/workerSubmissionsReview.js`, direkt unter der Adresse |
| Route | `PATCH /api/worker-assignment-links/:id` — Zod + Feld-Whitelist |
| Tafel | `live_status = 'montage'` + eigener Zählwert |
| Mitarbeiter-Sicht | Hinweis im Einsatzportal: *„Auswärtseinsatz mit Übernachtung – plane die An- und Abreise ein."* |
| Tests | 6 Einheit · 6 Oberfläche · 3 gegen das echte Schema |

**Zwei Entscheidungen, die der Plan nicht vorgab**

1. **Montage überdeckt „endet bald", nicht umgekehrt.** Sonst verschwände eine
   Kraft aus dem Montage-Reiter, nur weil ihr Einsatz in sechs Tagen endet — der
   Reiter beantwortete „wer übernachtet gerade auswärts" dann falsch. Das nahende
   Ende geht trotzdem nicht verloren: es wird als eigenes Feld geführt und steht
   sichtbar in der Zeile.
2. **Montage zählt voll als Einsatz in der Auslastung.** Die Kraft arbeitet, sie
   schläft nur woanders. Zählte man sie nicht mit, sänke die Quote genau dann,
   wenn der Betrieb am meisten leistet.

**Bewusst nicht gebaut:** Unterkunft und Auslöse. Die Unterkunft steht bereits in
`meeting_point`/`instructions`, die Auslöse ist Abrechnung statt Disposition. Ein
Feld, das niemand füllt, ist schlimmer als keins — kommt die Lohnseite, ist sie
eine eigene Welle mit eigenem Gate.

### Welle E4 — Die Reiter ✅ *(erledigt 2026-08-13)*

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

> **Gate E4 ist erfüllt.** Ein Test liest die Zählwerte aus dem **gerenderten
> Markup** und rechnet sie zusammen — nicht aus dem Objekt, aus dem sie stammen.
> Eine Summe, die nur im Datenmodell stimmt, sagt nichts über die Tafel.

**Warum im Browser gefiltert wird und nicht nachgeladen**

Sechs Reiter könnten sechs Abfragen sein. Sie wären nicht nur sechsmal so teuer,
sie könnten sich **widersprechen**: Reiter A gezählt um 10:00:03, Reiter B um
10:00:05 — und die Summe passt nicht mehr zur Gesamtzahl, obwohl kein Fehler
vorliegt. Eine Abfrage, eine Wahrheit, ein Zeitpunkt. Der Reiterwechsel ist damit
außerdem verzögerungsfrei.

**Was der Reihe nach entschieden wurde**

1. **Der Reiter steht in der Adresse** (`#live-abwesend`). Eine
   Krankmeldungs-Ansicht lässt sich verschicken, als Lesezeichen ablegen und
   später aus einer Benachrichtigung heraus direkt anspringen. Ohne das wäre
   jeder künftige Deep-Link auf „die Live-Belegschaft" beschränkt — und genau
   das ist die Sackgasse, die dieses Repo an anderen Stellen schon hat.
2. **Leere Reiter bleiben stehen, nur gedämpft.** „Niemand ist krank gemeldet"
   *ist* eine Antwort. Wer den Reiter verschwinden lässt, zwingt den Nutzer zu
   raten, ob er die Frage falsch gestellt hat.
3. **Jeder Leerzustand mit eigenen Worten**, und „endet bald" nennt das echte
   Zeitfenster aus `scope.ends_soon_days` statt einer eingetippten 7 — die wäre
   gelogen, sobald der Server das Fenster ändert.
4. **Die Kacheln führen nur noch, was kein Reiter ist** (Auslastung, offene
   Stundenzettel, Belegschaft). Dieselbe Zahl an zwei Orten heißt, dass eine von
   beiden irgendwann falsch ist.
5. **Tastatur und Screenreader**: `role="tablist"`, genau ein `aria-selected`,
   roving `tabindex`, Pfeiltasten/Home/End. Ohne das sind sieben Reiter sieben
   Tabstopps, bevor die Liste erreicht ist.
6. **Die Deckelung wird ausgesprochen.** Die Tafel lädt höchstens 300 Zeilen;
   die Reiter zählen genau diese. Der Server liefert jetzt `scope.limit` und
   `truncated`, die Oberfläche sagt es. Eine stille Deckelung liest sich wie
   Vollständigkeit — das ist der Unterschied zwischen einer Kennzahl und einer
   Behauptung.

**Was gebaut wurde**

| Teil | Ort |
|---|---|
| Reiterleiste | `mitarbeiter.html` (`#liveTabs`, eigene Klassen) + `mitarbeiter.js` |
| Filter/Zustand | `_liveFilter`, `setLiveFilter`, `liveTabKey`, Adress-Synchronisierung |
| Deep-Link | Name der Zeile → `openWorkerDetail` → Profil-Hub mit vorgewähltem Menschen |
| Ehrliche Menge | `getWorkerLiveBoard` liefert `scope.limit` + `truncated` |
| Tests | 30 Oberfläche (vm-Sandbox) · 3 Backend zur Deckelung |

**Ein Sonderfall, der beim Bauen auffiel:** ein Mitarbeiter ohne Konto (Mig 175)
darf seinen Namen behalten, aber keinen Verweis bekommen, der ins Leere führt.
Der Deep-Link erscheint nur, wenn es ein Ziel gibt — und wenn der Mensch nicht in
der Auswahl des Profil-Hubs steht, sagt die Oberfläche das, statt wortlos auf dem
Platzhalter zu landen.

### Welle E5 — Das Zustands-Protokoll ✅ *(erledigt 2026-08-13)*

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

> **Gate E5 ist erfüllt** — belegt mit **rohem SQL, ganz ohne Anwendungscode**
> (`api/test/integration/zustandsprotokoll.flow.test.js`, 13/13).

**Die Zusage ließ nur eine Bauweise zu**

„Ein Zustandswechsel *ohne Protokolleintrag ist nicht möglich*" ist eine harte
Aussage. Ein Dienst, der brav `protokolliere()` aufruft, kann sie nicht
einlösen: die nächste Route, der nächste Import, ein Hotfix per `psql` — jeder
Pfad, der die Quelle ändert, ohne den Dienst zu benutzen, hinterlässt eine
Lücke, die niemand bemerkt. Ein Test hätte dann nur beweisen können, dass
*unser* Code protokolliert.

Deshalb steht das Protokoll **in der Datenbank**, als Trigger an den drei
Tabellen, aus denen der Zustand entsteht. Ein `UPDATE` um drei Uhr nachts wird
genauso mitgeschrieben wie ein Klick. Genau das prüft der Test: er schreibt
ausschließlich rohes SQL.

**Eine Definition des Zustands, nicht zwei.** Ein Trigger, der die
Fallunterscheidung der Tafel in PL/pgSQL nachbaut, wäre eine zweite Wahrheit —
und die driftet, sobald jemand nur eine Stelle anfasst. Es gibt deshalb die
Funktion `worker_live_status()`, und eine **Abgleichprobe** vergleicht sie an
denselben Daten mit dem, was die Tafel anzeigt.

**Warum `endet_bald` nicht im Protokoll steht.** Es ist keine Änderung, sondern
eine **Frist**: niemand löst sie aus, sie tritt durch Zeitablauf ein. Im
Protokoll wäre sie ein Ereignis ohne Ursache — und ein Trigger kann sie gar
nicht sehen, weil zum Zeitpunkt des Übergangs keine Zeile geschrieben wird. Ein
nächtlicher Job, der solche Übergänge nachträgt, wurde verworfen: er verpasst
genau die kurzen Zustände, wegen derer der Plan das Protokoll verlangt. Die
Tafel zeigt die Frist weiterhin — als Verfeinerung von „im Einsatz".

**Aufbewahrung: 24 Monate** (Owner-Entscheidung 2026-08-13, **vor** dem Bau
getroffen). Die Frist steht als Funktion in der Datenbank, nicht im
Anwendungscode — zwei Zahlen an zwei Orten heißt, dass die zweite irgendwann die
falsche ist. Ausgelöst täglich um 04:00 über die vorhandene Job-Infrastruktur;
ohne Redis läuft der Takt nicht, deshalb ist der Handgriff dokumentiert:
`SELECT worker_status_events_aufraeumen();`

**Mengengerüst:** ein Ereignis je Wechsel je Mensch. Bei 300 Kunden × 200
Kräften × ~30 Wechseln im Jahr sind das ~1,8 Mio Zeilen in 24 Monaten —
unkritisch, solange Index und Aufbewahrung stehen.

| Teil | Ort |
|---|---|
| Migration | `sql/migrations/179_zustandsprotokoll_an_der_quelle.sql` |
| Zustands-Definition | `worker_live_status()` — von den Triggern benutzt, gegen die Tafel geprüft |
| Trigger | `worker_absences`, `worker_assignment_links` (nur zustandstragende Spalten), `worker_profiles` |
| Dienst | `api/services/workerStatusEventService.js` — **liest nur** |
| Endpunkt | `GET /api/workers/status-timeline` |
| Aufbewahrung | `worker_status_events_aufraeumen()` + täglicher Job 04:00 |
| Oberfläche | „Verlauf" je Zeile → Zeitstrahl im Dialog (DE/EN) |
| Tests | 6 Einheit · 5 Oberfläche · 13 gegen das echte Schema |

**Ein Detail, das beim Bauen auffiel:** eine Adressänderung am Einsatz darf kein
Ereignis erzeugen. Ohne die Bedingung „nur bei echter Änderung" füllte sich der
Zeitstrahl mit `montage → montage`, und die eine echte Änderung ginge darin
unter. Das ist als `CHECK` in der Tabelle festgehalten, nicht nur als Absicht im
Trigger.

---

## Reihenfolge

**~~E2~~ → ~~E3~~ → ~~E4~~ → ~~E5~~.** Erst die Quellen, dann die Anzeige, dann der Verlauf.

**Spur E ist abgeschlossen.** Alle fünf Wellen erledigt, alle Gates belegt —
E2/E3/E5 gegen die echte Datenbank, E4 am gerenderten Markup.

Die Versuchung ist, mit den Reitern anzufangen — sie sind das Sichtbare. Das
wäre falsch: ein Reiter ohne Datenquelle ist eine Zusage, die das Produkt nicht
halten kann, und genau davon hat dieses Repo schon genug (siehe
`docs/FRONTEND_REIFEGRAD_AUDIT.md`).
