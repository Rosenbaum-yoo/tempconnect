/**
 * Notification → Hub-Surface mapping (single source of truth).
 *
 * Maps a notification.type (see notificationMatrix.js + migrations 019/071/072)
 * to an enterprise.html hub-card `data-surface` key, so per-user unread counts
 * can be rendered as small badges directly on the Enterprise Hub cards
 * (count + click-through to the card target).
 *
 * Types without a dedicated hub card (general/system, worker-only types) map to
 * null → they stay visible ONLY in the notification bell/dropdown, never as a
 * card badge. The bell remains the catch-all; cards carry the routable subset.
 *
 * Future-proof: adding a new event in notificationMatrix.js only needs ONE line
 * here to light up its hub card. Unknown/unmapped types degrade gracefully.
 */

// Explicit type → surface map. Exact-match, order-independent.
const SURFACE_BY_TYPE = {
  // Arbeitsplatzangebote / Requisitions
  requisition_approval: "requisitions",
  requisition_filled: "requisitions",
  requisition_cancelled: "requisitions",

  // Meine Deals — Angebote (offers) UND Deal-Lifecycle laufen unter der Deals-Card
  offer_received: "deals",
  offer_accepted: "deals",
  offer_rejected: "deals",
  offer_counter_received: "deals",
  offer_withdrawn: "deals",
  deal_offer_sent: "deals",
  deal_accepted: "deals",
  deal_confirmed: "deals",
  deal_assignment_started: "deals",
  deal_staffing_ready: "deals",
  deal_completed: "deals",
  deal_cancelled: "deals",

  // Marktplatz — Kapazitaetsboerse + Demand-Matching + Notdienst
  capacity_interest: "marketplace",
  capacity_expiring: "marketplace",
  capacity_match: "marketplace",
  capacity_stale: "marketplace",
  demand_match: "marketplace",
  emergency_request: "marketplace",
  emergency_escalation: "marketplace",

  // Lieferantensteuerung / Vendor Pool
  vendor_pool_change: "vendor_pool",
  vendor_pool_blocked: "vendor_pool",

  // Trust Center / Compliance
  compliance_expiring: "trust_center",
  compliance_expired: "trust_center",
  compliance_verified: "trust_center",

  // Mein Unternehmen / SLA-Profil
  sla_warning: "my_company",
  sla_breached: "my_company",

  // Einsaetze & Zeiten — Stundenzettel speisen laufende Einsaetze
  timesheet_submitted: "assignments",
  timesheet_approved: "assignments",
  timesheet_rejected: "assignments",
  timesheet_signed: "assignments",

  // Selbstmeldungen des Menschen (Welle G4) — dieselbe Karte wie die
  // Stundenzettel, und zwar aus einem inhaltlichen Grund: eine Abwesenheit
  // trifft EINSAETZE. Der Weg dorthin fuehrt ueber "Einsaetze & Zeiten"
  // (worker-submissions-review.html) zur Live-Belegschaft in mitarbeiter.html.
  // Ohne diese zwei Zeilen bliebe die dringendste Meldung der Plattform
  // glockenintern, waehrend die Hub-Karte unauffaellig bleibt.
  worker_absence_reported: "assignments",
  worker_delay_reported: "assignments",

  // Kundenseite derselben Sache (Welle G4b). Dieselbe Karte, und das ist
  // richtig: Fuer den Kunden ist der Ausfall einer gebuchten Kraft ein
  // Ereignis an seinem EINSATZ, nicht an einer fremden Personalakte.
  assignment_worker_unavailable: "assignments",
  assignment_worker_replaced: "assignments",

  // Gamification / Meilensteine → Bounties-Card
  milestone: "bounties",

  // Bounty-Anstupser (P9 Welle A5) — dieselbe Hub-Karte wie die Meilensteine.
  bounty_near: "bounties",
  bounty_earned: "bounties",
  bounty_lost: "bounties"
  // general, system und worker-only Typen → null (kein Hub-Card-Badge)
};

/**
 * Resolve the hub-card surface for a notification type.
 * @param {string|null|undefined} type
 * @returns {string|null} surface key or null when bell-only/unknown.
 */
export function surfaceForType(type) {
  if (!type) return null;
  return SURFACE_BY_TYPE[type] || null;
}

/**
 * Fold rows of `{ type, n }` (unread counts grouped by type) into a per-surface
 * summary for hub-card badges.
 *
 * `total` sums over ALL rows (incl. unmapped types) so it stays consistent with
 * the notification bell's global unread-count. `surfaces` contains only mapped,
 * positive-count keys.
 *
 * @param {Array<{type:string,n:number|string}>} rows
 * @returns {{ surfaces: Record<string,number>, total: number }}
 */
export function summarizeBySurface(rows) {
  const surfaces = {};
  let total = 0;
  for (const row of rows || []) {
    const n = Number(row && row.n) || 0;
    if (n > 0) total += n;
    const surface = surfaceForType(row && row.type);
    if (!surface || n <= 0) continue;
    surfaces[surface] = (surfaces[surface] || 0) + n;
  }
  return { surfaces, total };
}

/** Distinct hub-card surface keys that can receive a badge (introspection/tests). */
export const SURFACE_KEYS = Array.from(new Set(Object.values(SURFACE_BY_TYPE)));
