# TempConnect — Identity Model & Authentifizierung

> WAVE 09 — Phase 2 — 2026-05-26
>
> Dieses Dokument beschreibt den aktuellen Implementierungsstand von SSO, MFA,
> Session-Management und Identity-Enforcement.

---

## Überblick: Aktueller Stand

| Feature | Status | Produktionsreif |
|---|---|---|
| **Login (Email/Password)** | ✅ Aktiv | Ja |
| **Session-Management** | ✅ Aktiv | Ja |
| **MFA (TOTP)** | ✅ Implementiert, opt-in | Ja (freiwillig) |
| **MFA-Enforcement** | ⚠️ Middleware vorhanden, nicht erzwungen | Pending Owner-Entscheidung |
| **SSO/SAML** | 🔒 Soft-Locked | **Nein** (nur INDIVIDUELL-Plan) |
| **Recovery Codes** | ✅ Implementiert | Ja |
| **Staff Step-Up Auth** | ✅ Aktiv (SCC) | Ja |
| **Owner Control Auth** | ✅ Aktiv (OCC) | Ja |

---

## Session-Management

### Standard-Session (Plattform-Nutzer)
```
POST /api/auth/login
→ req.session.userId gesetzt
→ Session-Cookie (HttpOnly, SameSite=Strict)
```

**Session-Konfiguration:**
- Cookie: HttpOnly, Secure (in Production), SameSite=Strict
- Session-Store: Redis (Production) oder Memory (Dev)
- Ablauf: konfigurierbar via `SESSION_MAX_AGE` ENV

### Staff-Session (SCC)
```
POST /staff/auth/login
→ req.session.staffUserId gesetzt (GETRENNT von userId)
```

**Step-Up (mutierende Aktionen):**
- `req.session.staffStepUpAt` = Timestamp
- Gültigkeit: 15 Minuten (konfigurierbar)
- Re-Auth erforderlich wenn abgelaufen

### Owner-Session (OCC)
```
Normales Session-Login + occ_owner_access DB-Check
→ req.session.userId + occ_owner_access.is_active
```

---

## MFA (TOTP — Time-based One-Time Password)

### Implementierung
- **Algorithmus:** TOTP (RFC 6238), kompatibel mit Google Authenticator / Authy
- **Datenbank:** `users.mfa_enabled`, `users.mfa_secret` (verschlüsselt gespeichert)
- **Recovery Codes:** 10 Backup-Codes bei Activation, hashed in DB

### API-Endpunkte
```
GET  /api/mfa/status    → { enabled: bool, backup_codes_remaining: int }
POST /api/mfa/setup     → { qr_code_url, secret } (Vorschritt)
POST /api/mfa/enable    → Token-Verifikation → aktiviert MFA, gibt backup_codes zurück
POST /api/mfa/verify    → Token-Check → setzt req.session.mfaVerifiedAt (8h gültig)
POST /api/mfa/disable   → Token-Verifikation → deaktiviert MFA
```

### Session-Zeitstempel
Nach erfolgreicher Verifikation via `POST /api/mfa/verify`:
```javascript
req.session.mfaVerifiedAt = Date.now(); // Timestamp in ms
```

### Enforcement-Middleware
Verfügbar: `api/middleware/requireMfa.js`

```javascript
import { requireMfa } from "../middleware/requireMfa.js";

// Enforcement-Modus (blockiert ohne MFA):
router.post("/sensitive", requireAuth, requireMfa({ pool, maxAgeMs: 8 * 3600000 }), handler);

// Audit-Only-Modus (loggt aber blockiert nicht — für Rollout):
router.post("/sensitive", requireAuth, requireMfa({ pool, enforce: false }), handler);
```

**Aktueller Status:** Middleware implementiert, **noch nicht** auf Produktions-Routen aktiv.

### Empfehlung (Owner-Entscheidung ausstehend)
MFA-Pflicht aktivieren für:
1. `org.settings` Aktionen (owner/admin)
2. `org.billing` Aktionen (finance)
3. Vendor-Pool-Mutations (supplier_manager)
4. Staff Control Center (SCC) — bereits durch Step-Up abgedeckt
5. Owner Control Center (OCC)

**Zeitplan-Empfehlung:** Soft-Enforcement (1 Monat Enrollmentfrist) → Pflicht-Enforcement.

---

## SSO / SAML — Soft-Lock (Option B)

### Warum Soft-Lock?

