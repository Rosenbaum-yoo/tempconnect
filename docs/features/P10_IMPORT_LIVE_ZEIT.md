# P10 — CSV-Import, echte Live-Belegschaft, Systemzeit

**Arbeitsanweisung für die nächste Sitzung.** Drei Spuren aus den Owner-Abschnitten 5–7
(Screenshots vom 2026-08-11). Aufbau wie P9: Spur → Wellen → Gate je Welle. Eine Spur nach der
anderen, nicht parallel.

> **Vorlesereihenfolge für einen neuen Chat:** `docs/NAECHSTE-SCHRITTE.md` → dieses Dokument →
> los mit **D1**.

**Stand P9 bei Übergabe:** Spur A (A1–A5), Spur B (B1–B3) und Spur C (C1–C3) sind abgeschlossen
und committet. Es ist nichts offen, was P10 blockiert.

---

## Spur D — CSV-Import und Mitarbeiterverwaltung

### D.0 Die Leitfrage

Ein Import, der bei der ersten unpassenden Zeile alles verwirft und dann nur „VALIDATION" sagt,
ist kein Import — er ist eine Wand. Der Owner hat genau das erlebt (Screenshot 2).

### D.1 Ist-Stand — gemessen am 2026-08-11

Der Wizard steht (Upload → Mapping → Validierung → Import, `mitarbeiter.html`), der Endpunkt
existiert (`POST /workers/import`, `api/routes/workers.js:316`). Fünf Gründe, warum er in der
Praxis bricht — alle am Code belegt:

| # | Befund | Beleg |
|---|---|---|
| 1 | **Eine schlechte Zeile verwirft den ganzen Import.** `workers: z.array(importItemSchema)` — schlägt ein Element fehl, antwortet der Endpunkt mit 400 für alle. Kein Teilimport, kein Zeilenbericht. | `workers.js:311-314` |
| 2 | **Der Server sagt, was falsch ist — die Seite zeigt es nicht.** Die Antwort trägt `details: parsed.error.issues`. Im Screenshot steht eine **leere** Fehlerbox unter „Fehler: VALIDATION". | `workers.js:320` + Screenshot 2 |
| 3 | **`email` ist Pflicht.** Eine Zeitarbeitsfirma hat regelmäßig Mitarbeiter ohne eigene Adresse. Ohne E-Mail ist die Zeile nicht importierbar. | `workers.js:298` |
| 4 | **`date_of_birth` akzeptiert nur `JJJJ-MM-TT`.** Deutsche Exporte liefern `TT.MM.JJJJ` — jede solche Zeile scheitert. | `workers.js:307` |
| 5 | **`country` erlaubt höchstens 3 Zeichen.** „Deutschland" scheitert, „DE" geht. Aus einem Export kommt meistens das erste. | `workers.js:306` |

Zusätzlich der Owner-Wunsch: **variable Spaltennamen** müssen abgefangen werden (`Name` /
`Nachname`, `Gebdatum` / `Geburtsdatum`, `Wohnort` / `Stadt`, E-Mail an `@` erkennen …).

### D.2 Wellen

> **D-E1 — entschieden am 2026-08-11:** ✅ **Ja.** Ein Mitarbeiter **ohne E-Mail** ist
> importierbar, wenn eine Personalnummer vorhanden ist. Ohne E-Mail gibt es keinen
> Portal-Zugang, aber sehr wohl einen Stammdatensatz — und genau den will man beim Erstimport
> anlegen. Die Einladung wird später nachgereicht. **Umsetzung in Welle D4.**

### D1 ist erledigt *(2026-08-11)*

Der Import sagt jetzt, was los ist: statt des nackten Wortes „VALIDATION" steht dort eine Liste
**Zeile · Spalte — Grund**.

**Der Defekt war eine verschwiegene Auskunft.** Der Server liefert in `details` zu jedem Verstoß
den Pfad `["workers", <index>, "<feld>"]` und die Begründung (`api/routes/workers.js:320`). Die
Seite hat dieses Feld **nie angefasst** — sie zeigte `e.error`, also „VALIDATION", und eine leere
Box. Der Server wusste die Antwort, die Oberfläche verschwieg sie.

