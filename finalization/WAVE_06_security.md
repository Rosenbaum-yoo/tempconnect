# WAVE_06 — Enterprise Security

> **Phase:** Enterprise. **Prio:** P0/P1. **Voraussetzung:** WAVE_03 (Rollen) abgeschlossen.
> **Ausführungsagent:** Backend — Owner-Freigabe erforderlich

---

## Ziel

TempConnect übersteht eine Enterprise-Security-Due-Diligence. Keine sensible Route vertraut nur auf UI.

---

## 1. Auth und Sessions

- Session-Sicherheit prüfen (HTTP-only, Secure, SameSite, Expiry)
- MFA / Step-up für: Staff, Owner, Billing, Security, Contract, kritische Aktionen
- Sichere Invite-/Reset-Flows (Rate Limits, Token-Expiry, kein Token in URL persistent)
- Keine Rolleneskalation über manipulierte Requests (Server prüft Rolle, nicht UI)

## 2. Tenant Isolation

Jede sensible Query MUSS Org-/Tenant-Kontext erzwingen:
- Requisitions
- Vendor Pool
- Workers
- Assignments
- Timesheets
- Contracts
- Billing
- Documents
- Audit
- Dashboard
- Referral / Credits

**DB-Backstop empfohlen:** PostgreSQL RLS (Row-Level Security) als zweite Schicht zusätzlich zu App-Guards.

**Fehlender Tenant-Kontext darf NICHT permissiv sein** (= volle Sicht), sondern restriktiv (= nichts sichtbar, `TENANT_SCOPE_REQUIRED`).

## 3. API Keys

- Scopes default-deny (keine Legacy-Vollzugriffe)
- Pro Key: Ablaufdatum, letzte Nutzung, Besitzer, Org-Bindung, Scope-Liste
- Audit pro API-Key-Aktion
- Rotation-Mechanismus

## 4. SSO / SAML

**Entscheidung verbindlich:**
- Entweder produktiv implementiert (alle Edge Cases: Initial Setup, Enforce, Break-Glass, Recovery)
- ODER ehrlich deaktiviert / Coming Soon (NICHT als Stub mit "wird gerade gebaut"-Behauptung)

**Keine buchbare SSO-Funktion, wenn Runtime nur Stub ist.**

**SSO-Enforce darf KEINEN Self-Lockout erzeugen** (Break-Glass-Mechanismus dokumentiert).

## 5. Uploads und Dokumente

- Dateitypen begrenzen (Whitelist)
- Größenlimits
- Zugriffsschutz (Server prüft Org-Zugehörigkeit)
- Kein Public Access auf private Dokumente
- Virenscan-Hook ODER dokumentierter Platzhalter

## 6. Owner-/Operations-Bereich

- Strikt von normalen Rollen trennen (Surface!)
- Kein Raw Shell Access
- IP-Allowlist
- Confirm- / Reason-Pflicht für kritische Aktionen
- Vollständiges Audit
- Staging / Production klar getrennt
- Notfall-Deaktivierung möglich

## 7. CSRF, Rate Limits, Dependency Audit

- CSRF-Middleware vereinheitlicht für ALLE Mutationen
- Rate Limits auf: Login, Invite, SSO, Finance Export, Admin-Flows, Worker-Submit
- Dependency Audit (`npm audit`, Snyk, etc.) im CI-Job
- CORS sauber konfiguriert (kein `*` für sensitive Routen)

---

## Akzeptanzkriterien

- [ ] Security-/Permission-Tests laufen
- [ ] Keine sensible Route verlässt sich nur auf UI
- [ ] SSO ist ehrlich klassifiziert (produktiv ODER Coming Soon)
- [ ] API Keys sind scope-sicher
- [ ] Owner-Bereich ist nicht durch normale App-Rollen erreichbar
- [ ] CSRF schützt alle Mutationen
- [ ] PostgreSQL RLS als Backstop für Multi-Tenant existiert ODER dokumentierte Begründung
- [ ] SSO-Enforce-Break-Glass dokumentiert
- [ ] Cross-Tenant-Negativtests bestehen

---

## Stop-Regeln

- SSO-Enforce ohne Break-Glass → STOP, sofort fixen
- Tenant-Scope permissiv → STOP, P0-Sicherheitslücke
- Public Access auf private Dokumente → STOP, P0
- Inline-Rollencheck statt zentralem Guard → ersetzen vor anderen Änderungen

---

## Betroffene Dateien

- `api/middleware/auth.js`, `rbac.js`, `orgBoundary.js`, `orgContext.js`, `entitlementGuard.js`, `featureGate.js`
- `api/middleware/idempotency.js`, `rateLimit.js`
- `api/middleware/staffControlAccess.js`, `ownerControlAccess.js`, `supportAccess.js`, `auditWrite.js`
- `api/routes/auth.js`, `api/services/authService.js`, `ssoService.js`
- `frontend/public/sso_config.html`
