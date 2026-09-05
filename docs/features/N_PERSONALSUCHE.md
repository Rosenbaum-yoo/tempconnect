# Welle N — Die Personalsuche

> **Status: Bauanweisung, freigegeben 2026-09-05.** Ist-Stand gemessen.
> Owner-Vorgabe: die Unternehmenssicht auf den Marktplatz — vier Fragen, ein Bündel,
> eine Bestätigung, ein verbindlicher Abschluss.
>
> Gehört zu [`M_MARKTPLATZ_FLOW.md`](M_MARKTPLATZ_FLOW.md) (Angebotsseite) und setzt
> dessen Welle M5 (Korb) voraus.

---

## 1. Die Owner-Vorgabe im Wortlaut

> „wenn unternehmen auf arbeiter suchen geht oder personalsuche […] dass er drei oder vier
> fragen beantworten muss in nem modal oder in suchfeldern — er gibt an was er sucht, also
> die skills, damit die zum katalog passen müssen die auch da übereinstimmen, also irgendwie
> anklickbar für unternehmen machen. und dann wieviele er braucht und von wann bis wann und
> wie teuer diese einzeln sein dürfen. hier muss dann auch auf notdienst hingewiesen werden.
> er sendet ab und dann werden alle mit den gesuchten skills gebündelt für die menge an
> arbeiter die er buchen wollte angezeigt, mit ausnahme der gesperrten bei diesem
> unternehmen. wenn er einzelne leute sucht, dann werden die profile bzw angebote einzeln
> angezeigt. er kann dann auswählen und muss alle 4 vorher in der suche eingegebenen
> suchkriterien einmal bestätigen. und dann löst es, wenn er verbindlich gebucht hat, die
> live-belegschaftsbelegung bei der zeitarbeitsfirma aus, und es geht eine automatische
> benachrichtigung an den worker. die zeitarbeitsfirma bekommt die notwendigen unterlagen:
> rechnungen, stundenzettel, die vereinbarung und so weiter."
>
> Dazu: **„liefere mehr als erwartet, mit Wow-Effekt — für Unternehmen *und*
> Zeitarbeitsfirmen."**

---

## 2. Der Befund in einem Absatz

Die vier Felder existieren alle. Der Notdienst existiert. Die Buchungsprüfung existiert.
**Was fehlt, ist die Klammer** — und ein Defekt, der wichtiger ist als alles andere:

> **Die Angebotsseite ist katalogfest, die Nachfrageseite ist Freitext.**
> Jedes Marktplatz-Angebot entsteht aus einer Katalog-Fähigkeit (`platform_skills`). Das
> Bedarfsformular fragt: *„Skills (kommagetrennt), z. B. Schichtarbeit, Montage"* — ein
> freies Textfeld (`marketplace_demand_create.html:55`).
>
> Wer **„Gabelstaplerfahrer"** tippt, trifft den Katalogeintrag **„Staplerfahrer"** nicht.
> Die beiden Seiten können sich **strukturell nicht zuverlässig finden.**
>
> Die Owner-Vorgabe „anklickbar, damit sie übereinstimmen" ist damit **kein
> Bedienkomfort, sondern die Bedingung dafür, dass Matching überhaupt funktioniert.**
> Sie ist Phase N1 und geht allem anderen voran.

---

## 3. Der Wow-Effekt liegt schon im Code — er hat nur keine Oberfläche

Gemessen am 2026-09-05: **zwei vollständige Motoren mit null Frontend-Aufrufern.**

| Motor | Was er kann | Aufrufer heute |
|---|---|---|
| **`smartPricingService`** (`/api/pricing/suggest`) | Datengestützter Preisvorschlag je **Rolle, Region und Dringlichkeit** — inklusive der Stufe `notdienst`. Plan-gegated auf PLUS/PRO | **null** |
| **`capacityDiscoveryService`** (`/capacity-discovery/by-role`, `/by-region`, `/by-category`, `/summary`) | Verfügbare Kapazität, aggregiert nach Rolle, Region und Kategorie | **null** |
| `profileRankings` | Kuratiertes Ranking, Segmente (z. B. GOLD) | einer (der eigene Rang der Agentur) |

**Das ist die billigste Wow-Lieferung des ganzen Projekts.** Beide Motoren sind gebaut,
getestet und plan-gegated. Es fehlt die Anzeige.

### Was daraus für die zwei Seiten wird

