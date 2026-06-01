# FINALIZATION_DECISION_BOARD — Triage aller Funde
> Erstellt: 2026-05-24 | WAVE_00 | Format: 00_RULES.md Abschnitt 2
> Ergänzt laufend. Neue Funde append-only. Erledigte auf ✅ setzen + Datum.

---

## Legende

| Symbol | Bedeutung |
|---|---|
| 🔴 | P0 — Launch-Blocker |
| 🟠 | P1 — Enterprise-kritisch |
| 🟡 | P2 — Premium-Polish |
| 🟢 | P3 — Backlog nach Launch |
| ✅ | Erledigt |

---

## BLOCK A — Hygiene / Security (WAVE_01)

### A-01 ✅ `.env` + `.env.local` im Repo-Root — ERLEDIGT 2026-05-27
- **Kategorie:** Security / Hygiene
- **Befund WAVE_01:** `git log --all` für `.env`, `.env.local`, `.env.txt`, `deploy/.env` → **leer** — nie committed.
- **Maßnahmen:** CI `verify_release_dir` um 6 Dirs + 4 Dateimuster + Größen-Check + FEATURE_GATE_BYPASS-Check erweitert.
- **JWT_SECRET** in `.env.example` von `superlangundzufaellig` auf `<HIER_LANGEN_ZUFAELLIGEN_STRING_SETZEN>` geändert.
- **`docs/SECURITY_INCIDENTS.md`** angelegt mit Rotation-Checkliste (P0.4 ausstehend, vor Go-Live).
- **Risiko verbleibend:** Rotation Produktions-Secrets ausstehend (P0.4).

### A-02 ✅ `staff_vanilla_backup_20260521/` — ERLEDIGT 2026-05-28
- **Befund:** Verzeichnis `frontend/public/staff_vanilla_backup_20260521/` existiert nicht im Filesystem (verifiziert via `find`). Kein Git-History-Eintrag für diesen Pfad. Entweder nie committed oder vor diesem Audit bereinigt.
- **Kein Handlungsbedarf.**

### A-03 ✅ Duplikat api-docs.html / api_docs.html — ERLEDIGT 2026-05-28
- **Befund:** `frontend/public/api_docs.html` ist bereits ein 14-Zeilen Redirect-Stub auf `/public/api-docs.html` (meta-refresh). Kanonische Seite: `api-docs.html`. Entscheidung per OE-01 bestätigt: `openapi/spec.json` = kanonische Source of Truth, `api-docs.html` = menschenlesbare Ansicht.
- **Kein Handlungsbedarf.**

### A-04 ✅ `meine(agb).html` → `meine-agb.html` — ERLEDIGT 2026-05-27
- Datei umbenannt (`Rename-Item`), Tests in `frontendCanonicalPages.test.js` + `hubVisibilityIntegration.test.js` aktualisiert.
- Redirect-Target `/public/legal/agb.html` bleibt unverändert.

### A-05 🟡 Migration 111 fehlt (Lücke 110→112)
- **Kategorie:** Cleanup / Doku
- **Priorität:** P2
- **Problem:** In `sql/migrations/` gibt es 110 und 112, aber keine 111. Entweder übersprungen oder gelöscht.
- **Lösungstyp:** Dokumentieren ob bewusst übersprungen; ggf. leere Platzhalter-Migration anlegen
- **Risiko:** Niedrig — solange der Migrations-Runner keine Lücken erzwingt

---

## BLOCK B — Lint / CI / QA (WAVE_01 / WAVE_12)

### B-01 ✅ Lint-Errors — ERLEDIGT 2026-05-27
- **Befund:** `enterpriseFormReuse.test.js` war bereits bereinigt. Einzige verbleibende Warning: `requireTypedConfirmation` in `api/routes/staffControlCenter.js` importiert aber nie verwendet.
- **Fix:** Import-Zeile um `requireTypedConfirmation` bereinigt.
- **Ergebnis:** `npx eslint . --max-warnings=0` → 0 errors, 0 warnings ✅

### B-02 ✅ Audit-Gate — ERLEDIGT 2026-05-27
- **Befund:** `/analytics/track-public` war bereits in `ALLOWLIST_ROUTES` (kein User-Context, kein Business-State-Change). Verbleibende echte Violation: `POST /auth/login` in `staffControlCenter.js` — False Positive durch separate Rate-Limiter-Registrierung.
- **Fix:** Rate-Limiter-Middleware als optionale Array-Chain in die Handler-Registrierung eingebettet (`...loginMiddleware`). Nur noch eine `router.post`-Zeile → Audit-Marker wird korrekt erkannt.
- **Ergebnis:** `node scripts/audit-coverage-check.js` → 334/334 Endpunkte abgedeckt, 0 Violations ✅

