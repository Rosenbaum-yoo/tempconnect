# TempConnect — Security-Checkliste: Enterprise Due Diligence

> Erweiterte Checkliste für Enterprise-Kunden, Security-Audits und Due-Diligence-Prozesse.
> Geht über den Pilot-Scope hinaus und adressiert Compliance, Governance und Betriebssicherheit.
>
> WAVE 11 — Phase 2 — 2026-05-26

---

## Zweck

Diese Checkliste ist für Enterprise-Kunden gedacht, die im Rahmen einer Due Diligence oder
eines Security-Audits die Sicherheitsarchitektur von TempConnect bewerten.

Sie ergänzt die `SECURITY_CHECKLIST_PILOT.md` und setzt deren Punkte als erfüllt voraus.

---

## A. Architektur & Defense in Depth

### A1. Verteidigungsschichten

| Schicht | Technologie | Status | Nachweis |
|---|---|---|---|
| Transport Security | nginx / TLS 1.2+ | ✅ Aktiv | nginx.conf |
| Rate Limiting | express-rate-limit | ✅ Aktiv | `api/middleware/rateLimiter.js` |
| CORS Policy | cors (kein Wildcard) | ✅ Aktiv | `api/app.js` |
| CSRF Token | csrf-csrf | ✅ Aktiv | `api/middleware/csrf.js` |
| Session Auth | pg-session / bcrypt | ✅ Aktiv | `api/app.js` |
| RBAC | requirePermission | ✅ Aktiv | `api/middleware/rbac.js` |
| Org-Boundary | assertOrgOwnership | ✅ Aktiv | `api/utils/orgContext.js` |
| RLS (Datenbank) | PostgreSQL RLS | ✅ Aktiv | Migration 116 |
| Audit Log | audit_log Tabelle | ✅ Aktiv | `api/middleware/auditWrite.js` |

- [ ] Alle 9 Schichten sind aktiv und verifiziert
- [ ] Defense-in-Depth-Diagramm ist aktuell (`SECURITY_OVERVIEW.md`)
- [ ] Kein Single Point of Security Failure

### A2. Netzwerk-Isolation

- [ ] Datenbank ist nicht direkt aus dem Internet erreichbar (nur via App-Container)
- [ ] Redis (falls verwendet) ist nicht aus dem Internet erreichbar
- [ ] Admin-/Staff-Endpunkte sind nicht öffentlich erreichbar (RBAC-gesichert)
- [ ] OCC-Endpunkte haben zusätzliche DB-Tabellen-Prüfung (`occ_owner_access`)

---

## B. Datenschutz & DSGVO

### B1. Datenhaltung

- [ ] Personenbezogene Daten werden ausschließlich in Deutschland / EU gespeichert
- [ ] Subprozessoren sind dokumentiert und DSGVO-konform
- [ ] Datenlöschung auf Anfrage implementiert (`DELETE /api/data-governance`)
- [ ] Audit-Log enthält keine unnötigen personenbezogenen Daten

### B2. Datenminimierung

- [ ] Passwörter werden nie im Klartext gespeichert (bcrypt, 12 Runden)
- [ ] MFA-Secrets werden verschlüsselt gespeichert
- [ ] Recovery-Codes werden gehasht gespeichert
- [ ] API-Keys werden nur als SHA-256-Hash gespeichert (Raw-Key nie persistiert)
- [ ] Logs enthalten keine Klartext-Passwörter, Tokens oder Session-IDs

### B3. Auftragsverarbeitung

- [ ] AVV (Auftragsverarbeitungsvertrag) liegt für Enterprise-Kunden vor
- [ ] Technische und organisatorische Maßnahmen (TOMs) sind dokumentiert
- [ ] Datenpannen-Prozess ist definiert (Meldepflicht < 72h)

---

## C. Authentifizierung & Identität

### C1. Session-Sicherheit

- [ ] Session-Cookies: HttpOnly + Secure + SameSite=Strict
- [ ] Session-Store: PostgreSQL (kein Memory-Store in Production)
- [ ] Session-Fixation-Schutz: Session wird nach Login regeneriert
- [ ] Session-TTL konfigurierbar (Standard: 14 Tage Plattform / 4h Staff-SCC)
- [ ] Gleichzeitige Sessions: überprüft (kein paralleler Session-Hijack möglich)

### C2. MFA (Multi-Faktor-Authentifizierung)

- [ ] TOTP (RFC 6238) implementiert — kompatibel mit Google Authenticator / Authy
- [ ] Recovery-Codes verfügbar (10 Backup-Codes bei Aktivierung)
- [ ] `requireMfa`-Middleware verfügbar für kritische Aktionen
- [ ] **Owner-Entscheidung ID-01:** MFA-Pflicht für owner/admin (ausstehend)
- [ ] MFA-Pflicht-Zeitplan für Enterprise-Rollout definiert (Empfehlung: 30 Tage Frist)

