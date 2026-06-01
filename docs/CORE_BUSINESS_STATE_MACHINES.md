# Core Business State Machines
> Erstellt: 2026-05-24 | WAVE_04 | Quellen: `api/services/stateMachine.js`, `api/services/requisitionService.js`, `api/services/assignmentService.js`, `api/services/timesheetService.js`

Dieses Dokument ist die kanonische Referenz fuer alle Lifecycle-Statusmodelle in TempConnect.
Abweichungen zwischen Code und diesem Dokument sind Bugs — Code hat Vorrang.

---

## Uebersicht

| Entity          | Startpunkt          | Terminale Zustaende                    | Impl.-Datei              |
|-----------------|---------------------|----------------------------------------|--------------------------|
| Requisition     | `DRAFT`             | `FILLED`, `CLOSED`, `CANCELLED`        | `requisitionService.js`  |
| Deal            | `CREATED`           | `COMPLETED`, `DECLINED`, `CANCELLED`   | `stateMachine.js`        |
| Agreement       | `none`              | `cancelled`, `expired`                 | `stateMachine.js`        |
| Assignment      | `planned`           | `completed`, `cancelled`               | `assignmentService.js`   |
| Timesheet       | `draft`             | `approved`, `cancelled`                | `timesheetService.js`    |
| Submission      | `DRAFT`             | `ACCEPTED`, `REJECTED`, `WITHDRAWN`    | `stateMachine.js`        |
| Offer           | `draft`             | `accepted`, `rejected`, `withdrawn`    | `stateMachine.js`        |
| Capacity Post   | `draft`             | `archived`                             | `stateMachine.js`        |

---

## 1. Requisition

**Kontext:** Bedarfsanforderung einer Company (Buyer). Startet als interner Entwurf,
geht optional durch einen Freigabe-Workflow, wird dann offen fuer Matching.

```
DRAFT ──────────────────────────────── CANCELLED
  │                                        ▲
  ├─► PENDING_APPROVAL ──► CANCELLED       │
  │       │                                │
  │       ▼                                │
  │     APPROVED ──────────────────────────┤
  │       │                                │
  └───────▼                                │
        OPEN ─────────────────────────────┤
          │                                │
          ├─► IN_REVIEW ─────────────────┤ │
          │       │                      │ │
          │       ├─► SHORTLISTED ───────┤ │
          │       │       │              │ │
          │       └───┬───┼──► PARTIALLY_FILLED ──┐
          │           │   │       │                │
          │           │   └───────┼──► FILLED      │
          │           │           │       │        │
          └───────────┘           ▼       ▼       │
                                CLOSED ◄──┘ ◄─────┘
                                           │
        CANCELLED ◄────────────────────────┘
```

**Uebergangsmatrix:**

| Von                | Nach (erlaubt)                                              |
|--------------------|-------------------------------------------------------------|
| `DRAFT`            | `PENDING_APPROVAL`, `OPEN`, `CANCELLED`                    |
| `PENDING_APPROVAL` | `APPROVED`, `CANCELLED`                                    |
| `APPROVED`         | `OPEN`, `CANCELLED`                                        |
| `OPEN`             | `IN_REVIEW`, `PARTIALLY_FILLED`, `FILLED`, `CLOSED`, `CANCELLED` |
| `IN_REVIEW`        | `SHORTLISTED`, `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CLOSED`, `CANCELLED` |
| `SHORTLISTED`      | `PARTIALLY_FILLED`, `FILLED`, `IN_REVIEW`, `CLOSED`, `CANCELLED` |
| `PARTIALLY_FILLED` | `FILLED`, `OPEN`, `IN_REVIEW`, `CLOSED`, `CANCELLED`       |
| `FILLED`           | `CLOSED`                                                   |
| `CLOSED`           | —                                                          |
| `CANCELLED`        | —                                                          |

