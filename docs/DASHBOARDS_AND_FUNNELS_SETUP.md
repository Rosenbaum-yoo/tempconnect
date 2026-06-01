# Dashboards and Funnel Setup

## Ziel

Sofort nutzbare Dashboards/Funnels fuer:

- Demo-Nutzung
- Pilot-Adoption
- Live-Performance
- Flow-Dropoff und Problemseiten

## Grafana (provisioned)

Neu hinzugefuegt:

- Dashboard JSON: `monitoring/grafana/provisioning/dashboards/json/tempconnect-product-analytics.json`
- PostgreSQL Datasource: `monitoring/grafana/provisioning/datasources/postgres.yml`
- Grafana Env fuer DB-Credentials in `docker-compose.monitoring.yml`

### Dashboard-Inhalte

- Events / Sessions / aktive Nutzer (Zeitraum)
- Segmentverteilung (demo/pilot/live)
- Event-Volumen pro Tag
- Form-Abbrueche und Rage Clicks
- Top Events
- Problemseiten (Verweildauer, Abbruch, Rage Click)
- Funnel Conversion Snapshot (Signup und Capacity->Deal)

### Start

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Grafana: [http://localhost:3001](http://localhost:3001)

## PostHog Insight Templates

Vorlagen-Datei:

- `monitoring/posthog/insights-templates.json`

Enthaelt:

- Demo Activation Funnel
- Pilot Enterprise Adoption Funnel
- Worker Lifecycle Funnel
- Capacity-to-Deal Funnel
- Problem Signals (form_abandoned, rage_click_detected)
- Feature Usage by Segment

### Automatischer Import via PostHog API

Script:

- `scripts/posthog/import-insights.mjs`

NPM Command:

```bash
npm run posthog:import-insights
```

Erforderliche ENV Variablen:

- `POSTHOG_API_HOST` (z. B. `https://eu.posthog.com`)
- `POSTHOG_PROJECT_ID`
- `POSTHOG_PERSONAL_API_KEY`

Optionen:

- Dry Run: `npm run posthog:import-insights -- --dry-run`
- Alternativdatei: `npm run posthog:import-insights -- --file monitoring/posthog/insights-templates.json`

Hinweis: Das Script ist idempotent fuer TempConnect-Templates (Erkennung ueber `description` mit `TempConnect template key: ...`).

## Segment-Filter

Dashboards/Funnels sind auf `customer_segment` ausgelegt:

- `demo`
- `pilot`
- `live`
- optional `all`

Explizite Segmentpflege erfolgt ueber:

- `users.customer_stage`
- `organizations.customer_stage`

## Internal Control Center

Product-Insights-APIs sind im ICC integriert:

- `/api/internal-control/platform/product-insights/overview`
- `/api/internal-control/platform/product-insights/pages`
- `/api/internal-control/platform/product-insights/funnels/:key`
- `/api/internal-control/platform/product-insights/dropoff`
- `/api/internal-control/platform/product-insights/session-to-completion`
- `/api/internal-control/platform/product-insights/role-conversion`
- `/api/internal-control/platform/product-insights/dashboard-presets`
