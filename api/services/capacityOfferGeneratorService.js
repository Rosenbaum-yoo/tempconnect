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
export function buildSingleSkillOfferData({ worker, skill, orgId, priorityLevel = "normal" }) {
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
    is_anonymous: true
  };
}

/** Reine Abbildung: Bündel-/Gesamtangebotsdaten für createCapacityEntry. */
export function buildBundleOfferData({ worker, skills, orgId, priorityLevel = "normal" }) {
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
  { supplierUserId, orgId, plan, workerProfileId, single_skill_ids = [], include_bundle = false, priority_level = "normal" },
  { createEntry = capacityExchangeService.createCapacityEntry } = {}
) {
  const worker = await loadWorkerForOrg(pool, workerProfileId, orgId);
  if (!worker.city || !String(worker.city).trim()) {
    throw Object.assign(new Error("LOCATION_REQUIRED"), { code: "LOCATION_REQUIRED" });
  }
  const skills = await loadWorkerSkills(pool, workerProfileId);
  const skillById = new Map(skills.map((s) => [s.skill_id, s]));

  const created = [];
  const skipped = [];

  for (const skillId of [...new Set(single_skill_ids)]) {
    const skill = skillById.get(skillId);
    if (!skill) {
      skipped.push({ kind: "single_skill", skill_id: skillId, reason: "not_a_worker_skill" });
      continue;
    }
    try {
      const entry = await createEntry(pool, supplierUserId, plan, buildSingleSkillOfferData({ worker, skill, orgId, priorityLevel: priority_level }));
      created.push({ id: entry.id, kind: "single_skill", skill_id: skillId, skill_name: skill.name });
    } catch (e) {
      if (e.code === "23505") skipped.push({ kind: "single_skill", skill_id: skillId, reason: "already_exists" });
      else if (e.code === "PLAN_LIMIT") skipped.push({ kind: "single_skill", skill_id: skillId, reason: "plan_limit" });
      else throw e;
    }
  }

  if (include_bundle && skills.length >= 2) {
    try {
      const entry = await createEntry(pool, supplierUserId, plan, buildBundleOfferData({ worker, skills, orgId, priorityLevel: priority_level }));
      created.push({ id: entry.id, kind: "bundle", skill_ids: skills.map((s) => s.skill_id) });
    } catch (e) {
      if (e.code === "23505") skipped.push({ kind: "bundle", reason: "already_exists" });
      else if (e.code === "PLAN_LIMIT") skipped.push({ kind: "bundle", reason: "plan_limit" });
      else throw e;
    }
  }

  return { created, skipped, created_count: created.length, skipped_count: skipped.length };
}
