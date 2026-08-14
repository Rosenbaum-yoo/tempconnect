# P12 — Aufräumen der überlebenden Mutanten

> **Stand: 2026-08-14** · Grundlage: [Prüfbericht vom 2026-08-14](../qualitaet/mutation/2026-08-14-rbac/README.md)
> **Auslöser:** Der volle Lauf hält die Prozentschwelle (91,33 % ≥ 86), aber die
> Mutation-Direktive dieses Projekts verlangt zusätzlich *„null überlebende
> Mutanten im Entscheidungs-Branch"*. **Dieses Gate ist offen.**

---

## Die Leitfrage

Ein Prozentwert kann grün sein, während genau die Stellen ungetestet bleiben, auf
die es ankommt. 45 der 112 Überlebenden sind Textkonstanten — deren Fehlen tut
niemandem weh. **28 liegen in Entscheidungslogik** und damit dort, wo sich
Zugriff entscheidet.

**Die Frage ist nicht „wie kommen wir auf 95 %", sondern: welche dieser 28
Stellen könnte einen unbefugten Zugriff durchlassen, ohne dass ein Test es
merkt?** Prozente hochtreiben ist die falsche Antwort — sie verführt dazu, die
billigen 45 Textmutanten zu erschlagen und die teuren 28 stehen zu lassen.

---

## Ausgangslage (gemessen, nicht geschätzt)

**112 Überlebende, nach Art:**

| Art | Anzahl | Einstufung |
|---|---|---|
| `StringLiteral` | 45 | meist Meldungen/Texte — geringe Tragweite |
| `ConditionalExpression` | 20 | **Entscheidungszweig** |
| `ArrayDeclaration` | 19 | oft Rollen-/Rechtelisten — **kann tragend sein** |
| `LogicalOperator` | 8 | **Entscheidungslogik** (`&&` ↔ `\|\|`) |
| `ObjectLiteral` | 7 | Rückgabeformen |
| `OptionalChaining` | 6 | Null-Verhalten |
| `Regex` · `BlockStatement` · `BooleanLiteral` · `MethodExpression` | 7 | Einzelfälle |

**Nach Datei** (Basisname; `orgContext.js` fasst `middleware/` und `utils/`
zusammen — die Trennung ist Teil von M0):

| Datei | Überlebende | Score |
|---|---|---|
| `orgContext.js` (beide) | 26 | 86,96 / 93,94 % |
| `services/rbacService.js` | 25 | 95,87 % |
| `services/enterpriseSurfaceAccessService.js` | 21 | 89,29 % |
| `utils/orgBoundary.js` | 21 | 82,20 % |
| `middleware/rbac.js` | 19 | 87,82 % |

Jede Zeile steht einzeln mit Datei, Zeilennummer, Mutator und Ersetzung in
[`ergebnis.json`](../qualitaet/mutation/2026-08-14-rbac/ergebnis.json).

---

## Wellen

### M0 — Vorbereitung *(muss zuerst, ohne sie raten die anderen)*

Die Wellen M1–M5 lassen sich **noch nicht** priorisieren: die Aufschlüsselung
nach Art existiert nur global, nicht je Datei. Ohne sie weiß niemand, welche
Datei die meisten Entscheidungs-Mutanten trägt.

- Aus `ergebnis.json` je **Datei × Art** auswerten (kleines Skript, Minuten).
- **Drei Kategorien festlegen**, gegen die jeder der 112 Fälle einsortiert wird:
  - **A — muss einen Test bekommen:** Änderung könnte Zugriff, Geld, Nachweis
    oder Mandantengrenze verschieben.
  - **B — bewusst ohne Test, mit Begründung:** Text, Log, Formatierung.
  - **C — Testlücke ohne Risiko:** könnte getestet werden, lohnt aber nicht.
- Prüfen, ob der in der Übergabe erwähnte **nächtliche CI-Job wirklich
  existiert** (`.github/workflows/`). Er ist behauptet, nicht verifiziert.

**Gate M0:** Jeder der 112 Fälle trägt eine Kategorie, und die Reihenfolge von
M1–M5 ergibt sich aus der Zahl der A-Fälle je Datei — nicht aus dem Score.

### M1–M5 — eine Welle je Datei

Reihenfolge nach A-Fällen (aus M0). Je Welle:

- Für jeden A-Fall einen Test, der **genau diese Mutation** tötet — kein
  Rundum-Test, der zufällig auch sie erwischt.
- Für jeden B-Fall eine Zeile Begründung im Testkopf, warum hier keiner kommt.
- Nach der Welle: Lauf **nur für diese Datei** (Minuten statt zwei Stunden).

**Gate je Welle:** null A-Fälle übrig, jeder B-Fall begründet, Produktionscode
**unverändert**. Muss der Code angefasst werden, ist das ein Befund — dann Stopp
und Owner fragen, nicht nebenbei ändern.

### M6 — Automatik

Erst wenn M1–M5 durch sind, sonst automatisiert man einen roten Zustand.

- Voller Lauf **terminiert** (wöchentlich, nicht nächtlich — zwei Stunden pro
  Nacht für sechs Dateien lohnt nicht).
- Bericht **datiert** ablegen wie am 2026-08-14; der Rohbericht (79 MB) bleibt
  draußen, nur der Auszug wird versioniert.
- Vor jedem Lauf `rm -rf .stryker-tmp` und den Inkrementalstand — sonst gatet
  `incremental: true` gegen einen anderen Testumfang.
- **Nie mit Pipe messen:** `… | tail` liefert den Status von `tail`.

**Gate M6:** Ein Lauf ohne Änderung erzeugt denselben Score, der Bericht landet
datiert im Archiv, und ein Absinken unter 86 meldet sich sichtbar.

---

## Reihenfolge

**M0 → (M1…M5 nach A-Fällen) → M6.**

M0 ist nicht optional: ohne die Kategorien wird aus dem Aufräumen ein
Prozent-Treiben, und das erschlägt die billigen Fälle zuerst.

---

## Was hier ausdrücklich nicht das Ziel ist

- **Kein Score-Ziel.** 100 % wäre teuer und sagt nichts. Das Ziel ist *null
  A-Fälle*.
- **Kein Produktionscode.** Die bisherigen Wellen haben null Produktionsfehler
  ergeben — der Code war richtig, die Tests waren lückenhaft. Wer beim Aufräumen
  Code ändert, verschiebt das Risiko statt es zu senken.
- **Keine Ausweitung auf neue Bereiche.** Geld-Mathematik, DSGVO-Pfade und
  Oberfläche sind noch nicht mutationsgeprüft — das ist eine eigene Spur, nicht
  Teil von P12.
