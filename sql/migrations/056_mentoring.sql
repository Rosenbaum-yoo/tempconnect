-- 056_mentoring.sql: Mentoring-Sessions zwischen Nutzern
CREATE TABLE IF NOT EXISTS mentoring_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL DEFAULT '',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','canceled')),
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  feedback_mentor TEXT,
  feedback_mentee TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentoring_mentor ON mentoring_sessions(mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentoring_mentee ON mentoring_sessions(mentee_id);
CREATE INDEX IF NOT EXISTS idx_mentoring_status ON mentoring_sessions(status);
