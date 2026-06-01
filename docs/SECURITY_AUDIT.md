# TempConnect — Security Audit Report

**Datum:** 2026-03-14
**Scope:** Finaler Security-Review vor Production Go-Live
**Prüfbereiche:** RBAC, Tenant Isolation, Input Validation, Upload-Sicherheit, Rate Limiting, Secrets Handling, API Security

---

## Gesamtergebnis

| Bereich | Bewertung | Status |
|---|---|---|
| RBAC Enforcement | A | ✅ Bestanden |
| Tenant Isolation | A | ✅ Bestanden |
| Input Validation | A- | ✅ Bestanden |
| Upload-Sicherheit | B+ | ⚠️ 1 Finding gefixt |
| Rate Limiting | A- | ✅ Bestanden |
| Secrets Handling | A | ✅ Bestanden |
| API Security | A | ✅ Bestanden |
| **Gesamt** | **A-** | **Production-Ready** |

---

## 1. RBAC Enforcement — A ✅

### Geprüft

- `middleware/rbac.js` — `requirePermission()`, `requireRole()`, `requireOrgContext()`
- `services/rbacService.js` — Rollen-Hierarchie, Permission-Matrix, Membership-Abfragen
- 6 dedizierte Security-Testdateien unter `test/security/`

### Ergebnisse

**Stärken:**
- Deklarative Permission-Matrix mit 45+ Permissions und 12 Rollen
- Rollen-Hierarchie mit Vererbung (platform_admin → owner → admin → ...)
- Jeder RBAC-Check validiert aktive Org-Membership (`is_active = TRUE`)
- `requirePermission` prüft sowohl explizite org_id als auch Primary-Org Fallback
- Alle RBAC-Middleware gibt bei fehlendem Session `401 NOT_AUTHENTICATED` zurück
- Umfangreiche Tests: `auth-security.test.js`, `rbac-security.test.js`, `permission-bypass.test.js`, `role-escalation.test.js`

**Schwachstellen:** Keine gefunden.

### Empfehlung

- Langfristig: Permission-Caching in Session/Redis (aktuell: DB-Query pro Request)

---

## 2. Tenant Isolation — A ✅

### Geprüft

- `middleware/orgContext.js` — Org-Resolution, UUID-Validierung, Session-Cache
- Org-Boundary-Checks in Routen: organizations, complianceDocs, invoices, requisitions, approvals, vendorPool
- `test/security/org-isolation.test.js` — Cross-Tenant-Tests
- RLS-Policies (dokumentiert in SECURITY.md)

### Ergebnisse

**Stärken:**
- `orgContextMiddleware` validiert `org_id` als UUID (Regex), rejektet Non-UUID-Werte
- Explizite org_id wird per Membership-Lookup verifiziert (User muss Member sein)
- Alle Resource-Detail-Endpunkte prüfen `doc.org_id !== req.orgId` → `ORG_BOUNDARY_VIOLATION`
- Compliance-Docs: Alle 7 Endpunkte (GET, POST, PATCH, verify, reject, DELETE, stats) mit Org-Boundary-Check
- Invoices, Requisitions, Approvals, Vendor Pool: Org-Boundary-Tests vorhanden
- PostgreSQL RLS als zweite Verteidigungsschicht (documentiert)

**Schwachstellen:** Keine gefunden.

---

## 3. Input Validation — A- ✅

### Geprüft

- `middleware/validate.js` — Zod-basierte Request-Validation
- Vordefinierte Schemas für alle kritischen Endpunkte
- UUID-Validierung in Routen

### Ergebnisse

**Stärken:**
- Zod-Middleware validiert `body`, `query` und `params` separat
- Geparste/coercete Werte werden zurückgeschrieben (kein raw User-Input in Business-Logik)
- Vordefinierte Schemas: `register`, `login`, `organizationCreate`, `requisitionCreate`, `capacityPostCreate`, `timesheetSubmit`, `invoiceCreate`, `dealCreate`, `passwordChange`, `inviteMember`
- Max-Length auf allen String-Feldern (verhindert Payload-Bombing)
- Enums für kritische Felder (plan, role, urgency, payment_method)
- UUID-Validierung auf allen `:id` Params via Regex in Routen

**Geprüfte SQL-Injection-Abwehr:**
- Alle DB-Queries verwenden parametrisierte Queries (`$1`, `$2`, ...)
- Keine String-Concatenation in SQL-Statements gefunden
- `express.json({ limit: "1mb" })` verhindert Payload-Flooding

### Empfehlung

- Zod-Validation auf verbleibende Routen ausweiten (marketplace, capacityExchange — aktuell manuell validiert, aber funktional sicher durch parametrisierte Queries)

---

## 4. Upload-Sicherheit — B+ ⚠️ (1 Finding gefixt)

### Geprüft

- `routes/offerAssets.js` — Multer-Upload, MIME-Validierung, Ownership-Check
- `/uploads` Static-Route in `app.js`
- `routes/complianceDocs.js` — Compliance-Dokument-API

### Ergebnisse

