/**
 * Instant Match Service — Premium Enriched Capacity Matching.
 *
 * Orchestriert den Matching-Prozess mit Batch-Pre-Fetch:
 *   1. Requisition/Demand laden
 *   2. Alle aktiven Capacity Posts laden
 *   3. Batch: Compliance, Reputation, VendorPool fuer alle Supplier vorladen
 *   4. ScoreMatch mit allen 10 Faktoren aufrufen
 *   5. Ergebnisse klassifizieren, anreichern, sortieren
 *
 * Kein N+1 — alles in 4-5 Queries vorab geladen.
 */

import { scoreMatch, classifyMatch, logMatch } from "./matchingEngine.js";
import { computeFillRateSignal, computeSlaComplianceSignal, computeRoleExpertiseSignal, computeRecencySignal, computeSmartRankScore, classifySmartRank, SMART_RANK_LABELS } from "./smartRankingService.js";
import { swallow } from "../utils/logger.js";
import { loadSkillIndex } from "./skillNormalizationService.js";
import * as companyBlocklistService from "./companyBlocklistService.js";
import { anbieterOrganisationSql } from "./reputationSql.js";
/* Posten 5 — die EINE Antwort auf "ist dieses Angebot aktiv?". Vorher las
   dieser Weg `cp.is_active = TRUE` und der Marktplatz `cp.status = 'active'`:
   zwei Angebote standen gelistet und waren hier unsichtbar. */
import { angebotAktivSql } from "./angebotAktivSql.js";

/* ── Batch-Loader ─────────────────────────────────────── */

async function loadComplianceMap(pool, supplierOrgIds) {
  if (!supplierOrgIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      /*
       * Z16 (2026-09-28): ZWEI FEHLER IN EINER ABFRAGE, und beide waren stumm.
       * Die Spalte heisst `org_id`, nicht `supplier_org_id` (gemessen) - damit
       * warf die Abfrage, das catch gab eine leere Karte zurueck, und eine leere
       * Karte sieht im Abgleich aus wie "niemand hat Nachweise".
       * UND der Schluessel war falsch: `compliance_documents.org_id` zeigt per
       * Fremdschluessel auf `organizations`, der Aufrufer uebergibt aber
       * `capacity_posts.supplier_company_id` - und das sind NUTZER. Gemessen an
       * den echten Daten: direkt 0 Treffer, ueber den Eigentuemer 18.
       * Der Weg ueber `org_memberships` ist derselbe wie in `reputationSql.js`
       * und `profileRankingService`.
       */
      `SELECT om.user_id AS supplier_org_id,
              COUNT(*) FILTER (WHERE cd.status = 'GREEN')::int AS green_count,
              COUNT(*)::int AS total_count
       FROM compliance_documents cd
       JOIN org_memberships om ON om.org_id = cd.org_id AND om.role_key = 'owner'
       WHERE om.user_id = ANY($1)
       GROUP BY om.user_id`,
      [supplierOrgIds]
    );
    const map = new Map();
    for (const r of rows) {
      const pct = r.total_count > 0 ? Math.round((r.green_count / r.total_count) * 100) : 0;
      map.set(r.supplier_org_id, pct);
    }
    return map;
  } catch { return new Map(); }
}

/*
 * Z5 (2026-09-27): DIESE KARTE WAR IMMER LEER, UND ZWAR LAUTLOS.
 *
 * Sie fragte `SELECT org_id, overall_score ... WHERE org_id = ANY($1)`. KEINE
 * dieser beiden Spalten existiert: die Tabelle traegt `supplier_id` und
 * `reputation_score`. Der Wurf lief in `catch { return new Map(); }` — eine
 * leere Karte sieht im Abgleich genauso aus wie "niemand hat Reputation", also
 * hat nie jemand einen Reputationsbonus bekommen.
 *
 * Der Parametername `orgIds` war ebenfalls irrefuehrend. Gemessen: der Aufrufer
 * uebergibt `capacity_posts.supplier_company_id`, und diese Spalte hat einen
 * Fremdschluessel auf `users(id)` — trotz ihres Namens sind es NUTZER. Damit
 * passt sie genau auf `supplier_reputation.supplier_id`, und die Karte
 * funktioniert nach der Korrektur wirklich (gemessen: 2 der 6 Anbieter haben
 * eine Reputationszeile).
 */
