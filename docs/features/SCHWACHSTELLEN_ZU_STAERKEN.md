# Schwachstellen zu Stärken — Arbeitsplan, Wellen 1–8

> **Stand: 2026-09-29.** Arbeitsanweisung für die nächsten Sitzungen.
>
> **Jede Zahl in diesem Plan ist gemessen, keine ist geschätzt.** Wo eine
> Messung eine Grenze hat, steht die Grenze dabei. Wer diesen Plan liest,
> braucht das Sitzungsprotokoll nicht.
>
> **Grenze der Messung, vorweg und für den ganzen Plan:** gemessen wurde am
> 2026-09-29 auf `main`/`75016b6` in einem Cloud-Container (frischer Klon,
> Node 22.22.2, Linux). Der Arbeitsstand `claude/brave-sanderson-9e9148` liegt
> **253 Commits davor** und war dort nicht verfügbar. Der Owner nennt für ihn
> am 2026-09-30 **220 Migrationen** (hier: 186) und **12.180 Tests** (hier
> gemessen: 9.054–9.190, siehe Welle 2). **Jeder Punkt ist gegen
> diesen Stand gegenzuprüfen, bevor er gebaut wird** — manche sind dort
> vielleicht längst weg. Was *nicht* wegfallen kann, ist die Methode: die
> Zahlen stehen mit dem Befehl dabei, mit dem sie ermittelt wurden.

---

## Warum dieser Plan existiert

Dieses Projekt hat eine Stärke, die in kommerziellen Codebasen selten ist: es
prüft sich selbst und schreibt auf, was es *nicht* weiß. Wächter, die Klassen
von Fehlern fangen. Mutation Testing gegen den echten Bestand. Register, die
eine Zahl nicht sinken lassen, ohne dass jemand es begründet.

Und es hat eine Lücke, die genau dazu passt: **all das lief nie auf einer
fremden Maschine.** `docs/PILOT_GO_LIVE_TODOS.md` Abschnitt 1 sagt es selbst —
„niemand hat den Code je auf einer fremden, sauberen Maschine gebaut und
getestet. Genau das ist der Zweck einer CI — sie fängt ‚bei mir läuft's'."

Am 2026-09-29 ist das zum ersten Mal passiert. Der erste Befund kam nach elf
Minuten und vor der ersten Zeile Code: **`npm ci` brach ab.** Lockdatei und
`package.json` waren seit dem 2026-08-13 nicht synchron. Damit war aus diesem
Stand **kein Produktions-Image baubar** — unabhängig von der Kontosperre, über
sechs Wochen lang, und niemand konnte es wissen, weil auf der Owner-Maschine
ein gewachsenes `node_modules/` liegt.

**Das ist die Klasse, um die es in diesem Plan geht.** Nicht um Fehler im
Code — die findet dieses Projekt zuverlässig selbst. Sondern um die Sorte
Schwäche, die *nur* auffällt, wenn jemand anders hinsieht: eine Prüfung, die
nie lief; eine Zahl, die niemand nachgerechnet hat; ein Schutz, der
dokumentiert ist und nicht existiert.

---

## Der Maßstab: wann ist eine Schwachstelle eine Stärke

Eine Schwachstelle gilt in diesem Plan **nicht** als behoben, wenn sie
verschwunden ist. Sie gilt als behoben, wenn sie **nicht zurückkommen kann**.
Das ist die Arbeitsweise, die dieses Projekt ohnehin fährt (das Org-Grenzen-
Register, die Sperrklinke, die Selbstproben) — hier steht sie als Maßstab:

| Stufe | Was erreicht ist | Beispiel aus dem Bestand |
|---|---|---|
| 0 | Die Schwäche ist bekannt | ein Eintrag im Register |
| 1 | Sie ist behoben | der Fix ist gebaut |
| 2 | Der Fix ist **belegt** | eine Gegenprobe macht ihn rot, wenn er fehlt |
| 3 | Die Klasse ist **bewacht** | der Wächter findet die *nächste* Fundstelle von selbst |

**Abnahme ist Stufe 3, nicht Stufe 1.** Wo Stufe 3 unangemessen teuer ist,
steht das in der Welle ausdrücklich dabei — mit Begründung, nicht als
Auslassung.

---

## Die Reihenfolge

Die Reihenfolge ist nicht nach Schwere sortiert, sondern nach **Tragfähigkeit**:
was trägt die Belege aller folgenden Wellen? Eine Aussage über Frontend-Qualität
ist wertlos, solange die Suite ihre eigene Testzahl nicht stabil nennen kann.

| | Welle | Art | Aufwand | trägt |
|---|---|---|---|---|
| **1** | **Die CI läuft grün — zum ersten Mal** | Verifikation | 1 Welle + Owner-Handlung | **alles** |
| **2** | Die Testzahl wird eine Zahl | Verifikation | 1 Welle | jede „N Tests, 0 Fehler"-Aussage |
| **3** | Der Backstop in der Datenbank | **Sicherheit** | 1–2 Wellen | Mandantentrennung, Verkaufsfähigkeit |
| **4** | Betriebsbereitschaft | Betrieb | 1 Welle + Owner | Go-Live, erster Kunde |
| **5** | Die drei Konsolen werden prüfbar | Qualität | 1 Welle | 18.000 Zeilen ohne Netz |
| **6** | Die Design-System-Schuld | Qualität/UX | 1–2 Wellen | Vertrauen in der Kundenfläche |
| **7** | Backend-Hygiene | Qualität | 2 Wellen | Wartbarkeit bei 300 Kunden |
| **8** | Bus-Faktor 1 | **Organisation** | laufend | Verkaufswert, Ausfallsicherheit |

