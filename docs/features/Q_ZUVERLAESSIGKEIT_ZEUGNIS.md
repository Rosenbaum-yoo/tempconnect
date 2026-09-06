# Welle Q — Zuverlässigkeit, Zeugnis, Abwesenheit

> **Status: Bauanweisung mit zwei Vorbehalten.** Owner-Vorgabe 2026-09-06.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".
>
> Zwei der drei Themen berühren **Arbeitsrecht und Datenschutz**. Sie sind baubar — aber
> nicht so, wie sie zuerst klingen. Abschnitt 1 und 2 sagen genau, was sich ändern muss.

---

## 1. Die Zuverlässigkeitsskala

> **Owner-Vorgabe im Wortlaut:** *„Wollen wir auch eine Statistik anlegen, welcher
> Mitarbeiter sich gerne mal krankmeldet, so als interne Bewertung, ohne dass der
> Mitarbeiter das mitbekommt — lass uns das lieber eine positive Seite geben und eine
> Zuverlässigkeitsskala für Mitarbeiter, intern, für Zeitarbeitsfirmen, die eine Rolle
> spielt, auch für Arbeitszeugnisse?"*

**Der Owner hat sich mitten im Satz selbst korrigiert — und die Korrektur ist richtig.**
Eine positive Skala ist besser als eine Krankmeldungs-Statistik. Zwei Dinge müssen darüber
hinaus anders sein, sonst wird aus einer guten Idee ein Haftungsrisiko.

### 1.1 Krankmeldungen fließen NICHT ein

Drei Gründe, und jeder allein genügt:

| | |
|---|---|
| **Es sind Gesundheitsdaten** | Krankheit ist eine besondere Kategorie personenbezogener Daten (Art. 9 DSGVO). Daraus eine Bewertungszahl zu bilden, ist die heikelste denkbare Verwendung |
| **Es bestraft ein Recht** | Wer krank ist, darf krank sein. Eine Skala, die Krankmeldungen abwertet, bestraft die Inanspruchnahme eines Rechts — und drückt Menschen dazu, krank zur Arbeit zu gehen. Das ist auch betrieblich teuer: ein kranker Pfleger im Einsatz ist ein Vorfall, kein Vorteil |
| **Es misst das Falsche** | Der Owner will Verlässlichkeit. Krankheit misst Gesundheit, nicht Verlässlichkeit |

### 1.2 Sie ist nicht heimlich

*„ohne dass der Mitarbeiter das mitbekommt"* trägt nicht:

- **Er erfährt es ohnehin.** Art. 15 DSGVO gibt jedem Menschen das Recht, die über ihn
  gespeicherten Daten zu erfahren. Eine heimliche Skala ist eine Skala, die spätestens bei
  der ersten Auskunftsanfrage sichtbar wird — dann aber als **Vertrauensbruch**.
- **Sie ist mitbestimmungspflichtig.** Ein System, das Leistung oder Verhalten von
  Beschäftigten bewertet, unterliegt der Mitbestimmung des Betriebsrats (§ 87 Abs. 1 Nr. 6
  BetrVG). Heimlich eingeführt, ist es angreifbar.
- **Sichtbar wirkt sie besser.** Eine Skala, die niemand sieht, ändert kein Verhalten. Eine,
  die der Mensch sieht, ist ein Anreiz — und genau das will der Owner erreichen.

> **Die Umkehrung ist der eigentliche Gewinn:** eine sichtbare Verlässlichkeitsskala ist für
> den Menschen ein **Zeugnis in Echtzeit**. Wer sie hochhält, bekommt bessere Einsätze — und
> weiß das. Das ist ein Bindungsinstrument, kein Kontrollinstrument.

### 1.3 Woraus sie sich speist — alles beeinflussbar, alles sichtbar

