/**
 * Feature-Flag-Register — eine getippte Quelle fuer alle plattformweiten Boolean-Flags (Ebene B).
 *
 * Drei-Ebenen-Config-Modell (Owner-Freigabe 2026-06-01):
 *   A) Provider-Abstraktion  → which backend? (billing/email/infra-Provider-Services)
 *   B) Plattform-Kill-Switch  → darf die Faehigkeit ueberhaupt laufen? (DIESE Datei)
 *   C) Pro-Kunde-Entitlement  → darf DIESER Kunde? (planFeatures/entitlementService, DB/runtime)
 *
 * Env-Flags sind deploy-zeit + plattformweit. Pro-Kunde-Schalter gehoeren NICHT hierher,
 * sondern in die Entitlement-Schicht (kein Redeploy noetig — skaliert bis 300 Kunden).
 */
import { z } from "zod";

const FLAG_VALUE = z.enum(["true", "false"]);

/**
 * Produktions-Constraints:
 *   "forbidden_when_true" — Wert "true" laesst den Boot in NODE_ENV=production hart scheitern.
 */
export const FEATURE_FLAGS = Object.freeze({
  FEATURE_GATE_BYPASS: {
    default: "false",
    description: "Umgeht alle Plan-Feature-Gates/Beschraenkungen — nur fuer lokale Entwicklung.",
    productionConstraint: "forbidden_when_true"
  },
  SUPPORT_OPS_ENABLED: {
    default: "true",
    description: "Aktiviert die Support-Ops-Oberflaeche und -Routen.",
    productionConstraint: null
  },
  WARP_SSH_ENABLED: {
    default: "false",
    description: "Erlaubt Warp-SSH-Remote-Ausfuehrung (Infrastruktur-Ops).",
    productionConstraint: null
  },
  INFRA_SNAPSHOT_INGEST_ENABLED: {
    default: "true",
    description: "Erlaubt das Ingest von Infrastruktur-Snapshots.",
    productionConstraint: null
  }
});

/**
 * Zod-Felder fuer alle Flags — in das envSchema-Objekt spreaden.
 * Flag mit default → .default(...), sonst .optional() (verhaltenswahrend).
 */
export function featureFlagFields() {
  const fields = {};
  for (const [key, def] of Object.entries(FEATURE_FLAGS)) {
    fields[key] = def.default === null ? FLAG_VALUE.optional() : FLAG_VALUE.default(def.default);
  }
  return fields;
}

/**
 * Produktions-Safety: harte Fehler fuer verbotene Flag-Werte. In superRefine aufrufen.
 * Self-guard auf NODE_ENV=production (ausserhalb Produktion ein No-op).
 */
export function applyProductionFlagConstraints(data, ctx) {
  if (data.NODE_ENV !== "production") return;
  for (const [key, def] of Object.entries(FEATURE_FLAGS)) {
    if (def.productionConstraint === "forbidden_when_true" && data[key] === "true") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key}=true ist in Produktion verboten. ${def.description} Auf false setzen oder Variable entfernen.`,
        path: [key]
      });
    }
  }
}

/** Kanonischer Runtime-Read: leer/ungesetzt → registrierter Default. */
export function isFeatureFlagEnabled(env, key) {
  const def = FEATURE_FLAGS[key];
  const raw = env?.[key];
  const value = raw === undefined || raw === "" ? (def ? def.default : null) : raw;
  return value === "true";
}

/** Introspektion (z. B. fuer System-Health / OCC) — ohne Secret-Leak. */
export function listFeatureFlags(env = {}) {
  return Object.entries(FEATURE_FLAGS).map(([key, def]) => ({
    key,
    enabled: isFeatureFlagEnabled(env, key),
    default: def.default,
    description: def.description,
    productionConstraint: def.productionConstraint
  }));
}