**Zwei Übersetzungen mussten dazu stimmen:**

1. **Index → CSV-Zeile.** Der Server zählt das *gesendete* Array. Ungültige Zeilen filtert der
   Wizard vorher heraus — ohne parallel mitgeführte Zeilennummern zeigt der Hinweis auf die
   falsche Zeile. Das wäre schlimmer als gar keiner. Gelöst über `gesendeteZeilen`, aufgebaut mit
   *derselben* Filterregel wie die Nutzlast.
2. **Feld → Spaltenkopf.** Der Nutzer kennt „Gebdatum", nicht `date_of_birth`. Die Rückauflösung
   nutzt das Mapping des Wizards; ohne Zuordnung fällt sie auf den Feldnamen zurück — lieber der
   interne Name als gar keine Angabe.

Lange Listen werden bei 20 Einträgen gedeckelt, die Gesamtzahl bleibt aber sichtbar. Ist keine
Zeile zuzuordnen, steht „Zeile unbekannt" — eine erfundene Nummer wäre schlimmer als das
Eingeständnis.

**Gate D1 erfüllt.** Belege: `api/test/csvImportFehler.test.js` (9 Prüfungen). Die
Zuordnungslogik wird dabei **wirklich ausgeführt** (vm-Sandbox mit gestellter Umgebung), nicht nur
im Quelltext gesucht — inklusive des Falls, dass der Array-Index nicht als Zeilennummer
durchschlagen darf.

**Was D1 sichtbar gemacht hat — und was daraus für D2 folgt:** Der Wizard hat eine *eigene*
Prüfung im Browser (`_csvData.validated` mit `_errors`) und sendet nur Zeilen, die er selbst für
gültig hält. Dass der Server sie trotzdem ablehnt, heißt: **die Browser-Prüfung ist schwächer als
das Server-Schema.** Zwei Prüfungen, zwei Wahrheiten. D2 und D4 müssen beide aus derselben Quelle
speisen — sonst bleibt der Wizard ein Versprechen, das der Server bricht.

#### Welle D1 — Der Import sagt, was los ist *(zuerst)*

Ohne diesen Schritt sucht jeder weitere blind. Die Antwort des Servers **anzeigen**: welche
Zeile, welche Spalte, welcher Grund. Der Wizard hat dafür bereits einen Validierungsschritt.

**Gate D1:** Eine fehlerhafte Datei erzeugt eine Liste „Zeile 7: Geburtsdatum `12.03.1988` — erwartet
`JJJJ-MM-TT`", nicht das Wort „VALIDATION". Jeder Fehler nennt Zeile **und** Spalte.

### D2 ist erledigt *(2026-08-11)* — Owner-Entscheidung: der Server ist die einzige Wahrheit

Gültige Zeilen werden importiert, ungültige einzeln zurückgemeldet. Eine Datei mit 100 Zeilen,
davon 3 fehlerhaft, importiert **97** und meldet **3** mit Zeile, Feld und Grund.

**Was vorher passierte:** `workers: z.array(importItemSchema)` — eine einzige unpassende Zeile
ließ den *gesamten* Import mit 400 scheitern. 99 gute Datensätze gingen wegen eines Tippfehlers
in Zeile 7 verloren.

**Die Entscheidung dahinter.** D1 hatte gezeigt, dass der Wizard im Browser selbst prüft — und
schwächer als der Server. Zwei Prüfstellen, zwei Wahrheiten. Zur Wahl standen: die Regeln an
beide ausliefern, oder eine Prüfstelle abschaffen. Der Owner hat den **ersten Weg** gewählt:
**der Server prüft, sonst niemand.** Damit ist die Drift nicht verwaltet, sondern beseitigt.

