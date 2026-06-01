-- Inter-Agency matching settings (enterprise optional mode).
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS inter_agency_matching_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS inter_agency_supply_visible BOOLEAN NOT NULL DEFAULT FALSE;

