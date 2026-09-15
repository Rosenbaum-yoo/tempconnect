# Welle X — Lohnvorschau im Einsatzportal

> **Status: Bauanweisung.** Erstellt 2026-09-14 aus dem Owner-Dokument (Nachtrag nach Abschnitt 26).
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

> *„Es soll im Einsatzportal eine Möglichkeit geben, dass Mitarbeiter ihren ungefähren Lohn am
> Monatsende einsehen können … basierend auf den Stundenzetteln, steuerlichen Abzügen usw. …
> am besten im Bereich netto ±10 Euro."*

**Auf Rückfrage entschieden (2026-09-14): Brutto genau, netto als Spanne — ohne zusätzliche
sensible Daten.** Netto auf ±10 € bräuchte Steuerklasse, Kirchensteuer, Kinderfreibeträge und den
Zusatzbeitrag der Krankenkasse; diese Daten liegen bei der Lohnbuchhaltung der Zeitarbeitsfirma,
nicht bei TempConnect.

---

## 2. Die Falle, die zuerst gemessen wird

**Die Plattform kennt den Preis, den der Kunde zahlt — nicht den Lohn, den der Mitarbeiter bekommt.**
Der Verrechnungssatz enthält Marge, Sozialversicherung des Arbeitgebers und Verwaltung der
Zeitarbeitsfirma. Eine Vorschau, die ihn als Lohn nimmt, wäre **doppelt falsch**: die Zahl wäre viel
zu hoch, und der Mitarbeiter sähe den Kundenpreis — ein Geschäftsgeheimnis seines Arbeitgebers.

| Phase | Inhalt | Nachweis |
|---|---|---|
| X0.1 | **Gibt es ein Lohnfeld** je Mitarbeiter (Stundenlohn, Entgeltgruppe, Zuschläge)? Wo, wer pflegt es? | Befund mit Fundstelle, bevor etwas gebaut wird |
| X0.2 | **Wo steht der Verrechnungssatz**, und kann er je in eine Antwort an das Einsatzportal gelangen? | Liste aller Einsatzportal-Endpunkte, die Preisfelder berühren |

---

## 3. Wellen und Phasen

### X1 · Die Lohngrundlage

| Phase | Inhalt | Nachweis |
|---|---|---|
| X1.1 | **Die Zeitarbeitsfirma hinterlegt den Stundenlohn** (oder Entgeltgruppe plus Branchenzuschlag) und die Zuschlagsregeln je Mitarbeiter | Feld in der Mitarbeiterverwaltung, erreichbar |
| X1.2 | **Ohne Hinterlegung keine Vorschau** — ehrlicher Hinweis „Ihr Arbeitgeber hat noch keinen Stundenlohn hinterlegt", **nie** eine Schätzung aus dem Kundenpreis | Fehlendes Feld → Hinweis, keine Zahl |
| X1.3 | **Der Verrechnungssatz erreicht das Einsatzportal nie** | Positivliste; Preisfeld in der Antwort → rot. Rückmutation |

### X2 · Brutto

| Phase | Inhalt | Nachweis |
|---|---|---|
| X2.1 | Stunden aus den Stundenzetteln des laufenden Monats × Stundenlohn | Beispielmonat gegen Handrechnung |
| X2.2 | **Getrennt ausgewiesen:** genehmigt · eingereicht, noch offen · noch nicht eingereicht | Drei Summen, klar beschriftet |
| X2.3 | Zuschläge (Nacht, Sonntag, Feiertag, Überstunden) nur, wenn hinterlegt | Ohne Regel kein Zuschlag |
| X2.4 | Monatsgrenzen in `Europe/Berlin` (`todayDE()`) | Schicht über Mitternacht am Monatsende → richtiger Monat |

### X3 · Netto als Spanne

