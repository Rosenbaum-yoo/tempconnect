/**
 * Enterprise Onboarding Service — persistent, role-aware checklist.
 *
 * Extends the existing users.onboarding_completed flag with granular,
 * per-step tracking in user_onboarding_progress. Each step supports
 * auto-detection (probing real platform activity) and manual completion.
 *
 * Step catalog is extensible — add new steps by appending to STEP_CATALOG.
 */

import { markOnboardingComplete } from "./userService.js";

/* ── Step Catalog ──────────────────────────────────────────────── */

/**
 * Each step defines:
 *  - key:          unique identifier stored in DB
 *  - label:        German display label
 *  - description:  short guidance text
 *  - icon:         emoji icon
 *  - link:         direct CTA path (frontend route)
 *  - roles:        which roles see this step (null = all)
 *  - order:        display order
 *  - detect:       async (pool, userId, orgId) => boolean — auto-detection probe
 */
export const STEP_CATALOG = [
  {
    key: "profile_complete",
    label: "Profil vervollständigen",
    description: "Firmenname, Stadt und Telefon ausfüllen.",
    icon: "👤",
    link: "/public/sla_profil.html",
    roles: null,
    order: 1,
    detect: async (pool, userId) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM users
         WHERE id = $1
           AND company_name IS NOT NULL AND TRIM(company_name) != ''
           AND city IS NOT NULL AND TRIM(city) != ''
           AND phone IS NOT NULL AND TRIM(phone) != ''`,
        [userId]
      );
      return rows.length > 0;
    }
  },
  {
    key: "org_configured",
    label: "Organisation konfigurieren",
    description: "Organisation erstellen oder beitreten.",
    icon: "🏢",
    link: "/public/sla_profil.html",
    roles: ["company", "agency", "admin"],
    order: 2,
    detect: async (pool, userId) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM org_memberships om
         JOIN organizations o ON o.id = om.org_id AND o.is_active = TRUE
         WHERE om.user_id = $1 AND om.is_active = TRUE LIMIT 1`,
        [userId]
      );
      return rows.length > 0;
    }
  },
  {
    key: "first_capacity",
    label: "Erstes Angebot / Personal einstellen",
    description: "Stellen Sie Ihr erstes Angebot oder Personal in der Vermittlung ein.",
    icon: "📋",
    link: "/public/capacity_exchange_form.html",
    roles: ["agency", "company"],
    order: 3,
    detect: async (pool, userId) => {
      // Check listings or capacity posts
      const { rows: listings } = await pool.query(
        "SELECT 1 FROM listings WHERE owner_id = $1 LIMIT 1", [userId]
      );
      if (listings.length > 0) return true;
      const { rows: caps } = await pool.query(
        "SELECT 1 FROM capacity_posts WHERE user_id = $1 LIMIT 1", [userId]
      );
      return caps.length > 0;
    }
  },
  {
    key: "first_request",
    label: "Erste Anfrage senden oder erhalten",
    description: "Senden oder beantworten Sie Ihre erste Personalanfrage.",
    icon: "📨",
    link: "/public/capacity_search.html",
    roles: ["company", "agency"],
    order: 4,
    detect: async (pool, userId) => {
      const { rows } = await pool.query(
        "SELECT 1 FROM requests WHERE requester_id = $1 OR receiver_id = $1 LIMIT 1",
        [userId]
      );
      return rows.length > 0;
    }
  },
  {
    key: "first_deal",
    label: "Ersten Deal abschließen",
    description: "Schließen Sie Ihren ersten Deal erfolgreich ab.",
    icon: "🎯",
    link: "/public/company_requests.html",
    roles: ["company", "agency"],
    order: 5,
    detect: async (pool, userId) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM requests
         WHERE (requester_id = $1 OR receiver_id = $1)
           AND status IN ('accepted', 'completed', 'finalized')
         LIMIT 1`,
        [userId]
      );
      return rows.length > 0;
    }
  },
  {
    key: "team_invited",
    label: "Teammitglied einladen",
    description: "Laden Sie ein weiteres Teammitglied in Ihre Organisation ein.",
    icon: "👥",
    link: "/public/sla_profil.html",
    roles: ["company", "agency", "admin"],
    order: 6,
    detect: async (pool, _userId, orgId) => {
      if (!orgId) return false;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM org_memberships
         WHERE org_id = $1 AND is_active = TRUE`,
        [orgId]
      );
      return (rows[0]?.cnt || 0) >= 2;
    }
  },
  {
    key: "platform_explored",
    label: "Plattform erkunden",
    description: "Erkunden Sie die wichtigsten Bereiche der Plattform.",
    icon: "🚀",
    link: "/public/enterprise.html",
    roles: null,
    order: 7,
    detect: (_pool, _userId) => {
      // This step is completed manually by the user or by dismissing the checklist.
      return false;
    }
  }
];

/* ── Helpers ───────────────────────────────────────────────────── */

/**
 * Filter steps by user role.
 * @param {string} role - user role (company, agency, worker, admin)
 * @returns {Array} filtered step definitions
 */
export function getStepsForRole(role) {
  return STEP_CATALOG.filter(step => {
    if (!step.roles) return true;
    return step.roles.includes(role);
  }).sort((a, b) => a.order - b.order);
}

/* ── Core API ──────────────────────────────────────────────────── */

/**
 * Get full onboarding status for a user.
 * Reads persisted progress + runs auto-detection for missing steps.
 * @param {import('pg').Pool} pool
 * @param {number} userId
 * @param {{ role?: string, orgId?: string, onboardingCompleted?: boolean }} context
 * @returns {Promise<Object>}
 */
