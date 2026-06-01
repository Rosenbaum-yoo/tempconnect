# Activity Center – Architektur & Referenz
<!-- public.html -->
## Überblick

Das **Activity Center** (`/public/activity.html`) ist die zentrale Anlaufstelle für alle Benachrichtigungen, Plattform-Aktivitäten und Match-Alerts. Es ersetzt die bisherige `notifications.html` (die jetzt per Redirect hierher verweist).

**Erreichbar über:**
- Bell-Widget (🔔) → "Alle anzeigen →" Link (auf allen 40+ Seiten)
- Enterprise-Hub Card "Activity Center"
- Direktlink `/public/activity.html`
- Legacy-URL `/public/notifications.html` (301-Redirect via Nginx)

## Tab-Struktur

### Tab 1: Benachrichtigungen
- **Datenquelle:** `GET /api/notifications`
- **Kategorie-Filter:** Alle, Requisitions, Angebote, Compliance, Kapazität, Deals, Timesheets, System
- **Severity-Filter:** Alle Stufen, Ungelesen, Info, Erfolg, Warnung, Fehler
- **Datumsgruppierung:** Heute, Gestern, Diese Woche, Älter
- **Aktionen:** Mark-read on click, Mark-all-read, Deep-Link Navigation
- **Pagination:** Load-more (50 pro Seite)

### Tab 2: Aktivitäten
- **Datenquelle:** `GET /api/activity-feed`
- **Filter:** Event-Typ Dropdown (18 Typen), Zeitraum (7/30/90 Tage)
- **Lazy Loading:** Wird erst beim Tab-Wechsel geladen
- **Darstellung:** Timeline mit Icons, Labels, Actor-Name, relative Zeit

### Tab 3: Match-Alerts
- **Datenquelle:** `GET /api/match-alerts`
- **Filter:** Alle / Ungelesen
- **Aktionen:** Mark-read on click
- **Pagination:** Load-more (50 pro Seite)

### Einstellungen-Panel
- **Datenquelle:** `GET /api/notification-preferences`, `PUT /api/notification-preferences`
- **Kategorien:** Requisitions, Angebote, Compliance, Kapazität, Deals, Timesheets, System
- **Toggles:** In-App + E-Mail pro Kategorie

## API-Referenz

### GET /api/notifications
| Parameter | Typ | Beschreibung |
|-----------|-----|-------------|
| `limit` | int | Max. Ergebnisse (default: 50, max: 100) |
| `offset` | int | Pagination-Offset |
| `unread` | "true" | Nur ungelesene |
| `org_id` | UUID | Org-Scope |
| `type` | string | Komma-separierte Typ-Liste (z.B. `offer_received,deal_confirmed`) |
| `severity` | string | `info`, `success`, `warning`, `error` |

**RBAC:** Immer auf `session.userId` gescopet. Kein Cross-User-Zugriff möglich.

### PATCH /api/notifications/:id/read
Markiert eine einzelne Benachrichtigung als gelesen. Erfordert CSRF-Token.

### POST /api/notifications/read-all
Markiert alle Benachrichtigungen des Users als gelesen. Erfordert CSRF-Token.

### GET /api/notifications/unread-count
Gibt `{ count: number }` zurück.

### GET /api/activity-feed
| Parameter | Typ | Beschreibung |
|-----------|-----|-------------|
| `limit` | int | Max. Ergebnisse (default: 30, max: 100) |
| `from` | ISO date | Startdatum |
| `to` | ISO date | Enddatum |
| `type` | string | Event-Typ Filter |

**RBAC:** Org-scoped via `req.orgId`.

### GET /api/match-alerts
| Parameter | Typ | Beschreibung |
|-----------|-----|-------------|
| `limit` | int | Max. Ergebnisse |
| `offset` | int | Pagination-Offset |
| `unread` | "true" | Nur ungelesene |
| `source_type` | string | Quell-Typ |
| `severity` | string | Severity-Filter |

## Deep-Link Mapping (Notification → Zielseite)

| `entity_type` | Zielseite |
|---------------|-----------|
| `search_job` | `/public/sla_search_job_detail.html?id=…` |
| `capacity_request` | `/public/company_requests.html` |
| `demand_request` | `/public/company_requests.html` |
| `offer` | `/public/agency_inbox.html` |
| `capacity_offer` | `/public/agency_inbox.html` |
| `requisition` | `/public/requisitions.html` |
| `timesheet` | `/public/timesheets.html` |
| `worker_timesheet` | `/public/timesheets.html` |
| `compliance_document` | `/public/compliance_overview.html` |
| `vendor_pool` | `/public/vendor_pool.html` |
| `worker_assignment` | `/public/timesheets.html` |
| `assignment` | `/public/timesheets.html` |
| `deal` | `/public/company_requests.html` |
| `capacity` | `/public/capacity_exchange_manage.html` |
| `demand` | `/public/capacity_exchange_feed.html` |
| `contract` | `/public/timesheets.html` |
| `supplier` | `/public/vendor_pool.html` |

**Priorität:** `link_path` (DB-Feld) > `entity_type`-Mapping > kein Link.

## Notification-Typ → Kategorie Mapping

| Kategorie | Notification Types |
|-----------|-------------------|
| Requisition | `requisition_approval`, `requisition_filled`, `requisition_cancelled` |
| Angebote | `offer_received`, `offer_accepted`, `offer_rejected` |
| Compliance | `compliance_expiring`, `compliance_expired`, `compliance_verified`, `sla_warning`, `sla_breached` |
| Kapazität | `capacity_interest`, `capacity_expiring`, `capacity_match`, `capacity_stale`, `demand_match` |
| Deals | `deal_offer_sent`, `deal_accepted`, `deal_confirmed`, `deal_completed`, `deal_assignment_started` |
| Timesheets | `timesheet_submitted`, `timesheet_approved`, `timesheet_rejected`, `timesheet_signed` |
| System | `general`, `system`, `vendor_pool_change`, `emergency_request`, `emergency_escalation` |

## Notification Matrix (Business Event → Notification)

Die vollständige Notification Matrix ist in `api/services/notificationMatrix.js` definiert. Sie enthält 22 Business-Events mit:
- Typ, Severity, Titel
- Recipient-Strategie (wer wird benachrichtigt)
- Link-Path (Deep-Link zur Zielseite)
- Preference-Check (In-App / E-Mail)
- Dedup-Schutz (1h Zeitfenster)

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `frontend/public/activity.html` | Activity Center Seite (3-Tab-Layout) |
| ~~notifications.html~~ | Entfernt — Redirect via Nginx (301 → activity.html) |
| `frontend/public/js/notifications.js` | Bell-Widget (globaler Topbar-Inject) |
| `api/routes/notifications.js` | Notifications REST-API |
| `api/routes/activityFeed.js` | Activity Feed REST-API |
| `api/services/notificationMatrix.js` | Event → Notification Dispatch |
| `api/services/eventTrackingService.js` | Platform Event Tracking |
| `api/test/notifications-filter.test.js` | Tests für Type/Severity Filter + RBAC |
| `sql/migrations/042_notification_link_path.sql` | link_path Spalte |

## Tests

```bash
node --test --test-force-exit test/notifications-filter.test.js
```

8 Tests: Type-Filter, Severity-Filter, RBAC user_id Scoping, Combined Filters, Response-Format.
