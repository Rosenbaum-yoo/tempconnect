/**
 * Deal Progress Helper — computes next_action, progress percentage,
 * and deal timeline for transparent deal flow visibility.
 */

import { logger } from "../config/index.js";

/* ── Status → Progress mapping ──────────────────── */

const STATUS_PROGRESS = {
  CREATED:            { pct: 10,  label: 'Erstellt' },
  SENT:               { pct: 15,  label: 'Gesendet' },
  OFFER_SENT:         { pct: 25,  label: 'Angebot gesendet' },
  ACCEPTED:           { pct: 50,  label: 'Angenommen' },
  CONFIRMED:          { pct: 65,  label: 'Bestaetigt' },
  FILLED:             { pct: 75,  label: 'Besetzt' },
  ASSIGNMENT_STARTED: { pct: 85,  label: 'Einsatz gestartet' },
  FINALIZED:          { pct: 100, label: 'Abgeschlossen' },
  COMPLETED:          { pct: 100, label: 'Abgeschlossen' },
  DECLINED:           { pct: 0,   label: 'Abgelehnt' },
  CANCELED:           { pct: 0,   label: 'Storniert' }
};

/* ── Agreement-Status → Progress (fuer Offer-basierte Deals) ── */

const AGREEMENT_STATUS_PROGRESS = {
  none:                  { pct: 50,  label: 'Angebot angenommen' },
  pending_confirmation:  { pct: 60,  label: 'Vereinbarung erstellt \u2013 Bestaetigung ausstehend' },
  confirmed:             { pct: 75,  label: 'Vereinbarung bestaetigt \u2013 Aktivierung moeglich' },
  activated:             { pct: 100, label: 'Einsatz aktiviert' },
  cancelled:             { pct: 0,   label: 'Vereinbarung storniert' },
  expired:               { pct: 0,   label: 'Vereinbarung abgelaufen' }
};

/* ── Next Action mapping ─────────────────────────────── */

const NEXT_ACTION_MAP = {
  CREATED:            { actor: 'requester', action: 'send_offer',       label: 'Angebot an Anbieter senden' },
  SENT:               { actor: 'receiver',  action: 'respond',          label: 'Auf Anfrage antworten' },
  OFFER_SENT:         { actor: 'requester', action: 'review_offer',     label: 'Angebot pruefen und annehmen/ablehnen' },
  ACCEPTED:           { actor: 'requester', action: 'confirm_deal',     label: 'Deal bestaetigen' },
  CONFIRMED:          { actor: 'receiver',  action: 'start_assignment', label: 'Einsatz starten / Worker zuweisen' },
  FILLED:             { actor: 'requester', action: 'finalize',         label: 'Deal finalisieren' },
  ASSIGNMENT_STARTED: { actor: 'both',      action: 'complete',         label: 'Einsatz abschliessen' },
  FINALIZED:          null,
  COMPLETED:          null,
  DECLINED:           null,
  CANCELED:           null
};

/**
 * Get the next required action for a deal status.
 * @param {string} status - current deal status
 * @returns {{ actor: string, action: string, label: string } | null}
 */
export function getNextAction(status) {
  return NEXT_ACTION_MAP[status] || null;
}

/**
 * Get full deal progress including status, percentage, next action, and timeline.
 * @param {import('pg').Pool} pool
 * @param {string} requestId
 * @returns {Promise<Object|null>}
 */
