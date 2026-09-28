# Welle T — Das monatliche Audit: was wir können, und was es gekostet hätte

> **Status: Bauanweisung.** Erstellt 2026-09-08, Ist-Stand gemessen.
> **Gebaut von der bauenden Sitzung, gegengeprüft von der planenden** — siehe
> [`../UEBERGABE.md`](../UEBERGABE.md), Abschnitt „Wer baut, wer prüft".

---

## 1. Die Owner-Vorgabe

> *„wollen wir das Marktaudit nicht nur einmal monatlich laufen lassen, sondern dazu auch
> eine Tabelle mit vorher/nachher anlegen, um es vergleichen zu können — was wir nun alles
> können"* · *„und eben auch Wertermittlung usw., Entwicklungskosten und so weiter"* ·
> *„ja, einen automatischen, der monatlich läuft"*

Drei Dinge in einem: **automatisch laufen**, **vergleichen können**, **beziffern**.

---

## 2. Die Grundlage steht bereits

| Baustein | Stand |
|---|---|
| `api/scripts/doku-generieren.js` | ✅ **deklarative Zähler** (`titel`, `befehl`, `rechne`) über Router, Dienste, Migrationen, Testdateien |
| `docs/PLATTFORM_REGISTER.md` | ✅ das Inventar — jede Fläche, jeder Endpunkt, mit Beleg |
| `api/test/dokuWaechter.test.js` | ✅ wird **rot**, wenn eine Zahl von der Wirklichkeit abweicht |
| `api/test/erreichbarkeit.test.js` | ✅ jede lebende Seite muss erreichbar sein |
| `betriebs_takt` (M1.1) | ✅ der Herzschlag — Mig 212, `betriebsTaktService.js`, Staff-CC-Kachel. Er macht sichtbar, **wenn etwas nicht läuft** |
| `docs/investoren/WIE_WIR_BAUEN.md` | ✅ die Fassung zum Zeigen |

**Was fehlt, ist nicht die Messung — es ist das Gedächtnis.** Der Generator prüft, ob die
Zahl von *heute* stimmt. Niemand hebt sie auf. Deshalb lässt sich nicht sagen, was sich
verändert hat.

> Der Kopf des Generators erzählt selbst, warum das zählt: das Register behauptete einmal
> **340** Backend-Testdateien, tatsächlich waren es **359**. Niemand hatte etwas falsch
> gemacht — es hatte nur niemand nachgezählt.

---

## 3. Die Entwurfsentscheidung: das Audit antwortet in Fähigkeiten, nicht in Zahlen

**„42 Endpunkte" sagt niemandem etwas.** Weder dem Owner noch einem Investor. Beide fragen
dasselbe: *was kann das Ding?*

Das Audit antwortet deshalb in **Sätzen, die wahr oder falsch sind** — und jeder ist an einen
messbaren Beleg gebunden:

| Fähigkeit | Beleg (alle drei nötig) |
|---|---|
| *„Ein Unternehmen kann 30 Kräfte über mehrere Firmen in einem Abschluss buchen."* | Endpunkt vorhanden · Aufrufer im Frontend · Wächter, der beides festhält |
| *„Ein Mitarbeiter erfährt von seiner Buchung, ohne dass die Firma es abschalten kann."* | dito |
| *„Eine gesperrte Kraft ist bei diesem Kunden unsichtbar — bei anderen nicht."* | dito |

**Erst wenn alle drei stehen, gilt die Fähigkeit als vorhanden.** Ein Endpunkt ohne Aufrufer
ist eine halbe Lieferung (Welle P, Klasse B) — und im Audit steht er als *halb*, nicht als
*fertig*.

### Und die Schulden stehen daneben

**Ein Bericht, der nur wächst, ist Werbung.** Glaubwürdig wird er durch die zweite Spalte:

- Endpunkte ohne Aufrufer
- Seiten ohne Klickpfad
- tote Spalten
- aufzählende Wächter, wo entdeckende gebraucht werden
- Takte, die schweigen

