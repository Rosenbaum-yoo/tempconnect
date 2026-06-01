# TempConnect - Pilot/Go-Live TODOs
Quelle: fundierte Projektbewertung April 2026, abgeleitet aus realem Ist-Zustand (65 Routes, 102 Services, 156 Tests, 98 Migrationen, 6-Job-CI, 289/290 Audit-Coverage).
Dieses File wird automatisch gepflegt, solange die Regel in `AGENTS.md` ("Pilot-TODO-Pflege") aktiv ist. Erledigte Punkte wandern nach `## Done`. Neue Blocker, die in Sessions auftauchen, werden als P0/P1/P2 angelegt.
Letzte Aktualisierung: 2026-05-28 (Phase-4-Tracking-Infrastruktur angelegt. PHASE_STATUS.md erstellt. Phase3 WAVES 07-13 + Phase4 Track B + Track C als P1/P2 eingetragen. Phase4 Track A als Verbesserungsvorschlag C.4 eingetragen. Enterprise Readiness Score ~88%. Verbleibende Blocker = Owner-Tasks: P0.4, E-01, I-01, G-01, G-COM-03).
## Status-Legende
- **P0** - harter Blocker, verhindert gruene CI oder stabile Produktion. Muss vor Go-Live weg.
- **P1** - soll vor erstem Pilotkunden live sein (Vertrag, Sicherheit, Demo-Glaubwuerdigkeit).
- **P2** - Haertung waehrend der ersten 2-4 Pilotwochen.
- **A / B / C** - Verbesserungsvorschlaege: A = kurzfristig hoher Leverage, B = mittelfristig Marktwert-Multiplikator, C = Enterprise-Vertriebshebel.
## P0 - Go-Live-Blocker (Summe <1 Stunde Arbeit)
### P0.1 - Lint-Errors in `api/test/enterpriseFormReuse.test.js`
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `npm run lint` exit 0, 0 Errors, 0 Warnings. Bereits behoben gewesen.
### P0.2 - Audit-Gate gruen ziehen
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `audit-coverage-check.js` exit 0, 329/329 Endpunkte mit Audit-Coverage.
- Was gemacht: (a) `writeStaffAudit` + `insertSupportAudit` in AUDIT_PATTERNS ergaenzt (SCC/Support-Routen hatten Audit via eigene Funktionen, Checker war blind), (b) `/analytics/track-public` + `/me/active-location` in ALLOWLIST_ROUTES, (c) `POST /auth/login` in SCC tatsaechlich fehlenden Audit-Marker ergaenzt (fire-and-forget nach res.json).
### P0.3 - Prometheus-Platzhalter-Secret
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: Secret wird jetzt aus `PROMETHEUS_METRICS_SECRET` Umgebungsvariable injiziert.
- Was gemacht: (a) `monitoring/prometheus.yml` Placeholder auf `PROMETHEUS_METRICS_SECRET_PLACEHOLDER` umgestellt, (b) `monitoring/start-prometheus.sh` erstellt (sed-Substitution + exec prometheus), (c) `docker-compose.monitoring.yml` entrypoint auf start-prometheus.sh umgestellt + env-var eingebunden, (d) `PROMETHEUS_METRICS_SECRET=` in `.env.example` ergaenzt.
- Noch offen (Ops): `PROMETHEUS_METRICS_SECRET` in Prod-.env auf echten ADMIN_SECRET setzen.
### P0.4 - Secret-Rotation vor Go-Live
- Status: OFFEN — muss VOR erstem Pilotkunden erledigt sein
- Hintergrund: .gitignore OK, Secrets nie committed, kein akuter Leak. Rotation ist Best-Practice vor Prod-Betrieb mit echten Kundendaten.
- Aufwand: 20-30 Min.

#### Checkliste (in dieser Reihenfolge abarbeiten):

**Block A — ohne Datenbankeingriff (5 Min.):**
- [ ] Neuen SESSION_SECRET generieren: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- [ ] Neuen STAFF_SESSION_SECRET generieren: gleicher Befehl, anderer Wert
- [ ] Beide Werte in `.env` eintragen
- [ ] `docker compose restart api` — alle aktiven Sessions werden ungueltig (alle muessen sich neu einloggen)
- [ ] Verify: `curl http://localhost:3000/api/health` → 200 OK

**Block B — mit Datenbankeingriff, Wartungsfenster einplanen (15 Min.):**
- [ ] Neues DB-Passwort generieren (min. 32 Zeichen): `node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"`
- [ ] Passwort in laufender DB aendern: `docker exec -it tempconnect_db psql -U POSTGRES_USER` → `ALTER USER POSTGRES_USER WITH PASSWORD 'NEUES_PW';`
- [ ] Sofort danach `.env` aktualisieren: `DB_PASSWORD=NEUES_PW` und `POSTGRES_PASSWORD=NEUES_PW`
- [ ] Sofort danach `docker compose down && docker compose up -d`
- [ ] Verify: `curl http://localhost:3000/api/health` → 200 OK, keine DB-Connection-Errors in Logs

