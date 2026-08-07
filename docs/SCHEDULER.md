# TempConnect – Externer Scheduler (HA-Safe)

## Warum extern?

Bei 2+ App-Servern hinter einem Load Balancer dürfen Cron-Jobs nicht auf jedem Server laufen – sonst werden SLA-Scans, Expirations etc. doppelt ausgeführt. Lösung: **ein externer Scheduler** ruft die internen API-Endpoints auf.

## Interne Endpoints

Alle Endpoints erfordern `X-Internal-Secret` Header mit dem Wert von `INTERNAL_CRON_SECRET`.

| Endpoint | Intervall | Beschreibung |
|---|---|---|
| `POST /api/internal/sla-scan` | alle 5 Min | SLA-Breaches erkennen (Pulse-Timer abgelaufen) |
| `POST /api/internal/expire-reservations` | alle 5 Min | Abgelaufene Reservierungen auf expired setzen |
| `POST /api/internal/cleanup-idempotency` | alle 6h | Alte Idempotency-Keys löschen (>24h) |
| `POST /api/internal/sla-search-scan` | alle 15 Min | Fällige gespeicherte Suchen ermitteln (stand hier fälschlich als `run-search-jobs` — diesen Endpunkt gibt es im Code nicht, ein Cron darauf lief ins Leere) |
| `POST /api/internal/worker-document-expiry-scan` | täglich | Verifizierte Worker-Nachweise auf Ablauf / Fristwarnung prüfen und Reminder versenden |
| `POST /api/internal/infrastructure-snapshots/ingest` | alle 5 Min pro Host | Infrastruktur-Telemetrie (CPU/RAM/Docker/TLS/Backup) in `infrastructure_snapshots` schreiben |

### Nachgetragen 2026-08-06 — Abgleich Code ↔ Plan

Ein Abgleich der implementierten `/api/internal/*`-Endpunkte gegen diesen Plan ergab
**16 Endpunkte ohne Eintrag**. Das ist in Tests unsichtbar und im Betrieb fatal: Der Code
ist richtig, er wurde nur nie gerufen. Beispiele aus dem Befund — die Notdienst-Eskalation
lief nie an, Angebote eingesetzter Kräfte wurden nach Einsatzende **nie wieder
freigegeben**, und der DSGVO-Aufbewahrungs-Sweep lief nicht.

> **Intervalle sind Vorschläge.** Sie ergeben sich aus dem Zweck (Notdienst = schnell,
> Aufräumen = täglich) und sind beim Deploy vom Owner zu bestätigen.

| Endpoint | Intervall | Warum es weh tut, wenn es fehlt |
|---|---|---|
| `POST /api/internal/notdienst-escalate` | alle 5 Min | Notdienst-Anfragen eskalieren nie — das Premium-Versprechen bricht |
| `POST /api/internal/demand-notdienst-escalate` | alle 5 Min | dasselbe auf der Nachfrage-Seite |
| `POST /api/internal/demand-sla-scan` | alle 5 Min | Pulse-Timer auf Nachfragen laufen nie in den Breach |
| `POST /api/internal/staffing-maintenance` | alle 15 Min | **Angebote bleiben nach Einsatzende reserviert** — die Kraft taucht nie wieder im Marktplatz auf |
| `POST /api/internal/sla-search-scan` | alle 15 Min | gespeicherte Suchen laufen nie |
| `POST /api/internal/sla-search-run` | alle 15 Min | dito, Ausführungsteil |
| `POST /api/internal/webhook-retry` | alle 10 Min | fehlgeschlagene Webhooks werden nie erneut zugestellt |
| `POST /api/internal/webhook-cleanup` | täglich | Webhook-Protokoll wächst unbegrenzt |
| `POST /api/internal/usage-limit-scan` | stündlich | Planlimits greifen verzögert oder gar nicht |
| `POST /api/internal/recompute-supplier-metrics` | täglich | Lieferanten-Scorecards veralten still |
| `POST /api/internal/recompute-compliance` | täglich | Compliance-Ampeln veralten still |
| `POST /api/internal/recompute-deal-reliability` | täglich | Zuverlässigkeitsquote friert nach dem letzten Storno ein — niemand kann sich freiarbeiten, und das rollierende 365-Tage-Fenster schiebt sich nie weiter (P8 Welle B) |
| `POST /api/internal/reveal-due-feedback` | täglich | beidseitig verdecktes Deal-Feedback wird nie enthüllt |
| `POST /api/internal/document-center-retention-sweep` | täglich | **Aufbewahrungsfristen laufen ab, ohne dass gelöscht wird** (DSGVO) |
| `POST /api/internal/product-analytics-rollup` | täglich | Analytics-Rohdaten werden nie verdichtet |
| `POST /api/internal/product-analytics-retention` | täglich | Analytics-Rohdaten werden nie gelöscht |

```bash
*/5  * * * * curl -sf -X POST "$LB_URL/api/internal/notdienst-escalate"              -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/5  * * * * curl -sf -X POST "$LB_URL/api/internal/demand-notdienst-escalate"       -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/5  * * * * curl -sf -X POST "$LB_URL/api/internal/demand-sla-scan"                 -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/15 * * * * curl -sf -X POST "$LB_URL/api/internal/staffing-maintenance"            -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/15 * * * * curl -sf -X POST "$LB_URL/api/internal/sla-search-scan"                 -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/15 * * * * curl -sf -X POST "$LB_URL/api/internal/sla-search-run"                  -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/10 * * * * curl -sf -X POST "$LB_URL/api/internal/webhook-retry"                   -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
0    * * * * curl -sf -X POST "$LB_URL/api/internal/usage-limit-scan"                -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
10 3 * * *   curl -sf -X POST "$LB_URL/api/internal/webhook-cleanup"                 -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
20 3 * * *   curl -sf -X POST "$LB_URL/api/internal/document-center-retention-sweep" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
30 3 * * *   curl -sf -X POST "$LB_URL/api/internal/product-analytics-rollup"        -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
40 3 * * *   curl -sf -X POST "$LB_URL/api/internal/product-analytics-retention"     -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
0  4 * * *   curl -sf -X POST "$LB_URL/api/internal/recompute-supplier-metrics"      -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
15 4 * * *   curl -sf -X POST "$LB_URL/api/internal/recompute-compliance"            -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
30 4 * * *   curl -sf -X POST "$LB_URL/api/internal/reveal-due-feedback"             -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
45 4 * * *   curl -sf -X POST "$LB_URL/api/internal/recompute-deal-reliability"      -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
```

