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

### C-2 · Emojis in produktiver UI 🟡 *Regelverstoß*
**Was:** `einsatzportal-stundenzettel.html` nutzt ✏️ 💾 📝 💬 in Buttons/Hinweisen — CLAUDE.md
verbietet Emojis in produktiver UI ausdrücklich. **Trigger:** nächste Einsatzportal-Politur. **~20 min.**

### C-3 · `findOrgApprovers` hartkodiert Rollen in SQL 🟠 *Drift-Risiko*
**Was:** `notificationMatrix.js` löst Empfänger über `role_key IN ('owner','admin','program_manager')`
direkt in SQL auf — unabhängig von der Rechte-Matrix in `rbacService.js`.
**Warum riskant:** ändert jemand die Permission-Matrix, driftet der Benachrichtigungs-Kreis still
auseinander — es wird benachrichtigt, wer nicht handeln darf, oder umgekehrt.
**Trigger:** beim nächsten Anfassen der Notification-Empfänger. **~1 h + Tests.**

### C-4 · Web3Forms-Access-Key im Repo 🟠 *Pilot-Strecke*
**Was:** `cloudflare-pages/index.html` enthält den Key im Klartext. Bei Web3Forms ist er per Design
öffentlich — committet heißt aber: jeder kann die Owner-Inbox zuspammen.
**Trigger:** mit der Pilot-Strecken-Umstellung.

### C-5 · QR-Code von Fremd-Dienst 🟡
**Was:** `cloudflare-pages/start.html` lädt den QR live von `api.qrserver.com`. Externe Abhängigkeit
auf einer Marketing-Seite, und jeder Aufruf leakt die Ziel-URL an Dritte.
**Lösung:** QR einmal erzeugen, statisch mit ausliefern. **Trigger:** vor dem ersten LinkedIn-Post. **~20 min.**

### C-6 · 13 skipped Tests nie identifiziert 🟡
**Was:** Die Suite meldet konstant `skipped 13`, ohne dass dokumentiert wäre, welche und warum.
CLAUDE.md §0.9 verbietet stille Skips. **Trigger:** nächster Test-Durchgang. **~30 min.**

### C-7 · Build-Artefakte im Working Tree 🟢 *= B-1, bestätigt*
`frontend/public/staff/assets/*` + `frontend/support-ops/*` erzeugen dauerhaftes Diff-Rauschen.
Kein neuer Punkt — Bestätigung, dass **B-1** inzwischen die Übersicht in `git status` real stört.

### C-8 · Verwaister Stash 🟢 *sofort erledigbar*
`stash@{0}` ist inhaltlich identisch zum Working Tree (verifiziert) → `git stash drop stash@{0}`.

### C-9 · Push-Benachrichtigung beim Sperren fehlt 🟡
Sperrt ein Kunde eine Kraft, erfährt die Agentur es nur per Pull (Hinweis im Zuweisungs-Drawer).
**Trigger:** nächste Notification-Welle. **~1 h + Migration für den Typ.**

---

## Turnus-Prüfung (alle 14 Tage — global verbindlich laut `~/AGENTS.md`)

Bei jeder Prüfung: **erledigt? noch gültig? neu dazugekommen?** Erledigte Punkte werden
**abgehakt, nicht gelöscht** — die Historie zeigt, ob ein Muster wiederkehrt.

| Datum | Geprüft von | Ergebnis |
|---|---|---|
| 2026-07-25 | Claude | Zugang C-1…C-9 aus dem Enterprise-Audit. B-1…B-5 unverändert offen. Nächste Prüfung: 2026-08-08. |

---

## Erledigt-Verweis
Alles Substanzielle (Welle 1, S-1, D-5, H-5, D-1, D-2-Build-Schritt, F-1, F-4-verifiziert, H-1, H-2-n/a)
ist in [AUDIT_REMEDIATION_2026-06-28.md](AUDIT_REMEDIATION_2026-06-28.md) dokumentiert + committet.
