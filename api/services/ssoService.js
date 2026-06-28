/**
 * SSO/SAML Service – Konfiguration, Login-Initiation, Callback-Handling.
 * Verwendet @node-saml/node-saml wenn verfuegbar, sonst Stub-Modus.
 */

let SAML;
let SSO_MODE = "stub";
try {
  const mod = await import("@node-saml/node-saml");
  SAML = mod.SAML;
  SSO_MODE = "saml";
} catch {
  SAML = null;
  SSO_MODE = "stub";
  // Explicit: @node-saml/node-saml is not installed.
  // SSO will work in stub/dev mode only. For production SAML:
  //   npm install @node-saml/node-saml
}

/** Returns current SSO runtime mode: 'saml' (production) or 'stub' (dev/missing dependency) */
export function getSSOMode() { return SSO_MODE; }

/* ── SSO Config CRUD ──────────────────────────────── */

export async function getSSOConfig(pool, orgId) {
  const { rows } = await pool.query(
    "SELECT * FROM org_sso_config WHERE org_id = $1", [orgId]
  );
  return rows[0] || null;
}

export async function upsertSSOConfig(pool, orgId, data) {
  const { rows } = await pool.query(`
    INSERT INTO org_sso_config (org_id, idp_entity_id, idp_sso_url, idp_certificate, sp_entity_id, attribute_mapping, is_active, enforce_sso)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (org_id) DO UPDATE SET
      idp_entity_id = EXCLUDED.idp_entity_id,
      idp_sso_url = EXCLUDED.idp_sso_url,
      idp_certificate = EXCLUDED.idp_certificate,
      sp_entity_id = EXCLUDED.sp_entity_id,
      attribute_mapping = EXCLUDED.attribute_mapping,
      is_active = EXCLUDED.is_active,
      enforce_sso = EXCLUDED.enforce_sso,
      updated_at = NOW()
    RETURNING *
  `, [
    orgId,
    data.idp_entity_id,
    data.idp_sso_url,
    data.idp_certificate,
    data.sp_entity_id || null,
    JSON.stringify(data.attribute_mapping || {}),
    data.is_active !== false,
    data.enforce_sso === true
  ]);
  return rows[0];
}

export async function deleteSSOConfig(pool, orgId) {
  await pool.query("DELETE FROM org_sso_config WHERE org_id = $1", [orgId]);
}

/* ── SSO Login Initiation (mit RelayState) ────────── */

export async function initiateSSOLogin(pool, orgId, baseUrl) {
  const config = await getSSOConfig(pool, orgId);
  if (!config || !config.is_active) return { error: "SSO_NOT_CONFIGURED" };

  if (!SAML) {
    // Stub-Modus ist in Production nicht erlaubt (WAVE 09 Option B: SSO soft-locked)
    if (process.env.NODE_ENV === "production") {
      return { error: "SSO_NOT_AVAILABLE", message: "SSO ist in dieser Umgebung nicht aktiviert. Bitte kontaktieren Sie den Support." };
    }
    // Nur in Entwicklung: redirect direkt zum Callback mit Stub-Marker
    const stubUrl = `${baseUrl}/api/sso/callback?RelayState=${encodeURIComponent(orgId)}&stub=1`;
    return { redirect_url: stubUrl, mode: "stub", orgId };
  }

  const saml = new SAML({
    entryPoint: config.idp_sso_url,
    issuer: config.sp_entity_id || `${baseUrl}/api/sso/metadata/${orgId}`,
    idpIssuer: config.idp_entity_id,
    cert: config.idp_certificate,
    callbackUrl: `${baseUrl}/api/sso/callback`,
    wantAuthnResponseSigned: true
  });

  // RelayState = orgId damit Callback die richtige Config findet
  const loginUrl = await saml.getAuthorizeUrlAsync(orgId, {}, {});
  return { redirect_url: loginUrl, mode: "saml", orgId };
}

/* ── Org-Lookup per E-Mail-Domain ─────────────────── */

