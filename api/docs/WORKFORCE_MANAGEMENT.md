# Workforce Management

Operatives Einsatzmodul — konsolidiert Assignments, slot-faehiges Staffing, Worker-Zuweisungen, Timesheets und Verträge zu einer einheitlichen Workforce-Sicht.

## Architektur

Die Workforce-Sicht bleibt **lesend/aggregierend**, aber die operative Besetzungslogik darunter ist jetzt slot-faehig:

- `assignments` — operative Einsatz- und Staffing-Container (Buyer↔Supplier)
- `assignment_staffing_campaigns` — Sammelanfragen / Outreach-Batches
- `assignment_staffing_invites` — statusgefuehrte Worker-Anfragen
- `assignment_staffing_reservations` — reservierte Slots vor finaler Zuordnung
- `worker_assignment_links` — finale worker-spezifische Einsatzobjekte mit Bestaetigungsstatus
- `timesheets` — Stundenzettel (Agency-Sicht)
- `worker_time_submissions` — Zeiterfassung (Worker-Sicht)
- `contracts` — Vertragsreferenzen

**Dual-Perspektive:** Workforce-Queries liefern Daten sowohl fuer Buyer (`org_id`) als auch Supplier (`supplier_org_id`).

## Multi-Staffing-Grundprinzip

Ein Assignment mit `requested_quantity > 1` ist kein einzelner Worker-Link mehr, sondern ein **Staffing-Container** mit vier getrennten Ebenen:

1. `requested_quantity` — wie viele Personen fachlich benoetigt werden
2. `assignment_staffing_invites` — wer angefragt wurde
3. `assignment_staffing_reservations` — wer einen Slot reserviert hat
4. `worker_assignment_links` — wer final dem Einsatz zugeordnet ist

Die zugehoerigen Mengenfelder auf `assignments`:

- `requested_quantity`
- `filled_quantity`
- `reserved_quantity`
- `open_quantity`
- `staffing_status` (`open`, `sourcing`, `partially_filled`, `filled`, `closed`, `cancelled`)

Wichtig:

- **Bulk-Staffing ist der Standardpfad** fuer Mehrfachbedarfe.
- **Manuelle Einzelzuweisung bleibt erhalten**, laeuft aber ueber denselben slot-faehigen Assignment-Container.
- Ein Deal oder Demand mit `quantity/headcount > 1` wird nicht mehr fachlich falsch als ein einzelner Worker-Einsatz behandelt.

## API-Endpunkte

Alle unter `/api/workforce`, erfordern `assignment.view` Permission.

### GET /workforce/overview

Konsolidierte Einsatzliste mit inline Worker/Timesheet-KPIs pro Assignment.

**Query-Parameter:**
- `status` — Filter nach Assignment-Status (`active`, `planned`, `completed`, `extended`, `cancelled`)
- `supplier_org_id` — Filter nach Supplier
- `date_from` / `date_to` — Zeitraumfilter
- `search` — Volltextsuche über Beschreibung, Org-Namen, Requisition-Titel
- `limit` — Max. Ergebnisse (Default: 100, Max: 200)

**Response-Felder pro Assignment:**
- Assignment-Stammdaten (id, status, start_date, planned_end_date, hourly_rate_cents, etc.)
- Staffing-Coverage (`requested_quantity`, `filled_quantity`, `reserved_quantity`, `open_quantity`, `staffing_status`)
- `org_name`, `supplier_org_name`, `requisition_title`
- `active_workers`, `pending_confirmations`, `total_workers`
- `open_timesheets`, `submitted_timesheets`, `rejected_timesheets`
- `contract_valid_until`, `contract_status`

Sortierung: active → extended → planned → completed, dann nach start_date.

### GET /workforce/:assignmentId/detail

Vollständige Detailansicht eines einzelnen Einsatzes.

**Response:**
```json
{
  "assignment": { /* Stammdaten + Org/Requisition-JOINs */ },
  "workers": [
    {
      "link_id": "...",
      "worker_user_id": "...",
      "first_name": "Max", "last_name": "Mueller",
      "is_active": true,
      "worker_confirmation_status": "worker_confirmed",
      "default_hours_per_day": 8,
      "default_shift_start": "07:00", "default_shift_end": "15:30"
    }
  ],
  "timesheets": [ /* Letzte 10, absteigend nach Woche */ ],
  "submissions": [ /* Letzte 10 Worker-Submissions */ ],
  "contract": { /* oder null */ },
  "action_flags": [
    { "type": "pending_confirmations", "count": 2, "severity": "warning" },
    { "type": "rejected_timesheets", "count": 1, "severity": "error" },
    { "type": "expiring_soon", "days_remaining": 5, "severity": "warning" }
  ]
}
```

