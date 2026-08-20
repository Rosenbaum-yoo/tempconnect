/**
 * Konsolidierte Matching-Engine: einheitliches Multi-Faktor-Scoring fuer
 * Requisitions, Demands, SLA-Jobs -> Capacity Posts.
 * Erklaerbarkeit: jeder Score-Beitrag wird als Reason zurueckgegeben.
 * Konsolidiert Logik aus marketplaceService.scoreMatch, slaSearchService.scoreJobAgainstCapacity,
 * capacityService.haversineKm.
 */
import { normalizeTags, loadSkillIndex } from "./skillNormalizationService.js";

/** Haversine-Distanz in km */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(Number(lat1))) * Math.cos(toRad(Number(lat2))) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Gewichtungs-Konfiguration (anpassbar pro Use-Case)
 * Summe der max-Werte = 100
 */
/** Preferred-First Boost: Extra-Punkte fuer PREFERRED-Vendors wenn aktiv */
export const PREFERRED_FIRST_BOOST = 15;

const DEFAULT_WEIGHTS = {
  role: 30,           // exakte Rollen-Uebereinstimmung
  skills: 25,         // Tag-Overlap (max 5 Tags je 5 Punkte)
  location: 25,       // Entfernung innerhalb Radius
  availability: 10,   // Zeitraum-Overlap
  verified: 5,        // verifizierter Supplier
  vendorPool: 5       // im Vendor Pool des Clients (Preferred Tier Bonus)
};

/**
 * Multi-Faktor-Score fuer eine Demand/Requisition gegen ein Capacity Post.
 * @param {Object} demand – Nachfrage (requisition, demand_request, search_job)
 * @param {Object} cap – Angebot (capacity_post)
 * @param {Object} opts – { supplierVerified, vendorPoolTier, weights }
 * @returns {{ score: number, reasons: Array<{factor: string, points: number, max: number, detail: string}> }}
 */
