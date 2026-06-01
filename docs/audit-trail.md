# Audit Trail System

## Zweck

Das Audit Trail System protokolliert alle geschaeftskritischen Aktionen auf der TempConnect-Plattform.
Es beantwortet die Fragen: **Wer** hat **was**, **wann**, **wo** und **warum** geaendert.

### Anwendungsfaelle

- **Compliance**: Nachvollziehbarkeit fuer regulatorische Anforderungen
- **Interne Nachvollziehbarkeit**: Support, Streitfaelle, Abrechnungsdifferenzen
- **Kundenvertrauen**: Transparenz ueber Aenderungen an Profilen, Deals, Timesheets
- **Security Monitoring**: Login-Versuche, fehlgeschlagene Zugriffe, Passwort-Aenderungen
- **Enterprise Sales**: Audit-Faehigkeit als Feature fuer grosse Kunden

## Architektur

### Tabelle: `audit_log`

Append-only Tabelle. Keine UPDATEs oder DELETEs erlaubt.

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | BIGSERIAL | Primary Key |
| created_at | TIMESTAMPTZ | Zeitstempel |
| actor_id | UUID | Wer (User-ID) |
| org_id | UUID | Welche Organisation |
| action | TEXT | Aktion (z.B. `timesheet.approve`) |
| action_type | TEXT | Kategorie (CREATE, UPDATE, DELETE, ...) |
| entity_type | TEXT | Ressource (user, timesheet, deal, ...) |
| entity_id | TEXT | Ressource-ID |
| status | TEXT | Ergebnis (SUCCESS, DENIED, FAILED) |
| details | JSONB | Kontext-Metadaten |
| old_values | JSONB | Vorherige Werte (bei Updates) |
| new_values | JSONB | Neue Werte (bei Updates) |
| ip_address | TEXT | IP-Adresse |
| user_agent | TEXT | Browser/Client |

### Action Types

| Typ | Beispiele |
|-----|----------|
| CREATE | Benutzer erstellt, Timesheet angelegt, Org erstellt |
| UPDATE | Profil geaendert, Timesheet bearbeitet |
| DELETE | Member entfernt, Einsatz geloescht |
| STATUS_CHANGE | Deal akzeptiert, Timesheet storniert |
| LOGIN | Login erfolgreich, Login fehlgeschlagen, Logout |
| SECURITY | Passwort zurueckgesetzt, E-Mail verifiziert |
| APPROVAL | Timesheet genehmigt, Timesheet abgelehnt |
| SUBMISSION | Timesheet eingereicht |
| ROLE_CHANGE | Rolle geaendert |
| PERMISSION_CHANGE | Berechtigung geaendert |
| CONFIG_CHANGE | Org-Einstellungen geaendert |

### Status

| Status | Bedeutung |
|--------|----------|
| SUCCESS | Aktion erfolgreich ausgefuehrt |
| DENIED | Aktion abgelehnt (fehlende Berechtigung, falsche Credentials) |
| FAILED | Aktion fehlgeschlagen (Server-Fehler) |

## Geloggte Aktionen

### Organisation
- `org.create` — Organisation erstellt
- `org.update` — Firmenprofil geaendert
- `org.location.create` — Standort hinzugefuegt
- `org.department.create` — Abteilung erstellt
- `org.member.add` — Mitglied hinzugefuegt

### Benutzer / Membership
- `auth.register` — Benutzer registriert
- `auth.worker_invite_accepted` — Worker-Einladung angenommen
- `admin.user.update` — Admin aendert User-Daten
- `admin.user.deactivate` — Admin deaktiviert User

### Login / Security
- `auth.login` — Login erfolgreich
- `auth.login_failed` — Login fehlgeschlagen (DENIED)
- `auth.logout` — Logout
- `auth.forgot_password` — Passwort-Reset angefordert
- `auth.password_reset` — Passwort erfolgreich zurueckgesetzt
- `auth.resend_verification` — Verifizierungs-Mail erneut gesendet

### Timesheets
- `timesheet.create` — Stundenzettel angelegt
- `timesheet.update` — Stundenzettel bearbeitet
- `timesheet.submit` — Stundenzettel eingereicht
- `timesheet.approve` — Stundenzettel genehmigt
- `timesheet.reject` — Stundenzettel abgelehnt
- `timesheet.cancel` — Stundenzettel storniert
- `timesheet.return_to_draft` — Zurueck zu Entwurf
- `timesheet.add_entry` — Tageseintrag hinzugefuegt
- `timesheet.update_entry` — Tageseintrag bearbeitet
- `timesheet.delete_entry` — Tageseintrag geloescht

