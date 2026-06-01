# TempConnect – Datenbank-Modell

**Stand:** 2026-04-12 | **PostgreSQL 16** | **inkl. Multi-Staffing-, Auto-Backfill- und Waitlist-Erweiterung (Migrationen 087-089)**

---

## ER-Uebersicht (Entity Relationships)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              users (Core)                                │
│  id (UUID PK), role, email, password_hash, company_name, phone,          │
│  is_verified, latitude, longitude, city, postal_code, ...                │
└───────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┘
        │          │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼          ▼
  subscriptions  listings  requests  capacities  capacity_   proofs
  (user_id)     (owner_id) (requester_id, (agency_id) posts    (company_id)
                            receiver_id)          (supplier_
                                                   company_id)
        │          │          │          │          │
        │          │          ▼          ▼          ▼
        │          │   capacity_     capacity   demand_requests
        │          │   reservations  reservations (requester_
        │          │   (capacity_id, (capacity_id) company_id)
        │          │    request_id)               │
        │          │                              ▼
        │          │                         ┌────┴────┐
        │          │                         │ matches  │
        │          │                         │(demand_  │
        │          │                         │ request, │
        │          │                         │ capacity │
        │          │                         │ _post)   │
        │          │                         └────┬────┘
        │          │                              │
        │          │                         ┌────▼────┐
        │          │                         │ offers   │
        │          │                         │(demand_  │
        │          │                         │ request, │
        │          │                         │ supplier)│
        │          │                         └─────────┘
        │          │
        ▼          ▼
  payment_sessions  ratings
  (user_id)        (from_user, to_user)