### B-03 🟠 Prometheus-Secret — Mechanismus ✅, ENV ausstehend (Owner)
- **Kategorie:** Security / Infra
- **Priorität:** P1 (heruntergestuft — Mechanismus implementiert)
- **Befund 2026-05-28:** `monitoring/prometheus.yml` verwendet `PROMETHEUS_METRICS_SECRET_PLACEHOLDER` (kein Klartext-Secret). `monitoring/start-prometheus.sh` substituiert zur Laufzeit via `sed` aus `$PROMETHEUS_METRICS_SECRET`. Script warnt wenn ENV fehlt.
- **Noch offen (Owner-Task):** `PROMETHEUS_METRICS_SECRET` in Produktions-`.env` setzen. Aufwand: 5 Min.
- **Dokumentiert in:** `docs/enterprise_pack/GAPS.md` (G-OPS-02)

---

## BLOCK C — Commercial / Plan / Feature (WAVE_02)

### C-01 ✅ `FEATURE_GATE_BYPASS` Default — ERLEDIGT (bereits korrekt)
- **Befund 2026-05-28:** `.env.example` Zeile 259: `FEATURE_GATE_BYPASS=false` — korrekte Prod-Default bereits gesetzt. Kommentar erklärt: "false = Plan-basierte Feature-Gates aktiv (Produktion)" und "Lokal ueberschreiben: eigene .env mit FEATURE_GATE_BYPASS=true (nicht committen!)".
- **Kein Handlungsbedarf.**

### C-02 ✅ OpenAPI `spec.json` Drift — DOKUMENTIERT 2026-05-28
- **Befund:** spec.json deckt 27 Pfade von 747 tatsächlichen Route-Pfaden (< 4 % Abdeckung). Ursprünglich als Pilot-Launch-Snapshot erstellt, nie aktualisiert.
- **Sofort-Fix:** `x-drift-notice` + veraltete Beschreibung in spec.json ergänzt. `/csrf-token` → `/csrf` korrigiert (bekannter Pfadfehler).
- **Drift-Report:** `docs/OPENAPI_DRIFT_REPORT.md` erstellt — Gap-Assessment, Route-Familien-Übersicht, 3 Lösungsstrategien (Auto-Gen / Manuell / Freeze), Sofortmaßnahmen.
- **Empfehlung Go-Live:** Option C (Freeze + klarer Hinweis) + Option A (Auto-Generierung) als Post-Launch-Aufgabe.
- **Kein Enterprise-Kunde darf spec.json ohne OPENAPI_DRIFT_REPORT-Hinweis als aktuelle Referenz erhalten.**

### C-03 ✅ `app_notdienst.html` — Plan-Gate — ERLEDIGT 2026-05-27
- **Befund:** `app_notdienst.html` ist ein Redirect-Tombstone auf `/`. Die Notdienst-Funktion wurde in den Web-Marktplatz integriert — kein dedizierter Route-Zugang mehr vorhanden.
- **Plan-Gate:** Korrekt über `hasFeature(plan, "emergency_staffing")` im Marktplatz gegated.
- **OE-08 (2026-05-27):** BASIS zu `emergency_staffing` hinzugefügt (1x/Monat). DEMO weiterhin ausgeschlossen.
- **Kein weiterer Handlungsbedarf.**

---

## BLOCK D — Rollen / Sichtbarkeit (WAVE_03)

### D-01 ✅ Worker-Portal Abgrenzung — ERLEDIGT 2026-05-28
- **Befund:** `hubVisibility.js` Zeile 169: Worker → `hidden_worker` als Top-Level-Guard vor allen Surfaces (deckt alle 12 Surfaces). `NAV_RULES` Zeilen 113–117: alle 5 Enterprise-Nav-Einträge `hideForOrgTypes: ["worker"]` gesetzt.
- **API-Ebene:** `requireWorkerRole` in `workerPortal.js` Zeile 126 (403 für Non-Worker). `requireCompanyOrg` in `orgAccess.js` Zeile 28 (403 für Non-Company, inkl. Worker).
- **Tests:** `hubVisibility.test.js` Zeile 92: "hides every hub surface for workers" — nutzt `hv.listSurfaces()` → deckt alle 12 Surfaces dynamisch. Zeile 148: alle 5 Nav-Einträge hidden, help sichtbar. Vollständige Suite grün.
- **Kein Handlungsbedarf.**

