/**
 * Deal Agreement Service — bindendes Dokument zwischen Verhandlung und operativem Einsatz.
 *
 * Lifecycle auf dem Offer-Record:
 *   offer.status = 'accepted'  →  agreement_status:
 *     none → agreement_created → pending_confirmation → confirmed → activated
 *
 * Standard-Flow:
 *   Offer accepted → createAgreement() → confirmAgreement() → activateAgreement() → Assignment
 *
 * Notdienst-Sofortflow:
 *   Commitment → createEmergencyAgreement() → confirmAgreement() → activateAgreement() → Assignment
 */

import { withTransaction } from "../utils/transaction.js";
import { assertTransition, logTransition, TransitionError } from "./stateMachine.js";
import * as assignmentService from "./assignmentService.js";
import * as rbacService from "./rbacService.js";
import * as auditLog from "./auditLog.js";
import * as capacityExchangeService from "./capacityExchangeService.js";
import * as marketplaceService from "./marketplaceService.js";
import { createDocumentRecord, computeContentHash } from "./dealDossierService.js";
import { renderConditionsSheet, renderAgreementDocument } from "./agreementDocumentService.js";
import { swallow } from "../utils/logger.js";

/* ── Agreement-Ref Generator ──────────────────────── */

async function nextAgreementRef(client) {
  const { rows } = await client.query("SELECT nextval('agreement_ref_seq') AS seq");
  const seq = String(rows[0].seq).padStart(6, "0");
  const year = new Date().getFullYear();
  return `EV-${year}-${seq}`;
}

/* ── Konditions-Snapshot erstellen ─────────────────── */

function buildConditionsSnapshot(offer, demand) {
  return {
    // Bedarf
    demand_id: demand?.id || null,
    demand_title: demand?.title || null,
    demand_role: demand?.role || null,
    demand_location: demand?.location_city || null,
    demand_start: demand?.start_date || null,
    demand_end: demand?.end_date || null,
    demand_headcount: demand?.headcount || null,
    requester_company: demand?.requester_company_name || null,
    // Capacity-Herkunft
    capacity_post_id: offer.capacity_post_id || null,
    capacity_title: offer.capacity_title || null,
    capacity_role: offer.capacity_role || null,
    capacity_location: offer.capacity_location || null,
    capacity_headcount: offer.capacity_headcount || null,
    capacity_status: offer.capacity_status || null,
    // Konditionen
    offered_quantity: offer.offered_quantity || null,
    offered_hourly_rate: offer.offered_hourly_rate || null,
    price_type: offer.price_type || null,
    price_value: offer.price_value || null,
    price_min: offer.price_min || null,
    price_max: offer.price_max || null,
    start_confirmed: offer.start_confirmed || null,
    end_date: offer.end_date || null,
    surcharges: offer.surcharges || null,
    billing_unit: offer.billing_unit || null,
    min_hours_per_shift: offer.min_hours_per_shift || null,
    replacement_sla_minutes: offer.replacement_sla_minutes || null,
    response_time_minutes: offer.response_time_minutes || null,
    cancellation_policy: offer.cancellation_policy || null,
    terms: offer.terms || null,
    validity_until: offer.validity_until || null,
    // Meta
    offer_id: offer.id,
    supplier_company_id: offer.supplier_company_id,
    supplier_company_name: offer.supplier_company_name || null,
    snapshot_at: new Date().toISOString()
  };
}

/* ── Standard-Flow: Einsatzvereinbarung erstellen ──── */

/**
 * Erzeugt eine bindende Einsatzvereinbarung aus einem akzeptierten Angebot.
 * Friert die Konditionen als Snapshot ein.
 * @param {import('pg').Pool} pool
 * @param {string} offerId
 * @param {string} actorId - User der die Vereinbarung erstellt (typischerweise Requester)
 */