Konkret:
- Der Umschlag wird geprüft (Liste, nicht leer, höchstens 1000), **jede Zeile einzeln**.
- Die Oberfläche sendet **alle** Zeilen. Der Validierungsschritt im Wizard bleibt als *Vorschau*
  erhalten — er entscheidet nur nicht mehr.
- Ohne eine einzige gültige Zeile gibt es trotzdem **200 mit Bericht**, kein 400. Ein 400 würde
  die Oberfläche zurück auf die Wand werfen, die D1 gerade abgetragen hat.

**Ein dritter Zeilenversatz, gefunden beim Bauen.** `bulkImportWorkers` nummeriert seine Meldungen
mit dem Index seiner *eigenen* Liste (`i + 1`) — nicht mit der CSV-Zeile. Sobald etwas vorher
aussortiert wird, zeigt jede Meldung daneben. Derselbe Fehler wie im Browser (D1), nur eine Ebene
tiefer. Gelöst durch `_row` als Transportangabe und Rückübersetzung in der Route; der Dienst
bleibt unangetastet. `_row` wird vor dem Import entfernt — eine Transportangabe ist kein
Stammdatenfeld.

**Gate D2 erfüllt.** Belege: `api/test/csvTeilimport.test.js` (8 Prüfungen, davon 4 mit wirklich
ausgeführter Zerlegung, inklusive des Gate-Falls 100/3/97). Rückwärtsprobe: eine fehlerfreie
Datei verhält sich exakt wie vorher.

#### Welle D2 — Teilimport statt Alles-oder-nichts

Gültige Zeilen werden importiert, ungültige einzeln zurückgemeldet — mit der Möglichkeit, nur
diese zu korrigieren und nachzuladen. Der Endpunkt bekommt einen Zeilenbericht
(`importiert`, `übersprungen`, `fehlerhaft[]`), statt 400 für alles.

**Gate D2:** Eine Datei mit 100 Zeilen, davon 3 fehlerhaft, importiert 97 und meldet 3 mit Grund.
Rückwärtsprobe: eine fehlerfreie Datei verhält sich exakt wie heute.

#### Welle D3 — Die Spaltentabelle

Eine **Tabelle** (Datenbank, nicht Code), die Spaltenüberschriften auf TempConnect-Felder
abbildet: je Zielfeld beliebig viele Synonyme, mit Sprache und Priorität. Das Mapping des Wizards
und die Validierung speisen sich daraus, statt aus fest verdrahteten Listen.

Erkennungsregeln, die der Owner ausdrücklich genannt hat:
- E-Mail: Spalte, deren Werte `@` enthalten
- Name: `Name`, `Nachname`, `Familienname`, `Surname`, `Last name` …
- Geburtsdatum: `Gebdatum`, `Geburtsdatum`, `geb.`, `DOB`, `Birthday` …
- Wohnort: `Wohnort`, `Stadt`, `Ort`, `City` …

**Gate D3:** Eine CSV mit deutschen Alltagsüberschriften wird ohne manuelles Mapping korrekt
zugeordnet. Neue Synonyme sind ein `INSERT`, kein Deploy. Ein Test hält fest, dass Wizard und
Validierung **dieselbe** Tabelle benutzen — zwei Listen wären zwei Wahrheiten.

#### Welle D4 — Tolerante Feldregeln

- `date_of_birth` akzeptiert `TT.MM.JJJJ` und `JJJJ-MM-TT` und normalisiert nach ISO
  (über `todayDE`-Denke: kein roher UTC-Schnitt).
- `country` akzeptiert Klartext und normalisiert auf ISO-2 („Deutschland" → „DE").
- `email` wird **optional**, wenn eine Personalnummer vorhanden ist — sonst bleibt sie Pflicht.
  *(Owner-Entscheidung D-E1 nötig, siehe unten.)*

