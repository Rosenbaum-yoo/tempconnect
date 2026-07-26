/**
 * Match-Trigger (P4.1) — der EINE Chokepoint fuer bidirektionales Sofort-Matching.
 *
 * Abgrenzung zu den bestehenden Matching-Bausteinen (bewusst getrennt, nichts doppelt):
 *   - `matchingEngine.js`      … WIE gut passt ein Paar (Scoring, deterministisch)
 *   - `instantMatchService.js` … Abfrage-Zeit: angereicherte Trefferliste auf Anfrage
 *   - `matchAlertService.js`   … WIE wird alarmiert (Datensatz, Praeferenz, E-Mail)
 *   - dieser Service          … WANN wird alarmiert und WER erfaehrt davon
 *
 * Warum ein Chokepoint: vor P4.1 gab es drei Stellen, die "bei Erstellung matchen"
 * unterschiedlich implementiert haben — `requisitions.js` (approve) rief den Match-
 * Alert-Service, `capacityExchange.js` (activate) hatte eine eigene Inline-Variante
 * ohne Dedup und ohne persistierten Alarm, und der Marktplatz-Erstellungspfad hatte
 * gar nichts. Diese Trigger sind auseinandergedriftet. Muster wie bei
 * `findWorkerScheduleConflicts` (P1.4): eine einzige Wahrheit, in ALLEN Pfaden erzwungen.
 *
 * Vier Eigenschaften, die hier strukturell garantiert sind:
 *  1) Bidirektional — jede Paarung alarmiert BEIDE Seiten (Anbieter + Nachfrager),
 *     nie nur die, die zufaellig gerade etwas angelegt hat.
 *  2) Dedup in der DB — kanonischer `pair_key` + UNIQUE Index (Migration 151).
 *     Applikationslogik kann das nicht garantieren: legt Seite A zuerst an und Seite B
 *     spaeter, ist die Quelle eine andere, das Paar aber dasselbe.
 *  3) Empfaenger aus der Rechte-Matrix — `findOrgMembersWithPermission`: benachrichtigt
 *     wird, wer handeln DARF (Angebot schreiben bzw. annehmen), nicht eine hartkodierte
 *     Rollenliste. Fallback auf den Eigentuemer-Account, wenn keine Org hinterlegt ist.
 *  4) Fire-and-forget — `scheduleMatchTrigger` haengt sich nie in den Erstellungsflow.
 *     Ein Matching-Fehler darf ein Angebot/einen Auftrag nie scheitern lassen (P1.3).
 *
 * Deep-Links zeigen immer auf das konkrete Gegenstueck, nie auf eine Uebersicht.
 */

import { createServiceLogger, swallow } from "../utils/logger.js";
import { matchCapacityToRequisitions, logMatch } from "./matchingEngine.js";
import { instantMatchFromParams } from "./instantMatchService.js";
import { dispatch, findOrgMembersWithPermission } from "./notificationMatrix.js";
import { getUserPreferences } from "./matchAlertService.js";

const logger = createServiceLogger("matchTrigger");

/* ── Kostengrenzen (§0.3: Skalierung 10 -> 300 Kunden mitdenken) ────────── */

/** Wie viele Gegenstuecke pro Erstellung ueberhaupt betrachtet werden. */
export const TRIGGER_TOP_N = 8;
/**
 * Score-Untergrenze fuer eine Benachrichtigung. 40 = mindestens exakte Rolle (30)
 * plus passende Verfuegbarkeit (10). Darunter ist es kein Treffer, sondern Rauschen —
 * und Rauschen kostet Vertrauen, nicht nur Zustellung.
 */
export const TRIGGER_MIN_SCORE = 40;
/** Harte Obergrenze an Benachrichtigungen pro Lauf (Schutz vor Alarm-Lawinen). */
export const TRIGGER_MAX_ALERTS = 24;

const SOURCE_TYPES = new Set(["capacity_post", "demand_request", "requisition"]);

/* ── Paar-Schluessel ────────────────────────────────────────────────────── */

/**
 * Kanonischer, richtungsunabhaengiger Schluessel fuer eine Paarung.
 * Ob das Angebot oder der Auftrag zuerst existierte, darf keinen Unterschied machen —
 * sonst alarmiert dieselbe Paarung zweimal.
 */