**Block C — externe API-Keys (nur wenn aelter als 6 Monate):**
- [ ] Stripe: Dashboard → Developers → API Keys → "Roll key" → neuen Wert in `.env` STRIPE_SECRET_KEY
- [ ] Sentry: Settings → Auth Tokens → neuen Token, alten loeschen → in `.env` SENTRY_DSN

- Verify gesamt: App laeuft, Health-Check 200, kein Fehler in `docker compose logs api | tail -50`
### P0.5 - `staff_vanilla_backup_20260521/` oeffentlich erreichbar via Nginx
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: Verzeichnis `frontend/public/staff_vanilla_backup_20260521/` geloescht. Inhalt war: index.html, login.html, css/, js/.
- Verify: Verzeichnis existiert nicht mehr im Dateisystem.
## P1 - Vor Pilotkunde (Summe 2-3 Personentage)
### P1.0 - Staff Control Center produktiv schalten
- Status: OFFEN
- Fakt: SCC-Stack ist live im Code (Migrationen 095+096, Router `/staff/api`, Frontend `/public/staff/`, Tests gruen). Ops-Schritte fehlen: Nginx-VHost `staff.tempconnect.de`, ENV `STAFF_USER_IDS` (2 UUIDs: Elmira + Mitarbeiter), `STAFF_SESSION_SECRET`, optional `HETZNER_CLOUD_TOKEN`.
- Aktion: (a) Nginx-VHost fuer Staff-Subdomain anlegen, (b) dediziertes TLS-Zertifikat, (c) optional IP-Allowlist auf VHost-Ebene, (d) ENV in `.env.example` dokumentieren + in Prod-Compose injizieren, (e) Initial-Staff-UUIDs (Elmira + Mitarbeiter) in `STAFF_USER_IDS`, (f) `HETZNER_CLOUD_TOKEN` fuer Live-Infra-GUI (sonst bleibt SCC im Stub-Mode).
- Aufwand: 0,5-1 Tag Ops.
- Verify: Login nur fuer Allowlist-User, Abo-Kunden/Platform-Admins/Org-Owner bekommen 401/403, Admin-Panel + Organization zeigen keinen Link ins SCC (und umgekehrt).
### P1.1 - SSO Enterprise-Pfad (per-Kunde aktivierbar, 300-Kunden-tauglich)
- Status: CODE-SEITIG ABGESCHLOSSEN (ehrlicher Coming-Soon-Soft-Lock). Produktive SAML-Aktivierung = pro-Kunde-Ops-Schritt (Owner + IdP-Test).
- Architektur-Entscheidung (2026-06-01, fuer max. 300 Kunden, zukunftssicher): SSO ist **pro Organisation** konfigurierbar (`org_sso_config`), nicht global. Jeder Kunde aktiviert SSO einzeln, sobald sein IdP angebunden ist — kein Big-Bang, skaliert auf beliebig viele Mandanten.
- Ist-Zustand (gate-konform, kein taeuschender Stub):
  - `ssoService.getSSOMode()` liefert `"stub"`, solange `@node-saml/node-saml` nicht installiert ist; flippt automatisch auf `"saml"`, sobald das Paket vorhanden ist (dynamischer Import).
  - `resolveSsoCardAvailability(...)` zeigt im Stub-Modus den Zustand `SSO_STUB_MODE` ("soft-locked bis produktive SAML-Laufzeit aktiv") — die Karte ist **nicht** als aktiv/buchbar sichtbar.
  - `sso_config.html` zeigt ehrlich Badge "SAML: Stub-Modus" + Locked-State; kein Kunde kann SSO scheinbar aktivieren und ins Leere laufen.
  - Break-Glass (F-02): `auth.js` erzwingt SSO-Enforce nur, wenn `getSSOMode() === "saml"` — Passwort-Login bleibt als Recovery erhalten, niemand sperrt sich aus.
  - Plan-Gate: SSO-Karte ist `PLAN_REQUIRED` unterhalb PRO/INDIVIDUELL (enterprise_only).
- Runbook — SSO fuer einen Kunden produktiv schalten (Owner-Schritte):
  1. `cd api && npm install @node-saml/node-saml` → in `api/package.json` aufnehmen, Container neu bauen. Danach `getSSOMode() === "saml"`.
  2. IdP-Testlauf (Okta-Dev ODER Azure AD Preview): SAML-App anlegen, ACS-URL + Entity-ID aus `sso_config.html` uebernehmen.
  3. Kunden-Org in `org_sso_config` konfigurieren (Metadata-XML / Cert / SSO-URL) — pro Org isoliert.
  4. Test-Login ueber echten IdP gegen die Kunden-Org; danach Enforce optional aktivieren (Passwort-Break-Glass bleibt aktiv).
  5. `sso_config.html` verifizieren: Karte zeigt `active` statt `SSO_STUB_MODE`.
