# Release-Wellen — kompakt mit Abnahmebefehlen

> Alle 16 Wellen der Release-Operativ-Schicht. Jede Welle: Ziel, Aufgaben, **konkrete Befehle**, GO-Kriterien. Pro Welle eigene Session.

---

## WAVE 00 — Freeze und Wahrheitspunkt

**Ziel:** Ein einziger autoritativer Stand für die Finalisierung.

**Aufgaben:**
- Branch `release/enterprise-premium-market-ready` erstellen
- Keine Arbeit mehr aus losen ZIP-Dateien
- `CLAUDE.md` und `AGENTS.md` als verbindliche Arbeitsregeln prüfen
- `docs/releases/FINALIZATION_SCOPE.md` erstellen
- `docs/releases/OPEN_BLOCKERS.md` erstellen
- Alte Analyseergebnisse in Blocker-Liste übernehmen

**Befehle:**
```bash
git checkout -b release/enterprise-premium-market-ready
mkdir -p docs/releases
```

**GO:**
- Finalisierungsbranch existiert
- Scope-Dokument existiert
- Blocker-Liste existiert
- Keine parallele Arbeit an unbekannten ZIP-Ständen

---

## WAVE 01 — Release-Hygiene vollständig

**Ziel:** Sauberes externes Release-Artefakt.

**Aufgaben:**
- `.gitignore`, `.dockerignore` härten
- `.releaseignore` oder Release-Allowlist einführen
- `scripts/release-package.sh` korrigieren
- `scripts/release-verify.sh` korrigieren
- CRLF-Probleme in Shell-Skripten beheben
- Secret-Scanner auf Release-Artefakt anwenden
- `docs/releases/RELEASE_ARTIFACT_REPORT.md` erzeugen

**Verifier-Ausschlussliste (verbindlich):**
```
.env, .env.local, .env.txt, deploy/.env
.git
node_modules
.claude, .agents, .vercel, .clone, .claire
coverage, .c8_output
test-results, e2e/test-results
_zip_analysis
*.pem, *.key, private_key
SECRET=, TOKEN=, PASSWORD=
```

**Befehle:**
```bash
./scripts/release-package.sh
./scripts/release-verify.sh dist/tempconnect-<version>.zip
```

**GO:**
- 0 echte `.env`-Dateien im Release
- 0 `node_modules`, 0 `.git`, 0 `.claude/.agents/.vercel`
- 0 Coverage-/Test-Artefakte
- 0 lokale ZIPs
- 0 high-confidence Secret-Treffer
- Release-Report vorhanden

---

## WAVE 02 — Secrets, Env, Production-Safety

**Ziel:** Secrets vollständig aus Code- und Release-Kontext entfernt; extern verwaltet.

**Code-Aufgaben:**
- `.env.example` für Root, API, Frontend, Deploy erstellen (nur Platzhalter)
- Env-Validation einführen
- Production blockiert Start mit Dummy-Secrets
- Unsichere Defaults in Production blockieren
- `FEATURE_GATE_BYPASS` in Production unmöglich machen
- `docs/security/SECRET_ROTATION.md` und `ENVIRONMENT_CONFIGURATION.md` erstellen

**Manuelle Aufgaben (Owner):** siehe `MANUAL_TASKS.md` Abschnitt 6.5.

**GO:**
- Keine echten Secrets im Repository
- Keine echten Secrets im Release
- Production startet nicht mit Dummy-Werten
- Secret-Rotation dokumentiert + Owner-bestätigt durchgeführt

---

## WAVE 03 — Frontend vollständig releasefähig

**Ziel:** Frontend ist buildfähig, lintfähig, produktionsreif.

**Aufgaben:**
- `pricing.html` strukturell reparieren
- HTMLHint, ESLint, TypeScript Check grün
- `vite build` und `vite build:all` grün
- **`occ.html` final entscheiden:** echte Seite / Redirect / Legacy / Build-Entry entfernen
- **`support.html` final entscheiden:** dito
- Tote Links im Pilot-/Enterprise-Pfad entfernen
- Sichtbare TODO/Mock/Dummy-Texte entfernen
- Empty/Error/Loading States professionalisieren
- `docs/frontend/PAGE_OWNERSHIP.md` erstellen

**Befehle:**
```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run lint:html
npm run build
npm run build:all
```

