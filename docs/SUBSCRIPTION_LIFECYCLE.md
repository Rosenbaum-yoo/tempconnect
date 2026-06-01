# Subscription Lifecycle Automation (Welle 8 Schritt 16)

Dieses Dokument beschreibt die automatisierte Lifecycle-Verarbeitung
fuer `subscription_requests`: Auto-Linking, Quote-Snapshot, Expiry,
Activation, Cancellation.

## Konzept

Eine `subscription_requests`-Anfrage durchlaeuft eine State-Machine
(`draft -> submitted -> ... -> active/expired/...`). Vier Aktionen
laufen heute automatisiert:

1. **Auto-Linking** - aus einer Public-Enterprise-Anfrage
   (`strategic_collaboration_requests`) entsteht idempotent ein
   passender Subscription-Request mit `source_strategic_request_id`.
2. **Quote-Snapshot** - sobald eine Anfrage in `offered` geht, wird
   der Plan/Preis/Add-on/Feature/Limit-Stand als JSONB eingefroren.
3. **Expiry-Cron** - `offered`/`accepted` mit abgelaufenem
   `offer_expires_at` werden auf `expired` gesetzt.
4. **Activation-Cron** - `accepted` mit `effective_from <= NOW`
   werden ueber `applyApprovedChange` auf `active` gehoben (inkl.
   `subscriptions.plan` + `organizations.plan`).
5. **Cancellation-Cron** - `active` Cancellation-Anfragen mit
   `cancellation_effective_at <= NOW` revoken Live-Subscription auf
   `DEMO` und transitionieren den Datensatz auf `expired`.

Alle Cron-Aktionen sind **idempotent** (Status-Filter im SQL),
**fail-safe** (Fehler bei Datensatz X stoppt nicht die anderen),
und schreiben **Audit + Notification** je Aktion.

## Architektur

```text path=null start=null
         strategic_collaboration_requests
                       │
                       ▼ linkEnterpriseRequestToSubscription
                       │   (idempotent ueber Partial-UNIQUE-Index)
                       ▼
              subscription_requests
                       │
   ┌───────────────────┼───────────────────┐
   ▼                   ▼                   ▼
freezeQuoteSnapshot   expireDueRequests   applyDueCancellations
(beim Wechsel zu      (offered/accepted    (active cancellation
 offered automatisch)  mit faelligem        mit faelligem
                       offer_expires_at)    cancellation_effective_at)
                       │                   │
                       ▼                   ▼
              subscription_request_status_history
              audit_log
              subscription_notification_log (Welle 8/15)
```

## Service: `api/services/subscriptionLifecycleService.js`

### Public-API

| Funktion | Zweck | Idempotent? |
|---|---|---|
| `linkEnterpriseRequestToSubscription(pool, args)` | Auto-Link Lead -> SubReq | Ja, ueber `source_strategic_request_id` + UNIQUE-Index |
| `buildQuoteSnapshot(req)` | Pure Helper, baut Snapshot-JSON | n/a |
| `freezeQuoteSnapshot(pool, args)` | Friert Snapshot ein | Ja, `already_frozen=true` |
| `expireDueRequests(pool, opts)` | Cron: offer_expires -> expired | Ja, Status-Filter |
| `activateDueRequests(pool, opts)` | Cron: effective_from -> active | Ja, Status-Filter |
| `applyDueCancellations(pool, opts)` | Cron: cancel_at -> deactivate | Ja, Status-Filter |
| `runLifecycleTick(pool, opts)` | Orchestriert alle drei Crons | Ja |

### Konstanten
- `DEFAULT_OFFER_VALIDITY_DAYS = 14` - Default-Frist fuer
  Angebots-Ablauf, wenn Staff keinen expliziten setzt.
- `MAX_BATCH_SIZE = 500` - Schutz vor Lastspitzen pro Tick.

## Lokale Ausfuehrung

### 1. Migration 104 anwenden