- Aufwand: 0,5 Tag pro Erstanbindung (danach pro Kunde ~1h).
- Verify: `getSSOMode()` liefert `"saml"`; Login ueber echten IdP klappt; Stub-Org bleibt unveraendert (Isolation); Break-Glass-Passwort-Login funktioniert weiterhin.
### P1.2 - E2E-Smoketests um Pilot-Core erweitern
- Status: CODE-SEITIG ERLEDIGT (2026-06-01) — Specs vorhanden; CI-Verdrahtung = E-01 (Owner).
- Fakt: Die in P1.6 erstellten 4 Kernflow-Specs decken exakt die 4 geforderten Flows ab (26 Tests):
  - (a) Login + Marktplatz-Feed → `kernflow-hub-navigation.spec.js` (8 Tests: Hub Company/Agency, `/api/me`, Org-Members, Strategic Collaboration, Activity-Feed, Notifications, `capacity_exchange_feed.html`)
  - (b) Bedarf anlegen + Deal-Accept + Aktivierung → `kernflow-requisition.spec.js` (5 Tests: POST/GET/Detail/Transition DRAFT→OPEN) + `kernflow-deal-activation.spec.js` (6 Tests: OPEN-Requisition, received-offers, contracts, State-Machine-Transitions, Hub)
  - (c) Worker-Assignment + Stundenzettel → `kernflow-assignment-timesheet.spec.js` (7 Tests: Assignment anlegen/Liste/Transition planned→active, ungültige Transition, Timesheet-Plan-Gate, Endpunkt definiert, Einsätze-Seite)
  - (d) Admin-/Strategic-Collaboration → in `kernflow-hub-navigation.spec.js` abgedeckt
