# TempConnect Platform Audit
Stand: 2026-03-06

## 1. Aktuelle Systemarchitektur

### Stack
- **Runtime**: Node 20 (Express 4, ESM), PostgreSQL 16, Redis 7, Nginx
- **Deployment**: Docker Compose (6 Services: db, api, frontend, migrate, redis, mailpit)
- **Frontend**: Statisches HTML + Vanilla JS, kein Build-System, Dark-Theme CSS
- **Auth**: Session-basiert (connect-pg-simple), CSRF-Token, kein JWT-Auth

### Service-Übersicht
- **15 Route-Module**: auth, capacities, csrf, geo, health, internal, listings, marketplace, me, payment, plans, proofs, ratings, reports, requests, slaSearchJobs
- **12+ Service-Module**: authService, capacityService, complianceService, geoService, healthService, idempotencyService, listingService, marketplaceService, paymentService, ratingService, reportService, requestService, slaSearchService, slaService, stateMachine, supplierMetricsService, userService, auditLog
- **18 Migrationen**: init.sql + 001–018

### Datenbankmodell (Kern-Tabellen)
- `users` (company | agency), `subscriptions` (FREE|BASIS|PLUS|NOTDIENST)
- `listings` (supply | demand), `requests` (SENT→ACCEPTED→FINALIZED)
- `capacities`, `capacity_reservations` (Model B: reserve→convert|expire)
- `capacity_posts`, `demand_requests`, `matches`, `offers` (Two-Sided Marketplace)
- `sla_search_jobs`, `sla_search_matches`, `sla_search_events`, `match_alerts`
- `proofs`, `compliance_policies`, `request_compliance`
- `sla_events`, `supplier_metrics`, `audit_log`, `ratings`
- `idempotency_keys`, `payment_sessions`

## 2. Bereits vorhandene VMS-nahe Funktionen

### Kapazitätsmanagement (Model B)
- Live Capacity Feed (Agency stellt ein, Company fragt an)
- Reserve → Accept (reduces available_workers) → Finalize (Deal)
- TTL-basierte Reservierungen (30 min), automatische Expiry
- Haversine-Umkreissuche auf capacities + Geo-Geocoding via Nominatim

### SLA / Pulse
- SLA-Timer pro Request (sla_minutes, sla_respond_by, breach detection)
- SLA-Events (deadline_set, breached, resolved, escalated)
- Notdienst-Eskalation (Stage 2 nach 10 min, Stage 3 nach 20 min)
- SLA auch auf demand_requests und sla_search_jobs

### Marketplace
- Capacity Posts (Agency) + Demand Requests (Company) + deterministic Matching
- Offers mit Lifecycle (draft→sent→accepted/rejected/countered/withdrawn)
- Match-Scoring: Rolle (30), Skills (5 pro Match), Verfügbarkeit (20), Distanz (0–25), Verified (+10)

### Compliance
- Traffic-Light Berechnung (GREEN/YELLOW/RED) auf Request-Ebene
- compliance_policies pro Company
- Batch-Recompute Fähigkeit

### Supplier Scorecard
- Fill Rate, On-Time Rate, SLA Breach Rate, Avg Rating
- Grade A/B/C Berechnung
- Materialisiert in supplier_metrics + On-the-fly Fallback

### Suchaufträge
- Persistente Search Jobs mit SLA-Tracking
- Automatisches Matching bei Erstellung
- Match-Alerts (Benachrichtigungen)

### Feature Gating
- 4 Pläne: FREE, BASIS, PLUS, NOTDIENST
- 7 Feature-Keys mit Plan-Mapping
- Middleware-basiertes Gating + Frontend slaGuard.js

## 3. Fehlende Kernfunktionen

### Kritisch (Enterprise-Blocker)
1. **Kein Organisationsmodell** – Nutzer sind flat, keine Mandanten/Standorte/Abteilungen
2. **Nur 2 Rollen** – company/agency ohne granulare Berechtigungen
3. **Kein Approval-Workflow** – Suchaufträge gehen direkt live
4. **Kein Vendor Pool** – Keine Supplier-Tiers, keine Preferred/Blocked-Listen
5. **Kein Requisition-Lifecycle** – Search Jobs sind keine echten Requisitions (kein DRAFT→APPROVAL→OPEN→FILLED)
6. **Kein Executive Dashboard** – Keine KPI-Übersichten, keine Management-Reports