```sh path=null start=null
docker compose exec api node /app/scripts/run-migrations.js
# oder direkt:
docker compose exec db psql -U tempconnect -d tempconnect -f /sql/migrations/104_subscription_lifecycle.sql
```

### 2. Cron-Tick manuell ausloesen (lokal)

```bash path=null start=null
# .env: INTERNAL_CRON_SECRET muss gesetzt sein.
curl -X POST http://localhost:3000/api/internal/subscription-lifecycle-tick \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: $INTERNAL_CRON_SECRET" \
  -d '{"batch_size": 100}'
```

Antwort:
```json path=null start=null
{
  "ok": true,
  "ts": "2026-04-27T12:00:00.000Z",
  "expiry":       { "processed": 2, "expired": 2, "failed": [], "batch_size": 100 },
  "activation":   { "processed": 1, "activated": 1, "failed": [], "batch_size": 100 },
  "cancellation": { "processed": 0, "revoked": 0, "failed": [], "batch_size": 100 }
}
```

### 3. Staff-Konvertierung manuell

Strategic-Lead in eine Subscription-Anfrage umwandeln:
```bash path=null start=null
curl -X POST http://localhost:3000/staff/api/strategic-requests/<id>/convert-to-subscription \
  -H "Content-Type: application/json" \
  -H "Cookie: tc.staff.sid=..." \
  -d '{"request_type":"new_individual", "confirm": true, "reason": "Lead qualifiziert, Konvertierung"}'
```

Idempotent: doppelter Aufruf liefert `linked: false, reason: "ALREADY_LINKED"`.

## Cron-Setup (Production-Empfehlung)

### Empfohlener Rhythmus

| Endpoint | Intervall | Begruendung |
|---|---|---|
| `/internal/subscription-lifecycle-tick` | alle 5 Minuten | Reagiert zeitnah auf abgelaufene Angebote + faellige Aktivierungen |

### crontab-Eintrag (z.B. `/etc/cron.d/tempconnect-lifecycle`)
```text path=null start=null
*/5 * * * * tempconnect curl -fsS -X POST -H "x-internal-secret: ${INTERNAL_CRON_SECRET}" \
  http://localhost:3000/api/internal/subscription-lifecycle-tick \
  -d '{"batch_size":100}' > /var/log/tempconnect/lifecycle.log 2>&1
```

### Kubernetes CronJob

```yaml path=null start=null
apiVersion: batch/v1
kind: CronJob
metadata:
  name: tempconnect-subscription-lifecycle
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: cron
            image: curlimages/curl:8
            command: ["sh","-c"]
            args:
            - |
              curl -fsS -X POST \
                -H "x-internal-secret: $INTERNAL_CRON_SECRET" \
                http://api/api/internal/subscription-lifecycle-tick \
                -d '{"batch_size":100}'
            envFrom:
            - secretRef:
                name: tempconnect-secrets
          restartPolicy: OnFailure
```

## Idempotenz-Garantien

| Pfad | Mechanismus |
|---|---|
| Auto-Linking | `source_strategic_request_id` Existenz-Check + Partial-UNIQUE-Index `uniq_subreq_per_strategic_source_open`. Race-Condition (23505) wird abgefangen und liefert `ALREADY_LINKED_RACE`. |
| Quote-Snapshot | `quote_frozen_at` + nicht-leerer `quote_snapshot` werden NIE ueberschrieben (ausser explizit `force=true`). |
| Expiry | Status-Filter `WHERE status IN ('offered','accepted')` - nach Wechsel zu `expired` faellt der Datensatz aus dem Set. |
| Activation | Status-Filter `WHERE status = 'accepted'` - nach Wechsel zu `active` faellt der Datensatz aus dem Set. |
| Cancellation | Status-Filter `WHERE status = 'active' AND request_type = 'cancellation'` - nach Wechsel zu `expired` faellt der Datensatz aus dem Set. |

## Quote-Snapshot Stabilitaet (Vertrags-Garantie)

