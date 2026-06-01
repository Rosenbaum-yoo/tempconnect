# Match Alerts – Enterprise-Grade System

## Overview
Match Alerts notify users automatically when matching opportunities arise.
The system integrates with the existing notification matrix, matching engine,
and SLA search infrastructure — no parallel systems.

## Trigger Matrix

| Trigger Event | Who Gets Alerted | Alert Type |
|---|---|---|
| Capacity post activated | Matching demand/requisition creators | `demand.match_found` |
| Demand request created | Matching capacity suppliers | `capacity.match_found` |
| Requisition approved (→ OPEN) | Matching capacity suppliers | `capacity.match_found` |
| Saved search batch run | Search job owner | `match_alert` (via `match_alerts` table) |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Route/Event │────▶│ matchAlertService │────▶│ matchingEngine    │
│  (trigger)   │     │ (orchestration)  │     │ (scoring)         │
└──────────────┘     └─────┬──────┬─────┘     └───────────────────┘
                           │      │
                    ┌──────▼──┐  ┌▼────────────────┐
                    │ in-app  │  │ email (BullMQ)   │
                    │ notif.  │  │ professional tpl │
                    └─────────┘  └──────────────────┘
```

### Key Files
- `services/matchAlertService.js` – Central orchestration, dedup, preferences, templates
- `services/notificationMatrix.js` – Preference-aware dispatch (all events)
- `services/matchingEngine.js` – Multi-factor scoring engine
- `routes/notifications.js` – Match alert REST routes (`/api/match-alerts/*`)
- `routes/slaSearchJobs.js` – SLA search alert routes + batch trigger
- `routes/requisitions.js` – Approval → match alert trigger

## Deduplication
Same `(user_id, source_type, source_id)` within **4 hours** → alert skipped.
Prevents spam when entities are modified repeatedly.

The existing `notificationMatrix.dispatch()` has its own 1-hour dedup window
for in-app notifications (SQL `WHERE NOT EXISTS` check).

## User Preferences
Stored in `notification_preferences` table (per user, per category).
Categories: `match_alerts`, `requisition_updates`, `capacity_updates`, `compliance`, `deals`.

**Defaults** (when no preference is set):
- In-app: ✅ enabled
- Email: ❌ disabled

**Priority override**: Urgent/Notdienst cases **always** send email,
regardless of the user's email preference setting.

### REST API
- `GET /api/notification-preferences` – List user's preferences
- `PUT /api/notification-preferences` – Update preferences
  ```json
  { "preferences": [{ "event_category": "match_alerts", "channel_in_app": true, "channel_email": true }] }
  ```

## Priority Escalation

| Urgency | In-App | Email | Severity | Sort Order |
|---|---|---|---|---|
| normal | per pref | per pref | `info` | 1 |
| high | per pref | per pref | `info` | 1 |
| urgent | per pref | **always** | `urgent` | 0 (first) |
| notdienst | per pref | **always** | `urgent` | 0 (first) |

Urgent alerts appear first in the match-alerts list (sorted by severity, then date).

## Match Alert REST API

### General Match Alerts (`/api/match-alerts/*`)
- `GET /api/match-alerts` – List alerts (query: `unread`, `source_type`, `severity`, `limit`, `offset`)
- `GET /api/match-alerts/unread-count` – Unread count
- `PATCH /api/match-alerts/:id/read` – Mark single alert as read
- `POST /api/match-alerts/read-all` – Mark all alerts as read

### SLA Search Alerts (`/api/sla/match-alerts/*`)
- `GET /api/sla/match-alerts` – Unread alerts (SLA search context)
- `GET /api/sla/match-alerts/count` – Unread count
- `POST /api/sla/match-alerts/:id/read` – Mark read
- `POST /api/sla/match-alerts/read-all` – Mark all read

### Batch Trigger (Admin)
- `POST /api/sla/search-jobs/run-batch` – Trigger batch matching for all open search jobs
  - Requires admin role or `X-Admin-Secret` header
  - Body: `{ "batch_size": 50 }`

## Email Templates
Professional HTML emails with:
- TempConnect branding header
- Urgency banner (red, for urgent/notdienst)
- Match score indicator (green ≥70, amber 40-69, gray <40)
- Top 3 match reasons with factor/detail/points
- CTA button to relevant page
- Legal disclaimer (no success guarantee)
- Preference settings link

## Database

### `match_alerts` Table (extended)
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
job_id UUID (nullable, FK → sla_search_jobs)
match_count INT DEFAULT 0
is_read BOOLEAN DEFAULT FALSE
source_type TEXT           -- 'demand_request', 'requisition', 'capacity_post', 'search_job'
source_id UUID             -- ID of the source entity
match_score INT            -- 0-100
match_reasons JSONB        -- top 3 match reasons
severity TEXT DEFAULT 'info'  -- 'info' or 'urgent'
created_at TIMESTAMPTZ
```

### Migration
`sql/migrations/027_match_alerts_extension.sql`

## Testing
`test/matchAlerts.test.js` – 40+ unit tests covering:
- EVENT_CATEGORY_MAP mapping
- getUserPreferences (defaults, urgency override, user settings)
- isDuplicateAlert
- createMatchAlertRecord (create, dedup skip, severity, reason truncation)
- buildAlertMessage (all source types, urgency prefix, missing data)
- buildMatchAlertEmailHtml (branding, urgency banner, score colors, CTA links, reason limits)
- CRUD operations (list, unread count, mark read, mark all read)
- Preference + priority integration scenarios