SSO (`@node-saml/node-saml`) ist **nicht in Production installiert**. Der Service läuft im `stub`-Modus:
```
SSO_MODE = "stub"  // @node-saml/node-saml ist nicht installiert
```

**Production-Schutz (WAVE 09):**
- `initiateSSOLogin()` → gibt `SSO_NOT_AVAILABLE` Error zurück (kein Stub-URL)
- `GET /sso/callback?stub=1` → 403 `SSO_STUB_NOT_ALLOWED`
- `POST /sso/callback?stub=1` → 403 `SSO_STUB_NOT_ALLOWED`

### Was SSO in Production erfordern würde (Option A)

Wenn SSO produktionsreif gemacht werden soll, muss der Owner folgendes entscheiden und beauftragen:

1. **Dependency installieren:** `npm install @node-saml/node-saml`
2. **SAML-Metadaten:** IDP Entity ID, SSO URL, IDP-Zertifikat
3. **SP-Konfiguration:** Entity ID (`${BASE_URL}/api/sso/metadata/:orgId`), ACS Endpoint
4. **Zertifikatsvalidierung:** `wantAuthnResponseSigned: true` (bereits konfiguriert)
5. **User Mapping:** `attribute_mapping` in `org_sso_config` (email, firstName, lastName)
6. **Org Mapping:** Domain-basiertes Auto-Routing via `getSSOConfigByDomain()`
7. **Tests:** End-to-End SAML-Flow mit echtem IDP (z.B. Azure AD, Okta, Keycloak)
8. **Audit Events:** `sso.login`, `sso.provisioning_new_user` — bereits implementiert

### Vertriebs-Hinweis

> **SSO ist aktuell NICHT produktionsreif und darf Kunden gegenüber NICHT als live verkauft werden.**
> SSO wird für INDIVIDUELL-Plan-Kunden nach Owner-Freigabe und Implementierung aktiviert.

### Frontend-Darstellung
- SSO-Konfigurationskarte in Admin: zeigt "SSO anfragen" wenn Plan INDIVIDUELL
- Kein Fake-Erfolg: `resolveSsoCardAvailability()` gibt korrekten Status zurück

---

## Plattform-Trennung (Sicherheitsgarantien)

| Session-Typ | Variable | Getrennt von |
|---|---|---|
| Plattform-Nutzer | `req.session.userId` | staffUserId |
| Staff (SCC) | `req.session.staffUserId` | userId |
| MFA-Verifikation | `req.session.mfaVerifiedAt` | Staff-Session |
| Staff Step-Up | `req.session.staffStepUpAt` | MFA-Session |
| OCC-Genehmigung | `req.session.sccAuthorizedAt` | Staff-Step-Up |

**Keine Session-Kompatibilität zwischen den Ebenen** — ein kompromittierter Plattform-Cookie gibt keinen SCC-Zugriff und umgekehrt.

---

## Audit Events (Identity-relevant)

| Aktion | Trigger | Tabel |
|---|---|---|
| `auth.login` | Erfolgreicher Login | `audit_log` |
| `auth.logout` | Logout | `audit_log` |
| `auth.login_failed` | Fehlgeschlagener Login | `audit_log` |
| `mfa.enable` | MFA aktiviert | `audit_log` |
| `mfa.disable` | MFA deaktiviert | `audit_log` |
| `mfa.verify` | MFA-Code bestätigt | `audit_log` |
| `sso.callback_attempt` | SSO Login versucht | `audit_log` |
| `sso.callback_success` | SSO Login erfolgreich | `audit_log` |
| `sso.config_updated` | SSO-Konfiguration geändert | `audit_log` |
| `staff.login` | Staff-Login SCC | `audit_log` |
| `staff.step_up` | Step-Up Re-Auth SCC | `audit_log` |

---

## Offene Punkte (Owner-Entscheidung erforderlich)

| ID | Entscheidung | Priorität |
|---|---|---|
| ID-01 | MFA-Pflicht für owner/admin aktivieren (wann?) | HOCH |
| ID-02 | MFA-Pflicht für Staff SCC (ergänzend zu Step-Up?) | MITTEL |
| ID-03 | SSO produktionieren — Option A vs. dauerhaft B | HOCH |
| ID-04 | Enrollmentfrist für MFA-Pflicht (z.B. 30 Tage) | MITTEL |
| ID-05 | Recovery Code Regeneration UI | NIEDRIG |

---

*Letzte Aktualisierung: WAVE 09 — Phase 2 — 2026-05-26*
*Zuständig: Security (Claude), Freigabe: Owner*