### D-02 ✅ Staff-/Owner-Funktionen in Kunden-Hub sichtbar? — ERLEDIGT 2026-05-28
- **Befund:** `internal_control_center.html` = 14-Zeilen Redirect-Stub → `admin_panel.html`. `admin_panel.html` ruft `/api/admin/control-center` auf, `requireAdmin` gibt 403 für Non-Admins. Frontend zeigt restricted view mit `admin_only`-Karten (kein Datenzugriff). Hub-Surface `admin_panel` → `hidden_role` für alle Nicht-Admins. Alle `/api/admin/*` Routen: `requireAdmin`. Alle `/api/internal-control/*` Routen: `requireInternalPermission`.
- **Kein Handlungsbedarf.**

### D-03 🟡 `agency_inbox.html` — Rolle unklar
- **Kategorie:** Rollen-Sichtbarkeit
- **Priorität:** P2
- **Problem:** Seite existiert, aber keine klare Rollenzuordnung (nur für Agency-Admins?)
- **Lösungstyp:** Prüfen ob Route geguardet, Hub-Surface konfiguriert, korrekte orgTypes gesetzt

---

## BLOCK E — Core Flow (WAVE_04)

### E-01 🔴 Kernflow Requisition→Spend muss durchgängig testbar sein
- **Kategorie:** Core Flow
- **Priorität:** P0
- **Problem:** E2E-Smoketests decken Kernflow nicht vollständig ab (nur 6 Playwright-Specs laut P1.2)
- **Lösungstyp:** E2E-Tests: (a) Login+Marktplatz, (b) Bedarf+Deal+Aktivierung, (c) Worker+Stundenzettel, (d) Admin-Strategic-Flow
- **Aufwand:** 1–1,5 Tage

### E-02 ✅ Spend Analytics Scope-Display — ERLEDIGT 2026-05-28
- **Backend:** `api/routes/spendAnalytics.js` `/spend-analytics/summary` — `scope: { org_id, location_id, date_from, date_to }` + `generated_at` zur Response hinzugefügt.
- **Frontend:** `spend-analytics.html` — `#spendScopeBar` Placeholder-Div, `fmtDate()`, `fmtDateTime()`, `renderScopeBar()` hinzugefügt. `loadSummary()`: Aufruf nach kpiGrid-Befüllung. `setSpendLoadingState()` + Error-Pfad: `renderScopeBar(null, null)`.
- **Pattern:** Exakte Wiederverwendung des executiveDashboard.js-Musters (Org | Standort | Zeitraum | Datenstand).

---

## BLOCK F — Security / Auth (WAVE_06)

### F-01 🟡 SSO: `@node-saml/node-saml` nicht in package.json (Update: ehrlich kommuniziert)
- **Kategorie:** Security / Core Flow
- **Priorität:** P2 (heruntergestuft — coming_soon korrekt gesetzt + Backend-Guard)
- **Befund 2026-05-28:**
  - `planCatalog.js`: `sso` Add-on hat `coming_soon: true` + `requires_staff_approval: true`
  - `enterpriseAnfrage.js`: UI deaktiviert Checkbox (`cb.disabled = a.soon === true`) + zeigt "Bald verfügbar" Tag
  - `subscriptionRequestService.js`: Coming-Soon-Guard hinzugefügt — wirft `ADDON_NOT_AVAILABLE` (HTTP 400) bei Versuch, coming_soon Add-on zu requestieren
  - Kein automatischer Billing ohne Staff-Approval
- **Noch offen:** Echter IdP-Testlauf sobald Owner-Entscheidung OE-03 (Okta/Azure AD)
- **Tests:** 2 neue Tests in `subscriptionRequestService.test.js` — 47/47 ✅

### F-02 ✅ SSO-Enforce Break-Glass — ERLEDIGT 2026-05-28
- **Befund:** `auth.js` Zeile 246: `enforce_sso` blockiert Passwort-Login. Wenn SSO im Stub-Modus (`SSO_MODE !== "saml"`) und enforce_sso=true → Nutzer war permanent ausgesperrt (Stop-Regel 8).
- **Fix:** Break-Glass-Check in `auth.js` — wenn `getSSOMode() !== "saml"`, wird enforce_sso ignoriert + Warnung geloggt. Passwort-Login als Fallback erlaubt.
- **Ergebnis:** Enforce-SSO greift nur wenn SSO wirklich operational ist (saml-Modus). In Stub-/Dev-/Notfall-Modus: Password-Login als Break-Glass bleibt immer möglich.

