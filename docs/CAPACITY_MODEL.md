# Capacity Exchange — Data Model

## Table: capacity_posts (extended by migration 021)

### Original Fields (migration 014)
- `id` UUID PK
- `supplier_company_id` UUID FK → users
- `title` TEXT
- `role` TEXT
- `skill_tags` TEXT[]
- `headcount` INT (serves as quantity_available)
- `availability_from` DATE
- `availability_to` DATE (nullable)
- `location_city` TEXT
- `location_postal` TEXT
- `location_lat` NUMERIC
- `location_lng` NUMERIC
- `radius_km` INT
- `price_type` TEXT (hourly/daily/fixed)
- `price_min` NUMERIC
- `price_max` NUMERIC
- `is_active` BOOLEAN (synced with status for backward compat)
- `is_search_agent` BOOLEAN
- `created_at`, `updated_at` TIMESTAMPTZ

### New Fields (migration 021)
- `status` TEXT — draft/active/paused/expired/filled/archived
- `worker_category` TEXT — broad classification (e.g., "Elektrik", "Lager", "CNC")
- `availability_type` TEXT — immediate/scheduled/flexible
- `shift_model` TEXT — day/night/rotating/flexible/weekend/on_call
- `employment_type` TEXT — temporary/contract/temp_to_perm/project/on_call
- `country` TEXT — default 'DE'
- `mobility_notes` TEXT — travel willingness, own transport, etc.
- `qualification_summary` TEXT — free text summary of qualifications
- `certifications_summary` TEXT — certifications held by workers
- `compliance_status` TEXT — unknown/pending/partial/complete
- `notes` TEXT — internal/public notes
- `visibility_status` TEXT — public/plan_gated/vendor_pool_only/private
- `priority_level` TEXT — normal/elevated/urgent
- `valid_until` TIMESTAMPTZ — when this entry expires automatically
- `last_confirmed_at` TIMESTAMPTZ — freshness indicator
- `org_id` UUID FK → organizations (enterprise multi-location)
- `department_id` UUID FK → org_departments
- `created_by` UUID FK → users (the user who created the entry)
- `price_hint` TEXT — display-friendly price indication

## Table: capacity_interactions (new, migration 021)

Tracks company interactions with capacity entries.

- `id` UUID PK
- `capacity_post_id` UUID FK → capacity_posts
- `company_user_id` UUID FK → users
- `interaction_type` TEXT — interest/offer_request/question/save/requisition_link/deal_start/contact
- `message` TEXT (nullable)
- `requisition_id` UUID FK → requisitions (nullable, for linking)
- `created_at` TIMESTAMPTZ

## Status Lifecycle

```
draft → active → paused → active (reactivation)
                → filled → archived
                → expired → active (re-list) or archived
```

## Indexes

- `capacity_posts_status_active_idx` — active entries by updated_at
- `capacity_posts_valid_until_idx` — for auto-expiry queries
- `capacity_posts_worker_category_idx` — category-based feed browsing
- `capacity_posts_org_idx` — enterprise multi-org queries
- `capacity_posts_priority_idx` — priority-based feed ordering
- `capacity_posts_last_confirmed_idx` — freshness-based queries
- `capacity_interactions_post_idx` — interactions per entry
- `capacity_interactions_type_idx` — interaction type queries