export async function createAgreement(pool, offerId, actorId) {
  return await withTransaction(pool, async (client) => {
    // Offer + Demand laden mit Lock
    const { rows: offerRows } = await client.query(
      `SELECT o.*, d.title AS demand_title, d.role AS demand_role, d.location_city AS demand_location,
              d.start_date AS demand_start, d.end_date AS demand_end, d.headcount AS demand_headcount,
              d.requester_company_id, du.company_name AS requester_company_name,
              su.company_name AS supplier_company_name,
              cp.title AS capacity_title,
              cp.role AS capacity_role,
              cp.location_city AS capacity_location,
              cp.headcount AS capacity_headcount,
              cp.status AS capacity_status
       FROM offers o
       JOIN demand_requests d ON d.id = o.demand_request_id
       LEFT JOIN users du ON du.id = d.requester_company_id
       LEFT JOIN users su ON su.id = o.supplier_company_id
       LEFT JOIN capacity_posts cp ON cp.id = o.capacity_post_id
       WHERE o.id = $1 FOR UPDATE OF o`,
      [offerId]
    );
    const offer = offerRows[0];
    if (!offer) return { error: "NOT_FOUND" };
    if (offer.status !== "accepted") return { error: "OFFER_NOT_ACCEPTED", current_status: offer.status };

    // State-Machine-Guard: none → pending_confirmation
    const from = offer.agreement_status || "none";
    try {
      assertTransition("AGREEMENT", from, "pending_confirmation");
    } catch (e) {
      if (e instanceof TransitionError) {
        return { error: "AGREEMENT_ALREADY_EXISTS", agreement_status: from };
      }
      throw e;
    }

    const ref = await nextAgreementRef(client);
    const snapshot = buildConditionsSnapshot(offer, {
      id: offer.demand_request_id,
      title: offer.demand_title,
      role: offer.demand_role,
      location_city: offer.demand_location,
      start_date: offer.demand_start,
      end_date: offer.demand_end,
      headcount: offer.demand_headcount,
      requester_company_name: offer.requester_company_name
    });

    const { rows: updated } = await client.query(
      `UPDATE offers SET
         agreement_status = 'pending_confirmation',
         agreement_ref = $2,
         agreement_snapshot = $3,
         agreement_version = agreement_version + 1,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [offerId, ref, JSON.stringify(snapshot)]
    );

    await logTransition(client, {
      entityType: "AGREEMENT", from, to: "pending_confirmation",
      entity_id: offerId, actor_id: actorId,
      details: { agreement_ref: ref }
    });

    await auditLog.writeAudit(client, {
      action: "deal.agreement_created",
      entity_type: "offer",
      entity_id: offerId,
      actor_id: actorId,
      details: { agreement_ref: ref, counterparty: offer.supplier_company_id }
    });

    // Auto-Dokument-Records: Konditionsblatt + Einsatzvereinbarung
    try {
      const condHtml = renderConditionsSheet(updated[0]);
      await createDocumentRecord(client, {
        offerId, documentType: "conditions_sheet",
        title: `Konditionsblatt ${ref}`,
        contentHash: computeContentHash(condHtml),
        generatedBy: actorId, agreementRef: ref, agreementVersion: updated[0].agreement_version
      });
      const agrHtml = renderAgreementDocument(updated[0]);
      await createDocumentRecord(client, {
        offerId, documentType: "agreement",
        title: `Einsatzvereinbarung ${ref}`,
        contentHash: computeContentHash(agrHtml),
        generatedBy: actorId, agreementRef: ref, agreementVersion: updated[0].agreement_version
      });
      // Auto-Ablage: beide Dokumente fuer BEIDE Partei-Orgs im Dokumenten-Tresor (fire-and-forget, eigener Pool).
      import("./documentIngestService.js")
        .then((m) => m.ingestAgreementDocs(pool, { offerId, agreementRef: ref, condHtml, agrHtml }))
        .catch(swallow("dealAgreementService"));
    } catch { /* Dokument-Record-Fehler ist non-critical */ }

    return { offer: updated[0], agreement_ref: ref, snapshot };
  });
}

/* ── Gegenseite bestätigt ──────────────────────────── */

/**
 * Die Gegenseite (typischerweise Agency/Supplier) bestätigt die Einsatzvereinbarung.
 */
export async function confirmAgreement(pool, offerId, actorId) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM offers WHERE id = $1 FOR UPDATE",
      [offerId]
    );
    const offer = rows[0];
    if (!offer) return { error: "NOT_FOUND" };

    // State-Machine-Guard: pending_confirmation → confirmed
    const from = offer.agreement_status || "none";
    try {
      assertTransition("AGREEMENT", from, "confirmed");
    } catch (e) {
      if (e instanceof TransitionError) {
        return { error: "INVALID_AGREEMENT_STATUS", current: from, expected: "pending_confirmation" };
      }
      throw e;
    }

    const { rows: updated } = await client.query(
      `UPDATE offers SET
         agreement_status = 'confirmed',
         confirmed_by = $2,
         confirmed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [offerId, actorId]
    );

    await logTransition(client, {
      entityType: "AGREEMENT", from, to: "confirmed",
      entity_id: offerId, actor_id: actorId,
      details: { agreement_ref: offer.agreement_ref }
    });

    await auditLog.writeAudit(client, {
      action: "deal.agreement_confirmed",
      entity_type: "offer",
      entity_id: offerId,
      actor_id: actorId,
      details: { agreement_ref: offer.agreement_ref }
    });
    const syncedDemand = offer.demand_request_id
      ? await marketplaceService.syncDemandCommercialState(client, offer.demand_request_id)
      : null;

    const syncedCapacity = offer.capacity_post_id
      ? await capacityExchangeService.syncCapacityCommercialState(client, offer.capacity_post_id)
      : null;

    return { offer: updated[0], demand: syncedDemand, capacity: syncedCapacity };
  });
}

