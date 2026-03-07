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

## Optionen für den Scheduler

### Option A: Crontab auf Management-Server
```bash
# /etc/crontab oder crontab -e auf EINEM Server (nicht auf allen App-Servern)
CRON_SECRET="dein_cron_secret"
LB_URL="https://tempconnect.de"

*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/sla-scan" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/expire-reservations" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
*/5 * * * * curl -sf -X POST "$LB_URL/api/internal/run-search-jobs" -H "X-Internal-Secret: $CRON_SECRET" > /dev/null
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
```

## Smoke Test

```bash
INTERNAL_CRON_SECRET=dein_secret ./scripts/scheduler-smoke.sh https://tempconnect.de
```

Erwartet: Alle Endpoints antworten mit 200.