export function buildPairKey(aType, aId, bType, bId) {
  const a = `${aType}:${aId}`;
  const b = `${bType}:${bId}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/* ── Deep-Links auf das konkrete Gegenstueck ────────────────────────────── */

export function deepLinkFor(entityType, entityId) {
  switch (entityType) {
    case "capacity_post":
      return `/public/capacity_exchange_detail.html?id=${entityId}&type=supply`;
    case "demand_request":
      return `/public/capacity_exchange_detail.html?id=${entityId}&type=demand`;
    case "requisition":
      return `/public/requisitions.html?focus_id=${entityId}`;
    default:
      return null;
  }
}

/* ── Quelle laden (nur matchfaehige Zustaende) ──────────────────────────── */

async function loadSource(pool, sourceType, sourceId) {
  if (sourceType === "capacity_post") {
    const { rows } = await pool.query(
      `SELECT * FROM capacity_posts
        WHERE id = $1 AND is_active = TRUE AND (status IS NULL OR status = 'active')`,
      [sourceId]
    );
    return rows[0] || null;
  }
  if (sourceType === "demand_request") {
    const { rows } = await pool.query(
      `SELECT * FROM demand_requests WHERE id = $1 AND status = 'open'`,
      [sourceId]
    );
    return rows[0] || null;
  }
  const { rows } = await pool.query(
    `SELECT * FROM requisitions WHERE id = $1 AND status IN ('OPEN','IN_REVIEW','SHORTLISTED')`,
    [sourceId]
  );
  return rows[0] || null;
}

/** Vereinheitlichte Sicht auf ein Kapazitaetsangebot. */
function capacityView(row) {
  return {
    type: "capacity_post",
    id: row.id,
    title: row.title || "",
    role: row.role || "",
    city: row.location_city || "",
    ownerUserId: row.supplier_company_id || row.created_by || null,
    orgId: row.org_id || null
  };
}

/** Vereinheitlichte Sicht auf einen Auftrag (Marktplatz-Nachfrage oder Requisition). */
function demandView(type, row) {
  return {
    type,
    id: row.id,
    title: row.title || "",
    role: row.role || "",
    city: row.location_city || "",
    ownerUserId: type === "requisition" ? (row.created_by || null) : (row.requester_company_id || null),
    orgId: row.org_id || null,
    urgency: String(row.urgency || "normal").toLowerCase()
  };
}

/** Auftrag in das Demand-Format der Engine uebersetzen. */
function toEngineDemand(type, row) {
  return {
    role: row.role,
    skill_tags: row.skill_tags || [],
    latitude: type === "requisition" ? row.latitude : row.location_lat,
    longitude: type === "requisition" ? row.longitude : row.location_lng,
    location_city: row.location_city,
    radius_km: row.radius_km,
    start_date: row.start_date,
    end_date: row.end_date
  };
}

/* ── Empfaenger: wer darf handeln? ──────────────────────────────────────── */

/**
 * Empfaenger einer Seite. Permission-abgeleitet, wenn eine Org hinterlegt ist;
 * sonst der Eigentuemer-Account (Marktplatz-Bestandsdaten haben keine org_id —
 * dort IST der Account die handelnde Einheit). Eine Benachrichtigung an niemanden
 * waere immer ein Bug.
 */
async function resolveRecipients(pool, { orgId, ownerUserId, permission }) {
  const ids = new Set();
  if (orgId) {
    for (const id of await findOrgMembersWithPermission(pool, orgId, permission)) ids.add(id);
  }
  if (ids.size === 0 && ownerUserId) ids.add(ownerUserId);
  return [...ids];
}

/* ── Alarm schreiben (Dedup entscheidet die DB) ─────────────────────────── */

/**
 * Schreibt den Alarm-Datensatz. Gibt `false` zurueck, wenn dieser Empfaenger fuer
 * dieses Paar bereits alarmiert wurde — der UNIQUE Index entscheidet, nicht wir.
 */
async function insertPairAlert(pool, { userId, source, counterpart, score, reasons, urgency }) {
  const severity = urgency === "urgent" || urgency === "notdienst" || urgency === "critical" ? "urgent" : "info";
  const { rowCount } = await pool.query(
    `INSERT INTO match_alerts
       (user_id, match_count, source_type, source_id, match_score, match_reasons, severity,
        counterpart_type, counterpart_id, pair_key)
     VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, pair_key) WHERE pair_key IS NOT NULL DO NOTHING`,
    [
      userId,
      source.type,
      source.id,
      Math.round(score) || null,
      JSON.stringify((reasons || []).slice(0, 3)),
      severity,
      counterpart.type,
      counterpart.id,
      buildPairKey(source.type, source.id, counterpart.type, counterpart.id)
    ]
  );
  return rowCount > 0;
}

export function buildTriggerMessage(counterpart, score) {
  const kind = counterpart.type === "capacity_post" ? "Passendes Personalangebot" : "Passender Auftrag";
  const role = counterpart.role ? ` – ${counterpart.role}` : "";
  const where = counterpart.city ? `, ${counterpart.city}` : "";
  return `${kind}: "${counterpart.title}"${role}${where} (Match ${Math.round(score)}%)`;
}

/**
 * Eine Seite benachrichtigen: Alarm speichern (Dedup), Praeferenz pruefen, zustellen.
 * @returns {Promise<number>} Anzahl tatsaechlich zugestellter Benachrichtigungen
 */
async function alertSide(pool, { recipients, source, counterpart, score, reasons, urgency, eventKey }) {
  let sent = 0;
  for (const userId of recipients) {
    const created = await insertPairAlert(pool, { userId, source, counterpart, score, reasons, urgency });
    if (!created) continue;

    const prefs = await getUserPreferences(pool, userId, eventKey, urgency);
    if (!prefs.inApp) continue;

    await dispatch(pool, eventKey, {
      recipientUserIds: [userId],
      orgId: source.orgId || null,
      entityType: counterpart.type,
      entityId: counterpart.id,
      message: buildTriggerMessage(counterpart, score),
      linkPath: deepLinkFor(counterpart.type, counterpart.id),
      emailQueue: prefs.email,
      _skipPreferenceCheck: true
    });
    sent++;
  }
  return sent;
}

/* ── Chokepoint ─────────────────────────────────────────────────────────── */

/**
 * Sofort-Matching fuer eine gerade entstandene/aktivierte Seite — und Benachrichtigung
 * BEIDER Seiten je Treffer.
 *
 * @param {import('pg').Pool} pool
 * @param {Object} args
 * @param {'capacity_post'|'demand_request'|'requisition'} args.sourceType
 * @param {string} args.sourceId
 * @param {number} [args.topN]
 * @param {number} [args.minScore]
 * @returns {Promise<{ pairs: number, alerts: number, skipped?: string }>}
 */
export async function runMatchTrigger(pool, args = {}) {
  const { sourceType, sourceId } = args;
  if (!SOURCE_TYPES.has(sourceType) || !sourceId) {
    return { pairs: 0, alerts: 0, skipped: "invalid_source" };
  }

  const topN = args.topN ?? TRIGGER_TOP_N;
  const minScore = args.minScore ?? TRIGGER_MIN_SCORE;

  const row = await loadSource(pool, sourceType, sourceId);
  if (!row) return { pairs: 0, alerts: 0, skipped: "not_matchable" };

  // Kandidaten in der jeweiligen Gegenrichtung ermitteln.
  const candidates = [];
  if (sourceType === "capacity_post") {
    const supply = capacityView(row);
    const found = await matchCapacityToRequisitions(pool, sourceId, { topN, minScore });
    for (const m of found) {
      candidates.push({ supply, demand: demandView(m.type, m.entity), score: m.score, reasons: m.reasons });
    }
  } else {
    // Auftrag -> Angebote: die angereicherte Variante nutzen (Compliance, Reputation,
    // Vendor-Pool, Smart Rank sind dort bereits batch-vorgeladen — kein N+1, keine
    // Zweitimplementierung).
    const demand = demandView(sourceType, row);
    const result = await instantMatchFromParams(pool, toEngineDemand(sourceType, row), demand.orgId, {
      topN, minScore, urgency: demand.urgency,
      requisitionId: sourceType === "requisition" ? sourceId : null
    });
    for (const m of result.matches || []) {
      candidates.push({ supply: capacityView(m.capacity_post), demand, score: m.score, reasons: m.reasons });
    }
  }

  let pairs = 0;
  let alerts = 0;

  for (const cand of candidates) {
    if (alerts >= TRIGGER_MAX_ALERTS) break;
    const { supply, demand, score, reasons } = cand;
    if (!supply.id || !demand.id) continue;

    // Selbstmatch: eigene Kapazitaet gegen eigenen Bedarf ist kein Marktplatz-Treffer.
    if (supply.ownerUserId && supply.ownerUserId === demand.ownerUserId) continue;
    if (supply.orgId && demand.orgId && supply.orgId === demand.orgId) continue;

    pairs++;
    const urgency = demand.urgency || "normal";

    // Anbieter-Seite: wer ein Angebot schreiben darf.
    const supplyRecipients = await resolveRecipients(pool, {
      orgId: supply.orgId, ownerUserId: supply.ownerUserId, permission: "offer.create"
    });
    alerts += await alertSide(pool, {
      recipients: supplyRecipients, source: supply, counterpart: demand,
      score, reasons, urgency, eventKey: "capacity.match_found"
    });

    // Nachfrage-Seite: wer ein Angebot annehmen darf.
    const demandRecipients = await resolveRecipients(pool, {
      orgId: demand.orgId, ownerUserId: demand.ownerUserId, permission: "offer.accept"
    });
    alerts += await alertSide(pool, {
      recipients: demandRecipients, source: demand, counterpart: supply,
      score, reasons, urgency, eventKey: "demand.match_found"
    });

    // Auswertungsspur: "alarmiert" ist der Zustand, gegen den 4.3 spaeter gemessen wird.
    await logMatch(pool, {
      match_type: `${demand.type}_capacity`,
      source_id: demand.id,
      target_id: supply.id,
      score,
      reasons,
      outcome: "alerted",
      org_id: demand.orgId || supply.orgId || null
    });
  }

  logger.info({ sourceType, sourceId, pairs, alerts }, "Instant-Matching abgeschlossen");
  return { pairs, alerts };
}

/**
 * Fire-and-forget-Variante fuer Erstellungspfade: startet den Lauf, blockiert nie und
 * kann den ausloesenden Request nicht scheitern lassen. Fehler bleiben im Log sichtbar
 * (`swallow`), statt still zu verschwinden.
 */
export function scheduleMatchTrigger(pool, args = {}) {
  Promise.resolve()
    .then(() => runMatchTrigger(pool, args))
    .catch(swallow(`matchTrigger.${args.sourceType || "unknown"}`));
}

export default { runMatchTrigger, scheduleMatchTrigger, buildPairKey, deepLinkFor };
