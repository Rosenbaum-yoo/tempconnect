-- 096_staff_customer_requests.sql
-- Staff Control Center — Kundenanfragen-Thread und Zuweisung.
-- Dockt an die bestehende Tabelle `strategic_collaboration_requests` an;
-- macht aus deren Lifecycle eine echte Staff-Inbox mit Threading.

BEGIN;

-- ───────────────────────────────────────────────────────────────
-- Thread-Messages einer Kundenanfrage.
-- is_internal = TRUE: nur Staff sieht es (Notiz / Abstimmung).
-- is_internal = FALSE: Nachricht an den Kunden (wird separat ausgeliefert).
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_customer_request_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES strategic_collaboration_requests(id) ON DELETE CASCADE,
  author_staff_id UUID REFERENCES users(id),
  is_internal     BOOLEAN NOT NULL DEFAULT TRUE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_staff_req_msgs_req_created
  ON staff_customer_request_messages(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_req_msgs_author
  ON staff_customer_request_messages(author_staff_id, created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- Zuweisung: wer aus dem Staff bearbeitet die Anfrage gerade.
-- Nur ein aktiver Assignment-Eintrag pro Request (ueber Partial Unique Index).
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_customer_request_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES strategic_collaboration_requests(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by     UUID REFERENCES users(id),
  released_at     TIMESTAMPTZ,
  released_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_staff_req_active_assignment
  ON staff_customer_request_assignments(request_id)
  WHERE released_at IS NULL;

COMMIT;
