# P11 — Dokumentation als System

> **Stand:** 2026-08-13 · Branch `release/enterprise-premium-market-ready`
> **Zweck:** Arbeitsanweisung für den Aufbau einer Dokumentation, die **generiert
> statt gepflegt** wird, drei Leser gleichzeitig bedient und sich nicht überholen
> kann, ohne dass die Testsuite es meldet.
> **Owner-Vorgabe 2026-08-13:** gilt als **Grundprinzip für alle Projekte**, nicht
> nur für TempConnect.

---

## P11.0 Die Leitfrage

Jede Dokumentation, die von Hand gepflegt wird, ist ab dem Tag ihrer Fertigstellung
falsch. Das ist kein Disziplinproblem — es ist eine Eigenschaft handgeschriebener
Zustandsbeschreibungen über bewegtem Code.

Dieses Repo hat den Beweis am **2026-08-13** zweimal an einem Tag geliefert:

- **P1-15** — der Notdienst-Antwortpfad lieferte seit Monaten `500`. Beschrieben war
  er als funktionierend.
- **DSGVO-Kontolöschung** — sechs Schema-Fehler, jede Löschung rollte still zurück.
  Art. 17 war dokumentiert, aber nicht umgesetzt.

Beide Male standen **grüne Tests** darüber. Die Frage ist deshalb nicht *„wie
schreiben wir bessere Doku"*, sondern:

> **Welcher Mechanismus macht es unmöglich, dass Doku und Wirklichkeit
> auseinanderlaufen, ohne dass es jemand merkt?**

Die Antwort ist dieselbe wie bei `docs/UEBERGABE.md` und
`sql/migrations/NUMBERING.md`: **geprüft, nicht gepflegt.** Ein Test liest den Code
und lässt die Doku rot werden, sobald sie unvollständig ist.

---

## P11.1 Ist-Stand — gemessen am 2026-08-13

| Größe | Zahl | Herkunft |
|---|---|---|
| Nutzerseiten (HTML) | **77** | `ls frontend/public/*.html` |
| Route-Dateien | **82** | `ls api/routes/*.js` |
| Dienste (Services) | **175** | `ls api/services/*.js` |
| Migrationen | **180** | `sql/migrations/` |
| Vorhandene Doku-Dateien | **240** | `docs/**/*.md` |

**240 Dokumente sind nicht zu wenig Doku — sie sind zu viel unsortierte.** Niemand
weiß, welche davon noch stimmt. Genau das ist der Zustand, den der Owner beschrieben
hat: *„falls man selber was nicht mehr im Überblick hat."*

### Der Hilfebereich existiert bereits — und verspricht mehr, als er hält

`frontend/public/hilfe.html` (493 Zeilen) trägt einen FAQ-Block, eine
Onboarding-Checkliste und eine Karte:

> **„Hilfe und Anleitung — Schritt-für-Schritt-Anleitungen und Dokumentation"**
> → verweist auf `/public/sla_hilfe.html`

Die Karte verspricht die **Gesamtdokumentation** und liefert die **SLA-Hilfe**. Kein
toter Link, aber ein gebrochenes Versprechen — und exakt die Fläche, in die diese
Spur hineinarbeitet. Es gibt also keinen Neubau: es gibt eine Fläche, die auf ihren
Inhalt wartet.

---

## P11.2 Die drei Leser

Ein Dokument für alle wäre für niemanden richtig. Dieselbe **Wahrheit**, drei
**Zuschnitte**:

| Leser | Frage | Was er nicht will |
|---|---|---|
| **Investor** | Was ist gebaut, was ist bewiesen, wo ist Risiko? | Fachjargon, ungedeckte Superlative |
| **Owner** | Was habe ich? Wie bedient man es? Was kann weg? | Vollständigkeit ohne Ordnung |
| **Technik** | Woher weiß ich, dass das stimmt? | Prosa ohne Beleg |

**Eine Quelle, drei Ausgaben.** Wer die Zuschnitte getrennt pflegt, hat in drei
Monaten drei verschiedene Wahrheiten.

### Was das für Zahlen heißt

Eine Zahl ohne Herkunft ist in einer Investorenunterlage keine Stärke, sondern eine
**Haftung**. Deshalb gilt durchgehend: jede Zahl nennt den Befehl, mit dem man sie
nachrechnet. Beispiel für die Übersetzung eines technischen Belegs:

