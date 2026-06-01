/**
 * Visibility Audit Service
 *
 * Validiert die VISIBILITY_MATRIX gegen bekannte Invarianten:
 *  - gating_strategy in GATING_STRATEGIES
 *  - feature_key in planFeatures.js (wenn gesetzt)
 *  - allowed_org_types Teilmenge von company/agency
 *
 * Liefert einen strukturierten Audit-Report mit severity-gestuften Findings.
 * Wird in visibilityMatrix.test.js geprueft (keine ERROR-Findings auf sauberer Matrix).
 */
import { VISIBILITY_MATRIX, GATING_STRATEGIES, listMatrixFeatureKeys } from "../config/visibilityMatrix.js";
import { planFeatures } from "../config/planFeatures.js";

const VALID_ORG_TYPES = new Set(["company", "agency"]);
const KNOWN_STRATEGIES = new Set(GATING_STRATEGIES);
const PLAN_GATED_STRATEGIES = new Set(["plan_gated", "plan_and_role"]);

/**
 * Prueft die VISIBILITY_MATRIX und gibt einen strukturierten Report zurueck.
 *
 * @returns {{ matrix: object[], findings: object[], summary: object }}
 */
export function buildAuditReport() {
  const knownFeatureKeys = new Set(Object.keys(planFeatures));
  const findings = [];

  for (const row of VISIBILITY_MATRIX) {
    const page = row.page || "(unknown)";

    // ERROR: Unbekannte gating_strategy
    if (!KNOWN_STRATEGIES.has(row.gating_strategy)) {
      findings.push({
        severity: "error",
        page,
        field: "gating_strategy",
        message: `Unbekannte gating_strategy: "${row.gating_strategy}". Erlaubt: ${GATING_STRATEGIES.join(", ")}`
      });
    }

    // ERROR: Unbekannter feature_key
    if (row.feature_key && !knownFeatureKeys.has(row.feature_key)) {
      findings.push({
        severity: "error",
        page,
        field: "feature_key",
        message: `Unbekannter feature_key: "${row.feature_key}" existiert nicht in planFeatures.js`
      });
    }

    // ERROR: Ungueltige allowed_org_types
    const orgTypes = Array.isArray(row.allowed_org_types) ? row.allowed_org_types : [];
    for (const ot of orgTypes) {
      if (!VALID_ORG_TYPES.has(ot)) {
        findings.push({
          severity: "error",
          page,
          field: "allowed_org_types",
          message: `Ungueltiger org_type: "${ot}". Erlaubt: company, agency`
        });
      }
    }

    // WARNING: plan_gated/plan_and_role ohne feature_key
    if (PLAN_GATED_STRATEGIES.has(row.gating_strategy) && !row.feature_key) {
      findings.push({
        severity: "warning",
        page,
        field: "feature_key",
        message: `gating_strategy="${row.gating_strategy}" ohne feature_key — Plan-Gate kann nicht ausgewertet werden`
      });
    }

    // WARNING: Pflichtfelder fehlen (boolean checks)
    for (const field of ["requires_pilot", "requires_individuell", "has_backend_guard", "has_upgrade_cta", "requires_staff_approval"]) {
      if (typeof row[field] !== "boolean") {
        findings.push({
          severity: "warning",
          page,
          field,
          message: `Pflichtfeld "${field}" fehlt oder ist kein boolean`
        });
      }
    }

    // INFO: Kein Backend-Guard
    if (row.has_backend_guard === false) {
      findings.push({
        severity: "info",
        page,
        field: "has_backend_guard",
        message: "Kein Backend-Guard — erwaegen Sie serverseitige Durchsetzung hinzuzufuegen"
      });
    }
  }

  const errors   = findings.filter(f => f.severity === "error").length;
  const warnings = findings.filter(f => f.severity === "warning").length;
  const infos    = findings.filter(f => f.severity === "info").length;

  return {
    matrix: VISIBILITY_MATRIX,
    findings,
    summary: {
      rows: VISIBILITY_MATRIX.length,
      errors,
      warnings,
      infos,
      matrix_features: listMatrixFeatureKeys().length
    }
  };
}
