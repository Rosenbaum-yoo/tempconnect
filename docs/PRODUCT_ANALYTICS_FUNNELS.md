# Product Analytics Funnels

## Standard API

- `startFunnel(flowName, context)`
- `trackFunnelStep(flowName, stepName, context)`
- `completeFunnel(flowName, result)`
- `abandonFunnel(flowName, reason)`

Journey-Zustand wird mit `journey_id` und `session_id` geführt.

## Kernflows

## 1) Onboarding

- Start: `onboarding_started`
- Schritte: profilbezogene Setup-Schritte
- Completion: `onboarding_completed`
- Dropoff: `journey_abandoned` mit `flow_name=onboarding`

## 2) Enterprise-Konfiguration

- Start: `enterprise_config_started`
- Schritte: `requisition_created`
- Completion: `rate_card_created`
- Dropoff: Abbruch vor Rate-Card/Setup-Completion

## 3) Suchauftrag / Request-Erstellung

- Start: `request_created`
- Schritte: Pflichtfelder + Versand
- Completion: `request_sent`
- Dropoff: Formularabbruch / Journey-Abbruch

## 4) Deal-/Kooperationsanfrage

- Start: `deal_started`
- Schritte: Interaktion + Bestätigung
- Completion: `deal_completed`
- Dropoff: `journey_abandoned` auf Deal-Step

## 5) Rahmenvertrag-Interesse / Vertragsanbahnung

- Start: `contract_started`
- Completion: `contract_interest_submitted`
- Dropoff: Abbruch vor Interessensabgabe

## 6) Worker-/Timesheet-Flow

- Start: `worker_invite_sent`
- Schritte: `worker_registered`, `timesheet_started`
- Completion: `timesheet_submitted`
- Dropoff: Abbruch auf Register/Timesheet-Step

## 7) Login / Invitation / Aktivierung

- Start: `signup_started`
- Schritte: `signup_completed`
- Completion: `login_success`
- Dropoff: kein Login nach erfolgreichem Signup

## Auswertungsendpunkte

- `GET /api/analytics/product/funnels/:key`
- `GET /api/analytics/product/dropoff`
- ICC:
  - `/api/internal-control/platform/product-insights/funnels/:key`
  - `/api/internal-control/platform/product-insights/dropoff`

## Pilot Activation & Conversion Truth
Die Produkt-Funnels bleiben die Event-Basis für die kanonische Pilot-/Conversion-Wahrheit. Es wird keine parallele Eventspur gebaut.

Aktivierungs-Events (nach `pilot_started_at`):

- `requisition_created`
- `request_created`
- `request_sent`
- `deal_started`
- `assignment_created`
- `timesheet_started`
- `rate_card_created`
- `integration_connected`

Completion-/Core-Flow-Events:

- `request_sent`
- `deal_completed`
- `assignment_created`
- `timesheet_submitted`
- `timesheet_approved`
- `rate_card_created`
- `integration_connected`

Pilot `successful_usage`:

- mindestens fünf Core-Value-Events seit Pilotstart
- plus mindestens zwei aktive Tage oder zwei Nutzer oder zwei Produktbereiche

Wichtig:

- Login, Signup oder reine Session-Aktivität gelten nicht als Pilot-Aktivierung.
- Dieselbe Organisation darf in Transition-Metriken nicht mehrfach gezählt werden.
- Der Funnel nutzt vorhandene Events, Strategic-Lead-Signale und Commercial-Timestamps gemeinsam; fehlende historische Pricing-/Lead-Timestamps werden als Qualitätsflag kenntlich gemacht.