> **Roh:** `middleware/rbac.js — Mutation Score 87,82 %`
> **Übersetzt:** *Wir haben in die Zugriffskontrolle absichtlich 253 Fehler
> eingebaut. 222 davon hat die Testsuite von allein gefunden. Die 31 verbliebenen
> sind einzeln geprüft und betreffen keine Entscheidung über Zugriff, Geld oder
> Nachweis.*

Beides steht nebeneinander in derselben Datei — die Zahl für den Prüfer, der Satz
für den Leser.

---

## P11.3 Wellen und Gates

**Vier Phasen, elf Wellen.** Eine Welle nach der anderen; jede liefert für sich
einen geschlossenen Nutzen.

### Phase A — Wahrheit

#### Welle W1 — Das Register *(läuft bereits)*

Vollständiges Inventar: jede Seite, jeder Endpunkt, jede fachliche Fähigkeit, jede
Tabelle, jeder Hintergrundjob, jeder Plan. Je Element: **Klartext-Name**, ein Satz
Zweck ohne Fachjargon, wer es benutzt, Beleg mit `datei:zeile`, Zustand
(*aktiv · teilweise · attrappe · tot · unklar*).

Ziel: `docs/PLATTFORM_REGISTER.md`.

**Gate W1:** Kein Element ohne Beleg, keine Zahl ohne Herkunft. Wo das Inventar
unsicher war, steht *unklar* — nicht geglättet.

#### Welle W2 — Der Doku-Wächter *(der eigentliche Kern)*

Ein Test, der den Code liest und das Register gegenprüft. Er wird rot, sobald es

- einen Endpunkt gibt, der im Register fehlt,
- eine Seite gibt, die im Register fehlt,
- eine Migration/einen Job gibt, der im Register fehlt,
- ein Register-Element gibt, dessen Beleg **nicht mehr existiert** (Gegenrichtung!).

Die Gegenrichtung ist der Teil, den man vergisst — sie fängt genau den Fall
„Feature entfernt, Doku behauptet es weiter".

**Gate W2:** Eine Negativprobe belegt jede der vier Richtungen: Element einfügen →
rot; Beleg entfernen → rot. Ohne Negativprobe zählt der Wächter nicht.

#### Welle W3 — Der Generator

`api/scripts/doku-generieren.js` erzeugt die ableitbaren Teile neu: Endpunktliste,
Seitenliste, Tabellen, Jobs, Migrationen, Testzahlen.

**Kuratierte Blöcke bleiben unangetastet.** Markierung im Markdown
(`<!-- kuratiert:anfang -->` … `<!-- kuratiert:ende -->`); der Generator schreibt
ausschließlich außerhalb. Ein Generator, der handgeschriebenen Text überschreibt,
wird nach dem ersten Verlust nie wieder benutzt.

**Gate W3:** Zweimal laufen lassen ohne Codeänderung erzeugt **keinen Diff**
(Idempotenz), und ein kuratierter Absatz überlebt zehn Läufe.

### Phase B — Zuschnitt je Leser

#### Welle W4 — Technikdoku und Qualitätsbelege

`docs/qualitaet/` — Testzahlen, Mutationsergebnisse (Stryker-JSON → Markdown, roh
**und** übersetzt), Migrationsstand, offene Blocker.

**Gate W4:** Jede Zahl im Dokument nennt den Befehl, mit dem man sie nachrechnet,
und das Datum ihres Laufs. Eine Zahl ohne Datum ist eine Behauptung.

#### Welle W5 — Bedienungsanleitung je Rolle

