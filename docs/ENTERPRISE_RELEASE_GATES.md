# ENTERPRISE_RELEASE_GATES — Go-Live-Gate-Definitionen
> Erstellt: 2026-05-24 | WAVE_00 | Basiert auf: 01_PRIORITIES.md, WAVE_00, README.md Dependency-Gates
> Ziel: Keine Zweideutigkeit darüber, was "release-ready" bedeutet.

---

## Gate-Hierarchie

```
GATE 0: Technisch lauffähig (pre-flight)
  ↓
GATE 1: Pilot-Release (1–3 Pilotkunden intern)
  ↓
GATE 2: Externe Pilotkunden (Enterprise-Demo-fähig)
  ↓
GATE 3: Public Launch (allgemeine Verfügbarkeit)
  ↓
GATE 4: Enterprise Rollout (SSO, Custom Plans, Multi-Tenant)
```

---

## GATE 0 — Technisch lauffähig

**Kriterien (alle müssen erfüllt sein):**

| # | Kriterium | Wie prüfen | Status |
|---|---|---|---|
| G0.1 | Kein `.env`-File mit echten Secrets in Release-Artefakt | `grep -r "\.env$" .gitignore` + Release-ZIP prüfen | ⚠️ Prüfen |
| G0.2 | `npm run lint` exit 0, 0 Warnings | `npm run lint --prefix api` | ✅ exit 0 (2026-05-24) |
| G0.3 | `npm run test:unit` 0 Failures | Docker: `npm run test:unit` | ✅ 3836/3836 (2026-05-24) |
| G0.4 | `npm run audit:check` exit 0 | `audit-coverage-check.js` | ✅ 329/329 (2026-05-24) |
| G0.5 | Docker-Build ohne Fehler | `docker compose build` | ❓ verifizieren |
| G0.6 | Datenbank-Migrationen idempotent ausführbar | `docker exec db psql` + alle Migrations | ❓ verifizieren |
| G0.7 | Health-Endpunkt antwortet | `GET /api/health` → 200 | ❓ verifizieren |

---

## GATE 1 — Pilot-Release (intern)

**Dependency:** GATE 0 + WAVE_00..03 abgeschlossen

| # | Kriterium | Wie prüfen | Status |
|---|---|---|---|
| G1.1 | Kein Cross-Org-Datenleck in Kernrouten | Cross-Org-Negativtests (fremde org_id = 403) | ✅ (Tests grün) — `coreFlowCrossTenant.test.js` 19/19 (2026-05-24) |
| G1.2 | Staff Control Center erreichbar (Nginx + ENV) | Login auf `staff.tempconnect.de` | ❌ P1.0 offen |
| G1.3 | `FEATURE_GATE_BYPASS=false` in Prod-Env | Frischer Docker-Start, DEMO-User sieht keine PRO-Features | ✅ P1.3 erledigt (2026-05-24) |
| G1.4 | Kernflow testbar: Requisition→Deal→Assignment→Timesheet | E2E-Test grün | 🟡 E2E-Specs erstellt (4×kernflow-*.spec.js, 27 Tests) — Playwright-Lauf gegen Docker noch ausstehend |
| G1.5 | Admin-/Staff-Seiten NICHT für Org-User erreichbar | 403-Tests für admin/internal Routen | ✅ 14/14 Tests grün (2026-05-24) — /admin/control-center-Lücke gefixed, SCC-Isolation verifiziert |
| G1.6 | Plan-Gates aktiv auf Kernseiten | DEMO-User kann kein PRO-Feature nutzen | ❌ (Gate Bypass) |
| G1.7 | Prometheus-Secret kein Platzhalter | Monitoring zieht echte Metriken | ✅ env-var Substitution fertig — Ops muss PROMETHEUS_METRICS_SECRET setzen |
| G1.8 | Secret-Rotation abgeschlossen (P0.4) | SESSION_SECRET + DB_PASSWORD rotiert, Health-Check 200 | ❌ Checkliste in PILOT_GO_LIVE_TODOS P0.4 offen |

---

## GATE 2 — Externe Pilotkunden (Enterprise-Demo-fähig)

**Dependency:** GATE 1 + WAVE_04..07 abgeschlossen