### Wichtig (Professionalisierung)
7. **Compliance nur auf Request-Ebene** – Keine Supplier-Dokumente (AÜG, UVV, Versicherungen)
8. **Keine Shortlist-Funktion** – Kein Review/Bewertung vor Deal-Abschluss
9. **3 separate Scoring-Funktionen** – marketplaceService, slaSearchService, capacityService nicht konsolidiert
10. **Keine Match-Erklärbarkeit** – Nur numerischer Score, keine menschenlesbaren Gründe
11. **Keine Benachrichtigungen/Eskalationen** – Nur E-Mail bei Request-Erstellung

### Nice-to-have (Skalierung)
12. **Kein Multi-Tenant-Billing** – Subscriptions an User statt Org
13. **index.html 146 KB** – Legacy-SPA ohne Build-System
14. **Kein Webhook-System** – Keine externen Integrationen
15. **Keine API-Dokumentation** – ENDPOINTS.md existiert, aber unvollständig

## 4. Technische Risiken

| Risiko | Schwere | Beschreibung |
|--------|---------|--------------|
| OneDrive als Projektpfad | Mittel | Docker File-Locking möglich |
| Secrets in .env | Hoch | Gehören in Secret Manager vor Produktion |
| Keine Rate Limits auf sensitive Business-Aktionen | Mittel | Nur globale API/Auth Limiter |
| Session-basierte Auth | Niedrig | Funktional, aber nicht API-first |
| 3 duplizierte Haversine-Funktionen | Niedrig | Wartbarkeit |
| Keine DB-Transaktionen in einigen Services | Mittel | Race Conditions möglich |

## 5. UX-/Produktlücken

- Enterprise Dashboard zeigt nur Navigations-Karten, keine Daten
- Kein zentraler Überblick über offene Requisitions/Anfragen
- Supplier Scorecard nur per UUID-Eingabe erreichbar
- Compliance nicht visuell in Deal-Flows integriert
- Keine professionellen Empty/Error States auf einigen Seiten
- Keine Fortschrittsanzeige bei Multi-Step-Workflows
- Abo-Seite nicht mit Stripe-Live-Flow integriert

## 6. Sicherheits- und Skalierungsrisiken

### Sicherheit (bereits gut)
- Helmet mit CSP ✓, CSRF-Schutz ✓, XSS-Escaping (esc()) ✓
- Rate Limiting (Redis-backed) ✓, Non-root Docker ✓
- HSTS, Referrer-Policy, Permissions-Policy ✓

### Sicherheit (offen)
- Kein Brute-Force-Schutz auf Login (nur globaler Rate Limiter)
- Keine rollenbasierte Endpunkt-Absicherung (nur company/agency Check)
- Webhook-Endpunkte ohne Signatur-Validierung
- Keine Input-Sanitization auf HTML-Felder (nur Zod-Validation)

### Skalierung
- Matching lädt alle capacity_posts/demand_requests in Memory (O(n))
- Keine Pagination auf Match-Ergebnisse
- supplier_metrics Recompute ist O(n²) bei vielen Agencies
- Kein Connection Pooling Tuning (pg default)

## 7. Empfohlene Prioritäten

1. **Datenmodell erweitern** – Organizations, Locations, Departments, Memberships, Requisitions, Vendor Pool, Compliance Documents
2. **RBAC implementieren** – Granulare Rollen und Permissions pro Organisation
3. **Requisition-Lifecycle** – Search Jobs zu echten Requisitions mit State Machine
4. **Vendor Pool** – Supplier-Tiers und Zuweisungen
5. **Compliance-Modul** – Supplier-Dokumente mit Gültigkeitsdaten
6. **Matching konsolidieren** – Ein einheitlicher Multi-Faktor-Scoring-Algorithmus
7. **Executive Dashboard** – KPI-Übersicht mit Filtern
8. **UI/UX Enterprise-Level** – Professionelle Seiten für alle neuen Module
9. **Dokumentation** – Vollständige technische Docs
10. **Security Hardening** – Login-Brute-Force, Webhook-Signatur, Input-Sanitization