**Gate D4:** Ein realistischer Export einer Zeitarbeitsfirma geht ohne Handarbeit durch. Jede
Normalisierung ist im Zeilenbericht sichtbar („Land `Deutschland` → `DE`"), damit niemand rät.

### D.3 Reihenfolge

**D1 → D2 → D3 → D4.** Erst sehen, dann teilweise importieren, dann erkennen, dann tolerieren.

> **Owner-Entscheidung D-E1:** Soll ein Mitarbeiter **ohne E-Mail** importierbar sein, wenn eine
> Personalnummer vorhanden ist? *Meine Empfehlung: ja.* Ohne E-Mail gibt es keinen Portal-Zugang,
> aber sehr wohl einen Stammdatensatz — und genau den will man beim Erstimport anlegen.
> Die Einladung kann später nachgereicht werden.

---

## Spur E — Echte Live-Belegschaft

### E.0 Die Leitfrage

„Live-Belegschaft" verspricht Verfolgbarkeit. Heute zeigt sie eine Liste mit einem einzigen
Zustand („Im Einsatz") — das ist eine Momentaufnahme, keine Verfolgung.

### E.1 Ist-Stand — gemessen am 2026-08-11 (Screenshot 3)

Die Kopfzahlen stehen bereits: Auslastung 86 %, 6 im Einsatz, 1 verfügbar, 0 endet bald,
0 Stundenzettel offen, 7 Belegschaft. Die Liste darunter kennt aber nur **einen** Zustand und
keine Filterung.

**Vor dem Bauen zu klären (Welle E1):** Welche Zustände sind heute überhaupt gespeichert?
Kandidaten im Bestand: `assignments.status`, `worker_profiles`, Abwesenheiten/Krankmeldungen,
`worker_unavailable_reported` (Benachrichtigungstyp existiert). **Erst messen, dann Reiter bauen** —
ein Reiter „krank", den keine Datenquelle füllt, ist die nächste tote Fläche.

### E.2 Wellen

#### Welle E1 — Die Zustandswahrheit *(zuerst, nicht verhandelbar)*

Für jeden gewünschten Zustand (verfügbar, im Einsatz, krank, Montage, …) beantworten:
Woher kommt er, wer schreibt ihn, gibt es ihn heute schon? Ergebnis ist eine Tabelle mit
Dateibeleg je Zustand — dieselbe Disziplin wie P9/A1.

**Gate E1:** Kein Zustand ohne Quelle. Zustände ohne Datenquelle werden **benannt**, nicht
gebaut — mit dem Weg, wie sie entstehen könnten.

#### Welle E2 — Reiter mit echten Zahlen

Reiter je Zustand, jeder mit Zähler, gespeist aus einer Sammelabfrage (nicht je Zeile). Ein
Reiter, dessen Zustand niemand füllt, erscheint gar nicht erst.

**Gate E2:** Jeder sichtbare Reiter liefert beim Klick echte Zeilen. Leere Reiter erklären sich
(„keine Krankmeldungen erfasst"), statt leer zu wirken.

#### Welle E3 — Der Verlauf je Arbeiter

„Gesamtstatus verfolgbar" heißt: pro Mitarbeiter sichtbar, was wann galt. Zeitstrahl aus den
vorhandenen Ereignissen (Einsatzbeginn, Abwesenheit, Rückkehr).

**Gate E3:** Für einen Mitarbeiter ist ohne Datenbankzugriff nachvollziehbar, warum er heute in
diesem Zustand ist.

### E.3 Reihenfolge

**E1 → E2 → E3.** Ohne E1 baut E2 Attrappen.

---

## Spur F — Systemzeit im Einsatzportal

### F.0 Die Leitfrage

Ein Portal, das den falschen Tag hervorhebt, macht jede Planung unglaubwürdig. Der Owner sieht
„HEUTE" auf dem falschen Wochentag (Screenshot 4).

### F.1 Ist-Stand — und warum das kein Einzelfall ist

Das ist **dieselbe Fehlerklasse**, die in P9 Welle A4 auf der Rechnung gefunden wurde:
`new Date(...).toISOString().slice(0,10)` nimmt lokale Mitternacht und rechnet sie nach UTC —
in der Sommerzeit landet das auf dem **Vortag**. Auf der Rechnung war es der Abrechnungszeitraum,
hier ist es der markierte Tag.

Das Projekt hat dafür längst eine Regel und ein Werkzeug: `api/utils/dateDE.js`
(`todayDE`, `dateOnlyDE`) und die DACH-first-Direktive in `CLAUDE.md`. Sie wird nur nicht überall
benutzt.

### F.2 Wellen

#### Welle F1 — Den Fehler finden, nicht raten

Alle Stellen suchen, die ein Datum aus `toISOString()` schneiden oder mit `new Date()` einen Tag
bestimmen — im Einsatzportal **und** plattformweit. Ergebnis: Liste mit Datei:Zeile und
Einschätzung, ob die Stelle einen Tag verschieben kann.

**Gate F1:** Jede Fundstelle ist eingeordnet („verschiebt / verschiebt nicht / unklar"), keine
Vermutung.

#### Welle F2 — Beheben an der Wurzel

Serverseitig `todayDE`/`dateOnlyDE`; clientseitig eine entsprechende Hilfsfunktion, die den Tag
in `Europe/Berlin` bestimmt. **Kein** roher UTC-Schnitt mehr.

**Gate F2:** Der markierte Tag stimmt am 31.10. um 23:30 Uhr genauso wie am 01.07. um 00:30 Uhr.
Ein Test friert beide Zeitpunkte ein und prüft das Ergebnis.

#### Welle F3 — Damit es nicht wiederkommt

Ein Wächter, der `toISOString().slice(0,10)` und `toISOString().split("T")[0]` in datumsführenden
Pfaden rot werden lässt — mit einer benannten Ausnahmeliste für Stellen, wo UTC wirklich gemeint
ist (Zeitstempel, Dateinamen).

**Gate F3:** Ein neu eingefügter UTC-Schnitt in einem Datumsfeld macht die Suite rot. Negativprobe
gelaufen. Die Regel steht in `CLAUDE.md`/`SKILL.md` und ist damit auf die Folgeprojekte
übertragbar — der Owner hat das ausdrücklich verlangt.

### F.3 Reihenfolge

**F1 → F2 → F3.** Erst die Landkarte, dann der Fix, dann die Sperre.

---

## Regeln, die in jeder Welle gelten

Unverändert aus P9 — sie haben sich getragen:

1. **Erst messen, dann bauen.** Jede Behauptung über den Ist-Stand braucht einen Dateibeleg oder
   eine Abfrage. „Vermutlich" zählt nicht.
2. **Ein fehlender Effekt macht nichts rot.** Wo etwas *nicht* passiert, sucht kein Test. Deshalb
   bei jeder Kennzahl und jedem Knopf fragen: Wird das je geschrieben? Kommt das je an?
3. **Zwei Wahrheiten sind schlimmer als eine falsche.** Wenn zwei Stellen dieselbe Frage
   beantworten, müssen sie dieselbe Quelle benutzen.
4. **Wächter statt Vorsatz.** Was nicht wieder passieren soll, braucht einen Test — mit
   Negativprobe, dass er wirklich anschlägt.
5. **Am echten Bestand gegenprüfen.** Mock-Pools kennen keine CHECK-Bedingungen, keine Trigger und
   keine Fremdschlüssel. Was Geld oder Zustand berührt, wird zusätzlich im Container geprüft.
6. **Commit nur auf ausdrückliche Owner-Freigabe**, niemals `git add -A` (im Baum liegen
   Geschäftsunterlagen), Push nur nach separater Zusage.

## Offene Owner-Entscheidungen auf einen Blick

| Kennung | Frage | Empfehlung |
|---|---|---|
| **D-E1** | Mitarbeiter ohne E-Mail importierbar, wenn Personalnummer vorhanden? | ja — Stammdatensatz jetzt, Einladung später |
| **E-E1** | Welche Zustände soll die Live-Belegschaft führen? (verfügbar, im Einsatz, krank, Montage, …) | erst E1 abwarten: gebaut wird nur, was eine Quelle hat |
