# TempConnect — Security Overview

> Erstellt: 2026-05-28 | Enterprise Pack | Für Sicherheits-Reviews und Compliance-Gespräche

---

## 1. Transport & Headers

| Kontrolle | Implementierung | Konfigurationsdatei |
|---|---|---|
| **HTTPS erzwungen** | Nginx termination + HSTS | `nginx.conf`, `docker-compose.prod.yml` |
| **CSP (Content Security Policy)** | `helmet({ contentSecurityPolicy: { defaultSrc: ["'self'"], frameAncestors: ["'self'"], objectSrc: ["'none'"] } })` | `api/app.js:176` |
| **X-Frame-Options** | Via helmet (DENY) | `api/app.js:176` |
| **X-Content-Type-Options** | Via helmet (nosniff) | `api/app.js:176` |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | `api/app.js:189` |
| **Permissions-Policy** | camera=(), microphone=(), geolocation=(), payment=(), usb=() | `api/app.js:193` |
| **CORS** | Prod: nur `CORS_ORIGIN` ENV; Dev: localhost:8080 | `api/app.js:213` |

---

## 2. Authentifizierung & Session

| Kontrolle | Implementierung | Details |
|---|---|---|
| **Session-Cookie** | `tc.sid` via `express-session` | httpOnly, sameSite=lax, secure in Prod, 14 Tage TTL |
| **Staff-Session** | Separates Cookie `/staff` | httpOnly, sameSite=strict, secure, 4h TTL, eigene DB-Tabelle `staff_session` |
| **Password-Hashing** | bcrypt, Work Factor 10 | `api/services/authService.js` |
| **CSRF-Schutz** | `csrfProtect` auf allen `/api/*` Routen | `api/app.js:243`, `api/routes/csrf.js` |
| **MFA** | TOTP-basiert über `/mfa/*` Routen | `api/middleware/requireMfa.js`, `api/routes/mfa.js` |
| **Session-Isolation** | Worker/Staff/Platform in getrennten Session-Stores | Keine Überschneidung möglich |

---

## 3. Autorisierung (RBAC)

| Ebene | Implementierung | Geltungsbereich |
|---|---|---|
| **Authentifizierung** | `requireAuth` — jede geschützte Route | Alle `/api/*` außer public endpoints |
| **Rollen (RBAC)** | `requirePermission(permission)` — granulare Rechte | Alle Business-Routen |
| **Org-Boundary** | `requireCompanyOrg` / `requireAgencyOrg` — verhindert Seitenaufruf auf falscher Seite | Spend, Reporting, Vendor Pool |
| **Location-Scope** | `assertLocationBelongsToOrg()` — location_id muss zur Org gehören | Alle location-parametrisierten Queries |
| **Worker-Isolation** | `requireWorkerRole` — Worker-Portal nur für Rollen=worker | `api/routes/workerPortal.js:126` |
| **Admin-Guard** | `requireAdmin` — platform_admin / owner / admin | Alle `/api/admin/*` Routen |
| **Internal-Guard** | `requireInternalPermission` | Alle `/api/internal-control/*` Routen |
| **Owner-Guard** | `requireOwnerControlAccess` | Alle `/api/owner-control/*` Routen |
| **Staff-Guard** | `staffControlAccess` + `requireStepUp` | Alle `/staff/api/*` Routen |

---

## 4. Datenbankzugriff

| Prinzip | Implementierung |
|---|---|
| **Parametrisierte Queries** | Ausschließlich `pool.query(sql, [params])` — kein String-Concatenation |
| **Org-Scope in SQL** | Jede Query mit `WHERE org_id = $N` oder `WHERE user_id = $N` |
| **Org-Boundary-Fehler = 403** | Nie 200 mit falschen Daten — immer 403 bei Cross-Tenant-Zugriff |
| **withTransaction()** | Multi-Statement-Writes in Transaktion | `api/db/withTransaction.js` |
| **Idempotency-Key** | Schreibende Endpunkte respektieren Idempotency-Header | `api/middleware/idempotency.js` |

---

