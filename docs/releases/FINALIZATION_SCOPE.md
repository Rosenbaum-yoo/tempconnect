# FINALIZATION_SCOPE — Phase 2 Release-Operativ-Schicht
> Erstellt: 2026-05-26 | Branch: release/enterprise-premium-market-ready
> Autorität: finalization/Phase2/README.md + CLAUDE.md

---

## 1. Zweck dieser Datei

Definiert verbindlich, was im Release-Branch `release/enterprise-premium-market-ready` als "fertig" gilt.
Kein Feature, kein System, kein Dokument gilt als fertig ohne Erfüllung der Abnahmekriterien in diesem Scope.

---

## 2. Ausgangszustand (Stand 2026-05-26)

| Metrik | Wert |
|---|---|
| Branch-Basis | `feat/occ-backend-oz` (HEAD: 8783776) |
| HTML-Seiten | 80 gesamt (68 root + 12 subdirs) |
| API-Routen | 85 (71 root + 14 OCC-Subdir) |
| Services | 123 |
| Middleware | 18 |
| SQL-Migrationen | ~115 (001–112 + Buchstaben-Varianten) |
| Letzte Migration | 112_multi_location_columns.sql |
| Testdateien | 160 |
| Testfälle | 3.836 (Stand 2026-05-24) |
| Test-Failures | 0 |
| Enterprise Readiness | ~82% |

### Phase-1-Wellen Status
| Wave | Titel | Status |
|---|---|---|
| WAVE_00 | Baseline | ✅ ERLEDIGT |
| WAVE_01 | Release Hygiene | ✅ ERLEDIGT (P0-Items: Lint, Audit-Gate, Prometheus) |
| WAVE_02 | Commercial / Plan | 🔴 P2.0 offen (INDIVIDUELL Tier-Schwellen) |
| WAVE_03 | Rollen / Sichtbarkeit | 🟠 D-01 offen (Worker-Portal), D-02 ERLEDIGT |
| WAVE_04 | Core Business | ✅ ERLEDIGT (Cross-Tenant Tests, State Machine, E2E-Specs) |
| WAVE_05 | KPI / Dashboard | ✅ ERLEDIGT (Scope-Bar, KPI_SOURCE_OF_TRUTH) |
| WAVE_06 | Security Audit | 🟠 F-01 offen (SSO @node-saml), API-Key-Scopes |
| WAVE_07 | Admin Centers | ✅ ERLEDIGT (Surface Isolation Tests) |
| WAVE_08 | Bonus / Credits | Zu prüfen |
| WAVE_09 | Billing | Zu prüfen |
| WAVE_10 | Premium UX | Zu prüfen |
| WAVE_11 | Database | Zu prüfen |
| WAVE_12 | QA / Tests | 🟠 P1.2 E2E-Smoketests |
| WAVE_13 | Observability | Zu prüfen |
| WAVE_14 | Legal / Datenschutz | Zu prüfen |
| WAVE_15 | Demo / Onboarding | Zu prüfen |

---

## 3. Phase-2-Wellen Scope

### Was IN SCOPE ist
Alle 17 Phase-2-Wellen gemäß `finalization/Phase2/WAVES.md`:

| Wave | Titel | Priorität |
|---|---|---|
| WAVE 00 | Freeze + Wahrheitspunkt | ✅ AKTIV |
| WAVE 01 | Release-Hygiene vollständig | P0 |
| WAVE 02 | Secrets, Env, Production-Safety | P0 |
| WAVE 03 | Frontend vollständig releasefähig | P0 |
| WAVE 04 | API, Tests, Dependency-Audit | P0 |
| WAVE 05 | Tenant-Isolation und RLS | P0 |
| WAVE 06 | Rollen, Pläne, Feature Gates | P1 |
| WAVE 07 | Pilot-Core-Flow | P1 |
| WAVE 08 | Executive Dashboard + KPIs | P1 |
| WAVE 09 | SSO / MFA | P1 |
| WAVE 10 | OpenAPI + API Surface | P1 |
| WAVE 11 | Security Hardening | P1 |
| WAVE 12 | Operations / Monitoring / Backup | P1 |
| WAVE 13 | Subscription / Pricing / Commercial | P2 |
| WAVE 14 | Premium UX | P2 |
| WAVE 15 | Enterprise Evidence Pack | P2 |
| WAVE 16 | Pre-Production Burn-in (7 Tage) | Gate |

