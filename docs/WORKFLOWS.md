# TempConnect — Workflow & State Machine Reference

Dieses Dokument beschreibt alle State Machines der Plattform.
Implementierung: `api/services/stateMachine.js`, `api/services/capacityWorkflow.js`, `api/services/dealWorkflow.js`

---

## 1. Request Workflow (Legacy)

**Entity**: `requests` Tabelle
**Service**: `stateMachine.js` → `REQUEST_TRANSITIONS`

```
SENT → ACCEPTED → FILLED
                → FINALIZED
     → DECLINED (terminal)
     → CANCELED (terminal)
```

**Uebergaenge**:
- SENT → ACCEPTED / DECLINED / CANCELED
- ACCEPTED → FINALIZED / FILLED / CANCELED
- DECLINED, FILLED, FINALIZED, CANCELED = Terminal

---

## 2. Deal Workflow (Extended)

**Entity**: `requests` Tabelle (erweiterter Lifecycle)
**Service**: `dealWorkflow.js`

```
CREATED → OFFER_SENT → ACCEPTED → CONFIRMED → ASSIGNMENT_STARTED → COMPLETED
                     → DECLINED (terminal)
          Any non-terminal → CANCELLED
```

**Uebergaenge**:
- CREATED → OFFER_SENT / CANCELLED
- OFFER_SENT → ACCEPTED / DECLINED / CANCELLED
- ACCEPTED → CONFIRMED / CANCELLED
- CONFIRMED → ASSIGNMENT_STARTED / CANCELLED
- ASSIGNMENT_STARTED → COMPLETED / CANCELLED
- COMPLETED, DECLINED, CANCELLED = Terminal

**Event Tracking**: offer_submitted, deal_completed, deal_cancelled, assignment_started

---

## 3. Requisition Workflow

**Entity**: `requisitions` Tabelle
**Service**: `requisitionService.js`

```
DRAFT → PENDING_APPROVAL → APPROVED → OPEN → IN_REVIEW → SHORTLISTED → FILLED → CLOSED
                                                                      → CANCELLED
```

**Uebergaenge**:
- DRAFT → PENDING_APPROVAL / OPEN / CANCELLED
- PENDING_APPROVAL → APPROVED / CANCELLED
- APPROVED → OPEN / CANCELLED
- OPEN → IN_REVIEW / FILLED / CLOSED / CANCELLED
- IN_REVIEW → SHORTLISTED / OPEN / FILLED / CLOSED / CANCELLED
- SHORTLISTED → FILLED / IN_REVIEW / CLOSED / CANCELLED
- FILLED → CLOSED
- CLOSED, CANCELLED = Terminal

**Approval Flow**: Requisitions mit Approval-Pflicht gehen ueber PENDING_APPROVAL.
**Distribution**: Nach OPEN wird der SupplierPoolService fuer stufenweise Verteilung genutzt.

---

## 4. Capacity Post Workflow

**Entity**: `capacity_posts` Tabelle
**Service**: `capacityWorkflow.js`

```
draft → active → paused → active (re-activate)
               → filled → archived
               → expired → active (re-activate)
                         → archived
```

**Uebergaenge**:
- draft → active
- active → paused / filled / expired
- paused → active / archived
- filled → archived
- expired → active / archived
- archived = Terminal

**Validierung**: Activation erfordert title, role, availability_from, location_city, headcount >= 1, valid_until in der Zukunft.
**Auto-Expiry**: Background-Worker prueft valid_until und setzt abgelaufene Eintraege auf 'expired'.
**Stale-Check**: Eintraege ohne Bestaetigung seit >7 Tagen werden als stale markiert.

---

## 5. Reservation Workflow

**Entity**: `capacity_reservations` Tabelle
**Service**: `stateMachine.js` → `RESERVATION_TRANSITIONS`

```
active → converted
       → expired
```

**Uebergaenge**:
- active → converted / expired
- converted, expired = Terminal

**Auto-Expiry**: Cron-Job (`/api/internal/expire-reservations`) setzt abgelaufene Reservierungen auf 'expired'.

---

## 6. Submission Workflow

**Entity**: `submissions` Tabelle
**Service**: `stateMachine.js` → `SUBMISSION_TRANSITIONS`

```
DRAFT → SUBMITTED → UNDER_REVIEW → ACCEPTED
                                  → REJECTED
       → WITHDRAWN (von jedem non-terminal Status)
```

**Uebergaenge**:
- DRAFT → SUBMITTED / WITHDRAWN
- SUBMITTED → UNDER_REVIEW / WITHDRAWN
- UNDER_REVIEW → ACCEPTED / REJECTED / WITHDRAWN
- ACCEPTED, REJECTED, WITHDRAWN = Terminal

**Zweck**: Supplier reichen Kandidaten fuer offene Requisitions ein.
Buyer prueft und akzeptiert/lehnt ab.

---

## 7. Compliance Document Lifecycle

**Entity**: `compliance_documents` Tabelle
**Service**: `complianceDocService.js`

```
pending → verified
        → rejected
        → expired (auto, via Batch-Job)
```

**Ampellogik**:
- Gruen: > 30 Tage bis Ablauf
- Gelb: <= 30 Tage bis Ablauf
- Rot: Abgelaufen
- Grau: Kein Ablaufdatum

**Reminder**: Cron-Job findet Dokumente mit nahendem Ablauf und sendet Erinnerungen.
**Batch-Expire**: `expireBatch()` setzt abgelaufene Dokumente automatisch auf 'expired'.

---

## Integrationspunkte

### Audit Logging
Alle State-Machine-Transitions werden in `audit_log` geschrieben via `logTransition()`.

### Event Tracking
Wichtige Transitions werden als Platform Events in `platform_events` gespeichert via `eventTrackingService.trackEvent()`.

### Notification Matrix
Status-Wechsel loesen Benachrichtigungen aus via `notificationMatrix.dispatch()`.

### Domain Event Logger
Alle Transitions werden strukturiert geloggt via `utils/logger.js` → `domainLogger`.