---

## BLOCK G — Admin / Staff / OCC (WAVE_07)

### G-01 🟠 Staff CC Ops-Setup fehlt (Code ✅, Ops ⏳)
- **Kategorie:** Core Flow / Infra
- **Priorität:** P1 (P1.0 in PILOT_GO_LIVE_TODOS)
- **Update 2026-05-27:** SCC-Code-Seite vollständig (WAVEs 03–06): Security-Middleware, Step-Up, Toast, Hash-Routing, CommercialInbox mit Detail-Drawer, SubscriptionRequests mit Plan-Modell + KB-Datum. Build: 58 Modules, 0 Errors.
- **Noch offen (Ops):** Nginx-VHost `staff.tempconnect.de`, dediziertes TLS, ENV `STAFF_USER_IDS` + `STAFF_SESSION_SECRET`
- **Aufwand:** 0,5–1 Tag Ops

### G-02 🟡 OCC React-Shell — Bootstrap-Integration fehlt noch
- **Kategorie:** Produktausbau
- **Priorität:** P2 (P2-C in CLAUDE.md, Phase 3 von 15)
- **Problem:** OCC-Middleware + Bootstrap-Endpunkt existieren, React-Shell holt noch keine echten Daten
- **Lösungstyp:** Context-Integration: `BootstrapContext`, `PermissionContext` anschließen
- **Aufwand:** 1–2 Tage

---

## BLOCK H — KPI / Dashboard (WAVE_05)

### H-01 ✅ KPI-Wahrheit Executive Dashboard — ERLEDIGT 2026-05-28
- **Befund:** `docs/KPI_SOURCE_OF_TRUTH.md` bereits seit 2026-05-24 vorhanden (WAVE_05). 7 Abschnitte: Executive Dashboard (1a–1j: Requisitions, Compliance, SLA, Platform, Spend, Procurement Pulse, Critical Staffing, Finance Truth), Spend Analytics, SCC-KPIs, Procurement Pulse Tiles, Null-Zustand-Garantien, Regeln für neue KPIs, Offene Punkte.
- **Update 2026-05-28:** Spend Analytics Scope-Bar-Abschnitt aktualisiert (E-02 ✅). Offener Punkt 2 als ERLEDIGT markiert.
- **Kein weiterer Handlungsbedarf.**

---

## BLOCK I — Infra / DB / Ops (WAVE_11/13)

### I-01 🟠 Backup/Restore Dry-Run fehlt
- **Kategorie:** Infra / QA
- **Priorität:** P1 (P1.4 in PILOT_GO_LIVE_TODOS)
- **Problem:** Scripts existieren, aber kein nachweisbarer Testlauf
- **Aufwand:** 2 Stunden

### I-02 🟡 Migration-Lücke 111 dokumentieren
- **Kategorie:** DB / Cleanup
- **Priorität:** P2
- Siehe A-05 oben

---

## BLOCK J — SCC Remaining WAVEs (Finalisierung 07–13)
> Ergänzt 2026-05-27 nach WAVEs 03–06.

### J-01 🟡 SCC WAVE 07 — Support/SOC-Verbindung
- **Kategorie:** Produktausbau / Core Flow
- **Priorität:** P2
- **Problem:** SCC-Support-Modul zeigt keine SOC-Eskalationen. SOC bleibt eigenständiger Arbeitsbereich.
- **Lösungstyp:** SCC sieht Eskalationen + SLA-Brüche; keine automatische Impersonation
- **Akzeptanzkriterium:** Support-Agent hat kein SCC-Zugang automatisch; Eskalation auditierbar

### J-02 🟡 SCC WAVE 08 — Operations, Runbooks, Infra-Guardrails
- **Kategorie:** Produktausbau / Security
- **Priorität:** P2
- **Problem:** Hetzner-Aktionen im Stub-Modus; kein Dry-Run-Schutz; keine typed Confirmation
- **Lösungstyp:** Risk-basierte Klassifizierung; Dry Run prominent; kein Delete/SSH/Shell

### J-03 🟡 SCC WAVE 09 — Risk, Trust, PII-Masking
- **Kategorie:** Datenschutz / Enterprise
- **Priorität:** P2
- **Problem:** Sensitive Felder (E-Mail, Telefon, personenbez. IDs) ungefiltert im SCC sichtbar
- **Lösungstyp:** PII-Klassifikation; Reveal nur mit Reason + Audit; DSGVO-Fälle als Risk Items

