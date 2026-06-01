/**
 * Central policy for interaction endpoints (capacity + demand).
 * Keeps role/status/self-checks consistent across routes.
 *
 * GEGENSEITENLOGIK (strikt):
 * - Supply (Kapazitaetsangebot von Zeitarbeitsfirma): NUR Unternehmen duerfen reagieren
 * - Demand (Bedarf von Unternehmen): NUR Zeitarbeitsfirmen duerfen reagieren
 * - Gleiche Marktseite darf NICHT reagieren (Standard)
 * - Inter-Agency nur bei expliziter Freigabe
 */

/**
 * Prueft ob ein Nutzer auf ein Kapazitaetsangebot (Supply) reagieren darf.
 * Supply = Zeitarbeitsfirma bietet Personal an → nur Unternehmen duerfen reagieren.
 *
 * @param {Object} params
 * @param {string} params.viewerRole - 'agency'|'company'|'worker'|'admin'
 * @param {string} params.viewerUserId
 * @param {string} params.supplierUserId - Eigentuemer des Supply-Eintrags
 * @param {string} params.supplierRole - Rolle des Eigentuemers ('agency'|'company')
 * @param {string} params.entryStatus
 * @param {boolean} [params.interAgencyEnabled=false] - Inter-Agency Sonderlogik aktiv?
 */
export function canInteractWithCapacity({ viewerRole, viewerUserId, supplierUserId, supplierRole, entryStatus, interAgencyEnabled = false }) {
  if (!viewerUserId) return { allowed: false, code: "NOT_AUTHENTICATED", status: 401 };
  if (entryStatus !== "active") return { allowed: false, code: "ENTRY_NOT_INTERACTABLE", status: 409 };
  if (supplierUserId && viewerUserId === supplierUserId) return { allowed: false, code: "SELF_INTERACTION_FORBIDDEN", status: 403 };
  if (viewerRole === "worker" || viewerRole === "admin") {
    return { allowed: false, code: "ACTION_NOT_ALLOWED_ROLE", status: 403 };
  }

  // Gegenseitenlogik: Supply von Agency → nur Company darf reagieren
  const ownerSide = supplierRole || "agency";
  if (ownerSide === "agency" && viewerRole === "agency") {
    // Gleiche Marktseite: Agency auf Agency-Supply
    if (!interAgencyEnabled) {
      return { allowed: false, code: "ACTION_NOT_ALLOWED_SAME_SIDE", status: 403 };
    }
    // Inter-Agency explizit erlaubt
  }
  if (ownerSide === "company" && viewerRole === "company") {
    // Company auf Company-Supply: nie erlaubt
    return { allowed: false, code: "ACTION_NOT_ALLOWED_SAME_SIDE", status: 403 };
  }

  // Hauptregel: nur company darf auf agency-supply reagieren
  if (ownerSide === "agency" && viewerRole !== "company" && viewerRole !== "agency") {
    return { allowed: false, code: "COMPANY_CAN_ONLY_INTERACT_WITH_AGENCY_SUPPLY", status: 403 };
  }

  return { allowed: true };
}

/**
 * Prueft ob ein Nutzer auf einen Bedarf (Demand) reagieren darf.
 * Demand = Unternehmen sucht Personal → nur Zeitarbeitsfirmen duerfen reagieren.
 *
 * @param {Object} params
 * @param {string} params.viewerRole
 * @param {string} params.viewerUserId
 * @param {string} params.requesterUserId - Eigentuemer des Demand-Eintrags
 * @param {string} params.demandStatus
 */
export function canInteractWithDemand({ viewerRole, viewerUserId, requesterUserId, demandStatus }) {
  if (!viewerUserId) return { allowed: false, code: "NOT_AUTHENTICATED", status: 401 };
  if (!["open", "partially_covered"].includes(demandStatus)) {
    return { allowed: false, code: "DEMAND_NOT_INTERACTABLE", status: 409 };
  }
  if (requesterUserId && viewerUserId === requesterUserId) return { allowed: false, code: "SELF_INTERACTION_FORBIDDEN", status: 403 };

  // Gegenseitenlogik: Demand von Company → nur Agency darf reagieren
  if (viewerRole !== "agency") {
    return { allowed: false, code: "AGENCY_CAN_ONLY_INTERACT_WITH_COMPANY_DEMAND", status: 403 };
  }
  return { allowed: true };
}
