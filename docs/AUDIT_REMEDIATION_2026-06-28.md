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
| D-1 | **`/requests`-Flow** (`api/routes/requests.js` unmounted, aber Frontend ruft `/api/requests*` → 404) | (a) Router wieder mounten · (b) Frontend auf `/marketplace/demand-requests` umbiegen + Legacy löschen · (c) lassen | ⬜ |
| D-2 | **Build-Artefakt-Strategie** (30 gehashte Vite-Bundles getrackt) | (a) gitignoren + im Build/CI erzeugen (empfohlen) · (b) bewusst alle committen | ⬜ |
| D-3 | **`catalogVersionService`** wird nie getriggert | (a) beim Boot/Deploy einhängen (wenn Versionierung gewollt) · (b) Service + Test entfernen | ⬜ |
| D-4 | **Kanonische Go-Live-Liste** (`GO-LIVE.md` vs `MARKTSTART-CHECKLISTE.md` vs `docs/GO_LIVE_FINAL.md`) | eine als SSoT wählen, Rest auf Pointer reduzieren | ⬜ |
| D-5 | **OCC-Access-Middleware-Duplikat** (`ownerControlAccess.js` vs `requireOwnerControlAccess.js`) | (a) auf reichere `ownerControlAccess.js` (Step-Up + Confirm-Reason) migrieren · (b) ungenutzte löschen | ⬜ |

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
| F-2 | `/requests`-404-Bruch | gemäß D-1 umsetzen | 🟡 | ⬜ |
| F-3 | `catalogVersionService` nie getriggert | gemäß D-3 umsetzen | 🟡 | ⬜ |

---

## Welle 3 — Security-Härtung 🟡 · PRIO 2

| ID | Befund | Aktion | Status |
|---|---|---|---|
| S-1 | **SAML-Issuer nicht validiert** + Legacy-First-Config-Fallback (`ssoService.js`) | `idpIssuer = config.idp_entity_id` an SAML-Constructor; bei unbekanntem RelayState abbrechen statt „erste aktive Org". Owner-Freigabe (Security). | ⬜ |
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
| H-5 | `.catch(()=>{})` ×6 statt `swallow()` (invoices/search/timesheets) | durch `.catch(swallow('…'))` ersetzen | 🟢 | ⬜ |

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