export async function getOnboardingStatus(pool, userId, context = {}) {
  const role = context.role || "company";
  const orgId = context.orgId || null;
  const onboardingCompleted = context.onboardingCompleted || false;

  // 1. Get applicable steps for this role
  const catalog = getStepsForRole(role);

  // 2. Load persisted progress
  const { rows: progressRows } = await pool.query(
    `SELECT step_key, completed, completed_at, auto_detected
     FROM user_onboarding_progress
     WHERE user_id = $1`,
    [userId]
  );
  const progressMap = {};
  for (const r of progressRows) {
    progressMap[r.step_key] = r;
  }

  // 3. Auto-detect missing steps (fire-and-forget persists)
  const autoDetected = [];
  for (const step of catalog) {
    if (progressMap[step.key]?.completed) continue; // already done

    try {
      const detected = await step.detect(pool, userId, orgId);
      if (detected) {
        autoDetected.push(step.key);
        progressMap[step.key] = { completed: true, completed_at: new Date().toISOString(), auto_detected: true };
      }
    } catch {
      // Detection probe failed — skip silently
    }
  }

  // Persist auto-detected steps (batch)
  if (autoDetected.length > 0) {
    for (const stepKey of autoDetected) {
      try {
        await pool.query(
          `INSERT INTO user_onboarding_progress (user_id, org_id, step_key, completed, completed_at, auto_detected)
           VALUES ($1, $2, $3, TRUE, NOW(), TRUE)
           ON CONFLICT (user_id, step_key) DO UPDATE SET
             completed = TRUE, completed_at = NOW(), auto_detected = TRUE, updated_at = NOW()`,
          [userId, orgId, stepKey]
        );
      } catch {
        // Non-critical — table may not exist yet
      }
    }
  }

  // 4. Build response
  const steps = catalog.map(step => {
    const progress = progressMap[step.key];
    return {
      key:           step.key,
      label:         step.label,
      description:   step.description,
      icon:          step.icon,
      link:          step.link,
      completed:     progress?.completed || false,
      completed_at:  progress?.completed_at || null,
      auto_detected: progress?.auto_detected || false
    };
  });

  const completedCount = steps.filter(s => s.completed).length;
  const totalCount = steps.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Suggested next step
  const suggestedNext = steps.find(s => !s.completed) || null;

  return {
    onboarding_completed: onboardingCompleted,
    dismissed: onboardingCompleted,
    role,
    steps,
    completed_count: completedCount,
    total_count: totalCount,
    progress_pct: onboardingCompleted ? 100 : progressPct,
    suggested_next: suggestedNext ? suggestedNext.key : null,
    suggested_next_link: suggestedNext ? suggestedNext.link : null
  };
}

/**
 * Manually mark a step as complete.
 * @param {import('pg').Pool} pool
 * @param {number} userId
 * @param {string} stepKey
 * @param {string|null} orgId
 * @returns {Promise<boolean>} true if step was found in catalog
 */
export async function completeStep(pool, userId, stepKey, orgId = null) {
  const validKeys = STEP_CATALOG.map(s => s.key);
  if (!validKeys.includes(stepKey)) return false;

  await pool.query(
    `INSERT INTO user_onboarding_progress (user_id, org_id, step_key, completed, completed_at, auto_detected)
     VALUES ($1, $2, $3, TRUE, NOW(), FALSE)
     ON CONFLICT (user_id, step_key) DO UPDATE SET
       completed = TRUE, completed_at = NOW(), updated_at = NOW()`,
    [userId, orgId, stepKey]
  );
  return true;
}

/**
 * Dismiss the onboarding checklist entirely.
 * Marks users.onboarding_completed = TRUE + completes platform_explored step.
 * @param {import('pg').Pool} pool
 * @param {number} userId
 * @param {string|null} orgId
 */
export async function dismissChecklist(pool, userId, orgId = null) {
  await markOnboardingComplete(pool, userId);
  await completeStep(pool, userId, "platform_explored", orgId);
}

/**
 * Legacy compatibility: build the 3-step response shape expected by onboardingWizard.js.
 * @param {Object} fullStatus - from getOnboardingStatus
 * @returns {Object} legacy-shaped response
 */
export function toLegacyFormat(fullStatus) {
  const stepMap = {};
  for (const s of fullStatus.steps) {
    stepMap[s.key] = s;
  }

  const profileDone = stepMap.profile_complete?.completed || false;
  const orgDone = stepMap.org_configured?.completed || false;
  const firstActionDone = stepMap.first_capacity?.completed || stepMap.first_request?.completed || false;

  const steps = {
    profile_basics: {
      done: profileDone,
      fields_filled: profileDone ? 3 : 0,
      fields_total: 5
    },
    company_profile: {
      done: orgDone,
      completeness_pct: orgDone ? 100 : 0
    },
    first_action: {
      done: firstActionDone,
      type: fullStatus.role === "agency" ? "capacity" : fullStatus.role === "worker" ? "assignment" : "demand"
    }
  };

  const doneCount = [profileDone, orgDone, firstActionDone].filter(Boolean).length;
  const legacyPct = Math.round((doneCount / 3) * 100);

  let suggestedNext = null;
  if (!profileDone) suggestedNext = "profile_basics";
  else if (!orgDone) suggestedNext = "company_profile";
  else if (!firstActionDone) suggestedNext = "first_action";

  return {
    onboarding_completed: fullStatus.onboarding_completed,
    role: fullStatus.role,
    steps,
    suggested_next: suggestedNext,
    progress_pct: fullStatus.onboarding_completed ? 100 : legacyPct
  };
}