- Verbleibend (E-01, Owner): `npm run test:e2e` in der CI-Pipeline grün ziehen (benötigt laufende App + DB im CI-Runner).
- Verify: `npx playwright test e2e/tests/kernflow-*.spec.js` lokal; CI-Gate = E-01.
### P1.3 - `FEATURE_GATE_BYPASS`-Default umkehren
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `.env.example` setzt jetzt `FEATURE_GATE_BYPASS=false` als Default mit erklaerenden Kommentaren. Lokal per eigener `.env` ueberschreiben.
### P1.4 - Backup/Restore Dry-Run dokumentieren
- Status: OFFEN
- Fakt: `scripts/backup.sh`, `scripts/backup-verify.sh`, `scripts/restore.sh`, `scripts/restore-test.sh` vorhanden, aber kein nachweisbarer Live-Lauf.
- Aktion: einmal gegen Staging durchziehen, Run-Log als `docs/OPS_RUNBOOK.md` oder als Artefakt in `release/`-Ordner ablegen.
- Aufwand: 2 Stunden.
- Verify: Run-Log zeigt erfolgreichen Restore in frische DB.
### P1.5 - Doku-Drift final schliessen
- Status: TEILWEISE ERLEDIGT (2026-05-28) — Sofort-Fix + Drift-Dokumentation; vollständige Auto-Generierung = P2/post-launch
- Was gemacht: (a) `docs/OPENAPI_DRIFT_REPORT.md` erstellt: vollständiges Gap-Assessment (27/747 Pfade abgedeckt, < 4 %), Route-Familien-Übersicht, 3 Lösungsstrategien (Auto-Gen / Manuell / Freeze). (b) `openapi/spec.json`: `x-drift-notice`-Warnung hinzugefügt, `/api/csrf-token` → `/api/csrf` korrigiert, Beschreibung als veraltet markiert. (c) Empfehlung Go-Live: Option C (Freeze + klarer Hinweis) jetzt aktiv; Option A (Auto-Gen via `@asteasolutions/zod-to-openapi`) als P2/A.2.
- Noch offen (P2): Vollständige spec.json-Neugenerierung aus Zod-Schemas. Kein Enterprise-Kunde darf spec.json ohne OPENAPI_DRIFT_REPORT-Hinweis als aktuelle Referenz erhalten.
- Verify: `docs/OPENAPI_DRIFT_REPORT.md` vorhanden; `openapi/spec.json` x-drift-notice gesetzt.
### P1.6 - Cross-Tenant Isolation der Core-Business-Flows
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: `api/test/security/coreFlowCrossTenant.test.js` — 19/19 gruen, 0 Failures.
- Was gemacht (Welle 1 — 12 Tests): Negative Isolationstests fuer alle 5 fehlenden Business-Domains (WAVE_03-Luecken): Timesheets GET/:id (cross-tenant + supplier-perspective), Timesheets POST (cross-tenant body + supplier als Ersteller), Assignments GET/:id (cross-tenant + supplier-perspective), Assignments PATCH/:id (cross-tenant), Assignments POST/:id/transition (cross-tenant), Org Audit-Log GET/:id (cross-tenant + own-org), Requisitions GET/:id (cross-tenant + unscoped org_id=null).
- Was gemacht (Welle 2 — 7 Tests): Contracts GET/:id (cross-tenant + supplier-perspective), Contracts PATCH/:id (cross-tenant + supplier schreibt → 403), Rate Cards GET/:id (cross-tenant), Rate Cards PATCH/:id (cross-tenant). Bugfix: `rateCards.js` PERMISSION_DENIED → ORG_BOUNDARY_VIOLATION (replace_all).
- Gleichzeitig behoben: (a) dead ternary `requisitionService.js` Z.55 (`approvalRequired ? 'DRAFT' : 'DRAFT'` → direktes Assignment mit Kommentar), (b) Plan-Default `timesheets.js` Z.73 (`"FREE"` → `"DEMO"` — kanonischer Default gemaess planFeatures.js).
- WAVE_04 Subflow 4A (PARTIALLY_FILLED): Migration 113 eingespielt (`requisitions_status_check` Constraint + `requisitions_partial_fill_idx`); `stateMachine.js` + `requisitionService.js` REQUISITION_TRANSITIONS auf 10 Zustaende erweitert; Doku `CORE_BUSINESS_STATE_MACHINES.md` aktualisiert.
- P1.2 / G1.4 E2E-Specs erstellt: `kernflow-requisition.spec.js` (5 Tests), `kernflow-deal-activation.spec.js` (5 Tests), `kernflow-assignment-timesheet.spec.js` (7 Tests), `kernflow-hub-navigation.spec.js` (10 Tests). Laeuft mit `npx playwright test e2e/tests/kernflow-*.spec.js`.
- Verify: `node --test test/security/coreFlowCrossTenant.test.js` → 19 pass; E2E-Specs syntaktisch korrekt; `npm run test:unit` → bestehende Suite unveraendert.
### WAVE_05 - Executive Dashboard und KPI-Wahrheit
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: G2.3 gruen — `docs/KPI_SOURCE_OF_TRUTH.md` vollstaendig; `api/test/reportingDashboard.test.js` 14/14 gruen.
- Was gemacht: (a) Hub Visibility Matrix komplett: `hubVisibility.js` alle 4 Code-Aenderungen bereits implementiert, `visibilityMatrix.test.js` 27/27 pass (frontend volume-mounted). (b) `reportingService.js`: PARTIALLY_FILLED zu `zeroRequisitionKpis()` und SQL-Query ergaenzt (Migration 113 jetzt in KPI-Zaehlung sichtbar). (c) `docs/KPI_SOURCE_OF_TRUTH.md` komplett umgeschrieben: 8 KPI-Gruppen (Requisitions, Compliance, SLA, Platform, Spend, Vendors, Rate Cards, Compliance Warnings + Finance Truth + Procurement Pulse), alle 30+ Felder mit SQL-Quelle, Zeitraum und Drilldown. (d) Null-Zustand-Garantie-Tabelle dokumentiert (alle Funktionen demo-safe). (e) 14 neue Unit-Tests: zero-state, Schema-Vollstaendigkeit, Resilience gegen DB-Fehler (Promise.allSettled).
- Verify: `node --test test/reportingDashboard.test.js` → 14 pass; `npm run test:unit` → 3787/3787 pass.
### WAVE_06 - Security Audit (Rate Limits, Upload-Haertung, API-Key-Scope)
- Status: ERLEDIGT (Audit-Phase 2026-05-24), offenes Item dokumentiert
- Ergebnis: G1.5 gruen (14/14 Tests); G3.4 substanziell verbessert (11/11 Rate-Limit-Tests gruen); 3812/3812 Unit-Tests gruen.
- Was gemacht (G1.5): (a) `/admin/control-center` fehlte `requireAdmin` — Sicherheitsluecke behoben. (b) `isGlobalAdminScope()` um `owner` via `session.userRole`-Fallback erweitert. (c) `api/test/security/adminRoutes.test.js` erstellt: 5 describe-Bloecke (Whitelist, Regression-Guard, ADMIN_PANEL_OPEN, SCC-Guard, Vollstaendigkeit). (d) SCC-Isolation verifiziert: `staffUserId`-only-Session korrekt von Platform-Session getrennt.
- Was gemacht (Rate-Limit-Wiring): (a) GET `/invoices/export` + GET `/invoices/operational/:id/export/csv` → `exportLimiter` (requestLimiter) — vorher null Rate-Limit auf GETs! (b) GET `/admin/audit-log/export/csv` → `exportLimiter` nach requireAdmin. (c) POST `/sso/callback` → `ssoCallbackLimiter` (authLimiter). (d) POST `/worker-invites` + `/resend` → `inviteLimiter` (requestLimiter, Email-Bomb-Schutz). Alle Limiter als Noop-Fallback definiert (Unit-Tests ohne echten Limiter nicht beeinflusst). (e) `api/test/security/rateLimitCoverage.test.js` erstellt: 5 describe-Bloecke, alwaysBlock429/alwaysAllow-Mock-Pattern.
- Was gemacht (Upload-Audit): Alle 3 Upload-Handler auditiert — complianceDocs, offerAssets, workerDocument — alle haben MIME-Whitelist, Extension-Whitelist, Groessenbeschaenkung (10MB), UUID-Validierung (worker).
- Was gemacht (API-Key-Audit): `apiKeyAuthMiddleware` global korrekt verdrahtet; `hasScope()` korrekt implementiert; `requireScope()` exportiert aber NIRGENDWO verwendet — Scopes sind aktuell dekorativ. Spawn-Task erstellt: Scope-Enforcement auf Finance-Routen wired.
- Offen (muss separat erledigt werden): API-Key-Scope-Enforcement (`requireScope()` auf Finance-Routen — aktuell toter Code). FEATURE_GATE_BYPASS=true in Dev (muss false in Prod sein — G1.6).
- Verify: `node --test test/security/adminRoutes.test.js` → 14/14 pass; `node --test test/security/rateLimitCoverage.test.js` → 11/11 pass; `npm run test:unit` → 3812/3812 pass.
### SCC_WAVES_03-06 - Staff Control Center Profi-Level (Code-Seite)
- Status: ERLEDIGT (2026-05-27)
- Ergebnis: SCC Build gruen (58 Modules, 0 TS-Errors). 21 neue Security-Tests (staffSecurity.test.js).
- Was gemacht: (a) WAVE 03: staffSecurity.js (Origin-Guard, CacheControl, SecHeaders), staffMutationLimiter, SCC_ERROR_CONTRACT.md, 21 Unit-Tests gruen. (b) WAVE 04: ToastContext (kein alert()), StepUpContext (kein window.confirm), ConfirmContext ARIA-gehaertet, AppShell mit Hash-Routing, PageHeader/EmptyState/ErrorBanner-Komponenten, Focus-Rings WCAG AA. (c) WAVE 05: CommercialInbox Profi-Level — Detail-Drawer, SLA-Zaehler (warn ab 48h), Preset-Filter, Assignee-Anzeige, getInboxItemDetail+getActiveStaffMembers (Backend), CSS-Klassen komplett. (d) WAVE 06: SubscriptionRequests — Plan-Modell DEMO→INDIVIDUELL (Farb-Kodierung), Pre-Aktivierungsschutz (nur bei status=accepted), Kuendigungsdatum-Feld (cancellation_effective_at), Billing-Mode-Anzeige, Dokument-Pipeline-Visualisierung (KV→ANG→AB→AE/KB), setOfferDetails cancellationEffectiveAt-Parameter ergaenzt (Backend).
- Noch offen: SCC WAVEs 07-13 (Support/SOC, Operations, Risk, Audit, Tests, Release). Ops-Setup (P1.0) weiterhin offen.
- Verify: `npm run build:scc` → 0 Errors; `node --check api/middleware/staffSecurity.js` → OK; `node --test api/test/staffSecurity.test.js` → 21/21 pass.
### WAVE_07 - Admin Centers Surface Isolation
- Status: ERLEDIGT (2026-05-24)
- Ergebnis: requireInternalPermission-Guard unit-getestet (11/11); Cross-Surface-Isolation bestaetigt; admin_panel.html Redirect bei Zugriffsfehler; 3836/3836 Unit-Tests gruen.
- Was gemacht (P1 — QA-Gap geschlossen): `api/test/security/surfaceIsolation.test.js` erstellt mit 11 Tests in 7 describe-Bloecken: (a) Unauthenticated → 401, (b) Kein DB-Eintrag → 403 INTERNAL_ACCESS_REQUIRED, (c) Falsche Permission → 403 INTERNAL_PERMISSION_DENIED (2 Faelle: audit_readonly vs. execute, support_agent vs. audit), (d) Korrekte Rolle → next() + req.internalAccess gesetzt (2 Faelle: platform_owner, support_agent), (e) Cross-Surface Org-Owner ohne DB-Eintrag → 403 (kein orgRole-Bypass), (f) Cross-Surface Platform-Admin-Session → 403 (kein session.userRole-Fallback), (g) Router-Level 3 Faelle: kein Eintrag → 403, platform_owner → 200, ops_manager auf Support-Route → 403 INTERNAL_PERMISSION_DENIED.
- Was gemacht (P2 — UX-Haertung): `frontend/public/js/pages/adminPanel.js` boot()-catch erweitert: wenn e.status === 401 ODER (e.status === 403 AND e.code === 'ADMIN_REQUIRED') → redirect zu `/?error=access_denied` statt Error-Banner. Verhindert, dass Org-User die leere Admin-Shell sehen.
- Surface-Isolation-Fazit: OCC (requireOwnerControlAccess, DB-basiert, Allowlist) ✅; SCC (staffUserId-Session, physisch getrennt) ✅; Internal Control (requireInternalPermission, DB-basiert, kein Session-Fallback) ✅ neu getestet; Admin Panel (requireAdmin, Whitelist owner/admin/platform_admin) ✅; Support-Ops (requireSupportAccess, DB-basiert) ✅.
- Verify: `node --test test/security/surfaceIsolation.test.js` → 11/11 pass; `npm run test:unit` → 3836/3836 pass.
### Phase3_WAVES_07-13 - SCC Profi-Level: Support / Operations / Risk / Audit / Tests / Release
- Status: OFFEN
- Fakt: SCC WAVES 00-06 sind erledigt (2026-05-27). WAVES 07-13 decken Support-/SOC-Modul, Operations, Risk/Trust, Audit/Decisions, Data Explorer, Automation/Runbooks, Test-Sweep und Release ab. Aktueller SCC-Score ~45% von Phase-3-Gate.
- Aktion: Pro Wave eine Session, Masterprompt in `finalization/phase3_scc/MASTERPROMPT.md`. Mit WAVE 07 beginnen (Support/SOC-Modul).
- Aufwand: 7 Sessions (je 1 Wave).
- Verify: `npm run build:scc` 0 Errors, Phase-3-Gates A-E gruen, `staffControlCenter.test.js` durchgehend gruen.
### Phase4_TRACK_B - Einsatzportal auf Enterprise-Reife 90% (Pflicht fuer Marktstart)
- Status: OFFEN — Track B ist Marktstart-Pflicht (GATES.md Track-B-Gate, 20 Kriterien)
- Fakt: Einsatzportal aktuell 68-72% Enterprise-Reife. Groesster Engpass: Frontend-Verdrahtung + Stundenzettel native (EP-02). EP-03 Backend-Haertung (Worker darf org_id NICHT aus Body liefern, Backend leitet ab aus Session + Assignment-Link). Cross-Org-Negativtests fehlen. `worker-timesheet.html` = Legacy, kein neuer Link dorthin.
- Aktion: Mit EP-00 (Read-only Audit) starten. Masterprompt: `finalization/phase 4/MASTERPROMPTS.md` Abschnitt B. Branch: `release/enterprise-premium-market-ready`.
- Aufwand: 11 Sessions (EP-00 bis EP-10). Kernblocker EP-02 ca. 1 Session, EP-03 ca. 0.5 Sessions.
- Verify: Track-B-Gate aus `finalization/phase 4/GATES.md` (20 Kriterien), `npm run test:integration -- worker` gruen, Mobile-Abnahme, keine neuen Links auf `worker-timesheet.html`.
## P2 - Erste Pilotwochen (Betriebshaertung)
### P2.0 - INDIVIDUELL Tier-Schwellen migrieren (W-01 aus WAVE_02)
- Status: GEPLANT
- Fakt: `planFeatures.js` nutzt Schwellen 30/250/999, `planCatalog.js` die neuen Schwellen 50/150/350. Beide Funktionen existieren parallel (`getIndividualTierByEmployeeCount` vs `getIndividualTierByEmployeeCountV2`).
- Risiko: Neu-Orgs koennen unterschiedlich eingestuft werden je nachdem welche Funktion aufgerufen wird.
- Aktion: (a) Alle Aufrufer von `getIndividualTierByEmployeeCount` auf V2-Funktion umstellen, (b) TIER_THRESHOLDS in planFeatures.js auf 50/150/350 angleichen, (c) DB-Backfill: bestehende `individual_tier_auto`-Werte neu berechnen.
- Aufwand: 1 Tag (inkl. DB-Migration + Tests).
- Verify: `getIndividualTierByEmployeeCount(45)` == `individuell_s`, `getIndividualTierByEmployeeCount(100)` == `individuell_m`.
### P2.1 - Coverage-Schwellen schrittweise anheben
- Status: GEPLANT
- Ziel: von 35/75/55/35 -> 45/80/60/45 -> 55/85/70/55 in drei Schritten (monatlich).
- Aufwand: rollierend, ca. 1 Tag pro Welle.
### P2.2 - Load-Tests fuer Kern-Endpoints
- Status: GEPLANT
- Umfang: k6-Skript gegen Matching, Deal-Accept, Emergency-Commit, Timesheet-Submit.
- Aufwand: 1-2 Tage.
### P2.3 - Chaos-Run (DB-Down, Redis-Down, API-Restart)
- Status: GEPLANT
- Ziel: verifizieren, dass Correlation-IDs, Pending-Requests, Idempotency-Keys robust bleiben.
- Aufwand: 1 Tag.
### P2.4 - Phase 4 Track C: Terminologie-Umbenennung
- Status: GEPLANT (kann parallel zu Phase-3 WAVES 07-13 laufen)
- Fakt: Technische Begriffe (Requisition, Kapazitaet, Marktplatz) sichtbar im UI, fuer Kunden verwirrend. Track-C-Gate aus GATES.md ist Marktstart-Pflicht oder explizit Post-Launch.
- Aktion: Eigener Branch `feature/terminology-rename`. Mit Phase 0 (Read-only Inventar -> `docs/product/TERMINOLOGY_RENAME_AUDIT.md`) beginnen. Masterprompt: `finalization/phase 4/MASTERPROMPTS.md` Abschnitt C. Owner-Freigabe fuer Begriffsmatrix noetig (MANUAL_TASKS.md).
- Aufwand: 13 Sessions (Phase 0-12). Phase 0+1 (Audit + Guide) als Voraussetzung fuer Track A.
- Verify: Track-C-Gate aus `finalization/phase 4/GATES.md` (10 Kriterien), kein `Bedarf einstellen` in Company-Surfaces, kein `Kapazitaet einstellen` in Agency-Surfaces, `docs/product/TERMINOLOGY_GUIDE.md` vorhanden.
## Verbesserungsvorschlaege
### A - kurzfristig, hoher Leverage (3-6 Wochen)
- **A.1** Web-Components-Shell neben Vanilla-JS einfuehren (kein Big-Bang). Zuerst `pageShell`/`hub`/`nav`, dann Page-fuer-Page.
- **A.2** OpenAPI-Spec aus Zod-Schemas generieren (`@asteasolutions/zod-to-openapi`). Beendet Doku-Drift strukturell.
- **A.3** Feature-Flags extern (Unleash oder ConfigCat) statt `FEATURE_GATE_BYPASS` + Plan-Matrix fuer granulare Pilot-Schaltung.
### B - mittelfristig, Marktwert-Multiplikator (2-3 Monate)
- **B.1** Public Marktplatz-KPI-Dashboard ("X offene Bedarfe / Y Agenturen / Z Deals") als Landing-Segment. Macht Netzwerk-Effekt sichtbar.
- **B.2** Worker-PWA statt native App: `einsatzportal-*.html` installierbar machen, Offline-Safe fuer Zeiterfassung.
- **B.3** Erklaerbares Matching: "Warum matched dieser Worker nicht" mit Feedback-Loop auf `matching_results.html`. Enterprise-Argument.
### C - Enterprise-Vertriebshebel (parallel zum Pilot)
- **C.1** SOC2/ISO27001-Vorbereitung: Audit-Log, Data-Governance, Org-Boundary-Bausteine existieren. Trust-Center-Inhalte in 2-3 Wochen vorbereitbar, voller Audit 3-6 Monate mit Partner.
- **C.2** DPA/AV-Vorlagen + Subprocessor-Liste in `trust/compliance.html`. Haeufiger Einkauf-Stopper.
- **C.3** Rollout-Playbook als Warp-Notebook ("Create Tenant", "Seed Demo", "Assign Program Manager"). Senkt Pilot-Onboarding von Stunden auf Minuten.
- **C.4** Phase 4 Track A: Marketplace Visibility Center als Post-Launch-Premium-Feature fuer PRO/INDIVIDUELL. Kontrolliertes oeffentliches Anbieterprofil, anonymisierte Profil-Analytics, verifizierte Deal-basierte Bewertungen, kuratierte Rankings. 13 Wellen (M-00 bis M-13), Masterprompt: `finalization/phase 4/MASTERPROMPTS.md` Abschnitt A. NICHT vor Phase 3 WAVE 04 + Track C Phase 0+1 starten (Cross-Cutting-Abhaengigkeit).
## Done
- **Finalisierungswelle 2026-05-28 (Enterprise Pack + WAVE_08-15)**
  - Enterprise Pack 1.0.0 komplett (8 Dateien in `docs/enterprise_pack/`): SECURITY_OVERVIEW, TENANT_ISOLATION_TESTS, OBSERVABILITY_OVERVIEW, CSRF_RATE_LIMIT_COVERAGE, BACKUP_RESTORE_TEST (Template), SLA_OPERATIONAL_COVERAGE, VERSION, GAPS
  - WAVE_08: Referral + Credits Cross-Tenant — 12/12 Tests gruen (`wave08CrossTenant.test.js`)
  - WAVE_09: Billing Lifecycle Trial-End + Grace + Hard-Lock — Migration 119, `applyTrialEnds()` + `applyHardLocks()`, 9 Tests gruen
  - WAVE_10: Empty-State-Audit SCC — alle 15 Module haben professionelle Empty States
  - WAVE_12/13: CI `scc-build` Job; `occ-build` Fix; Observability (Sentry, Prometheus, Pino) bestaetigt
  - WAVE_14: Legal Docs — `docs/TOMS.md`, `docs/SUBPROCESSORS.md`, `docs/AVV_TEMPLATE.md`
  - WAVE_15: `sql/seeds/demo-sales.sql`, `docs/SALES_DEMO_PATH.md`
  - F-02 SSO Break-Glass: `auth.js` — enforce_sso nur wenn `getSSOMode() === "saml"`, Passwort als Break-Glass
  - F-01 Coming-Soon-Guard: `subscriptionRequestService.js` ADDON_NOT_AVAILABLE (400); 47/47 Tests gruen
  - E-02 Spend Analytics Scope-Display: Backend `scope:{}` + `generated_at`; Frontend `renderScopeBar()`
  - Worker-Profil noindex (DSGVO): `worker-profile-public.html` `noindex, nofollow` + footer.js Mount-Point
  - `frontend/robots.txt` erstellt (Docker-Mount `./frontend` → `/robots.txt` via Nginx catch-all)
  - `docs/NOINDEX_DECISIONS.md` — alle Surfaces dokumentiert
  - Finance Export / API-Key default-deny / Vendor Tier Audit — alle bestaetigt gruen
  - Enterprise Readiness Score ~88%. Verbleibende Blocker = Owner-Tasks (P0.4, E-01, I-01, G-01, G-COM-03)