**Besondere Felder bei Uebergaengen:**
- `APPROVED` → setzt `approved_by`, `approved_at`
- `PARTIALLY_FILLED` → Migration 113 (2026-05-24): einige, aber nicht alle Headcount-Positionen besetzt
- `FILLED` → setzt `filled_at`
- `CLOSED` → setzt `closed_at`
- `CANCELLED` → setzt `cancelled_at`, optional `cancel_reason`

**Bekannte Luecken:**
- Kein automatisches Zuruecksetzen aus `FILLED` → `OPEN` bei Assignment-Stornierung (P2).

---

## 2. Deal

**Kontext:** Deal = verbindliche Vereinbarung zwischen Company und Agency ueber eine
Kapazitaetsvermittlung. Entsteht nach Market-Matching, endet mit abgeschlossenem Einsatz.

```
CREATED ──► OFFER_SENT ──► ACCEPTED ──► CONFIRMED ──► ASSIGNMENT_STARTED ──► COMPLETED
    │            │              │              │                  │
    │            │              │              │                  │
    └────────────┴──────────────┴──────────────┴──────────────────┘
                                  ▼
                              CANCELLED / DECLINED
```

**Uebergangsmatrix:**

| Von                 | Nach (erlaubt)                           |
|---------------------|------------------------------------------|
| `CREATED`           | `OFFER_SENT`, `CANCELLED`                |
| `OFFER_SENT`        | `ACCEPTED`, `DECLINED`, `CANCELLED`      |
| `ACCEPTED`          | `CONFIRMED`, `CANCELLED`                 |
| `CONFIRMED`         | `ASSIGNMENT_STARTED`, `CANCELLED`        |
| `ASSIGNMENT_STARTED`| `COMPLETED`, `CANCELLED`                 |
| `COMPLETED`         | —                                        |
| `DECLINED`          | —                                        |
| `CANCELLED`         | —                                        |

**Hinweis:** Deal-Transitionen sind eng mit dem Agreement-Lifecycle verknuepft.
`CONFIRMED` entspricht in der Regel `agreement.activated`.

---

## 3. Agreement

**Kontext:** Agreement steht auf `offers.agreement_status` und bildet den rechtlich
bindenden Bestaetigungsprozess einer Vermittlungsvereinbarung ab.

```
none ──► pending_confirmation ──► confirmed ──► activated
                │                      │             │
                │                      │             ▼
                └──────────────────────┴──────── cancelled
                         │
                         ▼
                       expired
```

**Uebergangsmatrix:**

| Von                   | Nach (erlaubt)                          |
|-----------------------|-----------------------------------------|
| `none`                | `pending_confirmation`                  |
| `pending_confirmation`| `confirmed`, `cancelled`, `expired`     |
| `confirmed`           | `activated`, `cancelled`                |
| `activated`           | `cancelled` *(Welle 7 — Phase 9)*       |
| `cancelled`           | —                                       |
| `expired`             | —                                       |

**Welle-7-Ergaenzung (Phase 9):** `activated → cancelled` freigeschaltet.
Bei Storno dreht `cancelAgreement()` Staffing-Reservations, Invites und das zugehoerige
Assignment automatisch zurueck.

---

## 4. Assignment

**Kontext:** Einsatz eines Workers bei einem Kunden. Wird aus einem Deal heraus erstellt,
hat eigene Statusführung fuer den operativen Zeitraum.

```
planned ──► active ──► completed
    │           │
    │           ├──► cancelled
    │           └──► extended (→ bleibt active)
    └──────────────► cancelled
```

**Uebergangsmatrix:**

| Von       | Nach (erlaubt)                          |
|-----------|-----------------------------------------|
| `planned` | `active`, `cancelled`                   |
| `active`  | `completed`, `cancelled`, `extended`    |
| `completed`| —                                      |
| `cancelled`| —                                      |

**Hinweis zu `extended`:** `extended` ist kein eigener Zielstatus in der DB — es setzt
`planned_end_date` zurueck und haelt den Status auf `active`.