**Für das Unternehmen — die vierte Frage beantwortet sich selbst.**
Statt „Wie teuer dürfen sie sein?" auf ein leeres Feld zu stellen, sagt die Suche:
*„Üblich sind 28–34 €/h für Pflegefachkraft im Raum Münster. Bei Notdienst 41 €."*
Der Kunde muss nicht raten, und er stellt kein Budget ein, das niemand bedienen kann —
**die häufigste Ursache für einen Bedarf, auf den nie jemand antwortet.**

**Für die Zeitarbeitsfirma — sie erfährt, wo sie fehlt.**
Dieselben Aggregate von der anderen Seite gelesen sind ein **Nachfragesignal**:
*„Im Raum Münster werden 34 Pflegekräfte gesucht, verfügbar sind 6."* Das ist der Grund,
die Plattform täglich zu öffnen — und es beantwortet die teuerste Frage einer
Zeitarbeitsfirma: **wen soll ich als Nächstes einstellen?**

> Beides aus demselben Dienst, der heute niemandem etwas sagt.

---

## 4. Der Ablauf, präzise

### 4.1 Die vier Fragen

| # | Frage | Feld | Bauvorgabe |
|---|---|---|---|
| 1 | **Was suchst du?** | `skill_tags` | **Anklickbar aus dem Katalog** (`GET /skills/catalog`), Mehrfachauswahl, Suchfeld mit Vorschlägen. **Kein Freitext.** Findet der Kunde seinen Begriff nicht, wird er auf den nächstliegenden Katalogeintrag geführt — nicht abgewiesen |
| 2 | **Wie viele?** | `headcount` | Zahl. Ab 2 wird gebündelt (4.2) |
| 3 | **Von wann bis wann?** | `start_date`, `end_date` | Bei kurzem Vorlauf erscheint der **Notdienst-Hinweis** (4.4) |
| 4 | **Wie teuer einzeln?** | `budget_min`, `budget_max` | **Mit Preisvorschlag aus `smartPricing`**, abhängig von Rolle, Region und Dringlichkeit. Der Vorschlag ist ein Vorschlag, keine Vorgabe |

**Ort:** kommt aus dem Standortkontext des Unternehmens, wird nicht erneut gefragt — er
steht bereits fest, wenn jemand sucht. Abweichender Einsatzort ist eine Option, keine Pflicht.

### 4.2 Das Ergebnis: gebündelt oder einzeln

| Suche | Anzeige |
|---|---|
| **Mehrere** (`headcount > 1`) | **Ein Bündel**, das die gesuchte Menge deckt — quer über Zeitarbeitsfirmen. Mit Preis je Firma und Gesamtpreis. *(Das ist der Korb aus M5)* |
| **Einzelne** (`headcount = 1`) | **Profile einzeln**, mit Merkmalen und Herkunftskennzeichnung |

**In beiden Fällen ausgeschlossen: die bei diesem Unternehmen gesperrten Kräfte.** Heute
greift die Sperre **erst beim Buchen** — der Kunde sieht also Menschen, die er gar nicht
buchen kann. Das dreht N4 um: **gesperrt heißt unsichtbar**, nicht „abgewiesen beim Klick".

### 4.3 Die Bestätigung

Vor dem verbindlichen Abschluss werden **alle vier Kriterien noch einmal gezeigt** und in
einem Schritt bestätigt. Nicht als Formular — als **Zusammenfassung mit Wirkung**:

> „14 Pflegefachkräfte · 15.09.–31.10. · bis 32 €/h · Einsatzort Münster-Nord
> → 3 Zeitarbeitsfirmen · Gesamt 48.720 € · verbindlich"

Der Server prüft die Wünsche bereits gegen das Angebot (`marktplatzBuchungService`:
Zeitraum in der Vergangenheit, Zeitraum außerhalb des Angebots, Preis außerhalb des
Rahmens). **Was fehlt, ist der Schritt davor** — der Mensch sieht, was er gleich auslöst.

### 4.4 Der Notdienst-Hinweis

Die Stufe existiert (`urgency: 'notdienst'`), und der Notdienst-Weg ist der **einzige** im
System, der Teilzusagen und Überfüllungsschutz bereits richtig kann. Er hat nur keine
Oberfläche — **sieben auditierte Endpunkte ohne einen einzigen Aufrufer.**

Der Hinweis erscheint **nicht als Werbebanner**, sondern wenn der Zeitraum ihn nahelegt:
*„Beginn in 18 Stunden — als Notdienst suchen? Dann werden Teilzusagen sofort sichtbar."*

### 4.5 Nach dem verbindlichen Abschluss

