# Arbeitsanweisung — Audit-Remediation (Marktstart / Enterprise / Hygiene)

> Quelle: Tiefen-Audit 2026-06-28 (6 Dimensionen, adversarial verifiziert). Branch `release/enterprise-premium-market-ready`.
> Zweck: Alle Audit-Befunde priorisiert, wellenweise, gezielt abarbeiten. Jede Welle = eigener Commit, Tests grün vor Commit.
>
> **Legende:** 🟢 autonom ausführbar · 🟡 Owner-Entscheidung nötig (Produkt/Security) · ⬜ offen · ✅ erledigt · 🔄 in Arbeit
>
> **Regeln:** (1) Löschungen nur nach adversarialer Verifikation (safe=true). (2) Pro Welle volle Suite grün. (3) Commit + Push je Welle. (4) Keine §0.9-Verstöße (Tests ans Verhalten anpassen, nie abschwächen). (5) Owner-gated Punkte NICHT autonom.

---

## Scorecard (Ausgangslage)

| Dimension | Score | Note |
|---|---|---|
| Professionalität | 88 | A |
| Enterprise-Premium | 88 | A |
| Funktionalität/Marktstart | 82 | B |
| Backend-Sauberkeit | 82 | B |
| Frontend-Sauberkeit | 76 | B |
| Repo-Hygiene | 58 | C |

Ziel der Remediation: Repo-Hygiene auf ≥ 85 (A/B), funktionale Brüche schließen, Security-Härtung, ohne Substanz-Risiko.

---

## Welle 0 — Owner-Entscheidungen (blockiert nachgelagerte Wellen) 🟡

Diese Punkte brauchen eine Produkt-/Security-Entscheidung, bevor Code geändert wird.

