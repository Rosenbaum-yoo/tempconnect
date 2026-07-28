# Audit-Backlog — niedrigwertige / gated Restpunkte

> Aus der Audit-Remediation (2026-06-28, siehe [AUDIT_REMEDIATION_2026-06-28.md](AUDIT_REMEDIATION_2026-06-28.md)).
> Der **substanzielle** Teil ist erledigt (~98 %). Hier liegen die bewusst zurückgestellten Punkte:
> niedriger Wert, gated, non-deterministisch oder „can of worms". **Abarbeiten, sobald es sich lohnt** —
> jeder Eintrag hat einen konkreten Trigger.
>
> **Diese Datei ist im Session-Memory verankert** (`audit-backlog` → MEMORY.md) und wird bei passender
> Gelegenheit geprüft. Nicht löschen, bis alle Einträge erledigt/verworfen sind.

---

## B-1 · D-2-Untrack der staff-Build-Bundles 🔒 *gated*
**Was:** Die gehashten Vite-Bundles unter `frontend/public/staff/` aus Git nehmen (Dev-Diff-Churn beenden).
**Vorbedingung erfüllt:** Build-on-Deploy ist etabliert (`frontend-build`-Service in compose, CI `build:soc`, DEPLOYMENT.md).
**Trigger:** Nach **einem realen `docker compose -f docker-compose.prod.yml up`**, der bestätigt, dass `frontend/public/staff/staff.html` + `assets/*` frisch erzeugt werden.
**Schritte:**
```bash
git rm -r --cached frontend/public/staff
echo "frontend/public/staff/" >> .gitignore
```
**Rollback:** `git revert <commit>` stellt die committeten Bundles sofort wieder her.
**Wert:** mittel (Hygiene), **Risiko ohne Verifikation:** Prod-404 → daher gated.

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
Rejection** — der Flake trat in diesem Lauf nicht auf. Damit ist er weiterhin nicht
gefangen, aber das Werkzeug liegt bereit: beim nächsten roten Lauf einmal mit der Sonde
wiederholen, dann steht die Quelle im Protokoll. Nicht weiter blind suchen.

---

## B-3 · H-4 · docs-consistency-Test (CLAUDE.md §0.12) ⚠️ *can of worms*
**Was:** Ein leichter Test, der tote Markdown-Links + verwaiste/duplizierte Docs rot werden lässt.
**Warum gated:** Bei 215 docs/-Dateien findet er voraussichtlich **viele** Alt-Links → eigenes Aufräum-Projekt.
**Trigger:** Wenn Doku-Drift real schmerzt ODER vor einem „Doku-Audit"-Meilenstein. Dann: erst Test schreiben (nur NEUE Verstöße rot, Bestand als Allowlist), inkrementell abbauen.
**Wert:** mittel-hoch langfristig, hoher Initialaufwand.

---

## B-4 · Welle 5 · Doku-Konsolidierung (Go-Live-Listen + Root-Status-.md) 🟡 *editorisch*
**Was:** 3 widersprüchliche Go-Live-Listen (`GO-LIVE.md` / `MARKTSTART-CHECKLISTE.md` / `docs/GO_LIVE_FINAL.md`) auf **eine SSoT** reduzieren; 9 Root-Status-`.md` nach `docs/` konsolidieren.
**Warum gated:** **6 der Root-`.md` sind aktiv aus `docs/` verlinkt** (DEPLOYMENT/INCIDENT/BACKUP/RELEASE_RUNBOOK/VOR-HETZNER-GO-LIVE/DEAL-ERFOLG) → blindes Löschen bricht Links. `WARP-TASKS-PERMANENT.md` ist explizit „behalten"-markiert. Erfordert sorgfältiges Link-Umbiegen + Owner-Entscheid zur kanonischen Liste (Empfehlung: `docs/GO_LIVE_FINAL.md`).
**Trigger:** Vor Marktstart-Endspurt (eine klare Go-Live-Liste vermeidet, dass die falsche/leere abgehakt wird).
**Wert:** mittel.

---

## B-5 · Welle 6 · Enterprise-Politur 🟢 *niedrig*
- **E-1:** `createServiceLogger(name)` schrittweise in mehr Services (derzeit 7/153) → Service-Kontext im Log. Additiv, tedious. **Trigger:** beim nächsten Anfassen eines Service ohnehin mitnehmen.
- **E-2:** Soft-Fail-Audit — 48 Routen mit potenziellem 500 auf `available:false`/Zero-State prüfen. **Trigger:** wenn ein 500-bei-leeren-Daten real auftritt.
- **E-3:** Nicht-Service-Module aus `api/services/` (stateMachine/notificationMatrix/…) nach `api/lib`/`api/config` umsortieren. Rein organisatorisch. **Trigger:** nur bei größerem Struktur-Refactor.
- **S-2/S-3 (aus Welle 3):** Logger-PII-Redaction (E-Mail/Query) — DSGVO-Bewertung durch Owner; `responsible_actor_user_id`-Pflicht im `writeAudit`-Wrapper. **Trigger:** vor DSGVO-/Security-Review.

---

## Zugang 2026-07-25 — aus dem Enterprise-Audit Käufer-Portal

> Quelle: [features/ENTERPRISE_AUDIT_2026-07-25.md](features/ENTERPRISE_AUDIT_2026-07-25.md).
> Diese Punkte gehören **nicht** zum Befund und sind bewusst nicht im Audit-Commit gelandet —
> sie sind beim Lesen des Codes nebenbei aufgefallen. Gesammelt statt erzählt (AGENTS.md-Regel).

### C-1 · Zwei parallele Timesheet-Systeme 🟠 *strukturell*
**Was:** Legacy `routes/timesheets.js` + `timesheets.html` (`timesheetService`, eigene Statusmaschine,
manuelle Eingabe von Org-ID/Supplier-Org-ID/Worker-Freitext) läuft weiter neben dem echten System
`worker_time_submissions`. Aus der Nav ist es raus, ein Wegweiser-Banner steht drin — mehr nicht.
**Warum riskant:** zwei Wahrheiten für denselben Geschäftsvorfall; wer den alten Weg kennt, erzeugt
Daten, die im neuen Käufer-Portal nie auftauchen.
**Trigger:** vor dem Onboarding echter Pilotkunden. **Aufwand:** ~2–3 h.

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

### C-7 · Build-Artefakte im Working Tree 🟢 *= B-1, bestätigt*
`frontend/public/staff/assets/*` + `frontend/support-ops/*` erzeugen dauerhaftes Diff-Rauschen.
Kein neuer Punkt — Bestätigung, dass **B-1** inzwischen die Übersicht in `git status` real stört.

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
| 2026-07-26 (3) | Claude | **C-10 erledigt — Integration 186/186.** Dabei sechs echte Fehler gefunden: Cross-Org-Leck (nachgestellt), fehlender Index (Mig 155), DATE-Versatz um einen Tag, Checkout-ID in zwei Schreibweisen, Angebots-Postfach ohne Aktionen, Lieferanten-Stundenzettel unsichtbar. Offen: B-1 (gated auf Prod-Deploy), B-3, B-4, B-5, C-1, C-7 (= B-1). Nächste Prüfung: 2026-08-09. |

---

## Erledigt-Verweis
Alles Substanzielle (Welle 1, S-1, D-5, H-5, D-1, D-2-Build-Schritt, F-1, F-4-verifiziert, H-1, H-2-n/a)
ist in [AUDIT_REMEDIATION_2026-06-28.md](AUDIT_REMEDIATION_2026-06-28.md) dokumentiert + committet.
