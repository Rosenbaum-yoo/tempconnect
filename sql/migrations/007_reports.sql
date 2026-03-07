-- Meldungen (Anfrage oder Nutzer melden) – für manuelle Prüfung, keine Auto-Sperre
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'betrug', 'belaestigung', 'sonstiges')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reports_reporter_id_idx ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS reports_reported_user_id_idx ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at);

COMMENT ON TABLE reports IS 'Nutzer-Meldungen für manuelle Prüfung durch Betreiber';