**Dass diese Zahlen fallen, ist der eigentliche Fortschrittsbeweis** — überzeugender als jede
wachsende. Wer nur Zuwachs zeigt, wird bei der ersten Rückfrage unglaubwürdig.

---

## 4. Zur Wertermittlung — ehrlich, sonst schadet sie

Der Owner will Entwicklungskosten beziffern. **Das geht — aber nicht als eine Zahl.**

### Was NICHT gebaut wird

| | Warum nicht |
|---|---|
| **„Die Plattform ist X € wert"** | Wert entsteht durch Kunden und Umsatz, nicht durch Quelltext. Eine solche Zahl hält keiner Rückfrage stand — und eine Zahl, die zusammenbricht, kostet mehr Glaubwürdigkeit, als sie je einbringt |
| **Codezeilen × Stundensatz** | Zeilen messen Tipparbeit, nicht Leistung. Die beste Welle dieses Projekts hat Zeilen **entfernt** — und den Marktplatz gerettet |
| **Ein einziger Schätzwert ohne Spanne** | Jede Aufwandsschätzung hat einen Fehlerbereich. Wer ihn verschweigt, verkauft eine Genauigkeit, die es nicht gibt |

### Was gebaut wird: der **Wiederherstellungsaufwand**

Die belastbare Frage lautet nicht *„was ist es wert?"*, sondern:

> **„Was würde es kosten, das noch einmal zu bauen — mit demselben Nachweisniveau?"**

Das ist beantwortbar, weil die Bestandteile zählbar sind: Endpunkte mit Mandantengrenze,
Migrationen mit Rollback, Wächter mit Rückmutation, Mutationsprüfungen über der Schwelle,
E2E-Wege. **Angegeben in Personenmonaten, mit Spanne, mit genannter Methode.**

> **Der entscheidende Satz für ein Investorengespräch** ist ohnehin nicht der Preis, sondern
> dieser: *„Diese Fähigkeit ist nicht nur gebaut, sondern durch eine Probe festgehalten, die
> rot wird, wenn jemand sie kaputt macht."* Davon gibt es hier über 450 — **das** ist der
> Vermögenswert, und er ist zählbar.

---

## 5. Wellen und Phasen

### T1 · Das Gedächtnis

| Phase | Inhalt | Nachweis |
|---|---|---|
| T1.1 | **Momentaufnahme-Tabelle** (`plattform_audit`): eine Zeile je Lauf, unveränderlich. Kennzahlen als JSONB, damit neue Größen ohne Migration dazukommen | Zwei Läufe → zwei Zeilen, die erste bleibt unangetastet |
| T1.2 | **Der Generator liefert die Zahlen** — kein zweiter Messweg. Was er heute prüft, hebt er künftig auch auf | Dieselbe Zahl in Register und Momentaufnahme. **Rückmutation:** Zähler ändern → beide ändern sich |
| T1.3 | **Rückwirkend füllen, soweit belegbar** — aus der Commit-Geschichte je Monatsende | Die Reihe beginnt nicht bei null, sondern beim ersten belegbaren Monat. Geschätzte Werte sind **als geschätzt gekennzeichnet** |

### T2 · Die Fähigkeiten-Liste

| Phase | Inhalt | Nachweis |
|---|---|---|
| T2.1 | **Register der Fähigkeiten** als Sätze, je einer mit drei Belegen (Endpunkt · Aufrufer · Wächter) | Ein Satz ohne alle drei gilt als **halb**, nicht als fertig |
| T2.2 | **Maschinell ausgewertet, nicht gepflegt.** Der Lauf prüft die drei Belege selbst | Aufrufer entfernen → die Fähigkeit fällt auf *halb*. **Rückmutation** |
| T2.3 | **Die Schuldenspalte** — Endpunkte ohne Aufrufer, Seiten ohne Klickpfad, tote Spalten, schweigende Takte | Die Zahlen stimmen mit Welle P überein |
| T2.4 | **Kein Satz ohne Beleg.** Wer eine Fähigkeit einträgt, ohne dass sie prüfbar ist, wird rot | Erfundene Fähigkeit → Probe rot |

