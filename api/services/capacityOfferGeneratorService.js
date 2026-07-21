/**
 * capacityOfferGeneratorService.js — Multi-Skill Angebotsgenerator (Welle 3)
 *
 * Kern der USP: aus EINEM Arbeiter mit N strukturierten Skills werden N+1 echte,
 * eigenständige Angebote (1 je Skill + 1 Gesamt-/Bündelangebot) — ohne Fake-Daten.
 * So wirken wenige Zeitarbeitsfirmen wie viele.
 *
 * Erzeugung als 'draft' (umgeht das Plan-Aktiv-Limit beim Bulk-Anlegen; die
 * Aktivierung bleibt der plan-gated Sichtbarkeits-/Upsell-Hebel). Dedup wird vom
 * DB-Unique-Index (capacity_posts_single_skill_unique_idx) atomar erzwungen —
 * ein bereits aktives Einzelskill-Angebot wird hier als 'already_exists' übersprungen.
 *
 * Org-Boundary: der Arbeiter muss zur Org des aufrufenden Agentur-Users gehören.
 * Wiederverwendung: nutzt capacityExchangeService.createCapacityEntry (Plan-/Org-Logik),
 * statt eigene INSERTs zu schreiben.
 */
import * as capacityExchangeService from "./capacityExchangeService.js";

