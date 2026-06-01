# Product Analytics Event Catalog

## Namenskonvention

- snake_case
- produktbezogen statt technisch
- stabile Namen (keine spontanen Renames)

## Pflichtfelder

- `event_name`
- `occurred_at`
- `session_id`
- `lifecycle_segment` (`demo|pilot|live`)

## Optionale Felder

- `journey_id`
- `flow_key`
- `step_name`
- `page_path`
- `route_name`
- `component_name`
- `organization_id`, `user_id`, `actor_role`
- `metadata` (whitelist-sanitized)

## Eventgruppen

### Session

- `session_started`
- `session_resumed`
- `session_ended`

### Page/Behavior

- `page_view`
- `page_hidden`
- `page_focus`
- `page_exit`
- `page_time_spent`
- `rage_click_detected`

### Forms

- `form_started`
- `form_submitted`
- `form_completed`
- `form_abandoned`

### Journey/Funnel

- `journey_started`
- `journey_step_viewed`
- `journey_step_completed`
- `journey_abandoned`

### Domain Events (Auszug)

- `signup_started`, `signup_completed`, `login_success`
- `enterprise_config_started`
- `requisition_created`, `request_created`, `request_sent`
- `deal_started`, `deal_completed`
- `contract_started`, `contract_interest_submitted`
- `worker_invite_sent`, `worker_registered`
- `timesheet_started`, `timesheet_submitted`, `timesheet_approved`

## Metadata Regeln

Erlaubte Beispielkeys:

- `duration_ms`, `visible_ms`, `hidden_ms`
- `form`, `field`, `fields_count`
- `clicks`, `x`, `y`, `scroll_depth`
- `reason`, `result`, `cta`, `label`
- `entry_path`, `exit_path`, `consent`

Nicht erlaubt:

- Passwörter, Tokens, Secrets
- E-Mails, Telefonnummern, Adressdaten
- Freitextnotizen, Dokumentinhalte, sensible Inhalte

## Anti-Patterns

- Inline-Tracking ohne zentralen Wrapper
- technische Fehler als Product-Event-Noise
- unbegrenzte, unstrukturierte Metadata-Dumps
- Segmentzuordnung im Frontend als einzige Quelle
