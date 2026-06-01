-- Migration 063: Structured "What's New" / product release notes (B2B changelog).
-- Separate from transactional `notifications` — no spam in the bell feed.

CREATE TABLE IF NOT EXISTS product_release_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 VARCHAR(500) NOT NULL,
  summary               TEXT,
  body                  TEXT,
  feature_key           VARCHAR(120),
  audiences             TEXT[] NOT NULL DEFAULT '{}',
  min_plan              VARCHAR(32),
  required_feature_key  VARCHAR(120),
  visibility            VARCHAR(20) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'internal')),
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  published_at          TIMESTAMPTZ,
  show_in_app           BOOLEAN NOT NULL DEFAULT TRUE,
  send_email_on_publish BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at         TIMESTAMPTZ,
  priority              INT NOT NULL DEFAULT 0,
  show_as_modal         BOOLEAN NOT NULL DEFAULT FALSE,
  created_by            UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_release_entries_status_pub_idx
  ON product_release_entries (status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS product_release_entries_visibility_idx
  ON product_release_entries (visibility);

COMMENT ON TABLE product_release_entries IS 'Product changelog / release notes; targeted by role, plan, optional feature gate.';
COMMENT ON COLUMN product_release_entries.audiences IS 'Empty = all roles. Tokens: worker, agency, company, admin, supplier_user (OR semantics).';
COMMENT ON COLUMN product_release_entries.min_plan IS 'NULL = any plan; else user plan tier must be >= min_plan.';
COMMENT ON COLUMN product_release_entries.visibility IS 'internal: only platform_admin / user.role=admin.';

CREATE TABLE IF NOT EXISTS user_product_release_ack (
  user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  release_id         UUID NOT NULL REFERENCES product_release_entries (id) ON DELETE CASCADE,
  seen_at            TIMESTAMPTZ,
  modal_dismissed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, release_id)
);

CREATE INDEX IF NOT EXISTS user_product_release_ack_user_idx
  ON user_product_release_ack (user_id);