export async function lookupOrgByEmailDomain(pool, email) {
  const domain = (email || "").split("@")[1];
  if (!domain) return null;
  // Suche User mit dieser Domain, die eine Org mit aktiver SSO-Config haben
  const { rows } = await pool.query(`
    SELECT DISTINCT o.id AS org_id, o.name AS org_name, o.slug,
           sc.is_active, sc.enforce_sso
    FROM users u
    JOIN org_memberships om ON om.user_id = u.id AND om.is_active = TRUE
    JOIN organizations o ON o.id = om.org_id
    JOIN org_sso_config sc ON sc.org_id = o.id AND sc.is_active = TRUE
    WHERE u.email LIKE $1
    LIMIT 1
  `, [`%@${domain.toLowerCase()}`]);
  return rows[0] || null;
}

/* ── SSO Callback Handling (mit RelayState) ───────── */

export async function handleSAMLCallback(pool, samlResponse, relayState, baseUrl) {
  // RelayState = orgId (von initiateSSOLogin gesetzt)
  let config;
  if (relayState) {
    config = await getSSOConfig(pool, relayState);
  }
  // KEIN Legacy-Fallback auf "erste aktive Org": ein fehlender/unbekannter RelayState darf NICHT
  // dazu führen, dass die Assertion gegen eine fremde Org-Config validiert und ein Nutzer dort
  // (auto-)provisioniert wird. Ohne eindeutige Org-Zuordnung wird abgebrochen.
  if (!config) return { error: "NO_ACTIVE_SSO_CONFIG" };

  if (!SAML) return { error: "SAML_NOT_AVAILABLE" };

  const saml = new SAML({
    entryPoint: config.idp_sso_url,
    issuer: config.sp_entity_id || `${baseUrl}/api/sso/metadata/${config.org_id}`,
    idpIssuer: config.idp_entity_id,            // Assertion-Issuer MUSS zur konfigurierten IdP-Entity-ID passen
    cert: config.idp_certificate,
    callbackUrl: `${baseUrl}/api/sso/callback`,
    wantAuthnResponseSigned: true
  });

  try {
    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
    return await processSSSOProfile(pool, profile, config);
  } catch (err) {
    return { error: "SAML_VALIDATION_FAILED", message: err.message };
  }
}

/* ── Stub-Callback (lokaler Dev-Modus ohne IDP) ──── */

export async function handleStubCallback(pool, orgId, sessionUserId) {
  const config = await getSSOConfig(pool, orgId);
  if (!config || !config.is_active) return { error: "SSO_NOT_CONFIGURED" };
  if (!sessionUserId) return { error: "NOT_LOGGED_IN" };

  // Im Stub-Modus: aktuellen User verwenden (muss eingeloggt sein)
  const { rows: users } = await pool.query("SELECT id, email FROM users WHERE id = $1", [sessionUserId]);
  if (users.length === 0) return { error: "USER_NOT_FOUND" };

  // SSO Session erstellen
  await pool.query(
    `INSERT INTO sso_sessions (user_id, org_id, idp_session_id) VALUES ($1, $2, $3)`,
    [users[0].id, orgId, 'stub-session-' + Date.now()]
  );

  return { ok: true, userId: users[0].id, email: users[0].email, orgId };
}

/* ── Profil verarbeiten + Auto-Provisioning ───────── */

