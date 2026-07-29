# Audit-Backlog — niedrigwertige / gated Restpunkte

> Aus der Audit-Remediation (2026-06-28, siehe [AUDIT_REMEDIATION_2026-06-28.md](AUDIT_REMEDIATION_2026-06-28.md)).
> Der **substanzielle** Teil ist erledigt (~98 %). Hier liegen die bewusst zurückgestellten Punkte:
> niedriger Wert, gated, non-deterministisch oder „can of worms". **Abarbeiten, sobald es sich lohnt** —
> jeder Eintrag hat einen konkreten Trigger.
>
> **Diese Datei ist im Session-Memory verankert** (`audit-backlog` → MEMORY.md) und wird bei passender
> Gelegenheit geprüft. Nicht löschen, bis alle Einträge erledigt/verworfen sind.

---

## B-1 · Untrack der Build-Bundles ✅ **ERLEDIGT 2026-07-26**
**Die Sperre war ein fehlender Nachweis — der ist jetzt geführt, nicht argumentiert:**

`docker compose -f docker-compose.prod.yml run --rm frontend-build` ausgeführt — genau der
Dienst, den der Produktions-Stack vor nginx laufen lässt (nginx wartet via
`service_completed_successfully`). Ergebnis: **alle 31 Bundles neu erzeugt, dabei 27
getrackte Dateien gelöscht.** `vite.config.staff.ts` setzt `emptyOutDir: true` — das
Zielverzeichnis wird bei jedem Deploy vollständig ersetzt.

Damit ist die Frage beantwortet, die den Punkt gesperrt hielt: die getrackten Kopien können
gar nicht das sein, was ausgeliefert wird. **Jeder Deploy löscht sie.** Sie erzeugten nur
Diff-Lärm und Merge-Konflikte — das befürchtete Prod-404 kann nicht eintreten.

Die Kette wurde vollständig geprüft, nicht nur der Build-Schritt:
- Das Release-Artefakt ist ein `git archive` der Quellen; `frontend/src`,
  `package.json`, `vite.config.staff.ts` und `staff.html` sind darin — der Deploy-Build hat
  alles, was er braucht.
- Die CI-Artefaktprüfung verlangt **keine** Datei unterhalb `frontend/public/staff`.
- Unter `frontend/public/staff` liegt nichts Handgeschriebenes: alle 30 getrackten Dateien
  sind Build-Ergebnisse. Die drei, die den Build „überlebten", hatten schlicht denselben
  Content-Hash bzw. sind die Einstiegs-HTML.

**Gleiches Muster mitgenommen:** `frontend/support-ops/` ist das lokale Ergebnis von
`build:soc` und wird in Produktion nicht verwendet — der Prod-Stack baut es nicht einmal
(`command` = `build:occ` + `build:scc`) und mountet stattdessen `./support-ops-dist`.

**Ausdrücklich nicht angefasst:** `support-ops-dist/index.html`. Das wird bewusst vorgebaut
ausgeliefert und ist Pflichtbestandteil des Release-Artefakts. Die bestehende Ausnahme in
`.gitignore` bleibt — und steht dort jetzt mit Begründung, damit sie niemand für einen
Fehler hält und „aufräumt".

**Verifiziert gegen den laufenden Stack:** `/staff/`, `/support-ops/` und
`/public/enterprise.html` antworten mit 200. `git status` ist von diesem Rauschen befreit.
**Rollback:** `git revert <commit>` stellt die Bundles sofort wieder her.

---