### C3. SSO / SAML

- [ ] SSO ist aktuell soft-locked (`SSO_MODE=stub`)
- [ ] Stub ist in Production vollständig blockiert (403 bei Callback-Versuchen)
- [ ] SSO-Produktivierung erfordert Owner-Freigabe + vollständige IDP-Konfiguration
- [ ] SSO-Roadmap ist dokumentiert (`IDENTITY_MODEL.md`)
- [ ] Enterprise-Kunden werden über SSO-Status korrekt informiert (kein Falschangebot)

### C4. Staff- und Owner-Zugang

- [ ] Staff Control Center (SCC) verwendet getrennte Session (`staffUserId`)
- [ ] SCC-Aktionen erfordern Step-Up Re-Auth (15 Minuten Fenster)
- [ ] Owner Control Center (OCC) erfordert zusätzliche DB-Tabellen-Prüfung
- [ ] Plattform-Session und Staff-Session sind nicht kreuzkompatibel

---

## D. Autorisierung & Tenant-Isolation

### D1. RBAC

- [ ] 12 Rollen mit Hierarchie-Vererbung definiert (`rbacService.js`)
- [ ] Jede Route hat `requirePermission(...)` (keine ungeschützten Routen)
- [ ] Keine Inline-Rollenchecks in Services (nur `hasPermission()`)
- [ ] Permission-Matrix ist aktuell und vollständig dokumentiert

### D2. Org-Boundary (Dreifachsicherung)

- [ ] **App Layer:** `assertOrgOwnership()` auf allen ressourcenzugreifenden Routen
- [ ] **Query Layer:** `withOrgContext()` setzt `SET LOCAL app.current_org_id`
- [ ] **DB Layer:** PostgreSQL RLS filtert alle Abfragen org-gebunden
- [ ] Cross-Org-Test bestanden: fremde Org-ID → 403

### D3. RLS-Status

- [ ] Migration 116: 10 Kerntabellen mit RLS geschützt
- [ ] Deny-by-default: ohne `SET LOCAL` → 0 Rows
- [ ] Staff-Bypass (`SET LOCAL app.rls_bypass = 'staff'`) nur über `withStaffContext()`
- [ ] **Roadmap:** Migration 117 — ~60 weitere Tabellen (ausstehend, Priorität MITTEL)

---

## E. API-Sicherheit

### E1. API Keys (Partner)

- [ ] Nur SHA-256-Hash in DB, Raw-Key einmalig angezeigt und verworfen
- [ ] Prefix-Schema: `tc_live_` / `tc_test_`
- [ ] Granulare Scopes (z.B. `read`, `write:timesheets`)
- [ ] Sofortige Revocation über DB-Flag
- [ ] Last-Used-Tracking (async, non-blocking)
- [ ] Audit-Event bei jeder Verwendung

### E2. Rate Limiting (alle Endpunkte)

| Endpunkt | Fenster | Max |
|---|---|---|
| Auth (Login, Reset, SSO) | 15 Min | 5 |
| API allgemein | 5 Min | 600 |
| Analytics-Ingestion | 1 Min | 120 |
| OCC-Endpunkte | 1 Min | 60 |
| Warp Automation | 1 Std | 10 |

- [ ] Alle Limiter sind aktiv
- [ ] Rate-Limit-Store ist für Multi-Instance-Deployment konfiguriert (Redis empfohlen)

### E3. Input-Validierung

- [ ] Alle Eingaben werden mit Zod validiert (Eingangsgrenze)
- [ ] SQL-Injection: Nur parameterisierte Queries (`$1`, `$2`, ...)
- [ ] XSS: `esc()` wird für user-supplied Content in HTML verwendet
- [ ] File-Uploads: Mime-Type-Validierung + Größenlimit

---

## F. Audit & Compliance

### F1. Audit-Log-Vollständigkeit

- [ ] Auth-Events: Login (Erfolg/Fehler), Logout, MFA-Events, SSO-Events
- [ ] Org-Mutations: Settings, Mitglieder, Billing
- [ ] Geschäftsprozesse: Requisition, Assignment, Contract, Timesheet
- [ ] Cross-Org-Staff-Zugriff: `withStaffContext()` erzeugt Audit-Event
- [ ] OCC-Zugriff wird geloggt

### F2. Audit-Log-Integrität

