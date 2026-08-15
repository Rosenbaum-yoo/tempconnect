# P12 — Aufräumen der überlebenden Mutanten

> **Stand: 2026-08-15** · Grundlage: [Prüfbericht vom 2026-08-14](../qualitaet/mutation/2026-08-14-rbac/README.md)
> **Auslöser:** Der volle Lauf hält die Prozentschwelle (91,33 % ≥ 86), aber die
> Mutation-Direktive dieses Projekts verlangt zusätzlich *„null überlebende
> Mutanten im Entscheidungs-Branch"*. **Dieses Gate ist offen.**
>
> **M0 ist erledigt (2026-08-15).** Alle 112 Fälle sind einzeln eingestuft und
> unabhängig gegengelesen: **39 A · 32 B · 41 C** (die Gegenprüfung hat 23 Fälle
> nach unten korrigiert — alle in dieselbe Richtung, keiner in die gefährliche).
> Ergebnis, acht Befunde und Wellenreihenfolge:
> [qualitaet/mutation/2026-08-14-rbac/TRIAGE.md](../qualitaet/mutation/2026-08-14-rbac/TRIAGE.md).
>
> **M1 bis M5 sind erledigt (2026-08-15) — 39 von 39 A-Fällen tot.**
> `rbacService.js` 19/19 (95,87 % → **99,17 %**) ·
> `enterpriseSurfaceAccessService.js` 8/8 (89,29 % → **93,88 %**) ·
> `middleware/orgContext.js` 6/6 (86,96 % → **90,22 %**) ·
> `orgBoundary.js` 5/5 (82,20 % → **88,14 %**) ·
> `middleware/rbac.js` 1/1 (87,82 % → **88,46 %**).
> In **jeder** Welle sind die Überlebenden **exakt** die Fälle, die M0 nicht als
> A eingestuft hatte — fünfmal in Folge. Produktionscode unverändert.
>
> **Das Gate der Mutation-Direktive ist damit geschlossen.** Offen ist nur noch
> **M6** (Automatik) — und der hängt an der Owner-Entscheidung aus M0-B1: solange
> die 57 Commits nicht auf `origin` stehen, kann kein CI-Job diese Arbeit
> überwachen. Stand jederzeit: `cd api && node scripts/mutation-triage.js`.

---

## Die Leitfrage

Ein Prozentwert kann grün sein, während genau die Stellen ungetestet bleiben, auf
die es ankommt.

**Die Frage ist nicht „wie kommen wir auf 95 %", sondern: welche dieser Stellen
könnte einen unbefugten Zugriff durchlassen, ohne dass ein Test es merkt?**
Prozente hochtreiben ist die falsche Antwort — sie verführt dazu, die billigen
Textmutanten zu erschlagen und die teuren stehen zu lassen.

> **Nachtrag nach M0 (2026-08-15):** Die ursprüngliche Fassung dieser Leitfrage
> ging von „45 Textkonstanten, deren Fehlen niemandem weh tut" und „28 in
> Entscheidungslogik" aus. **Beides hat sich nicht gehalten.** 10 der 45
> „Textkonstanten" sind Rollennamen, SQL-Texte mit `org_id`-Klausel und ein
> Vergleichswert des Letzter-Owner-Schutzes. Und von den 28 mechanisch gezählten
> Entscheidungs-Mutanten sitzen 4 in einer Protokoll-Nutzlast, während echte
> Verzweigungen fehlen, die die Zählung nach Bauart gar nicht erfasst. Die
> belastbare Zahl lautet: **39 Fälle brauchen einen Test, 14 davon sitzen in einer
> Verzweigung, die Verhalten steuert.** Die Leitfrage bleibt richtig — die Zahlen,
> mit denen sie ursprünglich begründet wurde, waren es nicht.

---

## Ausgangslage (gemessen, nicht geschätzt)

**112 Überlebende, nach Art — mit der Einstufung aus M0:**

