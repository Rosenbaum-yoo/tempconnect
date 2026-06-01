# OPEN_BLOCKERS — Offene Blocker für Marktstart
> Erstellt: 2026-05-26 | Branch: release/enterprise-premium-market-ready
> Quellen: FINALIZATION_DECISION_BOARD.md, PILOT_GO_LIVE_TODOS.md, FINALIZATION_BASELINE.md
> Pflege: Append-only. Erledigte auf ✅ + Datum setzen.

---

## Legende

| Symbol | Priorität | Bedeutung |
|---|---|---|
| 🔴 | P0 | Launch-Blocker — muss vor Marktstart geschlossen sein |
| 🟠 | P1 | Enterprise-kritisch — vor erstem Pilotkunden |
| 🟡 | P2 | Premium-Polish — erste Pilotwochen |
| ✅ | — | Erledigt |

---

## P0 — Launch-Blocker

### P0-01 ✅ Lint-Errors `enterpriseFormReuse.test.js`
- **Status:** ERLEDIGT (2026-05-24)
- **Ergebnis:** `npm run lint` exit 0, 0 Errors

### P0-02 ✅ Audit-Gate: POST /analytics/track-public
- **Status:** ERLEDIGT (2026-05-24)
- **Ergebnis:** 329/329 Endpunkte mit Audit-Coverage

### P0-03 ✅ Prometheus-Platzhalter-Secret
- **Status:** ERLEDIGT (2026-05-24)
- **Ergebnis:** `PROMETHEUS_METRICS_SECRET` via ENV injiziert

### P0-04 🔴 Secret-Rotation vor Go-Live
- **Status:** OFFEN (Owner-Aufgabe)
- **Kategorie:** Security / Infra
- **Problem:** SESSION_SECRET, STAFF_SESSION_SECRET, DB-Password, Stripe, Sentry müssen vor Prod-Betrieb rotiert werden
- **Aktion:** Anleitung in `PILOT_GO_LIVE_TODOS.md#P0.4` — Owner muss ausführen
- **Aufwand:** 20–30 Min
- **Wave:** WAVE 02
- **Verify:** App läuft, `curl .../api/health` → 200 OK

### P0-05 ✅ `staff_vanilla_backup_20260521/` öffentlich erreichbar
- **Status:** ERLEDIGT (2026-05-24) — Verzeichnis gelöscht

### P0-06 🔴 `.env` + `.env.local` im Repo prüfen (Release-Artefakt)
- **Status:** OFFEN
- **Kategorie:** Security / Hygiene
- **Problem:** `.env` und `.env.local` existieren im Repo-Root. Müssen zwingend außerhalb des Release-Artefakts bleiben.
- **Aktion:** `release-verify.sh` muss `.env` und `.env.local` als Blocker markieren
- **Wave:** WAVE 01 / WAVE 02
- **Verify:** `./scripts/release-verify.sh` → 0 env-Dateien im Artefakt

### P0-07 🔴 `release-package.sh` + `release-verify.sh` — CRLF + Ausschlussliste
- **Status:** OFFEN — Skripte existieren, aber nicht auf Phase-2-Standard geprüft
- **Kategorie:** QA / Release-Hygiene
- **Problem:** Release-Skripte müssen alle Ausschlüsse aus WAVE 01 Allowlist korrekt umsetzen
- **Wave:** WAVE 01
- **Verify:** `./scripts/release-verify.sh dist/*.zip` → grüner Report

### P0-08 🔴 `FEATURE_GATE_BYPASS=true` in Production verhindern
- **Status:** `.env.example` korrigiert (2026-05-24), aber Prod-Enforcement fehlt
- **Kategorie:** Commercial / Security
- **Problem:** Server muss beim Start mit `FEATURE_GATE_BYPASS=true` in Production eine Fehlermeldung ausgeben und stoppen
- **Wave:** WAVE 02
- **Verify:** `NODE_ENV=production FEATURE_GATE_BYPASS=true node api/server.js` → exit 1 mit Fehlermeldung

---

## P1 — Enterprise-kritisch (vor Pilotkunde)

### P1-01 🟠 Staff CC Ops-Setup
- **Status:** OFFEN (Owner-Aufgabe)
- **Kategorie:** Core Flow / Infra
- **Problem:** Code fertig (Migrationen 095/096, Router, Frontend), Nginx-VHost, ENV (`STAFF_USER_IDS`, `STAFF_SESSION_SECRET`), TLS fehlen
- **Aktion:** Nginx-VHost `staff.tempconnect.de`, TLS, ENV in Prod-Compose, optional IP-Allowlist
- **Aufwand:** 0,5–1 Tag (Ops)
- **Wave:** WAVE 12
- **Verify:** Login nur für Allowlist-User; Org-User → 403

