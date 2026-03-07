-- Migration 023: Search Platform Layer
-- Search-Sync-Tracking und Skills-Katalog fuer Enterprise Search

BEGIN;

-- ── search_sync_log: Tracking des Sync-Status pro Entity ──────────────
CREATE TABLE IF NOT EXISTS search_sync_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   VARCHAR(50)  NOT NULL,   -- 'companies', 'suppliers', 'capacity_posts', 'requisitions', 'skills'
    entity_id     UUID         NOT NULL,
    action        VARCHAR(20)  NOT NULL DEFAULT 'indexed',  -- 'indexed', 'removed', 'failed'
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_message  TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_sync_entity
    ON search_sync_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_search_sync_last
    ON search_sync_log (last_synced_at DESC);

-- ── platform_skills: Zentraler Skill-Katalog ──────────────────────────
-- Aggregiert aus capacity_posts.skill_tags, requisitions.skill_tags, etc.
CREATE TABLE IF NOT EXISTS platform_skills (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(100) NOT NULL UNIQUE,
    category     VARCHAR(50),           -- z.B. 'Pflege', 'IT', 'Handwerk', 'Logistik'
    aliases      TEXT[]       DEFAULT '{}',
    usage_count  INTEGER      NOT NULL DEFAULT 0,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_skills_name
    ON platform_skills (name);
CREATE INDEX IF NOT EXISTS idx_platform_skills_category
    ON platform_skills (category);

-- ── Submissions-Tabelle (fuer Submission Workflow) ────────────────────
-- Kandidaten-Einreichungen fuer Requisitions
CREATE TABLE IF NOT EXISTS submissions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id   UUID         NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
    supplier_org_id  UUID         NOT NULL REFERENCES organizations(id),
    candidate_name   VARCHAR(200) NOT NULL,
    candidate_email  VARCHAR(255),
    candidate_phone  VARCHAR(50),
    role             VARCHAR(100),
    hourly_rate      NUMERIC(10,2),
    availability_from DATE,
    availability_to   DATE,
    cover_note       TEXT,
    resume_ref       VARCHAR(500),    -- Dateipfad/URL zum Lebenslauf
    status           VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
    submitted_by     UUID         REFERENCES users(id),
    reviewed_by      UUID         REFERENCES users(id),
    reviewed_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    match_score      NUMERIC(5,2),
    metadata         JSONB        DEFAULT '{}',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_requisition
    ON submissions (requisition_id);
CREATE INDEX IF NOT EXISTS idx_submissions_supplier
    ON submissions (supplier_org_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status
    ON submissions (status);

-- Migration registrieren
INSERT INTO _migrations (name) VALUES ('023_search_platform_layer')
ON CONFLICT DO NOTHING;

COMMIT;