### T3 · Vorher und Nachher

| Phase | Inhalt | Nachweis |
|---|---|---|
| T3.1 | **Die Vergleichstabelle**: je Kennzahl vorher, nachher, Veränderung — und **je Fähigkeit**, ob sie in diesem Monat wahr wurde | Zwei Momentaufnahmen → ein lesbarer Unterschied |
| T3.2 | **Was verschwunden ist, steht auch da.** Eine Fähigkeit, die von *fertig* auf *halb* fällt, ist die wichtigste Zeile des Berichts | Aufrufer entfernen → sie erscheint als Rückschritt |
| T3.3 | **Die Schulden zuerst.** Der Bericht beginnt mit dem, was schlechter wurde | Reihenfolge festgenagelt — nicht dem Zufall überlassen |
| T3.4 | **Eine Fläche im Staff CC**, nicht nur eine Datei | Klickpfad; der Owner sieht es, ohne ein Dokument zu suchen |

### T4 · Der monatliche Lauf

**Der Takt-Herzschlag ist gebaut** — Migration `212_betriebs_takt.sql`, `betriebsTaktService.js`
(`TAKTE`, `taktNotieren`, `bewerteAufgabe`, `taktStand`), Staff-CC-Kachel. Der Lauf hängt sich
dort ein, statt einen eigenen Weg zu bauen.

> **Befund beim Messen — der Toleranzfaktor passt für Monatstakte nicht.**
> `bewerteAufgabe` rechnet `grenze = intervall_min * TOLERANZ` mit **global `TOLERANZ = 3`**
> (`betriebsTaktService.js:114,204`). Für die bestehenden Aufgaben stimmt das: 15 Minuten
> werden zu 45, ein Tag wird zu drei. **Für einen Monatstakt wird daraus ein Vierteljahr** —
> das Audit könnte zweimal ausfallen, und der Herzschlag bliebe grün. Ein Wächter, der drei
> Monate braucht, um zu merken, dass eine monatliche Aufgabe schweigt, ist keiner.
> **Ein flacher Multiplikator passt zu kurzen Intervallen und versagt bei langen** — das
> Audit ist die erste Aufgabe, die das aufdeckt, aber nicht die letzte, die es trifft.

| Phase | Inhalt | Nachweis |
|---|---|---|
| T4.1 | **Als Eintrag in `TAKTE`**, `intervall_min: 43200` — **nicht** als weiterer Sonderweg. `takteEingeplant.test.js` verlangt ohnehin: eingeplant **oder** mit begründeter Lücke | Er erscheint in der Herzschlag-Kachel, ohne dass jemand die Kachel anfasst |
| T4.2 | **Toleranz je Aufgabe** — `toleranz_faktor` im Registratur-Eintrag, global `3` als Vorgabe, für das Audit **`1.5`**. Der bestehende Wert bleibt für alle anderen unverändert | Audit 46 Tage still → `spaet`. **Rückmutation:** Faktor zurück auf 3 → die Probe wird rot |
| T4.3 | **Er läuft auch von Hand** — vor einem Gespräch will man den aktuellen Stand, nicht den vom Ersten. Der interne Endpunkt ist der bestehende Handlauf | Ein Anstoß, ein Bericht. **Achtung `zuTaktSchluessel`:** Handlauf und eingeplanter Lauf schreiben unter zwei Namen — die Leseseite führt sie zusammen |
| T4.4 | **Er wirft nie.** Ein Audit, das den Betrieb gefährdet, wird abgeschaltet — dieselbe Regel wie beim Live-Strom und der Feed-Kopie. `taktNotieren` kennt `ergebnis: 'fehler'`; das ist der richtige Ausgang, nicht ein Absturz | Fehler im Lauf → als `fehler` protokolliert, Betrieb unberührt |