## B-2 · F-5 · Flaky Test `me.route.coverage.test.js` 🟡
**Symptom:** Suite-Anzahl schwankt 7240↔7241; sporadischer **Datei-Level-Fail** (~1 von 4 Läufen), KEIN Assertion-Fail.
**Diagnose (Vorsprung):** Es ist eine **unhandled rejection** (der +1 ist der synthetische „test failed"-Eintrag auf Datei-Ebene). Prime-Verdacht: Test **Zeile ~660** „409 PILOT_NOT_ELIGIBLE…" — er konstruiert einen `taggedPool` mit `match: () => true` (**ALLE** Queries werfen). Der `/me/plan`-INDIVIDUELL-Handler (`routes/me.js:378-394`) fängt `activatePilotForOrganization`-Fehler sauber ab (→409), aber ein **service-interner fire-and-forget** (vermutlich Audit/Dispatch in `pilotPolicyService.activatePilotForOrganization`) rejected unter dem all-werfenden Mock unbehandelt → surft zeitabhängig als unhandled rejection.
**Fix-Ansatz (wenn rot gefangen):** (a) den `taggedPool` in Test 660 **scopen** (nur die Pilot-Aktivierungs-Query werfen lassen, nicht membership/audit), ODER (b) den service-internen fire-and-forget in `pilotPolicyService` mit `.catch(swallow(...))` absichern (echte, wenn auch minimale Härtung), ODER (c) im Test ein `process.on("unhandledRejection")` instrumentieren, um die exakte Quelle zu lokalisieren.
**Verifikation:** `me.route.coverage.test.js` 20×30 in Schleife laufen → 0 Fail.
**Wert:** mittel (grüne-Suite-Glaubwürdigkeit), **kein Prod-Bug** (nur unter künstlichem all-werfenden Mock).

**Untersuchung 2026-07-26 (Zwischenstand, Verdacht widerlegt):** Der Flake trat an diesem Tag
zweimal im vollen Suite-Lauf auf (~1900 Suiten). Gezielte Reproduktion ist **nicht** gelungen:
6 isolierte Läufe grün, mehrere Kombinationsläufe (me.route + subscriptionLifecycle +
qaHardening + hubVisibility) grün. Eine erste scheinbare Reproduktion (`fail 4`, Datei bricht
nach ~110 ms ab) war ein **Artefakt der eigenen Instrumentierung** — ein `--import`-Pfad in
Git-Bash-Schreibweise, den Node unter Windows nicht auflösen kann; jede Testdatei starb dann
sofort. Nicht als Beleg werten.

Der dokumentierte Prime-Verdacht ist damit **unwahrscheinlich**: `pilotPolicyService` enthält
gar keinen fire-and-forget — alle asynchronen Aufrufe dort sind `await`ed (geprüft am Code,
nicht am Gedächtnis). Wer hier weitermacht, sollte bei (c) ansetzen: `unhandledRejection`
**im vollen Suite-Lauf** instrumentieren (nicht in Teilmengen — nur dort tritt es auf), mit
einem Pfad in Node-tauglicher Schreibweise.

**Auswirkung bleibt unverändert:** kein Produktionsfehler, aber jeder Treffer kostet einen
kompletten Suite-Lauf zur Gegenprüfung.

**Untersuchung 2026-07-26 (Ansatz (c) umgesetzt, Flake nicht gefangen):** Die Sonde
`api/scripts/unhandled-rejection-probe.mjs` hängt sich per `--import` an **jeden**
Testprozess und protokolliert Quelle und Stack jeder unbehandelten Rejection:
```bash
NODE_OPTIONS="--import file:///…/api/scripts/unhandled-rejection-probe.mjs" \
  node scripts/run-tests.js
```
Der so instrumentierte volle Lauf war **grün (7458 Tests, 0 Fehler) und ohne eine einzige
Rejection** — der Flake trat in diesem Lauf nicht auf.

**Untersuchung 2026-07-26 (2) — Sonde fest verdrahtet.** Der Flake trat an diesem Tag erneut
auf: ein voller Lauf meldete `me.route.coverage.test.js` als **Datei-Level-Fail**, während
die Datei isoliert **65/65 grün** war. Der unmittelbar folgende instrumentierte Lauf war
wieder grün, ohne Rejection — der Fehler ist also weiterhin nicht auf Zuruf reproduzierbar.

Genau das ist das eigentliche Problem: **wer die Sonde erst anhängt, wenn es rot war, hat den
Lauf schon verloren, in dem es passiert ist.** Deshalb hängt sie jetzt **standardmäßig** an
jedem Lauf über `api/scripts/run-tests.js` (per `NODE_OPTIONS`, weil `node:test` pro Testdatei
einen Kindprozess startet — nur über die Umgebung erreicht die Sonde auch diese). Sie
installiert nur Ereignis-Handler und kostet nichts, solange nichts passiert. Abschalten mit
`TC_TEST_PROBE=0`.

**Gegenprobe, damit das kein Papiertiger ist:** eine absichtlich erzeugte unbehandelte
Rejection wurde über den offiziellen Runner gefangen und mit Prozessnamen, Meldung und Stack
protokolliert. Nebenbefund: eine Rejection ohne nachfolgendes `await` im selben Test wird
unter `--test-force-exit` nicht mehr sichtbar — wer die Sonde prüft, muss dem Prozess einen
Tick Zeit lassen.

**Nächster Schritt:** nichts tun außer weiterarbeiten. Beim nächsten roten Lauf steht die
Quelle im Protokoll. Nicht weiter blind suchen.

---

## B-3 · docs-consistency-Test (CLAUDE.md §0.12) ✅ **ERLEDIGT 2026-07-26**
**Die Sorge „can of worms" traf nicht zu.** Gemessen statt geschätzt: 250 Markdown-Dateien,
188 relative Links — davon **2 tot**. Beide waren echte Fehler und in einer Minute behoben
(`docs/README.md` verwies auf `api/docs/…` statt `../api/docs/…`; die Zieldateien gab es
längst). Für tote Links braucht es damit **keine Ausnahmeliste** — sie sind ab jetzt
kompromisslos rot.

**Was der Wächter prüft** (`api/test/docsConsistency.test.js`, 5 Tests):
1. **Tote Links — strikt.** Jeder relative Markdown-Link muss auf eine existierende Datei
   zeigen. Kein Bestand, keine Ausnahmen.
2. **Verwaiste Dokumente — Ratsche.** Eine Datei unter `docs/`, auf die keine andere
   Markdown-Datei verweist, findet niemand mehr; sie veraltet unbemerkt und widerspricht
   später dem, was gilt. 177 davon gab es. Alle auf einen Schlag zu verlinken wäre
   Beschäftigung gewesen, also eine Ratsche gegen
   `docs/.docs-consistency-baseline.json`: **neue** Verwaiste sind rot, und Einträge, die
   inzwischen verlinkt sind, **müssen** gestrichen werden — sonst verrottet die Liste und
   die Ratsche zieht nie an. Die Zahl kann damit nur sinken.
3. Ein Test stellt sicher, dass überhaupt Dokumente gefunden werden — ein Wächter, der wegen
   eines Pfadfehlers nichts sieht, wirkt sonst grün und prüft nichts (CLAUDE.md §0.9).

**Gegenprobe, damit er nicht bloß Dekoration ist:** Alle drei Fehlerrichtungen wurden
absichtlich ausgelöst und gingen rot — toter Link, neue verwaiste Datei, verrotteter
Bestandseintrag. Jede Meldung nennt die betroffene Datei im Klartext.

**Die Ratsche hat sofort angezogen: 177 → 156.** 21 operativ tragende Dokumente waren
schlicht in keinem Index und damit unauffindbar — Betriebs- und Notfall-Runbooks,
Architektur, Marktstart-Plan, Pilot-Unterlagen, Support-Ops, AVV-Vorlage. Sie stehen jetzt
gruppiert in `docs/README.md`. Nicht verlinkt wurde `docs/launch/**`: das ist die laufende,
noch nicht committete Arbeit des Owners — ein Link darauf würde den Test in jedem anderen
Arbeitsverzeichnis rot färben.

**Was bleibt:** 156 unverlinkte Dokumente. Kein Blocker, sondern eine Liste, die bei jedem
Anfassen kleiner wird. Wer ein Dokument bewusst unverlinkt lassen will, trägt es dort ein —
mit Begründung im Commit.

---

## B-4 · Doku-Konsolidierung ✅ **ERLEDIGT 2026-07-26** *(Ablage bewusst offen gelassen)*

**Der eigentliche Schaden waren nicht neun Dateien am falschen Ort, sondern Dokumente, die
sich widersprechen.** Genau die sind aufgelöst — und es war eines mehr, als der Eintrag wusste.

**Go-Live-Listen → eine Wahrheit.** `GO-LIVE.md` und `docs/GO_LIVE_FINAL.md` waren zu 98 %
deckungsgleich (26 abweichende Zeilen von 176), behaupteten aber beide von sich, maßgeblich
zu sein („die einzige" vs. „die versionierte"). Zwei Dokumente, die jeweils sagen, sie seien
die Referenz, sind schlimmer als ein fehlendes: man hakt die falsche Liste ab und hält den
Start für abgesichert. `docs/GO_LIVE_FINAL.md` ist die SSoT — sie ist die inhaltlich
bessere (Enterprise-Abnahmegate, kanonischer CI-Artefaktpfad, konkrete Backup-/Restore-
Skripte), und `MARKTSTART-CHECKLISTE.md` verwies längst auf sie. Die vier Verweise, die es
nur in `GO-LIVE.md` gab, wurden **vorher übernommen**; erst danach wurde die Datei zum
Wegweiser. Damit ist auch **Remediation D-4** erledigt.

**Zusätzlich gefunden: ein zweites Doppel, das gefährlicher war.** `RELEASE.md` (Wurzel) und
`docs/RELEASE_RUNBOOK.md` — 394 vs. 397 Zeilen, fast identisch, mit **einer** inhaltlichen
Abweichung: dem Release-Artefakt. Die eine Datei sagte „CI-Job `release-artifact`", die
andere „lokal via `scripts/release-package.sh`". Zwei Runbooks, denen jemand während eines
Produktionsdeployments folgt, und beide galten formal. Aufgelöst wurde das nicht nach
Gefühl: `docs/GO_LIVE_FINAL.md` benennt den CI-Job ausdrücklich als kanonisch. Der Abschnitt
wanderte nach `docs/RELEASE_RUNBOOK.md`, der lokale Bau steht dort weiter — jetzt klar als
**Rückfallweg**. Die drei Dokumente, die auf `../RELEASE.md` verwiesen, zeigen jetzt auf den
Inhalt statt auf den Wegweiser.

**`DEPLOYMENT.md` ×2 — kein Duplikat, sondern eine Namenskollision.** 464 abweichende Zeilen:
die Wurzel-Datei ist der *operative* Produktionspfad, `docs/DEPLOYMENT.md` der erklärende
Leitfaden inklusive lokaler Umgebung und Due-Diligence-Kontext. Zusammenführen wäre falsch
gewesen — beide haben einen Zweck und einen Leser. Stattdessen trägt jetzt jede oben einen
Hinweis, welche man vor sich hat und wo die andere liegt.

**`ROADMAP.md` behauptete Gegenwart.** Kopfzeile: „Aktueller Stand: ~90 % fertig · Ziel:
Launch in 2-3 Wochen" — zuletzt geändert am 2026-06-01, die Frist also seit sieben Wochen
abgelaufen. Ein Dokument, das einen historischen Planungsstand als „aktuell" ausgibt, ist
dieselbe Falle wie zwei Checklisten. Jetzt datiert, mit Verweis auf die Stellen, die den
echten Stand führen. (`NAECHSTE-SCHRITTE.md`, `VOR-GELDFLUSS.md`, `MARKTSTART-CHECKLISTE.md`
trugen bereits Veraltet-Hinweise; `PHASE1-STATUS.md` datiert sich im ersten Satz selbst.)

**Bewusst NICHT gemacht: die neun Root-`.md` nach `docs/` verschieben.** Zwei Gründe. Erstens
ist es reine Ablage — die inhaltliche Verwirrung ist oben behoben, ein Ortswechsel ändert
daran nichts. Zweitens baut der Owner parallel `docs/launch/` (A–H) als neue
Launch-Struktur auf; Dateien darunter zu verschieben, während dort gerade sortiert wird,
erzeugt Kollisionen statt Ordnung. **Sinnvoll, wenn `docs/launch/` steht** — dann in einem
Zug und mit dem Doku-Wächter aus B-3 als Netz, der jeden gebrochenen Link sofort rot färbt.
Die Annahme des ursprünglichen Eintrags, „6 der Root-`.md` sind aus `docs/` verlinkt", trifft
übrigens nicht mehr zu: von den genannten liegt nur noch `DEPLOYMENT.md` in der Wurzel.

---

## B-5 · Enterprise-Politur — **S-3 und E-2 erledigt 2026-07-26**, Rest bewusst offen

### S-3 · Audit-Verantwortlichkeit ✅ **ERLEDIGT**
CLAUDE.md (Produktionspfeiler 5) fordert `details.responsible_actor_user_id` für **jede**
mutierende Aktion. Gezählt: **7 von 319** `res.locals.audit`-Markierungen setzten es, dazu
**98 direkte `writeAudit()`-Aufrufe**, die an der Middleware vorbeigehen. Eine Regel, die an
rund 400 Stellen einzeln befolgt werden muss, wird nicht befolgt — sie wird vergessen,
sobald jemand die nächste Route schreibt.

Deshalb sitzt sie jetzt in `writeAudit()` selbst, dem einen Punkt, durch den alles läuft:
- **Voreinstellung ist der Handelnde.** Ohne Angabe wird `actor_id` eingetragen.
- **Der Aufrufer gewinnt.** Setzt eine Route das Feld selbst, bleibt ihr Wert stehen — das
  ist der Fall, in dem Handelnder und Verantwortlicher auseinanderfallen (Support handelt im
  Auftrag eines Kunden).
- **Systemvorgänge tragen ausdrücklich `null`.** Ein *fehlendes* Feld wäre mehrdeutig
  („Cron-Lauf" oder „vergessen?"); ein ausdrückliches `null` ist eindeutig und passt zu
  `actor_id`, das dann ebenfalls leer ist.
- Nicht-objektförmige `details` (Array, Zeichenkette) werden unverändert durchgereicht statt
  in ein Objekt gezwängt — lieber kein Feld als stiller Datenverlust.

9 Tests in `api/test/auditResponsibleActor.test.js`, darunter beide Randfälle.

### E-2 · Soft-Fail-Audit ✅ **GEMESSEN — kein Handlungsbedarf**
Der Eintrag nannte „48 Routen mit potenziellem 500". Diese Zahl war eine Schätzung, keine
Messung. Nachgemessen wurde das Muster, das bei leeren Daten tatsächlich abstürzt —
`X.rows[0].feld` ohne Absicherung: **42 Fundstellen, 23 nachweislich abgesichert, 19
Kandidaten.** Die 19 wurden einzeln gegengelesen: **alle sind Fehlalarme** des
Suchfensters — die Absicherung steht jeweils weiter oben, etwa
`if (!u.rows[0]) return null;` (`userService.js:183`) oder `if (om.rows[0]) { … }`
(`userService.js:232`), das den gesamten Block umschließt.

**Ergebnis: die Soft-Fail-Disziplin ist im Bestand bereits durchgehalten.** Ein Audit über 48
Routen ist nicht gerechtfertigt. Der Punkt wird geschlossen, damit er nicht auf Verdacht
wieder geöffnet wird; der Auslöser für ein erneutes Hinsehen bleibt derselbe: **wenn ein 500
bei leeren Daten real auftritt.**

### S-2 · Logger-PII — **gemessen, Entscheidung beim Owner**
Die Redaktionsliste in `config/index.js` deckt Zugangsdaten vollständig ab (Authorization-
und Cookie-Header, `*.password`, `*.token`, `*.secret`, `*.apiKey`, `*.creditCard`, `*.ssn`).
**`email` fehlt** — betroffen sind aber nur **zwei** Logaufrufe.

Das ist eine Abwägung, keine Nachlässigkeit: bei `routes/demo.js:50`
(„Demo-User nicht gefunden") ist die Adresse *der* diagnostische Wert — es gibt keinen
Nutzer und damit keine ID, auf die man ausweichen könnte. Redigiert man sie, verliert der
Logeintrag seinen Zweck.

**Owner-Entscheid, eine Zeile:** `"*.email"` in `config/index.js` zu `redact.paths`
ergänzen — Datenschutz vor Diagnostizierbarkeit — oder bewusst darauf verzichten und die
zwei Stellen als vertretbar dokumentieren. **Trigger:** vor dem DSGVO-/Security-Review.

### E-1 / E-3 — unverändert auslöserbasiert
- **E-1:** `createServiceLogger(name)` breiter ausrollen (derzeit 7/153 Services). Additiv,
  ohne Eigenwert als Sammelaktion. **Beim nächsten Anfassen eines Service mitnehmen.**
- **E-3:** Nicht-Service-Module aus `api/services/` umsortieren. Rein organisatorisch, ändert
  kein Verhalten und erzeugt eine breite Diff-Fläche. **Nur bei einem größeren
  Struktur-Refactor.**

---

## Zugang 2026-07-25 — aus dem Enterprise-Audit Käufer-Portal

> Quelle: [features/ENTERPRISE_AUDIT_2026-07-25.md](features/ENTERPRISE_AUDIT_2026-07-25.md).
> Diese Punkte gehören **nicht** zum Befund und sind bewusst nicht im Audit-Commit gelandet —
> sie sind beim Lesen des Codes nebenbei aufgefallen. Gesammelt statt erzählt (AGENTS.md-Regel).

### C-1 · „Zwei parallele Timesheet-Systeme" 🟢 **PRÄMISSE WIDERLEGT 2026-07-26** — Restfrage ist klein

**Der Eintrag beschrieb zwei konkurrierende Wahrheiten. Das stimmt nicht.** Am Code
nachgeprüft (nicht aus dem Gedächtnis):

- **`timesheets` ist nicht die Altlast, sondern der kaufmännische Datensatz.** Acht Services
  lesen die Tabelle, darunter `operationalInvoiceService` (Rechnungsstellung),
  `billingMetricsService`, `revenueMetricsService`, `spendAnalyticsService`,
  `reputationService`, `dataGovernanceService` (DSGVO-Auskunft) und `workforceService`
  (Live-Belegschaft). Wer sie zurückbaut, nimmt der Rechnungsstellung die Grundlage.
- **`worker_time_submissions` konkurriert nicht damit, sondern speist sie.**
  `workerSubmissionService.js:691` und `:1019` legen aus einer freigegebenen Worker-Meldung
  eine `timesheets`-Zeile an; `sub.timesheet_id` verknüpft beide, `TIMESHEET_ALREADY_EXISTS`
  verhindert Doppelungen. Es ist **eine Kette mit zwei Schichten**: die Kraft meldet Stunden
  (Nachweisschicht) → daraus entsteht der kaufmännische Datensatz (Abrechnungsschicht).
- Die Sorge „erzeugt Daten, die im Käufer-Portal nie auftauchen" trifft damit **nicht** zu:
  beide Wege münden in dieselbe Tabelle.

**Was tatsächlich offen ist — und es ist deutlich kleiner:** `POST /api/timesheets` ist ein
**zweiter Eingang in die Abrechnungsschicht, der die Nachweisschicht überspringt**. Der Name
der Kraft ist dort ein Freitextfeld; es gibt keine Worker-Meldung, die den Stunden
gegenübersteht. Das ist kein Datenmüll, sondern eine bewusste Abkürzung — und für Agenturen,
deren Kräfte das Portal nicht nutzen, ist sie der einzige Weg.

**Owner-Entscheid (Produkt, nicht Technik):** bleibt die manuelle Erfassung als
gleichberechtigter Weg, oder wird sie zum ausdrücklichen Ausnahmefall (z. B. Kennzeichnung
`source: manual` am Datensatz, damit in Abrechnung und Streitfall sichtbar ist, dass kein
Worker-Nachweis dahintersteht)? Die zweite Variante ist ~1 h Arbeit — Migration für eine
Spalte plus Anzeige — und deutlich weniger als die ursprünglich veranschlagten 2–3 h für
einen Rückbau, der die Rechnungsstellung getroffen hätte.

**Nebenbefund (2026-07-26 mitbehoben):** die Lieferantenseite dieser Strecke war schlicht
kaputt — `GET /api/timesheets` filterte nur auf die Käuferseite, eine Agentur sah ihre
eigenen Stundenzettel nie, und der DATEV-Lohn-Export lieferte ihr eine leere Datei. Siehe
C-10.

### C-2 · Emojis in produktiver UI ✅ **ERLEDIGT 2026-07-26**
**Was:** Der Eintrag nannte eine Seite — betroffen war das **ganze Einsatzportal**:
**181 Emojis** über 7 Seiten plus `portalStatus.js`.

**Umgesetzt:**
- Alle 181 entfernt. Vorher geprüft, dass keines logiktragend ist (keine Vergleiche, keine
  Schlüssel) — die Entfernung ist rein darstellend.
- Statt dessen ein **Inline-SVG-Icon-Satz**, zentral in `js/workerPortal/portalShell.js`
  (`ICON_PATHS` + `_setupIcons()`), nicht siebenfach in die HTML-Dateien kopiert: ein
  kopierter Satz driftet beim ersten Nachziehen auseinander. Farbe folgt `currentColor`,
  also jedem Theme; der aktive Eintrag bleibt farblich hervorgehoben.
- Statusbedeutung tragen jetzt Badge-Klasse und Beschriftung statt eines zweiten,
  redundanten Emojis.
- **Wächter-Test** `api/test/uiNoEmoji.test.js`: schlägt an, sobald ein Emoji zurückkommt,
  und prüft, dass jeder Navigationseintrag ein Icon hat. Bewusst auf den aufgeräumten
  Bereich beschränkt — ein repo-weiter Test wäre sofort rot und würde abgeschaltet statt
  befolgt. Geltungsbereich wächst über `GUARDED` mit jedem aufgeräumten Bereich.

**Verifiziert:** im Browser gegen die echte `einsatzportal.css` — alle 8 Seitenleisten- und
6 Kurznavigations-Einträge plus Glocke tragen ein 18px-SVG, `aria-label` sitzt, kein Emoji
mehr im DOM. Der Wächter fand dabei zwei Reste in `portalStatus.js`, die der erste Durchgang
übersehen hatte — genau dafür ist er da.

### C-3 · `findOrgApprovers` hartkodiert Rollen in SQL ✅ **ERLEDIGT 2026-07-26**
**Was:** `notificationMatrix.js` löste Empfänger über `role_key IN ('owner','admin','program_manager')`
direkt in SQL auf — unabhängig von der Rechte-Matrix in `rbacService.js`.

**Befund beim Anfassen (Trigger erfüllt durch P4.1/P4.4):** `findOrgApprovers` und
`findOrgAdmins` hatten **keinen einzigen Aufrufer mehr** — nur noch ihre eigene Definition
und ihre Tests. Der beschriebene Drift konnte gar nicht mehr eintreten, aber der tote Code
lud dazu ein, ihn wieder zu benutzen.

**Umgesetzt:** beide Funktionen ersatzlos entfernt, samt ihrer Tests. Verbindlich bleibt
`findOrgMembersWithPermission(pool, orgId, permission)` — die Rechte-Matrix ist die einzige
Wahrheit, benachrichtigt wird, wer die Aktion ausführen darf. `notificationMatrix.test.js`
11/11 grün.

### C-4 · Web3Forms-Access-Key im Repo ✅ **ERLEDIGT 2026-07-26** *(zwei Owner-Schritte offen)*
**Was:** `cloudflare-pages/index.html` enthielt den Key im Klartext.

**Umgesetzt — der Key gehört gar nicht in die Seite:** neue Cloudflare Pages Function
`cloudflare-pages/functions/api/prereg.js` nimmt die Voranmeldung entgegen und ergänzt den
Key **serverseitig** aus der Umgebungsvariable `WEB3FORMS_KEY`. Die ausgelieferte Seite
kennt ihn nicht mehr; im Repo steht kein Schlüssel. Die Funktion nimmt zusätzlich nur
bekannte Felder an (längenbegrenzt), prüft E-Mail und Organisation und beantwortet den
Honeypot freundlich, ohne weiterzuleiten. Fehlt die Variable, antwortet sie mit einer
klaren Meldung statt still zu schlucken — die Seite zeigt sie an.

**Zwei Schritte bleiben beim Owner** (in `cloudflare-pages/README.md` dokumentiert):
1. `WEB3FORMS_KEY` im Cloudflare-Dashboard als **Secret** setzen (Production *und* Preview),
   danach neu deployen.
2. **Den alten Key rotieren.** Er steht in der Versionsgeschichte und lässt sich daraus
   nicht entfernen — bis zur Rotation bleibt er für Fremde nutzbar.

### C-5 · QR-Code von Fremd-Dienst ✅ **ERLEDIGT 2026-07-26**
**Was:** `cloudflare-pages/start.html` lud den QR live von `api.qrserver.com` — jeder
Seitenaufruf verriet einem Dritten, wer wann auf die Seite schaut.

**Umgesetzt:** QR **einmal** erzeugt und als `cloudflare-pages/assets/qr-pilot.svg`
beigelegt (SVG, 10 KB, ohne externe Verweise im Inhalt). Die Seite lädt jetzt die lokale
Datei; zur Laufzeit geht keine Anfrage mehr an Dritte. Der Erzeugungsbefehl steht als
Kommentar in `start.html` — nötig nur, wenn sich `ONE_PAGER_URL` ändert.

### C-6 · 13 skipped Tests nie identifiziert ✅ **ERLEDIGT 2026-07-26**
**Was:** Die Suite meldet konstant `skipped 13`, ohne dass dokumentiert wäre, welche und warum.
CLAUDE.md §0.9 verbietet stille Skips.

**Identifiziert.** Alle 13 sind **DB-gated** (`skip: !hasDb`) oder **Frontend-gated**
(`FRONTEND_AVAILABLE`) — keine abgeschalteten Tests, aber auch nichts, was im Normallauf
je läuft:

| Datei | Übersprungene Tests | Grund |
|---|---|---|
| `test/org-boundary.test.js` | 6 — u. a. „user from org1 cannot view org2's requisitions", `ORG_BOUNDARY_VIOLATION`, `OWNERSHIP_VIOLATION` | kein `DATABASE_URL` |
| `test/multi-location-integration.test.js` | 5 — Standort-Zugehörigkeit, Cross-Org-Standort, Soft-Delete | kein `DATABASE_URL` |
| `test/capacityService.test.js` | 2 — `available_effective`, Reservierung reduziert Verfügbarkeit | kein `DATABASE_URL` |
| `test/idempotency.test.js` | 1 (Suite) — Idempotency gegen Migration 012 | kein `DATABASE_URL` |
| `test/staffCombinedInbox.test.js` | 1 (Suite) — Staff-Frontend-Strukturchecks | Frontend nicht gemountet |

**Der eigentliche Befund:** ausgerechnet die **Mandantentrennung** wird im Standardlauf nie
geprüft. Eine grüne Suite sagt über Org-Grenzen genau nichts aus — dieselbe Lehre wie im
Enterprise-Audit.

**Abhilfe (umgesetzt):** neue Suite `--suite=db-gated` in `api/scripts/run-tests.js`.
```bash
DATABASE_URL=postgres://… node scripts/run-tests.js --suite=db-gated
```
**Verifiziert 2026-07-26:** gegen die Dev-DB **56 Tests, 0 Fehler, 0 skipped** — die
Org-Boundary-Guards halten tatsächlich. Vor jedem Release mitlaufen lassen.

### C-7 · Build-Artefakte im Working Tree ✅ **ERLEDIGT 2026-07-26** *(mit B-1)*
`frontend/public/staff/assets/*` und `frontend/support-ops/*` sind aus der Versionierung
genommen; beide Verzeichnisse stehen in `.gitignore`. `git status` zeigt kein Bundle-Rauschen
mehr. Begründung und Nachweis: siehe **B-1**.

### C-8 · Verwaister Stash ✅ **ERLEDIGT 2026-07-26**
`stash@{0}` enthielt Build-Artefakt-Rauschen plus **eine** echte Änderung: die nginx-Regel
für un-gehashtes App-JS/CSS (`no-cache, must-revalidate`). Vor dem Verwerfen geprüft: diese
Regel liegt **byte-identisch** bereits im Working Tree — der Stash war damit vollständig
redundant und wurde verworfen.

> ⚠️ **Hinweis an den Owner:** die nginx-Änderung ist weiterhin **uncommitted** im Working
> Tree. Sie ist sinnvoll (Frontend-Änderungen erreichen Nutzer sofort statt aus dem
> Browser-Cache), gehört aber nicht in diesen Audit-Commit — bitte separat entscheiden.

### C-9 · Push-Benachrichtigung beim Sperren fehlt ✅ **ERLEDIGT 2026-07-26**
Sperrt ein Kunde eine Kraft, erfuhr die Agentur es nur per Pull — im schlechtesten Fall
beim Versuch, genau diese Kraft erneut dorthin zu schicken.

**Umgesetzt:**
- **Migration 154** ergänzt den Typ `worker_blocked_by_company` im CHECK-Constraint. Zuerst
  die Migration, dann der Code — ein neuer Typ ohne Eintrag lässt den INSERT still
  scheitern (die Falle steht in `SKILL.md`). Gegen die echte DB angewandt und mit einem
  INSERT verifiziert.
- `workerNotificationService.notifyWorkerBlockedToAgency()` — nennt Unternehmen, Kraft,
  Frist und Grund, nicht nur „es gibt Neuigkeiten", und verlinkt auf eine konkrete Seite.
- Verdrahtet in `POST /company/blocklist`, **fire-and-forget**: eine Sperre darf an der
  Benachrichtigung nie scheitern. Empfänger kommen aus der Rechte-Matrix
  (`findOrgMembersWithPermission(..., "worker.manage")`), nicht aus einer Rollenliste.
- 12 Tests (`api/test/workerBlockNotification.test.js`), darunter je einer für die beiden
  dokumentierten Fallen: CHECK-Eintrag vorhanden, Empfänger aus der Matrix.

---

## Zugang 2026-07-26 — beim Abarbeiten von C-6 aufgefallen

### C-10 · Integrationssuite grün — und sechs echte Fehler unterwegs ✅ **ERLEDIGT 2026-07-26**
**Ergebnis: 186/186 grün, 0 übersprungen** (vorher 137/179, 42 rot).

**Meine erste Diagnose war falsch.** Ich hatte „Test-Drift gegen das `legacy_access`-Gate"
notiert — abgeleitet aus dem Muster der Fehlercodes, nicht aus einem Lauf. Der erste
tatsächliche Aufruf zeigte etwas anderes: **429 `PLAN_LIMIT_REACHED`, `limit: 0`**. DEMO
hat `listings: 0`; das Produkt verhielt sich korrekt, die Tests hatten die falsche
Ausgangslage. Merke: Fehlerbilder zählen ist keine Diagnose.

Die 42 Fehler hatten **vier** Ursachen, nicht eine — und dahinter lagen **sechs echte
Produktfehler**, die kein einziger Test vorher gemeldet hatte:

**1 · Fehlender Index — `webhook_deliveries_retry_failed_idx` (Migration 155)**
Mig 122 legte ihn hinter einem `to_regclass`-Guard an; die Tabelle existierte damals nicht,
der Guard übersprang ihn per NOTICE. Mig 124 ließ ihn ausdrücklich aus („bis die
Integrations-Funktion ihre Tabelle mitbringt"). Mig 130 brachte die Tabelle — die
Nachzieh-Migration blieb aus, und 122 gilt als angewandt. Der Retry-Sweep scannte eine
append-only Tabelle sequenziell. **Der Test hatte recht; korrigiert wurde das Schema.**
*Lehre: ein Guard, der überspringt, braucht einen Auslöser, der ihn nachholt.*

**2 · Cross-Org-Datenleck (`middleware/orgContext.js`) — der schwerwiegendste Fund**
`orgContext` nahm `?org_id=` / `body.org_id` als Kontextquelle. Nannte der Wert eine Org
ohne Mitgliedschaft, blieb `req.orgId` **null**. **45 Routen** prüfen die Org-Grenze als
`if (req.orgId && ressource.org_id !== req.orgId) return 403` — eine Prüfung, die sich bei
`null` selbst abschaltet, also genau im Angriffsfall ausfiel. Bei 36 fing ein
vorgelagerter Permission-Guard den Zugriff ab. Bei **neun** nicht:
`GET /organizations/:id/members|locations|departments` laufen nur mit `requireAuth`.
**Nachgestellt und bestätigt:** eine frisch registrierte Agentur las die vollständige
Mitgliederliste einer fremden Firma — fremde Org-ID einmal im Pfad, einmal als `?org_id=`.
*Fix:* Ein nicht auflösbarer Org-Wunsch wird verworfen wie eine ungültige UUID, der Kontext
fällt auf die eigene Org zurück. Die Grenzprüfungen greifen wieder.
*Dazu:* `body.org_id` zählt nicht mehr als Kontext-Zusicherung — bei 19 Routen-Schemas ist es
ein **Nutzdatum** („zu welcher Org gehört dieser Datensatz"). Das war zugleich die Ursache
dafür, dass die gesamte Lieferanten-Strecke der Stundenzettel nicht funktionierte: 15 von 15
Timesheet-Tests wurden allein durch diesen Fix grün.
*Regressionstest:* `test/integration/orgContextBoundary.security.test.js` (7 Tests, spielt
den Angriff nach).

**3 · Datumsversatz um einen Tag (`db/typeParsers.js`)**
Der pg-Treiber machte aus einer DATE-Spalte ein `Date` um **lokale** Mitternacht;
`JSON.stringify` schrieb daraus einen UTC-Zeitpunkt. Aus dem Vertragsende `2026-04-01`
wurde `"2026-03-31T22:00:00.000Z"` — jede UTC-basierte Anzeige zeigte den **31.03.**
Betrifft 55 DATE-Spalten: Vertragsenden, Sperrfristen, Abrechnungswochen. *Fix:* DATE (OID
1082) wird unverändert als `'YYYY-MM-DD'` durchgereicht. Zeitstempel bleiben unangetastet.

**4 · Checkout-ID in zwei Schreibweisen (`routes/payment.js`)**
`crypto.randomBytes(16).toString("hex")` erzeugt 32 Hexzeichen ohne Bindestriche;
`payment_sessions.id` ist UUID, Postgres speichert **normalisiert**. Der Checkout gab
`"0123456789abcdef…"` zurück, jede spätere Antwort `"01234567-89ab-cdef-…"`. Clients fanden
ihren eigenen Vorgang in `GET /payment/history` nicht wieder, und der Audit-Eintrag
(`entity_id`) ließ sich nicht mehr mit der Zeile verbinden, die er beschreibt. *Fix:*
`crypto.randomUUID()`.

**5 · Angebots-Postfach ohne Aktionen (`routes/marketplace.js`)**
`computeOfferNextAction` entscheidet an `requester_company_id`, ob der Betrachter die
Bestellerseite ist. Das Feld liegt auf `demand_requests`; zwei Roh-Queries holten nur `o.*`.
Folge: `undefined === userId` → der Besteller wurde nie als Besteller erkannt. Sein
Postfach meldete bei jedem eingegangenen Angebot „wartet auf die Gegenseite" und lieferte
eine **leere Aktionsliste** — kein Annehmen, kein Ablehnen, kein Gegenangebot. *Fix:*
`d.requester_company_id` mitselektieren; die Funktion meldet ein fehlendes Feld jetzt laut,
statt eine plausible falsche Antwort zu geben.

**6 · Lieferant sah seine eigenen Stundenzettel nicht (`services/timesheetService.js`)**
Die Detailroute prüft die Grenze über **beide** Seiten (`checkOrgBoundary`), die Liste
filterte nur auf `org_id` (Kundenseite). Eine Agentur konnte einen selbst angelegten Zettel
per ID öffnen, ihn aber in `GET /api/timesheets` nie finden — und der DATEV-Lohn-Export,
den genau diese Seite braucht, lieferte eine **leere Datei**. *Fix:* `member_org_id`
klammert beide Seiten, in Liste und beiden Exporten.

**Was an den Tests korrigiert wurde — und was ausdrücklich nicht:**
Keine Assertion wurde abgeschwächt. Geändert wurden Ausgangslagen und zwei überholte
Verträge:
- **Pläne:** DEMO gewährt nichts (0 Inserate, 0 Kräfte je Anforderung, kein `worker_module`).
  Tests, die einen Ablauf prüfen wollten, bekommen den Plan, unter dem dieser Ablauf
  existiert — Listings **BASIS** (einziger Plan mit `legacy_access` *und* Kontingent).
- **`ensureSubscription` schluckte einen CHECK-Verstoß.** Drei Dateien forderten
  `"ENTERPRISE"` an — kein kanonischer Plan; das `.catch(() => {})` verschluckte den Fehler,
  die Org blieb auf **DEMO**. Diese Tests behaupteten, Enterprise zu prüfen, und taten es
  nie. Jetzt: Normalisierung über `normalizePlanKey`, und ein Fixture, das seinen Plan nicht
  setzen kann, **scheitert laut**. Der neue Fehler entlarvte sofort ein weiteres Fixture.
- **Session-Org-Cache:** Fixtures meldeten Nutzer an, *bevor* sie sie per SQL in eine andere
  Org umhängten. `_orgCache` altert nicht mit → falscher Org-Kontext. Neuer Helfer
  `loginAgent()`.
- **Überholte Regel (subscription.flow):** drei Tests verlangten 403 auf `GET /api/capacities`
  für DEMO. Die Plan-Matrix führt `sla_access` bewusst für **alle** Pläne
  („Marketplace browsing (DEMO can view/browse but not create)") — ein Marktplatz, den
  Interessenten nicht ansehen dürfen, verkauft nichts. Die Tests zeigen jetzt auf die Grenze,
  die es wirklich gibt: **`sla_offers_create` (PLUS+)**, geprüft am POST.
- **Überholte Regel (rbac-deep):** zwei Assertions verlangten den internen
  Berechtigungsnamen in der 403-Antwort — genau das, was SEC-003 bewusst nicht mehr
  preisgibt, und das Gegenteil dessen, was `rbac-middleware.test.js` prüft. Jetzt wird die
  sanitisierte Form festgeschrieben.
- **`ADMIN_SECRET`** war im Testprozess nie gesetzt: der Erfolgsfall des Admin-Guards
  (richtiges Geheimnis → 200) wurde nie ausgeführt. Neu: `test/integration/testEnv.js`.

**Verifikation:** Integration **186/186**, Unit-Suite **7451/7464 grün, 0 rot** (13
übersprungen = ohne DB). Das Cross-Org-Leck war vor dem Fix nachweislich rot.

**Zwei kleinere Beobachtungen, bewusst nicht angefasst** (kein Angriffspfad, aber notiert):
- `routes/timesheets.js:68` — `checkOrgBoundary` beginnt mit `if (!orgId) return true`
  („Legacy-User ohne Org"). Dasselbe Fail-Open-Muster; seit dem orgContext-Fix ist `orgId`
  für jeden Nutzer mit Mitgliedschaft gesetzt, und ohne Mitgliedschaft scheitert schon der
  Permission-Guard davor. Unerreichbar, aber falsch herum formuliert.
- `routes/timesheetTemplates.js:164` — die Kunden-`org_id` beim Zuweisen einer Vorlage wird
  nicht gegen eine Geschäftsbeziehung geprüft. Ein Lieferant könnte eine eigene Vorlage einer
  beliebigen fremden Org zuordnen. Keine Datenpreisgabe, aber unsauber.

---

## Turnus-Prüfung (alle 14 Tage — global verbindlich laut `~/AGENTS.md`)

Bei jeder Prüfung: **erledigt? noch gültig? neu dazugekommen?** Erledigte Punkte werden
**abgehakt, nicht gelöscht** — die Historie zeigt, ob ein Muster wiederkehrt.

| Datum | Geprüft von | Ergebnis |
|---|---|---|
| 2026-07-25 | Claude | Zugang C-1…C-9 aus dem Enterprise-Audit. B-1…B-5 unverändert offen. Nächste Prüfung: 2026-08-08. |
| 2026-07-26 | Claude | **C-3, C-6, C-8 erledigt.** B-2: Sonde gebaut, Flake in diesem Lauf nicht reproduzierbar. Neu: **C-10** (Integrationssuite 42 rot — Test-Drift gegen `legacy_access`-Gate). |
| 2026-07-26 (2) | Claude | **C-2, C-4, C-5, C-9 erledigt.** |
| 2026-07-26 (7) | Claude | **B-1 + C-7 erledigt.** Sperre aufgeloest durch echten Prod-Build-Lauf: 31 Bundles neu erzeugt, 27 getrackte Dateien dabei geloescht (`emptyOutDir`) — getrackte Kopien ueberleben keinen Deploy. C-1 neu bewertet (Praemisse widerlegt). **Damit ist die Liste bis auf Owner-Entscheide abgearbeitet:** S-2 (DSGVO-Abwaegung), C-1-Restfrage (manuelle Stundenzettel-Erfassung), B-4-Dateiverschiebung (wartet auf `docs/launch/`). |
| 2026-07-26 (6) | Claude | **B-5 teilweise erledigt: S-3 + E-2.** S-3: Verantwortlichkeit sitzt jetzt in `writeAudit()` statt an 400 Aufrufstellen (7/319 hatten sie). E-2: nachgemessen — 42 Fundstellen, alle abgesichert, die "48 Routen" waren geschaetzt; geschlossen. B-2: Sonde fest im Runner verdrahtet + Gegenprobe. S-2 gemessen (2 Stellen), Owner-Entscheid. E-1/E-3 bleiben ausloeserbasiert. Offen: B-1 (gated), C-1, C-7 (= B-1), S-2 (Owner). |
| 2026-07-26 (5) | Claude | **B-4 erledigt** — widersprüchliche Dokumente aufgelöst: Go-Live-Listen auf `docs/GO_LIVE_FINAL.md` (= Remediation D-4), zusätzlich das gefährlichere Release-Runbook-Doppel (CI vs. lokaler Artefaktbau), `DEPLOYMENT.md`-Namenskollision geklärt, abgelaufene Roadmap-Zusage datiert. Dateiverschiebung bewusst offen (kollidiert mit `docs/launch/`). Offen: B-1 (gated), B-5, C-1, C-7 (= B-1). |
| 2026-07-26 (4) | Claude | **B-3 erledigt** — Doku-Wächter steht (tote Links strikt, Verwaiste als Ratsche 177→156), Gegenprobe in allen drei Richtungen rot. Offen: B-1 (gated), B-4, B-5, C-1, C-7 (= B-1). |
| 2026-07-26 (3) | Claude | **C-10 erledigt — Integration 186/186.** Dabei sechs echte Fehler gefunden: Cross-Org-Leck (nachgestellt), fehlender Index (Mig 155), DATE-Versatz um einen Tag, Checkout-ID in zwei Schreibweisen, Angebots-Postfach ohne Aktionen, Lieferanten-Stundenzettel unsichtbar. Offen: B-1 (gated auf Prod-Deploy), B-3, B-4, B-5, C-1, C-7 (= B-1). Nächste Prüfung: 2026-08-09. |

---

## Erledigt-Verweis
Alles Substanzielle (Welle 1, S-1, D-5, H-5, D-1, D-2-Build-Schritt, F-1, F-4-verifiziert, H-1, H-2-n/a)
ist in [AUDIT_REMEDIATION_2026-06-28.md](AUDIT_REMEDIATION_2026-06-28.md) dokumentiert + committet.
