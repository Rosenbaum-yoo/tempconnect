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
| `POST /api/internal/run-search-jobs` | alle 5 Min | Batch-Matching für offene Suchaufträge |
| `POST /api/internal/worker-document-expiry-scan` | täglich | Verifizierte Worker-Nachweise auf Ablauf / Fristwarnung prüfen und Reminder versenden |
| `POST /api/internal/infrastructure-snapshots/ingest` | alle 5 Min pro Host | Infrastruktur-Telemetrie (CPU/RAM/Docker/TLS/Backup) in `infrastructure_snapshots` schreiben |

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
*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/run-search-jobs" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
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
          curl -sf -X POST "${{ secrets.LB_URL }}/api/internal/run-search-jobs" \
            -H "X-Internal-Secret: ${{ secrets.CRON_SECRET }}"
          curl -sf -X POST "${{ secrets.LB_URL }}/api/internal/worker-document-expiry-scan" \
            -H "X-Internal-Secret: ${{ secrets.CRON_SECRET }}"
```

## Smoke Test

```bash
INTERNAL_CRON_SECRET=dein_secret ./scripts/scheduler-smoke.sh https://tempconnect.de
```

Erwartet: Alle Endpoints antworten mit 200.