- [ ] Audit-Log ist RLS-geschützt (kein direktes Löschen ohne Staff-Bypass)
- [ ] Audit-Log-Einträge enthalten: `actor_user_id`, `action`, `entity_type`, `entity_id`, `org_id`, `details`, `created_at`
- [ ] Logs können nicht rückwirkend verändert werden (append-only Pattern empfohlen)

### F3. Compliance-Dokumentation

- [ ] `SECURITY_OVERVIEW.md` aktuell und vollständig
- [ ] `TENANT_ISOLATION_MODEL.md` aktuell
- [ ] `IDENTITY_MODEL.md` aktuell
- [ ] `SECRET_ROTATION.md` aktuell mit Rotation-Nachweisen

---

## G. Betriebssicherheit

### G1. Secrets-Management

- [ ] Alle Secrets ausschließlich in Umgebungsvariablen
- [ ] `.env` ist gitignored und nie committet
- [ ] Production-Start schlägt fehl bei Dummy-Werten
- [ ] Secret-Rotation dokumentiert (`SECRET_ROTATION.md`)
- [ ] `FEATURE_GATE_BYPASS=true` in Production wirft Error (blockiert Start)

### G2. Dependency-Security

```bash
cd api && npm audit --omit=dev
```

- [ ] 0 high/critical Vulnerabilities
- [ ] Audit wird vor jedem Release ausgeführt
- [ ] Letzter Scan: < 7 Tage

### G3. Backup & Restore

- [ ] Automatisiertes DB-Backup konfiguriert
- [ ] Restore-Prozess dokumentiert (`BACKUP_DISASTER_RECOVERY.md`)
- [ ] Restore-Drill mindestens einmal durchgeführt (Datum: _________)
- [ ] Backup wird auf getrenntem Storage gespeichert (nicht auf dem App-Server)

### G4. Monitoring & Incident Response

- [ ] Health-Endpunkte aktiv: `/api/health`, `/api/ready`, `/api/live`
- [ ] Strukturierte Logs mit Request-ID / Correlation-ID
- [ ] Keine Secrets in Logs
- [ ] Incident-Runbook definiert (`INCIDENT_RUNBOOK.md`)
- [ ] Eskalationspfad für Sicherheitsvorfälle definiert

---

## H. Bekannte Lücken (transparente Kommunikation)

| ID | Beschreibung | Priorität | Status | Owner-Entscheidung |
|---|---|---|---|---|
| ID-01 | MFA-Pflicht für owner/admin noch nicht erzwungen | HOCH | Offen | Ausstehend |
| ID-03 | SSO nicht produktionsreif (Soft-Lock Option B) | HOCH | Bewusst | Dauerhaft B oder A? |
| W11-01 | RLS auf ~60 weiteren Tabellen ausstehend | MITTEL | Roadmap | Migration 117 |
| W11-02 | Rate-Limit-Store Memory (nur single instance) | MITTEL | Bekannt | Redis für Multi-Instance |

**Hinweis:** Alle bekannten Lücken sind dokumentiert und transparent. Keine versteckten Risiken.

---

## I. Enterprise-Sicherheitsgarantien (SLA)

| Garantie | Level |
|---|---|
| Datenstandort EU | Ja (Hetzner DE) |
| Verschlüsselung in Transit | TLS 1.2+ (Let's Encrypt) |
| Verschlüsselung at Rest | Datenbank-Level (Hosting-abhängig) |
| Mandanten-Isolation | 9-schichtig (App + DB) |
| Session-Isolation Staff/Platform | Vollständig getrennt |
| Audit Trail | Vollständig, org-scoped |
| MFA Verfügbarkeit | Ja (opt-in, Pflicht auf Anfrage) |
| SSO / SAML | Auf Anfrage (Option A nach Owner-Freigabe) |
| API-Keys mit Scopes | Ja |
| Security-Patch-SLA | < 72h kritisch, < 7 Tage hoch |

---

## Go/No-Go Enterprise-Freigabe

| Bereich | Status | Blocker |
|---|---|---|
| A. Architektur & Defense in Depth | | |
| B. Datenschutz & DSGVO | | |
| C. Authentifizierung & Identität | | |
| D. Autorisierung & Tenant-Isolation | | |
| E. API-Sicherheit | | |
| F. Audit & Compliance | | |
| G. Betriebssicherheit | | |
| H. Bekannte Lücken akzeptiert | | |

**Freigabe:**

- Datum: ___________
- Geprüft von (intern): ___________
- Geprüft von (extern, falls vorhanden): ___________
- Owner-Freigabe: ___________
- Gültig bis (nächste Review): ___________

---

*Letzte Aktualisierung: WAVE 11 — Phase 2 — 2026-05-26*
*Zuständig: Security (Claude), Freigabe: Owner*
