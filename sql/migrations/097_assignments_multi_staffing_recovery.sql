-- =============================================================================
-- Migration 097: Schema-Drift-Recovery fuer Kapazitaets-Feed + Dealakte
-- -----------------------------------------------------------------------------
-- In manchen Umgebungen wurden Migrationen 084+087 als "applied" im _migrations-
-- Tracker verbucht, ohne dass alle Spaltenerweiterungen persistiert wurden
-- (haeufige Ursache: Transaktions-Rollback durch den notifications_type_check-
-- CHECK-Constraint, der zuvor "deal_conditions_accepted" nicht whitelistete;
-- oder weil eine CREATE TABLE IF NOT EXISTS auf einer bereits vorhandenen
-- Alt-Tabelle die neuen Spalten nicht ergaenzt).
--
-- Symptome:
--  * capacity_exchange-Feed: 500 "column a.offer_id does not exist" in
--    capacityExchangeService.getCapacityCommercialStates
--  * offer_detail.html / Dealakte: 500 "column dd.asset_id does not exist" in
--    dealDossierService.getDossier
--
-- Diese Migration stellt die erwarteten Spalten idempotent wieder her, ohne die
-- staffing_*-Tabellen (die 088-096 ohnehin aufbauen) und ohne den
-- notifications_type_check anzutasten. Gegenseitenorientierter Feed + Dealakte
-- laufen anschliessend wieder durch; 087/088/... Staffing-Funktionalitaet kann
-- danach separat nachgezogen werden, falls noetig.
-- =============================================================================

BEGIN;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demand_request_id UUID REFERENCES demand_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_quantity INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS filled_quantity INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_quantity INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_quantity INT,
  ADD COLUMN IF NOT EXISTS staffing_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS staffing_last_recalculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staffing_notes JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Backfill: bestehende Rows erhalten konsistente requested_quantity aus worker_count
UPDATE assignments
   SET requested_quantity = COALESCE(requested_quantity, NULLIF(worker_count, 0), 1)
 WHERE requested_quantity IS NULL;

-- Backfill: open_quantity aus filled/reserved/requested ableiten
UPDATE assignments
   SET open_quantity = GREATEST(
         COALESCE(requested_quantity, worker_count, 1)
         - COALESCE(filled_quantity, 0)
         - COALESCE(reserved_quantity, 0),
         0
       )
 WHERE open_quantity IS NULL;

CREATE INDEX IF NOT EXISTS assignments_offer_idx
  ON assignments(offer_id)
  WHERE offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assignments_demand_request_idx
  ON assignments(demand_request_id)
  WHERE demand_request_id IS NOT NULL;

-- deal_documents: Schema-Drift aus Migration 084 ausgleichen
ALTER TABLE deal_documents
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES offer_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agreement_ref TEXT,
  ADD COLUMN IF NOT EXISTS agreement_version INT,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- deal_documents.status: Alt-Constraint zuliess 'active','superseded','archived','deleted',
-- die 084er Anwendung schreibt aber 'current','superseded','archived'. Ohne diesen Fix
-- schlaegt der allererste INSERT im createAgreement-Flow mit deal_documents_status_check
-- fehl, die Transaktion geraet in ABORTED-State und COMMIT rollt alles zurueck – der
-- "Einsatzvereinbarung erstellen"-Button lieferte HTTP 200, aber offers.agreement_status
-- blieb NULL, sodass der naechste Schritt nie sichtbar wurde.
ALTER TABLE deal_documents
  DROP CONSTRAINT IF EXISTS deal_documents_status_check;
ALTER TABLE deal_documents
  ADD CONSTRAINT deal_documents_status_check
  CHECK (status IN ('current','superseded','archived'));

-- assignment_staffing_*: vollstaendige Side-Tabellen nachziehen.
-- Ohne diese Tabellen bricht jeder Staffing-Pfad (getOpenDealAssignments/
-- listAssignmentSuggestions/assignDealToWorker/recalcAssignmentStaffing)
-- mit "relation assignment_staffing_reservations does not exist" ab.
CREATE TABLE IF NOT EXISTS assignment_staffing_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','completed','auto_stopped','cancelled')),
  promotion_mode TEXT NOT NULL DEFAULT 'auto_finalize'
    CHECK (promotion_mode IN ('auto_finalize','manual_review')),
  reservation_window_minutes INT NOT NULL DEFAULT 30
    CHECK (reservation_window_minutes BETWEEN 1 AND 10080),
  target_quantity INT CHECK (target_quantity IS NULL OR target_quantity >= 1),
  sent_count INT NOT NULL DEFAULT 0,
  viewed_count INT NOT NULL DEFAULT 0,
  interested_count INT NOT NULL DEFAULT 0,
  accepted_count INT NOT NULL DEFAULT 0,
  declined_count INT NOT NULL DEFAULT 0,
  expired_count INT NOT NULL DEFAULT 0,
  cancelled_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_staffing_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES assignment_staffing_campaigns(id) ON DELETE CASCADE,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','viewed','interested','declined','accepted','expired','cancelled')),
  score NUMERIC(6,2),
  score_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  personal_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  interested_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  response_note TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, worker_user_id)
);
CREATE INDEX IF NOT EXISTS staffing_invites_assignment_idx
  ON assignment_staffing_invites(assignment_id, status, sent_at DESC);