### T5 · Der Wiederherstellungsaufwand

| Phase | Inhalt | Nachweis |
|---|---|---|
| T5.1 | **Die Methode steht im Bericht**, nicht in einer Fußnote: welche Bestandteile, welcher Aufwand je Bestandteil, welche Spanne | Ein Leser kann sie nachrechnen. Kann er das nicht, ist die Zahl wertlos |
| T5.2 | **In Personenmonaten, mit Spanne** — nie eine einzelne Zahl | Untere und obere Grenze, beide begründet |
| T5.3 | **Der Nachweis-Anteil wird getrennt ausgewiesen**: was kostet der Code, was kosten die Proben, die ihn festhalten | Das ist der Teil, den Nachbauer unterschätzen — und der Grund, warum eine Kopie teurer ist als das Original aussieht |
| T5.4 | **Keine Euro-Bewertung der Plattform.** Wenn ein Stundensatz eingesetzt wird, dann sichtbar als Annahme des Lesers, nicht als Aussage des Systems | Der Bericht sagt „Aufwand", nicht „Wert" |

---

### T6 · Die Owner-Frage vom 2026-09-27 — und warum sie bewusst wartet

> **Owner, 2026-09-27:** *„Gibt es noch etwas, was das gesamte Arbeitsdokument komplett macht?
> Was würdest du ergänzen, wo siehst du Schwachstellen, wie würde es Marktführer machen? Denke
> daran, alles so auszurichten, dass es ein ganzes System sein kann und auch an zvoove und Co
> generell andocken kann."*
>
> **Und unmittelbar danach, ebenfalls Owner:** *„Ja gerne deine Empfehlungen — also jetzt noch
> nicht, erst wenn alle Grundlagen dazu stimmen."*

Die zweite Anweisung ist die wichtigere, und sie deckt sich mit der Begründung, aus der Welle T
ohnehin an Platz 17 steht: **ein Audit vor den Grundlagen misst wenig.** Eine Liste von
Marktführer-Ideen über einem Schema, das noch Schulden trägt, liest sich stark und ist wertlos —
sie würde auf Fähigkeiten aufbauen, deren Fundament gerade erst geflickt wird.

Damit die Frage nicht verrottet, steht hier **beides** fest: die vier Achsen, die sie beantwortet,
und der **messbare Auslöser**, ab dem sie beantwortet wird.

**Die vier Achsen (in dieser Reihenfolge, weil jede die nächste trägt):**

| # | Achse | Leitfrage | Warum sie nicht weggelassen werden darf |
|---|---|---|---|
| 1 | **Vollständigkeit** | Welche Produktfläche hat **überhaupt keinen** Plan — keine Welle, kein Register-Eintrag, keinen Wächter? | Eine Lücke ohne Dokument ist unsichtbar. Sie fällt erst dem Kunden auf |
| 2 | **Schwachstellen** | Wo widerspricht sich das Arbeitsdokument, welche Zahl ist **ungewacht**, welche Owner-Entscheidung fehlt, welcher Plan ist überholt? | Eine verrottete Zahl ist schlimmer als keine: sie wird geglaubt. Gemessen an der handgepflegten „180" |
| 3 | **Marktführerschaft** | Was erwartet ein Käufer, der zvoove oder Fieldglass kennt, das in **keinem** Plan steht? Gesetzliche Pflichten, Tarifwerke, Abrechnungs- und Aufbewahrungsformate | Der Vergleich findet beim Kunden statt, nicht bei uns. Was dort selbstverständlich ist, ist bei uns kein Bonus, sondern die Eintrittskarte |
| 4 | **Ein ganzes System **und** andockbar** | Funktioniert **jede** Fähigkeit in **beiden** Betriebsarten — Komplettsystem und angedockt (§3a)? Und trägt jeder Kreislauf K-1…K-7 in beiden? | Eine Fähigkeit, die nur im Komplettsystem trägt, ist keine Fähigkeit, sondern eine Insel. Andocken ist kein Adapter am Rand, es ist eine Eigenschaft **jeder** Fähigkeit |