```
> Hinweis: Die Grafik ist bewusst vereinfacht. Das operative Worker-/Assignment-Modul inkl. Multi-Staffing-Campaigns, Invites und Reservierungen wird weiter unten separat beschrieben.

---

## Tabellen-Referenz

### Core

**users**
- `id` UUID PK
- `role` TEXT (company | agency)
- `email` TEXT UNIQUE NOT NULL
- `password_hash` TEXT NOT NULL
- `company_name` TEXT
- `phone` TEXT
- `is_verified` BOOLEAN
- `latitude` DOUBLE PRECISION (Migration 005)
- `longitude` DOUBLE PRECISION (Migration 005)
- `contact_person`, `street`, `postal_code`, `city`, `vat_id` (Migration 003)
- `handelsregister`, `handelsregister_nr` (Migration 008)

**subscriptions**
- `id` UUID PK
- `user_id` UUID FK → users ON DELETE CASCADE
- `plan` TEXT (FREE | BASIS | PLUS | NOTDIENST)
- `status` TEXT (active | past_due | canceled)
- `stripe_subscription_id` TEXT (Migration 017)

**listings** (Karteikarten)
- `id` UUID PK
- `owner_id` UUID FK → users ON DELETE CASCADE
- `type` TEXT (supply | demand)
- `category` TEXT NOT NULL
- `region` TEXT NOT NULL
- `qty` INT (min 1)
- `start_date` DATE
- `note` TEXT
- `notdienst` BOOLEAN
- `is_active` BOOLEAN
- `postal_code`, `city`, `latitude`, `longitude` (Migration 006)

### Anfragen & Reservierungen

**requests**
- `id` UUID PK
- `listing_id` UUID FK → listings (nullable, XOR mit capacity_id)
- `capacity_id` UUID FK → capacities (nullable, XOR mit listing_id)
- `requester_id` UUID FK → users
- `receiver_id` UUID FK → users
- `status` TEXT (SENT | ACCEPTED | DECLINED | FILLED | FINALIZED | CANCELED)
- `priority` TEXT (NORMAL | NOTDIENST)
- `quantity` INT, `role` TEXT, `region` TEXT
- `deal_id` UUID

**capacity_reservations**
- `id` UUID PK
- `capacity_id` UUID FK → capacities
- `request_id` UUID FK → requests
- `quantity` INT (min 1)
- `expires_at` TIMESTAMPTZ (TTL 30 min)
- `status` TEXT (active | converted | expired)

### Kapazitaeten (Model B)

**capacities**
- `id` UUID PK
- `agency_id` UUID FK → users
- `role` TEXT NOT NULL
- `region` TEXT NOT NULL
- `available_from` DATE NOT NULL
- `available_workers` INT (min 0)
- `tags` TEXT[]
- `hourly_rate_cents` INT
- `is_active` BOOLEAN

### Marketplace (Two-Sided)

**capacity_posts** (Angebote der Zeitarbeitsfirmen)
- `id` UUID PK
- `supplier_company_id` UUID FK → users
- `title`, `role`, `skill_tags` TEXT[]
- `headcount` INT
- `availability_from` DATE, `availability_to` DATE
- `location_city`, `location_postal`, `location_lat`, `location_lng`
- `radius_km` INT (default 25)
- `price_type`, `price_min`, `price_max`
- `is_search_agent` BOOLEAN

**demand_requests** (Bedarfe der Unternehmen)
- `id` UUID PK
- `requester_company_id` UUID FK → users
- `title`, `role`, `skill_tags` TEXT[]
- `headcount` INT
- `start_date` DATE, `end_date` DATE
- `location_city`, `location_postal`, `location_lat`, `location_lng`
- `radius_km` INT (default 25)
- `urgency` TEXT (normal | plus | notdienst)
- `status` TEXT (open | partially_covered | fulfilled | closed | cancelled | expired)
- SLA-Felder: `sla_started_at`, `sla_minutes`, `sla_due_at`, `sla_status`, `sla_met_at`, `sla_breached_at`
- Mengen-/Coverage-Felder: `required_total_count`, `remaining_open_count`, `currently_committed_count`

**matches**
- `id` UUID PK
- `demand_request_id` UUID FK → demand_requests
- `capacity_post_id` UUID FK → capacity_posts
- `match_score` NUMERIC
- `reasons` JSONB
- `status` TEXT (suggested | notified | responded | accepted | rejected)
- UNIQUE (demand_request_id, capacity_post_id)

**offers**
- `id` UUID PK
- `demand_request_id` UUID FK → demand_requests
- `supplier_company_id` UUID FK → users
- `price_type`, `price_value`, `price_min`, `price_max`
- `status` TEXT (draft | sent | accepted | rejected | withdrawn | countered)
- Erweiterte Felder: `offered_quantity`, `offered_hourly_rate`, `validity_until`, etc.

### Operative Einsaetze & Multi-Staffing

**assignments** (operativer Staffing-Container pro Buyer↔Supplier-Deal)
- `id` UUID PK
- `org_id` UUID FK → organizations
- `supplier_org_id` UUID FK → organizations
- `requisition_id`, `deal_request_id`, `demand_request_id`, `offer_id`, `contract_id`
- `worker_description` TEXT
- `worker_count` INT — Kompatibilitaets-/Mirror-Feld fuer bestehende Flows
- `requested_quantity` INT — fachlich angeforderte Slots
- `filled_quantity` INT — final zugewiesene/bestaetigte Slots
- `reserved_quantity` INT — reservierte, noch nicht finalisierte Slots
- `open_quantity` INT — verbleibende offene Slots
- `staffing_status` TEXT (`open` | `sourcing` | `partially_filled` | `filled` | `closed` | `cancelled`)
- `staffing_last_recalculated_at` TIMESTAMPTZ
- `staffing_notes` TEXT
- `status` TEXT (`planned` | `active` | `extended` | `completed` | `cancelled`)

**worker_assignment_links** (finale worker-spezifische Einsatzobjekte)
- `id` UUID PK
- `assignment_id` UUID FK → assignments
- `worker_user_id` UUID FK → users
- `org_id`, `supplier_org_id`, `deal_request_id`, `capacity_post_id`
- `worker_confirmation_status` TEXT (`pending_confirmation` | `auto_confirmed` | `worker_confirmed` | `worker_declined` | `worker_unavailable`)
- operative Einsatzdetails: Zeitraum, Schicht, Kunde, Anweisungen, etc.
- Wichtig: Diese Tabelle repraesentiert die finale worker-seitige Zuordnung, nicht mehr den gesamten Staffing-Bedarf.

**assignment_staffing_campaigns** (Bulk-Outreach / Sammelanfragen)
- `id` UUID PK
- `assignment_id` UUID FK → assignments
- `org_id`, `supplier_org_id`
- `status` TEXT (`draft` | `active` | `completed` | `cancelled` | `auto_stopped`)
- `promotion_mode` TEXT (`auto_finalize` | `manual_review`)
- `reservation_window_minutes` INT
- `target_quantity`, `sent_count`, `viewed_count`, `interested_count`, `accepted_count`, `declined_count`, `expired_count`
- `auto_backfill_enabled` BOOLEAN — Opt-in fuer automatische Nachsteuerung
- `source_campaign_id` UUID FK → assignment_staffing_campaigns — referenziert die urspruengliche Kampagne einer Backfill-Kette
- `last_auto_backfill_at` TIMESTAMPTZ — Cooldown-/Heartbeat-Feld fuer Cron-Nachsteuerung
- `created_by`, `completed_at`, `cancelled_at`

**assignment_staffing_invites** (individueller Status pro angefragtem Worker)
- `id` UUID PK
- `assignment_id` UUID FK → assignments
- `campaign_id` UUID FK → assignment_staffing_campaigns
- `worker_user_id` UUID FK → users
- `status` TEXT (`sent` | `viewed` | `interested` | `accepted` | `declined` | `expired` | `cancelled`)
- `score` NUMERIC, `score_reasons` JSONB — enthaelt den erklaerbaren Suggestion-Snapshot (Hard-Fails, Missing Criteria, Factor Scores, Reasons)
- `request_snapshot` JSONB — strukturierter Worker-Kontext (Titel, Rolle, Ort, Start, Dauer/Schicht, Verguetung, Antwortfrist, root campaign reference)
- Delivery-Felder: `delivery_status`, `delivery_attempt_count`, `delivery_last_attempt_at`, `delivery_last_success_at`, `delivery_last_error`
- Reminder-/Interaktions-Felder: `remind_after`, `reminder_requested_at`, `last_reminder_sent_at`, `reminder_count`, `last_worker_action_at`
- `personal_message`, `response_note`
- `expires_at`, `sent_at`, `viewed_at`, `responded_at`, `accepted_at`, `declined_at`, `cancelled_at`, `expired_at`

**assignment_staffing_messages** (request-gebundene Worker-/Dispatcher-Kommunikation)
- `id` UUID PK
- `assignment_id` UUID FK → assignments
- `campaign_id` UUID FK → assignment_staffing_campaigns
- `invite_id` UUID FK → assignment_staffing_invites
- `worker_user_id` UUID FK → users
- `actor_id` UUID FK → users
- `sender_role` TEXT (`worker` | `dispatcher` | `system`)
- `message_type` TEXT (`question` | `reminder_request` | `reminder_sent` | `status_update`)
- `body` TEXT
- `meta` JSONB
- `created_at` TIMESTAMPTZ

**assignment_staffing_waitlist** (persistente Nachruecker-/Queue-Kandidaten pro Assignment-Kette)
- `id` UUID PK
- `assignment_id` UUID FK → assignments
- `root_campaign_id` UUID FK → assignment_staffing_campaigns — gemeinsame Kampagnenkette fuer manuelle Wellen und Auto-Backfill
- `source_campaign_id` UUID FK → assignment_staffing_campaigns — optionale Herkunft der ersten Outreach-Welle
- `worker_user_id` UUID FK → users
- `status` TEXT (`queued` | `invited` | `reserved` | `assigned` | `removed`)
- `queue_rank` INT — stabile operative Reihenfolge fuer Nachruecker-Wellen
- `score` NUMERIC
- `suggestion_snapshot` JSONB — gespeicherter Score-/Reason-Snapshot zum Queue-Zeitpunkt
- `queued_at`, `invited_at`, `reserved_at`, `assigned_at`, `removed_at` TIMESTAMPTZ
- `removal_reason` TEXT
- UNIQUE (`assignment_id`, `worker_user_id`)

**assignment_staffing_reservations** (slot-bezogene Reservierung vor/waehrend Finalisierung)
- `id` UUID PK
- `assignment_id` UUID FK → assignments
- `campaign_id` UUID FK → assignment_staffing_campaigns
- `invite_id` UUID FK → assignment_staffing_invites
- `worker_user_id` UUID FK → users
- `status` TEXT (`reserved` | `promoted` | `released` | `expired`)
- `expires_at`, `reserved_at`, `released_at`, `release_reason`
- `promoted_at`, `promoted_link_id` FK → worker_assignment_links

**assignment_staffing_events** (append-only Staffing-Audit/Event-Log)
- `id` UUID PK
- `assignment_id` UUID FK → assignments
- optionale FK-Verknuepfungen zu Campaign, Invite, Reservation
- `event_type` TEXT — inkl. `invite_delivery_queued`, `invite_delivered`, `invite_delivery_failed`, `invite_reminder_requested`, `invite_reminder_sent`, `worker_question_asked`, `waitlist_queued`, `waitlist_invited`, `waitlist_reserved`, `waitlist_assigned`, `waitlist_removed`
- `actor_id` UUID FK → users
- `old_values`, `new_values` JSONB
- `created_at` TIMESTAMPTZ

**Fachregel**
- Ein `demand_request` oder Deal mit `quantity/headcount > 1` wird operativ nicht mehr zu einem einzelnen Worker-Link reduziert.
- Stattdessen entsteht genau **ein** `assignment` als Staffing-Container, darunter beliebig viele `assignment_staffing_invites` / `assignment_staffing_reservations` und final mehrere `worker_assignment_links`.
- Die manuelle Einzelzuweisung bleibt moeglich, laeuft aber ueber denselben Container und dieselben Mengenfelder.
- Auto-Backfill ist bewusst opt-in auf Kampagnenebene, damit kuratierte manuelle Bulk-Aktionen nicht ungefragt in eine automatische Nachsteuerung uebergehen.
- Die persistente `assignment_staffing_waitlist` haengt an derselben `root_campaign_id`, damit manuelle Queueing-Aktionen, Nachruecker-Wellen und spaetere Auto-Backfill-Laeufe dieselbe Kandidatenkette fortsetzen koennen.
- Invite-/Reservation-/Assignment-Lifecycle aktualisiert die Waitlist mit: `queued -> invited -> reserved -> assigned`; nicht mehr nutzbare Kandidaten wechseln mit Begruendung nach `removed`.
- Worker-seitige Mehrfachanfragen werden ueber `request_snapshot` + `assignment_staffing_messages` als zusammenhaengende Einsatzanfragen modelliert, statt als lose Einzelnotifications ohne Bedarfskontext.
- Die Delivery-/Reminder-Felder auf `assignment_staffing_invites` erlauben queue-basierte Zustellung, Retry-Tracking und spaetere Reminder, ohne den Invite-Lifecycle vom eigentlichen Staffing-Status zu entkoppeln.

### SLA / Compliance / Monitoring

**sla_events** — Audit-Trail fuer Request-SLA
**demand_sla_events** — Audit-Trail fuer Demand-SLA
**request_compliance** — Compliance-Bewertung pro Request
**supplier_metrics** — Scorecard-KPIs pro Agentur (30d/90d)

### Suchauftraege

**sla_search_jobs** — Persistente Suchauftraege mit SLA
**sla_search_events** — Audit-Trail fuer Suchauftrags-SLA
**sla_search_matches** — Treffer pro Suchauftrag
**match_alerts** — Benachrichtigungen bei neuen Matches

### Payment

**payment_sessions**
- `id` UUID PK
- `user_id` UUID FK → users
- `plan` TEXT, `amount` NUMERIC, `method` TEXT
- `stripe_session_id` TEXT, `stripe_subscription_id` TEXT
- `status` TEXT (pending | paid | completed | failed)

### Trust

**proofs** — Nachweise pro Firma (pending | verified | rejected)
**ratings** — Bewertungen (from_user → to_user, 1-5 Sterne)
**reports** — Meldungen

### System

**idempotency_keys** — Replay-Schutz fuer Write-Endpoints
**_migrations** — Angewandte Migrationen
**session** — Express-Session-Store (connect-pg-simple)

---

## Beziehungen (Foreign Keys)

- users 1:N subscriptions
- users 1:N listings
- users 1:N requests (als requester + receiver)
- users 1:N capacities (als agency)
- users 1:N capacity_posts (als supplier)
- users 1:N demand_requests (als requester)
- users 1:N offers (als supplier)
- users 1:N proofs
- organizations 1:N assignments (als buyer + supplier)
- listings 1:N requests
- capacities 1:N capacity_reservations
- capacities 1:N requests
- demand_requests 1:N matches
- demand_requests 1:N offers
- demand_requests 1:N demand_sla_events
- demand_requests 1:N assignments
- capacity_posts 1:N matches
- capacity_posts 1:N worker_assignment_links
- offers 1:N assignments (operativ i.d.R. 1:1-Container, aber nicht 1:1 zu Worker)
- assignments 1:N worker_assignment_links
- assignments 1:N assignment_staffing_campaigns
- assignments 1:N assignment_staffing_invites
- assignments 1:N assignment_staffing_messages
- assignments 1:N assignment_staffing_waitlist
- assignments 1:N assignment_staffing_reservations
- assignments 1:N assignment_staffing_events
- assignment_staffing_campaigns 1:N assignment_staffing_invites
- assignment_staffing_invites 1:N assignment_staffing_messages
- assignment_staffing_campaigns 1:N assignment_staffing_waitlist (root/source)
- assignment_staffing_campaigns 1:N assignment_staffing_reservations
- sla_search_jobs 1:N sla_search_events
- sla_search_jobs 1:N sla_search_matches

---

## Enterprise Additions (Phase 6–11)

### B2B Invoicing (Migration 030)

**`invoices`**
- `id` UUID PK DEFAULT gen_random_uuid()
- `invoice_number` TEXT UNIQUE (TC-YYYY-NNNNNN via sequence `invoice_number_seq`)
- `org_id` FK → organizations (nullable)
- `user_id` FK → users (nullable)
- `amount` NUMERIC(12,2) NOT NULL
- `currency` CHAR(3) DEFAULT 'EUR'
- `status` TEXT — DRAFT → SENT → PAID → OVERDUE → VOID
- `description` TEXT
- `due_date` DATE
- `payment_session_id`, `stripe_payment_intent_id` TEXT
- `issued_at`, `paid_at`, `voided_at`, `created_at` TIMESTAMPTZ

**`invoice_line_items`**
- `id` UUID PK
- `invoice_id` FK → invoices ON DELETE CASCADE
- `description` TEXT, `quantity` NUMERIC, `unit_amount` NUMERIC(12,2), `amount` NUMERIC(12,2)

### Enterprise Org Model

**`organizations`** (extended)
- `id` SERIAL PK
- `name`, `slug` TEXT
- `plan` TEXT (FREE, BASIS, PLUS, NOTDIENST)
- `owner_id` FK → users
- `settings` JSONB

**`org_memberships`**
- `org_id` FK → organizations, `user_id` FK → users
- `role` TEXT (ADMIN, MEMBER, VIEWER, FINANCE)
- UNIQUE(org_id, user_id)

**`audit_log`**
- `id` BIGSERIAL PK
- `user_id`, `org_id`, `action`, `entity_type`, `entity_id`
- `old_values`, `new_values` JSONB
- `ip_address`, `user_agent`, `created_at`

**`notifications`**
- `id` UUID PK, `user_id`, `org_id`
- `type`, `title`, `message`, `read` BOOLEAN
- `action_url`, `created_at`

### Row-Level Security (Migration 031)

RLS enabled on: `requisitions`, `timesheets`, `invoices`, `org_memberships`, `vendor_pool_entries`, `compliance_documents`.

Policy pattern: `USING (org_id = current_org_id())` where `current_org_id()` reads the session-local variable set via `SET LOCAL app.current_org_id = $1`.

Bypassed for: service role, admin connections.

### Performance Indexes (Migration 032)

| Table | Columns | Type |
|-------|---------|------|
| `requisitions` | `(org_id, status)` | B-tree |
| `requisitions` | `(status, urgency, created_at DESC)` | B-tree |
| `requisitions` | `search_vector` | GIN |
| `capacity_posts` | `(lat, lng)` | B-tree |
| `capacity_posts` | `search_vector` | GIN |
| `worker_time_submissions` | `(deal_id, week_start)` | B-tree |
| `org_memberships` | `(org_id, user_id)` | B-tree |
| `audit_log` | `(user_id, created_at DESC)` | B-tree |
| `invoices` | `(org_id, status, due_date)` | B-tree |
| `notifications` | `(user_id, read, created_at DESC)` | B-tree |
