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

## Erledigt-Verweis
Alles Substanzielle (Welle 1, S-1, D-5, H-5, D-1, D-2-Build-Schritt, F-1, F-4-verifiziert, H-1, H-2-n/a)
ist in [AUDIT_REMEDIATION_2026-06-28.md](AUDIT_REMEDIATION_2026-06-28.md) dokumentiert + committet.