| Bestandteil | Vorhanden? |
|---|---|
| **Zusagen eingehalten** — bestätigte Anfragen gegen abgesagte | ✅ `worker_assignment_links.worker_confirmation_status` |
| **Antwortzeit auf Anfragen** — wer schnell antwortet, ist planbar | ✅ Frist und Antwortzeitpunkt liegen vor (72 h / 4 h) |
| **Einsätze angetreten und beendet** — ohne Abbruch | ◐ setzt **M8.1** voraus (Einsatzende) |
| **Stundenzettel pünktlich** | ✅ Stundenzettel-Schleife vorhanden |
| **Interne Bewertung der Firma** | ✅ `POST /ratings`, `GET /users/:id/ratings`, `GET /users/:id/reputation` |

**Was ausdrücklich NICHT einfließt:** Krankmeldungen, Abwesenheitsarten, Gesundheitsdaten
jeder Art — und nichts, was der Mensch nicht beeinflussen kann.

| Phase | Inhalt | Nachweis |
|---|---|---|
| Q1.1 | **Die Skala aus den fünf Bestandteilen**, je Zeitarbeitsfirma und Mensch | Zwei Menschen mit unterschiedlichem Verhalten → unterschiedliche Zahl |
| Q1.2 | **Wächter: keine Gesundheitsdaten in der Berechnung** — entdeckend, nicht aufzählend | Abwesenheitstabelle in die Abfrage aufnehmen → **Probe rot** |
| Q1.3 | **Der Mensch sieht seine eigene Skala** im Einsatzportal, mit den Bestandteilen | Er kann sagen, warum sie so steht |
| Q1.4 | **Sie fließt ins Ranking** (N3) — als *ein* Bestandteil, nicht als Alleinentscheider | Gewicht dokumentiert und begründet |
| Q1.5 | **Mandantengrenze:** die Skala gehört der Zeitarbeitsfirma, nicht der Plattform. Kein Kunde sieht sie | Fremde Org → 403 |

---

## 2. Das Arbeitszeugnis

> **Owner-Vorgabe:** *„Wollen wir zu Arbeitszeugnissen was anlegen, so dass automatisch ein
> PDF entsteht oder aktualisiert wird, sollten sich Sachen verbessern oder verschlechtern —
> aber alles auf Sprache der echten Arbeitszeugnisse?"*

**Ja — als Entwurf. Nie als Ausstellung.** Der Unterschied ist die ganze Welle.

### 2.1 Warum es kein automatisches Zeugnis geben darf

| | |
|---|---|
| **Es schuldet der Arbeitgeber, nicht die Plattform** | Das Zeugnis ist eine Pflicht der Zeitarbeitsfirma gegenüber ihrem Beschäftigten. Sie haftet für den Inhalt — also muss sie ihn verantworten und unterschreiben |
| **Es muss wohlwollend und individuell sein** | Ein maschinell erzeugter Baustein-Text ist beides oft nicht. Ein Zeugnis, das erkennbar aus einer Vorlage fällt, mindert den Wert für den Menschen |
| **Verdeckte Codes sind gefährlich** | „Zeugnissprache" mit verstecktem Tadel ist rechtlich angreifbar. Eine Plattform, die solche Formeln **automatisch** einsetzt, erzeugt reihenweise angreifbare Zeugnisse — und der Owner haftet für die Vorlage |

### 2.2 Was die Plattform beitragen kann — und das ist viel

Sie kennt die **Tatsachen** besser als jedes Personalbüro:

- Einsatzzeiträume, lückenlos und belegt
- Tätigkeiten und Fähigkeiten, aus dem Katalog statt aus der Erinnerung
- Kunden, Branchen, Einsatzorte
- Dauer, Verlängerungen, Übernahmen