| ID | Thema | Optionen | Status |
|---|---|---|---|
| D-1 | **`/requests`-Flow** (404) | ⚠️ **Prämisse korrigiert + gelöst (2026-06-28):** Verifikation zeigt — der Mount wurde in `fc24b94` („Session-Middleware-Reihenfolge") **versehentlich** mit-entfernt, als der namensähnliche `createSubscriptionRequestsRouter` hinzukam (Diff: `-import createRequestsRouter`, `-app.use(...createRequestsRouter)`). Es ist ein **eigenes, live verlinktes Feature** (Onboarding→company_requests; Seiten capacity_search/company_requests/request_detail/agency_inbox), **kein** Duplikat zum Marketplace-Capacity-Exchange (separates Feature, eigenes Frontend). „Umbiegen+Löschen" hätte echtes Feature zerstört + Daten-Modell-Rewrite erfordert. **→ Re-Mount** (`v1.use(createRequestsRouter)`); deps liefern requestLimiter etc.; Suite 7240/0, Coverage 44/44. | ✅ |
| D-2 | **Build-Artefakt-Strategie** (30 gehashte Vite-Bundles getrackt) | ⚠️ **BLOCKIERT (2026-06-28):** nginx serviert `./frontend` direkt aus Git (kein Frontend-Build in docker-compose; nur `api/Dockerfile`). OCC (`owner-control/`, gitignored) funktioniert nur, weil der Deploy es baut — aber ein expliziter „Deploy baut `build:all`"-Schritt ist NICHT im Repo dokumentiert (CI baut nur occ+scc, nicht soc; CI ≠ Deploy). Gitignoren der staff/support-Bundles OHNE bestätigten Build-on-Deploy → **SCC/SOC 404 in Prod**. → Owner-Entscheidung: Build-on-Deploy etablieren ODER weiter committen. | 🚧 |
| D-3 | **`catalogVersionService`** wird nie getriggert | (a) beim Boot/Deploy einhängen (wenn Versionierung gewollt) · (b) Service + Test entfernen | ⬜ |
| D-4 | **Kanonische Go-Live-Liste** (`GO-LIVE.md` vs `MARKTSTART-CHECKLISTE.md` vs `docs/GO_LIVE_FINAL.md`) | eine als SSoT wählen, Rest auf Pointer reduzieren | ⬜ |
| D-5 | **OCC-Access-Middleware-Duplikat** | ⚠️ **Prämisse korrigiert (2026-06-28):** Verifikation zeigt — `ownerControlAccess.js` ist eine **nie adoptierte Parallel-Architektur** (nutzt `session.ownerUserId` [nirgends gesetzt] + Tabelle `tempconnect_owners` [nicht live]; Live ist `requireOwnerControlAccess.js` + `occ_owner_access`). „Migrieren" würde den funktionierenden OCC-Login brechen. **Umgesetzt:** tote `ownerControlAccess.js` + Coverage-Test gelöscht (verifiziert nie gemountet/genutzt, Suite re-run 0 fail). `requireConfirmAndReason`-Einzug in LIVE-OCC-Mutationen als Folgeschritt **F-4** offen. | ✅ |

---

## Welle 1 — Safe-Cleanup (verifiziert gefahrlos) 🟢 · PRIO 1 — ✅ ERLEDIGT (2026-06-28)

Jede Datei per Repo-weitem Grep als 0-Referenz bestätigt. Commit `chore(cleanup)`.

| ID | Datei | Aktion | Status |
|---|---|---|---|
| C-1 | `org_script_test.js` | löschen (veraltete Teilkopie aus `organization.html`) | ✅ |
| C-2 | `Tempconnect_laufendeVersion24.02.2026.lnk` | löschen + `*.lnk` in `.gitignore` | ✅ |
| C-3 | `TempConnect_Bewertung_Enterprise.md` (Root) | löschen (docs/-Variante bleibt SSoT) | ✅ |
| C-4 | `tempconnect-project.skill` | löschen (Quelle in `.agents/skills/…`) | ✅ |
| C-5 | `finalization/PHASES (2).md` | löschen (byte-identische Windows-Kopie) | ✅ |
| C-6 | `frontend/enterprise.html` | löschen (kanonisch: `public/enterprise.html`) | ✅ |
| C-7 | `frontend/ExEinstiegindex.html` | löschen (3224 Z., 0 Refs) | ✅ |
| C-8 | `frontend/public/js/pages/workerTimesheet.js` | löschen (**HTML-Stub behalten** — getestet) | ✅ |
| C-9 | `frontend/public/js/pages/internalControlCenter.js` | löschen (**HTML-Stub behalten** — getestet) | ✅ |
| C-10 | `api/services/emailTemplates.js` | löschen (nie verdrahtet; ≠ `emailHtmlTemplates.js`) | ✅ |

**Zusätzlich:** 2 stale `emailTemplates`-Doku-Verweise auf `emailHtmlTemplates` umgebogen (§0.12).
**Akzeptanz erfüllt:** volle API-Suite 7252/0, `frontendCanonicalPages` + `hubVisibilityIntegration` 47/47 grün, kein toter Import.

---

## Welle 2 — Funktionale Fixes 🟢/🟡 · PRIO 2

| ID | Befund | Aktion | Typ | Status |
|---|---|---|---|---|
| F-1 | Toter Upload-Button `sla_nachweise.html` ("Backend nimmt Uploads noch nicht entgegen") | ehrliches Maturity-Gate (403-Pattern wie `sla_profil.html`) ODER Nav-Eintrag für Pilot ausblenden | 🟢 | ⬜ |
| F-2 | `/requests`-404-Bruch | ✅ gelöst via Re-Mount (siehe D-1). Optionaler Folgeschritt: Live-Browser-Smoke der 4 Seiten nach Deploy. `dealWorkflow.js` NICHT gelöscht (Audit-Klassifikation „tot" war unzuverlässig — separat verifizieren). | 🟡 | ✅ |
| F-3 | `catalogVersionService` nie getriggert | gemäß D-3 umsetzen | 🟡 | ⬜ |
| F-4 | OCC-Mutationen ohne Confirm-Reason-Pflicht (CLAUDE.md Pfeiler 5) | `requireConfirmAndReason`-Guard (confirmed=true + reason≥10) in LIVE-OCC-Mutationsrouten einziehen (Wert aus D-5) | 🟢 | ⬜ |
| F-5 | **Flaky Test** (Suite-Anzahl schwankt 7241↔7240, 1 sporadischer Fail) — DB/`meilisearch`-gated, umgebungsabhängig | identifizieren + stabilisieren (sauberer `skip:!hasDb`/optional-dep-Guard) | 🟢 | ⬜ |

---

## Welle 3 — Security-Härtung 🟡 · PRIO 2

| ID | Befund | Aktion | Status |
|---|---|---|---|
| S-1 | **SAML-Issuer nicht validiert** + Legacy-First-Config-Fallback (`ssoService.js`) | `idpIssuer = config.idp_entity_id` an SAML-Constructor; bei unbekanntem RelayState abbrechen statt „erste aktive Org". | ✅ erledigt (Commit `fix(security) SAML`, ssoService.test 3/3) |
| S-2 | PII (E-Mail) + Such-Query im Domain-Logger ohne Redaction | in Pino-redact-paths (teilmaskiert) ODER bewusst dokumentieren (DSGVO-Bewertung Owner) | ⬜ |
| S-3 | `responsible_actor_user_id` nur in 2 Services | kritische Mutationspfade prüfen; `writeAudit`-Wrapper um Pflichtfeld erweitern | ⬜ |

---

## Welle 4 — Repo-/Build-Hygiene 🟢/🟡 · PRIO 3

| ID | Befund | Aktion | Typ | Status |
|---|---|---|---|---|
| H-1 | Build-Artefakt-Churn (staff/support assets) | gemäß D-2 umsetzen (konsistent zu OCC/`support-ops-dist`) | 🟡 | ⬜ |
| H-2 | `finalization/` + `docs/` im Docker-Build-Context | `finalization/` (+ ggf. `docs/`) in `.dockerignore` | 🟢 | ⬜ |
| H-3 | `frontend/support-ops/` nicht ausgeliefert (SOC aus `support-ops-dist/`) | gitignoren oder löschen; Vite-Emit-Ziel prüfen | 🟡 | ⬜ |
| H-4 | **docs-consistency-Test fehlt** (CLAUDE.md §0.12 verbindlich) | leichten Test ergänzen: tote Markdown-Links + verwaiste/duplizierte Docs → rot | 🟢 | ⬜ |
| H-5 | `.catch(()=>{})` ×6 statt `swallow()` (invoices/search/timesheets) | durch `.catch(swallow('…'))` ersetzen | 🟢 | ✅ erledigt (262/262 Route-Tests grün) |

---

## Welle 5 — Doku-Konsolidierung 🟡 · PRIO 3

| ID | Befund | Aktion | Status |
|---|---|---|---|
| K-1 | 3 widersprüchliche Go-Live-Listen | gemäß D-4: eine SSoT, Rest → Pointer; 8 aktive Links umbiegen | ⬜ |
| K-2 | 9 Root-Status-`.md` überlappen mit `docs/releases/` | nach `docs/` konsolidieren, eingehende Links umbiegen, veraltete (`PHASE1-STATUS`, `WARP-TASKS-PERMANENT`-Branch-Hinweis) archivieren | ⬜ |
| K-3 | `internal_control_center.html`/`worker-timesheet.html` Stubs | ggf. auf nginx-301 umstellen (Tests anpassen) — optional | ⬜ |

---

## Welle 6 — Enterprise-Politur 🟢 · PRIO 4

| ID | Befund | Aktion | Status |
|---|---|---|---|
| E-1 | `createServiceLogger` nur 7/153 Services | schrittweise Service-Kontext im Log adoptieren (additiv) | ⬜ |
| E-2 | Soft-Fail `available:false` nur 5 Services | 500-Pfade prüfen → Zero-State-Muster (leere Arrays) | ⬜ |
| E-3 | Nicht-Service-Module in `api/services/` (stateMachine/notificationMatrix/…) | optional nach `api/lib/`/`api/config/` umsortieren | ⬜ |

---

## Fortschritts-Log

| Datum | Welle | Commit | Ergebnis |
|---|---|---|---|
| 2026-06-28 | Welle 1 — Safe-Cleanup | `chore(cleanup)` | 10 verifizierte Dateien entfernt, 2 Doku-Verweise gefixt, `*.lnk` ignoriert; Suite 7252/0 |
| 2026-06-28 | Welle 3 — S-1 SAML-Härtung | `fix(security) SAML` | Issuer-Validierung + Fallback entfernt; ssoService.test 3/3 |
| 2026-06-28 | D-5 (Welle 0) | `chore(occ)` | Prämisse korrigiert; tote Parallel-Middleware + Coverage-Test gelöscht; Suite 7240/0 (re-run). Confirm-Reason → F-4 |
| 2026-06-28 | Welle 4 — H-5 | `refactor(logging)` | 6× stilles `.catch(()=>{})` → `swallow()`; 262/262 Route-Tests grün |
| 2026-06-28 | D-1/F-2 (Welle 2) | `fix(api) requests re-mount` | Prämisse korrigiert: versehentlicher Regress (fc24b94) → Anfrage-Flow-Router re-mounted; Suite 7240/0. Kein Löschen (echtes Feature) |
| 2026-06-28 | D-2 (Welle 0) | — | BLOCKIERT: gitignoren der staff/support-Bundles unsicher ohne bestätigten Build-on-Deploy (Prod-404-Risiko). Owner-Entscheidung offen |
