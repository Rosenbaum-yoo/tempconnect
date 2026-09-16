/**
 * Emergency Staffing Service — Premium Notdienst-Orchestrierung.
 *
 * Duenner Orchestrierungs-Layer, der bestehende Services koordiniert:
 *   - marketplaceService: demand_request CRUD, SLA, Matching
 *   - matchAlertService: priorisierte Alerts mit forced Email
 *   - instantMatchService: 10-Faktor Premium-Matching
 *   - notificationMatrix: In-App-Notifications
 *
 * Kein Duplikat-Code — alles delegiert an vorhandene Infrastruktur.
 */

import { createServiceLogger } from "../utils/logger.js";
import { todayDE, dateOnlyDE } from "../utils/dateDE.js";
import { kundenOrgEinesBedarfs } from "./companyBlocklistService.js";

const logger = createServiceLogger("emergencyStaffing");

/* ═══════════════════════════════════════════════════════
   Zentrale Urgency-Konfiguration
   ═══════════════════════════════════════════════════════ */

export const URGENCY_CONFIG = {
  NORMAL:   { slaMinutes: 120, responseWindow: null,  escalation: false, forceEmail: false, label: "Normal" },
  HIGH:     { slaMinutes: 90,  responseWindow: 60,    escalation: false, forceEmail: false, label: "Hoch" },
  URGENT:   { slaMinutes: 60,  responseWindow: 30,    escalation: true,  forceEmail: true,  label: "Dringend" },
  CRITICAL: { slaMinutes: 45,  responseWindow: 20,    escalation: true,  forceEmail: true,  label: "Kritisch" },
  NOTDIENST:{ slaMinutes: 30,  responseWindow: 15,    escalation: true,  forceEmail: true,  label: "Notdienst" }
};

const EMERGENCY_LEVELS = new Set(["URGENT", "CRITICAL", "NOTDIENST"]);

/* ═══════════════════════════════════════════════════════
   Der Notdienst wird ABGELEITET, nicht gefragt
   ═══════════════════════════════════════════════════════ */

/**
 * Wie viele Tage Vorlauf ein Bedarf haben muss, um KEIN Notdienst zu sein.
 *
 * Owner-Vorgabe 2026-09-05: "Wenn er sagt Einsatz ab morgen, ist es Notdienst;
 * wenn er sagt Einsatz in 2 Tagen, ist es auch Notdienst; alles andere nicht
 * Notdienst." Also: Vorlauf <= 2 Tage.
 */
export const NOTDIENST_VORLAUF_TAGE = 2;

/** Ganze Kalendertage zwischen zwei JJJJ-MM-TT, negativ wenn `bis` frueher liegt. */
function tageZwischen(von, bis) {
  const a = String(von || "").slice(0, 10);
  const b = String(bis || "").slice(0, 10);
  const muster = /^\d\d\d\d-\d\d-\d\d$/;
  if (!muster.test(a) || !muster.test(b)) return null;
  /* Mittags-UTC als Anker: so kippt keine Zeitzonenverschiebung den Tag. */
  const t = (x) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10), 12);
  return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * Leitet die Dringlichkeit aus dem Einsatzbeginn ab.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ABGELEITET UND NICHT GEFRAGT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Dringlichkeit war bis hierher ein Feld im Formular - an VIER Stellen, mit
 * VIER verschiedenen Wertelisten (`marketplace.js`, `requisitions.js`,
 * `slaSearchJobs.js`, `emergency.js`). Sie liess sich in BEIDE Richtungen
 * falsch setzen:
 *
 *   Einsatz morgen als "normal"      Die 30-Minuten-Uhr laeuft nie an, niemand
 *                                    wird alarmiert, die Schicht bleibt leer.
 *   Einsatz in drei Wochen als       Es klingelt bei 50 Anbietern ohne Anlass -
 *   "notdienst"                      und beim naechsten Mal sieht keiner mehr hin.
 *
 * Der Einsatzbeginn steht ohnehin im Formular. Aus zwei Angaben eine zu machen,
 * die einander widersprechen koennen, ist die Fehlerquelle - nicht die
 * Bequemlichkeit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TAGESGENAU HEISST EUROPE/BERLIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `todayDE()`, nicht `new Date().toISOString().slice(0,10)`. Zwischen 23:00 und
 * 01:00 unterscheiden sich die beiden um einen Tag - und dieser eine Tag
 * entscheidet hier ueber die Einstufung eines Auftrags, nicht ueber eine
 * Anzeige. Ein Bedarf, der um 23:30 fuer uebermorgen angelegt wird, waere unter
 * UTC-Rechnung faelschlich ein Notdienst.
 *
 * Gerechnet wird auf KALENDERTAGEN, nicht auf Stunden: "Einsatz ab morgen" ist
 * ein Notdienst, gleich ob er um 06:00 oder um 22:00 beginnt.
 *
 * @param {string|Date|null} startDatum Einsatzbeginn (Kalendertag).
 * @param {{heute?: string}} [opt] `heute` nur fuer Proben - sonst todayDE().
 * @returns {"notdienst"|"normal"} `normal`, wenn kein gueltiges Datum vorliegt:
 *          eine Einstufung aus dem Nichts waere schlimmer als keine.
 */