**Bekannte Luecken:**
- Kein `PAUSED`-Status fuer temporaere Unterbrechungen (z.B. Krankheit).
- Kein `DISPUTED`-Status fuer strittige Abrechnungen.
- Kein automatischer Rueckpfad zu Requisition bei Assignment-Storno
  (Headcount bleibt in `FILLED`, auch wenn Assignment storniert wurde).

---

## 5. Timesheet

**Kontext:** Stundenzettel fuer einen Einsatz, wochenweise. Feature-gated (PRO/ENTERPRISE).
Geld fliesst erst, wenn der Timesheet `approved` ist.

```
draft ──► submitted ──► approved (terminal, kein Rueck-Weg)
  ▲             │
  │             ├──► rejected ──► draft (Korrektur-Loop)
  │             └──► draft (Rueckzug vor Freigabe)
  └──────────────────────────────────────────────
cancelled (von draft oder submitted moeglich)
```

**Uebergangsmatrix:**

| Von         | Nach (erlaubt)                   |
|-------------|----------------------------------|
| `draft`     | `submitted`, `cancelled`         |
| `submitted` | `approved`, `rejected`, `draft`  |
| `approved`  | — *(gesperrt)*                   |
| `rejected`  | `draft`                          |
| `cancelled` | —                                |

**Spend-Definition (kanonisch):**
```
Actual Spend = SUM(timesheet.total_hours × assignment.hourly_rate_cents)
               WHERE timesheet.status = 'approved'
Overtime     = SUM(timesheet.overtime_hours × assignment.hourly_rate_cents × 1.25)
```

**Bekannte Luecken:**
- Kein `INVOICED`-Status nach `approved` — Rechnungsstellung ist nicht im Statusmodell abgebildet.
- Kein `DISPUTED`-Status fuer streitige Stunden.

---

## 6. Submission (Kandidaten-Einreichung)

**Kontext:** Bewerbung / Vorschlag eines Workers fuer eine Requisition.
Liegt auf der Kandidaten-Shortlist der Requisition.

```
DRAFT ──► SUBMITTED ──► UNDER_REVIEW ──► ACCEPTED (terminal)
    │           │                │
    │           │                └──► REJECTED (terminal)
    └───────────┴────────────────────► WITHDRAWN (terminal)
```

**Uebergangsmatrix:**

| Von            | Nach (erlaubt)                         |
|----------------|----------------------------------------|
| `DRAFT`        | `SUBMITTED`, `WITHDRAWN`               |
| `SUBMITTED`    | `UNDER_REVIEW`, `WITHDRAWN`            |
| `UNDER_REVIEW` | `ACCEPTED`, `REJECTED`, `WITHDRAWN`    |
| `ACCEPTED`     | —                                      |
| `REJECTED`     | —                                      |
| `WITHDRAWN`    | —                                      |

---

## 7. Offer (Kapazitaetsangebot)

**Kontext:** Angebot einer Agency fuer eine offene Kapazitaet im Marktplatz.
Kann hin- und hergehen (countered) bis zur Einigung oder zum Rueckzug.

```
draft ──► sent ──► accepted (terminal)
  │          │
  │          ├──► rejected (terminal)
  │          ├──► countered ──► sent (Verhandlungsschleife)
  │          └──► withdrawn
  └──────────────► withdrawn (terminal)
```

**Uebergangsmatrix:**

| Von        | Nach (erlaubt)                          |
|------------|-----------------------------------------|
| `draft`    | `sent`, `withdrawn`                     |
| `sent`     | `accepted`, `rejected`, `countered`, `withdrawn` |
| `countered`| `sent`, `withdrawn`                     |
| `accepted` | —                                       |
| `rejected` | —                                       |
| `withdrawn`| —                                       |

---

## 8. Capacity Post (Kapazitaetsbeitrag)

