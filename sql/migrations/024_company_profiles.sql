-- Migration 024: Enterprise Company Profiles
-- Adds structured company profile, capabilities, locations, certifications, contacts.
-- All FK to users(id) ON DELETE CASCADE. Add-only, backward-compatible.

-- 1) COMPANY PROFILES (1:1 per user)
CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  legal_name TEXT,
  website TEXT,
  company_description TEXT,
  year_founded INT CHECK (year_founded IS NULL OR (year_founded >= 1800 AND year_founded <= 2100)),
  company_size TEXT CHECK (company_size IS NULL OR company_size IN (
    '1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+'
  )),
  industry_focus TEXT,
  headquarters_city TEXT,
  headquarters_country TEXT DEFAULT 'Deutschland',
  linkedin_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_profiles_user_idx ON company_profiles(user_id);

-- 2) COMPANY CAPABILITIES (1:1 per user — arrays for flexibility)
CREATE TABLE IF NOT EXISTS company_capabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_categories TEXT[] DEFAULT '{}',
  industries_served TEXT[] DEFAULT '{}',
  typical_roles TEXT[] DEFAULT '{}',
  availability_regions TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{}',
  specializations TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_capabilities_user_idx ON company_capabilities(user_id);
CREATE INDEX IF NOT EXISTS company_capabilities_regions_idx ON company_capabilities USING GIN (availability_regions);
CREATE INDEX IF NOT EXISTS company_capabilities_categories_idx ON company_capabilities USING GIN (staff_categories);

-- 3) COMPANY LOCATIONS (1:many)
CREATE TABLE IF NOT EXISTS company_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  city TEXT NOT NULL,
  postal_code TEXT,
  country TEXT DEFAULT 'Deutschland',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_km INT DEFAULT 50 CHECK (radius_km IS NULL OR radius_km >= 0),
  is_headquarters BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_locations_user_idx ON company_locations(user_id);

-- 4) COMPANY CERTIFICATIONS (1:many)
CREATE TABLE IF NOT EXISTS company_certifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cert_type TEXT NOT NULL CHECK (cert_type IN (
    'aueg_lizenz','iso_9001','iso_27001','iso_45001',
    'tuev','dekra','branchenzertifikat','qualitaetssiegel','sonstige'
  )),
  cert_name TEXT NOT NULL,
  issuer TEXT,
  issued_at DATE,
  expires_at DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_certifications_user_idx ON company_certifications(user_id);
CREATE INDEX IF NOT EXISTS company_certifications_expires_idx ON company_certifications(expires_at)
  WHERE status = 'active';

-- 5) COMPANY CONTACTS (1:many)
CREATE TABLE IF NOT EXISTS company_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_contacts_user_idx ON company_contacts(user_id);