/* ── Signatur vorbereiten (ohne Provider-Integration) ───────────── */

/**
 * Bereitet eine spaetere E-Signatur-Integration vor.
 * Kein Fake-Signing: Es werden nur Metadaten gesetzt.
 *
 * Aktueller Scope:
 * - signature_required = true
 * - signature_status = 'pending'
 * - signature_provider / signature_reference werden gesetzt
 *
 * WICHTIG: Das ist nur die Vorbereitungsstrecke. Eine echte Signatur-
 * Provider-Integration (z. B. DocuSign / Yousign) kann spaeter an diese
 * Metadaten andocken.
 */
export async function prepareSignature(pool, offerId, actorId, opts = {}) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM offers WHERE id = $1 FOR UPDATE",
      [offerId]
    );
    const offer = rows[0];
    if (!offer) return { error: "NOT_FOUND" };

    if (offer.agreement_status !== "confirmed") {
      return { error: "INVALID_AGREEMENT_STATUS", current: offer.agreement_status, expected: "confirmed" };
    }

    // Idempotent: bereits vorbereitet
    if (offer.signature_required && offer.signature_status === "pending") {
      return { offer, prepared: true, idempotent: true };
    }

    const provider = (opts.provider || "prepared").slice(0, 80);
    const reference = opts.reference
      ? String(opts.reference).slice(0, 200)
      : `sigprep-${offerId.slice(0, 8)}-${Date.now()}`;

    const { rows: updated } = await client.query(
      `UPDATE offers SET
         signature_required = TRUE,
         signature_status = 'pending',
         signature_provider = $2,
         signature_reference = $3,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [offerId, provider, reference]
    );

    await auditLog.writeAudit(client, {
      action: "deal.agreement_signature_prepared",
      entity_type: "offer",
      entity_id: offerId,
      actor_id: actorId,
      details: {
        agreement_ref: offer.agreement_ref,
        signature_provider: provider,
        signature_reference: reference
      }
    });

    return { offer: updated[0], prepared: true };
  });
}

/* ── Aktivierung → Assignment ──────────────────────── */

/**
 * Aktiviert die bestätigte Einsatzvereinbarung und erzeugt ein Assignment.
 */
export async function activateAgreement(pool, offerId, actorId) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT o.*, d.requester_company_id, d.role AS demand_role, d.title AS demand_title,
              d.start_date AS demand_start, d.end_date AS demand_end, d.headcount AS demand_headcount
       FROM offers o
       JOIN demand_requests d ON d.id = o.demand_request_id
       WHERE o.id = $1 FOR UPDATE OF o`,
      [offerId]
    );
    const offer = rows[0];
    if (!offer) return { error: "NOT_FOUND" };

    // State-Machine-Guard: confirmed → activated
    const from = offer.agreement_status || "none";
    try {
      assertTransition("AGREEMENT", from, "activated");
    } catch (e) {
      if (e instanceof TransitionError) {
        return { error: "INVALID_AGREEMENT_STATUS", current: from, expected: "confirmed" };
      }
      throw e;
    }

    // Idempotenz: kein doppeltes Assignment
    if (offer.assignment_id) {
      return { error: "ALREADY_ACTIVATED", assignment_id: offer.assignment_id };
    }

    // Org-IDs auflösen für Assignment
    const [requesterOrg, supplierOrg] = await Promise.all([
      rbacService.getPrimaryOrg(client, offer.requester_company_id),
      rbacService.getPrimaryOrg(client, offer.supplier_company_id)
    ]);

    let assignment = null;
    if (requesterOrg?.org_id && supplierOrg?.org_id) {
      assignment = await assignmentService.createAssignment(client, {
        org_id: requesterOrg.org_id,
        supplier_org_id: supplierOrg.org_id,
        demand_request_id: offer.demand_request_id,
        offer_id: offer.id,
        worker_description: offer.demand_role || offer.demand_title || null,
        requested_quantity: offer.offered_quantity || offer.demand_headcount || 1,
        worker_count: offer.offered_quantity || offer.demand_headcount || 1,
        start_date: offer.start_confirmed || offer.demand_start || new Date().toISOString().slice(0, 10),
        planned_end_date: offer.end_date || offer.demand_end || null,
        hourly_rate_cents: offer.offered_hourly_rate ? Math.round(offer.offered_hourly_rate * 100) : null,
        notes: `Einsatzvereinbarung ${offer.agreement_ref} – aus Angebot #${offer.id}`,
        created_by: actorId,
        status: "planned"
      });
    }

    const { rows: updated } = await client.query(
      `UPDATE offers SET
         agreement_status = 'activated',
         activated_at = NOW(),
         activated_by = $2,
         assignment_id = $3,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [offerId, actorId, assignment?.id || null]
    );

    await logTransition(client, {
      entityType: "AGREEMENT", from, to: "activated",
      entity_id: offerId, actor_id: actorId,
      details: { agreement_ref: offer.agreement_ref, assignment_id: assignment?.id }
    });

    await auditLog.writeAudit(client, {
      action: "deal.agreement_activated",
      entity_type: "offer",
      entity_id: offerId,
      actor_id: actorId,
      details: { agreement_ref: offer.agreement_ref, assignment_id: assignment?.id }
    });

    return { offer: updated[0], assignment };
  });
}

/* ── Notdienst: Sofortvereinbarung aus Commitment ──── */

/**
 * Erzeugt eine Sofort-Einsatzvereinbarung aus einem Emergency-Commitment.
 * Erstellt ein Offer mit agreement_status = 'pending_confirmation'.
 */
export async function createEmergencyAgreement(pool, { demandId, commitmentId, conditions, actorId }) {
  return await withTransaction(pool, async (client) => {
    // Commitment + Demand laden
    const { rows: cRows } = await client.query(
      `SELECT c.*, d.title, d.role, d.location_city, d.start_date, d.end_date,
              d.requester_company_id, d.headcount,
              du.company_name AS requester_company_name,
              su.company_name AS supplier_company_name
       FROM emergency_provider_commitments c
       JOIN demand_requests d ON d.id = c.demand_request_id
       LEFT JOIN users du ON du.id = d.requester_company_id
       LEFT JOIN users su ON su.id = c.supplier_company_id
       WHERE c.id = $1 AND c.demand_request_id = $2
       FOR UPDATE OF c`,
      [commitmentId, demandId]
    );
    const commitment = cRows[0];
    if (!commitment) return { error: "NOT_FOUND" };
    // Org-Boundary: nur die beiden Parteien des Commitments — das anfragende
    // Unternehmen (requester) ODER die zusagende Agentur (supplier) — dürfen daraus
    // eine bindende Vereinbarung erzeugen. emergencyAccess ist nur ein Feature-Gate
    // (emergency_staffing), KEIN Ownership-Check; ohne diese Prüfung könnte eine
    // fremde Org ein accepted Offer + Agreement auf eine fremde Notlage erzeugen
    // (Cross-Org-IDOR). Spiegelt die Autorisierung von updateCommitmentStatus.
    const isRequester = commitment.requester_company_id === actorId;
    const isSupplier  = commitment.supplier_company_id === actorId;
    if (!isRequester && !isSupplier) return { error: "FORBIDDEN" };
    if (commitment.status !== "committed") return { error: "COMMITMENT_NOT_ACTIVE", current: commitment.status };

    // Offer für Sofortvereinbarung erstellen
    const { rows: offerRows } = await client.query(
      `INSERT INTO offers (
         demand_request_id, supplier_company_id, status,
         offered_quantity, offered_hourly_rate, start_confirmed,
         terms, notes,
         replacement_sla_minutes, response_time_minutes,
         agreement_status
       ) VALUES ($1, $2, 'accepted', $3, $4, $5, $6, $7, $8, $9, 'none')
       RETURNING *`,
      [
        demandId,
        commitment.supplier_company_id,
        conditions?.quantity || commitment.committed_quantity,
        conditions?.hourly_rate || null,
        conditions?.start_time || new Date().toISOString().slice(0, 10),
        conditions?.terms || null,
        conditions?.note || commitment.note || "Notdienst-Sofortvereinbarung",
        conditions?.replacement_sla_minutes || null,
        conditions?.response_time_minutes || null
      ]
    );
    const offer = offerRows[0];

    // Agreement direkt erzeugen
    const ref = await nextAgreementRef(client);
    const snapshot = buildConditionsSnapshot(
      { ...offer, supplier_company_name: commitment.supplier_company_name },
      { id: demandId, title: commitment.title, role: commitment.role, location_city: commitment.location_city,
        start_date: commitment.start_date, end_date: commitment.end_date,
        headcount: commitment.headcount, requester_company_name: commitment.requester_company_name }
    );

    await client.query(
      `UPDATE offers SET
         agreement_status = 'pending_confirmation',
         agreement_ref = $2,
         agreement_snapshot = $3,
         agreement_version = 1,
         updated_at = NOW()
       WHERE id = $1`,
      [offer.id, ref, JSON.stringify(snapshot)]
    );

    // Commitment mit Offer verknüpfen
    await client.query(
      `UPDATE emergency_provider_commitments SET
         agreement_offer_id = $2,
         conditions_snapshot = $3,
         hourly_rate_cents = $4,
         start_time = $5,
         response_time_minutes = $6,
         replacement_sla_minutes = $7,
         updated_at = NOW()
       WHERE id = $1`,
      [
        commitmentId, offer.id,
        JSON.stringify(conditions || {}),
        conditions?.hourly_rate ? Math.round(conditions.hourly_rate * 100) : null,
        conditions?.start_time || null,
        conditions?.response_time_minutes || null,
        conditions?.replacement_sla_minutes || null
      ]
    );

    await auditLog.writeAudit(client, {
      action: "deal.emergency_agreement_created",
      entity_type: "offer",
      entity_id: offer.id,
      actor_id: actorId,
      details: { agreement_ref: ref, commitment_id: commitmentId, demand_id: demandId }
    });

    return { offer: { ...offer, agreement_status: "pending_confirmation", agreement_ref: ref }, commitment_id: commitmentId, snapshot };
  });
}

/* ── Agreement stornieren ──────────────────────────── */

/**
 * Zulaessige Stornogruende (P8 Welle A, Mig 163).
 *
 * Geschlossene Liste, weil sich aus "Kunde hat kurzfristig abgesagt" keine Quote
 * rechnen laesst. Freitext gehoert in `note` — fuer Menschen, nicht fuer Statistik.
 * 'other' ist bewusst dabei: ohne Sammelposten waehlen Nutzer irgendetwas Falsches,
 * und dann luegen ALLE Kategorien.
 */
export const CANCELLATION_REASONS = Object.freeze([
  "customer_cancelled", "worker_sick", "worker_quit", "date_moved", "mistake", "other"
]);

/**
 * Vorlauf in Stunden zwischen Storno und Einsatzbeginn.
 *
 * DACH-Zeit: Das Startdatum ist ein reines Datum ohne Zeitzone. Wird es als UTC
 * gelesen, liegt der Beginn im Sommer zwei Stunden zu frueh — bei einer
 * 48-Stunden-Schwelle entscheidet das ueber die Gewichtung eines Stornos.
 * Deshalb wird der Tagesbeginn ausdruecklich in Europe/Berlin angesetzt.
 *
 * NEGATIVE Werte sind gewollt: nach Einsatzbeginn storniert ist der teuerste Fall
 * ueberhaupt und muss unterscheidbar bleiben, nicht auf 0 geklemmt werden.
 *
 * @returns {number|null} null, wenn kein Beginn bekannt ist
 */
export function berechneVorlaufStunden(startDate, jetzt = new Date()) {
  if (!startDate) return null;
  const tag = String(startDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return null;
  const mitternachtUtc = Date.parse(`${tag}T00:00:00Z`);
  if (Number.isNaN(mitternachtUtc)) return null;
  const beginn = mitternachtUtc - zeitzonenVersatzMs(new Date(mitternachtUtc), "Europe/Berlin");
  return Math.round((beginn - jetzt.getTime()) / 3600000);
}

/**
 * UTC-Versatz einer Zeitzone zu einem Zeitpunkt, in Millisekunden (Sommerzeit inklusive).
 *
 * Bewusst ueber `Intl.formatToParts` und NICHT ueber
 * `new Date(d.toLocaleString("en-US", { timeZone }))`: Der bequeme Einzeiler misst
 * die Differenz zwischen Zielzone und ZEITZONE DES RECHNERS und liefert auf einem
 * deutschen Rechner konstant 0 — der Fehler faellt in der Entwicklung nie auf und
 * schlaegt erst auf einem UTC-Server zu. Genau diese Falle hat
 * test/offerCancellation.test.js beim ersten Lauf aufgedeckt.
 */
function zeitzonenVersatzMs(zeitpunkt, zone) {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(zeitpunkt).reduce((acc, t) => {
    if (t.type !== "literal") acc[t.type] = Number(t.value);
    return acc;
  }, {});
  // 24 statt 00 kommt bei hour12:false vor und wuerde sonst einen Tag verschieben.
  const stunde = teile.hour % 24;
  const alsUtc = Date.UTC(teile.year, teile.month - 1, teile.day, stunde, teile.minute, teile.second);
  return alsUtc - zeitpunkt.getTime();
}

/**
 * Storniert eine Einsatzvereinbarung (aus pending_confirmation, confirmed oder
 * activated). Terminal-Status: cancelled.
 *
 * Der Grund ist seit P8 Welle A PFLICHT. Ohne ihn liesse sich nicht unterscheiden,
 * ob jemand unverschuldet storniert (Kunde sagt ab) oder einfach besser vermittelt
 * hat — und genau diese Unterscheidung traegt die Zuverlaessigkeitsquote.
 *
 * @param {import('pg').Pool} pool
 * @param {string} offerId
 * @param {string} actorId - User der storniert
 * @param {{reason_code:string, note?:string|null, side:'company'|'agency'}} angaben
 */
export async function cancelAgreement(pool, offerId, actorId, angaben = {}) {
  const reasonCode = angaben?.reason_code;
  if (!CANCELLATION_REASONS.includes(reasonCode)) {
    return { error: "REASON_REQUIRED", allowed: CANCELLATION_REASONS };
  }
  const reason = angaben?.note || null;
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM offers WHERE id = $1 FOR UPDATE",
      [offerId]
    );
    const offer = rows[0];
    if (!offer) return { error: "NOT_FOUND" };

    const from = offer.agreement_status || "none";
    try {
      assertTransition("AGREEMENT", from, "cancelled");
    } catch (e) {
      if (e instanceof TransitionError) {
        return { error: "INVALID_AGREEMENT_STATUS", current: from, message: "Stornierung nicht m\u00f6glich in diesem Status." };
      }
      throw e;
    }

    const { rows: updated } = await client.query(
      `UPDATE offers SET
         agreement_status = 'cancelled',
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [offerId]
    );

    // Storno-Erfassung (P8 Welle A, Mig 163): Rohdaten fuer die Zuverlaessigkeits-
    // quote. Bewusst OHNE fertiges Gewicht — die Regeln werden sich einspielen,
    // und gespeicherte Gewichte muessten bei jeder Aenderung nachgezogen werden.
    const startDatum = offer.start_confirmed || offer.assignment_start_date || null;
    const vorlauf = berechneVorlaufStunden(startDatum);
    await client.query(
      `INSERT INTO offer_cancellations
         (offer_id, reason_code, note, cancelled_by_user_id, cancelled_by_side,
          assignment_start_date, lead_time_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (offer_id) DO NOTHING`,
      [offerId, reasonCode, reason, actorId, angaben.side, startDatum, vorlauf]
    );

    await logTransition(client, {
      entityType: "AGREEMENT", from, to: "cancelled",
      entity_id: offerId, actor_id: actorId,
      details: {
        agreement_ref: offer.agreement_ref,
        reason_code: reasonCode,
        note: reason || null,
        side: angaben.side,
        lead_time_hours: vorlauf
      }
    });

    // Welle 7 – Phase 9: Storno-Reaktivierung fuer Staffing-Nebenwirkungen.
    //
    // Bei Stornierung eines aktivierten Deals muessen die operativen Neben-
    // zustaende zurueckgedreht werden, damit Kapazitaet und Staffing wieder
    // dispatchbar sind:
    //  - Assignment (falls vorhanden) → status 'cancelled'
    //  - offene Staffing-Reservierungen → 'released'
    //  - aktive Staffing-Invites → 'cancelled'
    // demand_requests und capacity_posts werden anschliessend ueber die
    // bestehenden sync*-Aufrufe automatisch neu gerechnet (offen/active).
    const staffingReset = {
      assignment_cancelled: false,
      reservations_released: 0,
      invites_cancelled: 0
    };
    if (offer.assignment_id) {
      try {
        const { rowCount: asgUpdated } = await client.query(
          `UPDATE assignments SET status = 'cancelled', updated_at = NOW()
             WHERE id = $1
               AND status NOT IN ('cancelled','completed')`,
          [offer.assignment_id]
        );
        staffingReset.assignment_cancelled = asgUpdated > 0;

        const { rowCount: resReleased } = await client.query(
          `UPDATE assignment_staffing_reservations
             SET status = 'released', released_at = NOW()
             WHERE assignment_id = $1
               AND status IN ('reserved','pending')`,
          [offer.assignment_id]
        );
        staffingReset.reservations_released = resReleased || 0;

        const { rowCount: invCancelled } = await client.query(
          `UPDATE assignment_staffing_invites
             SET status = 'cancelled', responded_at = NOW(), updated_at = NOW()
             WHERE assignment_id = $1
               AND status IN ('sent','viewed','interested','accepted')`,
          [offer.assignment_id]
        );
        staffingReset.invites_cancelled = invCancelled || 0;
      } catch (resetErr) {
        // Nicht-kritisch: Audit-Trail erhaelt Fehlerkontext, Cancel-Pfad
        // soll nicht scheitern, wenn die Staffing-Nebentabellen schemantisch
        // noch veraltet sind.
        staffingReset.error = resetErr?.message || String(resetErr);
      }
    }

    await auditLog.writeAudit(client, {
      action: "deal.agreement_cancelled",
      entity_type: "offer",
      entity_id: offerId,
      actor_id: actorId,
      details: {
        agreement_ref: offer.agreement_ref,
        from_status: from,
        reason: reason || null,
        assignment_id: offer.assignment_id || null,
        staffing_reset: staffingReset
      }
    });
    const syncedDemand = offer.demand_request_id
      ? await marketplaceService.syncDemandCommercialState(client, offer.demand_request_id)
      : null;
    const syncedCapacity = offer.capacity_post_id
      ? await capacityExchangeService.syncCapacityCommercialState(client, offer.capacity_post_id)
      : null;

    return { offer: updated[0], demand: syncedDemand, capacity: syncedCapacity, staffing_reset: staffingReset };
  });
}