async function processSSSOProfile(pool, profile, config) {
  const attrMap = typeof config.attribute_mapping === 'string'
    ? JSON.parse(config.attribute_mapping) : (config.attribute_mapping || {});

  const email = profile?.[attrMap.email || 'email'] || profile?.email || profile?.nameID;
  if (!email) return { error: "NO_EMAIL_IN_SAML_RESPONSE" };

  const firstName = profile?.[attrMap.firstName || 'firstName'] || profile?.firstName || '';
  const lastName  = profile?.[attrMap.lastName || 'lastName']  || profile?.lastName  || '';

  // User lookup
  const { rows: users } = await pool.query(
    "SELECT id FROM users WHERE email = $1", [email.toLowerCase()]
  );

  let userId;
  let isNew = false;
  if (users.length > 0) {
    userId = users[0].id;
  } else {
    // Auto-Provisioning: User + Subscription + Org-Membership
    const displayName = (firstName + ' ' + lastName).trim() || email;
    const { rows: newUser } = await pool.query(
      `INSERT INTO users (email, role, company_name, is_verified, org_id)
       VALUES ($1, 'company', $2, TRUE, $3) RETURNING id`,
      [email.toLowerCase(), displayName, config.org_id]
    );
    userId = newUser[0].id;
    isNew = true;

    // Subscription anlegen (DEMO default)
    await pool.query(
      "INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end) VALUES ($1, 'DEMO', 'active', NOW(), NOW() + INTERVAL '14 days')",
      [userId]
    );

    // Org-Membership anlegen
    try {
      await pool.query(
        `INSERT INTO org_memberships (user_id, org_id, role_key, is_active, created_at, updated_at)
         VALUES ($1, $2, 'member', TRUE, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [userId, config.org_id]
      );
    } catch { /* non-critical */ }
  }

  // SSO Session erstellen
  await pool.query(
    `INSERT INTO sso_sessions (user_id, org_id, idp_session_id) VALUES ($1, $2, $3)`,
    [userId, config.org_id, profile?.sessionIndex || null]
  );

  return { ok: true, userId, email: email.toLowerCase(), orgId: config.org_id, isNew };
}

/* ── Enforce-SSO Check ────────────────────────────── */

export async function isEnforceSSO(pool, email) {
  const { rows } = await pool.query(`
    SELECT sc.enforce_sso, o.name AS org_name
    FROM users u
    JOIN org_memberships om ON om.user_id = u.id AND om.is_active = TRUE
    JOIN organizations o ON o.id = om.org_id
    JOIN org_sso_config sc ON sc.org_id = o.id AND sc.is_active = TRUE AND sc.enforce_sso = TRUE
    WHERE u.email = $1
    LIMIT 1
  `, [email.toLowerCase()]);
  if (rows.length > 0) return { enforced: true, org_name: rows[0].org_name };
  return { enforced: false };
}

/* ── SSO Config Test / Validierung ────────────────── */

export async function testSSOConfig(pool, orgId, baseUrl) {
  const config = await getSSOConfig(pool, orgId);
  if (!config) return { valid: false, errors: ["Keine SSO-Konfiguration gefunden."] };

  const errors = [];
  const warnings = [];

  if (!config.idp_entity_id) errors.push("IDP Entity ID fehlt.");
  if (!config.idp_sso_url) errors.push("IDP SSO URL fehlt.");
  else {
    try { new URL(config.idp_sso_url); }
    catch { errors.push("IDP SSO URL ist keine gueltige URL."); }
  }
  if (!config.idp_certificate) errors.push("IDP Zertifikat fehlt.");
  else {
    const cert = config.idp_certificate.trim();
    if (!cert.includes('BEGIN CERTIFICATE') && cert.length < 100) {
      errors.push("IDP Zertifikat scheint ungueltig (zu kurz oder kein PEM-Format).");
    }
  }

  if (!config.is_active) warnings.push("SSO ist derzeit deaktiviert.");
  if (config.enforce_sso && !config.is_active) {
    errors.push("Enforce-SSO ist aktiv, aber SSO ist deaktiviert – Nutzer koennen sich nicht einloggen.");
  }

  const spEntityId = config.sp_entity_id || `${baseUrl}/api/sso/metadata/${orgId}`;
  const callbackUrl = `${baseUrl}/api/sso/callback`;

  if (!SAML) {
    warnings.push("SAML-Library nicht installiert — SSO laeuft im Stub-/Dev-Modus. Fuer Produktion: npm install @node-saml/node-saml");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sso_mode: SSO_MODE,
    saml_available: !!SAML,
    sp_entity_id: spEntityId,
    callback_url: callbackUrl,
    metadata_url: `${baseUrl}/api/sso/metadata/${orgId}`
  };
}

/* ── Cleanup abgelaufene Sessions ─────────────────── */

export async function cleanupExpiredSessions(pool) {
  const { rowCount } = await pool.query(
    "DELETE FROM sso_sessions WHERE expires_at < NOW()"
  );
  return rowCount;
}

/* ── SP Metadata ──────────────────────────────────── */

export function generateSPMetadata(orgId, baseUrl) {
  const entityId = `${baseUrl}/api/sso/metadata/${orgId}`;
  const acsUrl = `${baseUrl}/api/sso/callback`;
  return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
}
