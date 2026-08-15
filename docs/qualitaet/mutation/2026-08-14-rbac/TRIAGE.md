# M0 — die 112 Überlebenden, einzeln eingestuft

> **Stand: 2026-08-15** · Grundlage: [Prüfbericht vom 2026-08-14](README.md) ·
> Rohdaten: [`ergebnis.json`](ergebnis.json) · Einstufung: [`triage.json`](triage.json)
> **Nachrechnen:** `cd api && node scripts/mutation-triage.js` — erzwungen durch
> `api/test/mutationTriage.test.js` bei jedem Suite-Lauf.

M0 war die Vorbereitung: **ohne Aufschlüsselung je Datei lässt sich die Reihenfolge
der Aufräum-Wellen nicht begründen.** Sie liegt jetzt vor — und sie sagt an drei
Stellen etwas anderes, als der Prüfbericht nahegelegt hatte.

---

## Das Ergebnis in einem Satz

Von 112 Überlebenden brauchen **39 einen Test** (A), **32 bewusst keinen** (B), und
**41 könnten einen bekommen, ohne dass es sich lohnt** (C).

| | Anzahl | Bedeutung |
|---|---|---|
| **A** | **39** | könnte Zugriff, Geld, Nachweis oder Mandantengrenze verschieben — davon **20 hoch** |
| **B** | 32 | Anzeigetext, Protokollmeldung, Formatierung — der Fehlercode daneben ist getestet |
| **C** | 41 | testbar ohne Risiko, oder nachweislich gleichwertig (gar nicht tötbar) |