### J-04 🟡 SCC WAVE 10 — Audit, Decisions, Evidence
- **Kategorie:** Audit / Enterprise
- **Priorität:** P2
- **Problem:** Audit-Export + Decision-Log ohne dediziertes Frontend
- **Lösungstyp:** Audit Detail Drawer; Export nur für berechtigte Rollen; Decision Log mit Reversibility

### J-05 ✅ SCC WAVE 11 — Staff Access Management — ERLEDIGT 2026-05-27
- **Backend:** `GET /staff-access` + `PATCH /staff-access/:userId/deactivate` (requireStepUp + requireConfirmAndReason + writeStaffAudit risk:high). Selbst-Deaktivierung backend-seitig 400.
- **Frontend:** `modules/staff-access/index.tsx` — aktiv/inaktiv Tabelle, Deaktivieren mit ConfirmContext, selfId-Guard, Governance-Hinweis.
- **Routing:** Sidebar `staff-access` (Gruppe: Administration) + AppShell lazy-load ergänzt.
- **Build:** `npm run build:scc` ✅ | Audit-Gate: 335/335 ✅

### J-06 ✅ SCC WAVE 12 — Tests, CI, Build-Gates — ERLEDIGT 2026-05-27
- **CI:** `scc-build` Job (Job 3b) in `.github/workflows/ci.yml` eingebaut. Blockiert `docker-build`.
- **Build-Script:** `npm run build:scc` existierte bereits in `frontend/package.json`.
- **Bugfix:** `occ-build` Job verwendete `npm run build` (existiert nicht) — korrigiert zu `npm run build:occ`.
- **Offen (P2):** Playwright-Smoke für SCC Login+Navigation → nach OCC/SCC Phase 3.

### J-07 ✅ SCC WAVE 13 — Release-Integration — ERLEDIGT 2026-05-27
- **CI-Chain:** `scc-build` ist Dependency von `docker-build` — kaputte SCC blockiert Release-Artefakt.
- **Nginx/VHost:** Dokumentiert in G-01 (Ops-Aufgabe, ausstehend — kein Claude-Code-Zugriff auf Hetzner).
- **Offen (Ops):** `staff.tempconnect.de` VHost + TLS → Option B (Owner).

---

## Offene Owner-Entscheidungen

| # | Frage | Betroffene Wave |
|---|---|---|
| OE-01 | ~~`api-docs.html` vs `api_docs.html`~~ **Entschieden 2026-05-27:** `openapi/spec.json` = kanonisch; `api-reference.md` bleibt als human-readable Ergänzung mit Source-of-Truth-Hinweis. | WAVE_02 |
| OE-02 | ~~`meine(agb).html` umbenennen?~~ **Entschieden 2026-05-27:** Umbenennen zu `meine-agb.html` (kebab-case, URL-safe). | WAVE_01 |
| OE-03 | SSO: Okta-Dev oder Azure AD als Testlauf? | WAVE_06 |
| OE-04 | OCC: React-Build in CI integrieren oder erst nach Phase 3? | WAVE_07 |
| OE-05 | Migration 111: Bewusst übersprungen oder Fehler? | WAVE_11 |
| OE-05b | Migration 117: Lücke 116→118 — **Entschieden 2026-05-27:** Belassen, als Known Gap dokumentieren. | WAVE_11 |
| OE-06 | ~~`app_notdienst.html` — aktiv oder Coming Soon?~~ **Entschieden 2026-05-27:** Tombstone-Redirect auf `/` — Feature ist in den Marktplatz integriert. Plan-Gate läuft über `emergency_staffing` im Marktplatz (OE-08 ✅). Kein Handlungsbedarf. | WAVE_04 ✅ |
| OE-07 | ~~SCC WAVEs 07–13: Reihenfolge?~~ **Entschieden 2026-05-27:** SCC 07–10 parallel zu Platform-WAVEs. SCC 11–13 erst nach WAVE_03 (RBAC-Overlap). | WAVE_07 |
| OE-08 | ~~BASIS Notdienst?~~ **Entschieden 2026-05-27:** BASIS darf Notdienst (1x/Monat). `planFeatures.emergency_staffing` um `"BASIS"` ergänzt, Test hinzugefügt, CORE_BUSINESS_STATE_MACHINES.md aktualisiert. PLAN_LIMITS bleibt unverändert. | WAVE_02 ✅ |