**GO:**
- TypeScript / ESLint / HTMLHint / build / build:all alle grün
- Keine fehlenden Entrypoints
- Keine 404 im Pilotpfad
- Keine sichtbaren unfertigen Artefakte

---

## WAVE 04 — API, Tests, Dependency-Audit

**Ziel:** API ist reproduzierbar testbar, auditfähig, production-ready.

**Aufgaben:**
- API `npm ci` stabilisieren
- API Lint, Build grün
- Hängende Tests analysieren
- **Offene Handles schließen:** DB Pool, HTTP Server, Redis/Queue, Worker, Timer, unawaited Promises
- `npm audit --omit=dev` bereinigen → High/Critical fixen
- Test-Skripte standardisieren: `test:unit`, `test:integration`, `test:security`, `test:tenant`, `test:pilot`, `test:ci`
- `docs/engineering/TESTING.md` aktualisieren

**Befehle:**
```bash
cd api
npm ci
npm run lint
npm run build
npm run test:ci
npm audit --omit=dev
```

**GO:**
- API Lint / Build grün
- `test:ci` beendet sauber (keine offenen Handles)
- Keine high/critical Production Vulnerabilities

---

## WAVE 05 — Tenant-Isolation und RLS enterprise-hart

**Ziel:** Kein Kunde sieht fremde Daten — beweisbar.

**Aufgaben:**
- `docs/security/TENANT_ISOLATION_MODEL.md` erstellen
- Alle Tabellen klassifizieren: tenant-scoped / global / staff-internal / audit / billing
- DB-Tenant-Kontext pro Request/Transaction setzen (`SET LOCAL app.current_org_id = ...`)
- **RLS deny-by-default machen**
- `current_org_id() IS NULL`-Allow-Patterns für tenant-scoped Daten entfernen
- Staff-/Owner-Cross-Tenant-Zugriff explizit prüfen + auditieren
- Background Jobs tenant-sicher machen
- Cross-Tenant-Tests ergänzen

**Befehle:**
```bash
cd api
npm run test:tenant
```

**GO:**
- Tenant A sieht nie Tenant B
- Fehlender Tenant-Kontext führt zu deny
- Staff/Owner-Ausnahmen explizit + auditiert
- RLS und App Guards getestet
- Doku vorhanden

---

## WAVE 06 — Rollen, Pläne, Feature Gates

**Ziel:** Jede Funktion nach Rolle, Plan, Tenant korrekt freigegeben oder gesperrt.

**Rollen:** Company, Agency/Supplier, Worker, Admin, Owner, TempConnect Staff, Support/Ops, Enterprise Admin
**Pläne:** DEMO, BASIS, PLUS, PRO, INDIVIDUELL

**Aufgaben:**
- `docs/product/ROLE_FEATURE_MATRIX.md` erstellen
- `docs/product/PLANS_AND_LIMITS.md` erstellen
- OCC/SCC/SOC sauber trennen (Owner / Staff / Support-Ops)
- Frontend Visibility zentralisieren
- Backend Permission Enforcement erzwingen
- Feature Gates Frontend ↔ Backend abgleichen
- Soft-Locks für Premium/Individuell sauber bauen
- Interne Staff-Funktionen für Kunden unsichtbar

**GO:**
- Jede Seite/Card hat Rolle und Plan
- Backend blockiert verbotene Zugriffe
- Frontend zeigt keine falschen Features
- Soft-Locks verständlich
- Tests für Rollen- und Plan-Gates bestehen

---

## WAVE 07 — Pilot-Core-Flow auf Premium-Niveau

**Ziel:** Kompletter Kernflow stabil, klickbar, abnahmefähig.

**Kernflow:**
1. Login
2. Organisation auswählen
3. Requisition erstellen
4. Vendor Pool nutzen
5. Matching / Capacity prüfen
6. Assignment / Deal aktivieren
7. Timesheet / Leistung erfassen
8. Spend auswerten
9. Executive Dashboard prüfen
10. Plan / Upgrade / Enterprise Request

**Pilot-Seed (konkret):**
- 1 Company
- 2-3 Agencies
- 5-10 Worker/Profile
- 3 Requisitions
- 2 Rate Cards
- 1 Match
- 1 Assignment
- 1 Timesheet
- 1 Spend-Datensatz
- 1 Compliance-Warnung

**Aufgaben:**
- `docs/pilot/PILOT_CORE_FLOW.md` erstellen
- Alle CTAs prüfen
- Empty / Error States absichern
- Keine Fake-KPIs, keine Sackgassen, keine 500 bei leeren Daten

