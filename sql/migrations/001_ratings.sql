-- Migration: 001_ratings
-- Bewertungssystem (einzige Definition – nicht in init.sql)

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rated_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  reliability INT NOT NULL CHECK (reliability BETWEEN 1 AND 5),
  communication INT NOT NULL CHECK (communication BETWEEN 1 AND 5),
  quality INT NOT NULL CHECK (quality BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, rater_id)
);

CREATE INDEX IF NOT EXISTS ratings_rater_id_idx ON ratings(rater_id);
CREATE INDEX IF NOT EXISTS ratings_rated_id_idx ON ratings(rated_id);
CREATE INDEX IF NOT EXISTS ratings_request_id_idx ON ratings(request_id);