**Org-Boundary:** Liefert `{ error: "ORG_BOUNDARY_VIOLATION" }` wenn die anfragende Org weder Buyer noch Supplier ist.

## Operative Staffing-Endpunkte

Die folgenden Endpunkte bilden den neuen slot-faehigen Besetzungsfluss ab. Sie liegen bewusst nah an den bestehenden Worker-/Dispatcher-Routen und bauen keine Parallelwelt neben `assignments` und `worker_assignment_links`.

### Dispatcher

- `GET /api/open-deal-assignments`
  - listet offene assignment-zentrierte Staffing-Container statt nur "Assignments ohne irgendeinen Worker"
- `GET /api/staffing-assignments/:id`
  - liefert Live-Coverage, aktuelle Worker, Reservierungen, letzte Invites, Campaigns und die persistente Waitlist
- `GET /api/staffing-assignments/:id/suggestions`
  - liefert sortierte Worker-Vorschlaege mit harter/weicher Eignungstrennung
  - Query-Flags: `hard_only`, `include_blocked`, `only_available`
  - Response-Felder pro Kandidat: `hard_failures`, `missing_requirements`, `factor_scores`, `hard_match`, `soft_score`, `suggestion_status`, `match_reasons`
- `POST /api/staffing-assignments/:id/campaigns`
  - startet eine Bulk-Anfrage fuer mehrere Worker
  - `auto_backfill_enabled=true` markiert die Kampagne als Opt-in-Quelle fuer spaetere automatische Nachsteuerung
- `POST /api/staffing-assignments/:id/waitlist`
  - legt manuell ausgewaehlte Kandidaten auf dieselbe assignment-/campaign-nahe Nachruecker-Queue
- `POST /api/staffing-assignments/:id/waitlist/next-wave`
  - zieht die naechste Welle zuerst aus der Waitlist und startet daraus eine neue Staffing-Kampagne
- `POST /api/staffing-reservations/:id/finalize`
  - finalisiert eine Reservierung manuell in einen `worker_assignment_link`
- `POST /api/assign-deal-to-worker`
  - manuelle Einzelzuweisung bleibt als Option erhalten, respektiert aber `open_quantity`, Duplikatschutz und Konflikte

### Worker-Portal

- `GET /api/worker/staffing-requests`
  - liefert offene Staffing-Anfragen getrennt von allgemeinen Notifications
  - Response enthaelt jetzt `request_context` (Titel, Rolle, Ort, Start, Dauer/Schicht, Verguetung, Antwortfrist, root campaign reference), `priority`, `conflicts`, `delivery`, `reminder` und `message_summary`
- `POST /api/worker/staffing-requests/:id/respond`
  - Worker kann Anfrage annehmen oder ablehnen
  - Annahmen werden gegen aktive `worker_assignment_links` **und** aktive `assignment_staffing_reservations` auf Ueberschneidungen geprueft
- `POST /api/worker/staffing-requests/:id/question`
  - Worker stellt eine request-gebundene Rueckfrage; Invite bleibt offen, Status kann auf `interested` wechseln
- `POST /api/worker/staffing-requests/:id/remind`
  - Worker setzt einen Reminder-Wunsch (`remind_after`), der spaeter ueber die Staffing-Maintenance erneut zugestellt wird

## Scoring und Vorschlaege

Die aktuelle Vorschlagslogik trennt explizit zwischen **harten Ausschluessen**, **fehlenden Kriterien** und **weichen Faktor-Scores**.

Harte Ausschluesse:

- Verfuegbarkeits-/Termin-Konflikte
- bestehende Reservierung oder bereits vorhandene Zuweisung auf demselben Assignment
- fehlende zwingende Nachweise / Pflichtqualifikationen

Fehlende, aber nicht automatisch blockierende Kriterien:

- Rollenfit
- Skill-Luecken
- Schichtfaehigkeit, sofern nur indirekt aus vorhandenem Profilmaterial ableitbar

Weiche Faktor-Scores:

- `availabilityMatch`
- `skillMatch`
- `distanceScore`
- `qualificationScore`
- `reliabilityScore`
- `preferenceScore` (vorhandene Kundenerfahrung)
- `experienceScore`

Die API liefert zu jedem Vorschlag erklaerbare `match_reasons` plus strukturierte `factor_scores`, `hard_failures` und `missing_requirements`.

### Waitlist-/Nachruecker-Lifecycle

Der operative Lifecycle ist jetzt nicht mehr nur `suggested -> invited -> reserved -> assigned`, sondern:

`suggested -> queued -> invited -> reserved -> assigned`

Abgebrochene Kandidaten werden mit `removed` und Grund (`invite_expired`, `invite_declined`, `reservation_expired`, `assignment_filled`, etc.) aus der aktiven Queue genommen, bleiben aber historisch nachvollziehbar.

## Automatisierte Nachsteuerung

Die erste Bulk-Kampagne kann optional `auto_backfill_enabled` setzen. Damit bleibt die manuelle Einzel- oder Kuratierungszuweisung erhalten, aber TempConnect darf offene Slots spaeter sicher nachsteuern, ohne eine Klickorgie zu erzwingen.

Aktuelle Guardrails:

- nur fuer Assignments mit `open_quantity > 0`
- nur wenn keine lebenden Invites mehr offen sind
- nur nach Cooldown (`last_auto_backfill_at`)
- zuerst Verbrauch der bestehenden Waitlist, erst danach frischer Re-Score
- keine erneute Ansprache bereits kontaktierter Worker
- kuratierte manuelle Auswahl bleibt standardmaessig **ohne** Auto-Backfill

Interner Cron-Endpunkt:

- `POST /api/internal/staffing-maintenance`
  - verarbeitet Invite-/Reservierungs-Expiry
  - dispatcht faellige Worker-Reminder ueber dieselbe queue-basierte Delivery-Schicht
  - startet opt-in Auto-Backfill fuer geeignete offene Assignments
  - Parameter: `limit`, `cooldown_minutes`

### GET /workforce/kpis

Aggregierte KPIs für das Dashboard.

**Response:**
```json
{
  "active_assignments": 5,
  "planned_assignments": 2,
  "completed_assignments": 10,
  "total_assignments": 18,
  "deployed_workers": 12,
  "pending_confirmations": 3,
  "draft_timesheets": 4,
  "submitted_timesheets": 2,
  "rejected_timesheets": 1,
  "expiring_in_14d": 2
}
```

**Definitionen:**
- `deployed_workers` — Distinct Worker mit bestätigter, aktiver Zuweisung in aktiven/planned Assignments
- `pending_confirmations` — Aktive Links mit Status `pending_confirmation`
- `expiring_in_14d` — Aktive Assignments mit `planned_end_date` innerhalb der nächsten 14 Tage

### GET /workforce/pending-actions

Priorisierte offene Aktionen die Aufmerksamkeit erfordern.

**Query-Parameter:**
- `limit` — Max. Aktionen (Default: 20, Max: 50)

**Action-Typen:**

| Typ | Severity | Beschreibung |
|-----|----------|-------------|
| `pending_confirmation` | warning | Worker-Einsatzbestätigung ausstehend |
| `rejected_timesheet` | error | Stundenzettel wurde abgelehnt |
| `pending_approval` | info | Stundenzettel wartet auf Freigabe |
| `expiring_assignment` | error/warning | Einsatz endet in ≤14 Tagen (error wenn ≤3) |

Sortierung: error → warning → info.

**Response pro Action:**
```json
{
  "type": "rejected_timesheet",
  "severity": "error",
  "entity_type": "timesheet",
  "entity_id": "ts-123",
  "assignment_id": "asg-456",
  "description": "Stundenzettel abgelehnt: Max Mueller (KW 2026-03-10)",
  "details": { "worker_name": "Max Mueller", "week_start": "2026-03-10", "reason": "Stunden fehlerhaft" }
}
```

## Statusmodell

### Assignment-Lifecycle
```
planned → active → completed
  ↓         ↓         
  cancelled  extended → completed
              ↓
              cancelled
```

### Staffing-Orchestrierung auf dem Assignment
```
open → sourcing → partially_filled → filled → closed
  ↓                                 ↓
cancelled                       cancelled
```