**Stärken:**
- MIME-Whitelist: nur `image/png`, `image/jpeg`, `image/webp`, `application/pdf`
- Extension-Whitelist: `.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`
- Max File Size: 5 MB (`LIMIT_FILE_SIZE`)
- UUID-Validierung auf `offerId` (Path Traversal Prevention)
- Ownership-Check vor Upload (nur Owner des Listings darf hochladen)
- Dateinamen: `{timestamp}-{random}.{ext}` (keine Original-Dateinamen im Filesystem)
- Upload-Verzeichnis per UUID isoliert: `uploads/offers/{uuid}/`
- Cleanup bei Validierungsfehler: `fs.unlink` auf abgelehnte Dateien

### Finding SEC-001: /uploads Static-Route ohne Security Headers (MEDIUM) — GEFIXT

**Vorher:** `express.static("/uploads")` war vor `helmet()` gemountet (app.js Zeile 106). Downloads hatten keine Security-Headers (`X-Content-Type-Options`, `X-Frame-Options`, CSP).

**Fix angewendet:**
- `/uploads` Static-Route nach `helmet()` verschoben
- `dotfiles: "deny"` — keine versteckten Dateien (.env, .htaccess)
- `index: false` — kein Directory Listing
- PDFs erhalten `Content-Disposition: attachment` (verhindert XSS via eingebettete PDFs im Browser)

### Empfehlungen

- SEC-002 (LOW): Für Compliance-Dokumente langfristig signierte Download-URLs implementieren (zeitlich begrenzt, auth-validiert)
- SEC-003 (LOW): Upload-Virus-Scanning via ClamAV bei Skalierung evaluieren

---

## 5. Rate Limiting — A- ✅

### Geprüft

- `middleware/rateLimit.js` — 4-Tier Rate Limiting
- Redis-Store-Integration
- Konfigurierbarkeit via ENV

### Ergebnisse

**Stärken:**
- **Auth-Limiter:** 5 Requests / 15 Min pro IP+Path (Produktion) — Brute-Force-Schutz
- **Request-Limiter:** 30 Requests / 10 Min (für schreibende Endpoints)
- **API-Limiter:** 200 Requests / 5 Min (globaler Schutz) — skippt `/csrf` und `/health`
- **Cron-Limiter:** 30 Requests / 60s (schützt interne Endpoints)
- Redis-backed in Produktion (konsistent über mehrere Instanzen)
- Memory-Store als Fallback für Development
- Standard-Headers: `RateLimit-*` (RFC 6585)
- Dev-Umgebung: gelockerte Limits (automatische Erkennung)

### Empfehlung

- Langfristig: Sliding-Window-Algorithmus statt Fixed-Window für gleichmäßigere Verteilung

---

## 6. Secrets Handling — A ✅

### Geprüft

- `config/index.js` — Startup-Validierung, Placeholder-Detection
- `app.js` — Session-Cookie-Konfiguration
- Logger — PII/Secret-Redaction
- `docs/SECURITY-CONFIG.md` — Rotation Guide
- `docs/SECURITY-VERIFICATION.md` — Repo-Scan-Anleitung

### Ergebnisse

**Stärken:**
- **Fail-Fast in Produktion:** API startet nicht wenn SESSION_SECRET, JWT_SECRET, INTERNAL_CRON_SECRET, ADMIN_SECRET fehlen oder Platzhalter sind
- **Placeholder-Detection:** Erkennt `HIER_`, `DEIN_`, `PLACEHOLDER`, `xxxxxxxx`, leere Strings, `dev_secret_change_me`
- **Log Redaction:** pino redaktiert automatisch:
  - `req.headers.authorization`, `req.headers.cookie`, `x-csrf-token`, `x-admin-secret`, `x-internal-secret`
  - `*.password`, `*.token`, `*.secret`, `*.apiKey`, `*.creditCard`, `*.ssn`
- **Stripe Validation:** Wenn `PAYMENT_MODE !== demo`, müssen `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` gesetzt sein
- **DB-Credentials:** Validation von `DATABASE_URL` oder `DB_HOST + POSTGRES_PASSWORD`
- **Cookie Security:** `httpOnly: true`, `sameSite: "lax"`, `secure: true` in Produktion, `path: "/"`
- **Rotation Guide:** Dokumentiert für alle 6 Secret-Typen

### Empfehlung

- SEC-004 (LOW): Reset-Tokens mit SHA-256 hashen bevor sie in der DB gespeichert werden (aktuell Plaintext; Risiko nur bei DB-Read-Access durch Angreifer)

---

## 7. API Security — A ✅

### Geprüft