### Marketplace / Deals
- `marketplace.capacity_post.create` — Kapazitaet veroeffentlicht
- `marketplace.demand_request.create` — Nachfrage erstellt
- `marketplace.offer.create` — Angebot abgegeben
- `marketplace.offer.accept` — Angebot angenommen
- `marketplace.offer.reject` — Angebot abgelehnt
- `marketplace.deal.complete` — Deal abgeschlossen

### Weitere
- `contract.*` — Vertraege erstellen/aendern/kuendigen
- `settings.*` — Org-Einstellungen
- `payment.*` — Zahlungen
- `listing.*` — Inserate

## API-Endpoints

### Admin Audit Log (Platform-Admin / Owner)

```
GET /api/admin/audit-log
```

**Berechtigung:** `platform_admin`, `owner`, `admin`

**Filter:**
- `org_id` — Organisation
- `actor_id` — Benutzer
- `entity_type` — Ressource-Typ
- `action` — Aktion (ILIKE-Suche)
- `action_type` — Kategorie (CREATE, UPDATE, ...)
- `status` — Ergebnis (SUCCESS, DENIED, FAILED)
- `from` / `to` — Zeitraum
- `limit` / `offset` — Pagination

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 1234,
    "page_size": 100,
    "offset": 0
  }
}
```

### Admin Recent Changes

```
GET /api/admin/audit-log/recent-changes?entity_type=timesheet&entity_id=UUID
```

Liefert die letzten Aenderungen an einer bestimmten Ressource.

### Org Audit Log (Org Owner / Admin)

```
GET /api/organizations/:id/audit-log
```

**Berechtigung:** `owner`, `admin`, `platform_admin` der Organisation

Gleiche Filter wie Admin-Endpoint, aber automatisch auf `org_id` beschraenkt.

### Org Recent Changes

```
GET /api/organizations/:id/audit-log/recent-changes?entity_type=timesheet&entity_id=UUID
```

## Datenschutz / DSGVO

### Prinzipien

1. **Minimale Daten**: Nur die fuer die Nachvollziehbarkeit notwendigen Informationen werden geloggt
2. **Keine sensiblen Inhalte**: Passwoerter, Tokens, Session-IDs, Kreditkartendaten, IBANs werden automatisch durch `[REDACTED]` ersetzt
3. **Keine vollstaendigen Payloads**: Nur geaenderte Felder (Diff), keine kompletten Dokumente
4. **Keine privaten Inhalte**: Keine Nachrichteninhalte, keine Dokumenten-Bodies

### Automatische Filterung

Die Funktion `sanitizeMetadata()` filtert automatisch alle Felder deren Name matcht:
- `password*`, `passwd*`
- `token*`
- `*secret*`
- `*hash*`
- `credit_card*`
- `iban*`
- `ssn*`
- `session*`

### Audit-Logs sind Append-Only

- Keine `UPDATE`- oder `DELETE`-Operationen auf `audit_log`
- Jeder Eintrag ist unveraenderlich (tamper-proof)

## Technische Details

### Non-Blocking

Audit-Logging erfolgt **nach** dem Response (`res.on('finish')`).
Ein Fehler im Audit-System blockiert **niemals** die Business-Logik.

### Automatische Ableitung

- `action_type` wird automatisch aus dem `action`-String abgeleitet (z.B. `timesheet.create` -> `CREATE`)
- `status` wird aus dem HTTP-Statuscode abgeleitet: 2xx=SUCCESS, 4xx=DENIED, 5xx=FAILED
- Beides kann explizit per `res.locals.audit.action_type` / `res.locals.audit.status` ueberschrieben werden

### Performance

- Einfache INSERTs, keine JOINs beim Schreiben
- Indexes auf: `created_at`, `org_id`, `actor_id`, `action_type`, `status`, `(entity_type, entity_id)`
- Composite-Index `(org_id, created_at DESC)` fuer schnelle Org-Audit-Views
- Pagination verpflichtend (max 500 Eintraege pro Request)

## Zukuenftige Erweiterungen (nicht implementiert)

- **Compliance-Export**: CSV/PDF-Export von Audit-Logs fuer externe Auditoren
- **Audit Diff Anzeige**: Frontend-Komponente die Vorher/Nachher visuell darstellt
- **Security Alerts**: Automatische Benachrichtigung bei verdaechtigen Login-Mustern
- **Suspicious Activity Detection**: ML-basierte Anomalie-Erkennung auf Audit-Streams
- **Retention Policy**: Automatisches Archivieren/Loeschen nach konfigurierbarer Aufbewahrungsfrist
- **Webhook Integration**: Audit-Events an externe SIEM-Systeme weiterleiten