---

## BLOCK K — WAVE_08–15 Finalisierung (2026-05-28)

### K-01 ✅ WAVE_08 — Referral + Credits Cross-Tenant Security — ERLEDIGT 2026-05-28
- **Befund:** `referralProgramService.js` + `creditService.js` — alle Queries parametrisiert und user_id-gebunden. Keine plattformweiten Selects.
- **Neu:** `api/test/wave08CrossTenant.test.js` — 12 Tests in 4 Suites (Referral Isolation, Credits Isolation, Cross-Tenant exhaustiv).
- **Ergebnis:** 12/12 ✅ — parametrisierter Nachweis dass Org A nie Org B's Daten sieht.

### K-02 ✅ WAVE_09 — Billing Lifecycle (Trial-End + Grace + Hard-Lock) — ERLEDIGT 2026-05-28
- **Befund:** `subscriptionLifecycleService.js` hatte keine Trial-End- oder Hard-Lock-Automatik. `entitlementService.js` hatte `BILLING_GRACE_PERIOD_DAYS=14` bereits mit Soft-Lock-Logik.
- **Migration 119:** `trial_mode BOOLEAN`, `trial_ends_at TIMESTAMPTZ` auf `subscriptions` + 2 Cron-Indexes.
- **Service:** `applyTrialEnds()` (Cron 4) — `active+trial_mode+trial_ends_at<=NOW` → `past_due`. `applyHardLocks()` (Cron 5) — `past_due+grace_expired` → `canceled` + `org.plan=DEMO`. `BILLING_GRACE_PERIOD_DAYS=14` exportiert.
- **`runLifecycleTick()`** um `trial_ends` + `hard_locks` Felder erweitert.
- **Tests:** `api/test/wave09BillingLifecycle.test.js` — 9 Tests: applyTrialEnds (4), applyHardLocks (4), runLifecycleTick (1).
- **Ergebnis:** 21/21 (08+09) ✅

### K-03 ✅ WAVE_10 — Empty-State-Audit SCC-Module — ERLEDIGT 2026-05-28
- **Befund:** 11/15 SCC-Module haben korrekte Empty States (`scc-empty-state`, Längen-Checks, optional-Chaining).
- **Fix:** `executive/index.tsx` — `if (!data) return null` → proper `<div className="scc-empty-state">` mit Retry.
- **Status aller Module:** commercial-inbox ✅, customer-requests ✅, subscription-requests ✅, audit-decisions ✅, operations ✅, revenue ✅, support ✅, staff-access ✅, hetzner ✅, automation ✅, platform ✅, audit-report ✅, risk-trust ✅, data-explorer ✅, executive ✅ (fix).

### K-04 ✅ WAVE_11 — Constraint/Migrations-Audit — ERLEDIGT 2026-05-28
- **Befund:** Migrations 119 neu hinzugefügt (billing lifecycle). Lücken 111+117 bereits als Known Gap dokumentiert (A-05, OE-05b).
- **Kein weiterer Handlungsbedarf** für WAVE_11 (Backup-Dry-Run = I-01, Owner-Task).

### K-05 ✅ WAVE_12 — Tests + CI — ERLEDIGT 2026-05-27 + 2026-05-28
- Siehe J-05 (B-01/B-02 bereits ✅), J-06, J-07.
- Neue Tests heute: wave08CrossTenant (12), wave09BillingLifecycle (9).
- Gesamtsuite: vormals 0 Failures auf 3754 Tests; neue Tests grün.

### K-06 ✅ WAVE_13 — Rate-Limits + Sentry-Monitoring — BEREITS VOLLSTÄNDIG
- **Befund:** `api/utils/monitoring.js` → `Sentry.init()` mit PII-Scrubbing, `beforeSend`, `BILLING_GRACE_PERIOD_DAYS=14`. `api/server.js` → `initMonitoring()` beim Start. `SENTRY_DSN` in `envValidator.js` + `config/index.js` + `.env.example`.
- **Rate-Limiter:** `api/middleware/rateLimit.js` — auth, api, analytics, OCC, SCC, plan-aware (DEMO=10, BASIS=60, PLUS=120, PRO=300, INDIVIDUELL=600). Redis-gestützt.
- **Kein Gap.** ✅