/* ── Agreement ablaufen lassen (Cron/System) ──────── */

/**
 * Markiert ein unbest\u00e4tigtes Agreement als abgelaufen.
 * Nur f\u00fcr pending_confirmation erlaubt (Timeout-Logik).
 */
export async function expireAgreement(pool, offerId) {
  return await withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM offers WHERE id = $1 FOR UPDATE",
      [offerId]
    );
    const offer = rows[0];
    if (!offer) return { error: "NOT_FOUND" };

    const from = offer.agreement_status || "none";
    try {
      assertTransition("AGREEMENT", from, "expired");
    } catch (e) {
      if (e instanceof TransitionError) {
        return { error: "INVALID_AGREEMENT_STATUS", current: from };
      }
      throw e;
    }

    const { rows: updated } = await client.query(
      `UPDATE offers SET
         agreement_status = 'expired',
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [offerId]
    );

    await logTransition(client, {
      entityType: "AGREEMENT", from, to: "expired",
      entity_id: offerId,
      details: { agreement_ref: offer.agreement_ref }
    });

    await auditLog.writeAudit(client, {
      action: "deal.agreement_expired",
      entity_type: "offer",
      entity_id: offerId,
      details: { agreement_ref: offer.agreement_ref }
    });
    const syncedDemand = offer.demand_request_id
      ? await marketplaceService.syncDemandCommercialState(client, offer.demand_request_id)
      : null;
    const syncedCapacity = offer.capacity_post_id
      ? await capacityExchangeService.syncCapacityCommercialState(client, offer.capacity_post_id)
      : null;

    return { offer: updated[0], demand: syncedDemand, capacity: syncedCapacity };
  });
}

/* ── Hilfsfunktionen ──────────────────────────────── */

/**
 * Lädt den vollständigen Agreement-Stand eines Offers.
 */
export async function getAgreementDetails(pool, offerId) {
  const { rows } = await pool.query(
    `SELECT o.*, d.title AS demand_title, d.role AS demand_role,
            d.location_city AS demand_location, d.start_date AS demand_start,
            d.end_date AS demand_end, d.headcount AS demand_headcount,
            d.requester_company_id,
            du.company_name AS requester_company_name,
            su.company_name AS supplier_company_name,
            cp.title AS capacity_title,
            cp.role AS capacity_role,
            cp.location_city AS capacity_location,
            cp.headcount AS capacity_headcount,
            cp.status AS capacity_status,
            a.status AS assignment_status, a.start_date AS assignment_start,
            o.signature_required, o.signature_status, o.signed_at,
            o.signed_by_party_a, o.signed_by_party_b, o.signature_provider,
            o.signature_reference
     FROM offers o
     JOIN demand_requests d ON d.id = o.demand_request_id
     LEFT JOIN users du ON du.id = d.requester_company_id
     LEFT JOIN users su ON su.id = o.supplier_company_id
     LEFT JOIN capacity_posts cp ON cp.id = o.capacity_post_id
     LEFT JOIN assignments a ON a.id = o.assignment_id
     WHERE o.id = $1`,
    [offerId]
  );
  const offer = rows[0];
  if (!offer) return null;

  if (!offer.capacity_post_id) {
    const demandState = offer.demand_request_id
      ? await marketplaceService.getDemandCommercialState(pool, offer.demand_request_id)
      : null;
    return demandState
      ? {
          ...offer,
          demand_required_total_count: demandState.required_total_count,
          demand_currently_committed_count: demandState.committed_headcount,
          demand_remaining_open_count: demandState.remaining_open_count,
          demand_active_offer_count: demandState.active_offer_count,
          demand_is_capacity_origin: demandState.is_capacity_origin,
          demand_commercial_status: demandState.commercial_status,
          demand_commercial_visibility: demandState.commercial_visibility
        }
      : offer;
  }
  const demandState = offer.demand_request_id
    ? await marketplaceService.getDemandCommercialState(pool, offer.demand_request_id)
    : null;

  const capacityState = await capacityExchangeService.getCapacityCommercialState(pool, offer.capacity_post_id);
  return {
    ...offer,
    demand_required_total_count: demandState?.required_total_count ?? null,
    demand_currently_committed_count: demandState?.committed_headcount ?? null,
    demand_remaining_open_count: demandState?.remaining_open_count ?? null,
    demand_active_offer_count: demandState?.active_offer_count ?? null,
    demand_is_capacity_origin: demandState?.is_capacity_origin ?? false,
    demand_commercial_status: demandState?.commercial_status ?? null,
    demand_commercial_visibility: demandState?.commercial_visibility ?? null,
    capacity_committed_headcount: capacityState.committed_headcount,
    capacity_remaining_headcount: capacityState.remaining_headcount,
    capacity_assigned_headcount: capacityState.assigned_headcount,
    capacity_staffing_reserved_headcount: capacityState.staffing_reserved_headcount,
    capacity_active_offer_count: capacityState.active_offer_count,
    capacity_has_active_deal: capacityState.has_active_deal,
    capacity_is_partially_committed: capacityState.is_partially_committed,
    capacity_is_fully_committed: capacityState.is_fully_committed,
    capacity_commercial_status: capacityState.commercial_status,
    capacity_commercial_visibility: capacityState.commercial_visibility
  };
}

/**
 * Gibt den "Wer ist am Zug?"-Status zurück.
 */
export function getActionRequired(offer, viewerUserId) {
  if (!offer) return null;
  const isRequester = offer.requester_company_id === viewerUserId;
  const isSupplier = offer.supplier_company_id === viewerUserId;

  // Terminal-Status
  if (offer.status === "rejected" || offer.status === "withdrawn") return "closed";
  if (offer.agreement_status === "cancelled") return "cancelled";
  if (offer.agreement_status === "expired") return "expired";
  if (offer.agreement_status === "activated") return "completed";

  // Verhandlungsphase
  if (offer.status === "sent") return isRequester ? "action_required" : "waiting";
  if (offer.status === "countered") return isSupplier ? "action_required" : "waiting";

  // Agreement-Phase
  if (offer.agreement_status === "pending_confirmation") return isSupplier ? "action_required" : "waiting";
  if (offer.agreement_status === "confirmed") return isRequester ? "action_required" : "waiting";

  // Accepted, kein Agreement erzeugt: Requester muss Agreement erstellen
  if (offer.status === "accepted" && (!offer.agreement_status || offer.agreement_status === "none")) {
    return isRequester ? "action_required" : "waiting";
  }

  return "none";
}
