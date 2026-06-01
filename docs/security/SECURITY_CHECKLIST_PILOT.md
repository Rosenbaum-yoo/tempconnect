# TempConnect — Security-Checkliste: Pilot Go-Live

> Verbindliche Abnahme-Checkliste vor dem ersten echten Kundenzugang (Pilot).
> Alle Punkte müssen mit ✅ bestätigt sein. Offene Punkte = kein Go-Live.
>
> WAVE 11 — Phase 2 — 2026-05-26

---

## Verwendung

Diese Checkliste ist **vor jedem Pilot-Go-Live** durch den Owner oder einen designierten
Security-Verantwortlichen Punkt für Punkt abzuarbeiten.

- ✅ = Geprüft und bestätigt
- ❌ = Offen / Fehlgeschlagen → **Blocker**
- ⚠️ = Abweichung akzeptiert, Risiko dokumentiert

---

## 1. Transport & TLS

- [ ] HTTPS ist die einzige zugelassene Verbindungsart (HTTP wird auf HTTPS umgeleitet)
- [ ] TLS 1.2 minimum, TLS 1.3 bevorzugt (nginx-Konfig geprüft)
- [ ] Let's Encrypt-Zertifikat gültig (Ablaufdatum > 30 Tage)
- [ ] Auto-Renewal aktiv (certbot/nginx-proxy)
- [ ] HSTS-Header aktiv: `max-age=15552000; includeSubDomains`

---

## 2. HTTP Security Headers

Prüfbefehl:
```bash
curl -sI https://<domain>/api/health | grep -iE "strict-transport|x-frame|x-content|referrer|content-security|permissions"
```