### P1-02 🟠 SSO: `@node-saml/node-saml` nicht in package.json
- **Status:** OFFEN
- **Kategorie:** Security / Core Flow
- **Problem:** Dynamischer Import fällt auf `SSO_MODE="stub"` zurück wenn Paket fehlt. Enterprise-Kunden erwarten echtes SSO.
- **Entscheidung erforderlich (OE-03):** Produktionsreif machen ODER vollständig soft-locken
- **Aktion A (produktionsreif):** Dependency aufnehmen, echten IdP-Testlauf, ACS/Metadata/Signatur validieren
- **Aktion B (soft-lock):** Kein Stub in Production, UI zeigt "SSO anfragen", Endpunkte geben kein Fake-OK
- **Aufwand:** 0,5 Tag (A) oder 2 Stunden (B)
- **Wave:** WAVE 09
- **Verify:** `getSSOMode()` liefert weder Fake-OK noch crasht; Vertrieb darf SSO nicht als live verkaufen wenn B

### P1-03 🟠 E2E-Smoketests Pilot-Core-Flow
- **Status:** TEILWEISE ERLEDIGT — 4 Playwright-Specs für Kernflow erstellt (2026-05-24)
- **Kategorie:** QA
- **Problem:** `kernflow-*.spec.js` existieren syntaktisch korrekt, aber vollständiger CI-Lauf nicht nachgewiesen
- **Aktion:** `npx playwright test e2e/tests/kernflow-*.spec.js` in CI grün
- **Aufwand:** 1–1,5 Tage gesamt; Folge-Aufwand prüfen
- **Wave:** WAVE 04

### P1-04 🟠 Backup/Restore Dry-Run
- **Status:** OFFEN (Owner-Aufgabe)
- **Kategorie:** Infra / QA
- **Problem:** `scripts/backup.sh`, `backup-verify.sh`, `restore.sh`, `restore-test.sh` existieren aber kein nachweisbarer Live-Lauf
- **Aktion:** Einmal gegen Staging durchführen; Run-Log in `docs/releases/BACKUP_RESTORE_DRILL.md` ablegen
- **Aufwand:** 2 Stunden
- **Wave:** WAVE 12
- **Verify:** Run-Log zeigt erfolgreichen Restore in frische DB

### P1-05 🟠 OpenAPI `spec.json` Drift
- **Status:** OFFEN
- **Kategorie:** Doku / QA
- **Problem:** `api/openapi/spec.json` listet veraltete Pfade. Nach 85 Routen-Dateien ist Drift hoch.
- **Aktion:** `scripts/list-routes.js` gegen spec.json abgleichen; Diff bereinigen
- **Aufwand:** 2–3 Stunden
- **Wave:** WAVE 10
- **Verify:** Script-Diff zwischen list-routes und spec leer (oder Abweichungen dokumentiert)

### P1-06 🟠 Worker-Portal Abgrenzung (hidden_worker Suite)
- **Status:** OFFEN — hubVisibility.test.js hat Tests, aber hidden_worker-Suite vollständig?
- **Kategorie:** Rollen-Sichtbarkeit
- **Problem:** Zeitarbeiter (org_type: worker) dürfen ausschließlich Einsatzportal sehen. Alle Hub-Surfaces müssen hidden_worker enforzen.
- **Aktion:** hubVisibility.test.js hidden_worker-Suite komplett; kein worker-User sieht Company-Seiten
- **Wave:** WAVE 06
- **Verify:** `npm run test:unit` → hidden_worker-Suite vollständig grün

### P1-07 🟠 API-Key Scope-Enforcement (Finance-Routen)
- **Status:** OFFEN — `requireScope()` exportiert aber nirgendwo verwendet (toter Code)
- **Kategorie:** Security
- **Problem:** API-Key-Scopes sind dekorativ; Finance-Routen haben kein Scope-Gate
- **Aktion:** `requireScope('finance:read')` und `requireScope('finance:write')` auf relevante Routen wired
- **Wave:** WAVE 11
- **Verify:** API-Key ohne finance-Scope → 403 auf `/invoices/*`

### P1-08 🟠 Cross-Tenant RLS Deny-by-Default
- **Status:** ZU PRÜFEN — Tests existieren (coreFlowCrossTenant.test.js 19/19), aber DB-RLS-Policy?
- **Kategorie:** Security / Tenant-Isolation
- **Problem:** App-Level-Guards existieren, aber PostgreSQL RLS Policy muss deny-by-default sein
- **Aktion:** `TENANT_ISOLATION_MODEL.md` + RLS-Policy für alle tenant-scoped Tabellen
- **Wave:** WAVE 05
- **Verify:** `npm run test:tenant` grün; direkter DB-Zugriff ohne app.current_org_id → kein Datenzugriff

