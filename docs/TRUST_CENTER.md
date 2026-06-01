# Trust Center

Public-facing Trust Center documenting TempConnect's security, compliance, and operational status for prospective and existing B2B customers.

## Pages

### Security (`/public/trust/security.html`)
Comprehensive security documentation covering:
- **Infrastructure & Encryption** — TLS, bcrypt, Helmet.js security headers, German hosting (Hetzner)
- **Multi-Tenancy & Org Isolation** — Org boundary enforcement, IDOR protection, cross-tenant blocking
- **RBAC** — 15+ role types, permission-based middleware chain (requireAuth → requireOrgContext → requirePermission), sanitized error responses (SEC-003)
- **Audit Logging** — Append-only log, 10+ action types, DSGVO-compliant data sanitization, diff tracking
- **Monitoring & Alerting** — Sentry v9 (PII-scrubbed), Prometheus metrics (prom-client), automated health checks
- **Incident Response** — P1–P4 severity classification, defined response times (30min–next business day)
- **Upload Security** — File size limits, MIME validation, org-scoped storage, rate limiting
- **Security by Design** — Defense in depth, least privilege, fail secure, automated security regression tests (6 attack classes)

### Compliance (`/public/trust/compliance.html`)
Regulatory and compliance documentation:
- **DSGVO/GDPR** — Data minimization, subject rights, Art. 30 processing records, automatic PII redaction in logs
- **AV-Verträge** — Data processing agreements with all infrastructure partners (Art. 28 DSGVO)
- **Document Verification** — Compliance traffic light (green/yellow/red), expiry monitoring
- **Supplier Quality** — Scorecard (A/B/C), Vendor Pool Tiers, Smart Ranking signals
- **Audit Trail** — Append-only, org-scoped queries, pagination, export
- **Backup & Recovery** — Automated DB backups, RPO/RTO targets, separated backup storage
- **SLA & Availability** — 99.5% Enterprise, 99.0% Plus/Pro, real-time status page link
- **Organizational Measures** — Access control (session + bcrypt + rate limiting), transfer control (TLS, no third-party sharing), input control (audit diff tracking)

### Status (`/public/trust/status.html`)
Real-time platform health dashboard:
- **7 monitored components**: Web, API, Database, Matching Engine, Timesheet Processing, Notification System, Background Services, Search
- Fetches `/api/public/system-status` every 60 seconds
- Fallback to `/health` if the structured endpoint is unavailable
- Per-component latency display (ms)
- Overall status indicator (ok / partial / degraded)
- Uptime targets and incident history section

### Platform SLA (`/public/trust/platform-sla.html`)
Pre-existing SLA page (unchanged by this task).

## Trust Center Navigation
All trust pages share a cross-navigation bar at the top:
```
🔒 Sicherheit | 📜 Compliance | 🟢 Systemstatus | 📄 SLA
```
The active page is highlighted with the brand color. The nav bar uses the `.trust-nav` CSS class.

## API Endpoint

### `GET /api/public/system-status`
Public, unauthenticated endpoint returning structured component health.

**Response:**
```json
{
  "status": "ok | partial | degraded",
  "checked_at": "2026-03-16T09:00:00.000Z",
  "response_ms": 12,
  "components": {
    "api":                   { "status": "ok", "latency_ms": 0 },
    "database":              { "status": "ok", "latency_ms": 3 },
    "matching_engine":       { "status": "ok", "latency_ms": 2 },
    "timesheet_processing":  { "status": "ok", "latency_ms": 1 },
    "notification_system":   { "status": "ok" },
    "background_services":   { "status": "ok" },
    "search":                { "status": "ok", "latency_ms": 5 }
  }
}
```

**Status values per component:**
- `ok` — Fully operational
- `degraded` — Partially functional (e.g. SMTP not configured)
- `error` — Component unreachable

**Overall status logic:**
- `ok` — All components operational
- `partial` — Some components degraded but no errors
- `degraded` — At least one component in error state

**HTTP status:** 200 normally, 503 if database is in error state.

## Architecture Notes
- The endpoint is defined in `api/routes/health.js` alongside existing `/health`, `/ready`, `/service-status` routes
- Matching Engine, Timesheet Processing health is derived from DB availability (they are DB-dependent services)
- Notification System checks SMTP configuration (SMTP_HOST env var)
- Background Services check Redis/Queue availability when configured
- Search uses `searchService.getSearchStatus()`
- No secrets or internal details are exposed in the public response

## Technische Systeme hinter den Aussagen