- [ ] `Strict-Transport-Security` vorhanden
- [ ] `X-Frame-Options: DENY` oder CSP `frame-ancestors 'none'` / `'self'`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Content-Security-Policy` aktiv (kein `unsafe-eval`, kein Wildcard)
- [ ] `Permissions-Policy` aktiv (camera, microphone, geolocation, payment deaktiviert)

---

## 3. CORS

- [ ] `CORS_ORIGIN` ENV ist gesetzt auf die tatsächliche Production-Domain
- [ ] Kein `*` in den CORS-Allowed-Origins in Production
- [ ] `credentials: true` — Cookies werden korrekt übertragen
- [ ] CORS-Fehler bei unbekannten Origins im Browser-Netzwerk-Tab verifiziert

---

## 4. Rate Limiting

- [ ] Auth-Endpunkte: max. 5 Versuche / 15 Minuten aktiv (Login, Passwort-Reset, SSO)
- [ ] API-Limiter: 600 Requests / 5 Minuten aktiv
- [ ] Brute-Force-Test: > 5 falsche Logins → 429 Too Many Requests erhalten
- [ ] Rate-Limit-Store: Memory (single instance) oder Redis (multi-instance, bevorzugt)

---

## 5. CSRF

- [ ] `GET /api/csrf-token` liefert gültigen Token
- [ ] Mutierende Requests ohne `X-CSRF-Token` → 403
- [ ] SPA ruft CSRF-Token bei Initialisierung ab und sendet ihn bei POST/PUT/DELETE/PATCH

---

## 6. Authentifizierung & Sessions

- [ ] Session-Cookie ist `HttpOnly` (nicht via JS zugänglich)
- [ ] Session-Cookie ist `Secure` (nur über HTTPS)
- [ ] Session-Cookie ist `SameSite=Strict`
- [ ] Session-Store: PostgreSQL (pg-session) aktiv — nicht Memory in Production
- [ ] Session wird nach Login regeneriert (Session-Fixation-Schutz)
- [ ] Passwort-Hashing: bcrypt mit mindestens 10 Runden (aktuell: 12)
- [ ] Passwort-Reset-Link: zeitlich begrenzt, einmal verwendbar

---

## 7. RBAC & Org-Isolation

- [ ] Fremde Org-ID in URL → 403 (kein Datenleck)
- [ ] Jede sensitive Route hat `requirePermission(...)` Middleware
- [ ] Keine Inline-Rollenchecks in Services (nur `hasPermission()`)
- [ ] `assertOrgOwnership()` ist auf allen ressourcenzugreifenden Routen aktiv
- [ ] Test: anderer Org-User kann eigene Ressourcen nicht via direkter URL lesen

---

## 8. PostgreSQL Row-Level Security (RLS)

- [ ] Migration 116 erfolgreich angewendet (10 RLS-Tabellen aktiv)
- [ ] `SET LOCAL app.rls_bypass` wird nur in `withStaffContext()` gesetzt
- [ ] `app.current_org_id` wird in jeder Transaktion korrekt gesetzt
- [ ] Test: direkte DB-Query ohne `SET LOCAL` → 0 Rows (deny-by-default)

---

## 9. Secrets & Konfiguration

- [ ] `.env` ist in `.gitignore` und nicht im Repository
- [ ] Keine Secrets im Code (Grep auf `password =`, `secret =`, `apikey =`)
- [ ] `SESSION_SECRET` ist ≥ 64 Zeichen in Production
- [ ] `DB_PASSWORD` ist sicheres Passwort (nicht `postgres`, nicht `password`)
- [ ] `FEATURE_GATE_BYPASS` ist in Production nicht gesetzt (oder wirft Error)
- [ ] Alle Pflicht-ENVs sind gesetzt (envValidator.js bestanden)
- [ ] Production-Start schlägt fehl bei schwachen/Dummy-Secrets

---

## 10. API Keys

- [ ] Nur Hash wird in DB gespeichert (SHA-256)
- [ ] Raw-Key wird nur einmal bei Erstellung angezeigt und dann verworfen
- [ ] API-Key-Prefix korrekt: `tc_live_` (Production) / `tc_test_` (Dev)
- [ ] Revocation funktioniert sofort (DB-Flag-Check)
- [ ] Audit-Event bei jeder API-Key-Verwendung

---

## 11. Audit Logging

- [ ] Login-Versuch (Erfolg + Fehlschlag) wird geloggt
- [ ] Logout wird geloggt
- [ ] Org-Mutations (Settings, Mitglieder, Billing) werden geloggt
- [ ] Requisition-Änderungen (Erstellen, Genehmigen, Abbrechen) werden geloggt
- [ ] Contract-Aktionen (Erstellen, Beenden) werden geloggt
- [ ] Audit-Log-Einträge enthalten: `actor_user_id`, `action`, `entity_type`, `entity_id`, `details`

---

## 12. SSO (Soft-Lock-Verifikation)

- [ ] `SSO_MODE=stub` ist in Production konfiguriert
- [ ] `GET /api/sso/callback?stub=1` → 403 `SSO_STUB_NOT_ALLOWED`
- [ ] `POST /api/sso/callback?stub=1` → 403 `SSO_STUB_NOT_ALLOWED`
- [ ] `initiateSSOLogin()` gibt `SSO_NOT_AVAILABLE` zurück (kein Redirect zu Stub-URL)
- [ ] SSO wird Kunden gegenüber NICHT als live verkauft

---

## 13. MFA (aktueller Stand: Opt-in)

- [ ] MFA ist funktional (Setup, Enable, Verify, Disable)
- [ ] Recovery-Codes werden bei MFA-Aktivierung generiert
- [ ] `requireMfa`-Middleware ist implementiert und getestet
- [ ] **Offene Entscheidung ID-01:** MFA-Pflicht für owner/admin → ausstehend

---

## 14. Dependency-Scan

```bash
cd api && npm audit --omit=dev
```

- [ ] 0 high / critical Vulnerabilities
- [ ] Letzter Scan: < 7 Tage vor Go-Live

---

## 15. Pilot-spezifische Checks

- [ ] Pilot-Org ist in DB angelegt (echter Org-Record, kein Fake)
- [ ] Pilot-User hat korrekte Rolle (owner oder admin der Pilot-Org)
- [ ] Pilot-Zugangsdaten wurden sicher übermittelt (nicht per E-Mail im Klartext)
- [ ] Pilot-Account hat kein Debug-Feature-Flag aktiv
- [ ] Support-Kontakt für Pilot definiert und erreichbar

---

## Go/No-Go Entscheidung

| Kategorie | Status | Blocker |
|---|---|---|
| Transport & TLS | | |
| Security Headers | | |
| CORS | | |
| Rate Limiting | | |
| CSRF | | |
| Auth & Sessions | | |
| RBAC & Org-Isolation | | |
| RLS | | |
| Secrets | | |
| API Keys | | |
| Audit Logging | | |
| SSO Soft-Lock | | |
| Dependency-Scan | | |

**Freigabe:**

- Datum: ___________
- Geprüft von: ___________
- Owner-Freigabe: ___________

---

*Letzte Aktualisierung: WAVE 11 — Phase 2 — 2026-05-26*
*Zuständig: Security (Claude), Freigabe: Owner*
