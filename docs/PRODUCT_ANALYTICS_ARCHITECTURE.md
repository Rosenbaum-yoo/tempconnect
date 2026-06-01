# Product Analytics Architecture

## Ziel und Abgrenzung

TempConnect trennt strikt:

- **Technical Observability**: Errors, API Health, Queue, DB, Performance (`metrics`, Sentry, Health).
- **Product Analytics**: Session-Verhalten, Journeys, Funnels, Friktion, Produktnutzung.

Audit bleibt in `audit_log`. Product Analytics bleibt in `product_analytics_*`.

## Wiederverwendete bestehende Substanz

- Express Router + Service Layer (`api/routes/analytics.js`, `api/services/productAnalyticsService.js`)
- Session/Auth/Org-Kontext via `req.session`, `orgContext`, `org_memberships`
- bestehende Segmentsignale (`users.is_demo`, `users.plan`, `users.customer_stage`, `organizations.customer_stage`)
- bestehende ICC Integration (`/api/internal-control/platform/product-insights/*`)

## Neue Analytics-Bausteine

- Migration `068_product_analytics_sessions_and_journeys.sql`
  - `product_analytics_sessions`
  - `product_analytics_journeys`
  - `product_analytics_funnel_definitions`
  - `product_analytics_funnel_steps`
  - Erweiterung `product_analytics_events` um Journey/Category/Step-Kontext
- zentraler Frontend-Agent (`frontend/public/js/productAnalytics.js`)
  - Session start/resume/end
  - Page view/time/focus/hidden/exit
  - Form started/submitted/completed/abandoned
  - Rage-click Heuristik
  - Journey Wrapper (`startJourney`, `stepJourney`, `completeJourney`, `abandonJourney`)
  - optional Replay-Adapter hinter Consent/Konfiguration
- konsolidierte Service-Normalisierung
  - `normalizeTrackPayload`
  - `sanitizeMetadata` (Whitelist + Redaction)
  - `resolveLifecycleSegment`
  - `upsertAnalyticsSession`
  - `upsertJourneyState`

## Eventfluss

1. Browser sendet standardisierte Product Events an `POST /api/analytics/track-public`.
2. API validiert Payload mit Zod.
3. Service normalisiert, sanitizt und ergänzt Serverkontext (user/org/role/segment).
4. Session/Journey werden aktualisiert.
5. Event wird in `product_analytics_events` persistiert.
6. Read-APIs liefern Overview, Pages, Funnels, Dropoff.

## Lifecycle-Segmentierung Demo/Pilot/Live

Zentrale Auflösung über `resolveLifecycleSegment` / `deriveCustomerSegment`:

1. `customer_stage` (org/user) hat Vorrang.
2. Fallback: `is_demo` oder Plan `DEMO/FREE`.
3. Fallback: Pilot-Heuristik über Org-Name.
4. Standard: `live`.

Server ist finale Wahrheit; Frontend liefert nur Kontext-Hinweise.

## Provider-Abstraktion und Replay

- Interne Persistenz ist führende Wahrheit.
- Externe Provider sind optional.
- Replay wird nur bei aktivem Provider und Consent aktiviert.
- Bei deaktiviertem Provider bleibt Product Analytics vollständig nutzbar.

## Privacy und Retention

- kein Blinddump: Metadata nur über Whitelist
- sensitive Schlüssel werden redacted
- keine Tokens/Secrets/PII/Freitextinhalte
- Consent-Status wird auf Session-Ebene geführt
- Empfohlene Retention (betrieblich): 90-180 Tage Events, verdichtete Metriken länger

## Rollout / Safe Defaults

- Tracking robust und non-blocking (`sendBeacon`/fetch fallback)
- Analytics-Fehler brechen keine Business-Flows
- Replay standardmäßig nur bei expliziter Freigabe
- bestehende Monitoring/Audit-Strukturen bleiben unverändert
