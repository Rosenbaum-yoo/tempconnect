# Phasen A-R — kompakt mit Befehlen

> Die 18 Phasen der Skalierungswelle. Jede Phase: Ziel, Aufgaben, konkrete Befehle, Acceptance. Pro Phase eigene Session (oder Gruppe). Preserve-first: nichts Funktionierendes brechen.

---

## PHASE A — Reife- und Strukturprüfung

**Ziel:** Echte Reifeprüfung des Repos, keine Codeänderung.

**Aufgaben:**
- Prüfe: API-Routen, Middleware, Rollenprüfungen, Tenant-Isolation, Migrationen, Services, Frontend, SCC, Einsatzportal, Payment/Subscription, Mail/Notification, Docker, Tests, Doku, TODOs, Legacy/Duplicate, Env, Security-Config, Monitoring, Logging, Audit, OpenAPI
- Aktualisiere `docs/finalization/10_300_customer_readiness_matrix.md` mit Spalten:
  `Bereich | Ist-Zustand | Bestehende Dateien | Ziel 10 | Ziel 50 | Ziel 100 | Ziel 300 | Risiko | Änderung | Tests | Gate`

**Befehle:**
```bash
rg -l "requireAuth|requireRole|orgContext" api/
ls sql/migrations/ | tail -30
rg "TODO|FIXME|HACK" api/ frontend/ --count
```

**Acceptance:** Readiness-Matrix mit Datei-/Codebezug, keine erfundenen Strukturen, keine Codeänderung.

---

## PHASE B — Customer Lifecycle und zahlende Organisationen

**Ziel:** Echte zahlende Kunden sauber verwalten.

**Kernobjekte (prüfen, minimal ergänzen):** Customer/Organization, Account Owner, Billing Contact, Technical Contact, Plan, Tariff, Subscription, Entitlements, Payment Status, Onboarding Status, Customer Health, Support Status.

**Lifecycle-Status:**
```
lead → requested → qualified → offer_prepared → offer_sent →
contract_pending → payment_pending → active → active_custom →
paused → overdue → suspended → cancel_requested → cancelled → archived
```

**SCC-Bereich "Customer Operations":** Kundenliste, Filter (Status/Plan/Risiko), Detailansicht, Tarif-/Zahlungsstatus, aktive Module, Nutzer/Standorte, letzte Aktivität, offene Tickets, Systemfehler, Onboarding-Fortschritt, interne Notizen, Statuswechsel, Auditverlauf.

**Sicherheit:** Nur Staff/Owner. Statuswechsel berechtigt + auditiert. Kritische mit Bestätigung. Keine fremden Kundendaten für normale Kunden.

**Tests:** Customer-Liste nur Staff/Owner, Kunde sieht nur eigene Daten, Statuswechsel schreibt Audit, gesperrter Kunde keine bezahlten Aktionen, Entitlements ändern sich korrekt bei Tarifstatus.

> **Querverweis:** Phase 3 SCC-UI-Standards beachten (Profi-UI).

---

## PHASE C — Individuelle Tarife / Commercial Desk

**Ziel:** Individuelle Tarife vollständig operativ.

**SCC-Modul:** `SCC > Commercial Desk > Individuelle Tarife`

**Kundenanfrage-Felder:** Organisation, Ansprechpartner, Rechnungsadresse, E-Mail, Telefon, Branche, Anzahl Nutzer/Standorte, erwartete Einsätze/Worker, gewünschte Module, Laufzeit, Starttermin, Zahlungsart, Enterprise-Anforderungen, SSO/API-Bedarf, Datenschutz, Notiz.

**Staff-Aktionen:** Anfrage öffnen, Notizen, Risiko markieren, Rückfrage, Angebot vorbereiten, Preis/Setup-Fee/Rabatt/Laufzeit/Kündigungsfrist setzen, Module freigeben, Limits setzen, SLA wählen, Zahlungsart, Vertrag markieren, freigeben, ablehnen, Entwurf.

**Aktivierung:** Tarif aktivieren, Entitlements setzen, Limits setzen, Billingprofil, Zahlungsstatus initialisieren.

**Tarifarten:** DEMO, BASIS, PLUS, PRO, INDIVIDUELL (Plan-Modell verbindlich).

**Tests:** Anfrage erstellbar, Staff kann bearbeiten, Aktivierung auditierbar, Entitlements greifen, nur Staff/Owner.

> **Querverweis:** Phase 3 Track A WAVE 06 (Subscription) + Phase 4 Track A (Marketplace-Features).