---

## P2 — Erste Pilotwochen

### P2-01 🟡 INDIVIDUELL Tier-Schwellen migrieren
- **Status:** GEPLANT
- **Problem:** `planFeatures.js` (30/250/999) vs `planCatalog.js` (50/150/350) — zwei Funktionen
- **Wave:** WAVE 06 / WAVE 13

### P2-02 🟡 Spend Analytics Scope-Display
- **Status:** OFFEN (P2-A in CLAUDE.md)
- **Problem:** `spend-analytics.html` zeigt keinen Scope-Bar
- **Wave:** WAVE 08

### P2-03 🟡 Vendor Pool + Rate Cards Scope-Hinweise
- **Status:** OFFEN (P2-B in CLAUDE.md)
- **Wave:** WAVE 08

### P2-04 🟡 Migration-Lücke 111 dokumentieren
- **Status:** OFFEN
- **Problem:** sql/migrations/ hat 110 und 112 aber keine 111
- **Wave:** WAVE 04 (DB)
- **Verify:** Owner-Entscheidung OE-05 vorher klären

### P2-05 🟡 `app_notdienst.html` Plan-Gate
- **Status:** OFFEN — Owner-Entscheidung OE-06 required
- **Wave:** WAVE 06

### P2-06 🟡 `meine(agb).html` Dateiname (Sonderzeichen)
- **Status:** OFFEN — Owner-Entscheidung OE-02 required
- **Wave:** WAVE 01

### P2-07 🟡 `api-docs.html` vs `api_docs.html` — Duplikat
- **Status:** OFFEN — Owner-Entscheidung OE-01 required
- **Wave:** WAVE 01

---

## Owner-Aufgaben (Claude Code kann diese NICHT selbst erledigen)

| # | Aufgabe | Priorität | Wave |
|---|---|---|---|
| M-01 | Secret-Rotation (SESSION_SECRET, DB-PW, Stripe, Sentry) | P0 | WAVE 02 |
| M-02 | Staff CC Nginx-VHost + TLS + STAFF_USER_IDS | P1 | WAVE 12 |
| M-03 | Backup/Restore Dry-Run gegen Staging | P1 | WAVE 12 |
| M-04 | SSO-Entscheidung (Okta-Dev ODER vollständig soft-locken) | P1 | WAVE 09 |
| M-05 | AGB / Datenschutz juristisch finalisieren | P1 | WAVE 15 |
| M-06 | Domain kaufen, DNS einrichten | Infra | WAVE 16 |
| M-07 | Tatsächliche Secret-Rotation durchführen (nach Anleitung) | P0 | WAVE 02 |
| M-08 | OCC-Entscheidung: React-Build in CI? | P2 | WAVE 03 |
| M-09 | Migration 111: Bewusst oder Fehler? | P2 | WAVE 04 |

---

## Entscheidungen ausstehend (Owner-Freigabe erforderlich)

| # | Frage | Impact |
|---|---|---|
| OE-01 | `api-docs.html` vs `api_docs.html` — welche kanonisch? | WAVE 01 |
| OE-02 | `meine(agb).html` umbenennen? Externe Links vorhanden? | WAVE 01 |
| OE-03 | SSO: produktionsreif (Okta/Azure) oder vollständig soft-locken? | WAVE 09 — KRITISCH |
| OE-04 | OCC React-Build in CI? | WAVE 03 |
| OE-05 | Migration 111: bewusst übersprungen oder Fehler? | WAVE 04 |
| OE-06 | `app_notdienst.html` — aktiv oder Coming Soon? | WAVE 06 |

---

## Gate-Status (Phase-2 Gates A–F)

| Gate | Titel | Status |
|---|---|---|
| A | Technical Readiness | 🔴 OFFEN (WAVE 01–05 ausstehend) |
| B | Security | 🔴 OFFEN (P0-04, P1-02, P1-07, P1-08) |
| C | Tenant Isolation | 🔴 OFFEN (P1-08 RLS-Status unklar) |
| D | Product Readiness | 🔴 OFFEN (Pilot-Core teilweise, OCC Phase 1) |
| E | Operations | 🔴 OFFEN (P1-01, P1-04 Backup/Restore) |
| F | Commercial / Legal | 🔴 OFFEN (AGB, Datenschutz, Secret-Rotation) |