**Befehle:**
```bash
npm run test:pilot
```

**Manuelle Abnahme:**
- Kompletter Flow einmal durchklicken
- Screenshots für Abnahmedokumentation
- Keine 404 / 500 / falsche Rollensicht

---

## WAVE 08 — Executive Dashboard und KPI-Wahrheit

**Ziel:** Dashboard ist echte Managementsteuerung, keine KPI-Deko.

**Pflicht-KPIs:**
- Offene Requisitions
- Aktive Vendoren
- Aktive Rate Cards
- Spend 30 Tage
- Compliance-Warnungen
- Kritischer Besetzungsdruck
- Optional: Fill Rate, Time to Fill, Supplier Performance

**Pro KPI definieren (in `docs/product/KPI_DEFINITIONS.md`):**
- Name, fachliche Bedeutung, Datenquelle, Zeitraum, Berechnung, Drilldown, Empty State, Tests

**GO:**
- Jede KPI hat Quelle + Drilldown
- Empty States sauber
- Keine Phantomzahlen
- Keine gemischten Zeiträume
- Tests für KPI-Berechnung bestehen

---

## WAVE 09 — SSO, MFA, Enterprise Identity

**Ziel:** Identity enterprise-tauglich ODER ehrlich begrenzt.

**Zulässige Zustände (Entscheidung verbindlich):**
- **A:** SSO produktionsreif
- **B:** SSO vollständig soft-locked und nicht verkaufbar

**Bei A (produktionsreif):**
- SAML/OIDC Dependency sauber, Metadata, ACS Endpoint, Entity ID
- Zertifikats- und Signaturvalidierung
- User Mapping, Org Mapping, sichere Redirects
- Audit Events, Tests

**Bei B (Soft-Lock):**
- Kein Stub in Production
- UI zeigt "SSO anfragen"
- Endpunkte geben keinen Fake-Erfolg
- Doku sagt klar: SSO nicht aktiv
- Vertrieb darf SSO nicht als live verkaufen

**MFA-Pflicht:** Admin, Owner, Staff. Plus Recovery Flow + Audit Events.

**GO:**
- Kein SSO-Fake / kein Stub-Erfolg in Production
- MFA Policy aktiv
- Identity-Doku vorhanden
- Tests bestehen

---

## WAVE 10 — OpenAPI und API Surface  *(NEU vs. Phase 1)*

**Ziel:** API für Enterprise-Prüfer und Integrationspartner verständlich.

**Aufgaben:**
- `docs/api/API_SURFACE.md` erstellen
- **Routen klassifizieren:** Public / Partner / Frontend Internal / Admin / Staff-Internal / Webhooks / Experimental / Deprecated
- OpenAPI für alle Pilot-/Public-/Partner-Endpunkte ergänzen
- Error Contract standardisieren
- Auth-Schemes dokumentieren
- Pagination / Filtering dokumentieren
- `docs/api/API_VERSIONING.md` erstellen

**GO:**
- OpenAPI validiert
- Alle Pilot-Core-Endpunkte dokumentiert
- Alle Public-/Partner-Endpunkte dokumentiert
- Error Contract vollständig
- Versionierung dokumentiert

---

## WAVE 11 — Security-Hardening

**Ziel:** Security ist enterprise-due-diligence-fähig.