| Art | gesamt | **A** | B | C | was M0 dazu ergab |
|---|---|---|---|---|---|
| `StringLiteral` | 45 | **10** | 24 | 11 | nicht „meist Text": Rollennamen, SQL mit `org_id`, ein Vergleichswert |
| `ConditionalExpression` | 20 | 7 | 2 | 11 | 11 sind gleichwertig oder folgenlos — u. a. doppelt gemoppelte Bedingungen |
| `ArrayDeclaration` | 19 | **15** | 0 | 4 | **die gefährlichste Art**: fast alle sind Abfrage-Parameter |
| `LogicalOperator` | 8 | 3 | 1 | 4 | |
| `ObjectLiteral` | 7 | 1 | 5 | 1 | der eine A-Fall schaltet den Letzter-Owner-Schutz ab |
| `OptionalChaining` | 6 | 0 | 0 | 6 | durchweg Vorsicht an Stellen, die nicht leer sein können |
| `Regex` | 2 | 2 | 0 | 0 | die beiden UUID-Anker |
| `BlockStatement` · `BooleanLiteral` | 4 | 0 | 0 | 4 | |
| `MethodExpression` | 1 | 1 | 0 | 0 | `startsWith` → `endsWith` beim Tarif-Präfix |

**Nach Datei — mit der Einstufung aus M0** (die Trennung von `middleware/orgContext.js`
und `utils/orgContext.js` war Teil von M0 und ist erledigt):

| Datei | Überlebende | Score | **A** | B | C |
|---|---|---|---|---|---|
| `services/rbacService.js` | 25 | 95,87 % | **19** | 2 | 4 |
| `services/enterpriseSurfaceAccessService.js` | 21 | 89,29 % | **8** | 0 | 13 |
| `middleware/orgContext.js` | 24 | 86,96 % | **6** | 4 | 14 |
| `utils/orgBoundary.js` | 21 | 82,20 % | **5** | 9 | 7 |
| `middleware/rbac.js` | 19 | 87,82 % | **1** | 17 | 1 |
| `utils/orgContext.js` | 2 | 93,94 % | **0** | 0 | 2 |

Jede Zeile steht einzeln mit Datei, Zeilennummer, Mutator und Ersetzung in
[`ergebnis.json`](../qualitaet/mutation/2026-08-14-rbac/ergebnis.json), die
Einstufung dazu in [`triage.json`](../qualitaet/mutation/2026-08-14-rbac/triage.json).

> **Die Datei mit dem besten Score trägt die meisten offenen Fälle.** Das ist kein
> Widerspruch, sondern der Grund für M0: `rbacService.js` stellt mit 605 Mutanten
> fast die Hälfte des Laufs — 4 % davon sind mehr Stück als 18 % einer kleinen Datei.
>
> Die Reihenfolge ist **stabil**: Sie war vor und nach der Gegenprüfung dieselbe,
> obwohl sich 23 Einstufungen verschoben haben.

---

## Wellen

### M0 — Vorbereitung ✅ *(erledigt 2026-08-15)*

Die drei Kategorien stehen, jeder der 112 Fälle trägt eine, und die Reihenfolge
von M1–M5 ist damit begründet statt geraten.

- ✅ Auswertung je **Datei × Art**: `api/scripts/mutation-triage.js` — rechnet die
  Aufschlüsselung aus dem Bericht und prüft zugleich, dass kein Fall ohne
  Einstufung ist. Rot bei jeder Lücke.
- ✅ Einstufung aller 112 Fälle in
  [`triage.json`](../qualitaet/mutation/2026-08-14-rbac/triage.json), je Fall mit
  Begründung und — bei A — dem Test, der genau diese Mutation tötet (`kill_durch`).
- ✅ **Jede Einstufung unabhängig gegengelesen** (je Datei ein Prüfer mit dem Auftrag
  zu widerlegen, jeder Einspruch von einer dritten Instanz beurteilt). 23 Fälle
  wurden nach unten korrigiert, **alle in dieselbe Richtung** — zu streng
  eingestuft, keiner in die gefährliche. Möglich wurde das durch den Rohbericht,
  der jeden Mutanten *spaltengenau* auflöst; `triage.json` trägt diese Präzision
  jetzt dauerhaft (`spalte`, `mutant_id`), auch wenn die 75 MB gelöscht werden.
- ✅ `node scripts/mutation-triage.js --roh` hält den Auszug gegen den Rohbericht:
  **112 Überlebende, 0 Abweichungen.** Ohne Rohbericht wird übersprungen, nicht rot.