CREATE INDEX IF NOT EXISTS staffing_invites_worker_idx
  ON assignment_staffing_invites(worker_user_id, status, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS staffing_invites_assignment_worker_open_uniq
  ON assignment_staffing_invites(assignment_id, worker_user_id)
  WHERE status IN ('sent','viewed','interested','accepted');

CREATE TABLE IF NOT EXISTS assignment_staffing_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  invite_id UUID UNIQUE REFERENCES assignment_staffing_invites(id) ON DELETE SET NULL,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','released','promoted','expired','cancelled')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  promoted_at TIMESTAMPTZ,
  release_reason TEXT,
  promoted_link_id UUID REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staffing_reservations_assignment_idx
  ON assignment_staffing_reservations(assignment_id, status, reserved_at DESC);
CREATE INDEX IF NOT EXISTS staffing_reservations_worker_idx
  ON assignment_staffing_reservations(worker_user_id, status, reserved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS staffing_reservations_assignment_worker_reserved_uniq
  ON assignment_staffing_reservations(assignment_id, worker_user_id)
  WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS assignment_staffing_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  invite_id UUID REFERENCES assignment_staffing_invites(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES assignment_staffing_reservations(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'campaign_created','invite_sent','invite_viewed','invite_interested',
      'invite_declined','invite_accepted','invite_expired','invite_cancelled',
      'reservation_created','reservation_promoted','reservation_expired',
      'reservation_released','assignment_staffing_recalculated','assignment_auto_stopped'
    )
  ),
  old_values JSONB,
  new_values JSONB,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staffing_events_assignment_idx
  ON assignment_staffing_events(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staffing_events_campaign_idx
  ON assignment_staffing_events(campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

-- 089: Waitlist / Nachruecker-Queue
CREATE TABLE IF NOT EXISTS assignment_staffing_waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  root_campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  source_campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  current_campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  current_invite_id UUID REFERENCES assignment_staffing_invites(id) ON DELETE SET NULL,
  current_reservation_id UUID REFERENCES assignment_staffing_reservations(id) ON DELETE SET NULL,
  promoted_link_id UUID REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','invited','reserved','assigned','removed')),
  queue_rank INT NOT NULL CHECK (queue_rank >= 1),
  score NUMERIC(6,2),
  soft_score NUMERIC(6,2),
  hard_match BOOLEAN NOT NULL DEFAULT FALSE,
  is_selectable BOOLEAN NOT NULL DEFAULT TRUE,
  hard_failures JSONB NOT NULL DEFAULT '[]'::JSONB,
  missing_requirements JSONB NOT NULL DEFAULT '[]'::JSONB,
  factor_scores JSONB NOT NULL DEFAULT '[]'::JSONB,
  match_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  last_evaluated_at TIMESTAMPTZ,
  queued_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removal_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, worker_user_id)
);
CREATE INDEX IF NOT EXISTS staffing_waitlist_assignment_status_idx
  ON assignment_staffing_waitlist(assignment_id, status, queue_rank, updated_at DESC);
CREATE INDEX IF NOT EXISTS staffing_waitlist_root_status_idx
  ON assignment_staffing_waitlist(root_campaign_id, status, queue_rank, updated_at DESC)
  WHERE root_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS staffing_waitlist_worker_idx
  ON assignment_staffing_waitlist(worker_user_id, status, updated_at DESC);

-- 090: invite-Erweiterungen + messages
ALTER TABLE assignment_staffing_invites
  ADD COLUMN IF NOT EXISTS request_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','queued','delivered','failed')),
  ADD COLUMN IF NOT EXISTS delivery_attempt_count INT NOT NULL DEFAULT 0
    CHECK (delivery_attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS delivery_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_last_error TEXT,
  ADD COLUMN IF NOT EXISTS remind_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0
    CHECK (reminder_count >= 0),
  ADD COLUMN IF NOT EXISTS last_worker_action_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS staffing_invites_delivery_idx
  ON assignment_staffing_invites(delivery_status, sent_at DESC)
  WHERE status IN ('sent','viewed','interested');
CREATE INDEX IF NOT EXISTS staffing_invites_reminder_due_idx
  ON assignment_staffing_invites(remind_after, status)
  WHERE remind_after IS NOT NULL AND status IN ('sent','viewed','interested');

CREATE TABLE IF NOT EXISTS assignment_staffing_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  invite_id UUID NOT NULL REFERENCES assignment_staffing_invites(id) ON DELETE CASCADE,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL
    CHECK (sender_role IN ('worker','dispatcher','system')),
  message_type TEXT NOT NULL
    CHECK (message_type IN ('question','reminder_request','reminder_sent','status_update')),
  body TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staffing_messages_invite_idx
  ON assignment_staffing_messages(invite_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staffing_messages_assignment_idx
  ON assignment_staffing_messages(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staffing_messages_worker_idx
  ON assignment_staffing_messages(worker_user_id, created_at DESC);

-- 091: choice sets + options
CREATE TABLE IF NOT EXISTS assignment_staffing_choice_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'options_presented'
    CHECK (status IN (
      'options_presented','preference_submitted','preference_ranked',
      'manual_override','assigned','declined','expired','cancelled'
    )),
  choice_mode TEXT NOT NULL DEFAULT 'preference_only'
    CHECK (choice_mode IN ('preference_only','ranked_choice','free_choice')),
  title TEXT,
  message TEXT,
  response_deadline_at TIMESTAMPTZ,
  worker_note TEXT,
  manual_override_note TEXT,
  final_assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  final_link_id UUID REFERENCES worker_assignment_links(id) ON DELETE SET NULL,
  presented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  manual_override_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staffing_choice_sets_worker_status_idx
  ON assignment_staffing_choice_sets(worker_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS staffing_choice_sets_supplier_status_idx
  ON assignment_staffing_choice_sets(supplier_org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS assignment_staffing_choice_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  choice_set_id UUID NOT NULL REFERENCES assignment_staffing_choice_sets(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  invite_id UUID NOT NULL UNIQUE REFERENCES assignment_staffing_invites(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES assignment_staffing_campaigns(id) ON DELETE SET NULL,
  worker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  option_order INT NOT NULL CHECK (option_order >= 1),
  worker_response TEXT NOT NULL DEFAULT 'pending'
    CHECK (worker_response IN ('pending','preferred','acceptable','ranked','selected','declined')),
  worker_rank INT CHECK (worker_rank IS NULL OR worker_rank >= 1),
  worker_note TEXT,
  worker_responded_at TIMESTAMPTZ,
  dispatcher_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (dispatcher_state IN ('pending','assigned','manual_override','withdrawn')),
  dispatcher_note TEXT,
  dispatcher_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (choice_set_id, assignment_id),
  UNIQUE (choice_set_id, option_order)
);
CREATE INDEX IF NOT EXISTS staffing_choice_options_assignment_idx
  ON assignment_staffing_choice_options(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staffing_choice_options_choice_set_idx
  ON assignment_staffing_choice_options(choice_set_id, option_order, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS staffing_choice_options_rank_uniq
  ON assignment_staffing_choice_options(choice_set_id, worker_rank)
  WHERE worker_rank IS NOT NULL;

ALTER TABLE assignment_staffing_choice_sets
  ADD COLUMN IF NOT EXISTS final_choice_option_id UUID REFERENCES assignment_staffing_choice_options(id) ON DELETE SET NULL;

ALTER TABLE assignment_staffing_events
  ADD COLUMN IF NOT EXISTS choice_set_id UUID REFERENCES assignment_staffing_choice_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS choice_option_id UUID REFERENCES assignment_staffing_choice_options(id) ON DELETE SET NULL;

ALTER TABLE assignment_staffing_events
  DROP CONSTRAINT IF EXISTS assignment_staffing_events_event_type_check;
ALTER TABLE assignment_staffing_events
  ADD CONSTRAINT assignment_staffing_events_event_type_check CHECK (
    event_type IN (
      'campaign_created','invite_sent','invite_viewed','invite_interested',
      'invite_declined','invite_accepted','invite_expired','invite_cancelled',
      'invite_delivery_queued','invite_delivered','invite_delivery_failed',
      'invite_reminder_requested','invite_reminder_sent','worker_question_asked',
      'reservation_created','reservation_promoted','reservation_expired','reservation_released',
      'assignment_staffing_recalculated','assignment_auto_stopped',
      'waitlist_queued','waitlist_invited','waitlist_reserved','waitlist_assigned','waitlist_removed',
      'choice_set_created','choice_preference_submitted','choice_ranking_submitted',
      'choice_option_selected','choice_set_declined','choice_manual_override',
      'choice_assigned','choice_cancelled','choice_expired'
    )
  );

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '097_assignments_multi_staffing_recovery.sql: staffing columns restored.';
END $$;