### Bewusst NICHT geplant

Diese Endpunkte gehören nicht in den Zeitplan. Der Abschnitt ist die Ausnahmeliste, die
`api/test/schedulerConsistency.test.js` liest — ein Endpunkt darf entweder oben stehen
oder hier, sonst wird der Test rot.

| Endpoint | Warum nicht |
|---|---|
| `POST /api/internal/infrastructure-snapshot-ingest` | Empfangsseite: wird von `scripts/collect-infrastructure-snapshot.sh` pro Host gerufen, nicht zentral getaktet |

## Billing & Lifecycle Crons

Steuern Abo-Lebenszyklus und Rechnungsstellung. **Drei laufen sofort** (Pilot/Live),
**zwei sind feature-geflaggt** und bleiben No-Ops bis zur Aktivierung
(`RECURRING_BILLING_ENABLED` / `DUNNING_ENABLED`, Default AUS — Details + 3-Schritt-Aktivierung
im Runbook-Appendix `docs/enterprise-readiness/PILOT_CUSTOMER_RUNBOOK.md`).

| Endpoint | Intervall | Flag | Beschreibung |
|---|---|---|---|
| `POST /api/internal/subscription-lifecycle-tick` | alle 5 Min | — | Request-Expiry/Activation/Cancellation + Trial-End→`past_due` + Hard-Lock (`past_due`+Grace→`canceled`+Org DEMO) |
| `POST /api/internal/invoice-overdue-scan` | täglich | — | Fällige Rechnungen (`issued` + `due_at < NOW`) → `overdue` |
| `POST /api/internal/pilot-expiry` | täglich | — | Abgelaufene Pilots (> 3 Monate) → `customer_stage=live`, `pilot_status=ended` |
| `POST /api/internal/recurring-billing` | täglich | `RECURRING_BILLING_ENABLED` | Folge-Rechnung am Periodenende für aktive bezahlte Subs + `active→past_due` (No-Op bis Flag AN) |
| `POST /api/internal/dunning-sweep` | täglich | `DUNNING_ENABLED` | Gestaffelte Zahlungserinnerungen (Mahnstufe 1/2/3) für überfällige Rechnungen (No-Op bis Flag AN) |

Crontab (zusätzlich zu Option A unten):
```bash
*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/subscription-lifecycle-tick" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
30 6 * * *  curl -sf -X POST "$LB_URL/api/internal/invoice-overdue-scan"        -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
45 6 * * *  curl -sf -X POST "$LB_URL/api/internal/pilot-expiry"                -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
# Erst nach UG-Gründung + Flag-Aktivierung wirksam (vorher No-Op, schadlos bereits jetzt eintragbar):
0 7 * * *   curl -sf -X POST "$LB_URL/api/internal/recurring-billing"           -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
30 7 * * *  curl -sf -X POST "$LB_URL/api/internal/dunning-sweep"               -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
```

## Optionen für den Scheduler

### Option A: Crontab auf Management-Server
```bash
# /etc/crontab oder crontab -e auf EINEM Server (nicht auf allen App-Servern)
CRON_SECRET="dein_cron_secret"
LB_URL="https://tempconnect.de"

*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/sla-scan" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/expire-reservations" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/15 * * * * curl -sf -X POST "$LB_URL/api/internal/sla-search-scan" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/5 * * * * HOST_NAME="$(hostname -s)" INTERNAL_CRON_SECRET="$CRON_SECRET" BASE_URL="$LB_URL" ./scripts/collect-infrastructure-snapshot.sh > /dev/null
15 6 * * * curl -sf -X POST "$LB_URL/api/internal/worker-document-expiry-scan" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
0 */6 * * * curl -sf -X POST "$LB_URL/api/internal/cleanup-idempotency" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
```

### Option B: UptimeRobot / Cronitor / Cron-Job.org
- HTTP-Monitor mit POST-Request erstellen
- URL: `https://tempconnect.de/api/internal/sla-scan`
- Header: `X-Internal-Secret: <secret>`
- Intervall: 5 Minuten
- Vorteil: Kein eigener Server nötig, HA inklusive

### Option C: GitHub Actions Cron
```yaml
on:
  schedule:
    - cron: '*/5 * * * *'
jobs:
  cron:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sf -X POST "${{ secrets.LB_URL }}/api/internal/sla-scan" \
            -H "X-Internal-Secret: ${{ secrets.CRON_SECRET }}"
          curl -sf -X POST "${{ secrets.LB_URL }}/api/internal/sla-search-scan" \
            -H "X-Internal-Secret: ${{ secrets.CRON_SECRET }}"
          curl -sf -X POST "${{ secrets.LB_URL }}/api/internal/worker-document-expiry-scan" \
            -H "X-Internal-Secret: ${{ secrets.CRON_SECRET }}"
```

## Smoke Test

```bash
INTERNAL_CRON_SECRET=dein_secret ./scripts/scheduler-smoke.sh https://tempconnect.de
```

Erwartet: Alle Endpoints antworten mit 200.