## 5. Eingabevalidierung

| Kontrolle | Implementierung |
|---|---|
| **Zod-Validation** | Alle POST/PATCH-Bodies validiert mit Zod-Schemas |
| **Input-Sanitization** | `esc()` in Frontend für alle user-supplied Werte in innerHTML |
| **Upload-Guard** | Nur erlaubte MIME-Types; PDFs als `Content-Disposition: attachment` |
| **dotfiles-Deny** | `/uploads` serviert keine versteckten Dateien |

---

## 6. Audit-Trail

| Kontrolle | Implementierung |
|---|---|
| **Audit-Coverage** | 335/335 Endpunkte mit Audit-Middleware abgedeckt (B-02, 2026-05-27) |
| **Audit-Namespace** | `owner_control.*`, `subscription.*`, `org.*`, `user.*`, `admin.*` etc. |
| **Unveränderliche Logs** | Audit-Logs in DB, kein Delete-Endpunkt |
| **Responsible Actor** | `details.responsible_actor_user_id` bei allen kritischen Aktionen |
| **Reason-Pflicht** | `confirm: true` + `reason: string(min 8)` bei mutativen Handlungen (SCC/OCC) |

---

## 7. Secrets Management

| Kontrolle | Implementierung |
|---|---|
| **Keine Secrets im Code** | `.env` in `.gitignore`, keine Hard-Coded-Credentials |
| **ENV-Validator** | `api/config/envValidator.js` — Pflichtfelder werden beim Start geprüft |
| **Rotation-Checkliste** | `docs/SECRET_ROTATION.md`, `docs/SECURITY_INCIDENTS.md` |
| **Rotation ausstehend** | DB_PASSWORD, SESSION_SECRET, JWT_SECRET, STRIPE_SECRET_KEY vor Go-Live (P0.4) |

---

## 8. Monitoring & Incident Response

| Kontrolle | Implementierung |
|---|---|
| **Sentry Error-Tracking** | PII-scrubbing: cookies, Authorization, X-CSRF-Token, X-Admin-Secret entfernt | `api/utils/monitoring.js` |
| **Prometheus** | Metrics-Endpunkt via Secret-gesichertem Header | `monitoring/start-prometheus.sh` |
| **Security Incident Runbook** | `docs/INCIDENT_RUNBOOK.md` |
| **Security Model** | `docs/SECURITY_MODEL.md`, `docs/SECURITY.md` |
| **TOMS** | `docs/TOMS.md` — Art. 32 DSGVO |

---

## 9. Bekannte offene Punkte (vor Go-Live)

| ID | Problem | Status |
|---|---|---|
| P0.4 | Secret-Rotation (DB, SESSION, JWT, STRIPE) | Owner-Task, vor Go-Live |
| F-01 | SSO-Dependency `@node-saml/node-saml` fehlt in package.json | **Gate-konform per Design**: ehrlicher Coming-Soon-Soft-Lock (`SSO_STUB_MODE`), kein taeuschender Stub. Produktive SAML = pro-Kunde-Aktivierung, Runbook in `docs/PILOT_GO_LIVE_TODOS.md` P1.1 |
| F-02 | SSO Break-Glass-Mechanismus | **Erledigt**: `auth.js` erzwingt Enforce nur bei `getSSOMode()==="saml"`, Passwort-Login bleibt Recovery |

### SSO-Modell (pro Organisation, 300-Kunden-tauglich)

SSO/SAML ist **pro Mandant** konfigurierbar (`org_sso_config`), nicht global. Jeder Kunde wird einzeln angebunden, sobald sein IdP (Azure AD / Okta) bereitsteht — kein Big-Bang, skaliert linear. Solange `@node-saml/node-saml` nicht installiert ist, laeuft die Plattform im honest Stub-Modus: SSO-Karte zeigt `SSO_STUB_MODE` (soft-locked, nicht buchbar), Enforce ist deaktiviert, Passwort-Login bleibt aktiv. Aktivierungs-Runbook: `docs/PILOT_GO_LIVE_TODOS.md` P1.1.