Sobald eine Anfrage in `offered` ist, ist der gespeicherte
`quote_snapshot` UNVERAENDERT. Auch wenn:
- der Catalog (`planCatalog.js`) inzwischen Preise/Features/Add-ons
  geaendert hat (`catalog_version` ist hochgezaehlt),
- ein neuer Add-on im Katalog hinzugekommen ist,
- ein Add-on aus dem Katalog entfernt wurde.

Der Customer sieht weiter den Snapshot aus dem Zeitpunkt des Angebots.
Erst eine NEUE Anfrage erzeugt einen neuen Snapshot. Staff kann manuell
ueber `freezeQuoteSnapshot({force:true})` einen Snapshot regenerieren -
das wird im Audit dokumentiert.

## Audit-Trail

Jede Cron-Aktion schreibt in `audit_log`:
- `subscription_request.lifecycle.expired`
- `subscription_request.lifecycle.activated`
- `subscription_request.lifecycle.activate_failed`
- `subscription_request.lifecycle.cancellation_applied`
- `subscription_request.lifecycle_tick` (Aggregat-Eintrag pro Tick)
- `subscription_request.auto_linked` (manuell + automatisch)
- `subscription_request.quote_frozen`

Zusaetzlich schreibt jede Aktion in `subscription_request_status_history`
(via Service-Layer).

## Notification-Hooks (Welle 8/15)

Jede Cron-Aktion feuert fire-and-forget eine Notification ueber den
zentralen `subscriptionNotificationService`:

| Aktion | Hook | Empfaenger |
|---|---|---|
| Expiry | `notifyRequestStatusChanged(toStatus='expired')` | Customer |
| Activation Erfolg | `notifyRequestStatusChanged(toStatus='active')` | Customer |
| Activation Fehler | `notifyActivationFailed(...)` | Staff (severity=error) |
| Cancellation applied | `notifyRequestStatusChanged(toStatus='cancelled')` | Customer |

Mail-Fail-Safe: SMTP-Probleme blockieren NIEMALS die Cron-Verarbeitung.

## Tests

```sh path=null start=null
# Unit + Integration
node --test --test-force-exit api/test/subscriptionLifecycle.test.js
node --test --test-force-exit api/test/subscriptionNotifications.test.js

# Komplettes Welle-8-Set
node --test --test-force-exit api/test
```

## Bewusst NICHT angefasst

- **Cron-Scheduler in der Plattform**: TempConnect setzt auf einen
  externen Cron (system-cron oder Kubernetes CronJob), der via
  `x-internal-secret` Header aufruft. Es gibt keinen internen Scheduler.
- **`expired` Customer-Template fuer Cancellation**: nutzt heute den
  generischen `cancelled`-Template. Das ist semantisch akzeptabel,
  weil der Customer die Kuendigung selbst initiiert hat. Eine
  spezialisierte `cancellation_applied`-Template ist offen.
- **Notification-Preferences pro Lifecycle-Event**: heute keine
  separate Customer-UI-Auswahl pro Event-Typ. Standard ist Mail aktiv,
  ueberschreibbar nur ueber `notification_preferences`-Tabelle direkt.
- **Multi-Org-Effekte bei Cancellation**: heute nur Single-Org-Update.
  Wenn eine Pilot-Org gekuendigt wird, wird ihre Sub-Org-Hierarchie
  nicht automatisch angepasst.

## Verwandte Welle-8-Schritte

- **Schritt 8** (`applyApprovedChange`): atomare Aktivierung, wird vom
  Activation-Cron genutzt.
- **Schritt 15** (`subscriptionNotificationService`): Notification-Hooks,
  werden vom Lifecycle-Cron genutzt.
- **Migration 100**: `effective_from` / `cancellation_effective_at`
  Felder, die der Lifecycle-Cron liest.
- **Migration 102** (`catalog_versions`): Versionsverlauf, der den
  Quote-Snapshot ergaenzt aber nicht ersetzt.