**Aufgaben:**
- `docs/security/SECURITY_OVERVIEW.md` + `SECURITY_CHECKLIST_PILOT.md` + `SECURITY_CHECKLIST_ENTERPRISE.md` finalisieren
- Security Headers aktivieren (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- CSP realistisch setzen
- CORS production-safe (kein Wildcard für sensitive Routen)
- **Rate Limits aktivieren:** Login, Password Reset, Public API, API Keys, Admin/Staff
- **API Keys absichern:** Hashing, Prefix, Scopes, Revocation, Last Used, Audit Events
- Audit Logging vervollständigen

**GO:**
- Keine high/critical prod vulnerabilities
- Security Headers aktiv
- CORS nicht wildcard
- Rate Limits aktiv
- API Keys sicher
- Audit Events vorhanden

---

## WAVE 12 — Operations, Monitoring, Backup, Restore

**Ziel:** TempConnect ist nicht nur baubar, sondern betreibbar.

**Aufgaben:**
- `/health`, `/ready`, `/live` Endpoints
- Strukturierte Logs, Request-ID / Correlation-ID
- Metrics, Error Tracking
- Backup Script + Restore Script
- **Restore Drill** (mindestens einmal durchgeführt)
- Runbooks: Deployment, Incident, Rollback, Pilot Support
- Production Compose säubern (keine Dev-Mounts)

**GO:**
- Health/Readiness funktionieren
- Backup funktioniert
- Restore getestet ODER per Drill nachgewiesen
- Logs enthalten keine Secrets
- Monitoring aktiv
- Production Compose ohne Dev-Mounts

---

## WAVE 13 — Subscription, Pricing, Commercial Readiness

**Ziel:** Kommerzielle Prozesse professionell und ehrlich.

**Aufgaben:**
- Pricing Page finalisieren
- 5 Pläne final: DEMO, BASIS, PLUS, PRO, INDIVIDUELL
- Limits je Plan definieren
- Upgrade Flow ehrlich
- Kündigungs-/Downgrade-Flow definieren
- **Individueller Tarif:** Formular mit vorausgefüllten Kontaktinfos, Nutzerzahl, Standorte, Anforderungen, SSO/MFA/API/Compliance-Bedarf
- **Staff-Prozess:** Anfrage sehen → Status → Notizen → Plan aktivieren → Limits → Audit Event

**GO:**
- Keine Fake-Zahlung, keine falschen Preise
- Upgrade funktioniert ehrlich
- Kündigung/Downgrade klar
- Individuell-Anfrage funktioniert
- Staff kann Anfrage bearbeiten

---

## WAVE 14 — Premium UI/UX vor Marktstart

**Ziel:** TempConnect wirkt wie ein professionelles B2B-SaaS-Produkt.

**Aufgaben:**
- SaaS-Sprache vereinheitlichen
- Sichtbare TODO/Mock/Dummy-Texte entfernen
- Navigation, Tabellen, Cards, Buttons, Forms vereinheitlichen
- Empty / Error / Loading States professionalisieren
- Responsive Mindestqualität
- **Accessibility Basics:** Labels, Keyboard, Kontrast, Fokuszustände

**GO:**
- Pilotpfad wirkt hochwertig
- Enterprise-Pfad wirkt glaubwürdig
- Keine Demo-Optik
- Keine toten CTAs
- Keine verwirrenden Rollenbereiche

---

## WAVE 15 — Enterprise Evidence Pack

**Ziel:** Beweismappe für Enterprise-Kunden, Investoren, technische Prüfer.

**Pflichtdokumente unter `docs/enterprise-readiness/`:**
- `ENTERPRISE_READINESS_OVERVIEW.md`
- `SECURITY_OVERVIEW.md`
- `TENANT_ISOLATION_EVIDENCE.md`
- `OPERATIONAL_READINESS.md`
- `API_READINESS.md`
- `PILOT_CUSTOMER_RUNBOOK.md`
- `ENTERPRISE_GAP_REGISTER.md`

**Plus `docs/releases/`:**
- `PILOT_GO_LIVE_DECISION.md`
- `ENTERPRISE_GO_LIVE_DECISION.md`
- `MARKET_START_GO_LIVE_DECISION.md`
- `RELEASE_NOTES_MARKET_START.md`

**GO:**
- Keine falschen Enterprise-Claims
- Alle Gaps dokumentiert
- Alle Soft-Locks dokumentiert
- Release-Artefakt referenziert
- Commit Hash referenziert
- Prüflogs referenziert

---

## WAVE 16 — Pre-Production Burn-in  *(NEU vs. Phase 1)*

**Ziel:** Vor Marktstart wird der Release Candidate real betrieben und geprüft.

**Aufgaben:**
1. Preprod-Umgebung aufsetzen
2. Release Candidate deployen
3. Smoke Tests laufen lassen
4. Pilot-Core-Flow mehrfach testen
5. Fehlerlogs prüfen
6. Metrics prüfen
7. Backup erzeugen
8. Restore testen
9. Last-/Abuse-Minicheck
10. Security Smoke Test

**Mindestanforderung:**
- ≥ **7 Tage** stabiler Preprod-Betrieb
- Keine P0/P1-Fehler
- Keine wiederkehrenden 500er
- Keine Auth-/Tenant-/Permission-Fehler
- Keine Secret-Leaks
- Backup/Restore nachgewiesen

**Erst dann:** Marktstart GO.
