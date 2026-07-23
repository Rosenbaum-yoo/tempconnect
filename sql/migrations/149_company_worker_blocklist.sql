-- 149_company_worker_blocklist.sql
-- Sperrliste (P3.3): ein einsetzendes Unternehmen (Käufer-Org) kann eine konkrete
-- Kraft sperren — unbefristet ("nie wieder") oder befristet (z.B. wieder frei in 3 Monaten).
-- Der Zuweisungs-Guard (createAssignmentLink / replaceAssignmentWorker) lehnt gesperrte
-- Kräfte für dieses Unternehmen ab (BLOCKED_BY_COMPANY) — am selben Chokepoint wie der
-- Kollisions-/Doppelbuchungs-Schutz, damit ALLE Zuweisungspfade die Sperre respektieren.
-- Org-scoped (Isolation im Service-Layer). Add-only/idempotent.
--
-- Aktive Sperre = blocked_until IS NULL OR blocked_until >= CURRENT_DATE.
-- "Wieder frei" = Zeile löschen (unblock) ODER blocked_until in die Vergangenheit.
--
-- Rollback: DROP TABLE IF EXISTS company_worker_blocklist;

BEGIN;

CREATE TABLE IF NOT EXISTS company_worker_blocklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_org_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,  -- Herkunfts-Agentur (Kontext)
  reason          text,
  blocked_until   date,                                                  -- NULL = unbefristet
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (company_org_id, worker_user_id)
);

-- Guard-Lookup: "ist Worker X bei Unternehmen Y aktiv gesperrt?" (heißer Pfad bei jeder Zuweisung)
CREATE INDEX IF NOT EXISTS company_worker_blocklist_lookup_idx
  ON company_worker_blocklist(company_org_id, worker_user_id);
-- Umgekehrte Sicht: welche Unternehmen sperren einen Worker (für Chef-Hinweise)
CREATE INDEX IF NOT EXISTS company_worker_blocklist_worker_idx
  ON company_worker_blocklist(worker_user_id);

COMMENT ON TABLE  company_worker_blocklist IS 'Sperrliste (P3.3): Käufer-Org sperrt eine Kraft; Zuweisungs-Guard lehnt gesperrte Kräfte ab.';
COMMENT ON COLUMN company_worker_blocklist.blocked_until IS 'NULL = unbefristet; Datum = gesperrt bis einschließlich. Aktiv wenn NULL oder >= CURRENT_DATE.';

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '149_company_worker_blocklist.sql: Migration erfolgreich angewendet.';
END $$;
