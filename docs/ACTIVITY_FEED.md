# Admin Activity Feed

## Purpose

The Admin Activity Feed provides a governance-grade, real-time timeline of organizational activity. It makes the existing `audit_log` data visible to administrators, enabling compliance monitoring, transparency, and internal control — without building a parallel logging system.

## Architecture

```
audit_log table (existing)
       ↓
activityFeedService.js — formatFeedItem() + queryActivityFeed()
       ↓
GET /api/admin/activity-feed (admin.js)
       ↓
┌─────────────────────────────────────────┐
│  Frontend consumers:                     │
│  • admin_panel.html — "Aktivitäten" tab  │
│  • enterprise.html — Activity timeline   │
│    (tries admin feed, falls back to      │
│     platform_events for non-admins)      │
└─────────────────────────────────────────┘
```

**Key principle:** No new logging system. The activity feed is a **presentation layer** on top of `audit_log`, using `queryOrgAuditLog` from `auditLog.js`.

## Data Flow

1. Business actions write to `audit_log` via `writeAudit()` / `writeAuditEnhanced()` / `auditWriteMiddleware`
2. `activityFeedService.queryActivityFeed()` reads `audit_log` (via `queryOrgAuditLog`)
3. `formatFeedItem()` transforms raw rows into feed items with labels, icons, severity
4. The API endpoint returns clean, structured timeline data

## API

### GET /api/admin/activity-feed

Returns a paginated, org-scoped activity timeline.

**Auth:** `requireAuth` + `requireAdmin` (owner, admin, platform_admin)

**Query parameters:**
- `action_type` — Filter by type: CREATE, UPDATE, DELETE, APPROVAL, SUBMISSION, STATUS_CHANGE, LOGIN, ROLE_CHANGE, SECURITY, CONFIG_CHANGE
- `from` — ISO date (inclusive)
- `to` — ISO date (inclusive)
- `limit` — Max items (default: 50, max: 200)
- `offset` — Pagination offset

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "timestamp": "2026-03-16T09:32:00Z",
        "action": "deal.finalize",
        "action_label": "Deal abgeschlossen",
        "action_type": "STATUS_CHANGE",
        "icon": "🎯",
        "severity": "info",
        "status": "SUCCESS",
        "user": "Max Mustermann",
        "user_email": "max@acme.de",
        "resource": "Deal #3482",
        "entity_type": "deal",
        "entity_id": "3482",
        "ip_address": "10.0.0.1"
      }
    ],
    "total": 142,
    "limit": 50,
    "offset": 0
  }
}
```

### GET /api/admin/activity-feed/action-types

Returns the list of supported `action_type` values for filter dropdowns.

## Multi-Tenancy

- When `req.orgId` is set, the feed is automatically scoped to the user's organization
- Platform admins without org context see platform-wide feed
- Uses the existing `audit_log_org_created_desc_idx` composite index for efficient org-scoped queries

## RBAC

- Protected by `requireAdmin` middleware
- Accessible to: `owner`, `admin`, `platform_admin` roles
- Non-admin users on `enterprise.html` automatically fall back to the `platform_events`-based feed (`/api/activity-feed`)

## Action Label Catalog

~55 German-language labels covering all major audit actions:

**Categories:** auth, admin, user, org, requisition, offer, deal, contract, assignment, timesheet, invoice, capacity, compliance, vendor_pool, integration, settings, worker

Unknown actions get a generated fallback label (e.g. `"custom.new_action"` → `"Custom New Action"`).

## Severity Levels

| Severity | Color | Meaning |
|----------|-------|---------|
| success | green | Approvals, verifications |
| info | blue | Creates, updates, status changes |
| warning | amber | Security events, role/config changes, failures |
| danger | red | Deletions, denied access |
| muted | gray | Logins, routine events |

## Performance

- Index: `audit_log_org_created_desc_idx ON audit_log(org_id, created_at DESC)` (migration 046)
- Default limit: 50, max: 200
- COUNT query runs in parallel with data query (via `queryAuditLog`)

## Frontend Integration

### Admin Panel (`admin_panel.html`)
- New "Aktivitäten" tab in the admin panel tab bar
- Filter bar: action type dropdown, date range, filter button
- Timeline: icon + label + user + resource + timestamp per entry
- Pagination buttons for multi-page results

### Enterprise Hub (`enterprise.html`)
- Existing Activity Feed section enhanced to try admin feed first
- Falls back to platform_events feed for non-admin users
- Richer display: user name, resource description alongside label

## Extension Guide

### Adding new action labels
Edit `ACTION_LABELS` in `services/activityFeedService.js`:
```javascript
"mymodule.action_name": "Menschenlesbarer Label"
```

### Adding new icon categories
Edit `CATEGORY_ICONS` in `services/activityFeedService.js`:
```javascript
mymodule: "🔮"
```

### Changing severity for an action type
Edit `ACTION_TYPE_SEVERITY` in `services/activityFeedService.js`.

## Datengrundlage

Der Activity Feed zeigt **keine eigenen Daten** an. Er ist eine reine Präsentationsschicht auf der `audit_log`-Tabelle:

- **Quelle:** `audit_log` (seit Migration 046 mit `action_type` + `status`)
- **Abfrage:** `queryOrgAuditLog()` aus `auditLog.js` (Org-Boundary, Pagination, Filter)
- **Transformation:** `formatFeedItem()` in `activityFeedService.js` (Labels, Icons, Severity)
- **Retention:** Identisch mit Audit-Log Retention (kein separater Lebenszyklus)

Neue Geschäftsaktionen werden automatisch im Feed sichtbar, sobald sie via `writeAudit()` oder `auditWrite`-Middleware geloggt werden. Keine zusätzliche Registrierung im Feed-Service nötig.

## Verwandte Dokumentation

- `docs/audit-trail.md` — Audit Trail System (Datenquelle des Feeds)
- `docs/INTEGRATIONS.md` — Webhook-basierte Echtzeit-Benachrichtigungen
- `docs/TRUST_CENTER.md` — Compliance-Seite referenziert Audit-Fähigkeiten

## Dateien

- `api/services/activityFeedService.js` — Feed-Formatierung, ~55 Labels, Icons, Severity
- `api/services/auditLog.js` — `queryOrgAuditLog()`, `queryAuditLog()` (Datenquelle)
- `api/routes/admin.js` — `GET /admin/activity-feed` + `GET /admin/activity-feed/action-types`
- `frontend/public/admin_panel.html` — Aktivitäten-Tab mit Filter + Timeline
- `frontend/public/js/pages/enterpriseHub.js` — Enhanced `loadActivityFeed()`
- `api/test/adminActivityFeed.test.js` — Unit Tests