**Kontext:** Von einer Agency eingestellte Kapazitaet (verfuegbare Worker-Slots)
im Marktplatz. Lebenszyklus von Entwurf bis zur Archivierung.

```
draft ──► active ──► paused ──► active (wieder aktiv)
               │        └──────────────────► archived
               ├──► reserved ──► active
               │         └────► filled ──► archived
               ├──► filled ──────────────► archived
               └──► expired ──► active
                        └─────► archived
```

**Uebergangsmatrix:**

| Von        | Nach (erlaubt)                                |
|------------|-----------------------------------------------|
| `draft`    | `active`                                      |
| `active`   | `paused`, `filled`, `expired`, `reserved`     |
| `reserved` | `active`, `filled`, `archived`                |
| `paused`   | `active`, `archived`                          |
| `filled`   | `archived`                                    |
| `expired`  | `active`, `archived`                          |
| `archived` | —                                             |

---

## Ergaenzende Modelle (unternehmensintern)

### Request (Legacy-Matching)

| Von        | Nach (erlaubt)                              |
|------------|---------------------------------------------|
| `SENT`     | `ACCEPTED`, `DECLINED`, `CANCELED`          |
| `ACCEPTED` | `FINALIZED`, `FILLED`, `CANCELED`           |
| `DECLINED` | —                                           |
| `FILLED`   | —                                           |
| `FINALIZED`| —                                           |
| `CANCELED` | —                                           |

### Reservation (Kapazitaets-Reservierung)

| Von         | Nach (erlaubt)      |
|-------------|---------------------|
| `active`    | `converted`, `expired` |
| `converted` | —                   |
| `expired`   | —                   |

---

## Cross-Cutting Concerns

### Audit-Logging
Alle Transitionen schreiben Audit-Events. Quellen:
- `stateMachine.logTransition()` → `audit_log`
- `requisitionService.writeEvent()` → `requisition_events`
- `timesheetService` → via `auditLog.writeAudit()` in `withTransaction`
- `assignmentService` → via `auditLog.writeAudit()`

### Org-Boundary
Alle mutativen Transitions-Endpunkte pruefen Org-Boundary (getestet in
`api/test/security/coreFlowCrossTenant.test.js` und `api/test/security/org-isolation.test.js`).

### Feature-Gates
- Timesheets: PLUS/PRO/INDIVIDUELL (`hasFeature(plan, "timesheets")`)
- emergency_staffing: BASIS (1x/Monat) / PLUS / PRO / INDIVIDUELL (`hasFeature(plan, "emergency_staffing")`) — OE-08 2026-05-27
- Assignments: PLUS oder hoeher
- Requisitions: keine Plan-Sperre, aber RBAC (`requisition.create`)

---

## Offene Punkte (Backlog)

| # | Entity      | Fehlendes Feature                          | Aufwand | Prioritaet | Status                        |
|---|-------------|--------------------------------------------|---------|------------|-------------------------------|
| 1 | Requisition | `PARTIALLY_FILLED` Status                  | 1 Tag   | P2         | ✅ ERLEDIGT 2026-05-24 (Mig. 113) |
| 2 | Requisition | Auto-Ruecksetzen aus FILLED bei Storno     | 0.5 Tag | P2         | OFFEN                         |
| 3 | Assignment  | `PAUSED` / `DISPUTED` Status               | 1 Tag   | P2         | OFFEN                         |
| 4 | Assignment  | Rueckpfad zu Requisition bei Storno        | 0.5 Tag | P2         | OFFEN                         |
| 5 | Timesheet   | `INVOICED` Status nach APPROVED            | 1 Tag   | P2         | OFFEN                         |
| 6 | Timesheet   | `DISPUTED` Status                          | 0.5 Tag | P2         | OFFEN                         |

Punkte 2–6 sind P2 — keine Go-Live-Blocker, aber relevant fuer die erste Pilotwelle.
