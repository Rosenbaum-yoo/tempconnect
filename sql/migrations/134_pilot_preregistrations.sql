-- 134_pilot_preregistrations.sql — Voranmeldung/Warteliste fuer den Marktstart-Pilot (One-Pager).
-- Zukunftssicher (Blueprint): cohort/region statt Hamburg hartcodiert -> dieselbe Infra fuer Folgemaerkte.
-- Double-Opt-in via confirm_token_hash (Token nur als SHA-256-Hash). Kuratierung ueber status-Workflow.
-- Rollback: DROP TABLE pilot_preregistrations;

CREATE TABLE IF NOT EXISTS pilot_preregistrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort        text NOT NULL DEFAULT 'hamburg-2026',          -- Welle/Markt
  region        text NOT NULL DEFAULT 'hamburg',               -- Einsatzort-Region
  side          text NOT NULL CHECK (side IN ('company','agency')),  -- Einsatzunternehmen / Dienstleister
  sector        text CHECK (sector IN ('logistik','pflege','industrie','andere')),
  org_name      text NOT NULL,
  contact_name  text NOT NULL,
  email         text NOT NULL,
  phone         text,                                          -- fuer Telefon-Outreach
  company_size  text,                                          -- grobe Groesse (Kuratierung)
  einsatzort_confirmed boolean NOT NULL DEFAULT FALSE,         -- Hamburg-Einsatzort bestaetigt
  capacity_or_need text,                                       -- was geboten/gebraucht wird
  message       text,
  referred_by   text,                                          -- Empfehlung (Slot-Prioritaet)
  source        text,                                          -- linkedin/telefon/utm...
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','qualified','accepted','waitlist','rejected')),
  consent_at    timestamptz,                                   -- Double-Opt-in bestaetigt
  confirm_token_hash text,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);

-- Eine Anmeldung pro Email & Welle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prereg_email_cohort ON pilot_preregistrations (lower(email), cohort);
CREATE INDEX IF NOT EXISTS idx_prereg_status ON pilot_preregistrations (cohort, side, status);
CREATE INDEX IF NOT EXISTS idx_prereg_token  ON pilot_preregistrations (confirm_token_hash) WHERE status = 'pending';
