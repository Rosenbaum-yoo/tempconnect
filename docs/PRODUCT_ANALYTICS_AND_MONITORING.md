# Product Analytics and Monitoring

## Zielbild

TempConnect nutzt eine zweistufige Architektur:

- **Product Analytics + Session Behavior** (produktbezogene Events, Seitenverhalten, Funnels)
- **Technical Observability** (Sentry, Prometheus, Health, Audit)

Damit lassen sich Demo-, Pilot- und Live-Nutzung sowie technische Probleme gemeinsam auswerten.

## Bestehende Bausteine (weiterverwendet)

- `api/utils/monitoring.js` — Sentry Error Monitoring (Backend)
- `api/utils/metrics.js` — Prometheus Metriken (HTTP, DB, Queue)
- `audit_log` + `activityFeedService` — Governance/Audit-Trails
- `platform_events` + `eventTrackingService` — Business/Operations Events

## Neu: Product Analytics Layer

### Datenmodell

- Tabelle: `product_analytics_events` (Migration `066_product_analytics_foundation.sql`)
- Tabellen: `product_analytics_sessions`, `product_analytics_journeys`, `product_analytics_funnel_definitions`, `product_analytics_funnel_steps` (Migration `068_product_analytics_sessions_and_journeys.sql`)
- Fokus: Produktverhalten, Funnel-Schritte, Dropoff-Indikatoren, Time-on-page

Wichtige Felder:

- `event_name`, `occurred_at`, `session_id`, `page_path`, `flow_key`
- Kontext: `user_id`, `org_id`, `user_role`, `org_role`, `user_plan`
- Segment: `customer_segment` (`demo` | `pilot` | `live`)
- `metadata` (privacy-sanitized)

### Ingest API

- `POST /api/analytics/track-public`
  - akzeptiert clientseitige Product Events
  - Segmentableitung serverseitig
  - Metadata-Sanitizing serverseitig (keine sensiblen Keys)

### Insights API (teamfähig)

- `GET /api/analytics/product/overview`
- `GET /api/analytics/product/pages`
- `GET /api/analytics/product/funnels/:key`
- `GET /api/analytics/product/dropoff`
- `GET /api/analytics/product/session-to-completion`
- `GET /api/analytics/product/role-conversion`

## Segmentierung

Serverseitige Segmentlogik:

- `demo`: Demo-Flag oder Demo/Free-Plan
- `pilot`: explizit via `customer_stage='pilot'` (fallback: Namensheuristik)
- `live`: Standard bzw. `customer_stage='live'`

Explizites Modell:

- Migration `067_customer_stage_segmentation.sql`
- Neue Felder:
  - `users.customer_stage`
  - `organizations.customer_stage`

Weitere Kontextdimensionen:

- Nutzerrolle (`company` / `agency` / `worker` / intern)
- Org-Rolle (`owner`, `admin`, ...)
- Plan / Tarif
- Feature-Kontext (`feature_context`)

## Kern-Events (Phase 1)

Unterstützte Kern-Events (Auszug):

- `signup_started`, `signup_completed`, `login_success`
- `demo_mode_used`, `enterprise_config_started`
- `capacity_feed_viewed`, `capacity_detail_viewed`
- `matching_results_viewed`, `interest_submitted`
- `deal_started`, `deal_completed`
- `worker_invite_sent`, `worker_registered`
- `timesheet_started`, `timesheet_submitted`, `timesheet_approved`
- `requisition_created`, `rate_card_created`, `integration_connected`

Zusätzlich Verhaltens-Events:

- `page_view`, `page_time_spent`, `form_started`, `form_abandoned`, `rage_click_detected`

## Session Behavior / Replay

- Frontend-Agent: `frontend/public/js/productAnalytics.js`
  - page views, time-on-page, form abandonment, rage-click detection
  - explizite UI-Events über `data-analytics-event` Attribute
- Optionaler professioneller Replay-Provider:
  - `GET /api/analytics/provider-config`
  - PostHog-Initialisierung nur bei `POSTHOG_ENABLED=true`

## Privacy-Regeln