export function notdienstAusStartdatum(startDatum, opt = {}) {
  /*
   * NUR Zeichenkette oder Datum. `new Date(42)` ergibt den 01.01.1970 - also
   * "laengst ueberfaellig" und damit einen Notdienst. Das ist folgerichtig und
   * trotzdem falsch: eine Zahl an dieser Stelle ist ein Fehler des Aufrufers,
   * und ihn stillschweigend als Zeitstempel zu deuten verbirgt ihn. Aufgefallen
   * durch eine Probe, die genau das durchgehen liess.
   */
  if (typeof startDatum !== "string" && !(startDatum instanceof Date)) return "normal";
  const roh = typeof startDatum === "string" ? startDatum.trim() : startDatum;
  /*
   * Ein reiner Kalendertag braucht KEINEN Sonderweg. Hier stand einer - eine
   * Rueckmutation hat gezeigt, dass er nichts bewirkt: `new Date("2026-09-08")`
   * ist Mitternacht UTC, und Berlin liegt ganzjaehrig davor (UTC+1 bzw. +2).
   * Aus 00:00 UTC wird 01:00 oder 02:00 Berliner Zeit - derselbe Tag.
   *
   * Der Zweig war also ein Pfad, den keine Probe rechtfertigen konnte. Weg
   * damit: weniger Code, ein Weg statt zwei, und die Zeitzonenrechnung an
   * genau einer Stelle. (Fuer eine Zone WESTLICH von UTC waere er noetig -
   * dann aber gehoerte er in `dateOnlyDE`, nicht hierher.)
   */
  const start = dateOnlyDE(roh);
  if (!start) return "normal";

  const tage = tageZwischen(opt.heute || todayDE(), start);
  if (tage === null) return "normal";

  /* Ein Beginn in der VERGANGENHEIT ist erst recht dringend - er ist schon da.
     Ohne diesen Fall waere ein nachgetragener Bedarf fuer gestern "normal". */
  return tage <= NOTDIENST_VORLAUF_TAGE ? "notdienst" : "normal";
}

/* ── Urgency-Normalisierung ──────────────────────────── */

/**
 * Normalisiert verschiedene Urgency-Werte aus dem System in ein einheitliches Level.
 * Handles: notdienst, urgent, high, critical, plus, NOTDIENST, HIGH, etc.
 */
export function classifyUrgency(raw) {
  if (!raw) return "NORMAL";
  const u = String(raw).toUpperCase().trim();
  if (u === "NOTDIENST") return "NOTDIENST";
  if (u === "CRITICAL") return "CRITICAL";
  if (u === "URGENT") return "URGENT";
  if (u === "HIGH" || u === "PLUS") return "HIGH";
  return "NORMAL";
}

/**
 * Prueft ob ein Urgency-Level als Emergency gilt.
 */
export function isEmergency(urgency) {
  return EMERGENCY_LEVELS.has(classifyUrgency(urgency));
}

/**
 * Gibt die Konfiguration fuer ein Urgency-Level zurueck.
 */