export async function getDealProgress(pool, requestId) {
  // Load request
  const { rows } = await pool.query(
    `SELECT id, status, requester_id, receiver_id, created_at, updated_at
     FROM requests WHERE id = $1`,
    [requestId]
  );
  if (!rows.length) return null;
  const req = rows[0];

  const progress = STATUS_PROGRESS[req.status] || { pct: 0, label: req.status };
  const nextAction = getNextAction(req.status);

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * Z3 (2026-09-27): DIE ZEITLEISTE KOMMT AUS DEM AUDIT-LOG
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Hier stand eine Abfrage auf `state_transitions` — und sie war ZWEIFACH
   * falsch:
   *
   *   1. Die Tabelle existiert nicht. Keine Migration legt sie an.
   *   2. Sie filterte `entity_type = 'DEAL'`. Selbst mit Tabelle waere das ins
   *      Leere gegangen: `stateMachine.logTransition` bildet `DEAL` und
   *      `REQUEST` beide auf `'request'` ab (ENTITY_TYPE_MAP). Kein Schreiber
   *      hat je `'DEAL'` hinterlassen.
   *
   * Und der Fehler war STUMM: der Wurf lief in ein catch mit `logger.debug`,
   * `timeline` blieb `[]`. Die Oberflaeche zeigte damit eine plausible, leere
   * Zeitleiste — die gefaehrlichste Variante, weil nichts danach aussieht wie
   * ein Fehler. Ein Deal, der dreimal die Hand gewechselt hat, sah aus wie
   * einer, bei dem nie etwas passiert ist.
   *
   * DIE WAHRHEIT LAG DIE GANZE ZEIT DA. `audit_log` fuehrt jeden Wechsel mit
   * genau den vier Feldern, die diese Zeitleiste braucht: `details->>'from'`,
   * `details->>'to'`, `actor_id`, `created_at`. Gemessen am 2026-09-27 in der
   * laufenden Datenbank. `dealDossierService` liest seine Zeitleiste bereits so
   * — hier wird kein Muster erfunden, sondern das bestehende benutzt.
   *
   * WARUM `DISTINCT ON`: jeder Wechsel steht ZWEIMAL im Log. `stateMachine`
   * schreibt `state_machine.transition`, und `routes/requests.js` schreibt
   * zusaetzlich `request.status_change` (gemessen: 4 und 4 Zeilen fuer dieselben
   * vier Wechsel). Ohne die Entdopplung haette jede Station der Zeitleiste
   * doppelt gestanden — aus einem behobenen Fehler waere ein neuer geworden.
   * Die Sortierung innerhalb der Gruppe entscheidet, WELCHE Zeile bleibt: die
   * des kanonischen Schreibers (`state_machine.transition`), bei Gleichstand die
   * frueheste — der Zeitpunkt, an dem der Wechsel wirklich geschah.
   *
   * UND ER IST NICHT MEHR STUMM: schlaegt die Abfrage fehl, sagt die Antwort
   * das (`timeline_available: false`) und der Fehler steht als `error` im Log,
   * nicht als `debug`. "Konnte nicht geladen werden" ist eine andere Auskunft
   * als "es ist nichts passiert", und die Oberflaeche darf sie unterscheiden.
   */
  let timeline = [];
  let timelineAvailable = true;
  try {
    const { rows: transitions } = await pool.query(
      `SELECT from_status, to_status, actor_id, created_at
         FROM (
           SELECT DISTINCT ON (details->>'from', details->>'to')
                  details->>'from' AS from_status,
                  details->>'to'   AS to_status,
                  actor_id,
                  created_at
             FROM audit_log
            WHERE entity_type = 'request'
              AND entity_id = $1
              AND action IN ('state_machine.transition', 'request.status_change')
              AND details->>'to' IS NOT NULL
            ORDER BY details->>'from', details->>'to',
                     (action = 'state_machine.transition') DESC,
                     created_at ASC
         ) je_wechsel
        ORDER BY created_at ASC`,
      [requestId]
    );
    timeline = transitions.map(t => ({
      from: t.from_status,
      to: t.to_status,
      actor_id: t.actor_id,
      at: t.created_at,
      label: STATUS_PROGRESS[t.to_status]?.label || t.to_status
    }));
  } catch (e) {
    timelineAvailable = false;
    logger.error({ err: e?.message, request_id: requestId },
      'Deal-Zeitleiste konnte nicht geladen werden');
  }

  return {
    request_id: req.id,
    status: req.status,
    status_label: progress.label,
    progress_pct: progress.pct,
    next_action: nextAction,
    requester_id: req.requester_id,
    receiver_id: req.receiver_id,
    created_at: req.created_at,
    updated_at: req.updated_at,
    timeline,
    /* Z3: leer und nicht ladbar sind zwei verschiedene Auskuenfte. */
    timeline_available: timelineAvailable
  };
}

/**
 * Berechnet Deal-Progress fuer einen Offer-basierten Abschluss (Agreement-Flow).
 * Kombiniert Offer-Status + Agreement-Status zu einem einheitlichen Fortschritt.
 * @param {Object} offer - Offer-Objekt mit status, agreement_status etc.
 * @returns {{ status_label: string, progress_pct: number, phase: string }}
 */
export function getOfferDealProgress(offer) {
  if (!offer) return { label: '\u2014', pct: 0, phase: 'unknown' };

  // Terminal: Agreement-Status hat Vorrang wenn vorhanden
  const agr = offer.agreement_status;
  if (agr && agr !== 'none' && AGREEMENT_STATUS_PROGRESS[agr]) {
    return {
      ...AGREEMENT_STATUS_PROGRESS[agr],
      phase: 'agreement'
    };
  }

  // Offer-Phase
  const offerPhase = {
    draft:     { pct: 5,   label: 'Entwurf', phase: 'negotiation' },
    sent:      { pct: 20,  label: 'Angebot gesendet', phase: 'negotiation' },
    countered: { pct: 30,  label: 'Gegenangebot', phase: 'negotiation' },
    accepted:  { pct: 50,  label: 'Angenommen', phase: 'negotiation' },
    rejected:  { pct: 0,   label: 'Abgelehnt', phase: 'terminal' },
    withdrawn: { pct: 0,   label: 'Zurueckgezogen', phase: 'terminal' }
  };
  const p = offerPhase[offer.status] || { pct: 0, label: offer.status, phase: 'unknown' };
  return { ...p };
}