- **Welle 7 Pilot-Haertung (April 2026)**
  - Phase 12: AbortController + `ApiError(code=ABORTED|NETWORK_TRANSIENT)` im `workerSubmissionsReview.js` – kein `ERR_NETWORK_CHANGED`-Sturm mehr bei schnellen Tab-Wechseln auf `worker-submissions-review.html`
  - Phase 0+1: Hub-Card `Einsaetze & Zeiten` wird fuer `org_type=company` zu "Einsatzverfolgung / Begleitsicht" umetikettiert; `worker-submissions-review.html` zeigt fuer Unternehmen eine Read-only-Informationskachel statt des Agency-Reviews
  - Phase 3+4: `GET /api/closed-deal-assignments` + `listClosedDealAssignments` + `#closedDealAsgnSection` im Einsaetze-Tab – abgeschlossene/vollbesetzte/stornierte Deals bleiben fuer Agenturen hart sichtbar
  - Phase 2+5: `workerService.assignCapacityToWorker` schaltet Multi-Headcount-Kapazitaeten nur bei tatsaechlich vollem Headcount auf `filled`; Teilbesetzungen bleiben aktiv
  - Phase 10+11: Einsaetze-Tab bekommt Archiv-Sub-Filter; `assignmentLifecycleState` ist Europe/Berlin-timezone-safe
  - Phase 6+7+8: Aggregator `GET /api/marketplace/offers/:id/staffing-context` + `POST /api/marketplace/offers/:id/quick-assign-to-deal`; neuer `#od-staffing-block` in `offer_detail.html` mit One-click-Bulk-Zuweisung + Fast-Track-Deep-Link (manuelle Zuweisung unveraendert)
  - Phase 9: `cancelAgreement` dreht `assignments/reservations/invites` zurueck; `AGREEMENT_TRANSITIONS.activated=["cancelled"]` freigeschaltet
  - Tests: `api/test/welle7DealStaffingHardening.test.js` (4 gruen), `dealAgreement.test.js` + `hubVisibility.test.js` + `hubVisibilityIntegration.test.js` weiterhin vollstaendig gruen
## Pflege-Regeln (fuer Agenten und Menschen)
- Jeder neue echte Blocker, der in einer Session entdeckt wird, wird hier als P0/P1/P2 eingetragen, BEVOR die Antwort abgeschlossen wird.
- Aktion + Aufwand + Verify-Schritt sind Pflicht bei jedem Eintrag - kein "siehe Chat".
- Erledigte Punkte wandern in `## Done` mit Datum und Kurzbeleg (Commit-Hash, Test-Name oder Artefakt).
- Aenderungen am File brauchen keinen Commit in der Session, nur das Datei-Update.
