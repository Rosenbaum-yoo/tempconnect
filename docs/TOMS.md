# Technische und Organisatorische Maßnahmen (TOMs)
**TempConnect – Stand: Mai 2026**
**Verantwortliche Stelle:** BBQ – Baumann Bildung und Qualifizierung GmbH

---

> Diese Datei dokumentiert die technischen und organisatorischen Maßnahmen gemäß
> Art. 32 DSGVO sowie § 64 BDSG. Sie ist Bestandteil des Auftragsverarbeitungsvertrags (AVV)
> und wird bei wesentlichen Änderungen aktualisiert.

---

## 1. Zutrittskontrolle

| Maßnahme | Umsetzung |
|---|---|
| Serverraum-Zugang | Hetzner-Rechenzentrum (ISO 27001), physischer Zugang nur für autorisiertes RZ-Personal |
| Bürozugang | Schlüssel- und Code-gesicherter Bürozugang, Besucherprotokoll |
| Videoüberwachung | Im RZ durch Hetzner; im Büro gemäß Betriebsvereinbarung |

---

## 2. Zugangskontrolle

| Maßnahme | Umsetzung |
|---|---|
| Passwort-Policy | Mindest-Komplexität, kein Default-Passwort; bcrypt-Hashing (Work Factor ≥ 10) |
| Mehrfaktor-Authentifizierung | TOTP (RFC 6238) für Admin-/Staff-Zugänge; geplant für alle Enterprise-User |
| Session-Management | HttpOnly + Secure Cookies, Session-Timeout (Idle: 30 min, absolut: 8 h für Staff) |
| Staff Control Center | Separates Authentifizierungssystem (`STAFF_SESSION_SECRET`), Step-Up-Auth für kritische Aktionen |
| Automatische Sperrung | Failed-Login-Lockout nach 10 Versuchen (Redis-gesteuert) |

---

## 3. Zugriffskontrolle (Authentizität)

| Maßnahme | Umsetzung |
|---|---|
| Rollenbasiertes Zugriffsmodell (RBAC) | Rollen: `worker`, `company`, `agency`, `admin`, `staff` – jede Route durch `requirePermission()` abgesichert |
| Org-Boundary-Enforcement | Jede Datenbankabfrage ist an `org_id` gebunden; Cross-Tenant-Zugriff gibt 403 zurück |
| API-Key-System | Hash-gespeichert, rate-limited, Scope-gebunden (`api_key_scopes`-Tabelle) |
| Audit-Trail | Alle mutativen Aktionen (Risk: high) werden in `audit_log` mit Actor-ID, Zeitstempel und Reason gespeichert |
| Row-Level Security | PostgreSQL RLS aktiviert (Migration 116); deny-by-default für sensible Tabellen |

---

## 4. Trennungskontrolle

| Maßnahme | Umsetzung |
|---|---|
| Mandantentrennung | Alle Nutzdaten mit `org_id` versehen; physisch in gemeinsamer DB mit logischer Trennung |
| Produktionsdaten ≠ Entwicklungsdaten | Keine Produktionsdaten in Entwicklungs- oder Stagingumgebungen; Seed-Skripte nur mit anonymisierten Demo-Daten |
| Staff-/Admin-/Owner-Isolation | Separate Authentifizierungssysteme und Session-Scopes für SCC, Admin Panel, OCC |

---

## 5. Weitergabe- und Transportkontrolle

| Maßnahme | Umsetzung |
|---|---|
| Transportverschlüsselung | TLS 1.2+ (Let's Encrypt) für alle HTTP-Verbindungen; keine unverschlüsselten Endpunkte in Produktion |
| Interne API-Kommunikation | Über Docker-internes Netzwerk; kein öffentlicher Port für Datenbankcontainer |
| E-Mail-Versand | Via konfiguriertem SMTP-Provider; keine personenbezogenen Daten im Betreff |
| Dateiexport | Audit-Log-Eintrag bei jedem Export; Access-Token mit Ablaufzeit |

---

## 6. Eingabekontrolle

| Maßnahme | Umsetzung |
|---|---|
| Input-Validierung | Zod-Validierung an allen API-Eingangsgrenzen |
| XSS-Schutz | `esc()`-Utility für alle user-supplied Werte in innerHTML; CSP-Header |
| SQL-Injection-Schutz | Ausschließlich parametrisierte Queries via node-postgres |
| CSRF-Schutz | CSRF-Token-Middleware (Double-Submit-Cookie-Pattern) für alle mutativen State-Änderungen |

---

## 7. Verfügbarkeitskontrolle

| Maßnahme | Umsetzung |
|---|---|
| Hosting | Hetzner Cloud (Deutschland), Tier 3-gleichwertig |
| Container-Orchestrierung | Docker Compose (Prod), Neustart-Policy: `unless-stopped` |
| Datenbank-Backups | Automatisiertes Backup-Skript (`scripts/backup.sh`); Retention: 7 Tage täglich, 4 Wochen wöchentlich |
| Monitoring | Sentry (Error-Tracking), strukturiertes Logging via pino |
| Rate-Limiting | Redis-gestützte Rate-Limiter (auth, api, analytics, staff-spezifisch) gegen DoS |

---

## 8. Löschkonzept

| Maßnahme | Umsetzung |
|---|---|
| Datenlöschung auf Anfrage | Kunden-Self-Service oder Staff-gesteuerte Account-Deaktivierung; vollständige Löschroutine via `DELETE CASCADE` |
| Audit-Log-Retention | Unveränderliche Audit-Einträge; Löschung nur nach definierten Aufbewahrungsfristen (7 Jahre für handelsrechtlich relevante Daten) |
| Anonymisierung | Personenbezogene Felder werden nach Ablauf der Aufbewahrungsfrist überschrieben (nicht gelöscht) wo CASCADE nicht ausreicht |

---

## 9. Organisatorische Maßnahmen

| Maßnahme | Umsetzung |
|---|---|
| Vertraulichkeitsverpflichtung | Alle Mitarbeiter und Auftragnehmer mit Datenzugang sind schriftlich auf Vertraulichkeit verpflichtet |
| Datenschutzbeauftragter | [Gemäß Art. 37 DSGVO zu prüfen / ggf. benannt] |
| Incident-Response-Plan | Dokumentiert in `docs/BACKUP_DISASTER_RECOVERY.md`; Meldepflicht-Frist: 72 h |
| Unterauftragsverarbeitung | Liste aller Subprozessoren in `docs/SUBPROCESSORS.md`; AVV mit allen SUV |
| Mitarbeiterschulung | Jährliche Datenschutz-Sensibilisierung |

---

## 10. Änderungshistorie

| Datum | Version | Änderung | Autor |
|---|---|---|---|
| 2026-05-27 | 1.0 | Initiale Erstellung | TempConnect Engineering |

---

*Diese TOMs gelten bis auf Widerruf und werden bei wesentlichen technischen oder
organisatorischen Änderungen aktualisiert. Die jeweils aktuelle Version wird
Auftragsverarbeitern auf Anfrage bereitgestellt.*
