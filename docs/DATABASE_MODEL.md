# TempConnect – Datenbank-Modell

**Stand:** 2026-03-05 | **PostgreSQL 16** | **17 Migrations**

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
- `status` TEXT (open | fulfilled | closed)
- SLA-Felder: `sla_started_at`, `sla_minutes`, `sla_due_at`, `sla_status`, `sla_met_at`, `sla_breached_at`

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
- listings 1:N requests
- capacities 1:N capacity_reservations
- capacities 1:N requests
- demand_requests 1:N matches
- demand_requests 1:N offers
- demand_requests 1:N demand_sla_events
- capacity_posts 1:N matches
- sla_search_jobs 1:N sla_search_events
- sla_search_jobs 1:N sla_search_matches