- ✅ **Nächtlicher CI-Job geprüft. Ergebnis: er läuft nicht.**
  `.github/workflows/mutation.yml` existiert lokal (seit 2026-08-12), steht aber
  **nicht auf `origin`** — der Fernstand ist 57 Commits zurück (2026-08-06).
  GitHub kennt die Datei nicht. Und selbst nach dem Push würde der Lauf an
  `timeout-minutes: 90` scheitern: gemessen wurden **1 h 49 min**.
  → Befunde M0-B1 bis M0-B3 in
  [TRIAGE.md](../qualitaet/mutation/2026-08-14-rbac/TRIAGE.md#befunde-kein-produktionscode-angefasst).

**Gate M0 erfüllt:** 112/112 eingestuft (maschinell geprüft, 0 Verstöße), die
Reihenfolge folgt den A-Fällen, und sie unterscheidet sich vom Score.

**Was M0 zusätzlich zutage gefördert hat:**

- Die Annahme „45 StringLiterals, meist Texte" hält für **10** von ihnen nicht — sie
  sind Rollennamen, SQL-Texte mit der `org_id`-Klausel und ein Vergleichswert, an
  dem der Letzter-Owner-Schutz hängt. Ein Aufräumen nach Mutator-Art hätte genau
  diese zehn als harmlos abgehakt.
- **Die gefährlichste Art ist `ArrayDeclaration`, nicht `ConditionalExpression`:**
  15 von 19 sind A, weil die überlebenden Arrays fast alle *Abfrage-Parameter* sind.
- **Drei Befunde am Produktionscode** (M0-B6 bis M0-B8): eine doppelt gemoppelte
  Bedingung, die vier Mutanten unötbar macht; eine Mandantengrenze mit 23 erlaubten
  Tabellen und genau einem Aufrufer; eine Fläche im `surface_access`, die niemand
  liest. **Nicht behoben** — P12 verbietet Produktionscode-Änderungen; sie gehören
  als eigene Entscheidung auf den Tisch.

### M1–M5 — eine Welle je Datei

**Reihenfolge (aus M0, nach A-Fällen):**

| Welle | Datei | A-Fälle |
|---|---|---|
| ~~**M1**~~ ✅ *(2026-08-15)* | `services/rbacService.js` | 19 — **alle tot**, Score 95,87 % → **99,17 %** |
| ~~**M2**~~ ✅ *(2026-08-15)* | `services/enterpriseSurfaceAccessService.js` | 8 — **alle tot**, Score 89,29 % → **93,88 %** |
| ~~**M3**~~ ✅ *(2026-08-15)* | `middleware/orgContext.js` | 6 — **alle tot**, Score 86,96 % → **90,22 %** |
| ~~**M4**~~ ✅ *(2026-08-15)* | `utils/orgBoundary.js` | 5 — **alle tot**, Score 82,20 % → **88,14 %** |
| ~~**M5**~~ ✅ *(2026-08-15)* | `middleware/rbac.js` | 1 — **tot**, Score 87,82 % → **88,46 %** |

`utils/orgContext.js` bekommt keine Welle: 0 A-Fälle, beide Überlebenden sind
gleichwertige Mutanten in einer Health-Check-Funktion.

Je Welle:

- Für jeden A-Fall einen Test, der **genau diese Mutation** tötet — kein
  Rundum-Test, der zufällig auch sie erwischt. Der Ansatz steht je Fall in
  `triage.json` unter `kill_durch`.
- Die Begründung der B-Fälle steht vollständig in `triage.json`; der Testkopf
  verweist darauf, statt sie zu kopieren. *(Abweichung vom ursprünglichen Plan,
  bewusst: 32 Kopien in Testköpfen laufen auseinander, eine Quelle nicht.)*
- **Die neue Testdatei muss in den `commandRunner`** von `stryker.rbac.conf.json`.
  Fehlt sie dort, läuft sie im Mutations-Lauf nicht mit: die Suite wäre grün und
  der Mutant lebte weiter. `mutationTriage.test.js` wird rot, wenn ein erledigter
  Fall auf eine Testdatei zeigt, die dort fehlt.
- Nach der Welle: Lauf **nur für diese Datei**, mit
  `node scripts/mutation-welle.js <datei>`. Das Skript leitet seine Konfiguration
  aus der Aggregat-Datei ab und schreibt nach `reports/mutation/welle/…` —
  **niemals ins Archiv**. Mit der Aggregat-Konfiguration direkt zu messen würde
  den archivierten Rohbericht überschreiben; genau so ging am 2026-08-14 schon
  einmal ein Beleg verloren.
- Dann das Gate auswerten: `node scripts/mutation-triage.js --welle <datei>`.
  Es sagt, welcher A-Fall noch lebt — und benennt in der Fehlermeldung die
  einzige richtige Antwort darauf: **den Test schärfen, nicht die Einstufung
  senken.** Ein A-Fall, der trotz grünem Test weiterlebt, ist der Beweis, dass
  der Test das Ergebnis prüft statt die Mutation.
- Zum Schluss die erledigten Fälle in `triage.json` stempeln (`erledigt`:
  Welle, Testdatei, Datum). Nur was der Wellen-Bericht als tot ausweist —
  ein Haken ohne Messung beendet die Suche, ohne das Problem zu lösen.

> **Nicht während eines Mutations-Laufs prüfen lassen.** Am 2026-08-15 meldete
> `dokuWaechter.test.js` „Service-Dateien: Register sagt 175, gezählt wurden 176",
> während der M5-Lauf noch aufräumte; unmittelbar danach zählten `ls` und `find`
> wieder übereinstimmend 175, und der Wächter war grün. Die genaue Ursache ist
> nicht festgenagelt — belegt ist nur, dass im Verzeichnis zu diesem Zeitpunkt
> kurzzeitig ein Eintrag mehr lag. **Ein roter Wächter während eines Laufs wird
> erst nachgeprüft, bevor man ihm glaubt** — sonst jagt die nächste Sitzung einem
> Gespenst nach, und ein falsch-rotes Gatter kostet mehr Vertrauen als es schützt.

**Gate je Welle:** null A-Fälle übrig, jeder B-Fall begründet, Produktionscode
**unverändert**. Muss der Code angefasst werden, ist das ein Befund — dann Stopp
und Owner fragen, nicht nebenbei ändern.

### M6 — Automatik

Erst wenn M1–M5 durch sind, sonst automatisiert man einen roten Zustand.

**M0 hat vorweggenommen, was M6 zu reparieren hat** (Befunde M0-B1 bis M0-B3):
der Job ist nicht auf `origin`, seine Zeitgrenze liegt unter der gemessenen
Laufzeit, und `incremental: true` bringt in CI nichts, weil jeder Lauf aus einem
frischen Checkout startet. Alle drei gehören in diese Welle — nicht früher, sonst
überwacht man einen Zustand mit 61 offenen A-Fällen.

- Voller Lauf **terminiert** (wöchentlich, nicht nächtlich — zwei Stunden pro
  Nacht für sechs Dateien lohnt nicht).
- Zeitgrenze über die **gemessene** Laufzeit setzen (1 h 49 min), nicht über die
  geschätzte („~1 h" stand im Job, bevor gemessen wurde).
- Bericht **datiert** ablegen wie am 2026-08-14; der Rohbericht (79 MB) bleibt
  draußen, nur der Auszug wird versioniert.
- Vor jedem Lauf `rm -rf .stryker-tmp` und den Inkrementalstand — sonst gatet
  `incremental: true` gegen einen anderen Testumfang.
- **Nie mit Pipe messen:** `… | tail` liefert den Status von `tail`.

**Gate M6:** Ein Lauf ohne Änderung erzeugt denselben Score, der Bericht landet
datiert im Archiv, und ein Absinken unter 86 meldet sich sichtbar.

---

## Reihenfolge

**~~M0~~ ✅ → M1 `rbacService.js` → M2 `enterpriseSurfaceAccessService.js` →
M3 `middleware/orgContext.js` → M4 `orgBoundary.js` → M5 `middleware/rbac.js` → M6.**

M0 war nicht optional: ohne die Kategorien wäre aus dem Aufräumen ein
Prozent-Treiben geworden. Der Beleg dafür liegt jetzt vor — nach Score hätte man
mit `orgBoundary.js` (82,20 %) angefangen und wäre bei `rbacService.js` (95,87 %)
zuletzt gelandet, der Datei mit den meisten offenen Fällen.

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
