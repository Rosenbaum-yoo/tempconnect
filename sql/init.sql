-- TempConnect DB Init – Basis-Schema (nur diese Tabelle hier)
-- Erweiterungen (ratings, payment_sessions, User-Profilfelder) kommen ueber Migrations.
-- Laufreihenfolge: init.sql (einmalig bei leerer DB), danach sql/migrations/*.sql

SET client_min_messages TO WARNING;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (Profil-Spalten contact_person, street, postal_code, city, vat_id in 003_profile_legal.sql)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role TEXT NOT NULL CHECK (role IN ('company','agency')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('FREE','BASIS','PLUS','NOTDIENST')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);

-- Listings (Karteikarten)
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('supply','demand')),
  category TEXT NOT NULL,
  region TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1 CHECK (qty >= 1),
  start_date DATE,
  note TEXT,
  notdienst BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS listings_owner_id_idx ON listings(owner_id);
CREATE INDEX IF NOT EXISTS listings_type_idx ON listings(type);
CREATE INDEX IF NOT EXISTS listings_region_idx ON listings(region);
CREATE INDEX IF NOT EXISTS listings_category_idx ON listings(category);

-- Requests (Anfragen)
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','NOTDIENST')),
  status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','ACCEPTED','DECLINED','FILLED','FINALIZED','CANCELED')),
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS requests_requester_id_idx ON requests(requester_id);
CREATE INDEX IF NOT EXISTS requests_receiver_id_idx ON requests(receiver_id);
CREATE INDEX IF NOT EXISTS requests_listing_id_idx ON requests(listing_id);

-- Demo-Daten: NICHT in Produktion! Nur fuer lokale Entwicklung.
-- Dev-Daten werden separat via sql/seeds/dev-data.sql geladen (nur docker-compose.override.yml).