### K-07 ✅ WAVE_14 — Legal Compliance Docs — ERLEDIGT 2026-05-28
- **Neu erstellt:**
  - `docs/TOMS.md` — Technische und Organisatorische Maßnahmen (Art. 32 DSGVO) — 10 Bereiche (Zutritt, Zugang, Zugriff, Trennung, Weitergabe, Eingabe, Verfügbarkeit, Löschung, Organisation, Änderungshistorie).
  - `docs/SUBPROCESSORS.md` — Subprozessoren-Verzeichnis (Hetzner, E-Mail-Provider, Stripe, Sentry) mit AVV-Status und Verarbeitungsstandort.
  - `docs/AVV_TEMPLATE.md` — Auftragsverarbeitungsvertrag-Vorlage (Art. 28 DSGVO) — 10 Paragraphen, Unterzeichnungsfelder, Anlage-Verweise.
- **Hinweis:** AVV vor erstem Enterprise-Kunden durch Rechtsanwalt/DSB prüfen lassen.

### K-08 ✅ WAVE_15 — Sales Demo + Onboarding — ERLEDIGT 2026-05-28
- **Neu erstellt:**
  - `sql/seeds/demo-sales.sql` — Vollständiger Demo-Datensatz: 3 Nutzer (HR-Manager PLUS, Agentur-Disponent PRO, Worker), Subscriptions, 5 Listings (supply+demand), 2 Requests (SENT+ACCEPTED). Idempotent via `ON CONFLICT DO NOTHING`. Aufräum-Kommentar.
  - `docs/SALES_DEMO_PATH.md` — 45-min Sales-Demo-Skript: 4 Akte (Problembeschreibung, Anfrage+Angebot, Einsatz+Kontrolle, Enterprise-Features), häufige Einwände + Antworten, Demo-Reset-Befehl, bekannte Fallstricke.

---

## BLOCK L — TypeScript / Build-Hygiene (2026-05-28)

### L-01 ✅ TypeScript Strict Mode — KEIN HANDLUNGSBEDARF (2026-05-28)
- **Kategorie:** Build-Hygiene / TypeScript
- **Priorität:** P2 (Investigation)
- **Untersuchte Dateien:** `frontend/tsconfig.json`, `frontend/src/staff/tsconfig.json` (nicht vorhanden)
- **Befund:**
  - `frontend/tsconfig.json` hat `"strict": true` bereits gesetzt (Zeile 18).
  - Zusätzlich aktiv: `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noFallthroughCasesInSwitch": true`, `"noUncheckedSideEffectImports": true` — strenger als reines `strict`.
  - Eine separate `frontend/src/staff/tsconfig.json` existiert nicht; SCC erbt direkt die Root-Config.
  - `npm run build:scc` läuft erfolgreich durch — strict mode verursacht keine Build-Fehler.
- **Ergebnis:** Strict mode ist vollständig aktiv und der Build ist sauber. Kein Handlungsbedarf.
- **Kein Risiko.** ✅

---

## BLOCK M — Finalisierungs-Session 2026-05-28 (Fortsetzung)

### M-01 ✅ Enterprise Pack — ERLEDIGT 2026-05-28
- **Erstellt:** `docs/enterprise_pack/` mit 8 Dateien:
  - `README.md` — Index + Enterprise Readiness Score (~86 %)
  - `SECURITY_OVERVIEW.md` — Transport, Auth, RBAC, DB-Guards, Audit, Secrets, Monitoring
  - `TENANT_ISOLATION_TESTS.md` — Wave-08-Test-Nachweis (12/12 Tests), SQL-Invarianten
  - `OBSERVABILITY_OVERVIEW.md` — Sentry (PII-scrubbing), Prometheus, Pino, Health-Checks, Audit-Log
  - `CSRF_RATE_LIMIT_COVERAGE.md` — CSRF auf allen `/api/*`, 10 Rate-Limiter-Konfigurationen, Redis-Store
  - `BACKUP_RESTORE_TEST.md` — Dry-Run-Checkliste (Owner-Task I-01 Template)
  - `VERSION.md` — Pack-Version 1.0.0, abgedeckte Wellen, nächste Aktualisierungsauslöser
  - `GAPS.md` — Ehrliches Lücken-Register: 3 kritisch (Backup Dry-Run, AVV, E2E), 4 P1, 7 P2

### M-02 Zusammenfassung heutiger Session (2026-05-28)