| Phase | Inhalt | Nachweis |
|---|---|---|
| Q2.1 | **Der Tatsachenteil entsteht automatisch** und aktualisiert sich | Ein neuer Einsatz → der Entwurf enthält ihn |
| Q2.2 | **Der Bewertungsteil kommt von der Firma** — vorgeschlagen aus der Skala (Q1), aber **nie ohne Freigabe** übernommen | Ohne Freigabe kein Satz zur Leistung |
| Q2.3 | **Ausgestellt wird nur mit Unterschrift** — der Entwurf trägt sichtbar „ENTWURF", bis jemand ihn freigibt | Ein nicht freigegebener Entwurf lässt sich nicht als Zeugnis herunterladen. **Rückmutation** |
| Q2.4 | **Keine verdeckten Formeln.** Die Bausteine sind offen einsehbar, auch für den Menschen | Der Entwurf ist lesbar, nicht verschlüsselt |
| Q2.5 | **Zwischenzeugnis auf Knopfdruck** — derselbe Weg, anderer Anlass | Ein Zwischenzeugnis entsteht ohne neue Eingaben |

> **Der Gewinn für die Zeitarbeitsfirma:** ein Zeugnis, das heute eine Stunde Arbeit kostet
> und aus dem Gedächtnis zusammengesucht wird, ist in fünf Minuten fertig und **faktisch
> korrekt**. Das ist ein echter Grund, die Plattform zu behalten.

---

## 3. Die Krankmeldung erreicht das Büro — **existiert bereits**

> **Owner-Frage:** *„Und wo bekommt der Zeitarbeitschef eine Benachrichtigung, wenn man sich
> krankmeldet? Das muss irgendwie in der Plattform verwaltbar sein."*

**Gemessen am 2026-09-06: gebaut, und zwar vollständiger als gefragt.**

| Was gefragt war | Stand |
|---|---|
| Benachrichtigung an den Chef | ✅ `benachrichtigeBuero()` (`workerAbsenceService.js:643`) — über `dispatch` an die Org-Mitglieder mit der passenden Berechtigung, nicht an eine feste Rollenliste |
| Verwaltbar in der Plattform | ✅ `GET /workers/absences`, aufgerufen in `mitarbeiter.js:2011` |
| Aufheben einer Abwesenheit | ✅ `POST /workers/absences/:id/aufheben` |
| Ersatz vorschlagen | ✅ vorhanden — und schlägt nur vor, wer im Zeitraum wirklich verfügbar ist |
| Der Kunde erfährt den Ausfall | ✅ **ohne die Art der Abwesenheit** — „krank" ist ein Gesundheitsdatum, der Kunde ist ein Dritter (Welle G, Entscheid G-E7) |

| Phase | Inhalt | Nachweis |
|---|---|---|
| Q3.1 | **Nachweisen statt bauen:** den Weg einmal end-to-end durchspielen und belegen | Krankmeldung im Portal → Meldung im Büro → Abwesenheit in der Liste → Ersatzvorschlag |
| Q3.2 | **Die eine offene Frage:** was passiert, wenn in der Org **niemand** die Berechtigung trägt? `dispatch` überspringt unbekannte Empfänger **wortlos** | Org ohne berechtigtes Mitglied → die Meldung darf nicht still verschwinden |

---

## 4. Verspaetung und Krankmeldung schliessen sich aus — aber nicht durch eine Sperre

> **Owner-Frage 2026-09-06:** *„Man soll auch nicht Verspätung und Krankmeldung gleichzeitig
> geben können. Bei solchen Meldungen muss es was Schlaues geben, das da steht — hast du eine
> Empfehlung?"*

**Ja: nicht sperren, sondern ablösen.** Zwei gleichzeitige Meldungen sind ein Widerspruch —
aber *nacheinander* sind sie der Normalfall: „ich komme 30 Minuten später“ und eine Stunde
später „ich schaffe es doch nicht“. Das ist kein Fehler, das ist ein **Zustandswechsel**.

**Der Bestand denkt bereits so.** `VERSPAETUNG_MAX_MINUTEN = 240`: ab da ist es keine
Verspätung mehr, und die Ablehnung **verweist auf den anderen Weg**, statt nur nein zu sagen.
Der Kommentar dort nennt den Grund: *„wer hier scheitert, hat ein echtes Anliegen; ihn ohne
Hinweis stehen zu lassen, treibt ihn ans Telefon — und dann steht die Meldung wieder
ausserhalb des Systems."* **Genau diese Haltung wird hier fortgesetzt.**