- keine Passwörter, Tokens, E-Mails, Telefonnummern im Analytics-Metadata-Payload
- Input-/Textmaskierung bei Session-Replay (PostHog-Konfiguration)
- datensparsame Event-Metadata (begrenzt, shallow, redacted)
- Produktanalyse getrennt von Governance-Auditdaten

## Standard-Funnels

- `registration_to_usage`:
  - `signup_started -> signup_completed -> login_success`
- `capacity_to_deal`:
  - `capacity_feed_viewed -> capacity_detail_viewed -> interest_submitted -> deal_completed`
- `worker_to_timesheet`:
  - `worker_invite_sent -> worker_registered -> timesheet_started -> timesheet_submitted`
- `enterprise_setup_to_ops`:
  - `enterprise_config_started -> requisition_created -> rate_card_created`

## Team-Dashboards (empfohlen)

- Demo-Nutzung vs Pilot vs Live
- Top-Seiten + durchschnittliche Verweildauer
- Formularabbrüche und Rage-Clicks
- Funnel Conversion + Dropoff pro Segment
- Top-Fehlerpfade (Sentry) korreliert mit betroffenen Flows

### Standard-Dashboard-Presets (API)

- `GET /api/analytics/product/dashboard-presets`
- Presets:
  - `demo_usage`
  - `pilot_adoption`
  - `live_performance`
  - `flow_dropoff`

Diese Presets werden auch im Internal Control Center fuer Product Insights verwendet.

### PostHog Template Automation

- Template-Datei: `monitoring/posthog/insights-templates.json`
- Import-Script: `scripts/posthog/import-insights.mjs`
- Command: `npm run posthog:import-insights`
- Optional: `--dry-run` fuer sichere Vorschau ohne API-Schreibvorgang

## Internal Control Center Integration

Neue ICC-Endpunkte:

- `GET /api/internal-control/platform/product-insights/overview`
- `GET /api/internal-control/platform/product-insights/pages`
- `GET /api/internal-control/platform/product-insights/funnels/:key`
- `GET /api/internal-control/platform/product-insights/dashboard-presets`
- `GET /api/internal-control/platform/product-insights/dropoff`
- `GET /api/internal-control/platform/product-insights/session-to-completion`
- `GET /api/internal-control/platform/product-insights/role-conversion`

Zugriff: `internal.platform.read`.

## Zusätzliche serverseitige Kernflow-Instrumentierung

Ergänzt in bestehenden Fachrouten:

- `signup_completed`, `login_success` (`auth.js`)
- `worker_registered` (Worker Invite Acceptance in `auth.js`)
- `worker_invite_sent` (`workers.js`)
- `requisition_created`, `suchauftrag_created` (`requisitions.js`)
- `rate_card_created` (`rateCards.js`)
- `integration_connected` (`integrations.js`)
- `deal_started`, `deal_completed` (`requests.js`)
- `timesheet_submitted`, `timesheet_approved`, `assignment_created` (`timesheets.js`)

## Tests

- `api/test/productAnalyticsService.test.js`
  - Segmentableitung
  - Metadata-Sanitizing
  - Funnel-Berechnung
  - Payload-Normalisierung
  - Lifecycle-Resolution
  - Journey/Funnel-Wrapper
  - Retention/Rollup Service-Funktionen
  - Session-to-Completion / Role-Conversion Reads

## Retention + Rollup Betrieb

- Migration `069_product_analytics_rollups_retention.sql`
  - Tabelle `product_analytics_daily_rollups`
- interne Cron-Endpunkte:
  - `POST /api/internal/product-analytics-rollup`
  - `POST /api/internal/product-analytics-retention`
- empfohlene Startwerte:
  - Event/Sessions/Journeys Retention: 180 Tage
  - Rollup-Retention: 540 Tage

## Ingestion Abuse-Schutz

- dedizierter Limiter auf `POST /api/analytics/track-public`
- ENV:
  - `RATE_LIMIT_ANALYTICS_WINDOW_MS` (default 60s)
  - `RATE_LIMIT_ANALYTICS_MAX` (default 120)

## Vertiefende Architektur-Dokumente

- `docs/PRODUCT_ANALYTICS_ARCHITECTURE.md`
- `docs/PRODUCT_ANALYTICS_EVENT_CATALOG.md`
- `docs/PRODUCT_ANALYTICS_FUNNELS.md`