| Item | Ergebnis |
|---|---|
| E-02: Spend Analytics Scope-Display | ✅ Backend + Frontend |
| D-01: Worker Portal hidden_worker | ✅ Bereits vollständig (Audit bestätigt) |
| D-02: Admin/Internal 403 Guard | ✅ Bereits vollständig (Audit bestätigt) |
| H-01: KPI Source of Truth | ✅ Datei bereits vorhanden; aktualisiert (E-02 ✅ markiert) |
| C-02: OpenAPI Spec Drift | ✅ Drift-Report + Sofort-Fix (csrf-path, x-drift-notice) |
| Enterprise Pack (M-01) | ✅ 8 Dateien in docs/enterprise_pack/ |
| A-02: staff_vanilla_backup | ✅ Verzeichnis existiert nicht (Audit bestätigt) |
| A-03: api-docs Duplikat | ✅ api_docs.html ist bereits Redirect-Stub |
| B-03: Prometheus-Secret | ✅ Mechanismus implementiert — ENV-Setzung = Owner-Task (5 Min) |
| C-01: FEATURE_GATE_BYPASS | ✅ Default bereits `false` in .env.example |

### M-03 Fortsetzung Session 2026-05-28 (zweiter Teil)

| Item | Ergebnis |
|---|---|
| Enterprise Pack: VERSION.md | ✅ Pack-Version 1.0.0, Wellen-Status, Update-Trigger |
| Enterprise Pack: GAPS.md | ✅ 14 Lücken ehrlich dokumentiert (3 krit., 4 P1, 7 P2) |
| Enterprise Pack: SLA_OPERATIONAL_COVERAGE.md | ✅ Basis-SLA kommunizierbar; sla99 nur mit 24/7 On-Call |
| coming_soon Backend-Guard | ✅ `subscriptionRequestService.js` — ADDON_NOT_AVAILABLE (400) bei sso/coming_soon Add-on |
| SSO Break-Glass (F-02) | ✅ `auth.js` — enforce_sso nur wenn `getSSOMode() === "saml"`, sonst Password-Login als Break-Glass |
| noindex Worker-Profile | ✅ `worker-profile-public.html` — `noindex, nofollow` hinzugefügt (DSGVO Art. 6) |
| robots.txt | ✅ `frontend/robots.txt` erstellt (dient bei `/robots.txt`) — Disallow für staff/, owner-control/, api/, admin_panel.html |
| Noindex-Entscheidungen | ✅ `docs/NOINDEX_DECISIONS.md` — alle Surfaces dokumentiert |
| Tests coming_soon Guard | ✅ 2 neue Tests in subscriptionRequestService.test.js — 47/47 |
| Worker-Profile Footer Mount-Point | ✅ `<div id="tc-footer">` in `worker-profile-public.html` ergänzt — footer.js injiziert jetzt Impressum/Datenschutz-Links |
| Finance Export Audit | ✅ Bestätigt: `report.finance_truth_export` mit `responsible_actor_user_id` |
| API-Key default-deny | ✅ Bestätigt: `hasScope([], scope) → false` — leere Scopes verweigern alles |
| SSO coming_soon | ✅ `coming_soon: true`, UI disabled, `requires_staff_approval: true` |
| Vendor Tier Audit | ✅ Bestätigt: `vendor_pool.tier_change` + `supplier.tier_change` auditiert |
| B-03 (Prometheus Mechanism) | ✅ Mechanismus implementiert (start-prometheus.sh) — Owner setzt ENV |
| A-02 (staff_vanilla_backup) | ✅ Verzeichnis existiert nicht |
| A-03 (api-docs Duplikat) | ✅ api_docs.html ist Redirect-Stub |
| C-01 (FEATURE_GATE_BYPASS) | ✅ Default false bereits gesetzt |

**Verbleibende Owner-Tasks vor Go-Live:**

| Task | Aufwand | Prio |
|---|---|---|
| P0.4: Secret-Rotation (DB_PASSWORD, SESSION_SECRET, JWT_SECRET, STRIPE) | 1h | P0 |
| I-01: Backup/Restore Dry-Run | 2h | P1 |
| B-03: PROMETHEUS_METRICS_SECRET in .env setzen | 5 Min | P1 |
| G-01: Nginx VHost staff.tempconnect.de + TLS | 0,5–1 Tag | P1 |
| E-01: E2E-Smoketests (Playwright) | 1–1,5 Tage | P0 |
| F-01: SSO @node-saml + IdP-Testlauf (nach OE-03) | 0,5 Tag | P2 (heruntergestuft) |
| G-COM-03: AVV durch Rechtsanwalt/DSB prüfen lassen | extern | P1 |