async function loadReputationMap(pool, supplierUserIds) {
  if (!supplierUserIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT supplier_id, reputation_score FROM supplier_reputation WHERE supplier_id = ANY($1)`,
      [supplierUserIds]
    );
    const map = new Map();
    for (const r of rows) map.set(r.supplier_id, Number(r.reputation_score) || 0);
    return map;
  } catch (e) {
    /* Z5: nicht mehr stumm — eine leere Karte und ein Fehler sehen im Ergebnis
       gleich aus, und genau daran ist der Befund jahrelang vorbeigelaufen.
       `swallow` ist das Werkzeug des Projekts fuer genau diesen Fall. */
    swallow("instantMatchService.loadReputationMap")(e);
    return new Map();
  }
}

async function loadVendorPoolMap(pool, buyerOrgId, supplierOrgIds) {
  if (!buyerOrgId || !supplierOrgIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      /* Z16: derselbe Schluesselfehler wie bei den Nachweisen.
         `vendor_pool.supplier_org_id` zeigt auf `organizations`, uebergeben
         werden Nutzer-Kennungen. Ohne die Bruecke ueber den Eigentuemer hat diese
         Karte NIE einen Treffer gehabt - die Vorzugsstufe eines Lieferanten ist
         also in keinen Sofort-Abgleich eingeflossen. */
      `SELECT om.user_id AS supplier_org_id, vp.tier
       FROM vendor_pool vp
       JOIN org_memberships om ON om.org_id = vp.supplier_org_id AND om.role_key = 'owner'
       WHERE vp.client_org_id = $1 AND om.user_id = ANY($2) AND vp.status = 'active'`,
      [buyerOrgId, supplierOrgIds]
    );
    const map = new Map();
    for (const r of rows) map.set(r.supplier_org_id, r.tier);
    return map;
  } catch { return new Map(); }
}

/*
 * Z16 (2026-09-28): DRITTER FALL DERSELBEN KLASSE IN DIESER DATEI.
 *
 * Die Abfrage stand auf `organizations`, bekommt aber
 * `capacity_posts.supplier_company_id` - und diese Spalte zeigt per
 * Fremdschluessel auf `users`. Dazu hat `organizations` UEBERHAUPT KEINE
 * Verifizierungsspalte (gemessen: 0 Treffer auf verif/trust/approved), `users`
 * dagegen `is_verified`. Die Abfrage warf, das catch gab eine leere Menge
 * zurueck - kein Anbieter galt je als verifiziert.
 *
 * Der Parametername `orgIds` log dabei mit, wie schon bei der Reputationskarte
 * und beim Smart-Rank. Deshalb heisst er jetzt, was er ist.
 */
async function loadVerifiedSet(pool, supplierUserIds) {
  if (!supplierUserIds.length) return new Set();
  try {
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE id = ANY($1) AND is_verified = TRUE`,
      [supplierUserIds]
    );
    return new Set(rows.map(r => r.id));
  } catch { return new Set(); }
}