### Invite-/Reservierungs-Lifecycle
```
sent → viewed → interested → accepted → reserved → promoted
  ↓        ↓         ↓          ↓          ↓
declined  declined  declined   expired    released
  ↓
cancelled
```

### Worker-Confirmation-Lifecycle
```
pending_confirmation → worker_confirmed
                     → worker_declined
                     → worker_unavailable
```

Der Worker-Confirmation-Lifecycle beginnt erst **nach** einer finalen Promotion in `worker_assignment_links`.

### Timesheet-Lifecycle
```
draft → submitted → approved
                  → rejected → draft (Korrektur)
```

## Operativer Workflow

1. **Assignment-Container anlegen** → `requested_quantity` / `open_quantity` werden initialisiert
2. **Worker vorschlagen oder manuell auswaehlen** → Bulk-Flow ohne Klickorgie, Einzelzuweisung bleibt moeglich
3. **Campaign starten** → mehrere `assignment_staffing_invites` werden parallel versendet
4. **Worker sieht strukturierte Request-Karte** → Kontext, Konflikte, Prioritaet, Reminder-/Kommunikationsstatus statt loser Einzel-Notification
5. **Worker reagiert** → Annahme erzeugt Reservierung; Ablehnung/Expiry reduziert nur den Sourcing-Pool; Rueckfragen und Reminder-Wuensche werden request-gebunden gespeichert
6. **Auto-Stop / manuelle Finalisierung** → sobald genug Slots reserviert/finalisiert sind, stoppt offene Outreach-Kommunikation
7. **Finaler Worker-Link** → `worker_assignment_link` entsteht mit `pending_confirmation` oder automatischer Bestaetigung
8. **Operativer Einsatz** → bestaetigte Worker laufen in `active`/`extended`, danach Timesheets und Abschluss
9. **Laufzeitende** → `expiring_assignment` Action → Verlängerung oder `completed`

## Kapazitäten im Dispatcher-Flow (Worker-Modul)

Der Verwaltungs-Flow „Kapazität → Worker zuweisen“ arbeitet mit `capacity_posts` als **kanonische Kapazitätsquelle**.

### Definition „offene Kapazität“

Eine Kapazität gilt als **offen/zuweisbar**, wenn:
- `capacity_posts.status = 'active'`
- `capacity_posts.is_active = TRUE`
- sie **nicht** bereits über `worker_assignment_links.capacity_post_id` aktiv gebunden ist (außer der Link wurde vom Worker abgelehnt)

### Org-Scope (wichtig)

`capacity_posts` sind operativ **org-gescoped** über `capacity_posts.org_id`.

- **Zweck**: Dispatcher/Backoffice sollen Kapazitäten zuverlässig im Kontext *ihrer* Organisation verwalten können, ohne User-ID-Membership-Workarounds.
- **Konsequenz**: UI/Services müssen beim Erstellen von Kapazitäten `org_id` setzen (oder explizit via Org-Kontext übergeben).

### UX-Regel: Error ≠ Empty

Im Modal gilt strikt:
- **Error-State** bei HTTP 4xx/5xx oder Parse-Fehler (mit Retry)
- **Empty-State** nur bei erfolgreichem Response und `items.length === 0`

## Ausbauhinweise / bewusst offene Erweiterungspunkte

Die aktuelle Fassung ist production-ready, aber bewusst so modelliert, dass spaetere Optimierungen sauber andocken:

- **Richer scoring signals**: Sprache, Fuehrerschein, Ruhezeitregeln, Kunden-/Standortsperren, Historie und Zuverlaessigkeit als strukturierte Zusatzkriterien
- **Waitlist / Nachruecker-Automation**: automatische Nachladung weiterer Worker, wenn Invites ablaufen oder Reservierungen frei werden
- **Reservation / Reminder scheduling**: periodische Job-Ausfuehrung fuer Timeout-/Release-Handling und spaetere Reminder-Zustellung
- **Promotion mode policies**: feinere Regeln fuer `auto_finalize` vs. `manual_review`
- **UI-Filterausbau**: Zertifikatsfilter, nur freie Worker, Distanzfilter, score-basierte Presets
- **Conflict policies**: feinere Priorisierung und Eskalation fuer parallele Anfragen ueber mehrere Assignments hinweg

## Berechtigungen

- `assignment.view` — Pflicht für alle Workforce-Endpunkte
- Org-Boundary wird automatisch durchgesetzt (Buyer ODER Supplier der Org)