export function getUrgencyConfig(urgency) {
  const level = classifyUrgency(urgency);
  return { level, ...URGENCY_CONFIG[level] };
}
async function persistEmergencyMatches(pool, demandId, matchResults) {
  const matches = Array.isArray(matchResults?.matches) ? matchResults.matches : [];
  if (!matches.length) return [];
  const capacityPostIds = [];
  for (const m of matches) {
    const capId = m.capacity_post?.id;
    if (!capId) continue;
    capacityPostIds.push(capId);
    const reasons = Array.isArray(m.reasons) ? m.reasons : [];
    await pool.query(
      `INSERT INTO matches (demand_request_id, capacity_post_id, match_score, reasons, status)
       VALUES ($1,$2,$3,$4,'suggested')
       ON CONFLICT (demand_request_id, capacity_post_id)
       DO UPDATE SET match_score = EXCLUDED.match_score, reasons = EXCLUDED.reasons, updated_at = NOW()`,
      [demandId, capId, m.score ?? null, JSON.stringify(reasons)]
    );
  }
  return [...new Set(capacityPostIds)];
}

/* ═══════════════════════════════════════════════════════
   createEmergencyRequest
   ═══════════════════════════════════════════════════════ */

/**
 * Erstellt einen Emergency Staffing Request (demand_request mit urgency=notdienst).
 * Orchestriert: demand_request + SLA + Instant-Match + Match-Alerts.
 */