**Jede Einstufung wurde gegengelesen.** Eine unabhängige Zweitprüfung (je Datei ein
Prüfer mit dem Auftrag zu widerlegen, jeder Einspruch anschließend von einer dritten
Instanz beurteilt) hat **23 Fälle nach unten korrigiert** — aus 61 A wurden 39.
Alle 23 gingen in dieselbe Richtung: *zu streng eingestuft*, keiner in die
gefährliche Richtung. Warum das so kam, steht unten unter
[Was die Gegenprüfung geändert hat](#was-die-gegenprüfung-geändert-hat).

---

## Je Datei — und warum die Reihenfolge nicht dem Score folgt

| Welle | Datei | Score | überlebt | **A** | erledigt | offen | davon hoch | B | C |
|---|---|---|---|---|---|---|---|---|---|
| **M1** ✅ | `services/rbacService.js` | 95,87 % | 25 | **19** | 19 | 0 | 10 | 2 | 4 |
| **M2** ✅ | `services/enterpriseSurfaceAccessService.js` | 89,29 % | 21 | **8** | 8 | 0 | 2 | 0 | 13 |
| **M3** ✅ | `middleware/orgContext.js` | 86,96 % | 24 | **6** | 6 | 0 | 2 | 4 | 14 |
| **M4** ✅ | `utils/orgBoundary.js` | 82,20 % | 21 | **5** | 5 | 0 | 5 | 9 | 7 |
| **M5** ✅ | `middleware/rbac.js` | 87,82 % | 19 | **1** | 1 | 0 | 1 | 17 | 1 |
| — | `utils/orgContext.js` | 93,94 % | 2 | **0** | 0 | 0 | 0 | 0 | 2 |

*Die Score-Spalte ist der Stand vom 2026-08-14. Nach M1 steht `rbacService.js`
bei **99,17 %** — siehe unten.*

**Die Datei mit dem besten Score trägt die meisten offenen Fälle.** `rbacService.js`
steht bei 95,87 % — und hat 19 A-Fälle, mehr als die anderen fünf zusammen.
`orgBoundary.js` steht bei 82,20 %, dem schlechtesten Wert, und hat 5. Wer nach
Score aufgeräumt hätte, hätte mit der falschen Datei angefangen.

Der Grund ist einfach: `rbacService.js` stellt mit 605 Mutanten fast die Hälfte des
Laufs. 4 % von 605 sind mehr Stück als 18 % von 118. **Ein Prozentwert misst
Verhältnisse, aufräumen muss man Stück für Stück.**

Die Reihenfolge ist **stabil**: Sie war vor und nach der Gegenprüfung dieselbe,
obwohl sich 23 Einstufungen verschoben haben.

---

## Je Art — die Aufschlüsselung, die es vorher nicht gab

| Art | A | B | C | gesamt |
|---|---|---|---|---|
| `StringLiteral` | **10** | 24 | 11 | 45 |
| `ConditionalExpression` | 7 | 2 | 11 | 20 |
| `ArrayDeclaration` | **15** | 0 | 4 | 19 |
| `LogicalOperator` | 3 | 1 | 4 | 8 |
| `ObjectLiteral` | 1 | 5 | 1 | 7 |
| `OptionalChaining` | 0 | 0 | 6 | 6 |
| `Regex` | 2 | 0 | 0 | 2 |
| `BlockStatement` · `BooleanLiteral` | 0 | 0 | 4 | 4 |
| `MethodExpression` | 1 | 0 | 0 | 1 |

**`ArrayDeclaration` ist die gefährlichste Art, nicht `ConditionalExpression`** —
15 von 19 sind A. Der Grund: die überlebenden Arrays sind fast alle
**Abfrage-Parameter**. Ein geleertes `[locationId, orgId]` nimmt der Abfrage die
Mandantengrenze, und ein Test, der nur das Ergebnis des Mock-Pools prüft, merkt
davon nichts. Das ist dieselbe Lektion, die in dieser Codebasis inzwischen sechsmal
unabhängig aufgetreten ist: *ein Test, der das Ergebnis prüft statt welche Abfrage
lief, beweist nichts.*

---

## Drei Annahmen, die sich nicht gehalten haben

### 1. „45 StringLiterals — meist Texte, geringe Tragweite"

**Falsch für 10 davon.** Ein StringLiteral ist nur dann Text, wenn ihn ein Mensch
liest. Diese zehn liest Code:

- **6 Rollennamen** in `ADMIN_ROLES`, `SENIOR_ROLES`, `MANAGER_ROLES`
  (`enterpriseSurfaceAccessService.js:20-22`). Spaltengenau sind es in allen drei
  Listen `platform_admin` und `admin` — für sie ist nicht belegt, dass sie ihre
  Rechte bekommen. `owner` ist getestet.
- **3 SQL-Texte** (`rbacService.js:346`, `orgBoundary.js:112` und `:127`). Wird einer
  geleert, verschwindet mit ihm die Klausel `AND org_id = $2` — die Mandantengrenze
  selbst. Stryker zählt sie als StringLiteral.
- **1 Vergleichswert**: das `"owner"` in `if (newRoleKey !== "owner")`
  (`rbacService.js:342`) entscheidet über den Letzter-Owner-Schutz.

### 2. „Rund 28 liegen in Entscheidungslogik"

Die Zahl stimmt mechanisch (20 `ConditionalExpression` + 8 `LogicalOperator`) — sie
zählt aber die falschen Dinge. **4 der 28** sitzen in einer `logger.warn`-Nutzlast
(`middleware/rbac.js:165`) und entscheiden nichts. Umgekehrt sitzen Mutanten in
echten Verzweigungen, die die Zählung nicht erfasst — siehe den Vergleichswert
`"owner"` oben.

Nach Beurteilung statt nach Bauart: **37 sitzen in einer Verzweigung, die Verhalten
steuert; 14 davon sind Kategorie A.** Das ist der Rest, den das Gate der
Mutation-Direktive meint — nicht 28.

### 3. „Der nächtliche CI-Job existiert"

**Er existierte als Datei und war nie gelaufen** — 57 Commits lagen zwischen ihm
und GitHub. Der gewichtigste Befund dieser Welle; gelöst am 2026-08-15 durch den
Push (M0-B1), neu zugeschnitten in M6.

---

## Befunde (kein Produktionscode angefasst)

| Nr | Befund | Beleg |
|---|---|---|
| ~~**M0-B1**~~ ✅ *(gelöst 2026-08-15)* | Der Mutations-Job war **nicht auf `origin`**: `.github/workflows/mutation.yml` entstand am 2026-08-12 (`671b047`), der Fernstand war der 2026-08-06 — **57 Commits zurück**. GitHub kannte die Datei nicht, der Job hat nie ausgelöst. **Am 2026-08-15 hat der Owner den Push freigegeben: 66 Commits sind hoch, `mutation.yml` liegt auf `origin`, der Rückstand ist 0.** Erster geplanter Lauf: Montag 04:30 UTC. | `git ls-tree origin/…` listet jetzt beide Workflows |
| ~~**M0-B2**~~ ✅ | Selbst nach dem Push wäre er **abgebrochen**: `timeout-minutes: 90` gegen gemessene **1 h 49 min**. Schlimmer noch — die Messung lief mit **vier** parallelen Läufern; ein Standard-Runner hat 2 vCPU und damit bei `concurrency: "50%"` genau **einen**. Hochgerechnet über sieben Stunden, bei einem GitHub-Job-Limit von sechs: **der Zuschnitt selbst trug nicht.** Behoben in M6 (Matrix, ein Job je Datei, `timeout-minutes: 180`). | `mutation.yml` gegen [README.md](README.md) |
| ~~**M0-B3**~~ ✅ | `incremental: true` steht in `stryker.rbac.conf.json`, aber CI startet aus einem frischen Checkout ohne Zwischenstand. Behoben in M6: der Lauf geht über `scripts/mutation-welle.js`, das `incremental: false` setzt. | `stryker.rbac.conf.json` |
| **M0-B4** | `req.locationScope` wird von `middleware/orgContext.js` gesetzt und **nirgends gelesen** — außer im eigenen Test. Drei C-Einstufungen stützen sich darauf. | Suche über `api/`, `frontend/`, `e2e/`: 2 Treffer, beide in der Datei selbst bzw. ihrem Test |
| **M0-B5** | `expose: true` am `LAST_OWNER`-Fehler (`rbacService.js:303`) hat **keinen Leser** im Backend. Wirkungslose Kennzeichnung — deshalb C, nicht A. | Suche über `api/`: einziger Treffer ist die Zuweisung selbst |
| **M0-B6** | In `enterpriseSurfaceAccessService.js:157-159` ist die Bedingung **doppelt gemoppelt**: `coMode === "full"` ist genau dann wahr, wenn `isSenior` wahr ist. Deshalb sind `&& isSenior` und (wegen ADMIN ⊂ SENIOR) `coMode === "full" &&` vor `isAdmin` wirkungslos. Vier Mutanten sind dadurch **nicht tötbar** — kein Testproblem, ein Codeproblem. | Zeilen 106-109 gegen 157-159 |
| **M0-B7** | Die Mandantengrenze `assertOrgOwnership` hat **22 erlaubte Tabellen und genau einen Aufrufer**: `routes/requisitions.js`, viermal, immer mit `'requisitions'`. `assertUserOwnership` hat **gar keinen** Aufrufer in Produktion. Die Tabellenliste im Test (`test/orgBoundary.test.js:113-119`) ist zudem eine **Abschrift, die bei 17 Einträgen stehengeblieben ist** — genau die 5 fehlenden Namen sind die überlebenden Mutanten. | Suche über `api/routes`, `api/services` |
| **M0-B8** | `surface_access.multi_location` entsteht in `enterpriseSurfaceAccessService.js:78/:168` und wird über `userService.js:290` ausgeliefert — **von keiner Route und keiner Oberfläche gelesen**. Die einzigen vier Leser sind Tests. Die Standort-Karte im Frontend gatet über `surfaceKey: "org_settings"`. | `hubVisibility.js:97-102` |

**M0-B1 ist eine Owner-Entscheidung, keine Aufgabe:** Der Push von 57 Commits gehört
nicht nebenbei erledigt. Bis dahin gilt: der Mutations-Lauf ist **von Hand gemessen**
(so wie am 2026-08-14), nicht überwacht.

**M0-B6 und M0-B7 berühren Produktionscode** und werden deshalb *nicht* nebenbei
behoben — P12 verbietet das ausdrücklich. Sie gehören als eigene Entscheidung auf
den Tisch. M0-B7 stützt dabei denselben Befund wie
[ORG_GRENZE_BEFUND.md](../../../ORG_GRENZE_BEFUND.md) von der anderen Seite: der
zentrale Wächter existiert und wird einmal benutzt, während 80 Grenzprüfungen
einzeln in den Routen stehen.

---

## Was die Gegenprüfung geändert hat

Die erste Einstufung entstand aus dem archivierten Auszug (`ergebnis.json`), der je
Fall **Datei, Zeile, Mutator und Ersetzung** kennt. Das reicht nicht immer: teilt
sich eine Zeile mehrere Mutanten, bleibt offen, *welcher Teil* der Zeile ersetzt
wurde. Genau daran sind sechs meiner Einstufungen gescheitert — das deutlichste
Beispiel ist `middleware/orgContext.js:187`, wo der Lauf **zwei**
`ConditionalExpression`-Mutanten führt: der über die ganze Bedingung wurde getötet,
überlebt hat der über den rechten Vergleich. Beide sehen im Auszug identisch aus.

Die Zweitprüfung hatte den **Rohbericht** (75 MB, nicht versioniert), der jeden
Mutanten spaltengenau auflöst. Daraus folgen zwei bleibende Konsequenzen:

1. **`triage.json` trägt jetzt `spalte` und `mutant_id`** je Fall. Die Präzision des
   Rohberichts ist damit im Archiv, auch wenn die 75 MB längst gelöscht sind.
2. **`node scripts/mutation-triage.js --roh`** hält den Auszug gegen den Rohbericht,
   solange dieser noch auf der Maschine liegt. Ergebnis heute: **112 Überlebende,
   0 Abweichungen.** Ohne Rohbericht wird die Prüfung übersprungen, nicht rot — ein
   Archiv, das nur mit dem Original prüfbar ist, wäre kein Archiv.

Drei der 23 Korrekturen wurden **mechanisch** entschieden statt nach Urteil: für
`admin`, `supplier_manager` und `finance` gibt es in der gesamten Rechtematrix keine
einzige Berechtigung, die nur über die Vererbung erreichbar wäre — ihre Zeile in
`ROLE_HIERARCHY` ist reine Redundanz, der Mutant damit gleichwertig. Für
`program_manager`, `hiring_manager`, `recruiter` und `dispatcher` gilt das nicht;
dort steht in `kill_durch` jetzt die konkrete Berechtigung, die nur über das Erbe
erreichbar ist.

---

## Die gemessenen Wellen

Je Welle ein Lauf über genau diese Datei
(`node scripts/mutation-welle.js <datei>`), ausgewertet mit
`node scripts/mutation-triage.js --welle <datei>`:

| Welle | Datei | Score vorher | **nachher** | überlebt vorher | **nachher** | A-Fälle tot |
|---|---|---|---|---|---|---|
| M1 | `rbacService.js` | 95,87 % | **99,17 %** | 25 | **5** | 19/19 |
| M2 | `enterpriseSurfaceAccessService.js` | 89,29 % | **93,88 %** | 21 | **12** | 8/8 |
| M3 | `middleware/orgContext.js` | 86,96 % | **90,22 %** | 24 | **18** | 6/6 |
| M4 | `utils/orgBoundary.js` | 82,20 % | **88,14 %** | 21 | **14** | 5/5 |
| M5 | `middleware/rbac.js` | 87,82 % | **88,46 %** | 19 | **18** | 1/1 |

**Alle 39 A-Fälle sind tot. Das Gate der Mutation-Direktive ist geschlossen.**

In **jeder** Welle gilt dasselbe: **die Überlebenden sind genau die Fälle, die M0
nicht als A eingestuft hat** — keiner mehr, keiner weniger, fünfmal in Folge. Die
Einstufung sagt also nicht nur, was zu tun ist, sondern sagt auch richtig voraus,
was nach getaner Arbeit übrig bleibt.

**Das Aggregat ist gemessen: [94,43 % am 2026-08-15](../2026-08-15-rbac-nach-wellen/README.md).**
Ein Lauf über alle sechs Dateien, 2 h 40 min, 1219 von 1292 getötet, 72 übrig.
Maschinell gegengeprüft: **null A-Fälle leben, null Überlebende, die diese
Einstufung nicht kennt.**

Die aus den fünf Wellen *gerechnete* Erwartung lag bei 94,66 % — der gemessene
Wert liegt 0,23 Punkte darunter, und der Unterschied ist erklärt: drei
B-Mutanten (Meldungstexte) leben wieder, weil die Wellen-Tests sie zunächst
versehentlich mit erschlagen hatten. Genau deshalb wird eine zusammengerechnete
Zahl hier nicht als Ergebnis geführt — daran ist der frühere Wert schon einmal
gescheitert (siehe [README](README.md)).

### M1 im Detail — der Beleg für die Gegenprüfung

`services/rbacService.js`, 54 min 44 s, 605 Mutanten. Die fünf Überlebenden:

| Stelle | Kategorie | warum er überleben *musste* |
|---|---|---|
| `:12` `ROLE_HIERARCHY.admin` | C | gleichwertig — jedes Recht von `admin` steht ohnehin ausdrücklich in `PERMISSIONS` |
| `:15` `supplier_manager` | C | dito |
| `:16` `finance` | C | dito |
| `:244` `swallow("rbacService")` | B | Protokollherkunft im ROLLBACK-Pfad |
| `:303` `expose: true` | C | hat gemessen keinen Leser (M0-B5) |

Das ist der eigentliche Wert dieser Welle: **die Vorhersage war prüfbar und ist
eingetroffen.** Besonders die drei Vererbungszeilen — sie waren in der ersten
Einstufung A, wurden von der Gegenprüfung mechanisch auf C korrigiert („für diese
Rollen hängt kein Recht am Erbe"), und genau sie haben überlebt, obwohl die neuen
Tests `hasPermission` von allen Seiten beanspruchen. Die vier Vererbungszeilen,
die als A blieben (`program_manager`, `hiring_manager`, `recruiter`,
`dispatcher`), sind tot. Eine Einstufung, die sich so verhält wie angekündigt,
ist mehr wert als eine, die nur plausibel klingt.

**Gate M1 erfüllt:** 19 von 19 A-Fällen tot, Produktionscode unverändert, ein
B/C-Fall nebenbei mit erschlagen.

### M2 im Detail — eine Rollenliste ist keine Textliste

`services/enterpriseSurfaceAccessService.js`, 196 Mutanten. Sechs der acht
A-Fälle waren Einträge in `ADMIN_ROLES`, `SENIOR_ROLES` und `MANAGER_ROLES` —
und zwar in **allen drei Listen dieselben zwei**: `platform_admin` und `admin`.
`owner` starb jedes Mal.

Der Grund steht in der bestehenden Testdatei: Sie prüft die Flächenmatrix
zeilenweise, aber je Rollenmenge nur mit **einem Vertreter**. Damit ist belegt,
dass ein `owner` Admin-Rechte bekommt — für `platform_admin`, die Rolle mit den
weitesten Rechten der Plattform, war es das nicht. Die neuen Tests hängen
deshalb je Liste an einer Fähigkeit, die **nur** aus ihr folgt:
`audit_trail.canExport` (ADMIN), `executive_dashboard.mode` (SENIOR),
`vendor_pool.canInvite` (MANAGER) — sonst würde ein Test mehrere Mutanten
gleichzeitig treffen oder keinen.

Die beiden übrigen A-Fälle: das Tarif-Präfix `INDIVIDUELL_` wurde nie mit einem
echten Sondertarif geprüft, und dass `orgType` das alte Feld `role` schlägt,
stand nirgends — ein Unternehmen mit Alt-Rolle `agency` hätte schlagartig die
Agentur-Flächen bekommen.

**Gate M2 erfüllt:** 8 von 8 A-Fällen tot, Produktionscode unverändert.

### M3 im Detail — drei Zusagen, auf die anderer Code sich verlässt

`middleware/orgContext.js`, 184 Mutanten. Die sechs A-Fälle tragen keine
Fähigkeit, sondern drei Zusagen:

- **Beide Anker des UUID-Musters.** Ohne Anfangsanker passiert `muell<uuid>` die
  Eingangsprüfung, ohne Endanker `<uuid>muell` — beides Werte, die danach als
  Org- oder Standort-Kennung weiterverwendet würden. Dass *jeder Anker einzeln*
  überlebt hat, heißt: geprüft war nur, dass eine saubere UUID durchkommt.
- **Regel 7 — der Kontext bleibt nie leer.** Nennt jemand eine Organisation, in
  der er nicht Mitglied ist, fällt der Kontext auf die eigene zurück. Bliebe
  `req.orgId` leer, schalteten sich 44 Prüfstellen der Form
  `if (req.orgId && fremd) 403` selbst ab. Genau das war bis zum 2026-07-26 ein
  erreichbares Cross-Org-Leck — der Zweig, der es schloss, war unbewiesen.
- **Regel 6 — nur der Header ist eine Absicht.** Ein `?org_id=` aus der
  Adresszeile darf nicht in den Sitzungs-Cache wandern, und der Standort-Cache
  wird nur bei einem *echten* Org-Wechsel verworfen. Beide Bedingungen der
  Zeile 82 überlebten einzeln — doppelte Logik braucht doppelte Tests.

**Gate M3 erfüllt:** 6 von 6 A-Fällen tot, Produktionscode unverändert.

### M4 im Detail — der Mock, der jede Frage gleich beantwortet

`utils/orgBoundary.js`, 118 Mutanten, der größte Sprung aller Wellen
(82,20 % → 88,14 %). Alle fünf A-Fälle sind **dieselbe Lücke**: zweimal der
SQL-Text, in dem `AND org_id = $2` steht — die Mandantengrenze selbst —, und
dreimal die Parameterliste, ohne die die Klausel nichts zu vergleichen hat.

Die Ursache steht in einer Zeile der bestehenden Testdatei:

```js
function mockPool(rows = []) {
  return { query: async () => ({ rows }) };   // ← SQL und Parameter: ignoriert
}
```

Damit ist belegt, dass die Funktion auf ein gegebenes Ergebnis richtig
**reagiert**. Nicht belegt ist, dass sie überhaupt die richtige Frage **stellt**.
Ein geleerter SQL-Text und eine leere Parameterliste sehen für diesen Mock
identisch aus wie das Original.

Das ist die Lektion, die in dieser Codebasis inzwischen **siebenmal unabhängig**
aufgetreten ist — hier zum ersten Mal an der Stelle, an der CLAUDE.md sie
ausdrücklich verlangt: *„location_id immer via `assertLocationBelongsToOrg`
validieren."* Die Funktion existierte, wurde aufgerufen, war getestet — und ihre
Grenze war unbewiesen.

**Gate M4 erfüllt:** 5 von 5 A-Fällen tot, zwei B/C-Fälle nebenbei mit
erschlagen, Produktionscode unverändert.

### M5 im Detail — ein Fall unter 19, und der einzige, der zählt

`middleware/rbac.js`, 156 Mutanten. 19 Mutanten hatten hier überlebt, **17 davon
sind Protokolltexte und Anzeigemeldungen** — die Fehlercodes daneben (`ROLE_DENIED`,
`NO_ORG_MEMBERSHIP`, `PERMISSION_DENIED`) sind längst getestet. Diese Datei ist
damit das Gegenstück zu `orgBoundary.js`: dort war fast alles tragend, hier fast
nichts.

Der eine A-Fall steht am Ende von `requireRole`:

```js
req.orgId = membership.org_id || orgId || null;
```

Wird das erste `||` zu `&&`, liefert der Ausdruck `null` — und zwar im
**häufigsten** Fall: immer dann, wenn die Anfrage keine Organisation ausdrücklich
nennt und der Kontext über die primäre Mitgliedschaft aufgelöst wurde. Der
Wachposten verschwindet also nicht mit einem Fehler, sondern lautlos, und
ausgerechnet hinter einer Middleware, deren Aufgabe das Gegenteil ist.

Genau deshalb ist die Score-Zahl dieser Datei die uninteressanteste der Spur
(87,82 % → 88,46 %, ein knapper Punkt): **Der Wert misst 19 Fälle, die Aussage
hängt an einem.** Hätte man nach Prozent aufgeräumt, wäre hier am meisten Arbeit
für am wenigsten Sicherheit angefallen.

**Gate M5 erfüllt:** 1 von 1 A-Fall tot, Produktionscode unverändert.

---

## Was die Wellen M2–M5 tun werden

Je Welle ein Testblock, Produktionscode unverändert. Die Fälle stehen einzeln in
[`triage.json`](triage.json) mit dem Feld `kill_durch` — dem Test, der genau diese
Mutation tötet.

| Welle | Datei | A | Schwerpunkt |
|---|---|---|---|
| ~~**M1**~~ ✅ | `rbacService.js` | 19 | erledigt am 2026-08-15, `test/rbacServiceMutanten.test.js` (20 Tests) |
| ~~**M2**~~ ✅ | `enterpriseSurfaceAccessService.js` | 8 | erledigt am 2026-08-15, `test/enterpriseSurfaceMutanten.test.js` (13 Tests) |
| ~~**M3**~~ ✅ | `middleware/orgContext.js` | 6 | erledigt am 2026-08-15, `test/orgContextMutanten.test.js` (7 Tests) |
| ~~**M4**~~ ✅ | `orgBoundary.js` | 5 | erledigt am 2026-08-15, `test/orgBoundaryMutanten.test.js` (7 Tests) |
| ~~**M5**~~ ✅ | `middleware/rbac.js` | 1 | erledigt am 2026-08-15, `test/rbacMiddlewareMutanten.test.js` (1 Test) |

`utils/orgContext.js` bekommt **keine Welle**: 0 A-Fälle, beide Überlebenden sind
gleichwertige Mutanten in einer Health-Check-Funktion.

**Abweichung vom Plan, bewusst:** Der Plan sah vor, jeden B-Fall „mit einer Zeile
Begründung im Testkopf" zu versehen. Die Begründungen stehen stattdessen vollständig
in `triage.json` — eine Quelle statt 32 Kopien in Testköpfen, die auseinanderlaufen.
Die Testköpfe verweisen darauf.

---

## Gate M0 (und was daraus wurde)

Alle fünf Wellen sind gelaufen; **39 von 39 A-Fällen sind tot**, in jeder Welle
blieben genau die Nicht-A-Fälle übrig. Offen ist nur noch **M6** (Automatik) —
und der hängt an der Owner-Entscheidung aus M0-B1: solange die 57 Commits nicht
auf `origin` stehen, kann kein CI-Job diese Arbeit überwachen.

| Bedingung | Stand |
|---|---|
| Jeder der 112 Fälle trägt eine Kategorie | ✅ maschinell geprüft, 0 Verstöße |
| Jede Einstufung unabhängig gegengelesen | ✅ 23 Korrekturen, alle nach unten, keine in der gefährlichen Richtung |
| Reihenfolge M1–M5 ergibt sich aus A-Fällen, nicht aus dem Score | ✅ und sie unterscheidet sich davon — bleibt aber unter der Korrektur stabil |
| Aufschlüsselung je Datei × Art liegt vor | ✅ `node scripts/mutation-triage.js` |
| Auszug deckt sich mit dem Rohbericht | ✅ `--roh`: 112 Überlebende, 0 Abweichungen |
| Nächtlicher CI-Job verifiziert | ✅ geprüft — **Ergebnis: er läuft nicht** (M0-B1) |
| Kein Produktionscode angefasst | ✅ nur Doku, Skript und Test |