**Gemessen:** eine gegenseitige Ausschlussprüfung gibt es heute **nicht**. Beide Meldungen
sind für denselben Tag möglich, und keine weiß von der anderen.

| Phase | Inhalt | Nachweis |
|---|---|---|
| Q4.1 | **Eine Meldung je Einsatz und Tag.** Eine zweite legt keinen zweiten Satz an, sie **löst den ersten ab**. Der vorherige Zustand bleibt in der Zeitleiste (`worker_status_events`) | Zwei Meldungen → ein aktueller Zustand, zwei Zeitleisten-Einträge |
| Q4.2 | **Die Oberfläche fragt weiter, statt zu verbieten.** Nicht „Sie haben bereits eine Meldung“, sondern: *„Du hast dich um 7:10 für 30 Minuten später gemeldet. Was gilt jetzt?“* → **später als gedacht · ich falle heute aus · doch pünktlich** | Kein Weg endet in einer Fehlermeldung |
| Q4.3 | **Wirkungsvorschau vor der Umwandlung.** Aus Verspätung wird Ausfall → das startet die **4-Stunden-Ersatzfrist** und informiert den Kunden. Das muss der Mensch **vorher** sehen | „Damit fällt dein Einsatz heute aus. Der Kunde wird informiert, dein Büro sucht Ersatz." |
| Q4.4 | **Die Rückrichtung ist erlaubt, aber sie warnt.** Ausfall → doch da: wenn bereits Ersatz gestellt wurde, stehen zwei Menschen an der Stelle. Erlaubt bleibt es — aber mit Hinweis und einer Meldung ans Büro, das entscheidet | Ersatz gestellt → Rücknahme zeigt es und meldet es |
| Q4.5 | **Die Reihenfolge ist Information für das Büro** — „erst Verspätung, dann Ausfall“ kostet den Disponenten zwei Stunden. Sie gehört in die Zeitleiste | Der Verlauf ist lesbar, nicht nur der Endzustand |

> **Und die Grenze, die zu Q1 gehört:** diese Reihenfolge fließt **NICHT** in die
> Zuverlässigkeitsskala. Am Ende steht eine Krankmeldung — und Krankmeldungen werden nicht
> bewertet (1.1). Sie ist Disposition, nicht Bewertung. Wer das vermischt, hat die Skala
> durch die Hintertür wieder zu einer Krankheitsstatistik gemacht.

---

## 4. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Fließt irgendwo eine Krankmeldung in die Skala?** Entdeckender Wächter, Rückmutation — das ist die wichtigste Probe dieser Welle |
| 2 | **Sieht der Mensch seine eigene Skala?** Ohne das ist sie heimlich, und damit angreifbar |
| 3 | **Lässt sich ein nicht freigegebener Zeugnis-Entwurf als Zeugnis herunterladen?** Muss scheitern |
| 4 | **Bleibt die Skala beim Arbeitgeber?** Kein Kunde, keine fremde Org — 403 |
| 5 | **Verschwindet eine Krankmeldung still**, wenn niemand die Berechtigung trägt? |

---

## 5. Was Welle Q **nicht** tut

- **Krankmeldungen bewerten.** In keiner Form, an keiner Stelle.
- **Eine heimliche Bewertung führen.** Was über einen Menschen gespeichert wird, sieht er.
- **Zeugnisse automatisch ausstellen.** Die Plattform liefert Tatsachen und einen Entwurf;
  ausgestellt wird mit Freigabe und Unterschrift.
- **Verdeckte Zeugnisformeln einsetzen.**
- **Die Abwesenheitsverwaltung neu bauen.** Sie existiert (Welle G) — Q3 weist sie nach.