export async function createEmergencyRequest(pool, userId, plan, payload) {
  const urgencyLevel = classifyUrgency(payload.urgency || "notdienst");
  const cfg = URGENCY_CONFIG[urgencyLevel] || URGENCY_CONFIG.NOTDIENST;

  // 1. Demand-Request ueber marketplaceService erstellen
  const { createDemandRequest, recordDemandSlaStarted, recordDemandMatchingAttempt,
          recordDemandNotificationSent, markDemandSlaMet, markMatchesNotified } = await import("./marketplaceService.js");

  const demandPayload = {
    ...payload,
    urgency: urgencyLevel === "NOTDIENST" ? "notdienst" : urgencyLevel.toLowerCase(),
    sla_minutes: payload.sla_minutes || cfg.slaMinutes
  };

  const demand = await createDemandRequest(pool, userId, plan, demandPayload);

  // Response-Window setzen
  if (cfg.responseWindow) {
    await pool.query(
      `UPDATE demand_requests SET response_window_minutes = $1 WHERE id = $2`,
      [cfg.responseWindow, demand.id]
    );
  }

  // 2. SLA starten
  if (demand.sla_status === "RUNNING") {
    await recordDemandSlaStarted(pool, demand.id);
  }

  // 3. Instant-Match ausfuehren (Premium 10-Faktor)
  let matchResults = { matches: [], total: 0 };
  let matchedCapacityIds = [];
  try {
    const { instantMatchFromParams } = await import("./instantMatchService.js");
    const demandParams = {
      role: demand.role,
      skill_tags: demand.skill_tags || [],
      latitude: demand.location_lat,
      longitude: demand.location_lng,
      location_city: demand.location_city,
      radius_km: demand.radius_km,
      start_date: demand.start_date,
      end_date: demand.end_date
    };
    /* N4.5: `kundeOrgId` fuer die Sperre. `orgId` bleibt null, damit sich an
       der Vendor-Pool-Rangfolge der Alarmierung nichts verschiebt.
       N2.11: aus dem GESPEICHERTEN Bedarf (Migration 218), mit Rueckfall — so
       rechnet die Anlage mit derselben Firma wie jede spaetere Stelle. */
    matchResults = await instantMatchFromParams(pool, demandParams, null, {
      kundeOrgId: await kundenOrgEinesBedarfs(pool, { ...demand, requester_org_id: demand.requester_org_id || payload.requester_org_id }),
      topN: 25, minScore: 10,
      budgetPerHour: demand.budget_max,
      workersNeeded: demand.headcount,
      urgency: urgencyLevel
    });
    matchedCapacityIds = await persistEmergencyMatches(pool, demand.id, matchResults);
    await recordDemandMatchingAttempt(pool, demand.id, {
      candidateCount: matchResults.total_candidates || 0,
      matchCount: matchResults.total
    });
  } catch (err) {
    logger.warn({ err: err.message, demandId: demand.id }, "Emergency instant match failed (non-blocking)");
  }

  // 4. Match-Alerts an passende Supplier senden
  let alerted = 0;
  try {
    // Wenn es Matches gibt, alert die zugehoerigen Supplier
    if (matchResults.matches?.length > 0) {
      const supplierIds = [...new Set(
        matchResults.matches.map(m => m.capacity_post?.supplier_company_id).filter(Boolean)
      )];
      // In-App + Emergency E-Mail via dispatch
      const { dispatch } = await import("./notificationMatrix.js");
      if (supplierIds.length > 0) {
        await dispatch(pool, "emergency.request_created", {
          recipientUserIds: supplierIds,
          entityType: "demand_request",
          entityId: demand.id,
          message: `🔴 NOTDIENST: "${demand.title}" – ${demand.role}, ${demand.location_city}. Sofortige Reaktion erforderlich.`,
          emailQueue: true
        });
        alerted = supplierIds.length;
        await recordDemandNotificationSent(pool, demand.id, { notifiedCount: alerted });
        if (matchedCapacityIds.length > 0) {
          await markMatchesNotified(pool, demand.id, matchedCapacityIds);
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message, demandId: demand.id }, "Emergency alerts failed (non-blocking)");
  }

  // 5. SLA pruefen
  if (demand.sla_due_at && new Date() <= new Date(demand.sla_due_at)) {
    try { await markDemandSlaMet(pool, demand.id); } catch { /* non-critical */ }
  }

  logger.info({
    demandId: demand.id, urgency: urgencyLevel,
    matchCount: matchResults.total, alerted
  }, "Emergency request created");

  return {
    demand,
    urgency_level: urgencyLevel,
    urgency_config: cfg,
    match_results: {
      total: matchResults.total,
      quality_summary: matchResults.quality_summary || {},
      top_matches: (matchResults.matches || []).slice(0, 5).map(m => ({
        capacity_post_id: m.capacity_post?.id,
        score: m.score,
        quality_label: m.quality_label,
        supplier_name: m.supplier_info?.name
      }))
    },
    alerted
  };
}

/* ═══════════════════════════════════════════════════════
   getActiveEmergencies
   ═══════════════════════════════════════════════════════ */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE FELDER, DIE EINE FREMDE ORGANISATION SEHEN DARF (N7.5, 2026-09-06)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `demand_requests` hat 44 Spalten. Der ausdruecklich oeffentliche Nachbarpfad
 * `GET /marketplace/public/demand-requests` waehlt davon **14 von Hand** aus -
 * und laesst `contact_name`, `contact_phone`, `budget_min`, `budget_max`,
 * `requirements`, `shifts`, `location_lat/lng` und `location_postal`
 * ausdruecklich weg. Diese Auswahl IST die Aussage; `SELECT dr.*` ist keine
 * Entscheidung, sondern deren Abwesenheit.
 *
 * Bis zum 2026-09-06 lieferte `?all=1` die ganze Zeile. Die Durchwahl der
 * Ansprechperson gehoert aber NACH die Besetzung, nicht in eine
 * Entdeckungsliste - `assignmentStaffingService.js` liest sie mit genau dieser
 * Begruendung ("Wer besetzt, braucht die Nummer der Gegenseite").
 *
 * Dazu die Notdienst-eigenen Kennzahlen, die den Leitstand ausmachen und im
 * oeffentlichen Pfad fehlen: Alter, SLA-Stand, Eskalationsstufe.
 *
 * DIE EIGENE ORGANISATION SIEHT WEITERHIN ALLES. Die Einschraenkung greift nur
 * fuer den plattformweiten Blick - wer die eigene Notlage ansieht, hat auf jedes
 * Feld ohnehin Anspruch.
 *
 * Die Auswahl steht ALS LISTE hier und nicht als Streichung in der Route: eine
 * Erlaubnisliste laesst ein NEUES Feld standardmaessig draussen. Eine
 * Streichliste wuerde es standardmaessig durchlassen - und niemand denkt beim
 * Anlegen einer Spalte an diesen Endpunkt.
 */
const FREMDE_SICHT = Object.freeze([
  /* dieselben 14 wie der oeffentliche Nachbarpfad */
  "id", "title", "role", "skill_tags", "headcount", "required_total_count",
  "remaining_open_count", "currently_committed_count", "status",
  "start_date", "end_date", "location_city", "urgency", "created_at",
  "requester_company_name",
  /* was den Leitstand ausmacht */
  "urgency_level", "urgency_label", "age_minutes", "sla_overdue",
  "sla_due_at", "escalation_level", "supplier_response_count"
]);

/** Reduziert eine Zeile auf die Felder, die eine fremde Organisation sehen darf. */
function nurFremdeSicht(zeile) {
  const raus = {};
  for (const feld of FREMDE_SICHT) {
    if (Object.prototype.hasOwnProperty.call(zeile, feld)) raus[feld] = zeile[feld];
  }
  return raus;
}

export async function getActiveEmergencies(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT dr.*, u.company_name AS requester_company_name,
            EXTRACT(EPOCH FROM (NOW() - dr.created_at)) / 60 AS age_minutes,
            CASE WHEN dr.sla_due_at IS NOT NULL AND dr.sla_due_at < NOW() THEN TRUE ELSE FALSE END AS sla_overdue
     FROM demand_requests dr
     JOIN users u ON u.id = dr.requester_company_id
     WHERE dr.status = 'open'
       AND dr.urgency IN ('notdienst', 'urgent', 'critical')
       AND ($1::text IS NULL OR dr.requester_company_id = $1)
     ORDER BY
       CASE dr.urgency
         WHEN 'notdienst' THEN 0
         WHEN 'critical' THEN 1
         WHEN 'urgent' THEN 2
         ELSE 3
       END,
       dr.created_at ASC`,
    [orgId || null]
  );
  const angereichert = rows.map(r => ({
    ...r,
    urgency_level: classifyUrgency(r.urgency),
    urgency_label: getUrgencyConfig(r.urgency).label,
    age_minutes: Math.round(Number(r.age_minutes) || 0),
    sla_overdue: r.sla_overdue ?? false
  }));

  /* Ohne `orgId` ist dies der PLATTFORMWEITE Blick: fremde Notlagen, also
     reduzierte Sicht. Mit `orgId` sind es die eigenen - dort aendert sich
     nichts. */
  return orgId ? angereichert : angereichert.map(nurFremdeSicht);
}

/* ═══════════════════════════════════════════════════════
   getEmergencyDashboard — KPIs
   ═══════════════════════════════════════════════════════ */

export async function getEmergencyDashboard(pool, orgId) {
  const orgFilter = orgId ? "AND dr.requester_company_id = $1" : "";
  const params = orgId ? [orgId] : [];

  // Active emergencies count + escalation
  const { rows: activeRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_active,
       COUNT(*) FILTER (WHERE escalation_level >= 1)::int AS escalated,
       COUNT(*) FILTER (WHERE sla_status = 'BREACHED')::int AS sla_breached,
       COUNT(*) FILTER (WHERE urgency = 'notdienst')::int AS notdienst_count,
       COUNT(*) FILTER (WHERE urgency IN ('urgent', 'critical'))::int AS urgent_count
     FROM demand_requests dr
     WHERE status = 'open'
       AND urgency IN ('notdienst', 'urgent', 'critical')
       ${orgFilter}`,
    params
  );

  // Response metrics (last 30 days)
  const { rows: metricsRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_emergencies_30d,
       COUNT(*) FILTER (WHERE supplier_response_count > 0)::int AS responded_count,
       AVG(EXTRACT(EPOCH FROM (first_supplier_response_at - created_at)) / 60)
         FILTER (WHERE first_supplier_response_at IS NOT NULL) AS avg_response_minutes,
       COUNT(*) FILTER (WHERE sla_status = 'MET')::int AS sla_met_count,
       COUNT(*) FILTER (WHERE sla_status = 'BREACHED')::int AS sla_breached_count,
       COUNT(*) FILTER (WHERE status IN ('filled', 'closed'))::int AS filled_count
     FROM demand_requests dr
     WHERE urgency IN ('notdienst', 'urgent', 'critical')
       AND created_at > NOW() - INTERVAL '30 days'
       ${orgFilter}`,
    params
  );

  const active = activeRows[0] || {};
  const metrics = metricsRows[0] || {};
  const total30d = metrics.total_emergencies_30d || 0;

  return {
    active: {
      total: active.total_active || 0,
      notdienst: active.notdienst_count || 0,
      urgent: active.urgent_count || 0,
      escalated: active.escalated || 0,
      sla_breached: active.sla_breached || 0
    },
    metrics_30d: {
      total: total30d,
      response_rate: total30d > 0 ? Math.round((metrics.responded_count / total30d) * 100) : 0,
      avg_response_minutes: metrics.avg_response_minutes ? Math.round(Number(metrics.avg_response_minutes)) : null,
      sla_met_rate: total30d > 0 ? Math.round((metrics.sla_met_count / total30d) * 100) : 0,
      fill_rate: total30d > 0 ? Math.round((metrics.filled_count / total30d) * 100) : 0,
      sla_breach_rate: total30d > 0 ? Math.round((metrics.sla_breached_count / total30d) * 100) : 0
    }
  };
}

/* ═══════════════════════════════════════════════════════
   recordSupplierResponse
   ═══════════════════════════════════════════════════════ */

/**
 * Trackt eine Supplier-Reaktion auf einen Emergency-Request.
 * Idempotent: first_supplier_response_at wird nur einmal gesetzt.
 */
export async function recordSupplierResponse(pool, demandId, supplierId) {
  // Verify demand exists and is emergency
  const { rows } = await pool.query(
    `SELECT id, urgency, status FROM demand_requests WHERE id = $1`,
    [demandId]
  );
  if (!rows[0]) return { error: "NOT_FOUND" };
  if (!isEmergency(rows[0].urgency)) return { error: "NOT_EMERGENCY" };
  if (!["open", "partially_covered"].includes(rows[0].status)) return { error: "NOT_OPEN" };

  // Idempotent: set first response time, increment counter
  const { rows: updated } = await pool.query(
    `UPDATE demand_requests
     SET supplier_response_count = supplier_response_count + 1,
         first_supplier_response_at = COALESCE(first_supplier_response_at, NOW()),
         updated_at = NOW()
     WHERE id = $1
     RETURNING supplier_response_count, first_supplier_response_at`,
    [demandId]
  );

  // SLA event
  try {
    const { writeDemandSlaEvent } = await import("./marketplaceService.js");
    await writeDemandSlaEvent(pool, demandId, "SUPPLIER_RESPONSE", {
      supplier_id: supplierId,
      response_count: updated[0]?.supplier_response_count,
      at: new Date().toISOString()
    });
  } catch { /* non-critical */ }

  logger.info({ demandId, supplierId, count: updated[0]?.supplier_response_count }, "Emergency supplier response recorded");

  return {
    recorded: true,
    response_count: updated[0]?.supplier_response_count || 0,
    first_response_at: updated[0]?.first_supplier_response_at
  };
}

/* ═══════════════════════════════════════════════════════
   escalateEmergency
   ═══════════════════════════════════════════════════════ */

/**
 * Manuelle Eskalation eines Emergency-Requests.
 * Erhoeht escalation_level, re-triggert Alerts.
 */
export async function escalateEmergency(pool, demandId, actorId) {
  /* `requester_company_id` (N4.5): ohne diese Spalte konnte die Eskalation die
     Org des Auftraggebers nie bestimmen — und die Kundensperre griff bei genau
     dem Weg nicht, der die meisten Anbieter anschreibt (bis zu fuenfzig). Beim
     ersten Einbau fehlte sie hier; der Riegel war damit so tot wie der der
     Detailansicht, aus demselben Grund. */
  const { rows } = await pool.query(
    `SELECT id, urgency, status, escalation_level, title, role, location_city, requester_company_id, requester_org_id
     FROM demand_requests WHERE id = $1`,
    [demandId]
  );
  if (!rows[0]) return { error: "NOT_FOUND" };
  if (rows[0].status !== "open") return { error: "NOT_OPEN" };
  if (!isEmergency(rows[0].urgency)) return { error: "NOT_EMERGENCY" };

  const currentLevel = rows[0].escalation_level ?? 0;
  if (currentLevel >= 3) return { error: "MAX_ESCALATION_REACHED" };

  const newLevel = currentLevel + 1;
  await pool.query(
    `UPDATE demand_requests SET escalation_level = $1, updated_at = NOW() WHERE id = $2`,
    [newLevel, demandId]
  );

  // SLA event
  try {
    const { writeDemandSlaEvent } = await import("./marketplaceService.js");
    await writeDemandSlaEvent(pool, demandId, "ESCALATION_STAGE", {
      stage: newLevel,
      manual: true,
      actor_id: actorId,
      at: new Date().toISOString()
    });
  } catch { /* non-critical */ }

  // Re-trigger alerts
  try {
    const { dispatch } = await import("./notificationMatrix.js");
    const { instantMatchFromParams } = await import("./instantMatchService.js");

    const demand = rows[0];
    /* N4.5: die Eskalation schreibt BIS ZU FUENFZIG Anbieter an — gerade dort
       darf keine Anfrage fuer eine gesperrte Kraft hinausgehen.
       N2.11: die Firma steht am Bedarf (Migration 218); `users.org_id` war die
       Start-Firma des Anlegers und fuer Teammitglieder falsch. */
    const kundeOrgId = await kundenOrgEinesBedarfs(pool, demand);
    const matchResults = await instantMatchFromParams(pool, {
      role: demand.role,
      skill_tags: [],
      location_city: demand.location_city
    }, null, { topN: 50, minScore: 5, urgency: "CRITICAL", kundeOrgId });

    const supplierIds = [...new Set(
      (matchResults.matches || []).map(m => m.capacity_post?.supplier_company_id).filter(Boolean)
    )];

    if (supplierIds.length > 0) {
      await dispatch(pool, "emergency.escalated", {
        recipientUserIds: supplierIds,
        entityType: "demand_request",
        entityId: demandId,
        message: `⚠️ ESKALATION Stufe ${newLevel}: "${demand.title}" – ${demand.role}, ${demand.location_city}. Dringend Kapazitaet benoetigt!`,
        emailQueue: true
      });
    }
  } catch (err) {
    logger.warn({ err: err.message, demandId }, "Escalation re-alert failed (non-blocking)");
  }

  logger.info({ demandId, newLevel, actorId }, "Emergency escalated");
  return { escalated: true, new_level: newLevel };
}

/* ═══════════════════════════════════════════════════════
   getEmergencyHistory
   ═══════════════════════════════════════════════════════ */

export async function getEmergencyHistory(pool, orgId, opts = {}) {
  const limit = Math.min(100, opts.limit || 50);
  const offset = Math.max(0, opts.offset || 0);

  const params = [orgId || null, limit, offset];
  const { rows } = await pool.query(
    `SELECT dr.*, u.company_name AS requester_company_name,
            EXTRACT(EPOCH FROM (COALESCE(first_supplier_response_at, NOW()) - dr.created_at)) / 60 AS response_minutes
     FROM demand_requests dr
     JOIN users u ON u.id = dr.requester_company_id
     WHERE dr.urgency IN ('notdienst', 'urgent', 'critical')
       AND ($1::text IS NULL OR dr.requester_company_id = $1)
     ORDER BY dr.created_at DESC
     LIMIT $2 OFFSET $3`,
    params
  );

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    role: r.role,
    location_city: r.location_city,
    urgency: r.urgency,
    urgency_level: classifyUrgency(r.urgency),
    status: r.status,
    sla_status: r.sla_status,
    escalation_level: r.escalation_level ?? 0,
    supplier_response_count: r.supplier_response_count ?? 0,
    response_minutes: r.first_supplier_response_at ? Math.round(Number(r.response_minutes) || 0) : null,
    created_at: r.created_at,
    requester_company_name: r.requester_company_name
  }));
}