| Was passieren soll | Stand |
|---|---|
| Live-Belegschaftsbelegung bei der Zeitarbeitsfirma | ❌ **Die Kette reißt** — siehe M7.1. Die Zuordnung macht heute immer ein Mensch |
| Automatische Benachrichtigung an den Worker | ✅ Vorhanden, mit Frist (72 h regulär, 4 h Ersatz) |
| Die Zeitarbeitsfirma bekommt die Unterlagen | ◐ Vereinbarung ✅, Stundenzettel ✅, Rechnung ✅ — die Rechnung entsteht aber aus **freigegebenen Stundenzetteln**, nicht aus dem Abschluss. Das ist Absicht („Leistung vor Beleg") und bleibt so |

---

## 5. Wellen und Phasen

### N1 · Der Katalog auf beiden Seiten *(geht allem voran)*

| Phase | Inhalt | Nachweis |
|---|---|---|
| N1.1 | **Fähigkeiten anklickbar** aus `GET /skills/catalog`, Mehrfachauswahl, Vorschläge beim Tippen | Freitext ist nicht mehr möglich |
| N1.2 | **Wer seinen Begriff nicht findet, wird geführt**, nicht abgewiesen — dieselbe Zuordnung über Schreibvarianten, die `proposeSkill` schon kann | „Gabelstaplerfahrer" führt zu „Staplerfahrer" |
| N1.3 | **Der Bestand wird sichtbar, bevor gesucht wird:** je Fähigkeit die Zahl verfügbarer Kräfte, aus `capacity-discovery/by-role` | Wer eine Fähigkeit wählt, sieht sofort, ob es sie gibt |
| N1.4 | **Wächter: kein Freitext-Skill mehr auf der Nachfrageseite** | Rückmutation: Freitextfeld wieder einbauen → rot |

### N2 · Die vier Fragen als Assistent

| Phase | Inhalt | Nachweis |
|---|---|---|
| N2.1 | **Vier Schritte**, die den **bestehenden** Bedarf erzeugen (M-L6: kein zweites Datenmodell) | Der Datensatz ist identisch mit dem der Formularseite |
| N2.2 | **Preisvorschlag aus `smartPricing`** bei Frage 4, abhängig von Rolle, Region, Dringlichkeit | Andere Rolle → anderer Vorschlag. **Ohne Plan: kein Vorschlag, aber auch keine Sperre** |
| N2.3 | **Notdienst-Hinweis**, wenn der Vorlauf ihn nahelegt | Beginn in 18 h → Hinweis; in drei Wochen → keiner |
| N2.4 | **Treffer-Vorschau live**: „mit diesen Angaben: 23 Kräfte" — ändert sich mit jedem Schritt | Radius vergrößern → Zahl steigt |
| N2.5 | **Abbrechen verliert nichts** — der halbfertige Bedarf bleibt Entwurf | Modal schließen, wiederkommen, Stand ist da |
| N2.6 | **Erreichbar aus der Personalsuche**, nicht von einer eigenen Seite | Klickpfad vom Hub bis zum Assistenten |

### N3 · Das Ergebnis

| Phase | Inhalt | Nachweis |
|---|---|---|
| N3.1 | **Gebündelt bei mehreren**, einzeln bei einem | 14 gesucht → ein Bündel über 3 Firmen; 1 gesucht → Profile |
| N3.2 | **Merkmale und Herkunft werden gezeigt** — die API liefert sie heute an jeden, gerendert werden sie auf **einer** Fläche | „aus Live-Belegschaft" steht überall |
| N3.3 | **Kein Bündel, das die Menge nicht deckt**, ohne es zu sagen: „12 von 14 gedeckt — 2 offen" | Teildeckung ist sichtbar, nicht geschönt |

### N4 · Gesperrt heißt unsichtbar

| Phase | Inhalt | Nachweis |
|---|---|---|
| N4.1 | **Die Sperrliste wirkt im Feed und in der Suche**, nicht erst beim Buchen | Gesperrte Kraft taucht in keiner Trefferliste auf. **Rückmutation** |
| N4.2 | **Und im Bündel**, damit die Menge stimmt | 14 gesucht, 2 gesperrt → das Bündel füllt aus dem Rest auf |
| N4.3 | **Ohne der Gegenseite zu verraten, dass gesperrt wurde** | Die Zeitarbeitsfirma sieht keinen Hinweis auf die Sperre eines Kunden |

### N5 · Die Bestätigung mit Wirkung

| Phase | Inhalt | Nachweis |
|---|---|---|
| N5.1 | **Alle vier Kriterien in einer Zusammenfassung**, einmal bestätigt | Alle vier erscheinen, keines fehlt |
| N5.2 | **Mit Wirkung in Zahlen**: Firmen, Gesamtpreis, Zeitraum, Anzahl | Vorschau = tatsächlicher Abschluss |
| N5.3 | **Drei Ausgänge**: verbindlich buchen · anfragen · abbrechen. „Anfragen" liegt auf `negotiate-deal` — der Endpunkt existiert und hat auf dieser Fläche keinen Aufrufer | Alle drei wirksam |

### N6 · Der Abschluss wirkt

| Phase | Inhalt | Nachweis |
|---|---|---|
| N6.1 | **Live-Belegschaft** — hängt an M7.1 (M-E6: automatisch, wenn eindeutig; sonst Aufgabe mit Frist) | Buchung → Zuordnung sichtbar |
| N6.2 | **Der Worker wird benachrichtigt**, mit Frist | Vorhanden — hier nur nachweisen |
| N6.3 | **Die Unterlagen sind da, wo die Firma sie sucht** — Vereinbarung sofort, Stundenzettel und Rechnung im Lauf | Je Beleg ein Klickpfad |

### N7 · Der Wow für die andere Seite

**Das ist der Teil, den niemand verlangt hat** — und der aus denselben Motoren fällt.

| Phase | Inhalt | Nachweis |
|---|---|---|
| N7.1 | **Nachfragesignal für die Zeitarbeitsfirma:** „Im Raum Münster werden 34 Pflegekräfte gesucht, verfügbar sind 6." Aus `capacity-discovery`, von der anderen Seite gelesen | Die Zahl stimmt mit den offenen Bedarfen überein |
| N7.2 | **Preisvorschlag auch für die Angebotsseite** — `smartPricing` kennt bereits den Kontext `supply` | Die Firma sieht, ob sie über oder unter Markt liegt |
| N7.3 | **„Deine Kräfte, die niemand findet"** — wer keinen Wohnort, keine Katalog-Fähigkeit oder keine Freigabe hat (M4.9) | Die Firma sieht die Lücke, bevor der Kunde sie nicht findet |
| N7.4 | **Der Notdienst-Leitstand** — sieben fertige, auditierte Endpunkte ohne Aufrufer, darunter die einzige Möglichkeit, eine Teilzusage zurückzunehmen | Größter Bestand pro Aufwand im Repo |

---

## 6. Reihenfolge

```
N1  Katalog beidseitig     ← ohne das findet nichts zueinander
 ├── N4  Gesperrt unsichtbar   ← klein, verhindert eine peinliche Buchung
 ├── N2  Der Assistent         ← die vier Fragen, mit Preisvorschlag
 ├── N3  Das Ergebnis          ← braucht den Korb aus M5
 ├── N5  Die Bestätigung
 ├── N6  Der Abschluss wirkt   ← hängt an M7.1
 └── N7  Der Wow für die Firma ← unabhängig, jederzeit vorziehbar
```

**Empfohlen: N1 → N4 → N2 → N3 → N5 → N6, N7 begleitend.**

> **N7 darf vorgezogen werden, sobald es hakt.** Es hängt an nichts und liefert zwei
> Motoren, die schon fertig sind — der schnellste sichtbare Fortschritt im ganzen Plan.

---

## 7. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Findet die Nachfrage die Angebote?** Ein Bedarf mit Katalog-Fähigkeit trifft die daraus erzeugten Angebote — an echten Zeilen, nicht am Muster |
| 2 | **Ist der Preisvorschlag echt?** Er kommt aus `smartPricing`, nicht aus einer festen Zahl im Frontend |
| 3 | **Ist eine gesperrte Kraft wirklich unsichtbar?** In Suche, Feed und Bündel — je eine Rückmutation |
| 4 | **Zählt „fertig" als fertig?** Jeder Endpunkt hat einen Aufrufer, jede Seite einen Klickpfad (M-L8) |
| 5 | **Hält die Mandantengrenze?** Fremde Org → 403, nicht 200 mit leerer Liste |
| 6 | **Ist etwas doppelt gebaut?** `smartPricing`, `capacityDiscovery`, `negotiate-deal`, `commitment-preview` existieren — wer sie neu baut, hat nicht gemessen |

---

## 8. Was Welle N **nicht** tut

- **Ein zweites Bedarfsmodell bauen.** Der Assistent erzeugt den bestehenden Bedarf.
- **Einen dritten mehrstufigen Assistenten bauen.** In `offer_detail.html` steht bereits
  ein Rahmen mit genau diesen Feldern (M-L6).
- **Die Rechnung aus dem Abschluss erzeugen.** „Leistung vor Beleg" bleibt.
- **Den Preisvorschlag zur Vorgabe machen.** Er ist ein Vorschlag; wer anders bietet, darf.
- **Eine eigene Matching-Engine bauen.** `matchingService` existiert.
