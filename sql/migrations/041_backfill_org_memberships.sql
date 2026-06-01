-- Migration 041: Auto-create organizations + memberships for users without org
-- Ensures every company/agency user has an organization where they are owner.
-- Required for RBAC-gated features (Worker Module, etc.).

-- Uses DO block to create one org per user (safe for duplicate company names)
DO $$
DECLARE
  r RECORD;
  new_org_id UUID;
  base_slug TEXT;
  final_slug TEXT;
BEGIN
  FOR r IN
    SELECT u.id AS user_id,
           u.role AS user_role,
           COALESCE(NULLIF(u.company_name, ''), u.email) AS org_name
    FROM users u
    LEFT JOIN org_memberships om ON om.user_id = u.id AND om.is_active = TRUE
    WHERE u.role IN ('company', 'agency')
      AND om.id IS NULL
      AND u.is_demo = FALSE
  LOOP
    -- Generate slug: lowercase, replace spaces/special chars with hyphens, append short random suffix
    base_slug := lower(regexp_replace(r.org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(BOTH '-' FROM base_slug);
    final_slug := base_slug || '-' || substr(md5(random()::text), 1, 6);

    -- Create org
    INSERT INTO organizations (id, name, slug, type, created_at, updated_at)
    VALUES (uuid_generate_v4(), r.org_name, final_slug, r.user_role, NOW(), NOW())
    RETURNING id INTO new_org_id;

    -- Create owner membership
    INSERT INTO org_memberships (user_id, org_id, role_key, is_active, created_at, updated_at)
    VALUES (r.user_id, new_org_id, 'owner', TRUE, NOW(), NOW());
  END LOOP;
END
$$;