**Welle 1 zuerst, ohne Ausnahme.** Nicht weil sie die schwerste ist, sondern
weil jede Aussage aller anderen Wellen von ihr abhängt. Ein Projekt, dessen CI
nie gelaufen ist, kann über seinen eigenen Zustand keine belegte Aussage
machen — nur eine wahrscheinliche.

---

## Welle 1 — Die CI läuft grün, zum ersten Mal

**Der Zustand, gemessen:** von 62 Läufen in der Repo-Historie sind **alle 62**
`startup_failure` nach 0 Sekunden. Es gab **nie** einen grünen Lauf. Die
Ursachen sind seit dem 2026-07-26 aufgeklärt (manuell deaktivierter Workflow —
behoben; Kontosperre wegen Abrechnung — offen). Was bis zum 2026-09-29 niemand
wissen konnte: **auch nach Behebung der Kontosperre wäre jeder Job an Schritt 1
gescheitert.**

### Was am 2026-09-29 bereits erledigt ist

Drei Befunde, alle gefunden, behoben und belegt — Commits `e0ac5b2`, `f53c00f`,
`0a34e69` auf `claude/zen-goldberg-w1oxw3`:

| | Befund | Beleg |
|---|---|---|
| **P0.8** | `npm ci` brach mit `EUSAGE` ab: `@anthropic-ai/sdk@0.68.0` stand unter `dependencies`, fehlte samt drei transitiven Paketen in der Lockdatei. **Auch `api/Dockerfile` Z. 13 betroffen** — `--omit=dev` half nicht, weil es eine Laufzeit-Abhängigkeit ist. Kein Produktions-Image baubar. | `npm ci --omit=dev --legacy-peer-deps` vorher exit 1, nachher exit 0, 313 Pakete in 7 s. Lockdatei-Diff: 49 Zeilen, nur die vier fehlenden Einträge, keine Versionssprünge. |
| **P0.9** | Die elf `npm ci` in `ci.yml` trugen kein `--legacy-peer-deps`; `bullmq@5.77.3` führt `redis >=5.0.0` als optionalen Peer, das Projekt hält 4.7.1 → `ERESOLVE`. Das Dockerfile trug das Flag seit jeher, die CI nicht. | YAML parst, 14 Jobs; die fünf `./api`-Schritte tragen das Flag, die vier `./frontend`- und zwei Root-Schritte nicht (dort installiert `npm ci` sauber, exit 0). |
| **P0.10** | `releaseSecretScan.test.js` verlangte `deploy/.env` — eine Datei, die per `.gitignore` (`*.env`) **dauerhaft ungetrackt** ist und in keinem Checkout existieren darf. Rot auf jeder fremden Maschine. | Ersetzt durch eine **schärfere** Prüfung: `git ls-files` muss leer sein (fängt zusätzlich das versehentliche Einchecken echter Zugangsdaten), Scan zusätzlich wenn lokal vorhanden. Gegenprobe gefahren: `git add -f deploy/.env` → rot; nach `git rm --cached` → grün. |

**Volle Suite danach: 3 Fehler statt 4.**

### Was Welle 1 noch zu tun hat

**(a) Die Kontosperre — nur der Owner, 5 Minuten.** github.com als
`Rosenbaum-yoo` → Settings → Billing and plans. GitHub meldete beim ersten
tatsächlich gestarteten Lauf für **jeden** Job: „account is locked due to a
billing issue". Danach Actions → CI → Run workflow (`workflow_dispatch` ist
konfiguriert). *Bitte nichts davon erneut debuggen — die Ursache steht fest.*

**(b) Die 15 Lint-Fehler (P0.12).** `npm run lint` meldet 15 Fehler und
1 Warnung in 8 Dateien; der Job heißt „ESLint (zero warnings)" und kann so
nicht grün werden. 13 sind Regex-Stilregeln in Testdateien, 7 davon
`--fix`-fähig. **Zwei sind echt:** `test/visibilityMatrix.test.js:367` benutzt
`_ROOT_DOCKER` und `_ROOT_LOCAL`, die nirgends definiert sind. Die Zeile steht
im Integritäts-Wächter, der feuern soll, *wenn* `hubVisibility.js` fehlt — er
würde dort mit `ReferenceError` sterben statt mit seiner Botschaft. Ein
Wächter, der im Ernstfall die falsche Meldung gibt, ist kein Wächter.
`npm run typecheck` ist sauber (exit 0).

**(c) Die zwei Doku-Tests (P0.13) — Entscheidung W-E1.** Nach P0.10 bleiben
genau drei rote Zusicherungen, alle in `docsConsistency.test.js` und
`dokuWaechter.test.js`. `docs/UEBERGABE.md` beschreibt die Ursache für
`git worktree`: `.agents/`, `frontend/support-ops/` und die ungetrackten
Dateien unter `docs/launch/` fehlen in einem frischen Baum. Die dort genannte
Abhilfe — Pfade aus dem Hauptbaum verknüpfen — gibt es in einer CI nicht:
**eine CI ist immer ein frischer Baum.** Damit ist die Suite dort strukturell
rot, unabhängig vom Code. Siehe W-E1.

**(d) Der Docker-Build wird Teil der CI.** Der schwerste Befund dieser Welle
(P0.8) lag im Dockerfile-Pfad, und **kein einziger CI-Job baut das Image.**
Ein `docker build -f api/Dockerfile` als eigener Job hätte ihn am Tag seiner
Entstehung gemeldet. Das ist die Stufe-3-Antwort auf P0.8: nicht der Fix, der
Draht.

### Abnahmekriterium für Welle 1

1. `bash scripts/ci-status.sh` nennt einen **grünen** Lauf, nicht älter als der
   letzte Commit.
