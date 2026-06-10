-- 130_org_integrations.sql — Integrations-Feature (Slack/Teams Webhooks) live schalten.
-- integrationService.js + routes/integrations.js sind voll gebaut, aber die Tabelle
-- org_integrations wurde im Migrations-Baum NIE angelegt. Mig 047 ist bewusst ein
-- to_regclass-No-Op solange die Tabelle fehlt — und wird dabei als 'applied' verbucht,
-- laeuft also NIE erneut. Daher legt DIESE Migration BEIDES selbst an: org_integrations
-- UND webhook_deliveries (inkl. signing_secret), damit das Feature ohne Re-Run von 047
-- funktioniert. Add-only/idempotent (IF NOT EXISTS).
-- Rollback: DROP TABLE IF EXISTS webhook_deliveries; DROP TABLE IF EXISTS org_integrations;

CREATE TABLE IF NOT EXISTS org_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('slack','teams')),
  label           text NOT NULL DEFAULT '',
  webhook_url     text NOT NULL,
  enabled_events  text[] NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT TRUE,
  signing_secret  text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  last_success_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS org_integrations_org_idx ON org_integrations(org_id, is_active);

-- webhook_deliveries: Lieferprotokoll + Retry-Backoff. Identisch zur (geguardeten)
-- 047-DDL, hier mitangelegt, da 047 als No-Op verbucht ist und nicht mehr laeuft.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES org_integrations(id) ON DELETE CASCADE,
  event_key      text NOT NULL,
  payload        jsonb,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','retrying')),
  http_status    int,
  error_message  text,
  attempt        int NOT NULL DEFAULT 1,
  max_attempts   int NOT NULL DEFAULT 3,
  next_retry_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  completed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_del_integration_idx ON webhook_deliveries(integration_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_del_retry_idx ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending','retrying');