// Kostenlose Premium-Sichtbarkeit (Welle 5b-Teil-1): moderate Boost-Stufe unter dem
// bezahlten Max (3 via premiumListingService) — erhält den Upsell-Hebel.
const PREMIUM_BOOST_LEVEL = 2;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function loadWorkerForOrg(pool, workerProfileId, orgId) {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, city, postal_code, supplier_org_id
       FROM worker_profiles WHERE id = $1`,
    [workerProfileId]
  );
  const worker = rows[0];
  if (!worker) {
    throw Object.assign(new Error("WORKER_NOT_FOUND"), { code: "WORKER_NOT_FOUND" });
  }
  if (worker.supplier_org_id !== orgId) {
    throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
  }
  return worker;
}

async function loadWorkerSkills(pool, workerProfileId) {
  const { rows } = await pool.query(
    `SELECT wps.skill_id, ps.name, ps.category, wps.is_primary
       FROM worker_profile_skills wps
       JOIN platform_skills ps ON ps.id = wps.skill_id
      WHERE wps.worker_profile_id = $1
      ORDER BY wps.is_primary DESC, ps.name`,
    [workerProfileId]
  );
  return rows;
}

async function loadExistingWorkerOffers(pool, workerProfileId) {
  const { rows } = await pool.query(
    `SELECT id, offer_kind, primary_skill_id, status
       FROM capacity_posts
      WHERE worker_profile_id = $1 AND status IN ('draft','active','paused')`,
    [workerProfileId]
  );
  return rows;
}

/**
 * Vorschlagsliste für einen Arbeiter: je Skill ein Einzelangebot + (ab 2 Skills)
 * ein Bündelangebot. Bereits bestehende Angebote werden als already_exists markiert
 * (nicht erneut vorgeschlagen zum Anlegen, aber sichtbar).
 */
export async function buildOfferSuggestions(pool, { orgId, workerProfileId }) {
  const worker = await loadWorkerForOrg(pool, workerProfileId, orgId);
  const skills = await loadWorkerSkills(pool, workerProfileId);
  const existing = await loadExistingWorkerOffers(pool, workerProfileId);

  const existingSingleBySkill = new Map();
  let existingBundleId = null;
  for (const offer of existing) {
    if (offer.offer_kind === "single_skill" && offer.primary_skill_id) {
      existingSingleBySkill.set(offer.primary_skill_id, offer.id);
    } else if (offer.offer_kind === "bundle") {
      existingBundleId = offer.id;
    }
  }

  const single = skills.map((s) => ({
    kind: "single_skill",
    skill_id: s.skill_id,
    skill_name: s.name,
    category: s.category,
    already_exists: existingSingleBySkill.has(s.skill_id),
    existing_offer_id: existingSingleBySkill.get(s.skill_id) || null
  }));

  const bundle = skills.length >= 2
    ? {
        kind: "bundle",
        skill_ids: skills.map((s) => s.skill_id),
        skill_names: skills.map((s) => s.name),
        already_exists: !!existingBundleId,
        existing_offer_id: existingBundleId
      }
    : null;

  const newSingle = single.filter((s) => !s.already_exists).length;
  const suggested_new_offers = newSingle + (bundle && !bundle.already_exists ? 1 : 0);

  return {
    worker: {
      id: worker.id,
      name: `${worker.first_name || ""} ${worker.last_name || ""}`.trim(),
      city: worker.city,
      postal_code: worker.postal_code
    },
    location_ready: !!(worker.city && String(worker.city).trim()),
    skill_count: skills.length,
    existing_offer_count: existing.length,
    suggested_new_offers,
    single,
    bundle
  };
}

/** Reine Abbildung: Einzelskill-Angebotsdaten für createCapacityEntry. */
export function buildSingleSkillOfferData({ worker, skill, orgId, priorityLevel = "normal", placementBoostLevel = 0 }) {
  return {
    title: skill.name,
    role: skill.name,
    skill_tags: [skill.name],
    headcount: 1,
    availability_from: todayIso(),
    location_city: worker.city,
    location_postal: worker.postal_code || null,
    worker_category: skill.category || null,
    status: "draft",
    org_id: orgId,
    department_id: null,
    worker_profile_id: worker.id,
    primary_skill_id: skill.skill_id,
    offer_kind: "single_skill",
    priority_level: priorityLevel,
    placement_boost_level: placementBoostLevel,
    is_anonymous: true
  };
}

/** Reine Abbildung: Bündel-/Gesamtangebotsdaten für createCapacityEntry. */
export function buildBundleOfferData({ worker, skills, orgId, priorityLevel = "normal", placementBoostLevel = 0 }) {
  const primary = skills.find((s) => s.is_primary) || skills[0] || null;
  return {
    title: `Allround-Kraft – ${skills.length} Fähigkeiten`,
    role: primary ? primary.name : "Fachkraft",
    skill_tags: skills.map((s) => s.name),
    headcount: 1,
    availability_from: todayIso(),
    location_city: worker.city,
    location_postal: worker.postal_code || null,
    worker_category: primary ? primary.category : null,
    status: "draft",
    org_id: orgId,
    department_id: null,
    worker_profile_id: worker.id,
    primary_skill_id: primary ? primary.skill_id : null,
    offer_kind: "bundle",
    priority_level: priorityLevel,
    placement_boost_level: placementBoostLevel,
    is_anonymous: true
  };
}

/**
 * Erzeugt die ausgewählten Angebote als Entwürfe. Skills, die nicht zum Arbeiter
 * gehören, werden übersprungen; Dedup-Kollisionen (23505) und Plan-Limits werden
 * je Angebot abgefangen und als skipped gemeldet.
 * `createEntry` ist injizierbar (Test), default = echte createCapacityEntry.
 */
export async function createOffersFromSelection(
  pool,
  { supplierUserId, orgId, plan, workerProfileId, single_skill_ids = [], include_bundle = false, priority_level = "normal", premium = false },
  { createEntry = capacityExchangeService.createCapacityEntry } = {}
) {
  const worker = await loadWorkerForOrg(pool, workerProfileId, orgId);
  if (!worker.city || !String(worker.city).trim()) {
    throw Object.assign(new Error("LOCATION_REQUIRED"), { code: "LOCATION_REQUIRED" });
  }
  const skills = await loadWorkerSkills(pool, workerProfileId);
  const skillById = new Map(skills.map((s) => [s.skill_id, s]));
  const placementBoostLevel = premium ? PREMIUM_BOOST_LEVEL : 0;

  const created = [];
  const skipped = [];

  for (const skillId of [...new Set(single_skill_ids)]) {
    const skill = skillById.get(skillId);
    if (!skill) {
      skipped.push({ kind: "single_skill", skill_id: skillId, reason: "not_a_worker_skill" });
      continue;
    }
    try {
      const entry = await createEntry(pool, supplierUserId, plan, buildSingleSkillOfferData({ worker, skill, orgId, priorityLevel: priority_level, placementBoostLevel }));
      created.push({ id: entry.id, kind: "single_skill", skill_id: skillId, skill_name: skill.name });
    } catch (e) {
      if (e.code === "23505") skipped.push({ kind: "single_skill", skill_id: skillId, reason: "already_exists" });
      else if (e.code === "PLAN_LIMIT") skipped.push({ kind: "single_skill", skill_id: skillId, reason: "plan_limit" });
      else throw e;
    }
  }

  if (include_bundle && skills.length >= 2) {
    try {
      const entry = await createEntry(pool, supplierUserId, plan, buildBundleOfferData({ worker, skills, orgId, priorityLevel: priority_level, placementBoostLevel }));
      created.push({ id: entry.id, kind: "bundle", skill_ids: skills.map((s) => s.skill_id) });
    } catch (e) {
      if (e.code === "23505") skipped.push({ kind: "bundle", reason: "already_exists" });
      else if (e.code === "PLAN_LIMIT") skipped.push({ kind: "bundle", reason: "plan_limit" });
      else throw e;
    }
  }

  return { created, skipped, created_count: created.length, skipped_count: skipped.length };
}

/* ── Sammelangebote / Pool (Welle 4a) ───────────────────────────────────────── */

/**
 * Vorschau für ein Sammelangebot: alle Arbeiter der Org mit einem bestimmten Skill,
 * inkl. Frei-Markierung (kein aktiver Einsatz). Basis für "N Helfer auf einmal anbieten".
 */
export async function buildPoolSuggestion(pool, { orgId, skillId }) {
  const skillRes = await pool.query(
    `SELECT id, name, category FROM platform_skills WHERE id = $1 AND is_active = TRUE`,
    [skillId]
  );
  const skill = skillRes.rows[0];
  if (!skill) throw Object.assign(new Error("SKILL_NOT_FOUND"), { code: "SKILL_NOT_FOUND" });

  const { rows } = await pool.query(
    `SELECT wp.id AS worker_profile_id, wp.first_name, wp.last_name, wp.city,
            COALESCE((SELECT COUNT(*) FROM worker_assignment_links wal
                       WHERE wal.worker_user_id = wp.user_id AND wal.is_active = TRUE), 0) AS active_assignments
       FROM worker_profile_skills wps
       JOIN worker_profiles wp ON wp.id = wps.worker_profile_id
      WHERE wps.skill_id = $1 AND wp.supplier_org_id = $2 AND wp.is_active = TRUE
      ORDER BY wp.last_name, wp.first_name`,
    [skillId, orgId]
  );
  const members = rows.map((r) => ({
    worker_profile_id: r.worker_profile_id,
    name: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
    city: r.city || null,
    free: Number(r.active_assignments) === 0
  }));
  return {
    skill_id: skill.id,
    skill_name: skill.name,
    category: skill.category,
    total: members.length,
    free_count: members.filter((m) => m.free).length,
    members
  };
}

/**
 * Erzeugt EIN Sammelangebot (offer_kind pool_single_skill), das mehrere Arbeiter mit
 * demselben Skill bündelt (headcount = Mitgliederzahl). Mitglieder werden org- und
 * skill-validiert; die Angebots-Stadt ist die häufigste Mitglieder-Stadt (sonst
 * "Mehrere Standorte"). Als Entwurf erstellt (Aktivierung bleibt plan-gated).
 */
export async function createPoolOffer(
  pool,
  { supplierUserId, orgId, plan, skillId, workerProfileIds = [], priority_level = "normal", premium = false },
  { createEntry = capacityExchangeService.createCapacityEntry } = {}
) {
  const skillRes = await pool.query(
    `SELECT id, name, category FROM platform_skills WHERE id = $1 AND is_active = TRUE`,
    [skillId]
  );
  const skill = skillRes.rows[0];
  if (!skill) throw Object.assign(new Error("SKILL_NOT_FOUND"), { code: "SKILL_NOT_FOUND" });

  const ids = [...new Set((workerProfileIds || []).filter(Boolean))];
  if (!ids.length) throw Object.assign(new Error("POOL_EMPTY"), { code: "POOL_EMPTY" });

  // Nur Mitglieder, die zur Org gehören UND den Skill besitzen (Datenisolation).
  const { rows: valid } = await pool.query(
    `SELECT wp.id, wp.city
       FROM worker_profiles wp
       JOIN worker_profile_skills wps ON wps.worker_profile_id = wp.id AND wps.skill_id = $2
      WHERE wp.id = ANY($1::uuid[]) AND wp.supplier_org_id = $3 AND wp.is_active = TRUE`,
    [ids, skillId, orgId]
  );
  if (!valid.length) throw Object.assign(new Error("NO_VALID_MEMBERS"), { code: "NO_VALID_MEMBERS" });

  const memberIds = valid.map((r) => r.id);
  const cityCounts = new Map();
  for (const r of valid) {
    const c = (r.city || "").trim();
    if (c) cityCounts.set(c, (cityCounts.get(c) || 0) + 1);
  }
  let city = "Mehrere Standorte";
  if (cityCounts.size) city = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const entry = await createEntry(pool, supplierUserId, plan, {
    title: `${skill.name} – ${memberIds.length} verfügbar`,
    role: skill.name,
    skill_tags: [skill.name],
    headcount: memberIds.length,
    availability_from: todayIso(),
    location_city: city,
    worker_category: skill.category || null,
    status: "draft",
    org_id: orgId,
    department_id: null,
    worker_profile_id: null,
    primary_skill_id: skillId,
    offer_kind: "pool_single_skill",
    priority_level,
    placement_boost_level: premium ? PREMIUM_BOOST_LEVEL : 0,
    is_anonymous: true
  });

  await pool.query(
    `INSERT INTO capacity_post_pool_members (capacity_post_id, worker_profile_id)
     SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
    [entry.id, memberIds]
  );

  return {
    id: entry.id,
    offer_kind: "pool_single_skill",
    skill_id: skillId,
    skill_name: skill.name,
    member_count: memberIds.length,
    location_city: city
  };
}