2. Alle Jobs grün — einschließlich `lint-typecheck`.
3. Ein Job baut `api/Dockerfile` und schlägt fehl, wenn `npm ci` es nicht kann.
4. Die Dokumentation, die „CI grün" behauptet (`docs/GO_LIVE_FINAL.md`,
   `docs/RELEASE_RUNBOOK.md`), beschreibt danach etwas, das wirklich
   stattgefunden hat.

### Was Welle 1 ausdrücklich nicht ist

Keine Testerweiterung, keine Coverage-Anhebung, kein neuer Wächter außer dem
Docker-Job. Welle 1 macht die bestehende Prüfkette **einmal beweisbar**. Alles
andere baut darauf auf und wird sonst auf Sand gemessen.

---

## Welle 2 — Die Testzahl wird eine Zahl

**Der Befund (P0.11), gemessen am 2026-09-29:** drei Läufe von
`node scripts/run-tests.js` auf **identischem, unverändertem Baum** meldeten
**9054**, **9183** und **9190** Tests. Der Exit-Code war in allen Fällen
derselbe.

An einer einzelnen Datei nachgestellt — `releaseSecretScan.test.js`, und
bewusst in der **unveränderten** Fassung aus `HEAD`, damit der Effekt nicht
einer Änderung von heute angelastet wird:

| Aufruf | gemessene Testzahl |
|---|---|
| `node --test --test-force-exit <datei>` | 76 · 30 · 76 · 45 · 36 · 42 · 48 |
| `node --test <datei>` (ohne Flag) | **76 · 76 · 76** |

`api/scripts/run-tests.js:186` ruft `--test-force-exit`. **Es ist nicht der in
`docs/UEBERGABE.md` beschriebene Pipe-Effekt** — die Umleitung in eine Datei
schwankt genauso (36/42/36/48). Der Hinweis „ohne Pipe" deckt den Fall nicht ab.

**Warum das zählt.** Es trifft die eiserne Regel dieses Projekts: *„Kein
stiller Skip. Ein Test, der unter `api/scripts/run-tests.js` nicht real läuft,
zählt nicht als grün."* Jede Zahl der Form „N Tests, 0 Fehler" ist damit eine
Untergrenze mit unbekanntem Fehlbetrag — und ein **roter** Test kann in einem
Lauf unter den Tisch fallen. Der Kommentar in `run-tests.js:160-168` beschreibt
bereits einen verwandten Abbruch unter Windows und nennt die Richtung selbst:
*„offene Handles der Datei vor dem Ende schliessen; dann kann
`--test-force-exit` dort nichts mehr abschneiden."*

**Der erste Schritt kostet zwei Minuten und gehört dem Owner:** dieselbe Suite
auf dem Arbeitsstand zweimal hintereinander laufen lassen und die Zahl
vergleichen. Kommt zweimal 12180, ist der Effekt auf den Cloud-Container
beschränkt und diese Welle sinkt auf P2. Kommen zwei verschiedene Zahlen, gilt
der Befund auch dort.

**Danach, in dieser Reihenfolge:** (1) Vollauf ohne `--test-force-exit` fahren
und die Dateien benennen, die hängen — das *ist* die Liste der echten offenen
Handles, und sie ist kürzer als die Suite. (2) Diese Handles schließen;
bekannter Kandidat ist der `MessagePort` aus `routes/me.js`, der in der
Übergabe als eigene Aufgabe geführt wird (`routes/me.js` braucht 5,9 s zum
Laden und hinterlässt einen offenen Port). (3) Das Flag erst danach entfernen.
Siehe W-E2.

**Abnahmekriterium:** derselbe Baum, fünf Läufe, **fünfmal dieselbe Testzahl**.
Dazu ein Wächter, der die Zahl gegen eine Sperrklinke hält — nach dem Muster
des Org-Grenzen-Registers. Erst dann ist „12180 Tests" eine Aussage.

---

## Welle 3 — Der Backstop in der Datenbank

Die Mandantentrennung dieses Systems ist **gut** — H2 hat siebzehn Lücken
geschlossen, der Wächter findet die nächste selbst. Sie hängt aber fast
vollständig an der **Anwendung**. Gemessen:

| Größe | Wert | Befehl |
|---|---|---|
| Tabellen | 178 | `grep -rhoiE "create table" sql/migrations \| sort -u` |
| Tabellen mit RLS | 18 Vorkommen in 3 Dateien | `grep -rho "ENABLE ROW LEVEL SECURITY" sql/` |
| Policies | 42 | `grep -rho "CREATE POLICY" sql/` |

**Migration 117 existiert nicht.** `docs/security/TENANT_ISOLATION_MODEL.md`
verweist **28 Tabellen** auf sie als „nächsten Schritt"; `sql/migrations/`
springt von 116 auf 118 (P1-16). `rate_cards` und `approval_requests` stehen
gegen die laufende Datenbank gemessen auf `rls=false` mit null Policies — für
E-1 und E-3, zwei der geschlossenen Cross-Org-Lücken, gab es in **keinem**
Deployment einen Backstop in der Datenbank.

> **Eine Dokumentation, die einen Schutz behauptet, den es nicht gibt, ist
> schlimmer als keine.** Sie beendet die Suche.

Dazu die Audit-Seite, ebenfalls an der Quelle gemessen (`I_AUDIT_ZUWEISUNG_SUPPORT.md`
Abschnitt 8.1.1, **aktiver Sicherheitsbefund**): **135 Zeilen** tragen eine
`org_id`, deren Akteur nie Mitglied dieser Organisation war — ein Konto der
Organisation *Unternehmen* sieht im eigenen Audit-Log einen `auth.login` eines
Kontos der Organisation *Zeitarbeit*. Und die Gegenrichtung: **1796 von 2740
Zeilen** tragen gar keine `org_id` und sind damit in *keinem* Org-Audit sichtbar
(offene Entscheidung **D-M3**).

