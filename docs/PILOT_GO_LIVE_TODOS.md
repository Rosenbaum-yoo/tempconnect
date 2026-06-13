# TempConnect - Pilot/Go-Live TODOs
Quelle: fundierte Projektbewertung April 2026, abgeleitet aus realem Ist-Zustand (65 Routes, 102 Services, 156 Tests, 98 Migrationen, 6-Job-CI, 289/290 Audit-Coverage).
Dieses File wird automatisch gepflegt, solange die Regel in `AGENTS.md` ("Pilot-TODO-Pflege") aktiv ist. Erledigte Punkte wandern nach `## Done`. Neue Blocker, die in Sessions auftauchen, werden als P0/P1/P2 angelegt.
Letzte Aktualisierung: 2026-06-13 — **Welle F1 (Code-Schlussarbeiten) abgeschlossen + committet** (`9f37250`/`1044343`/`878b022`/`845b6c9`): Prod-Härtung, Security-Quick-Wins, Hygiene-Sweep, Test-Harness-Folge inkl. eines gefundenen+gefixten requireMfa-SCC-Betriebsblockers; volle Suite 4508/0, Lint 0/0, Builds grün — siehe Abschlussbericht im Worklog. Marktstart-Ziel auf **01.09.2026** aktualisiert (UG-Gründung = kritischer Pfad). Vorher: 2026-06-11 — **Der konsolidierte Vorwaerts-Plan bis zur finalen Abnahme (Wellen F0-F6) liegt in `docs/finalization/FINALISIERUNGSPLAN_ABNAHME.md`** und mappt ALLE offenen Punkte dieses Files (P0.4, P1.0, P1.4, E-01, P2.x) + Gap-Register O-01-O-11 + Audit-Funde 2026-06-11 auf Wellen/Phasen mit Abnahmekriterien. Vorher: 2026-06-05 (Go-Live-Haertung abgeschlossen, „drei wie empfohlen" Owner-approved: P0.6 [052-Demo-Seed-Backdoor] via Env-Flag-Gate `SEED_DEMO_WORLD` [migrate.sh PGOPTIONS-GUC + 052 DO-Guard + Compose-Split base/prod=false, override=true] + Remediation-Migration 125 [Hash-Neutralisierung der 6 Demo-Konten, gegated+idempotent]; P0.7 Tier-2 [Bestands-DB-116-Backstop] via Forward-Repair-Migration 126 [nicht-transaktional, per-Tabelle-to_regclass-guarded, idempotent]; subscriptions-RLS-Exclusion bestaetigt. Verifiziert auf zwei Wegwerf-DBs [beide Flag-Pfade + Nicht-Superuser-Deny-by-Default-Laufzeitbeweis], realer Stack unberuehrt. AKTIVIERUNG: 126 schaltet Deny-by-Default+FORCE RLS beim naechsten migrate-Lauf gegen Bestands-/Managed-DB scharf. Alle Diffs uncommitted = Owner-Commit-Gate. Vorherige offene Owner-Tasks bleiben: P0.4, P1.4-Live-Run, E-01, R2/R9 extern).
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
### P0.6 - Demo-Seed-Welt (052) wird auf JEDEM Fresh-Install (auch Prod) angelegt — ENTERPRISE-Login-Backdoor
- Status: ERLEDIGT + COMMITTED + GEPUSHT (2026-06-05, Commit `bc24e58` auf origin/release/enterprise-premium-market-ready). Owner-approved Variante „drei wie empfohlen": Env-Flag-Gate + Remediation-Migration 125 + subscriptions-RLS-Exclusion bestaetigt.
- Befund (2026-06-04, beim Fresh-Install-Verify entdeckt): `052_demo_seed_world.sql` laeuft UNGATED in der Standard-Migrationschain (kein Env-Flag, kein Dev-Gate wie `dev-data.sql`). Auf einer prod-aehnlichen DB (nur `init.sql`, KEINE Dev-Seeds) existieren danach EXAKT 6 User — und alle 6 sind Demo-Konten: demo-buyer@/demo-admin@ (company, ENTERPRISE), demo-agency@ (agency, ENTERPRISE), demo-buyer2@ (PLUS), demo-agency2@ (PRO), demo-agency3@ (BASIS); alle `is_verified=TRUE`, mit Org-Memberships + voller Demo-Datenwelt. **Gemeinsames Passwort `DemoPass2026!` — der bcrypt-Hash steht im Klartext im Repo (052 Z.31).** Ein realer Prod-Install bringt also 6 ENTERPRISE-faehige Konten mit oeffentlich bekanntem Passwort mit = Login-Backdoor mit Mandanten-Vollzugriff.
- Was gemacht (Owner-approved „drei wie empfohlen", 2026-06-05): (a) **Env-Flag-Gate** — `migrate.sh` normalisiert `SEED_DEMO_WORLD` (1/true/yes/on→true, sonst false) und exportiert `PGOPTIONS="-c app.seed_demo_world=<wert>"`, sodass JEDE psql-Session den GUC traegt; `052`-Body in einen `DO $seed_demo_world$`-Guard gewickelt (`IF current_setting('app.seed_demo_world',true) IS DISTINCT FROM 'true' THEN RAISE NOTICE … RETURN` → prod-sicherer No-Op), BEGIN/COMMIT durch den DO-Block ersetzt (Erfolgs-Notice nach innen gefaltet). (b) **Compose-Split** (Defense-in-Depth, fuegt sich in den `dev-data.sql`-Split ein): `docker-compose.yml` migrate `SEED_DEMO_WORLD: ${SEED_DEMO_WORLD:-false}` (Basis-Default AUS), `docker-compose.prod.yml` hart `"false"` (override-t etwaigen .env-Streuwert), `docker-compose.override.yml` migrate `"true"` (Dev/Sales AN). (c) **Remediation-Migration `125_remediate_demo_seed_backdoor.sql`** fuer Bestands-DBs, die das ungegatete 052 bereits liefen: setzt `password_hash` der 6 bekannten Demo-Konten auf einen gueltig FORMATIERTEN, aber unknackbaren bcryptjs-Hash (Passwort-Login unmoeglich, kein 500er-Risiko) — NUR wenn Flag aus UND der Hash noch der oeffentlich bekannte Demo-Hash ist (praezise + idempotent; bereits geaenderte/gesperrte Konten unberuehrt). `is_active=false` verworfen, weil die `users`-Tabelle (init.sql) KEINE `is_active`-Spalte hat — Hash-Neutralisierung ist der schema-treue, nicht-destruktive Weg (Demo-Welt jederzeit via `SEED_DEMO_WORLD=true` re-seedbar).
- Aufwand: 0,5 Tag (Gate + Remediation-Migration + Fresh-Install-Verifikation beider Pfade).
- Verify (2026-06-05, zwei Wegwerf-DBs, danach entfernt — realer Stack unberuehrt): **OHNE Flag** → 052 No-Op, 0 Demo-Konten; 116-Backstop aktiv; FORCE RLS req/ts/inv = t/t/t; 125 neutralisiert (bzw. No-Op wenn keine vulnerablen Konten). **`SEED_DEMO_WORLD=true`** → 6 Demo-Konten wie bisher; 125 absichtlich uebersprungen. GUC-Propagation auf `postgres:16-alpine` empirisch bestaetigt (true / unset→NULL). **Laufzeit-Beweis Deny-by-Default** mit echtem Nicht-Superuser-Rollen-Probe (`rls_probe`, kein BYPASSRLS): [B] ohne org-Kontext → 0 Zeilen, [D] falsche org → 0, [C] korrekte org → 3, [E] Staff-Bypass (`app.rls_bypass=staff`) → 3 = exakt die fuer zahlende Kunden geforderte Mandanten-Isolation. `test-fresh-install.sh` deckt beide Pfade ab.
### P0.7 - Migrations-Chain Silent-Failure + 116 Deny-by-Default-RLS hat auf KEINER DB je gegriffen
- Status: ERLEDIGT + COMMITTED + GEPUSHT (2026-06-04, Tier-2 nachgezogen 2026-06-05; Commit `bc24e58`). Bestands-DB-Forward-Repair (Tier-2) via Migration `126`. AKTIVIERUNG: 126 schaltet Deny-by-Default + FORCE RLS beim naechsten migrate-Lauf gegen Bestands-/Managed-DBs scharf.
- Befund (Root-Cause): Altes `migrate.sh` lief `psql -f` OHNE `ON_ERROR_STOP` → Exit 0 auch bei SQL-Fehler → fehlgeschlagene Migrationen wurden faelschlich als „applied" verbucht. Das maskierte MEHRERE defekte Migrationen, die auf nie existente / an ihrer Stelle noch nicht existente Schema-Objekte verwiesen. Besonders folgenschwer: `116_rls_deny_by_default.sql` ist transaktional (BEGIN…COMMIT) — der erste maskierte Defekt darin riss die GESAMTE Mandanten-Isolation in den Rollback. **Konsequenz: der Deny-by-Default-RLS-Backstop (Staff-Bypass + org-Policies, IS-NULL-Wildcards entfernt, FORCE RLS) war auf KEINER Datenbank je aktiv.**
- Was gemacht: (a) `migrate.sh` gehaertet: `psql -v ON_ERROR_STOP=1 -f` + harter `exit 1` bei Migrationsfehler (kein stilles Weiterlaufen mehr). (b) Chain-Repair (jeder In-Place-Edit JUSTIFIED — eine Forward-Migration kann eine die Chain mittendrin abbrechende Migration nicht reparieren; die Edits aendern auf bereits-korrekten DBs nichts am Ergebnis, verhindern nur Crash-on-missing-object und laufen auf applied DBs nie erneut): `031` cd_same_org auf reines org_id (compliance_documents hat keine supplier_org_id) + vendor_pool_entries-Guard; `032` deals-/vendor_pool_entries-Indizes + cap_fts_idx hinter to_regclass/column-Guard; `039` `is_demo`-Spalte von Demo-Seeds entkoppelt (Spalte laeuft immer, Seeds hinter Early-RETURN-Guard); `047` Webhook-DDL hinter org_integrations-Guard; `116` co_same_org auf org_id (commercial_offers ist ein-org-besitzt, kein buyer/seller_org_id), subscriptions bewusst aus dem org-RLS-Set (user-skaliert, kein org_id), vendor_pool_entries-Guard; `124` idempotenter cron-index-repair. (c) `test-fresh-install.sh` gehaertet: toter `check_table "deals"` → `commercial_offers`; + neue Assertions, die nach Fresh-Install pruefen, dass der 116-Backstop wirklich aktiv ist (req_staff_bypass vorhanden, req_no_ctx weg, FORCE RLS auf req/ts/inv).
- Verify (2026-06-04, prod-aehnliche Wegwerf-DB, init.sql only): Chain 127 Migrationen, 0 Fehler; 116-Policies vorhanden; IS-NULL-Wildcards weg; FORCE RLS aktiv; Phantom-Objekte (deals/vendor_pool_entries/webhook_deliveries/org_integrations/capacity_posts.description) korrekt absent. `sh -n sql/test-fresh-install.sh` OK.
- Tier-2 erledigt (2026-06-05) via `126_rls_forward_repair.sql`: NICHT-transaktional, EIN per-`to_regclass` abgesicherter `DO`-Block pro Tabelle (requisitions/timesheets/invoices/org_memberships/compliance_documents/subscription_requests/commercial_offers/audit_log; vendor_pool_entries als out-of-scope-Guard) — CREATE OR REPLACE der Helfer `current_org_id()`/`is_staff_context()`, dann je Tabelle ENABLE RLS + DROP der IS-NULL-Wildcards + DROP/CREATE same_org & staff_bypass (USING-Klauseln 1:1 aus 031/116), FORCE RLS nur auf req/ts/inv. Idempotent (DROP IF EXISTS + identisches CREATE), resilient (ein fehlendes Objekt ueberspringt nur SEINEN Block, reisst nie den Backstop mit), auf Bestands-DBs erstmals wirksam, auf frischen DBs folgenloser No-Op. `subscriptions`-RLS-Exclusion bestaetigt (user-skaliert via user_id, kein org_id; eine Membership-Bruecke wuerde persoenliche Billing-Daten cross-org leaken — Schutz bleibt App-Layer). **AKTIVIERUNGS-HINWEIS:** 126 schaltet Deny-by-Default + FORCE RLS beim NAECHSTEN migrate-Lauf gegen Bestands-/Managed-DBs scharf. Lokal ist `tempconnect` Superuser → RLS-inert (kein Breakage); auf Managed-DB (Nicht-Superuser-App-User) wird der Backstop real wirksam = gewollter Mandanten-Schutz.
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
- Status: TEILWEISE (2026-06-03) — Skript-Fidelity-Bug behoben, Live-Lauf bleibt Owner
- Fakt: `scripts/backup.sh`, `scripts/backup-verify.sh`, `scripts/restore.sh`, `scripts/restore-test.sh` vorhanden. **Drill-Fidelity-Bug gefunden+behoben (Triage: Bug):** `restore-test.sh` führte pg_restore OHNE `--single-transaction --exit-on-error` aus — ein nur teilweise eingespielter Dump konnte fälschlich „bestanden" melden (False-Confidence). Jetzt an echten `restore.sh` angeglichen. Zusätzlich Infra-Snapshot-Severity-Matrix (Backup-Staleness 12/24/48h) gepinnt (`infrastructureSnapshotService.test.js`, 36/36). Weiterhin kein nachweisbarer Live-Lauf.
- Aktion: einmal gegen Staging durchziehen, Run-Log als `docs/OPS_RUNBOOK.md` oder als Artefakt in `release/`-Ordner ablegen.
- Aufwand: 2 Stunden (Owner/Ops, gegen reale Infra).
- Verify: `bash -n scripts/restore-test.sh` OK; Run-Log zeigt erfolgreichen Restore in frische DB.
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
- Status: WORKER-SELF-SERVICE VERIFIZIERT GRÜN (2026-06-05) — Owner-Sign-off ausstehend (3 Restpunkte). Gate-Entscheidung: `docs/releases/EINSATZPORTAL_GO_LIVE_DECISION.md` (17/20 automatisiert grün).
- Erledigt: EP-02 KERN-Blocker geschlossen (native Stundenzettel-Erfassung inline in `einsatzportal-stundenzettel.html`, keine Weiterleitung). EP-03 Backend-Haertung geschlossen (org_id serverseitig aus `worker_assignment_link_id` abgeleitet, Client-Felder aus POST-Body entfernt; `workerSubmissionOrgHardening.security` gruen). Cross-Org-Negativtests gruen (EP-09 XORG-Set). 0 Links auf Legacy-`worker-timesheet.html`. Browser-Smoke NEU: `e2e/tests/einsatzportal-worker-flow.spec.js` 8/8 gruen.
- Voraussetzungs-Fixes (2026-06-05): Registrierungs-Blocker behoben (`authService.js` → `normalizePlanKey`, DEMO statt FREE), Migration 127 `org_access_suspension` angewandt.
- Restpunkte (owner-/manuell-gated, NICHT Worker-Portal): (1) Gate 16 = 2 Agency-Review-Tests in `workerSubmissionsReview.access.flow.test.js` — Fehler A `worker_view`-Capability = in-flight Entitlement-Refaktorierung (entitlementService.js uncommitted, → Task #30/Item-3); Fehler B `worker_module`-Gate 200≠403 = `FEATURE_GATE_BYPASS=true` Container-Artefakt. (2) Gate 20 Mobile-Abnahme = Owner manuell. (3) Gate 13 Kontakt-Kontext = manuelle Sicht-Bestätigung empfohlen.
- Verify (durchgeführt): `node --test test/integration/worker*` im Container → 37/39 pass (2 Fehler = Restpunkt 1, nicht Worker-Portal); `npx playwright test einsatzportal` → 8/8; `grep worker-timesheet.html einsatzportal-*.html` → leer.
### P1.7 - Entitlement-Leaks: als INDIVIDUELL verkaufte Features nur rollen-gegated
- Status: ERLEDIGT (2026-06-03, Owner-Freigabe „alle, effizientester/zukunftssicherer Weg") — HIGH-Leaks geschlossen, MED/LOW als „open-by-design" geklaert (kein Doku-Drift). Diffs uncommitted bis Owner-Commit-Freigabe.
- Befund (Audit): `visibilityMatrix.has_backend_guard:true` ist DOKU, nicht Laufzeit-Wahrheit. Nur Routen mit explizitem `requireFeature`/`requireOrgFeature` erzwingen den Plan-Gate; `rperm(...)` ist ROLLE, kein Plan. Cross-Check aller 12 `feature_key` gegen `routes/`.
- **HIGH (Umsatzleck) — GESCHLOSSEN, pilot-bewusst:**
  - `enterprise_analytics`: `requireOrgFeature("enterprise_analytics")` auf `reporting.js` `/reporting/dashboard` + `/reporting/finance-truth/export` (NUR die 2 `report.executive`-Routen; operationale Reports `report.operational` bewusst offen, da `sla_access` plan-uebergreifend gilt).
  - `assignments`: `requireOrgFeature("assignments")` auf `assignments.js` NUR `POST /assignments` (create) + `PATCH /assignments/:id` (edit) = kaeufer-exklusive Schreibpfade. Lesen (view) + Lifecycle (transition/complete) bleiben offen, weil zweiseitig — `supplier_org_id` (Agentur/Lieferant, oft nicht INDIVIDUELL) ist dort legitim beteiligt.
  - Guard ist pilot-aware (`getOrganizationEntitlements` → `effective_plan=INDIVIDUELL` fuer `pilot_status='active'`): aktive DEMO-Piloten behalten Zugang; nur zahlende Tarife < INDIVIDUELL erhalten `FEATURE_NOT_ENABLED`. Tests: `api/test/entitlementLeakGates.route.test.js` (12 Faelle: PRO=403 / INDIVIDUELL=ok / DEMO+Pilot=ok + Struktur-Checks ungegateter Routen). Bestehende `reporting.route.test.js` (28) regressionsfrei.
- **MED/LOW — OPEN-BY-DESIGN (kein Leak, NICHT gaten):** rollenbasiert geprueft, bewusst offen:
  - `persistent_requisitions` (`requisitions.js`): Requisition-CRUD ist Trial-Kernfluss (DEMO/BASIS legen Requisitionen an). Differenzierung laeuft ueber Limits/Retention, nicht ueber ein Create-Gate. Wholesale-Gate wuerde Trials brechen.
  - `basic_analytics`: KEINE dedizierte API-Route (nur Config + Frontend-Entitlement-Anzeige). `reports.js` `/reports` ist Missbrauchsmeldung (spam/betrug), NICHT Analytics — fruehere Zuordnung war falsch. Operationale Reports bleiben korrekt auf `report.operational` RBAC.
  - `supplier_ratings`: `ratings.js` `POST /ratings` ist ein ZWEISEITIGER Peer-Trust-Mechanismus (`isRequester || isReceiver`) — muss fuer alle Plaene offen bleiben, sonst kippt die Marktplatz-Reputation. Einziges theoretisches Gate-Ziel waere die Buyer-Scorecard (`requests.js` `/suppliers/:agencyId/scorecard`, companyOrg), aber Route→Feature-Mapping ist nicht durch Spec bestaetigt → kein spekulatives Gate.
  - `deal_workflow`: keine dedizierte Backend-Route (Deals laufen ueber bereits gegatete Capacity-Exchange-Endpunkte) → nur client-seitig gegated.
- Lektion: Zweiseitige Routen (view/transition/complete/peer-rating) NIE wholesale mit einem kaeuferseitigen Feature gaten — nur kaeufer-exklusive Schreibpfade. Sonst sperrt man die Lieferanten-/Agenturseite aus.
### P1.8 - Benachrichtigungen auf Hub-Cards + Glocken-Konsolidierung
- Status: ERLEDIGT (2026-06-04, Owner-Freigabe „Ja, voll bauen"). Diffs uncommitted bis Owner-Commit-Freigabe.
- Befund: Enterprise-Shell zeigte ZWEI Glocken nebeneinander (beide im `[data-notif-topbar]`): die statische pageShell-Link-Glocke `#tc-notif-bell` (→ activity.html) und das reiche `notifications.js`-Dropdown (Deep-Links via `link_path`, Read-all, Mark-read). Redundanz. Hub-Cards trugen keine Ereigniszahl.
- Umsetzung (bestehende Strukturen erweitert, keine Parallelstruktur):
  - Backend: `notificationSurfaceMap.js` = einzige Wahrheitsquelle `notification.type → Hub-Surface` (deckt notificationMatrix/Mig-019/071/072 ab). Neuer read-only `GET /api/notifications/surface-summary` (user-scoped, EINE `GROUP BY type`-Query auf den vorhandenen Partial-Index, foldet auf `{surfaces,total}`; `total` bleibt Glocken-konsistent inkl. bell-only Typen).
  - Frontend: `enterpriseHub.js` rendert kleine Zahl (≤99+) auf sichtbare `[data-surface]`-Cards; Card-href = „direkt da hin". `notifications.js` blendet die statische Alt-Glocke nach Mount plattformweit aus (guarded → strandet keine Seite; pageShell-SSE-Live-Toasts bleiben).
  - Surface-Mapping: requisition_*→requisitions, offer_*/deal_*→deals, capacity_*/demand/emergency_*→marketplace, vendor_pool_*→vendor_pool, compliance_*→trust_center, sla_*→my_company, timesheet_*→assignments; general/system/worker-only→bell-only.
- Tests: `notificationSurfaceMap.test.js` (15) + `notifications.surfaceSummary.route.test.js` (4) grün; bestehende notif-Suiten 120/120 regressionsfrei.
- Verify (manuell, Browser offen): Hub-Card-Badge erscheint bei ungelesenen Ereignissen, Klick navigiert; nur EINE Glocke sichtbar; Worker-Portal (einsatzportal-*) unberührt.
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
### P2.5 - Cross-Org-Regressionstest-Abdeckung fuer org-scoped Schreib-Endpunkte (Audit 2026-06-13)
- Status: GEPLANT (inkrementell; KEINE akute Vuln — Enforcement vorhanden, nur Test fehlt)
- Fakt: Cross-Org-Coverage-Audit (6-Slice-Workflow) ueber ~100 mutierende org-scoped Endpunkte. **Enforcement ist breit vorhanden** (req.orgId-scoped WHERE, getScopedWorker, requireOwnedVendorEntry, assertOrgOwnership, supplier_org_id-Check) — aber viele haben KEINEN dedizierten Cross-Org-403-Regressionstest. Risiko = Regression (jemand entfernt einen Check unbemerkt), nicht aktive Luecke. Die 2 ECHTEN Luecken (requisition-candidates IDOR) sind bereits gefixt+getestet (`1a72f60`). integrations.js-„HOCH-vuln" war False-Positive (Service org-scoped).
- Aktion: pro Domaene eine Mock-Pool-Test-Welle nach dem `coreFlowCrossTenant.test.js`-Muster (poolWith(foreignOrgRow) -> findHandlerExact -> 403). Prioritaet: workers (PII/Invites/Assignment-Links), suppliers (tier/block), timesheetTemplates, agency-submissions, marketplace-offers, dataGovernance/invoices-operational.
- Aufwand: ~4-6 kurze Slices (je 1 Domaene), rein additive Tests, kein Produktcode.
- Verify: jede Domaene hat >=1 cross-org-403 + 1 own-org-ok Test; `npm run test:unit` gruen.
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
- **Cross-Org-Audit + React-XSS + Dependency-Sweep 2026-06-13 (committet `1a72f60`)**
  - **Cross-Org-IDOR gefixt (echte Lücke, Gate C):** `POST/PATCH /requisitions/:id/candidates*` hatten kein `assertOrgOwnership` → Org B konnte Kandidaten an/in Org-A-Requisitions schreiben. Fix + 4 Regressionstests (`coreFlowCrossTenant`). Der 6-Slice-Audit über ~100 org-scoped Schreib-Endpunkte zeigte sonst: Enforcement breit vorhanden, Rest = Test-Coverage-Gap → **P2.5**. integrations-„HOCH-vuln" war False-Positive (Service org-scoped).
  - **React-SPAs (OCC/SCC/SOC) XSS-verifiziert sauber:** 0 `dangerouslySetInnerHTML`/`innerHTML`/`eval`; die 2 dynamischen URL-Params (`returnUrl`, `d.id`) sind `encodeURIComponent`'t. Keine Fixes nötig.
  - **Dependency-Sicherheit:** API-**Produktion 0 Schwachstellen** (`npm audit --omit=dev`); 2 moderate (qs-DoS) nur in Dev/CI-Tooling (Stryker), nicht produktiv erreichbar. Frontend-Prod = statische Assets (kein node_modules ausgeliefert).
- **XSS-Härtung + Frontend-Lint grün 2026-06-13 (committet `ca6a6e7` + `2dc6fea`)**
  - **Security (Gate C, Verbot „kein innerHTML ohne esc()"):** adversarialer 7-Slice-Workflow-Sweep über 39 Frontend-Dateien / 515 `innerHTML`-Sinks. Nach Eigen-Verifikation am echten Code (pageShell-Befunde als False-Positives verworfen): **14 echte Escaping-Lücken in 11 Dateien** geschlossen. Genuin exploitierbar war org-/user-Freitext (Standortname `locLbl`, Invite-Email `referred_email`, Firmenname `role`/`from`, Revenue-Label); Rest Defense-in-Depth (Status-Enum-Badge-Fallbacks, `event.icon`, `r.id`-in-onclick Attribut-Breakout, `document_url`-iframe-src). esc()-Helper in 3 Dateien ergänzt.
  - **CI-Gate-D-Blocker (dabei entdeckt): `frontend-lint:js` war ROT** (9 pre-existing Probleme in nicht-sweep-Dateien) → behoben: stray `_test2.js` (Debug-Scratch) entfernt, `portalShell.js` `/* global PortalApi */`, `cookieConsent.js` leere catch-Blöcke. Ergebnis: „Scanned 91 files, no errors found".
  - Verify: node --check 11/11, frontend lint 0/0, volle Unit-Suite **4512/4512/0**.
- **Welle F1 — Code-Schlussarbeiten 2026-06-12/13 (committet, Commits `9f37250`/`1044343`/`878b022`/`845b6c9`)**
  - **P1-Betriebsblocker gefunden+gefixt (F1.4): `requireMfa`-Identitäts-Precheck kannte die separierte Staff-Session (`staffUserId`) nicht** → 401 auf ALLEN 24 SCC-Mutationen (Step-up/Transition/Approve/…), sobald die Session nicht zufällig auch plattform-eingeloggt war — und das TROTZ `enforce:false` (Audit-Only-Vertrag darf nie blockieren). Fix: `userId || staffUserId` in `requireMfa.js` + 5 Regressions-Tests (`requireMfa.middleware.test.js`). Hätte im Staff-Produktivbetrieb (eigene `tc.staff.sid`-Session) jede Freigabe-Mutation blockiert.
  - F1.1 Prod-Härtung: Container-`resources.limits/reservations`, `FEATURE_GATE_BYPASS:"false"`-Pin in prod.yml, TLS-Pflicht-Banner (nginx+deploy). F1.2 Security: OCC/Staff-Secret via HKDF, `requireScope()` auf Finance/Export verdrahtet (war toter Code seit WAVE_06), Rate-Limit pro API-Key-ID. F1.3 Hygiene: `swallow()`-Helper ersetzt alle stillen `.catch(()=>{})` (0 Rest), companyProfile→`res.locals.audit`, CHANGELOG + RELEASE_PROCESS, Lint 4 Errors+7 Warnings→0/0, 5 Audit-Coverage-Lücken geschlossen.
  - F1.4 Test-Harness (Tests=Spezifikation, Code blieb richtig): CAN-1/FG-5 via org-first-Plan-Auflösung im Harness (`ensureSubscription` setzt Subscription+Org-Plan, FREE→DEMO), workerReview#2 via Re-Login nach Org-Umzug, HTTP-6 Step-up-Passwort, FG-3 bypass-aware. 4 Integrations-Dateien **21/21/0**.
  - Verify: volle Unit-Suite **4508/4508/0**, Lint **0/0**, Audit-Gate **373 exit 0**, Builds **OCC51/SOC29/SCC66 tsc-clean**. Abschlussbericht (Gate Teil 3) im `finalization_worklog.md` (2026-06-13).
- **Phase-5-Finalisierung 2026-06-03 (10-300-Kunden-Härtung, alle Diffs uncommitted = Owner-Gate)**
  - **Provider-Abstraktion Billing (Phase D):** `billingProviderService` (stripe/manual/disabled, manual-first), `BILLING_PROVIDER`-Env, Webhook-Dispatch über `mapStripeEvent`, `payment_failed`→Observability (kein Auto-Cancel), SCC-Billing-Sicht + Inkasso-Worklist. Tests: billingProviderService 26/26, payment.route 32/32, staffBillingOverview 8/8.
  - **Provider-Abstraktion Email (Phase E):** `emailProviderService` (console/smtp/sendgrid/disabled, KEINE neue Dependency, SendGrid via SMTP-Relay), `emailService` provider-fähig (Default-Pfad byte-identisch), `EMAIL_PROVIDER`/`SENDGRID_API_KEY`-Env, System-Health + SCC-Mail-Sicht. Tests: emailProviderService 21/21, systemHealth 17/17, staffMailCenter 10/10.
  - **Incident-Modell (R6, Owner-freigegeben):** Mig **121** `ops_incidents` + `staffIncidentService` (read-only Aggregat + open/ack/resolve mit strengen Übergängen via SELECT…FOR UPDATE) + 5 SCC-Routen (requireStaff·mfaGuard·requireStepUp·requireConfirmAndReason·Audit) + Signals-Feed (§6.2) + React-Modul. Tests: staffIncidents 25/25.
  - **Skalierungs-Index-Härtung (Phase Q):** Mig **122** (5 Cron-Sweep-Partial-Indizes) + Mig **123** (BRIN `product_analytics_events(occurred_at)`). ALLE ~20 Sweeps in internal.js gegen „wächst unbegrenzt?"-Diskriminator geprüft, jede Lücke gegen Quell-Migration verifiziert. DB-gated Index-Test `scaling-indexes.flow.test.js`.
  - **N+1-Write-Sweep:** `searchSlaScan`/`demandSlaScan`/`productReleaseService.markAllSeenForUser` auf set-based UPDATE + Bulk-UNNEST (verhaltensgleich). `createStaffingCampaignInternal` (INPUT-skaliert + withTransaction/RETURNING/per-Row-Audit) bewusst owner-gated. Tests: slaSearchService 4/4, marketplaceService grün.
  - **N+1-Read-Sweep:** `GET /support/lookup/orgs` (bis 100 Round-Trips/Request) → EINE windowed Query `loadRecentOpenCasesByOrg` (ROW_NUMBER PARTITION BY, ANY($1::uuid[])). Gesamter routes/+services/-Sweep sonst sauber. Tests: support.recentCasesByOrg 6/6 (Anti-N+1-Zählung) + DB-gated SQL-Smoke.
  - **Theme-System (Phase J):** `ultra_premium` + Registry + Tier-2-Flags (`THEME_SWITCHER_ENABLED`/`ULTRA_PREMIUM_THEME_ENABLED`) → /bootstrap → SCC-Topbar-Cycle. envValidator Fail-Fast. Tests: themeRegistry 9/9, themeFlags.config 4/4, envValidator 18/18.
  - **Restore-Drill-Fidelity (Phase P, R8):** `restore-test.sh` += `--single-transaction --exit-on-error` (False-Confidence behoben). `infrastructureSnapshotService.test.js` 36/36 (Backup-Staleness-Schwellen gepinnt).
  - **Verbleibend (alle Owner-gated/extern):** echte Stripe-Keys/Price-IDs (R2) + Lifecycle-Reaktivierung (R1), echte SendGrid-Keys (R3), platform/worker_portal-Theme-Injektion + Theme-Control-Modul (R4), Auto-Alert-Notify-Hook (R6), echter Restore-Drill gegen Infra (R8), finale Preise/Rechtstexte (R9), Flag-Konsolidierung (R10), AI-Unsafe-Classifier (R7 Hälfte B, erst bei AI-Code). Laut `99_GOLIVE_GATE.md` Teil 4 erklärt der **Owner** „fertig".
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