`docs/handbuch/` — getrennt für Zeitarbeitsfirma, einsetzendes Unternehmen,
Mitarbeiter, Staff, Support. Aufgabenorientiert („Mitarbeiter importieren"), nicht
seitenorientiert.

**Gate W5:** Jede Aufgabe führt in höchstens **fünf Schritten** zum Ziel und
verweist auf die **echte** Seite. Keine Anleitung für eine Seite, die es nicht gibt —
und keine Hauptseite ohne Anleitung.

#### Welle W6 — Investorendarstellung

`docs/investoren/` — was die Plattform ist, was gebaut ist, was bewiesen ist, was
Risiko ist. Reifegrad je Bereich, mit Beleg.

**Gate W6:** Ein Dritter kann **jede** Aussage im Dokument selbst nachprüfen, ohne
zu fragen. Was er nicht nachprüfen kann, steht nicht drin.

### Phase C — In die Plattform holen

#### Welle W7 — Der Hilfebereich wird echt

Die Doku wird ausgeliefert: maschinenlesbarer Index (`hilfe-index.json`) mit
stabilen Ankern, `hilfe.html` lädt echte Artikel statt einer FAQ-Insel. Die falsche
Karte (*Guide → SLA-Hilfe*) wird korrigiert.

**Stabile Anker sind hier die eigentliche Anforderung.** Ein Hilfe-Verweis, der
beim nächsten Generatorlauf woanders hinzeigt, ist schlimmer als keiner — deshalb
werden Anker aus einer **Kennung** gebildet, nicht aus der Überschrift.

**Gate W7:** Von jeder Hauptseite führt ein Hilfe-Verweis zum **passenden** Artikel
— nicht auf die Übersicht, nicht auf 404. Ein Test prüft jeden Anker gegen den
Index.

#### Welle W8 — Kontextsensitive Hilfe

Jede Seite kennt ihren Artikel (`data-hilfe="mitarbeiter.import"`); ein Klick öffnet
genau ihn.

**Gate W8:** Jede Seite mit `data-hilfe` hat einen existierenden Artikel, und der
Test macht die Gegenrichtung rot (Artikel ohne Seite).

#### Welle W9 — Zweisprachigkeit

DE/EN mit identischen Schlüsseln, wie im übrigen Frontend.

**Gate W9:** Kein Artikel existiert nur in einer Sprache; fehlt EN, fällt die
Anzeige **sichtbar** auf DE zurück statt auf einen leeren Block.

### Phase D — Dauerhaft

#### Welle W10 — Takt und Automatik

Der Generator läuft **nach jeder Welle** und auf Zuruf (`/doku`).

**Bewusst nicht:** nach jedem Prompt. Begründung, die in diese Datei gehört, damit
sie später niemand für Bequemlichkeit hält — Doku, die sich bei jedem Schritt neu
schreibt, erzeugt Diffs, die niemand liest, und verdeckt damit genau die
Änderungen, auf die es ankommt. Die Aktualität wird nicht durch Frequenz erzwungen,
sondern durch **W2**.

**Gate W10:** Ein Lauf ohne Codeänderung erzeugt keinen Diff. Der Wächter aus W2
läuft in der regulären Suite mit.

#### Welle W11 — Übertragung auf die Folgeprojekte

Generator und Wächter als Blueprint herauslösen — TempConnect-Spezifika in eine
Konfiguration, der Rest ist Projekt-unabhängig.

**Gate W11:** Der Generator läuft in einem zweiten Repo, ohne dass eine einzige
Zeile TempConnect darin vorkommt.

---

## P11.4 Reihenfolge

**W1 → W2 → W3 → W4/W5/W6 → W7 → W8 → W9 → W10 → W11.**

W2 **vor** W3: erst der Wächter, dann der Generator. Andersherum entstünde eine
hübsche generierte Doku, deren Vollständigkeit niemand prüft — und die
Vollständigkeit ist der ganze Punkt.

W4/W5/W6 können in beliebiger Reihenfolge, sie hängen nur an W1–W3.

---

## P11.5 Entscheidungen

| Kennung | Frage | Entscheidung |
|---|---|---|
| **DOK-E1** | Artikel im Repo oder in der Datenbank pflegbar? | ✅ **Repo + Build.** Versioniert, prüfbar, im Review sichtbar. Eine DB-Ebene für Support-Artikel (ohne Deploy änderbar) ist eine spätere, additive Welle — nicht die Grundlage. |
| **DOK-E2** | Sprache der Investorenunterlage? | ✅ **DE zuerst, EN daneben** (DACH-Markt, internationale Kapitalgeber). Fällt in W9. |
| **DOK-E3** | Wird die Investorenunterlage öffentlich ausgeliefert? | ⏳ **Owner.** Technisch dasselbe Dokument; die Frage ist geschäftlich. Bis zur Entscheidung bleibt sie **intern** (`docs/investoren/`, nicht in `frontend/public/`). |

---

## P11.6 Was diese Spur ausdrücklich nicht ist

- **Kein Ersatz für die Arbeitspläne.** P8–P10 beschreiben, *was gebaut wurde und
  warum so*. P11 beschreibt, *was existiert und wie man es bedient*. Beides bleibt.
- **Kein Werbetext.** Die Investorenunterlage ist eine Bestandsaufnahme mit Belegen.
  Wer sie zur Verkaufsbroschüre macht, verliert genau die Glaubwürdigkeit, wegen der
  sie geschrieben wurde.
- **Kein Freibrief zum Aufräumen.** Das Register *benennt* Ausmusterungs-Kandidaten
  mit Urteil. Gelöscht wird nichts ohne Owner-Freigabe.
