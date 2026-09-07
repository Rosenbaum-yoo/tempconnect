# Welle R — Die Sicht der Zeitarbeitsfirma

> **Status: Bauanweisung.** Erstellt 2026-09-06, Ist-Stand gemessen.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".
>
> **Zur Herkunft, ehrlich:** der Owner hatte die Flow-Vorgabe für diese Seite angekündigt
> (*„Flow-Vorgabe dazu kommt noch"*) und dann gebeten, ohne sie weiterzumachen. Was hier steht,
> ist deshalb **abgeleitet** — aus gemessenem Bestand und aus Entscheidungen, die für die
> andere Marktseite bereits getroffen sind. **Jede abgeleitete Annahme ist als solche
> gekennzeichnet.** Sie sind zu bestätigen, nicht zu glauben.

---

## 1. Der Befund: sie hat keinen Ort, sie hat siebzehn

Gemessen am 2026-09-06:

| | |
|---|---|
| Flächen für die Zeitarbeitsfirma | **17** |
| davon in ihrer Navigation | **4** — `agency_inbox`, `angebote_verwalten`, `capacity_exchange_feed`, `mitarbeiter` |
| **nicht in der Navigation** | `capacity_exchange`, `capacity_exchange_manage`, `capacity_exchange_notdienst`, `sla_angebote`, `sla_nachweise`, `sla_search_jobs_list`, **`worker-submissions-review`** |

**Der letzte Eintrag ist der auffälligste.** Die Stundenzettel-Prüfung ist eine *tägliche*
Aufgabe mit **zehn Endpunkten** dahinter (`agencyPortal.js`: Eingang, Prüfung beginnen,
freigeben, an den Kunden senden, Bestätigung, Ablehnung, Korrektur anfordern, in den
Stundenzettel buchen). Sie steht in keiner Navigation.

Dazu kommen **drei Generationen von Oberflächen** nebeneinander: `capacity_exchange_*` (6),
`sla_*` (7), `agency_*` (2). Sie tun teils dasselbe.

> **Daraus folgt der Zweck dieser Welle.** Sie baut nicht mehr Funktionen — die gibt es. Sie
> baut **einen Ort und einen Tag**: eine Fläche, die die Frage beantwortet *„was muss ich
> heute tun?"*, und Wege, die von dort aus zu allem führen, was schon existiert.
>
> Für einen Disponenten, der zwischen Telefon und Tür arbeitet, ist das der Unterschied
> zwischen einer Plattform, die er benutzt, und einer, die er umgeht.

---

## 2. Der Tag der Zeitarbeitsfirma *(abgeleitet — bestätigen)*

Acht Dinge, in der Reihenfolge, in der sie im Betrieb anfallen. Zu jedem der Stand.

| # | Was sie tut | Stand | Wo es liegt |
|---|---|---|---|
| 1 | **Sieht, was heute brennt** — Ausfälle, ablaufende Fristen, unbestätigte Zusagen | ◐ Teile vorhanden, kein gemeinsamer Ort | Live-Belegschaft, `mitarbeiter.html` |
| 2 | **Beantwortet, was hereingekommen ist** — Buchungen und Anfragen von Unternehmen | ◐ `agency_inbox` existiert und ist verlinkt | `agency_inbox.html` |
| 3 | **Gibt neue Kräfte frei für den Markt** — wer Fähigkeiten eingetragen hat | ⏭ **M4.8**, in Arbeit | Freigabe-Ansicht |
| 4 | **Besetzt Einsätze** — wer geht wohin | ✅ mehrere Wege vorhanden | `workerSubmissionsReview`, Schnellzuweisung |
| 5 | **Kümmert sich um Ausfälle** — Krankmeldung, Ersatz, Kunde informieren | ✅ vollständig (Welle G, Q3) | `mitarbeiter.html` |
| 6 | **Prüft Stundenzettel** und sendet sie an den Kunden | ⊘ **gebaut, aber nicht in der Navigation** | `worker-submissions-review.html` |
| 7 | **Sieht, wo sie fehlt** — Nachfragesignal | ⏭ **N7.1** *(gebaut)* | neu |
| 8 | **Stellt Zeugnisse aus** | ⏭ **Q2** | neu |

---

## 3. Wellen und Phasen

### R1 · Ein Ort statt siebzehn

| Phase | Inhalt | Nachweis |
|---|---|---|
| R1.1 | **Erhebung zuerst:** jede der 17 Flächen einordnen — *täglich gebraucht · gelegentlich · ersetzt · tot*. Gegen Welle **P** halten, damit nichts entfernt wird, das ein Plan vorsieht | Eine Tabelle mit Urteil und Beleg je Fläche. **Vor jedem Umbau** |
| R1.2 | **Die Startseite beantwortet eine Frage:** *was muss ich heute tun?* Keine Kacheln mit Kennzahlen, sondern **Aufgaben mit Anzahl** — „3 Stundenzettel warten", „2 Zusagen unbestätigt", „1 Ausfall ohne Ersatz" | Jede Zeile führt direkt zum Vorgang, nicht zu einer Übersicht |
| R1.3 | **Was täglich gebraucht wird, steht in der Navigation.** Beginnend mit der Stundenzettel-Prüfung. Die Einträge liegen in `frontend/public/js/pageShell.js` (~1215, `INTENTS`) mit `label`, `sub`, `href`, `key`, `org` — **und Suchbegriffen** (`t`), damit die Fläche auch über die Suche gefunden wird | Klickpfad **und** Suchtreffer für jede tägliche Aufgabe |
| R1.4 | **Der Eintrag wird erzwungen, nicht nur hinzugefügt** — siehe den Befund unter der Tabelle. Sonst fällt er beim nächsten Umbau still wieder heraus, und genau das ist hier schon passiert | Eintrag entfernen → **Probe rot**. Ohne diese Rückmutation zählt R1.3 nicht als erledigt |
| R1.5 | **Die drei Generationen werden benannt**, nicht stillschweigend nebeneinander gelassen: welche Fläche ist die gültige, welche wird abgelöst | Registereintrag je abgelöster Fläche, mit Nachfolger |

> ### Der Wächter existiert — und war die ganze Zeit grün
>
> **Gemessen 2026-09-07, nachdem die bauende Sitzung empfohlen hatte, den
> Navigationseintrag per Wächter zu erzwingen.** Der Rat ist richtig. Der Wächter ist nur
> schon da: `api/test/erreichbarkeit.test.js` liest `docs/PLATTFORM_REGISTER.md` und prüft,
> dass jede lebende Seite **erreichbar** ist. Er läuft **7/7 grün** — während
> `worker-submissions-review.html` in keiner Navigation steht.
>
> **Der Grund ist sein Maßstab:** er prüft *„von irgendwo aus erreichbar"*. Ein Verweis aus
> einer Benachrichtigung genügt ihm. Für eine **tägliche** Aufgabe genügt das nicht — eine
> Disponentin, die Stundenzettel prüfen will, hat keine Benachrichtigung, sie hat eine Absicht.
>
> **Und jemand hat das schon gesehen:** eine seiner Proben heißt wörtlich *„die Monatsplanung
> steht in der Navigation — nicht nur in einem Verweis"*. Genau die richtige Unterscheidung —
> aber **von Hand, für eine einzige Seite**. Wieder ein **aufzählender** Wächter, wo ein
> **entdeckender** gebraucht wird.
>
> **Daraus die Bauvorgabe für R1.4:** das Register bekommt eine Spalte für *tägliche Aufgabe*,
> und der Wächter verlangt für diese Zeilen einen **Navigationseintrag**, nicht bloß einen
> Verweis. Damit gilt die Regel für die nächste Fläche automatisch mit — und niemand muss sie
> erneut von Hand entdecken.

---

### R2 · Der Eingang

| Phase | Inhalt | Nachweis |
|---|---|---|
| R2.1 | **Buchungen und Anfragen an einem Ort**, mit dem Unterschied sichtbar: eine Buchung ist geschehen, eine Anfrage wartet auf sie | Beide Arten erscheinen, unterscheidbar |
| R2.2 | **Ein Klick bestätigt** — der Weg existiert (`confirm-agreement`) | Aus dem Eingang heraus, ohne Umweg |
| R2.3 | **Antworten statt ablehnen:** stimmt der Preis nicht, geht eine Nachricht zurück. `negotiate-deal` existiert und hat auf dieser Fläche **keinen Aufrufer** | Preis abweichend → Antwort möglich, Vorgang bleibt offen |
| R2.4 | **Nichts bleibt unbemerkt liegen.** Eine Anfrage ohne Antwort meldet sich wieder — die Gegenseite wartet auf einen Einsatz | Rückmutation: Erinnerung entfernen → Probe rot |

### R3 · Die Stundenzettel-Prüfung wird sichtbar

**Zehn fertige Endpunkte, eine gebaute Fläche, keine Navigation.**

| Phase | Inhalt | Nachweis |
|---|---|---|
| R3.1 | **In die Navigation, mit Anzahl** — „Stundenzettel (3)" | Sie ist ohne Vorwissen erreichbar |
| R3.2 | **Der Weg zum Kunden ist einer**, nicht drei: prüfen → freigeben → senden | Ein Stundenzettel läuft ohne Seitenwechsel durch |
| R3.3 | **Korrektur ist kein Abbruch** — `request-correction` existiert; der Mensch erfährt, was fehlt | Korrektur angefordert → der Mensch sieht den Grund im Portal |

### R4 · Sie sieht, wo sie fehlt

| Phase | Inhalt | Nachweis |
|---|---|---|
| R4.1 | **Das Nachfragesignal auf der Startseite** (N7.1) — „im Raum Münster werden 34 gesucht, verfügbar sind 6" | Die Zahl stimmt mit den offenen Bedarfen überein |
| R4.2 | **Ihre unsichtbaren Kräfte** (M4.9): wer keinen Wohnort, keine Katalog-Fähigkeit oder keine Freigabe hat | Je Grund eine lesbare Zeile — **niemand fällt wortlos aus dem Markt** |
| R4.3 | **Preisvorschlag auch für die Angebotsseite** — `smartPricing` kennt den Kontext `supply` bereits | Sie sieht, ob sie über oder unter Markt liegt |

### R5 · Was ihr gehört, bleibt bei ihr

| Phase | Inhalt | Nachweis |
|---|---|---|
| R5.1 | **Die Zuverlässigkeitsskala** (Q1) ist ihre Sicht auf ihre Leute — **kein Kunde sieht sie** | Fremde Org → 403 |
| R5.2 | **Die Dispositionsnotiz bleibt intern** — sie darf nie in den Marktplatz gelangen | Mig 201 hält es fest; **Rückmutation:** Notiz in die Feldliste → Probe rot |
| R5.3 | **Zeugnisse** (Q2) — Entwurf aus Tatsachen, Freigabe durch sie | Ohne Freigabe kein Zeugnis |

### R6 · Härtung

| Phase | Inhalt | Nachweis |
|---|---|---|
| R6.1 | **Jede tägliche Aufgabe hat einen Klickpfad** — als Wächter, nicht als Stichprobe | Neue Fläche ohne Pfad → rot |
| R6.2 | **Mandantengrenze auf allen neuen Wegen** | Fremde Org → 403, nicht 200 mit leerer Liste |
| R6.3 | **Kein Weg von hier in eine interne Fläche** — der Wächter aus `staffNieAusDerPlattform` gilt auch für neue Seiten | Läuft mit |

---

## 4. Reihenfolge

```
R1.1  Erhebung der 17 Flaechen   ← zuerst, sonst wird umgebaut statt aufgeraeumt
 ├── R3  Stundenzettel sichtbar   ← groesster Bestand pro Aufwand: 10 Endpunkte, 0 Navigation
 ├── R2  Der Eingang
 ├── R1.2 Die Startseite
 ├── R4  Wo sie fehlt            ← haengt an N7, das gebaut ist
 └── R5  Was ihr gehoert
     R6  Haertung, begleitend
```

**Empfohlen: R1.1 → R3 → R2 → R1.2 → R4 → R5.**

> **R3 steht vorn, weil es das billigste Sichtbare ist:** zehn fertige Endpunkte und eine
> gebaute Fläche, die niemand findet. Ein Navigationseintrag mit Anzahl ist eine Stunde
> Arbeit und ändert den Tag der Disponentin.

---

## 5. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Beantwortet die Startseite „was muss ich heute tun?"** — mit Aufgaben, nicht mit Kennzahlen |
| 2 | **Ist jede tägliche Aufgabe ohne Vorwissen erreichbar?** Klickpfad, nicht Adresszeile |
| 3 | **Wurde etwas entfernt, das ein Plan vorsieht?** R1.1 muss die Antwort vorher gegeben haben (Welle P, Klasse B) |
| 4 | **Bleibt Internes intern?** Dispositionsnotiz, Zuverlässigkeitsskala, Bewertungen — je eine Rückmutation |
| 5 | **Zählt „fertig" als fertig?** Jeder Endpunkt einen Aufrufer, jede Seite einen Klickpfad (M-L8) |
| 6 | **Ist etwas doppelt gebaut?** `agencyPortal` (10 Endpunkte), `agency_inbox`, `negotiate-deal`, `smartPricing` existieren |

---

## 6. Was Welle R **nicht** tut

- **Neue Funktionen bauen.** Fast alles existiert; es ist nur nicht auffindbar.
- **Flächen entfernen, bevor R1.1 sie eingeordnet hat.** Sieben stehen nicht in der
  Navigation — das heißt **nicht**, dass sie tot sind (Welle P, Klasse B).
- **Eine zweite Live-Belegschaft bauen.** Sie ist Welle E und J.
- **Die Marktplatz-Sicht des Unternehmens verändern.** Das ist Welle N.
- **Die interne Sicht nach außen öffnen.** Was der Firma gehört, bleibt bei ihr (R5).