- Helmet-Konfiguration (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- CORS-Konfiguration
- CSRF-Schutz
- Idempotency-Middleware
- Stripe-Webhook-Signatur
- Error Handler (Stack-Trace-Leaking)
- Session-Konfiguration

### Ergebnisse

**Stärken:**

**Helmet (Security Headers):**
- Content-Security-Policy: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`
- Referrer-Policy: `strict-origin-when-cross-origin`
- X-Content-Type-Options: `nosniff` (Helmet Default)
- X-Frame-Options: `SAMEORIGIN` (Helmet Default)

**CSRF-Schutz:**
- Double-Submit-Token-Pattern (`crypto.randomBytes(32)`)
- `X-CSRF-Token` Header erforderlich für alle POST/PUT/PATCH/DELETE
- Token in Session gespeichert, nicht im Cookie

**CORS:**
- Explizite Allowlist (`localhost:8080`, `127.0.0.1:8080`, konfigurierbar via `CORS_ORIGIN`)
- `credentials: true` nur für erlaubte Origins
- Unbekannte Origins werden rejected

**Idempotency:**
- Alle schreibenden Requests unterstützen `Idempotency-Key` Header
- Keys in PostgreSQL mit TTL (24h Cleanup via Cron)
- Verhindert doppelte Zahlungen und Race Conditions

**Stripe Webhook:**
- Signaturprüfung via `stripe.webhooks.constructEvent(body, sig, secret)`
- Raw Body Parser nur auf Webhook-Route (`express.raw`)
- Idempotent: bereits verarbeitete Events werden ignoriert
- Fehlende `STRIPE_WEBHOOK_SECRET` → Webhook rejected

**Error Handler:**
- 5xx-Errors: Generische Nachricht (`"Interner Serverfehler"`) — kein Stack-Trace an Client
- 4xx-Errors: Spezifische, aber sichere Fehlermeldungen
- Sentry-Integration für alle Errors
- Strukturiertes Logging mit Correlation-ID

**Session:**
- PostgreSQL-backed Sessions (connect-pg-simple)
- 14 Tage TTL (rolling)
- `trust proxy: 1` für korrektes IP-Handling hinter Reverse Proxy

### Empfehlungen

- HSTS-Header explizit mit `maxAge: 31536000` und `includeSubDomains` setzen (aktuell Helmet-Default, aber explizit definieren für Audit-Trail)
- Langfristig: MFA als optionale Funktion für Owner/Admin-Accounts

---

## Übersicht aller Findings

| ID | Schwere | Bereich | Beschreibung | Status |
|---|---|---|---|---|
| SEC-001 | MEDIUM | Upload | `/uploads` vor `helmet()` gemountet, keine Security Headers | ✅ Gefixt |
| SEC-002 | LOW | Upload | Signierte Download-URLs für sensitive Dokumente | Empfehlung |
| SEC-003 | LOW | Upload | Virus-Scanning für Uploads | Empfehlung |
| SEC-004 | LOW | Auth | Reset-Token Hashing (SHA-256) | Empfehlung |

**Kritische Findings:** 0
**Gefixt in diesem Audit:** 1 (SEC-001)
**Empfehlungen für nächste Phase:** 3

---

## Security-Testabdeckung

| Test-Datei | Prüfbereich | Tests |
|---|---|---|
| `test/security/auth-security.test.js` | Auth-Enforcement, Session-Manipulation | 20+ |
| `test/security/rbac-security.test.js` | Permission-Matrix-Enforcement | 30+ |
| `test/security/org-isolation.test.js` | Cross-Tenant-Access (IDOR) | 15+ |
| `test/security/resource-ownership.test.js` | Resource-Owner-Checks | 10+ |
| `test/security/role-escalation.test.js` | Privilege-Escalation-Prevention | 10+ |
| `test/security/permission-bypass.test.js` | Permission-Bypass-Attempts | 10+ |

**Gesamt Security-Tests:** 95+ dedizierte Security-Regressionstests

---

## Architektur-Zusammenfassung

```
Request → Rate Limiter → Helmet → CORS → Session → CSRF → OrgContext → RBAC → Route Handler
                                                                          ↓
                                                                    Audit Trail
                                                                    Sentry
                                                                    Structured Logging
```

**Defense-in-Depth-Schichten:**
1. Netzwerk: UFW Firewall, Docker-internes Netzwerk, nur Port 80/443 exponiert
2. Transport: TLS (Certbot/Let's Encrypt), HSTS, Secure Cookies
3. Application: Helmet, CORS, CSRF, Rate Limiting, Idempotency
4. Authentication: Session-based (bcrypt, rolling TTL), Fail-Fast Secret Validation
5. Authorization: RBAC (Permission + Role), Org-Boundary-Checks, Ownership-Checks
6. Data: Parametrisierte SQL-Queries, Zod Input Validation, PII Log Redaction
7. Database: RLS Policies, Audit Trail, Managed DB mit IP-Whitelist
8. Monitoring: Sentry Error Tracking, Prometheus Alerts, Structured JSON Logging

---

## Fazit

TempConnect erfüllt Enterprise-Sicherheitsanforderungen auf **A-** Niveau. Die Kombination aus RBAC, Tenant Isolation, Zod-Validierung, CSRF-Schutz, Rate Limiting und strukturiertem Audit-Trail bietet ein solides, mehrschichtiges Sicherheitsmodell.

**Nächste Schritte für A+:**
1. MFA für Owner/Admin-Accounts
2. Externer Penetrationstest
3. SOC 2 Type II Vorbereitung
4. Signierte Download-URLs für Compliance-Dokumente
