# TempConnect — Security Overview

> Technische Security-Übersicht für Enterprise Due Diligence und interne Qualitätssicherung.
> WAVE 11 — Phase 2 — 2026-05-26

---

## Verteidigungsschichten (Defense in Depth)

```
Internet
  ↓ [1] HTTPS / TLS (nginx terminiert)
  ↓ [2] Rate Limiting (Auth: 5/15min, API: 600/5min, public)
  ↓ [3] CORS Policy (keine Wildcard in Production)
  ↓ [4] CSRF Token (alle mutierende Requests)
  ↓ [5] Session Authentifizierung (HttpOnly, Secure, SameSite=Strict)
  ↓ [6] RBAC (requirePermission pro Route)
  ↓ [7] Org-Boundary (withOrgContext / assertOrgOwnership)
  ↓ [8] RLS (PostgreSQL Row-Level Security, deny-by-default)
  ↓ [9] Audit Log (alle mutierende Aktionen)
```

---

## 1. Transport Security

| Maßnahme | Status |
|---|---|
| HTTPS/TLS (nginx) | ✅ Aktiv |
| HSTS (via Helmet) | ✅ `max-age=15552000; includeSubDomains` |
| TLS 1.2+ only | ✅ nginx-Konfiguration |
| Certificate: Let's Encrypt | ✅ Auto-Renewal |

---

## 2. HTTP Security Headers

Konfiguriert in `api/app.js` via `helmet()`:

| Header | Wert |
|---|---|
| `X-Frame-Options` | `DENY` (via CSP `frame-ancestors 'self'`) |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |

---

## 3. CORS

```javascript
// Production: nur konfigurierte Origin(s) aus CORS_ORIGIN ENV
allowedOrigins = isProduction ? [] : [localhost-origins];
if (config.CORS_ORIGIN) allowedOrigins.push(config.CORS_ORIGIN);
// credentials: true (Cookie-Authentifizierung)
// Kein Wildcard-CORS in Production
```

---

## 4. Rate Limiting

| Limiter | Fenster | Production Max | Anmerkung |
|---|---|---|---|
| `authLimiter` | 15 Minuten | 5 Versuche | Login, Passwort-Reset, SSO |
| `apiLimiter` | 5 Minuten | 600 Requests | Mutierende API-Aufrufe |
| `requestLimiter` | 10 Minuten | 30 Requests | Spezielle Endpunkte |
| `analyticsIngestLimiter` | 1 Minute | 120 | Analytics-Ingestion |
| `occRateLimit` | 1 Minute | 60 | OCC-Endpunkte |
| `supportRateLimit` | 1 Minute | 90 | Support-Ops |
| `warpExecutionRateLimit` | 1 Stunde | 10 | Automation-Runs |

**Store:** Memory (single Instance) oder Redis (distributed, empfohlen für Multi-Instance)

---

## 5. CSRF

- `csrf-csrf` Middleware auf allen mutierende Endpunkten
- Token via `GET /api/csrf-token` abgerufen
- Header: `X-CSRF-Token`
- Session-gebunden (SameSite=Strict als zweite Verteidigungslinie)

---

## 6. Authentifizierung & Sessions

| Aspekt | Konfiguration |
|---|---|
| Session-Cookie | `HttpOnly, Secure, SameSite=Strict` |
| Session-Store | PostgreSQL (pg-session) |
| TTL | 14 Tage (Plattform), 4 Stunden (Staff SCC) |
| Session-Regeneration | Nach Login + nach SSO-Callback |
| Getrennte Sessions | Plattform (`tc.sid`) ↔ Staff SCC (`tc.staff.sid`) |
| Passwort-Hashing | bcrypt (12 Runden) |
| MFA | TOTP + 10 Backup-Codes (optional, opt-in) |

---

## 7. RBAC (Role-Based Access Control)

- Deklarative Permission-Matrix in `api/services/rbacService.js`
- 12 Rollen, Hierarchie-Vererbung
- `requirePermission("permission.key", { pool, logger })` Middleware auf allen Routen
- Kein Inline-Rollen-Check in Services erlaubt (nur `hasPermission()`)

---

## 8. Tenant-Isolation / Org-Boundary

**Dreifache Absicherung:**
1. **Application Layer:** `assertOrgOwnership(pool, orgId, resourceId)` — validiert Zugehörigkeit
2. **Query Layer:** `withOrgContext(pool, orgId, fn)` — setzt `SET LOCAL app.current_org_id`
3. **Database Layer:** PostgreSQL RLS (Row-Level Security) — deny-by-default

**Aktive RLS-Tabellen:** 10 (Migration 116)  
**Dokumentation:** `docs/security/TENANT_ISOLATION_MODEL.md`

---

## 9. Secrets & Konfiguration

- Keine Secrets in Code oder Repository
- Nur Umgebungsvariablen (`.env` ist gitignored)
- Validation bei Start: `api/config/envValidator.js` (Zod)
- Production blockiert Start mit schwachen Secrets
- `FEATURE_GATE_BYPASS=true` ist in Production verboten (wirft Error)
- Secret-Rotation dokumentiert: `docs/security/SECRET_ROTATION.md`

---

## 10. API Keys (Partner-Integration)

- Hashing: SHA-256 des Raw-Keys (nur Hash in DB)
- Prefix: `tc_live_` (Production) / `tc_test_` (Entwicklung)
- Scopes: granular (z.B. `read`, `write:timesheets`)
- Revocation: sofortig über DB-Flag
- Last-Used-Tracking: async (non-blocking)
- Audit-Event bei Verwendung

---

## 11. Audit Logging

**Tabelle:** `audit_log` (RLS-geschützt, Org-gefiltert)

**Pflicht-Events:**
- Login, Logout, Login-Failed
- MFA Enable/Disable/Verify
- SSO Login
- Alle Org-Mutations (Settings, Members, Billing)
- Requisition Create/Edit/Approve/Cancel
- Assignment Create/Complete
- Contract Create/Terminate
- Staff Cross-Org Access (via `withStaffContext`)
- OCC Access

**Implementierung:** `api/middleware/auditWrite.js` + `res.locals.audit` in Routes

---

## 12. SSO (Soft-Lock)

SSO ist in Production vollständig gesperrt (`stub`-Modus ist blockiert).  
Details: `docs/security/IDENTITY_MODEL.md`

---

## 13. Dependency Security

```bash
npm audit --omit=dev  # → 0 vulnerabilities (Stand: WAVE 04)
```

Überwachung: regelmäßig vor Releases ausführen.

---

## Bekannte Lücken / Offene Punkte

| ID | Beschreibung | Priorität | Owner-Entscheidung |
|---|---|---|---|
| ID-01 | MFA-Pflicht für owner/admin nicht erzwungen | HOCH | Ausstehend |
| ID-03 | SSO nicht produktionsreif | HOCH | Dauerhaft B oder A? |
| W11-01 | RLS auf ~60 weiteren Tabellen ausstehend (Migration 117) | MITTEL | Keine |
| W11-02 | Rate-Limit-Store: Memory (single instance) — Redis für Multi-Instance | MITTEL | Infra-Entscheidung |

---

*Letzte Aktualisierung: WAVE 11 — Phase 2 — 2026-05-26*
*Zuständig: Security (Claude), Freigabe: Owner*
