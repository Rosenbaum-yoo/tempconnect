/**
 * Enterprise Surface Access Service
 *
 * Liefert granulare Zugriffsrechte (mode + Sub-Action-Flags) fuer alle
 * Enterprise-Surfaces, basierend auf Plan, Org-Type und Org-Rolle.
 *
 * Jede Surface hat:
 *   mode: 'full' | 'read_only' | 'role_locked' | 'plan_locked' | 'org_locked'
 *   + spezifische Capability-Flags (canRead, canWrite, canExport, ...)
 *
 * Prioritaet der Blockiergründe:
 *   1. org_locked  — Org-Typ hat keinen Zugang (z.B. agency auf buyer-only Surface)
 *   2. plan_locked — Plan reicht nicht (z.B. DEMO fuer spend_analytics)
 *   3. role_locked — Rolle innerhalb des Plans nicht berechtigt
 *   4. read_only   — Lesen erlaubt, Schreiben/Mutieren gesperrt
 *   5. full        — vollstaendiger Zugang
 */
// ── Rollen-Sets ──────────────────────────────────────────────────────────────

const ADMIN_ROLES   = ["platform_admin", "owner", "admin"];
const SENIOR_ROLES  = ["platform_admin", "owner", "admin", "program_manager"];
const MANAGER_ROLES = ["platform_admin", "owner", "admin", "program_manager", "supplier_manager"];

// Plaene, die PRO-Niveau oder hoeher haben
const PRO_PLUS_PLANS = new Set(["PRO", "INDIVIDUELL"]);

// ── Helfer ───────────────────────────────────────────────────────────────────

/** Baut einen Surface-Descriptor: mode + Capability-Flags. */
function surface(mode, caps = {}) {
  return { mode, ...caps };
}

/**
 * true wenn Plan spend_analytics / rate_cards / data_governance zulaesst.
 * Direkte Plan-Tier-Pruefung (kein hasFeature — bypass-sicher).
 */
function isProPlus(plan) {
  if (!plan) return false;
  let p = String(plan).toUpperCase().trim();
  // Backward-compat aliases
  if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
  if (p === "FREE") p = "DEMO";
  return PRO_PLUS_PLANS.has(p) || p.startsWith("INDIVIDUELL_");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {{ plan?: string, role?: string, orgType?: string, orgRole?: string }} ctx
 * @returns {Record<string, { mode: string } & Record<string, boolean>>}
 */
export function resolveEnterpriseSurfaceAccess({ plan = "DEMO", role, orgType, orgRole } = {}) {
  const effectiveOrgType = orgType || role || "";
  const isAgency    = effectiveOrgType === "agency";
  const proPlan     = isProPlus(plan);

  // Role shortcuts
  const isAdmin     = ADMIN_ROLES.includes(orgRole);
  const isSenior    = SENIOR_ROLES.includes(orgRole);
  const isManager   = MANAGER_ROLES.includes(orgRole);
  const isSupplierUser = orgRole === "supplier_user";

  // ── Agency: buyer-only surfaces org_locked; compliance universell ─────────
  if (isAgency) {
    return {
      vendor_pool:         surface("org_locked"),
      supplier_scorecard:  surface("org_locked"),
      rate_cards:          surface("org_locked"),
      spend_analytics:     surface("org_locked"),
      executive_dashboard: surface("org_locked"),
      data_governance:     surface("org_locked"),
      compliance_overview: surface("full", {
        canRead: true, canUpload: true,
        canVerify: isAdmin, canDelete: isAdmin, canManage: isAdmin
      }),
      audit_trail:    surface("full", { canRead: true, canExport: isAdmin, canFilter: true }),
      multi_location: surface("full", { canRead: true, canWrite: isAdmin, canManage: isAdmin })
    };
  }

  // ── Company surfaces ──────────────────────────────────────────────────────

  // vendor_pool — nicht plan-gesperrt; rollenbasiert
  const vpMode = isManager ? "full" : "read_only";

  // supplier_scorecard — nicht plan-gesperrt; rollenbasiert
  const scMode = isManager ? "full" : "read_only";

  // spend_analytics — plan-gesperrt unter PRO
  const saMode = proPlan ? "full" : "plan_locked";

  // rate_cards — plan-gesperrt unter PRO
  const rcMode = proPlan ? "full" : "plan_locked";

  // data_governance — plan-gesperrt UND rollen-gesperrt fuer Nicht-Admins
  let dgMode;
  if (!proPlan)       dgMode = "plan_locked";
  else if (!isAdmin)  dgMode = "role_locked";
  else                dgMode = "full";

  // executive_dashboard — rollen-gesperrt fuer Nicht-Senior
  const edMode = isSenior ? "full" : "role_locked";

  // compliance_overview — differenziertes Rollen-Gating
  let coMode;
  if (isSupplierUser)                 coMode = "role_locked"; // upload-only
  else if (isSenior)                  coMode = "full";
  else                                coMode = "read_only";   // finance, hiring_mgr, etc.

  return {
    vendor_pool: surface(vpMode, {
      canRead:   true,
      canManage: isAdmin,
      canInvite: isManager,
      canWrite:  isManager
    }),

    supplier_scorecard: surface(scMode, {
      canRead:    true,
      canAnnotate: isManager,
      canExport:  true,
      canWrite:   isSenior
    }),

    rate_cards: surface(rcMode, {
      canRead:    proPlan,
      canWrite:   proPlan && isAdmin,
      canPublish: proPlan && isAdmin,
      canExport:  proPlan && (isAdmin || orgRole === "finance")
    }),

    spend_analytics: surface(saMode, {
      canRead:      proPlan,
      canWrite:     proPlan && isAdmin,  // non-admin (e.g. finance) gets full mode but canWrite=false
      canExport:    proPlan,
      canDrilldown: proPlan,
      canCompare:   proPlan && isSenior
    }),

    executive_dashboard: surface(edMode, {
      canRead:   isSenior,
      canExport: isSenior
    }),

    data_governance: surface(dgMode, {
      canRead:      dgMode === "full",
      canExport:    dgMode === "full",
      canAnonymize: dgMode === "full",
      canRetention: dgMode === "full",
      canRequests:  dgMode === "full"
    }),

    compliance_overview: surface(coMode, {
      canRead:   coMode !== "role_locked",
      canUpload: coMode === "full" || isSupplierUser,  // supplier_user can upload even when role_locked
      canVerify: coMode === "full" && isSenior,
      canDelete: coMode === "full" && isAdmin,
      canManage: coMode === "full" && isAdmin
    }),

    audit_trail: surface("full", {
      canRead:   true,
      canExport: isAdmin,
      canFilter: true
    }),

    multi_location: surface("full", {
      canRead:   true,
      canWrite:  isAdmin,
      canManage: isAdmin
    })
  };
}