### Was NICHT IN SCOPE ist (Phase 2)
- OCC Phase 3–15 (React-Module-Ausbau) — separater Branch
- Greenfield-Features ohne Ticket
- Load-Tests / Chaos-Tests (P2.2, P2.3 — erste Pilotwochen)
- Externe Integrationen ohne konkreten Pilotbedarf
- AGB/Datenschutz-Finalisierung (juristisch — Owner-Aufgabe)
- Domain-Kauf, DNS, TLS-Zertifikate (Infra — Owner-Aufgabe)

---

## 4. Definition of Done (Release-fähig)

TempConnect gilt als vollständig releasefähig, wenn ALLE folgenden Punkte erfüllt sind:

### Code & Build
- [ ] API: `npm ci`, `npm run lint`, `npm run build` grün
- [ ] API: `npm run test:ci` beendet sauber (keine offenen Handles)
- [ ] API: `npm audit --omit=dev` keine high/critical Vulnerabilities
- [ ] Frontend: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run lint:html` grün
- [ ] Frontend: `npm run build` und `npm run build:all` grün

### Security
- [ ] Keine echten `.env`-Dateien im Release-Artefakt
- [ ] Keine `node_modules`, `.git`, `.claude`, `.agents`, Coverage im Release
- [ ] Secrets vollständig aus Code entfernt (`.env.example` nur Platzhalter)
- [ ] `FEATURE_GATE_BYPASS=false` in Production
- [ ] Security Headers aktiv (HSTS, CSP, X-Frame-Options)
- [ ] CORS nicht wildcard für sensitive Routen
- [ ] Rate Limits aktiv (Login, Password Reset, API)
- [ ] `release-verify.sh` gibt grünen Report

### Tenant & RBAC
- [ ] Tenant A sieht nie Tenant B (Tests: `npm run test:tenant`)
- [ ] RLS deny-by-default (oder explizit dokumentierte Ausnahmen)
- [ ] Alle Pläne korrekt gegatet (Test: `npm run test:ci`)
- [ ] Worker-Portal isoliert (hidden_worker vollständig)

### Pilot-Core
- [ ] Pilot-Seed-Daten vorhanden (1 Company, 2-3 Agencies, 5-10 Worker)
- [ ] Kompletter Kernflow durchklickbar (keine 404 / 500)
- [ ] `npm run test:pilot` grün

### Dokumentation & Evidence
- [ ] `docs/enterprise-readiness/` vollständig (WAVE 15)
- [ ] `docs/releases/OPEN_BLOCKERS.md` — alle P0 geschlossen
- [ ] `docs/releases/RELEASE_ARTIFACT_REPORT.md` vorhanden
- [ ] Alle Gates A–F grün (`finalization/Phase2/GATES.md`)

### Burn-in
- [ ] ≥ 7 Tage stabiler Preprod-Betrieb (WAVE 16)
- [ ] Keine P0/P1-Fehler im Burn-in
- [ ] Backup/Restore nachgewiesen

---

## 5. Zielwerte

```
SaaS Professional Readiness   ≥ 9,5 / 10
Enterprise Premium Readiness  ≥ 9,0 / 10
Pilot Readiness               ≥ 9,5 / 10
Release-Hygiene              =  10 / 10
Marktstart                   =  GO (kein Conditional GO)
```

---

## 6. Nicht-verhandelbare Verbote (aus 00_RULES.md)

- Kein Fake-Data / Mock-KPIs in Produktions-UI
- Kein `innerHTML` ohne `esc()`
- Kein `if (!orgId) return null` ohne 400/403-Response
- Keine hardcodierten Farb-/Schwellwerte außerhalb Design-System
- Keine sensiblen Daten in Logs
- Keine Migrations ohne Rollback-Plan
- Keine Mutations ohne CSRF
- Keine sensiblen Routen ohne Org-Scope-Check serverseitig
- Keine Enterprise-Funktion verkaufen die nicht produktionsreif ist
- SSO entweder produktionsreif ODER vollständig soft-locked

---

## 7. Owner-Entscheidungen (offen)

| # | Frage | Betrifft Wave |
|---|---|---|
| OE-01 | `api-docs.html` vs `api_docs.html` — welche ist kanonisch? | WAVE 01 |
| OE-02 | `meine(agb).html` umbenennen? Externe Links? | WAVE 01 |
| OE-03 | SSO: Okta-Dev oder Azure AD als Testlauf, oder vollständig soft-locken? | WAVE 09 |
| OE-04 | OCC React-Build in CI, oder erst nach Phase 3? | WAVE 03 |
| OE-05 | Migration 111: Bewusst übersprungen oder Fehler? | WAVE 04 |
| OE-06 | `app_notdienst.html` — aktiv oder Coming Soon? | WAVE 07 |