| Phase | Inhalt | Nachweis |
|---|---|---|
| X3.1 | Vereinfachte Rechnung mit **öffentlichen Jahreswerten**: Beitragssätze der Sozialversicherung und der Programmablaufplan des BMF für den Lohnsteuerabzug | Parameter mit Quelle und Gültigkeitsjahr |
| X3.2 | **Spanne statt Zahl:** gerechnet über übliche Annahmen (Steuerklasse I bis IV, mit und ohne Kirchensteuer) — ausgegeben als „etwa … bis … €" | Beispielbrutto → Spanne; Grenzen gegen den BMF-Lohnsteuerrechner geprüft |
| X3.3 | Steuerfreie Zuschläge (§ 3b EStG) nur, wenn als solche hinterlegt | Mit/ohne → Spanne verschiebt sich nachvollziehbar |
| X3.4 | **Keine Abfrage** von Steuerklasse, Konfession, Kindern, Krankenkasse (Owner-Entscheid) | Kein solches Feld im Einsatzportal |

### X4 · Ehrlich in der Darstellung

| Phase | Inhalt | Nachweis |
|---|---|---|
| X4.1 | Hinweis direkt an der Zahl: **„Unverbindliche Schätzung, keine Lohnabrechnung. Maßgeblich ist die Abrechnung Ihres Arbeitgebers."** | Kein Rendering der Zahl ohne Hinweis |
| X4.2 | **Kein PDF, kein Export** — ein Dokument sähe aus wie eine Lohnabrechnung | Keine Download-Aktion |
| X4.3 | **Neues Jahr ohne neue Werte → keine Netto-Spanne** statt einer veralteten Zahl; der Betriebs-Takt meldet fehlende Jahreswerte | 1. Januar mit Vorjahresparametern → nur Brutto, Takt-Warnung |

### X5 · Wer es sieht

| Phase | Inhalt | Nachweis |
|---|---|---|
| X5.1 | Der Mitarbeiter selbst im Einsatzportal | Anderer Mitarbeiter → 403 |
| X5.2 | Die Zeitarbeitsfirma sieht dieselbe Rechnung | Gleiche Zahl in beiden Sichten |
| X5.3 | **Der Kunde nie** | Unternehmenskonto → kein Endpunkt, kein Feld |

---

## 4. Reihenfolge

**X0 → X1 → X2 → X4 → X3 → X5.**

> **X4 vor X3:** der Hinweis und das Exportverbot stehen, bevor die erste Netto-Zahl erscheint.

## 5. Was Welle X **nicht** tut

- **Eine Lohnabrechnung erstellen.** Die bleibt beim System der Zeitarbeitsfirma (siehe Welle V).
- **Sensible Steuer- oder Konfessionsdaten erheben.**
- **Den Verrechnungssatz als Lohngrundlage nehmen.**

## 6. Kreislauf und Verdrahtung

**Welle X ist das letzte Glied von K-2 Zeit und Geld auf der Seite des Menschen** — der
Stundenzettel, den er abgibt, kommt als Zahl zu ihm zurück. Kreislaufkarte und Verdrahtungskette:
[`V_SCHNITTSTELLEN.md`](V_SCHNITTSTELLEN.md), Abschnitte 3b und 3c.

| Über den Plan hinaus mitzudenken | Warum |
|---|---|
| **Die Vorschau lebt mit dem Stundenzettel:** Einreichen, Ablehnen mit Korrekturbitte, Genehmigen ändern sie sofort; eine Ablehnung zeigt, welche Stunden herausfallen | Der Mitarbeiter sieht, *warum* sich die Zahl ändert — und reicht den korrigierten Zettel schneller ein |
| **Frist-Erinnerung mit Betrag:** „2 Stundenzettel fehlen — etwa 310 € brutto noch nicht erfasst" | Der stärkste Grund, die Frist einzuhalten, ist das eigene Geld |
| **Angedockter Betrieb (V6):** führt die Branchensoftware den Lohn, liest X die hinterlegten Sätze von dort; ohne Lohnsatz aus dem Fremdsystem keine Vorschau | Eine zweite Lohnwahrheit neben der Lohnbuchhaltung darf es nicht geben |
| Einsatzportal-Kachel mit Monatsbalken (genehmigt / offen / fehlt), anklickbar zu den Zetteln der Woche (Owner Juli: *„Card soll anklickbar sein"*) | Kein Anzeige-Endpunkt ohne Weg zur Handlung |