async function loadSupplierNames(pool, orgIds) {
  if (!orgIds.length) return new Map();
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM organizations WHERE id = ANY($1)`,
      [orgIds]
    );
    const map = new Map();
    for (const r of rows) map.set(r.id, r.name);
    return map;
  } catch { return new Map(); }
}

/**
 * Batch-Loader fuer Smart Rank Signale.
 * Ein effizienter Query: supplier_metrics + supplier_reputation + role history.
 * @param {import('pg').Pool} pool
 * @param {string[]} supplierIds
 * @param {string|null} demandRole - gesuchte Rolle fuer Role-Expertise
 * @returns {Promise<Map<string, Object>>}
 */
async function loadSmartRankMap(pool, supplierIds, demandRole) {
  if (!supplierIds.length) return new Map();
  const map = new Map();
  try {
    /*
     * Z5 (2026-09-27): DIESE ABFRAGE LIEFERTE IMMER NULL ZEILEN, OHNE FEHLER.
     *
     * Sie stand auf `FROM organizations o WHERE o.id = ANY($1)` — bekommt aber
     * `capacity_posts.supplier_company_id`, und diese Spalte hat einen
     * Fremdschluessel auf `users(id)`. Nutzer-Kennungen gegen die Org-Tabelle:
     * null Treffer (gemessen, und zwar per Regel, nicht per Zufall der Daten).
     * Kein Wurf, keine Warnung — die Karte blieb leer, und `timesheet_quality`
     * sowie `platform_activity` fehlten in JEDEM Smart-Rank. Die zweite Abfrage
     * dieser Funktion (Rollen-Erfahrung) schluesselt uebrigens richtig, auf
     * `requests.receiver_id` → `users`. Innerhalb einer Funktion zwei
     * Schluesselwelten, eine davon falsch.
     *
     * Jetzt ist der Anker der ANBIETER (Nutzer), und die org-gebundenen
     * Kennzahlen kommen ueber dieselbe Bruecke, die `profileRankingService`
     * benutzt: `org_memberships` mit `role_key = 'owner'`. Gemessen: 6 von 6
     * Anbietern finden darueber ihre Organisation.
     *
     * OFFEN UND HIER NICHT ZU LOESEN: `supplier_metrics` ist LEER (0 Zeilen).
     * Die drei Kennzahlen bleiben also 0, bis `recompute-supplier-metrics`
     * wirklich gelaufen ist. Der Unterschied ist trotzdem wesentlich: vorher
     * konnte die Abfrage nichts finden, jetzt findet sie, was da ist.
     *
     * NACHTRAG Z17 (2026-09-28): dieser Fix war HALB falsch, und die Leere der
     * Tabelle hat es verdeckt. `supplier_reputation` haengt hier richtig direkt
     * am Nutzer — `supplier_metrics` hing daneben ueber die Bruecke an
     * `om.org_id`. Gemessen zeigt aber auch `supplier_metrics.agency_id` per
     * Fremdschluessel auf `users(id)`, und der Schreiber
     * (`supplierMetricsService.recomputeForWindow`) befuellt ihn aus
     * `requests.receiver_id`, ebenfalls ein Nutzer. Der Umweg ueber die
     * Organisation haette also auch dann nichts gefunden, wenn der Takt
     * gelaufen waere: aus "0, weil nichts da ist" waere "0, weil der Schluessel
     * nicht passt" geworden — ununterscheidbar. Geschrieben hatte ich ihn auf
     * eine ungemessene Warnung in `reputationSql.js` hin, die jetzt berichtigt
     * ist. Der Anker ist hier ohnehin der Nutzer; die Bruecke bleibt nur noch
     * fuer das stehen, was wirklich org-gebunden ist.
     */
    const { rows } = await pool.query(
      `SELECT
         u.id AS supplier_id,
         COALESCE(sm.requests_received, 0)::int AS requests_received,
         COALESCE(sm.requests_accepted, 0)::int AS requests_accepted,
         COALESCE(sm.sla_breaches, 0)::int AS sla_breaches,
         sr.timesheet_reliability_score,
         sr.activity_score
       FROM users u
       LEFT JOIN org_memberships om ON om.user_id = u.id AND om.role_key = 'owner'
       LEFT JOIN supplier_metrics sm ON sm.agency_id = u.id AND sm.window_days = 30
       LEFT JOIN supplier_reputation sr ON sr.supplier_id = u.id
       WHERE u.id = ANY($1)`,
      [supplierIds]
    );
    for (const r of rows) {
      map.set(r.supplier_id, {
        requests_received: r.requests_received,
        requests_accepted: r.requests_accepted,
        sla_breaches: r.sla_breaches,
        timesheet_quality: r.timesheet_reliability_score != null ? Number(r.timesheet_reliability_score) : null,
        platform_activity: r.activity_score != null ? Number(r.activity_score) : null
      });
    }
  } catch (e) {
    /* Z5: hier stand `catch { }` mit dem Vermerk "graceful degradation". Die
       Abfrage darueber hat null Zeilen geliefert, ohne zu werfen — aber wenn sie
       kuenftig wirft, darf das nicht wie "keine Signale" aussehen. */
    swallow("instantMatchService.loadSmartRankMap")(e);
  }

  // Role expertise: count completed deals per supplier for the demand role
  if (demandRole) {
    try {
      const roleLower = demandRole.toLowerCase().trim();
      const { rows: roleRows } = await pool.query(
        `SELECT receiver_id AS supplier_id,
                COUNT(*) FILTER (WHERE LOWER(TRIM(role)) = $2 AND status IN ('FINALIZED','COMPLETED'))::int AS role_deals,
                COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS total_deals
         FROM requests
         WHERE receiver_id = ANY($1)
         GROUP BY receiver_id`,
        [supplierIds, roleLower]
      );
      for (const r of roleRows) {
        const existing = map.get(r.supplier_id) || {};
        existing.role_deals = r.role_deals;
        existing.total_deals = r.total_deals;
        map.set(r.supplier_id, existing);
      }
    } catch { /* role column may not exist */ }
  }

  return map;
}

/* ── Highlights ───────────────────────────────────────── */

function buildHighlights(reasons) {
  return reasons
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map(r => r.detail);
}

/* ═══════════════════════════════════════════════════════
   instantMatchForRequisition
   ═══════════════════════════════════════════════════════ */

/**
 * Premium Instant Match fuer eine existierende Requisition.
 * Batch-Pre-Fetch + alle 10 Scoring-Faktoren + Enrichment.
 */
export async function instantMatchForRequisition(pool, requisitionId, orgId, opts = {}) {
  const topN = opts.topN || 25;
  const minScore = opts.minScore || 10;

  // 1. Requisition laden
  const { rows: reqRows } = await pool.query(
    `SELECT r.*, o.name AS org_name
     FROM requisitions r
     LEFT JOIN organizations o ON o.id = r.org_id
     WHERE r.id = $1`,
    [requisitionId]
  );
  const req = reqRows[0];
  if (!req) return { error: "REQUISITION_NOT_FOUND" };

  // Org-Boundary
  if (orgId && req.org_id !== orgId) {
    return { error: "ORG_BOUNDARY_VIOLATION" };
  }

  const demand = {
    role: req.role || req.title,
    skill_tags: req.skill_tags || [],
    latitude: req.latitude,
    longitude: req.longitude,
    location_city: req.location_city || req.location,
    radius_km: req.radius_km,
    start_date: req.start_date,
    end_date: req.end_date
  };

  return instantMatchFromParams(pool, demand, orgId, {
    ...opts,
    topN, minScore,
    budgetPerHour: req.budget_per_hour,
    workersNeeded: req.workers_needed,
    urgency: req.urgency,
    requisitionId
  });
}

/* ═══════════════════════════════════════════════════════
   instantMatchFromParams — Ad-hoc Matching
   ═══════════════════════════════════════════════════════ */

export async function instantMatchFromParams(pool, demand, orgId, opts = {}) {
  const topN = opts.topN || 25;
  const minScore = opts.minScore || 10;

  /*
   * N4.5 — DIE KUNDENSPERRE GILT AUCH HIER.
   *
   * Dieser Motor steht hinter drei Wegen, die Anbieter AKTIV ansprechen: der
   * Match-Trigger (schreibt beide Seiten an), die Notdienst-Alarmierung und ihre
   * Eskalation. Ohne diesen Filter bekam die Zeitarbeitsfirma eine Anfrage fuer
   * eine Kraft, die bei genau diesem Kunden nie buchbar ist — die Falle, die N4
   * an vier Flaechen geschlossen hatte und die hier offen stand.
   *
   * `kundeOrgId` ist bewusst eine EIGENE Angabe und nicht `orgId`: `orgId`
   * steuert die Vendor-Pool-Rangfolge, und im Match-Trigger haengt an derselben
   * Org auch, WER benachrichtigt wird. Die Sperre darf beides nicht verschieben.
   */
  const sperrOrg = opts.kundeOrgId || orgId || null;

  // 2. Alle aktiven Capacity Posts laden
  const { rows: caps } = await pool.query(
    /*
     * Z17 (2026-09-28): `o.name AS supplier_name` WAR IMMER NULL.
     *
     * Hier stand `LEFT JOIN organizations o ON o.id = cp.supplier_company_id`.
     * Diese Spalte zeigt per Fremdschluessel auf `users` — der Join traf nie, und
     * weil er LINKS ist, gab es keinen Fehler: im Sofort-Abgleich stand bei jedem
     * einzelnen Treffer kein Lieferantenname. Gemessen: direkt 0 Treffer, ueber
     * den Eigentuemer alle 45. Gefunden hat es der neue Waechter
     * `test/identitaetenNichtVermischen.test.js` in seinem ersten Lauf.
     */
    `SELECT cp.*, o.name AS supplier_name
     FROM capacity_posts cp
     ${anbieterOrganisationSql("cp.supplier_company_id", { alias: "o" })}
     WHERE ${angebotAktivSql("cp")}${sperrOrg
       ? `
       AND ${companyBlocklistService.nichtGesperrtSql("cp", 1)}` : ""}`,
    sperrOrg ? [sperrOrg] : []
  );

  if (caps.length === 0) return { matches: [], total: 0, demand };

  // 3. Batch Pre-Fetch: alle Supplier IDs sammeln
  const supplierIds = [...new Set(caps.map(c => c.supplier_company_id).filter(Boolean))];

  // Demand-Rolle fuer Role-Expertise-Signal
  const demandRole = demand.role || null;

  const [complianceMap, reputationMap, vendorPoolMap, verifiedSet, nameMap, smartRankDataMap] = await Promise.all([
    loadComplianceMap(pool, supplierIds),
    loadReputationMap(pool, supplierIds),
    loadVendorPoolMap(pool, orgId, supplierIds),
    loadVerifiedSet(pool, supplierIds),
    loadSupplierNames(pool, supplierIds),
    loadSmartRankMap(pool, supplierIds, demandRole)
  ]);

  // Urgency/Notdienst Boost (case-insensitive, auch legacy Werte)
  const urgencyValue = String(opts.urgency || "").toLowerCase();
  const isUrgent = ["high", "plus", "urgent", "critical", "notdienst"].includes(urgencyValue);

  // Katalog-Index einmal je Lauf (Welle 11): sonst faellt "Seniorenpflege" nicht mit
  // "Altenpflege" zusammen — genau hier, wo beide Seiten sofort benachrichtigt werden.
  const skillIndex = opts.skillIndex !== undefined ? opts.skillIndex : await loadSkillIndex(pool);

  // 4. Score all capacity posts
  const scored = [];
  for (const cap of caps) {
    const supplierId = cap.supplier_company_id;

    // Rate-Kompatibilität
    let rateCompatible = undefined;
    if (opts.budgetPerHour != null && cap.hourly_rate != null) {
      rateCompatible = cap.hourly_rate <= opts.budgetPerHour;
    }

    // Worker Count Match
    let workerCountMatch = undefined;
    if (opts.workersNeeded != null && cap.workers_count != null) {
      workerCountMatch = cap.workers_count >= opts.workersNeeded;
    }

    // Smart Rank berechnen
    let smartRankScore = 0;
    let smartRankLabel = null;
    const srd = smartRankDataMap.get(supplierId);
    if (srd) {
      const postAgeDays = cap.updated_at
        ? Math.max(0, (Date.now() - new Date(cap.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : 30;
      const srResult = computeSmartRankScore({
        fill_rate: computeFillRateSignal(srd.requests_accepted, srd.requests_received),
        sla_compliance: computeSlaComplianceSignal(srd.sla_breaches, srd.requests_received),
        role_expertise: computeRoleExpertiseSignal(srd.role_deals || 0, srd.total_deals || 0),
        timesheet_quality: srd.timesheet_quality,
        recency: computeRecencySignal(postAgeDays),
        platform_activity: srd.platform_activity
      });
      smartRankScore = srResult.score;
      smartRankLabel = SMART_RANK_LABELS[classifySmartRank(smartRankScore)] || null;
    }

    const { score, reasons } = scoreMatch(demand, cap, {
      supplierVerified: verifiedSet.has(supplierId),
      vendorPoolTier: vendorPoolMap.get(supplierId) || null,
      complianceScore: complianceMap.get(supplierId) || 0,
      reputationScore: reputationMap.get(supplierId) || 0,
      rateCompatible,
      urgencyBoost: isUrgent,
      workerCountMatch,
      preferredFirst: opts.preferredFirst || false,
      smartRankScore,
      smartRankLabel,
      weights: opts.weights,
      skillIndex
    });

    if (score >= minScore) {
      scored.push({
        capacity_post: cap,
        score,
        quality_label: classifyMatch(score),
        reasons,
        highlights: buildHighlights(reasons),
        supplier_info: {
          id: supplierId,
          name: cap.supplier_name || nameMap.get(supplierId) || null,
          verified: verifiedSet.has(supplierId),
          compliance_pct: complianceMap.get(supplierId) || 0,
          reputation_score: reputationMap.get(supplierId) || 0,
          vendor_pool_tier: vendorPoolMap.get(supplierId) || null
        }
      });
    }
  }

  // 5. Sort by score DESC
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, topN);

  // ML Log top matches
  for (const m of results.slice(0, 10)) {
    logMatch(pool, {
      match_type: "instant_match",
      source_id: opts.requisitionId || null,
      target_id: m.capacity_post?.id,
      score: m.score,
      reasons: m.reasons,
      outcome: "suggested",
      org_id: orgId || null
    }).catch(swallow("instantMatchService"));
  }

  return {
    matches: results,
    total: results.length,
    total_candidates: caps.length,
    demand,
    quality_summary: {
      excellent: results.filter(r => r.quality_label === "excellent").length,
      good: results.filter(r => r.quality_label === "good").length,
      fair: results.filter(r => r.quality_label === "fair").length,
      weak: results.filter(r => r.quality_label === "weak").length
    }
  };
}