---

## PHASE D — Billing vollautomatisiert (Stripe Billing ab Tag 1)

**Ziel:** Vollautomatische Zahlungsabwicklung für 10 bis 300 Kunden — KEINE manuelle Rechnungserstellung. Effizienz durch Automatisierung ist Pflicht, nicht Option.

**Entscheidung (verbindlich):** Stripe Billing ist der produktive Standard ab dem ersten zahlenden Kunden. Rechnungen werden automatisch von Stripe generiert (gesetzlich nötig im B2B, aber NICHT von Hand erstellt). Zahlungsarten: Kreditkarte + SEPA-Lastschrift (Stripe SEPA Direct Debit) + automatische Stripe-Rechnung mit Zahlungslink.

**Provider-Service:** `BillingProviderService` mit Providern: `stripe` (Standard), `manual` (nur Notfall-Fallback), `disabled` (nur lokale Entwicklung).

**Env:**
```env
BILLING_ENABLED=true
BILLING_PROVIDER=stripe
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_MAP=
STRIPE_AUTO_INVOICE=true
STRIPE_SEPA_ENABLED=true
STRIPE_TAX_ENABLED=true
STRIPE_DUNNING_ENABLED=true
MANUAL_INVOICE_FALLBACK_ENABLED=false
```

**Stripe Billing vollautomatisch (produktiv):**
- Stripe Subscriptions pro Plan (BASIS/PLUS/PRO via Price-IDs)
- Automatische Rechnungsgenerierung (Stripe Invoicing) — keine Handarbeit
- SEPA Direct Debit für deutsche B2B-Kunden
- Stripe Tax für automatische USt-Berechnung (falls aktiviert)
- Automatisches Dunning (Mahnwesen) bei fehlgeschlagenen Zahlungen — Stripe Smart Retries
- Customer Portal (Stripe Billing Portal) für Selbstverwaltung: Zahlungsmethode ändern, Rechnungen herunterladen, kündigen
- Webhook-Handler idempotent für: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`, `payment_method.attached`
- Payment-Status-Mapping auf Customer Lifecycle (Phase B): `payment_pending → active`, `payment_failed → overdue → suspended`

**INDIVIDUELL / Enterprise (halbautomatisiert, aber NICHT manuell):**
- Auch Individualtarife laufen über Stripe — via Stripe Invoicing mit benutzerdefiniertem Betrag ODER custom Price
- Staff legt im Commercial Desk (Phase C) Preis/Setup-Fee/Laufzeit fest → System erzeugt automatisch Stripe-Subscription oder Stripe-Rechnung
- Keine Excel-Rechnung, kein PDF von Hand — Stripe generiert auch hier automatisch
- Bei Purchase-Order-Kunden (Konzerne): Stripe Invoicing mit Zahlungsziel (net 30), automatischer Versand + Reminder

**Manueller Fallback (NUR Notfall, default AUS):**
- `MANUAL_INVOICE_FALLBACK_ENABLED=false` standardmäßig
- Nur aktivierbar, wenn Stripe ausfällt ODER ein Kunde nachweislich keine Stripe-kompatible Zahlung leisten kann
- Jede manuelle Rechnung erzeugt Audit-Eintrag + Owner-Benachrichtigung
- Ziel: dieser Pfad wird praktisch nie genutzt

**SCC Billing Dashboard:** aktive zahlende Kunden, MRR/ARR (aus Stripe), offene/überfällige Zahlungen, Dunning-Status, Stripe-Status, SEPA-Mandate, Provider-Config, Fehler, letzte Webhooks/Zahlungsänderungen, fehlgeschlagene Zahlungen mit Retry-Status.

**Tests:**
- Stripe-Subscription erzeugt automatisch Rechnung
- SEPA-Mandat-Flow funktioniert
- Webhooks idempotent (doppelter Webhook = kein Doppeleffekt)
- `payment_failed` triggert Dunning + Status `overdue`
- Wiederholtes Scheitern → `suspended` mit Grace Period
- Kündigung über Customer Portal entzieht Features korrekt
- INDIVIDUELL-Tarif erzeugt Stripe-Subscription/Invoice automatisch
- Manueller Fallback ist standardmäßig deaktiviert (Test: Aktivierung erfordert explizites Flag + Audit)
- Stripe Tax berechnet USt korrekt (falls aktiviert)

> **Querverweis:** Phase 1 WAVE_09 Billing. Owner-Aufgabe: Stripe-Account + Keys + Price-IDs + SEPA-Freischaltung + Tax-Config (siehe MANUAL_TASKS). **Stripe-Keys sind Marktstart-Blocker für Gate 10** — ohne sie kein automatisiertes Billing.

---

## PHASE E — SendGrid, SMTP, Notification-System

**Ziel:** Professionelle E-Mail vorbereiten.

**Provider-Service:** `EmailProviderService` mit Providern: `console`, `smtp`, `sendgrid`, `disabled`.

**Env:**
```env
EMAIL_PROVIDER=console
EMAIL_FROM=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SENDGRID_ENABLED=false
SENDGRID_API_KEY=
SENDGRID_WEBHOOK_SECRET=
```

**Mailtypen (vorbereiten):** Registrierung, Passwort, Login-Security, Tarif-Anfrage eingegangen/zur-Prüfung/freigegeben/abgelehnt, Zahlung offen/fehlgeschlagen, Rechnung bezahlt, Onboarding gestartet, Support-Ticket erstellt/aktualisiert, Systemwarnung, Incident, Deployment, Backup fehlgeschlagen, Owner-kritischer Fehler.

**SCC Mail Center:** Providerstatus, SendGrid/SMTP konfiguriert?, letzte Mails, Fehler, Bounces, Webhookstatus, Template-Status.

**Sicherheit:** Keine Secrets in Mails, keine User Enumeration, Rate Limits für sensible Mails, Audit für Commercial-/Billing-/Security-Mails.

**Tests:** Console-Provider funktioniert, SendGrid ohne Key deaktiviert sauber, Mailfehler zerstört Businessflow nicht, kritische Mails protokolliert.

> **Querverweis:** Phase 1 WAVE_13 Observability. Owner-Aufgabe: SendGrid-Key + DNS (SPF/DKIM/DMARC).

---

## PHASE F — SCC als zentrale Adminzentrale

**Ziel:** SCC wird echte Betriebszentrale.

**Module (bauen/finalisieren):**
```
SCC Dashboard, Customer Operations, Commercial Desk, Billing & Payments,
Mail & Notifications, Support & Tickets, Monitoring & Incidents,
Infrastructure/Hetzner Control, Deployment & Releases,
AI Operations/Claude Code Control, Audit & Security,
Feature Flags & Entitlements, Design System/Theme Control,
System Health, Backups & Data Export
```

**SCC-Qualitätsstandard pro Modul:** klare Zielgruppe, Überschrift, Status-Karten, Tabelle/Detail, Empty/Error/Loading State, Filter, Suche (falls sinnvoll), Auditverlauf, rollenbasierte Sichtbarkeit, keine Demo-Daten ohne Kennzeichnung.

**Kritische Aktionen (Bestätigung + Audit):** Kunde aktivieren/sperren, Tarif ändern, Zahlungsstatus ändern, Feature freigeben, Hetzner-Job, Deployment, Rollback, Backup, AI-Job, Theme global, Userrolle ändern.

**Tests:** Normale Kunden kein SCC-Zugriff, Staff sieht nur erlaubte Module, Owner sieht kritische Module, kritische Aktion schreibt Audit, SCC funktioniert mit deaktivierten Integrationen.

**Befehl:**
```bash
cd frontend && npm run build:scc
```

> **Querverweis:** Phase 3 Track A (gesamt) ist die Grundlage. Phase F erweitert um Kunden-Betrieb.

---

## PHASE G — Hetzner Control im SCC

**Ziel:** Hetzner kontrolliert sichtbar/steuerbar. Keine freie Shell, keine gefährlichen Löschaktionen.

**Provider-Service:** `InfrastructureProviderService` mit: `hetzner`, `manual`, `disabled`.

**Env:**
```env
INFRASTRUCTURE_PROVIDER=disabled
HETZNER_CONTROL_ENABLED=false
HETZNER_API_TOKEN=
HETZNER_PROJECT_ID=
HETZNER_BACKUP_ENABLED=false
```

**SCC-Anzeige:** Providerstatus, Token vorhanden/fehlt, Serverinventar/-status, Region, Labels, Volumes, Backups, Snapshots, Firewallstatus, letzte Healthchecks/Deployment-Jobs/Backup-Jobs/Fehler, Skalierungshinweise.

**Erlaubte Aktionen:** Status lesen, Snapshot, Backup aktivieren, Reboot (mit Step-up + typed confirmation), LB-Service add. **Verbotene:** delete, rebuild, reset-password, rescue, SSH, Shell, arbitrary API.

**Jobmodell:** Action Request Layer (siehe Phase 3 Track B WAVE H2).

**Tests:** Production-Stub liefert nie stubbed-ok für Mutationen, unbekannte Aktion abgelehnt, kritische Aktion mit Audit.

> **Querverweis:** Phase 3 Track B (gesamt) ist die detaillierte Grundlage. Phase G ist die kundentaugliche Sicht.

---

## PHASE H — Claude Code / AI Operations im SCC

**Ziel:** AI-Operations sicher im SCC steuern. Keine freie Codeausführung.

**Modul:** `SCC > AI Operations / Claude Code Control` (= Phase 3 Track B Work Orders).

**Funktionen:** Work Orders erstellen/anzeigen, GitHub Issue/PR-Verknüpfung, Risikocheck (Unsafe-Prompt-Classifier), Status-Lifecycle, Audit.

**Env:**
```env
AI_OPS_ENABLED=false
CLAUDE_CODE_ENABLED=false
```

**Risikocheck:** Prompts mit "lösche/delete/ssh/secret/production" blockieren oder als Entwurf + Freigabe-Pflicht.

**Tests:** Nur Owner/Developer-Staff sieht AI Ops, Kunden sehen nichts, Job ohne Konfiguration bleibt Entwurf, Secret-ähnliche Inhalte gewarnt/blockiert, Hochrisikojob verlangt Freigabe, Audit geschrieben.

> **Querverweis:** Phase 3 Track B WAVE H5/H6 (Work Orders + Hooks). Phase 5 selbstlernende Mechanik ergänzt das.

---

## PHASE I — Monitoring, Incidents, Health, Observability

**Ziel:** Betrieb beobachtbar machen.

**Health-Endpunkte:** `/health`, `/ready`, DB/Redis/Mail/Billing/Storage/Worker Health, Hetzner/AI Worker Health (optional).

**Env:**
```env
MONITORING_ENABLED=true
SENTRY_DSN=
LOG_LEVEL=info
LOG_FORMAT=json
ALERT_EMAIL=
```

**SCC Monitoring:** Gesamtstatus, API/DB/Redis/Frontend/Mail/Billing/Hetzner/AI Worker, letzte Incidents, offene kritische Fehler, Fehlertrend, langsame Endpoints, letzte Deployments/Backups, Queue-Status.

**Incident-Modell:** `incident_events`, `incident_status`, `incident_notes`, `incident_notifications` mit severity, source, status, owner, customer impact, created_at, resolved_at, internal notes, public message (optional).

**Tests:** Health ohne externe Keys sauber, fehlende optionale Provider sind "not configured" (nicht "failed"), kritische Fehler im SCC, Incident erstell-/aktualisier-/schließbar.

> **Querverweis:** Phase 1 WAVE_13 + Phase 2 WAVE 12.

---

## PHASE J — Drei isolierte Designbereiche und Theme-System

**Ziel:** Professionelles, wechselbares Designsystem. Default bleibt aktuelles Design. Ultra Premium auswählbar.

**Drei Scopes:** `platform`, `worker_portal`, `scc`.

**Theme Registry:** `ThemeRegistry`, `ThemeProvider`, `ThemeScope`, `DesignTokens`, `ThemeControlService`.

**Themes:** `current_default`, `ultra_premium`, `enterprise_dark`, `enterprise_light`, `high_contrast` (optional).

**Tokens:** Farben, Hintergründe, Flächen, Typografie, Spacing, Border Radius, Schatten, Buttons, Inputs, Tables, Cards, Badges, Modals, Toasts, Navigation, Sidebar, Topbar, Charts, Statusfarben, Empty/Error/Focus States.

**SCC Theme Control (Owner):** aktives Theme je Bereich sehen/ändern, Vorschau, speichern, auf Default zurücksetzen, Audit.

**Ultra Premium:** klare Hierarchie, bessere Typografie, hochwertige Karten/Tabellen, klare Statusindikatoren, ruhige Enterprise-Farbwelt, keine billige Vorlagenoptik, keine übertriebenen Animationen, gute Mobile-Zustände.

**Env:**
```env
THEME_SWITCHER_ENABLED=true
ULTRA_PREMIUM_THEME_ENABLED=true
```

**Tests:** Default bleibt aktiv, Themewechsel je Bereich funktioniert, SCC-Themewechsel nur Owner, kein Themewechsel zerstört Navigation, Ultra Premium auswählbar, fehlendes Theme fällt auf Default zurück.

> **Querverweis:** Phase 1 WAVE_10 Premium UX (Design Tokens). Phase 4 Track C (Terminologie in Themes).

---

## PHASE K — Plattformbereich finalisieren

**Ziel:** Plattform für Unternehmen + Personaldienstleister klar und zahlungswürdig.

**Unternehmen:** Personal finden, Arbeitsplatz anbieten, Anfragen, Angebote, Deals, Einsätze, Spend, Compliance.

**Personaldienstleister:** Arbeitsplatz finden, Personal einstellen, verfügbares Personal, Anfragen, Angebote, Assignments, Timesheets.

**Terminologie:** rollenabhängig (siehe Phase 4 Track C — "Personal finden"/"Arbeitsplatz finden" etc.).

**Tests:** Rollenrichtige Begriffe, keine toten Buttons, echte Datenquellen oder Empty States, keine Mischbegriffe.

> **Querverweis:** Phase 1 WAVE_04 + Phase 4 Track C (Terminologie ist Voraussetzung).

---

## PHASE L — Einsatzportal finalisieren

**Ziel:** Einsatzportal isoliert und nutzbar.

**Anforderungen:** Worker-only, eigene Daten, native Stundenzettel-Erfassung, mobil nutzbar, robuste Fehlerzustände, Cross-Org-sicher.

**Tests:** = Phase 4 Track B (EP-09 E2E + Cross-Org-Negativtests).

> **Querverweis:** Phase 4 Track B (gesamt) ist die detaillierte Grundlage. Phase L stellt sicher, dass es im 10-300-Kunden-Betrieb hält.

---

## PHASE M — Support und Ticket-System

**Ziel:** Supportprozess vorhanden.

**Funktionen:** Ticket erstellen, Status (open/in_progress/waiting/resolved/closed), Priorität, Kategorie, Zuweisung, interne Notizen, Kundensicht vs. Staff-Sicht, SLA-Timer, Audit.

**Kategorien:** technisch, kommerziell, Onboarding, Incident, Feature-Anfrage, sonstige.

**Tests:** Kunde sieht eigene Tickets, Staff sieht alle, Statuswechsel auditiert, Priorisierung funktioniert, keine Cross-Org-Leaks.

> **Querverweis:** Phase 3 Track A WAVE 07 (Support/SOC). Verknüpft mit Phase E (Ticket-Mails).

---

## PHASE N — Security, Legal, Datenschutz, Compliance

**Ziel:** Rechtliche und Sicherheits-Basis prüfen/finalisieren.

**Prüfen/finalisieren:** Auth-Härtung, Tenant-Isolation, CSRF, Rate Limits, Security Headers, API-Key-Scopes, Audit-Vollständigkeit, DSGVO-Texte, AVV/DPA, TOMs, Subprocessor-Liste, Datenexport, Löschkonzept, Retention.

**Tests:** Cross-Tenant-Negativtests, Rollen-/Plan-Gates, Security Headers aktiv, kein PII-Leak, Audit immutable.

> **Querverweis:** Phase 1 WAVE_06 (Security) + WAVE_14 (Legal). Phase 5 prüft Skalierungs-Tauglichkeit.

---

## PHASE O — Tests, CI und Qualitätssicherung

**Ziel:** Reproduzierbar grün oder Restfehler klassifiziert.

**Pflichtchecks:** install, lint, typecheck, unit, integration, security, tenant, migration, frontend smoke, build, build:scc, release verify.

**Testbereiche:** alle Domänen aus Phase 1 WAVE_12 + Customer Lifecycle + Commercial Desk + Billing + Mail + Monitoring + Theme + Support.

**Befehle:**
```bash
cd api && npm run lint && npm run build && npm run test:ci && npm audit --omit=dev
cd frontend && npm run typecheck && npm run lint && npm run build && npm run build:scc
```

**Acceptance:** Keine P0/P1-Testfehler, CI auf frischem Clone reproduzierbar, Cross-Org-Negativtests bestehen.

> **Querverweis:** Phase 1 WAVE_12 + Phase 2 WAVE 04.

---

## PHASE P — Deployment, Hetzner, Backup, Rollback, Release

**Ziel:** Sicher deploybar und wiederherstellbar.

**Dokumente:** `docs/operations/DEPLOYMENT.md`, `BACKUP_RESTORE.md`, `ROLLBACK.md`, `INCIDENT_RUNBOOK.md`.

**Release-Artefakt:** sauber (keine Secrets, keine .env/.git/node_modules/.claude), Manifest + SHA-256 (= Phase 2 WAVE 01).

**Backup/Restore:** Backup-Script, Restore-Drill (durchgeführt, nicht nur dokumentiert), RPO/RTO.

**Tests:** Release-Verifier grün, Restore getestet, Production-Compose ohne Dev-Mounts.

> **Querverweis:** Phase 2 WAVE 01 (Hygiene) + WAVE 12 (Ops).

---

## PHASE Q — Performance und Skalierung

**Ziel:** Für 300 Kunden tauglich.

**Prüfen/finalisieren:** Pagination überall (keine unlimitierten großen Abfragen), DB-Indizes auf häufig gequerten Spalten (org_id, status, datum), Query-Performance (langsame Endpoints), Queue-/Job-Robustheit, Caching wo sinnvoll, Connection-Pool-Größen, Rate-Limit-Tuning.

**SCC Skalierungsanzeige:** aktive Kunden, Ressourcennutzung, langsamste Endpoints, Queue-Tiefe, DB-Last, Kosten-/Ressourcenindikatoren.

**Tests:** Listen mit 300+ Einträgen performant, keine N+1-Queries auf Kernseiten, Job-Verarbeitung unter Last stabil.

> **NEU vs. andere Phasen** — explizit für Skalierung. Verknüpft mit Lernschleife (WIRTSCHAFTLICHKEIT-Erkenntnisse).

---

## PHASE R — Produktpolitur gegen austauschbare SaaS-Masse

**Ziel:** TempConnect wirkt wie spezialisierte Premium-Plattform, nicht generische SaaS.

**Pro Hauptseite:** klare Zielgruppe, fachliche Aussage, hochwertige Headline, klare Primär-/Sekundäraktion, echte Datenquelle oder Empty State, keine Dummytexte/toten Buttons/irrelevanten Karten/Mischbegriffe, rollenrichtige Begriffe, gutes Responsive, sichtbarer Kundennutzen, Trust-Elemente.

**SCC muss wirken wie:** Betriebszentrale, Kundensteuerung, Commercial Desk, Monitoring Center, Infrastruktursteuerung, AI Operations, Audit-/Sicherheitszentrale. NICHT wie: Demo-Adminpanel, lose Linkliste, unfertige Entwicklerseite, DB-Viewer.

**Einsatzportal muss wirken wie:** schneller operativer Tagesbereich, mobil, klar, reduziert, robust, ohne Admin-Ballast.

> **Querverweis:** Phase 1 WAVE_10 + Phase 4 Track C. Finale Politur vor Marktstart.

---

## Finale Abnahmeberichte (nach Phase R)

**Pflichtdatei 1:** `docs/finalization/final_acceptance_report_10_300_customers.md` — geprüfte Bereiche, Änderungen, neue/geänderte Dateien, Migrationen, Env, SCC-Module, API-Routen, Tests, bestandene/fehlgeschlagene Checks, Risiken, Blocker, Empfehlung pro Gate (10/50/100/300).

**Pflichtdatei 2:** `docs/finalization/open_risks_and_blockers.md` — Blocker, Risiko, Auswirkung, betroffene Kunden, Priorität, Lösungsvorschlag, Status.

**Pflichtdatei 3:** `docs/finalization/changed_files_index.md` — Datei, Änderung, Grund, Risiko, Test.

---

## Definition von "fertig" (Phase 5)

Erst fertig, wenn: bestehende Strukturen erhalten + abgesichert, keine Kernflows beschädigt, Customer Lifecycle steuerbar, individuelle Tarife funktionieren, Entitlements greifen, **Billing vollautomatisch über Stripe (Subscriptions, Auto-Rechnung, SEPA, Dunning) — keine manuelle Rechnungserstellung**, SendGrid sicher vorbereitet, SCC als Betriebszentrale, Hetzner Control sicher, AI Operations sicher, Monitoring + Incidents sichtbar, Support funktioniert, Theme-System mit 3 Scopes, Default bleibt, Ultra Premium auswählbar, Plattform rollenklar, Einsatzportal isoliert, Security geprüft, Tests dokumentiert, Deployment/Backup/Rollback-Doku, Risiken ehrlich dokumentiert, **keine Fake-Fertigmeldung**.

---

## Abschlussbericht-Format pro Block

```md
## Block abgeschlossen: <Name>
- Geändert:
- Tests:
- Risiken:
- Nächster Block:
```

Kein Prosa. Token sparen. Arbeitsdateien als Gedächtnis nutzen (siehe `WORK_FILES.md`).