| # | Kriterium | Wie prüfen | Status |
|---|---|---|---|
| G2.1 | SSO funktioniert mit echtem IdP ODER klar als Coming Soon deaktiviert | IdP-Testlauf | ❌ P1.1 offen |
| G2.2 | Commercial Source of Truth konsolidiert | `COMMERCIAL_SOURCE_OF_TRUTH.md` vollständig | ✅ Vollständig (2026-05-24) — 2 bekannte Widersprüche W-01/W-02 dokumentiert |
| G2.3 | KPI-Wahrheit im Dashboard (jede Zahl mit Quelle + Drilldown) | KPI_SOURCE_OF_TRUTH.md vollständig | ✅ WAVE_05 abgeschlossen (2026-05-24) — 8 KPI-Gruppen dokumentiert, PARTIALLY_FILLED integriert, 14 Tests grün |
| G2.4 | Rollenmatrix vollständig dokumentiert | `ROLE_VISIBILITY_MATRIX.md` vollständig | 🟡 State Machines dokumentiert in `docs/CORE_BUSINESS_STATE_MACHINES.md` (2026-05-24); Surface-Isolation WAVE_07: OCC/SCC/Internal/Admin/Support alle unit-getestet (2026-05-24) — Vollständige ROLE_VISIBILITY_MATRIX.md noch ausstehend |
| G2.5 | Backup/Restore Dry-Run dokumentiert | `docs/OPS_RUNBOOK.md` mit Testlauf-Log | ❌ P1.4 offen |
| G2.6 | API-Dokumentation aktuell (spec.json drift < 5 Routen) | `scripts/list-routes.js` vs spec.json | ❌ P1.5 offen |
| G2.7 | Empty States professionell (kein 500, kein endloser Spinner) | Manuelle Review aller Kernseiten mit leeren Daten | ❓ |
| G2.8 | Worker-Portal vollständig isoliert (hidden_worker auf allen Surfaces) | hidden_worker-Suite grün | ❓ |

---

## GATE 3 — Public Launch

**Dependency:** GATE 2 + WAVE_08..12 abgeschlossen

| # | Kriterium | Wie prüfen | Status |
|---|---|---|---|
| G3.1 | E2E-Test-Suite vollständig (min. 10 Kernflows) | `npm run test:e2e` grün | 🟡 10 Specs (6 bestehend + 4 kernflow-*) — Playwright-Lauf gegen Docker ausstehend |
| G3.2 | Datenschutz/AVV/TOMs abgebildet (WAVE_14) | Legal-Review + trust-Seiten korrekt | ❓ |
| G3.3 | Onboarding-Flow funktioniert für alle Rollen | E2E: Company + Agency + Worker Onboarding | ❓ |
| G3.4 | Rate Limiting auf Login/Invite/SSO/Finance/Admin | Manuelle Test-Rate-Limit | 🟡 WAVE_06 (2026-05-24): Login/Register ✅, SSO-Callback ✅, Finance-Export ✅, Admin-Export ✅, Invite ✅ — 11 Coverage-Tests grün. Redis-Store in Prod noch zu konfigurieren. |
| G3.5 | Audit-Export oder auditfähige Logs nachweisbar | Admin-Export oder LogDrain | ❓ |
| G3.6 | Alle P0/P1 der Waves 00–12 geschlossen | Decision Board ohne offene rote Punkte | ❌ |

---

## GATE 4 — Enterprise Rollout

**Dependency:** GATE 3 + WAVE_13..15 abgeschlossen

| # | Kriterium | Wie prüfen | Status |
|---|---|---|---|
| G4.1 | SSO (SAML) produktiv | Live-Testlauf mit Pilotkunden-IdP | ❌ |
| G4.2 | Custom Plans über Staff freigegeben (kein Hardcoding) | End-to-End: Subscription Request → Active | ✅ (Service fertig) |
| G4.3 | Multi-Tenant nachgewiesen (Cross-Org = 403 in Prod) | Pentest-Protokoll oder E2E-Cross-Org | ❓ |
| G4.4 | Public Profile Flow mit Einwilligung | Datenschutz-Review | ❓ |
| G4.5 | Finance Export nur mit Audit | Audit-Coverage-Check für Finance-Routen | ❓ |

---

## Dependency-Gates (aus README.md)

```
WAVE_00..03 → GATE 1 → WAVE_04+
WAVE_06 Security → Einsatzportal/Worker in WAVE_04 finalisierbar
WAVE_04 Assignments → Timesheets finalisierbar
WAVE_04 Timesheets → Kundenfreigabe/Customer Bundle
WAVE_04 vollständig → WAVE_05 KPI-Wahrheit
WAVE_14 Public Profiles → Public Launch (GATE 3)
WAVE_06 SSO → Enterprise Rollout (GATE 4)
```