export function scoreMatch(demand, cap, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const reasons = [];
  let score = 0;

  // ── 1) Rolle ──────────────────────────────────────────
  const dRole = (demand.role || '').toLowerCase().trim();
  const cRole = (cap.role || '').toLowerCase().trim();
  if (dRole && cRole) {
    if (dRole === cRole) {
      score += weights.role;
      reasons.push({ factor: 'role', points: weights.role, max: weights.role, detail: `Rolle "${cRole}" stimmt ueberein`, meta: { mode: 'exact', role: cap.role || cRole } });
    } else if (cRole.includes(dRole) || dRole.includes(cRole)) {
      const partial = Math.round(weights.role * 0.5);
      score += partial;
      reasons.push({ factor: 'role', points: partial, max: weights.role, detail: `Rolle teilweise: "${dRole}" / "${cRole}"`, meta: { mode: 'partial', role: cap.role || cRole, demandRole: demand.role || dRole } });
    } else {
      reasons.push({ factor: 'role', points: 0, max: weights.role, detail: `Rolle nicht passend`, meta: { mode: 'none', role: cap.role || cRole, demandRole: demand.role || dRole } });
    }
  }

  // ── 2) Skills / Tags ─────────────────────────────────
  // Mit Katalog-Index (Welle 11) werden Schreibweisen auf die kanonische Faehigkeit
  // abgebildet: "Seniorenpflege" und "Altenpflege" sind dann derselbe Skill. Ohne Index
  // bleibt es beim Vergleich der kleingeschriebenen Rohform — exakt wie vorher.
  const skillIndex = opts.skillIndex || null;
  const dTags = normalizeTags(demand.skill_tags || [], skillIndex);
  const cTags = normalizeTags(cap.skill_tags || [], skillIndex);
  if (dTags.size > 0 && cTags.size > 0) {
    let overlap = 0;
    dTags.forEach(t => { if (cTags.has(t)) overlap++; });
    const maxTags = Math.min(5, dTags.size);
    const pts = Math.min(weights.skills, Math.round((overlap / maxTags) * weights.skills));
    score += pts;
    reasons.push({ factor: 'skills', points: pts, max: weights.skills, detail: `${overlap}/${dTags.size} Skills uebereinstimmend`, meta: { overlap, required: dTags.size, normalized: !!skillIndex } });
  }

  // ── 3) Standort / Entfernung ─────────────────────────
  const dLat = demand.latitude ?? demand.location_lat;
  const dLng = demand.longitude ?? demand.location_lng;
  const cLat = cap.location_lat ?? cap.latitude;
  const cLng = cap.location_lng ?? cap.longitude;

  if (dLat != null && dLng != null && cLat != null && cLng != null) {
    const dist = haversineKm(dLat, dLng, cLat, cLng);
    const maxR = Math.max(demand.radius_km || 25, cap.radius_km || 25);
    if (dist <= maxR) {
      const distScore = Math.max(0, weights.location - Math.floor((dist / maxR) * weights.location));
      score += distScore;
      reasons.push({ factor: 'location', points: distScore, max: weights.location, detail: `${Math.round(dist)} km Entfernung (max ${maxR} km)`, meta: { km: Math.round(dist), maxKm: maxR, withinRadius: true } });
    } else {
      reasons.push({ factor: 'location', points: 0, max: weights.location, detail: `Zu weit: ${Math.round(dist)} km (max ${maxR} km)`, meta: { km: Math.round(dist), maxKm: maxR, withinRadius: false } });
    }
  } else {
    // Fallback: Stadt-Vergleich
    const dCity = (demand.location_city || '').toLowerCase().trim();
    const cCity = (cap.location_city || '').toLowerCase().trim();
    if (dCity && cCity && dCity === cCity) {
      const pts = Math.round(weights.location * 0.6);
      score += pts;
      reasons.push({ factor: 'location', points: pts, max: weights.location, detail: `Stadt "${cCity}" stimmt ueberein`, meta: { city: cap.location_city || cCity } });
    }
  }

  // ── 4) Verfuegbarkeit / Zeitraum ─────────────────────
  const dStart = demand.start_date;
  const dEnd = demand.end_date || demand.start_date;
  const cFrom = cap.availability_from;
  const cTo = cap.availability_to || cap.availability_from;
  if (dStart && cFrom) {
    if (cFrom <= dEnd && (!cTo || cTo >= dStart)) {
      score += weights.availability;
      reasons.push({ factor: 'availability', points: weights.availability, max: weights.availability, detail: 'Verfuegbarkeit passt', meta: { fits: true, from: cFrom, to: cTo || null } });
    } else {
      reasons.push({ factor: 'availability', points: 0, max: weights.availability, detail: 'Zeitraum passt nicht', meta: { fits: false, from: cFrom, to: cTo || null } });
    }
  }

  // ── 5) Verifiziert ───────────────────────────────────
  if (opts.supplierVerified) {
    score += weights.verified;
    reasons.push({ factor: 'verified', points: weights.verified, max: weights.verified, detail: 'Supplier verifiziert', meta: { verified: true } });
  }

  // ── 6) Vendor Pool Bonus ─────────────────────────────
  if (opts.vendorPoolTier) {
    const tierBonus = opts.vendorPoolTier === 'PREFERRED' ? weights.vendorPool : Math.round(weights.vendorPool * 0.5);
    score += tierBonus;
    reasons.push({ factor: 'vendorPool', points: tierBonus, max: weights.vendorPool, detail: `Vendor Pool Tier: ${opts.vendorPoolTier}`, meta: { tier: opts.vendorPoolTier } });
  }

  // ── 7) Compliance Bonus (opt-in) ───────────────────────
  if (opts.complianceScore != null && opts.complianceScore > 0) {
    const maxPts = 7;
    const pts = Math.min(maxPts, Math.round((opts.complianceScore / 100) * maxPts));
    score += pts;
    reasons.push({ factor: 'compliance', points: pts, max: maxPts, detail: `Compliance ${opts.complianceScore}% erfuellt`, meta: { pct: opts.complianceScore } });
  }

  // ── 8) Rate-Kompatibilitaet (opt-in) ───────────────────
  if (opts.rateCompatible === true) {
    const pts = 5;
    score += pts;
    reasons.push({ factor: 'rate', points: pts, max: 5, detail: 'Stundensatz innerhalb Budget', meta: { compatible: true } });
  } else if (opts.rateCompatible === false) {
    reasons.push({ factor: 'rate', points: 0, max: 5, detail: 'Stundensatz ueber Budget', meta: { compatible: false } });
  }

  // ── 9) Urgency / Notdienst Boost (opt-in) ─────────────
  if (opts.urgencyBoost) {
    const pts = 5;
    score += pts;
    reasons.push({ factor: 'urgency', points: pts, max: 5, detail: 'Dringend / Notdienst — priorisiert' });
  }

  // ── 10) Worker Count Match (opt-in) ────────────────────
  if (opts.workerCountMatch === true) {
    const pts = 3;
    score += pts;
    reasons.push({ factor: 'workerCount', points: pts, max: 3, detail: 'Personalkapazitaet ausreichend', meta: { sufficient: true } });
  } else if (opts.workerCountMatch === false) {
    reasons.push({ factor: 'workerCount', points: 0, max: 3, detail: 'Personalkapazitaet nicht ausreichend', meta: { sufficient: false } });
  }

  // ── 11) Reputation Score (opt-in) ─────────────────────
  if (opts.reputationScore != null && opts.reputationScore > 0) {
    const maxPts = 8;
    const pts = Math.min(maxPts, Math.round((opts.reputationScore / 100) * maxPts));
    score += pts;
    reasons.push({ factor: 'reputation', points: pts, max: maxPts, detail: `Reputation ${Math.round(opts.reputationScore)}/100`, meta: { score: Math.round(opts.reputationScore) } });
  }

  // ── 12) Preferred-First Boost (opt-in) ─────────────────
  if (opts.preferredFirst && opts.vendorPoolTier === 'PREFERRED') {
    const pts = PREFERRED_FIRST_BOOST;
    score += pts;
    reasons.push({ factor: 'preferredFirst', points: pts, max: pts, detail: 'Bevorzugter Dienstleister — Preferred-First aktiv' });
  }

  // ── 13) Smart Rank / AI Score (opt-in) ────────────────
  if (opts.smartRankScore != null && opts.smartRankScore > 0) {
    const maxPts = 10;
    const pts = Math.min(maxPts, Math.round((opts.smartRankScore / 100) * maxPts));
    score += pts;
    const level = opts.smartRankLabel || (opts.smartRankScore >= 85 ? 'Exzellent' : opts.smartRankScore >= 70 ? 'Stark' : opts.smartRankScore >= 50 ? 'Solide' : 'Aufbauend');
    reasons.push({ factor: 'smartRank', points: pts, max: maxPts, detail: `Smart Rank ${Math.round(opts.smartRankScore)}/100 (${level})`, meta: { score: Math.round(opts.smartRankScore), label: level } });
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Klassifiziert einen Match-Score in lesbares Quality Label.
 * @param {number} score 0-100
 * @returns {'excellent'|'good'|'fair'|'weak'}
 */
export function classifyMatch(score) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'weak';
}

/**
 * Batch-Matching: Requisition/Demand gegen alle aktiven Capacity Posts.
 * Gibt Top-N zurueck, sortiert nach Score.
 */
export async function matchRequisition(pool, demand, opts = {}) {
  const verifiedIds = opts.verifiedSupplierIds || new Set();
  const vendorPoolMap = opts.vendorPoolMap || new Map();  // supplierId -> tier
  const topN = opts.topN || 25;
  const minScore = opts.minScore || 1;

  const { rows: caps } = await pool.query(
    `SELECT * FROM capacity_posts WHERE is_active = TRUE`
  );

  // Einmal je Lauf, nicht je Kandidat (Welle 11).
  const skillIndex = opts.skillIndex !== undefined ? opts.skillIndex : await loadSkillIndex(pool);

  const scored = [];
  for (const cap of caps) {
    const { score, reasons } = scoreMatch(demand, cap, {
      supplierVerified: verifiedIds.has(cap.supplier_company_id),
      vendorPoolTier: vendorPoolMap.get(cap.supplier_company_id) || null,
      weights: opts.weights,
      skillIndex
    });
    if (score >= minScore) {
      scored.push({ capacity_post: cap, score, reasons });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/**
 * Auto-Match: fuer eine Requisition passende Capacity Posts finden und als Candidates speichern.
 */
export async function autoMatchRequisition(pool, requisitionId, requisitionData, opts = {}) {
  const matches = await matchRequisition(pool, requisitionData, opts);

  for (const m of matches) {
    await pool.query(
      `INSERT INTO requisition_candidates
       (requisition_id, capacity_post_id, match_score, match_reasons, status)
       VALUES ($1, $2, $3, $4, 'suggested')
       ON CONFLICT (requisition_id, capacity_post_id) DO UPDATE SET
         match_score = EXCLUDED.match_score, match_reasons = EXCLUDED.match_reasons, updated_at = NOW()`,
      [requisitionId, m.capacity_post.id, m.score, JSON.stringify(m.reasons)]
    );
  }

  return { candidateCount: matches.length, matchCount: matches.length, matches };
}

/**
 * Reverse Matching: fuer ein Capacity Post passende offene Requisitions finden.
 * Wandelt das Capacity Post in ein "demand"-aehnliches Objekt um und scored alle offenen Requisitions dagegen.
 * @param {import('pg').Pool} pool
 * @param {string} capacityPostId
 * @param {Object} opts - { topN, minScore, verifiedSupplierIds, vendorPoolMap }
 * @returns {Array<{ requisition, score, reasons }>}
 */
export async function matchCapacityToRequisitions(pool, capacityPostId, opts = {}) {
  const topN = opts.topN || 25;
  const minScore = opts.minScore || 1;

  // Load the capacity post
  const { rows: capRows } = await pool.query('SELECT * FROM capacity_posts WHERE id = $1', [capacityPostId]);
  const cap = capRows[0];
  if (!cap) return [];

  // Load open requisitions
  const { rows: reqs } = await pool.query(
    `SELECT * FROM requisitions WHERE status IN ('OPEN','IN_REVIEW','SHORTLISTED')`
  );

  // Also load open demand_requests
  const { rows: demands } = await pool.query(
    `SELECT * FROM demand_requests WHERE status = 'open'`
  );

  const scored = [];

  // Einmal je Lauf, nicht je Kandidat (Welle 11).
  const skillIndex = opts.skillIndex !== undefined ? opts.skillIndex : await loadSkillIndex(pool);

  // Score requisitions against capacity (treat requisition as "demand")
  for (const req of reqs) {
    const demand = {
      role: req.role,
      skill_tags: req.skill_tags || [],
      latitude: req.latitude,
      longitude: req.longitude,
      location_city: req.location_city,
      radius_km: req.radius_km,
      start_date: req.start_date,
      end_date: req.end_date
    };
    const { score, reasons } = scoreMatch(demand, cap, {
      supplierVerified: opts.supplierVerified || false,
      vendorPoolTier: null,
      skillIndex
    });
    if (score >= minScore) {
      scored.push({ type: 'requisition', entity: req, score, reasons });
    }
  }

  // Score demand_requests against capacity
  for (const dr of demands) {
    const demand = {
      role: dr.role,
      skill_tags: dr.skill_tags || [],
      latitude: dr.location_lat,
      longitude: dr.location_lng,
      location_city: dr.location_city,
      radius_km: dr.radius_km,
      start_date: dr.start_date,
      end_date: dr.end_date
    };
    const { score, reasons } = scoreMatch(demand, cap, {
      supplierVerified: opts.supplierVerified || false,
      vendorPoolTier: null,
      skillIndex
    });
    if (score >= minScore) {
      scored.push({ type: 'demand_request', entity: dr, score, reasons });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/**
 * Convenience-Wrapper fuer den matchWorker:
 * Laedt eine demand_request per ID und fuehrt matchRequisition aus.
 * @param {import('pg').Pool} pool
 * @param {string|number} requestId - demand_request.id
 * @param {Object} [opts]
 * @returns {Array<{ capacity_post, score, reasons }>}
 */
export async function findMatches(pool, requestId, opts = {}) {
  const { rows } = await pool.query(
    'SELECT * FROM demand_requests WHERE id = $1',
    [requestId]
  );
  const dr = rows[0];
  if (!dr) return [];

  // demand_requests Spalten auf das erwartete Format mappen
  const demand = {
    role: dr.role,
    skill_tags: dr.skill_tags || [],
    latitude: dr.location_lat,
    longitude: dr.location_lng,
    location_city: dr.location_city,
    radius_km: dr.radius_km,
    start_date: dr.start_date,
    end_date: dr.end_date
  };

  return matchRequisition(pool, demand, opts);
}

/* ═══════════════════════════════════════════════════════════════
 * Worker → Assignment Matching
 * Matches a worker profile (from workers table) against open
 * demand_requests and requisitions.
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Load reputation score for a supplier org from supplier_reputation.
 * Returns 0-10 numeric value; 0 if not found.
 */
async function getReputationScore(pool, orgId) {
  if (!orgId) return 0;
  try {
    const { rows } = await pool.query(
      `SELECT overall_score FROM supplier_reputation WHERE org_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [orgId]
    );
    return rows[0]?.overall_score ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Match a worker (by ID) against open demand requests + requisitions.
 * Worker profile is mapped to a capacity-like object; demands are scored.
 * @param {import('pg').Pool} pool
 * @param {string} workerId
 * @param {Object} [opts] - { topN, minScore }
 */
export async function matchWorkerToAssignments(pool, workerId, opts = {}) {
  const topN = opts.topN || 25;
  const minScore = opts.minScore || 1;

  /* Befund E-21/E-14 (2026-08-20): `workers` hat KEINE Migration je angelegt —
     gegen die laufende Datenbank gemessen antwortet Postgres mit 42P01. Dieser
     Weg endet also seit jeher in einem Fehler; ob er entfernt oder auf
     `worker_profiles` gebaut wird, ist eine Produktentscheidung (P1-19).

     Die Bindung steht trotzdem JETZT im SQL. Ohne sie waere die Abfrage am Tag,
     an dem jemand eine `workers`-Tabelle anlegt, sofort ein ungebundener
     org-uebergreifender Lesezugriff — ein schlafendes Leck, das niemand mehr
     mit dem Anlegen der Tabelle in Verbindung braechte. Mit ihr kann sie das
     nicht mehr werden.

     Ohne Betrachter-Org (Hintergrundlauf, Cron) bleibt es beim alten Verhalten:
     dort gibt es keine Mandantensicht, die man verletzen koennte. */
  const viewerOrgId = opts.viewerOrgId ?? null;
  const { rows: wRows } = viewerOrgId
    ? await pool.query(
        'SELECT * FROM workers WHERE id = $1 AND supplier_org_id = $2',
        [workerId, viewerOrgId]
      )
    : await pool.query('SELECT * FROM workers WHERE id = $1', [workerId]);
  const worker = wRows[0];
  if (!worker) return [];

  // Build capacity-like object from worker
  const cap = {
    role: worker.role || worker.position || '',
    skill_tags: worker.skill_tags || worker.skills || [],
    location_lat: worker.latitude ?? worker.location_lat,
    location_lng: worker.longitude ?? worker.location_lng,
    location_city: worker.city || worker.location_city || '',
    radius_km: worker.radius_km || 50,
    availability_from: worker.available_from || worker.availability_from,
    availability_to: worker.available_to || worker.availability_to
  };

  // Reputation bonus for worker's org
  const repScore = await getReputationScore(pool, worker.org_id || worker.supplier_org_id);
  const repBonus = Math.round(repScore / 2); // 0-5 bonus points

  // Load open demands + requisitions
  const { rows: demands } = await pool.query(
    `SELECT *, 'demand_request' AS _source FROM demand_requests WHERE status = 'open'`
  );
  const { rows: reqs } = await pool.query(
    `SELECT *, 'requisition' AS _source FROM requisitions WHERE status IN ('OPEN','IN_REVIEW','SHORTLISTED')`
  );

  const scored = [];

  // Einmal je Lauf, nicht je Kandidat (Welle 11).
  const skillIndex = opts.skillIndex !== undefined ? opts.skillIndex : await loadSkillIndex(pool);

  for (const dr of demands) {
    const demand = {
      role: dr.role,
      skill_tags: dr.skill_tags || [],
      latitude: dr.location_lat, longitude: dr.location_lng,
      location_city: dr.location_city, radius_km: dr.radius_km,
      start_date: dr.start_date, end_date: dr.end_date
    };
    let { score, reasons } = scoreMatch(demand, cap, { skillIndex });
    if (repBonus > 0) {
      score = Math.min(100, score + repBonus);
      reasons.push({ factor: 'reputation', points: repBonus, max: 5, detail: `Reputation ${repScore}/10` });
    }
    if (score >= minScore) {
      scored.push({ type: 'demand_request', entity: dr, score, reasons });
    }
  }

  for (const req of reqs) {
    const demand = {
      role: req.role,
      skill_tags: req.skill_tags || [],
      latitude: req.latitude, longitude: req.longitude,
      location_city: req.location_city, radius_km: req.radius_km,
      start_date: req.start_date, end_date: req.end_date
    };
    let { score, reasons } = scoreMatch(demand, cap, { skillIndex });
    if (repBonus > 0) {
      score = Math.min(100, score + repBonus);
      reasons.push({ factor: 'reputation', points: repBonus, max: 5, detail: `Reputation ${repScore}/10` });
    }
    if (score >= minScore) {
      scored.push({ type: 'requisition', entity: req, score, reasons });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/* ═══════════════════════════════════════════════════════════════
 * ML Match Logging
 * Persists match attempts to match_logs for future model training.
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Log a match event to match_logs.
 * @param {import('pg').Pool} pool
 * @param {Object} entry - { match_type, source_id, target_id, score, reasons, outcome, org_id }
 */
export async function logMatch(pool, entry) {
  try {
    await pool.query(
      `INSERT INTO match_logs (match_type, source_id, target_id, score, reasons, outcome, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.match_type || 'demand_capacity',
        entry.source_id,
        entry.target_id,
        entry.score ?? 0,
        JSON.stringify(entry.reasons || []),
        entry.outcome || 'suggested',
        entry.org_id || null
      ]
    );
  } catch (_e) {
    // Non-critical — don't break the flow
  }
}
/* ═══════════════════════════════════════════════════════════════════════════
   Befund E-14 (2026-08-20): die Matching-Wege liefen ohne jede Bindung
   ═══════════════════════════════════════════════════════════════════════════

   `findMatches` und `matchCapacityToRequisitions` luden ihre Quelle mit
   `WHERE id = $1` — sonst nichts. Jeder Angemeldete mit `requisition.view`
   konnte die Engine also gegen einen FREMDEN Bedarf laufen lassen und erfuhr,
   dass es ihn gibt und welche Lieferanten zu ihm passen. Die Geschwister-Route
   `/matching/instant/:requisitionId` machte es von Anfang an richtig: sie reicht
   `req.orgId` durch und beantwortet `ORG_BOUNDARY_VIOLATION` mit 403.

   WARUM DIE GRENZE HIER NICHT "eigene Org" HEISST. Ein Bedarf wird im Marktplatz
   BEWUSST an Lieferanten ausgespielt — eine reine Org-Grenze waere das Ende des
   Marktplatzes. Die richtige Regel musste also nicht erfunden werden, sie steht
   bereits im Code: `capacityExchangeService` zeigt einen Bedarf genau dann, wenn
   er offen ist, noch freie Plaetze hat, keinen Ursprungs-Auftrag traegt und
   nicht abgelaufen ist (`demandVisibilityWhere`, Zeile 538). Genau diese Regel
   gilt ab jetzt auch fuers Matching.

   Der Unterschied ist nicht theoretisch: `SELECT * FROM demand_requests WHERE
   id = $1` erreichte auch `closed`, `cancelled` und `fulfilled` — also Bedarfe,
   die der Marktplatz absichtlich verbirgt. Das Matching war damit die
   Hintertuer zu genau den Daten, die die Sichtbarkeitsregel schuetzt.

   Wer den Bedarf SELBST gestellt hat, sieht ihn in jedem Status — sonst koennte
   niemand sein eigenes abgeschlossenes Gesuch nachvollziehen.
*/

/** @returns {"OK"|"NOT_FOUND"|"ORG_BOUNDARY_VIOLATION"} */
export async function darfBedarfSehen(pool, demandId, viewerUserId) {
  if (!demandId) return "NOT_FOUND";
  const { rows } = await pool.query(
    `SELECT dr.requester_company_id,
            dr.status,
            dr.end_date,
            COALESCE(
              dr.remaining_open_count,
              GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1)
                       - COALESCE(dr.currently_committed_count, 0), 0)
            ) AS offene_plaetze,
            EXISTS (
              SELECT 1 FROM offers o
               WHERE o.demand_request_id = dr.id
                 AND o.capacity_post_id IS NOT NULL
            ) AS hat_ursprungsauftrag
       FROM demand_requests dr
      WHERE dr.id = $1`,
    [demandId]
  );
  const dr = rows[0];
  if (!dr) return "NOT_FOUND";

  // Der Steller sieht seinen eigenen Bedarf in jedem Status.
  if (viewerUserId && String(dr.requester_company_id) === String(viewerUserId)) return "OK";

  // Fuer alle anderen gilt die Sichtbarkeitsregel des Marktplatzes.
  const sichtbar =
    ["open", "partially_covered"].includes(String(dr.status)) &&
    Number(dr.offene_plaetze) > 0 &&
    !dr.hat_ursprungsauftrag &&
    (dr.end_date === null || new Date(dr.end_date) >= new Date(new Date().toDateString()));

  return sichtbar ? "OK" : "ORG_BOUNDARY_VIOLATION";
}

/**
 * Dieselbe Frage fuer ein Kapazitaetsangebot.
 *
 * Die Regel steht in `capacityExchangeService.canViewerSeeEntry` (Zeile 125):
 * der Anbieter sieht sein Angebot immer, alle anderen nur ein aktives, nicht
 * privates. `matchCapacityToRequisitions` hat sie nie angewandt.
 *
 * @returns {"OK"|"NOT_FOUND"|"ORG_BOUNDARY_VIOLATION"}
 */
export async function darfKapazitaetSehen(pool, capacityPostId, viewerUserId, viewerOrgId) {
  if (!capacityPostId) return "NOT_FOUND";
  const { rows } = await pool.query(
    `SELECT supplier_company_id, org_id, status, visibility_status
       FROM capacity_posts
      WHERE id = $1`,
    [capacityPostId]
  );
  const cp = rows[0];
  if (!cp) return "NOT_FOUND";

  const eigen =
    (viewerUserId && String(cp.supplier_company_id) === String(viewerUserId)) ||
    (viewerOrgId && cp.org_id && String(cp.org_id) === String(viewerOrgId));
  if (eigen) return "OK";

  const sichtbar = String(cp.status) === "active" && String(cp.visibility_status) !== "private";
  return sichtbar ? "OK" : "ORG_BOUNDARY_VIOLATION";
}