Jede Aussage im Trust Center ist durch reale Implementierungen belegt:

| Trust-Center-Aussage | Technische Grundlage |
|----------------------|---------------------|
| Verschlüsselung | TLS via Nginx, bcrypt (12 Rounds) für Passwörter, HMAC-SHA256 für Webhooks |
| Multi-Tenancy Isolation | `requireOrgContext` Middleware, Org-Boundary Checks in allen Services, Row-Level Security prep (Migration 031) |
| RBAC | `rbacService.js` mit 45+ Permissions, 12 Rollen, `requirePermission` Middleware-Chain |
| Audit Trail | `audit_log` Tabelle, `auditWrite.js` Middleware, 10+ action_types, DSGVO-Sanitization |
| Monitoring | Sentry v9 (`monitoring.js`), Prometheus (`metrics.js`), Grafana (2 Dashboards), 11 Alert-Rules |
| Backup & Recovery | `scripts/backup.sh` + `restore.sh` + `backup-verify.sh`, SHA-256 Checksums, Manifest |
| Upload Security | `middleware/uploadSecurity.js`, MIME-Validation, Extension-Whitelist, Size-Limits |
| Rate Limiting | 4-Tier (`middleware/rateLimit.js`): auth 5/15min, request 30/10min, api 200/5min, Redis-backed |
| SLA Monitoring | `/api/public/system-status` Endpoint, 7 Komponenten, 60s Polling |

## Datenresidenz

- **Hosting:** Hetzner Cloud, Standort Deutschland (Nürnberg / Falkenstein)
- **Datenbank:** PostgreSQL 16 auf dedizierten Volumes, keine Replikation in Nicht-EU-Regionen
- **Backups:** Lokaler Server + separater Storage (konfigurierbar für S3-kompatiblen Off-Site-Backup)
- **Drittanbieter-Datenfluss:** Sentry (EU-Instanz konfigurierbar), Stripe (PCI-DSS-konform)
- **Keine Datenweitergabe** an Dritte außerhalb der dokumentierten Auftragsverarbeiter

## Zertifizierungen (Roadmap)

| Zertifizierung | Status | Beschreibung |
|---------------|--------|--------------|
| DSGVO/GDPR | ✅ Implementiert | Art. 30 Verarbeitungsverzeichnis, PII-Redaction, Löschkonzept |
| AV-Verträge (Art. 28) | ✅ Dokumentiert | Auftragsverarbeitungsverträge mit Hosting/Mail-Provider |
| SOC 2 Type II | 🗓 Geplant | Security + Availability Trust Service Criteria |
| ISO 27001 | 🗓 Evaluierung | Information Security Management System |
| BSI C5 | 🗓 Evaluierung | Cloud-Sicherheit nach BSI-Standard (für öffentliche Auftraggeber) |

## Trust Center erweitern

### Neue Trust-Page hinzufügen

1. HTML-Datei in `frontend/public/trust/` erstellen (Bestehendes CSS/Layout übernehmen)
2. Trust-Nav-Link in allen bestehenden Trust-Pages ergänzen (`.trust-nav`)
3. Dokumentation in dieser Datei aktualisieren

### Status-Endpoint um Komponente erweitern

`api/routes/health.js` → `/api/public/system-status` Handler:

```javascript
// Neue Komponente hinzufügen:
try {
  const start = Date.now();
  // Health-Check-Logik...
  components.my_component = { status: 'ok', latency_ms: Date.now() - start };
} catch {
  components.my_component = { status: 'error' };
}
```

Die Status-Page (`trust/status.html`) zeigt automatisch alle Komponenten aus der API-Response an.

## Files
- `frontend/public/trust/security.html` — Security-Dokumentation (18 Cards, 7 Sections)
- `frontend/public/trust/compliance.html` — Compliance-Dokumentation (13 Cards, 6 Sections)
- `frontend/public/trust/status.html` — Live-Systemstatus mit API-Integration
- `frontend/public/trust/platform-sla.html` — SLA-Übersicht
- `api/routes/health.js` — `/health`, `/ready`, `/service-status`, `/public/system-status`
- `api/services/healthService.js` — DB-Ping, Migrations-Status
- `docs/SECURITY_AUDIT.md` — Detaillierter Security-Audit (Note A-)
- `docs/AGB_SLA_ANLAGE.md` — Rechtsgültige SLA-Anlage
- `docs/SLA_LEISTUNGSBESCHREIBUNG.md` — Technische SLA-Beschreibung