**Der Auslöser — objektiv, damit „wenn die Grundlagen stimmen" nicht zu „irgendwann" wird.**
T6 läuft, sobald **alle drei** Punkte belegt sind:

1. **Welle Z ist abgeschlossen:** Z1–Z11 gebaut, die Richtung „deklariert, aber fehlt" ist **0**,
   und der Z4-Wächter ist grün **mit** künstlichem Nachweis (siehe `Z_SCHEMA_SCHULDEN.md`).
2. **Die Dezember-Liste ist abgearbeitet:** Posten 1 bis 11 der Rangfolge in `../UEBERGABE.md`.
3. **Ein voller Prüflauf auf dem Host ist grün:** `fail 0`, `cancelled 0`, Rückgabewert `0`.

**Und eine Methodenvorgabe, die aus dieser Woche stammt:** T6 beantwortet überwiegend
**Abwesenheits-Fragen** („welche Fläche hat *keinen* Plan"). Abwesenheit ist nur durch eine
**unabgeschnittene** Suche belegbar — kein `head`, kein `limit`, kein gedachtes Dateimuster
anstelle des echten. Wo die Menge zu groß für einen Kopf ist, wird **breit parallel** gesucht,
mit je Ausschnitt einem eigenen Prüfer und je Befund einer nachvollziehbaren Suche, die der
Prüfende wiederholen kann. Beides steht als eiserne Regel in `../UEBERGABE.md`.

## 6. Reihenfolge

```
T1  Das Gedaechtnis        ← ohne Momentaufnahmen kein Vergleich
 ├── T4  Der monatliche Lauf   ← klein, sobald T1 steht: eine Zeile in der Registratur
 ├── T2  Die Faehigkeiten-Liste ← der eigentliche Wert des Berichts
 ├── T3  Vorher und Nachher
 └── T5  Der Wiederherstellungsaufwand ← zuletzt, er braucht T2
```

**Empfohlen: T1 → T4 → T2 → T3 → T5.**

> **T4 steht früh, obwohl es unscheinbar ist.** Solange der Lauf nicht getaktet ist, entsteht
> kein Gedächtnis — und ohne Gedächtnis kein Vergleich. Ein Audit, das man anstoßen muss,
> wird beim dritten Mal vergessen.

---

## 7. Woran gegengeprüft wird

| # | Frage |
|---|---|
| 1 | **Hält der Bericht einer Rückfrage stand?** Jede Zahl mit Quelle, jede Fähigkeit mit drei Belegen, jede Schätzung mit Methode und Spanne |
| 2 | **Zeigt er auch, was schlechter wurde?** Ein Bericht, der nur wächst, ist Werbung |
| 3 | **Beißt T2.2?** Aufrufer entfernen → die Fähigkeit fällt auf *halb* |
| 4 | **Läuft er wirklich?** Der Herzschlag beantwortet das — nicht die Behauptung |
| 5 | **Schlägt der Wächter rechtzeitig an?** Mit dem globalen Faktor 3 erst nach einem Vierteljahr. Ohne T4.2 ist T4.1 wertlos |
| 6 | **Steht irgendwo ein Euro-Betrag als Wert der Plattform?** Dann ist es falsch gebaut |

---

## 8. Was Welle T **nicht** tut

- **Einen zweiten Messweg bauen.** Die Zahlen kommen aus dem Generator, der sie heute schon
  prüft. Zwei Messwege wären zwei Wahrheiten.
- **Ein zweites Register anlegen.** `PLATTFORM_REGISTER.md` bleibt das Inventar; das Audit
  hebt seine Zahlen auf.
- **Die Plattform in Euro bewerten.** Siehe Abschnitt 4.
- **Codezeilen zählen.** Sie messen Tipparbeit.
- **Schätzungen als Messwerte ausgeben.** Was geschätzt ist, ist gekennzeichnet.
