import crypto from "crypto";

const INTERNAL_ROLES = new Set([ "internal_support_agent", "internal_support_lead" ]);
const EXTERNAL_ROLES = new Set([ "external_support_agent", "external_support_supervisor" ]);
const SUPERVISOR_ROLES = new Set([ "internal_support_lead", "external_support_supervisor" ]);
const QUALITY_ROLES = new Set([ "internal_support_lead", "external_support_supervisor", "support_auditor" ]);
const AUDIT_ROLES = new Set([ "internal_support_lead", "support_auditor" ]);

function parseEnabled(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if ([ "false", "0", "off", "no" ].includes(normalized)) return false;
  if ([ "true", "1", "on", "yes" ].includes(normalized)) return true;
  return fallback;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeString(value) {
  return String(value || "").trim();
}

function initials(name) {
  const chunks = safeString(name)
    .split(/\s+/)
    .filter(Boolean);
  if (chunks.length === 0) return null;
  return chunks.slice(0, 2).map((part) => `${part[0].toUpperCase()}.`).join(" ");
}

function hashId(value) {
  const raw = safeString(value);
  if (!raw) return null;
  return `h-${crypto.createHash("md5").update(raw).digest("hex").slice(0, 12)}`;
}

function shortId(value, prefix = "id") {
  const raw = safeString(value);
  if (!raw) return null;
  if (raw.length < 12) return `${prefix}-${raw}`;
  return `${prefix}-${raw.slice(0, 8)}...${raw.slice(-4)}`;
}

function maskDomain(email) {
  const raw = safeString(email).toLowerCase();
  const at = raw.indexOf("@");
  if (at < 0 || at === raw.length - 1) return null;
  return `@${raw.slice(at + 1)}`;
}

function maskPhoneTail(phone, fullyMasked) {
  const raw = safeString(phone);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (fullyMasked) return "●●●●●●●●";
  const tail = digits.slice(-2).padStart(2, "0");
  return `●●●●●●●●${tail}`;
}

export function defaultSupportActions(role) {
  if (role === "support_auditor") return [];
  const base = [ "accept", "change_status", "add_note", "resend_verification", "resend_invite" ];
  if (role === "internal_support_lead" || role === "external_support_supervisor") {
    return [ ...base, "assign", "change_priority", "escalate", "close" ];
  }
  return base;
}

export function supportMaskingRules(role) {
  if (INTERNAL_ROLES.has(role)) {
    return {
      mask_email: false,
      mask_phone: false,
      mask_payment: true,
      mask_full_name: false,
      show_org_name: true,
      show_plan: true,
      show_account_status: true
    };
  }
  return {
    mask_email: true,
    mask_phone: true,
    mask_payment: true,
    mask_full_name: true,
    show_org_name: true,
    show_plan: true,
    show_account_status: true
  };
}

export function supportFeatures(role) {
  const isAuditor = role === "support_auditor";
  return {
    user_lookup: !isAuditor,
    org_lookup: !isAuditor,
    knowledge_base: !isAuditor,
    supervisor_view: SUPERVISOR_ROLES.has(role),
    audit_view: AUDIT_ROLES.has(role),
    quality_metrics: QUALITY_ROLES.has(role)
  };
}

export function maskSupportEmail(email, role) {
  if (INTERNAL_ROLES.has(role)) return safeString(email).toLowerCase() || null;
  return maskDomain(email);
}

export function maskSupportName(name, role) {
  if (INTERNAL_ROLES.has(role)) return safeString(name) || null;
  if (EXTERNAL_ROLES.has(role)) return initials(name);
  return "•••••";
}

export function maskSupportPhone(phone, role) {
  if (INTERNAL_ROLES.has(role)) return safeString(phone) || null;
  if (EXTERNAL_ROLES.has(role)) return maskPhoneTail(phone, false);
  return maskPhoneTail(phone, true);
}

export function maskSupportId(idValue, role, entityPrefix = "id") {
  const raw = safeString(idValue);
  if (!raw) return null;
  if (role === "internal_support_lead") return raw;
  if (role === "internal_support_agent") return shortId(raw, entityPrefix);
  return `${entityPrefix}-${hashId(raw)}`;
}

export function normalizeSupportAgent(row) {
  const role = row.role;
  const actions = normalizeArray(row.allowed_actions);
  return {
    id: row.id,
    user_id: row.user_id,
    role,
    scope: row.scope,
    vendor_id: row.vendor_id || null,
    vendor_name: row.vendor_name || null,
    vendor_active: row.vendor_active !== false,
    data_scope: row.data_scope || "assigned_only",
    allowed_queues: normalizeArray(row.allowed_queues),
    allowed_case_types: normalizeArray(row.allowed_case_types),
    allowed_actions: actions.length > 0 ? actions : defaultSupportActions(role),
    is_active: row.is_active === true,
    display_name: row.display_name || row.user_email || "Support Agent",
    email: row.user_email || null
  };
}

export async function getSupportAgent(pool, userId) {
  const { rows } = await pool.query(
    `SELECT sa.id, sa.user_id, sa.role, sa.scope, sa.vendor_id, sa.allowed_queues,
            sa.allowed_case_types, sa.allowed_actions, sa.data_scope, sa.is_active,
            sv.name AS vendor_name, sv.is_active AS vendor_active,
            u.email AS user_email,
            COALESCE(NULLIF(u.contact_person, ''), NULLIF(u.company_name, ''), u.email) AS display_name
       FROM support_agents sa
       LEFT JOIN support_vendors sv ON sv.id = sa.vendor_id
       JOIN users u ON u.id = sa.user_id
      WHERE sa.user_id = $1
        AND sa.is_active = TRUE
      LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return null;
  return normalizeSupportAgent(rows[0]);
}

export function requireSupportFeature(featureKey) {
  return (req, res, next) => {
    if (!req.supportFeatures?.[featureKey]) {
      return res.status(403).json({
        error: "SUPPORT_FEATURE_FORBIDDEN",
        message: "Keine Berechtigung für diesen Support-Bereich."
      });
    }
    next();
  };
}

export function requireSupportAccess(deps) {
  const { pool, logger, config } = deps;

  return async (req, res, next) => {
    const supportOpsEnabled = parseEnabled(config?.SUPPORT_OPS_ENABLED, true);
    if (!supportOpsEnabled) {
      return res.status(503).json({
        error: "SUPPORT_OPS_DISABLED",
        message: "Support Operations Center ist aktuell deaktiviert."
      });
    }

    if (!req.session?.userId) {
      return res.status(401).json({ error: "NOT_AUTHENTICATED" });
    }

    try {
      const agent = await getSupportAgent(pool, req.session.userId);
      if (!agent || !agent.is_active) {
        return res.status(403).json({ error: "NOT_SUPPORT_STAFF" });
      }

      if (agent.scope === "external" && (!agent.vendor_id || agent.vendor_active === false)) {
        return res.status(403).json({ error: "NOT_SUPPORT_STAFF" });
      }

      req.supportAgent = agent;
      req.supportMaskingRules = supportMaskingRules(agent.role);
      req.supportFeatures = supportFeatures(agent.role);
      req.supportAllowedActions = agent.allowed_actions;

      next();
    } catch (err) {
      logger?.error?.({ err, userId: req.session.userId }, "support access check failed");
      return res.status(500).json({
        error: "SERVER_ERROR",
        message: "Interner Fehler beim Prüfen der Support-Berechtigung."
      });
    }
  };
}