**Reihenfolge:** 8.1.1 zuerst — es ist der einzige Punkt mit einem laufenden
Abfluss. Dann Migration 117 für die 28 Tabellen, mit Rollback-Plan und gegen
eine Wegwerf-DB verifiziert, in beiden Flag-Pfaden. **Abnahme:** ein
Nicht-Superuser-Laufzeitbeweis wie bei Migration 126 — ohne Org-Kontext null
Zeilen, fremde Org null, eigene Org die erwarteten, Staff-Bypass die erwarteten.

---

## Welle 4 — Betriebsbereitschaft

Diese Welle enthält **keinen** Code, den man nicht schon hat. Sie enthält die
Dinge, die zwischen „läuft bei mir" und „ein Kunde kann darauf bauen" stehen.

**(a) Redis wird überwacht.** Ist Redis beim Start nicht erreichbar, schreibt
`api/workers/index.js:34-37` eine Logzeile und fährt fort. Die API antwortet
normal, der Healthcheck ist grün, die Oberfläche wirkt vollständig — und im
Hintergrund passiert nichts mehr: keine Benachrichtigung, keine
Trefferberechnung, keine Einsatz-Einladung, **kein Verfallslauf um 03:00**. Die
letzte Folge ist die teuerste: der Marktplatz zeigt dann Personal an, das es
nicht mehr gibt. Das meldet niemand als Ausfall — das kommt als
**Unzuverlässigkeit** an. Abnahme: ein Alarm, der feuert, plus die Zusicherung,
dass `Background workers started` im Log steht.

**(b) Die Restore-Probe (P1.4).** Ein Backup, aus dem nie zurückgespielt wurde,
ist eine Vermutung. Einmal wirklich zurückspielen, Zeit messen, Schritte
aufschreiben.

**(c) Secret-Rotation (P0.4)**, inklusive des Web3Forms-Keys in der
Git-Historie.

**(d) Die beiden Stripe-Schlüssel.** `STRIPE_SECRET_KEY` und
`STRIPE_WEBHOOK_SECRET`. Ohne sie antwortet `POST /credits/purchase` mit 503 —
das ist richtig gebaut, aber es heißt auch: **die Plattform kann heute kein
Geld annehmen.**

**(e) Zwei Blocker aus `TEAM_UND_ROLLEN.md`, beide Tagesarbeit.** Der
OCC-Logout meldet niemanden ab (`Topbar.tsx:18` ruft
`occApi.post("/auth/logout")` gegen eine Basis, unter der kein auth-Router
liegt; der Aufruf ist mit `.catch(() => {})` versehen und schluckt den
Fehlschlag — das Sitzungscookie bleibt gültig). Und `MFA_ENFORCE=true` sperrt
den Eigentümer aus: `requireMfa` hängt vor den Schreibpfaden dreier
OCC-Router, und die Suche nach `428`, `MFA_REQUIRED` oder `MFA_VERIFY` im
gesamten OCC-Frontend liefert **null Treffer**.

---

## Welle 5 — Die drei Konsolen werden prüfbar

**Gemessen:** 17.986 Zeilen TypeScript/React in `frontend/src`,
**0 Unit-Tests**, kein `vitest`, kein `jest`, keine `testing-library` in einer
`package.json`. `tsc --noEmit` ist grün — das beweist Typen, kein Verhalten.

Was das konkret bedeutet, zeigt Welle 4 (e): **beide** dort genannten Blocker
sind React-Fehler, und **beide** wären von einem einzigen Test gefallen, der
prüft, ob der Logout-Aufruf den Endpunkt trifft, den es gibt. Es ist kein
theoretisches Risiko — es ist die Fundstelle.

**Nicht das Ziel:** Coverage auf den drei Shells. Das wäre teuer und der Code
ist überwiegend Darstellung. **Das Ziel:** die Kette, an der Geld und
Berechtigung hängen — Logout, CSRF-Beschaffung im `client.ts`, die
Entscheidungs-Formulare mit Begründungspflicht, die Fehlerzustände (401/403/503).
Siehe W-E3.

**Abnahme:** ein Testläufer im CI-Job, und die zwei Blocker aus Welle 4 (e)
haben je eine Zusicherung, die ohne den Fix rot ist.

---

## Welle 6 — Die Design-System-Schuld

**Gemessen in `frontend/public`:** 2.015 Inline-`style="`-Attribute, 1.113
Hex-Farbwerte. Dazu aus `TEAM_UND_ROLLEN.md` (2026-08-14): 53,9 % des HTML ist
Inline-JavaScript, 55 von 77 Seiten ohne ausgelagerte Logik, vier Themes und
eine zweite Token-Sprache.

**Das verstößt gegen die eigene Regel**, und zwar gegen eine, die zweimal in
`CLAUDE.md` steht: „Keine hardcodierten Farbwerte auf
Workforce-/Enterprise-Seiten; Token aus dem Design-System nutzen." Eine Regel,
die 1.113-mal gebrochen wird, ist keine Regel mehr — sie ist ein Wunsch.

**Der Hebel ist nicht Schönheit, sondern Inline-JS.** ESLint deckt nur
`public/js/**` ab; was im `<script>`-Block einer HTML-Seite steht, prüft
niemand. Über die Hälfte der Kundenfläche liegt damit außerhalb jeder
statischen Prüfung. Wer hier aufräumt, gewinnt nicht Ästhetik, sondern
**Prüfbarkeit** — und nebenbei fallen die Farbwerte mit. Siehe W-E4.

---

## Welle 7 — Backend-Hygiene

Drei Zahlen, jede gegen eine Regel, die das Projekt sich selbst gegeben hat:

| Gemessen | Die eigene Regel |
|---|---|
| **41 von 82** Route-Dateien ohne `zod` | „Zod-Validation an Eingangsgrenzen" |
| **140** `pool.query` direkt in Routen | „Routen nur für HTTP/Validation; Business-Logik in `api/services/*`" |
| **41** handgesetzte `FOR UPDATE`, **0** Advisory Locks, **0** explizite Isolationsstufen | — (kein Verstoß, aber die Korrektheit unter Last hängt daran) |

Dazu die **Null-Politik** (offene Entscheidung **D-M2**): 42 Stellen
`if (req.orgId && …)` sind fail-open, 14 fail-closed, `timesheets.js:67` hat
eine eigene Legacy-Ausnahme. Der neue Code ist durchgehend fail-closed. Der
saubere Ort für eine Vereinheitlichung ist eine Middleware `requireOrgContext`,
die vor dem Handler mit 403 abbricht — nicht das Umschreiben von 80
Vergleichen; Vorbilder existieren (`suppliers.js:46`, `workforce.js:58`).

**Diese Welle ist absichtlich die vorletzte.** Sie berührt Produktionscode auf
breiter Fläche, und die Skalierungs-Regel dieses Projekts ist eindeutig:
„Reifes Repo = Verifikation, nicht Neubau." Ohne Welle 1 und 2 wäre jeder
Umbau hier ein Umbau ohne Netz. Siehe W-E5.

---

## Welle 8 — Bus-Faktor 1

**Das ist die Schwachstelle mit dem größten Hebel, und sie steht nicht im
Code.** 381 von 381 Commits von einer Person (`TEAM_UND_ROLLEN.md`, gemessen
am 2026-08-14). Ein Kopf kennt dieses System.

Am 2026-09-29 hatte das eine sehr konkrete Form: **253 Commits — rund ein Monat
Arbeit — lagen ungepusht auf genau einer Festplatte.** Kein Backup, keine
Kopie, und in der Cloud nicht erreichbar, weshalb dieser Plan gegen einen Stand
vom 21.08. geschrieben ist statt gegen den aktuellen.

Das ist kein Vorwurf, sondern eine Rechnung: ein Due-Diligence-Prüfer findet
das in zehn Minuten, und es drückt jeden Kaufpreis. Die Gegenmaßnahmen sind
billig und unspektakulär:

1. **Push-Disziplin.** Am Ende jeder Sitzung, ohne Ausnahme. Die
   Owner-Anweisung vom 2026-09-29 („aktuellen Stand immer sichern") ist genau
   das — sie muss nur gelten, auch wenn nichts fertig ist.
2. **Ein Onboarding-Pfad, der gemessen ist.** `docs/UEBERGABE.md` ist bereits
   außergewöhnlich gut. Die offene Frage ist nicht ihr Inhalt, sondern: wie
   lange braucht ein fremder Senior-Entwickler von `git clone` bis zum ersten
   grünen Lauf? Heute ist die ehrliche Antwort: **er kommt nicht bis dahin** —
   `npm ci` brach ab. Nach Welle 1 ist die Antwort messbar. Diese Zahl ist die
   Kennzahl dieser Welle.
3. **Die gitignored Arbeitsunterlagen.** `.agents/`, `.claude/CLAUDE_RECS.md`,
   `_TEMPCONNECT_*` und die Arbeitspläne unter `docs/launch/` existieren in
   keinem Klon. `CLAUDE.md` schreibt vier Dateien als Pflicht-Lesereihenfolge
   vor — **zwei davon gibt es auf einem frischen Klon nicht.** Eine
   Pflichtlektüre, die fehlt, ist eine Anweisung, die niemand ausführen kann.

---

## Offene Owner-Entscheidungen

> Diese Liste wird per `api/test/uebergabe.test.js` gegen `docs/UEBERGABE.md`
> abgeglichen. Wer hier eine Entscheidung ergänzt und die Übergabe vergisst,
> macht den Test rot.

- **W-E1** — **Die zwei Doku-Tests in der CI.** Sie prüfen gegen Pfade, die in
  einem frischen Baum nicht existieren (`.agents/`, `frontend/support-ops/`,
  ungetracktes `docs/launch/`). Eine CI ist immer ein frischer Baum. Drei Wege:
  **(a)** die Tests erkennen einen Baum ohne diese Pfade und prüfen dann nur,
  was prüfbar ist — kein stiller Skip, die Erkennung selbst wird zugesichert;
  **(b)** die Pfade werden getrackt (ändert, was im Release-Artefakt landet —
  `.claude/` gehört laut eigener Regel *nie* hinein); **(c)** die CI lässt diese
  zwei Dateien bewusst aus und das wird dokumentiert. *Empfehlung: (a)* — sie
  ist die einzige Variante, die den Wächter am Leben lässt. Aufwand 1–2 Stunden
  nach Entscheidung.

- **W-E2** — **`--test-force-exit` im zentralen Testaufruf.** Nach dem Schließen
  der offenen Handles: Flag entfernen, oder als Netz behalten? Behalten heißt,
  die Kürzung kann jederzeit zurückkommen, ohne dass es auffällt. Entfernen
  heißt, ein einzelner hängender Handle blockiert die ganze Suite — sichtbar,
  aber teuer. *Empfehlung: entfernen, sobald der Vollauf ohne Flag durchläuft*
  — ein Lauf, der hängt, ist ehrlicher als einer, der kürzt. Berührt
  `api/scripts/run-tests.js`, also jeden Lauf des Projekts.

- **W-E3** — **Testläufer für die drei React-Konsolen.** `vitest` (nah an Vite,
  das hier ohnehin baut) oder `node:test` mit jsdom (keine neue Abhängigkeit,
  aber mehr Eigenbau)? Die Entscheidung trägt dauerhaft, weil sie eine
  Werkzeugkette einführt, die gepflegt werden muss. *Empfehlung: vitest* — das
  Projekt baut mit Vite, und die Alternative kostet mehr Eigenbau als sie
  Abhängigkeit spart. Gegenargument, das der Owner kennen soll: es ist die
  erste Test-Werkzeugkette neben `node:test`, also eine zweite Wahrheit über
  „grün".

- **W-E4** — **Umfang der Design-System-Bereinigung.** 2.015 Inline-Styles und
  1.113 Hex-Werte auf einmal, oder nur die Seiten, die ein Kunde im
  Verkaufsgespräch sieht? *Empfehlung: nur die Kundenfläche, und zwar
  Inline-JS zuerst* — der Gewinn ist Prüfbarkeit, nicht Ästhetik, und die
  Farbwerte fallen dabei mit. Vollständigkeit hier wäre teuer und ohne
  messbaren Nutzen.

- **W-E8** — **VMS-/ERP-Anbindung: welche Richtung zuerst?** *Nach Recherche
  am 2026-09-30 korrigiert:* ein Partnerprogramm ist bei **keinem** der vier
  Anbieter technische Voraussetzung. Personio und zvoove Recruit gibt der Kunde
  selbst frei; SAP Fieldglass der Instanzbesitzer plus Freischaltung durch den
  SAP-Support; Beeline über ein kostenpflichtiges Lieferanten-Abo (Beeline
  Supplier Network, 2.500–30.000 $/Jahr) **der Zeitarbeitsfirma**. **Die eine
  Ausnahme ist zvoove PDL**: die dokumentierten Anbindungen laufen alle über
  zvooves Schnittstellenpartner — dort lohnt die Partnerschaft, weil dort die
  eigenen Kunden sitzen. *Empfehlung:* zvoove-Anfrage sofort (Owner),
  anbieterneutraler Bedarfs-Eingang als erster Code (nach K1), Personio bei
  Bedarf, Fieldglass/Beeline erst mit einem Großkunden. Die Lieferantenfrage
  ist geklärt (Owner, 2026-09-30): reine Vermittlungsplattform, keine AÜG,
  keine VMS-Abos — Lieferant im VMS ist immer die Zeitarbeitsfirma. Mit Quellen:
  `docs/INTEGRATIONS.md`, „Zugang je Anbieter“.

- **W-E5** — **`requireOrgContext` als Middleware (Vereinheitlichung der
  Null-Politik, Fortsetzung von D-M2).** Die 42 fail-open-Stellen auf einmal
  hinter eine Middleware ziehen, oder Datei für Datei mit dem Wächter im
  Rücken? *Empfehlung: Middleware, aber erst nach Welle 1 und 2* — der Umbau
  berührt 80 Vergleiche in 18 Route-Dateien, und ohne stabile Testzahl ist
  nicht belegbar, dass dabei nichts verloren ging.

---

## Das Register der Schwachstellen

Alle Punkte dieses Plans in einer Tabelle, jeder mit Beleg und Welle. **Das ist
die Liste, die abgearbeitet wird** — nichts steht hier ohne Quelle.

| # | Schwachstelle | Gemessen | Welle |
|---|---|---|---|
| 1 | CI hat nie grün gelaufen (62/62 `startup_failure`) | GitHub-API | 1 |
| 2 | Kontosperre wegen Abrechnung | GitHub-Joblog | 1 *(Owner)* |
| 3 | `npm ci` bricht ab, Lockdatei nicht synchron | ✅ P0.8, behoben 29.09. | 1 |
| 4 | Kein Produktions-Image baubar (Dockerfile-Pfad) | ✅ P0.8, behoben 29.09. | 1 |
| 5 | CI installiert ohne `--legacy-peer-deps` | ✅ P0.9, behoben 29.09. | 1 |
| 6 | Secret-Scan verlangte `deploy/.env` | ✅ P0.10, behoben 29.09. | 1 |
| 7 | 15 Lint-Fehler, davon 2 echte (`no-undef`) | P0.12, `npm run lint` | 1 |
| 8 | Kein CI-Job baut das Image | `.github/workflows/ci.yml` | 1 |
| 9 | Testzahl schwankt: 9054 / 9183 / 9190 | P0.11, drei Läufe | 2 |
| 10 | Zwei Doku-Tests strukturell rot in jeder CI | P0.13 | 1 *(W-E1)* |
| 11 | Migration 117 existiert nicht (28 Tabellen verweisen darauf) | P1-16, `ls sql/migrations` | 3 |
| 12 | 42 Policies auf 178 Tabellen | `grep CREATE POLICY` | 3 |
| 13 | `rate_cards`, `approval_requests`: `rls=false` | laufende DB | 3 |
| 14 | 135 Audit-Zeilen mit fremder `org_id` | Abschnitt 8.1.1 | 3 |
| 15 | 1796 von 2740 Audit-Zeilen ohne `org_id` | laufende DB | 3 *(D-M3)* |
| 16 | Redis-Ausfall ist still, kein Alarm | `api/workers/index.js:34-37` | 4 |
| 17 | Restore-Probe nie gelaufen | P1.4 | 4 *(Owner)* |
| 18 | Secret-Rotation offen, Key in Git-Historie | P0.4 | 4 *(Owner)* |
| 19 | Stripe-Schlüssel fehlen → kein Geldeingang möglich | P1-22 | 4 *(Owner)* |
| 20 | OCC-Logout meldet niemanden ab | `Topbar.tsx:18` | 4 + 5 |
| 21 | `MFA_ENFORCE=true` sperrt den Eigentümer aus | 0 Treffer für `428` im OCC-Frontend | 4 + 5 |
| 22 | 17.986 Zeilen React, 0 Unit-Tests | `find frontend/src -name "*.test.*"` | 5 *(W-E3)* |
| 23 | 2.015 Inline-Styles, 1.113 Hex-Werte | `grep` in `frontend/public` | 6 *(W-E4)* |
| 24 | 53,9 % des HTML ist Inline-JS, von ESLint nicht erfasst | `TEAM_UND_ROLLEN.md` | 6 |
| 25 | 41 von 82 Route-Dateien ohne Zod | `grep -rl zod api/routes` | 7 |
| 26 | 140 `pool.query` direkt in Routen | `TEAM_UND_ROLLEN.md` | 7 |
| 27 | Null-Politik dreigeteilt (42 fail-open) | D-M2 | 7 *(W-E5)* |
| 28 | Bus-Faktor 1 · 253 Commits auf einer Platte | `git`, 29.09. | 8 |
| 29 | Zwei von vier Pflicht-Lesedateien fehlen im Klon | `CLAUDE.md` vs. frischer Klon | 8 |
| 30 | Marktgang bei 0 % — kein zahlender Kunde | — | *kein Code* |

---

## Abgleich mit den Owner-Abschnitten 1–26

*Ergänzt am 2026-09-29, nachdem `fix_neu … vorherige Wellen.docx` verfügbar war
(363 Absätze, 6231 Wörter). Der Status jeder Zeile ist **gegen den Code
gemessen**, nicht aus dem Dokument übernommen — dort steht der Stand vom
19.06./17.07./23.07./06.08.2026.*

Die Abschnitte des Owners sind die **Produktachse**. Die Wellen 1–8 dieses
Plans sind die **Tragfähigkeitsachse**. Sie sind nicht dasselbe und ersetzen
sich nicht: ein Abschnitt kann fertig gebaut und trotzdem unbelegt sein.

| Abschnitt | Thema | Gemessener Stand | Achse |
|---|---|---|---|
| 1 | Deals zurücknehmen, Strafen, 3-Schritt-Abschluss | gebaut (P8 Deal-Verbindlichkeit, Mig 164/165) | — |
| 2 | Bounty-Struktur | gebaut, 48 Code-Dateien (P9) | — |
| 3 | Merkliste | gebaut, 7 Code-Dateien (P9) | — |
| 4 | Abo-Feature-Aktivierung / Preisrahmen | gebaut, Entitlement-Kette steht | Welle 7 |
| 5 | CSV-Import | **fertig** (Spur D1–D6) | — |
| 6 | Live-Belegschaft | **fertig** (Spur E1–E5, Mig 177–179) | — |
| 7 | Systemzeit | **fertig** (Spur F1–F3, Wächter Grundlinie 39) | — |
| **8.1.1** | **Audit-Log hart trennen** | **offen — aktiver Sicherheitsbefund**: 135 Zeilen mit fremder `org_id` | **Welle 3** |
| 8.1.2 | Aktive Sitzungen im Audit | offen | Welle 3 |
| 8.2 | Ersatz-Zuweisung vereinfachen | offen | — |
| ~~9~~ | KI-Suchleiste | **bewusst ausgelassen** — bleibt ausgelassen | — |
| 10 | Support-Weg Kunde → TempConnect | offen | — |
| ~~10b~~ | Support Kunde ↔ Kunde | **verworfen** — bleibt verworfen | — |
| 11 | Multi-Tenancy, RBAC, Standorte | Anwendungsebene stark (H2), **DB-Ebene fehlt** | **Welle 3** |
| 12 | Bounty-Verwaltung ins Staff CC | offen | — |
| 13 | Monatsplanung für Mitarbeiter | **0 Code-Dateien** — nicht gebaut; enthält einen offenen Bug („Fehler beim Laden des Personals") | — |
| 14 | Live-Belegschaft ausbauen | ausgeführt → prüfen | — |
| 15 | Sperrliste | gebaut (6 Dateien); Staff-CC-Verwaltung offen | — |
| 16 | Integrationen zu Bestandssystemen | Registry steht, **Konnektoren nicht**; Adapter nur Slack/Teams; **Fieldglass und Beeline 0** | **W-E8** |
| **17** | **Owner Control Center: ausbauen oder verwerfen** | **Frage nie beantwortet — 7.902 Zeilen gebaut** | **W-E6** |
| 18 | Support Center ausbauen | offen | — |
| 19 | Repo-Hygiene, Legacy, `.env` rotieren | offen | Welle 1 + 8 |
| 20 | Angebote im Marktplatz ausbauen | in Arbeit | — |
| **21** | **LIVE: Notar, Gewerbe, Konto, Stripe, Domain, Hetzner, TLS, Mail, Marketing** | **offen — reine Owner-Arbeit** | **Welle 4 + Punkt 30** |
| 22 | Gesamt-Flow der Angebote | in Arbeit; Arbeitszeugnis-PDF **0 Dateien** | — |
| 23 | Tarifwahl im Registrationsmodal, Firmenverifikation | offen | — |
| 24 | Profil-Einsicht beidseitig | offen | — |
| **25** | **Demo-Screen bei leerer Live-Belegschaft und bei 500/401** | offen — **widerspricht einer eigenen Regel** | **W-E7** |
| 26 | Umkreisverfügbarkeit (8 Dateien), Lohnvorschau (**0**), Freitext→Checkboxen | teilweise | — |

### Drei Funde aus diesem Abgleich

**(1) Abschnitt 17 ist die teuerste unbeantwortete Frage des Projekts.** Der
Owner fragt: „Owner Control Center ausbauen oder verwerfen … wenn Admin auch im
Enterprise-Hub arbeiten kann, soll das OCC weg oder stillgelegt werden."
Gemessen liegen dort heute **7.902 Zeilen** (14 Router mit 3.200 Zeilen,
21 Frontend-Dateien mit 4.702 Zeilen), `CLAUDE.md` führt es mit „11/11 Module
real implementiert, 90 %", und H2 hat für das OCC eine **eigene Wächterschicht
(B3)** gebaut, weil die Fläche keine Platzhalter-Route hat. Dazu zwei offene
Blocker (OCC-Logout, `MFA_ENFORCE`).

> **Die Frage wurde gestellt und nie beantwortet — und in der Zwischenzeit
> wurde weitergebaut.** Das ist kein Fehler im Code. Es ist der Beweis, dass
> eine unbeantwortete Owner-Frage teurer ist als eine falsch beantwortete: eine
> falsche Antwort kostet einen Revert, eine fehlende kostet unbegrenzt weiter.
> Deshalb steht diese Entscheidung als **W-E6** und gehört vor jede weitere
> OCC-Zeile.

**(2) Abschnitt 25 widerspricht einer nicht verhandelbaren Regel.** Gewünscht
ist ein Demo-Screen, der bei leerer Live-Belegschaft **und bei 500/401** ein
Vorschaubild mit Demo-Daten zeigt. `CLAUDE.md` Zeile 255 verbietet das
ausdrücklich: „Kein Fake-Data / Mock-KPIs in Produktions-UI (auch nicht als
Platzhalter)." Beides ist begründet — der Wunsch will einen leeren Bildschirm
vermeiden, die Regel will verhindern, dass ein Kunde erfundene Zahlen für echte
hält. Auflösbar, aber nicht nebenbei: siehe **W-E7**.

**(3) Zwei Abschnitte sind ausgeschlossen und müssen es bleiben.** Abschnitt 9
(KI-Suchleiste) ist „bewusst ausgelassen", Abschnitt 10b (Support Kunde ↔ Kunde)
verworfen. Beide sind in `docs/FLAECHEN.md` und den Flächen-Tests relevant —
wer sie später doch baut, muss die Entscheidung ausdrücklich umdrehen, nicht
vergessen.

### Was der Abgleich für die Reihenfolge bedeutet

**Achtzehn Abschnitte sind offen.** Dazu acht Wellen. Das ist mehr, als vor dem
ersten Kunden gehen kann — und die Auswahl ist deshalb der eigentliche Wert
dieses Plans:

| Rang | Was | Warum genau das |
|---|---|---|
| 1 | **Welle 1** (CI grün) | 1 Tag Arbeit plus die Kontosperre. Danach ist jede weitere Aussage belegt statt wahrscheinlich. |
| 2 | **Abschnitt 8.1.1** | der einzige Punkt mit einem laufenden Datenabfluss. Vor jedem Kunden. |
| 3 | **Abschnitt 21** *(parallel, Owner)* | Notar, Gewerbe, Konto, Stripe, Domain. Ohne das kann die Plattform kein Geld annehmen — es ist der kritische Pfad, und er läuft unabhängig vom Code. |
| 4 | **W-E6** (Abschnitt 17) | 15 Minuten Entscheidung, die eine 7.902-Zeilen-Fläche entweder rechtfertigt oder stilllegt. |
| 5 | **Welle 2 + 3** | stabile Testzahl, dann der DB-Backstop (Mig 117) — zusammen mit Abschnitt 11. |
| 6 | **Abschnitt 16** | zvoove und SAP Fieldglass sind der stärkste Verkaufshebel der Liste: „niemand muss umbauen". SAP Fieldglass hat heute **null** Code-Dateien. |
| 7 | alles Übrige | nach Verkaufswirkung, nicht nach Reihenfolge im Dokument. |

**Was dieser Rang bewusst nicht enthält:** die Abschnitte 13, 22 (Arbeitszeugnis),
26 (Lohnvorschau) — alle drei mit null Code-Dateien, alle drei echte
Produktlücken, keine davon ein Hindernis für den ersten Vertrag. Sie sind
Ausbau, nicht Blocker, und stehen deshalb hinter Rang 6.

*Eingetragen am 2026-09-30, damit sie nicht in diesem Plan versanden:*
Monatsplanung als **A.4**, Arbeitszeugnis-PDF als **B.4**, Lohnvorschau als
**B.5**, die beiden Integrationsrichtungen als **C.5** und **C.6** in
`docs/PILOT_GO_LIVE_TODOS.md` (Abschnitt Verbesserungsvorschläge). Der vom
Owner gemeldete Ladefehler aus Abschnitt 13 steht dort als **P1-23** —
ausdrücklich als *gemeldet, nicht reproduziert*, weil eine Meldung ohne
Reproduktion schwächer ist als eine mit, aber besser als keine.

## Was dieser Plan nicht leistet

**Er ersetzt nicht das Register.** `docs/PILOT_GO_LIVE_TODOS.md` bleibt die
Blocker-Liste mit P0/P1/P2; dieser Plan ist die *Reihenfolge* und der
*Maßstab*. Wo beide dasselbe nennen, gilt das Register als Wahrheit über den
Status und dieser Plan als Wahrheit über die Einordnung.

**Er nennt Punkt 30 und löst ihn nicht.** Das ist Absicht. Der Marktgang ist
die einzige Schwachstelle auf dieser Liste, die durch keine Codezeile besser
wird — und gleichzeitig die einzige, deren Behebung den Wert der übrigen 29
vervielfacht. Wer diesen Plan von oben nach unten abarbeitet und den Marktgang
nicht parallel anfängt, hat am Ende ein makelloses Produkt ohne Kunden.

**Er ist gegen einen veralteten Stand geschrieben.** Siehe die Vorbemerkung:
`main`/`75016b6`, während der Arbeitsstand 253 Commits weiter ist. Der erste
Schritt jeder Welle ist deshalb derselbe: **den Punkt gegen den aktuellen Stand
gegenprüfen, bevor er gebaut wird.** Ein Befund, den es nicht mehr gibt, wird
im Register gestrichen — mit Beleg, nicht mit Vermutung.
