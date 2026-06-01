/**
 * Pricing Tier Service — Unternehmensgrößen-Staffelung für Individualtarife.
 *
 * VERBINDLICHE SCHWELLEN (V2, ab Migration 102):
 *   S:           1–50    Beschäftigte
 *   M:          51–150   Beschäftigte
 *   L:         151–350   Beschäftigte
 *   ENTERPRISE: 351+     Beschäftigte (oder Sonderbedarf)
 *
 * Diese Schwellen sind die Wahrheit für Pricing, Tarif-Konfigurator,
 * `INDIVIDUAL_TIER_CATALOG` (planCatalog.js) und für
 * `organizations.individual_tier_auto`.
 *
 * BACKWARD-COMPAT (Klassen I/II/III/IV):
 *   Die alten Klassen aus Migration 074/085 (1–30, 31–250, 251–999, 1000+)
 *   werden NICHT entfernt, weil bestehende `organizations.company_size_class`-
 *   Werte und Reports die alten Codes referenzieren. Wir bilden sie über
 *   `classifyCompanySize()` weiterhin ab und liefern zusätzlich
 *   `classifyCompanySizeV2()` für das neue Modell.
 *
 * Grenzen sind überschneidungsfrei und eindeutig validierbar.
 * Die Basispreise sind Richtwerte — Overrides über individual_contract_note
 * und billing_mode = 'individual_contract' sind ausdrücklich vorgesehen.
 */

/* ── Size Tiers V1 (überschneidungsfrei, Backward-Compat) ──────── */

export const SIZE_TIERS = [
  { class: "I",   label: "Klasse I — Klein",               min: 1,    max: 30,       description: "1 bis 30 Beschäftigte" },
  { class: "II",  label: "Klasse II — Mittelstand",         min: 31,   max: 250,      description: "31 bis 250 Beschäftigte" },
  { class: "III", label: "Klasse III — Großunternehmen",    min: 251,  max: 999,      description: "251 bis 999 Beschäftigte" },
  { class: "IV",  label: "Klasse IV — Enterprise-Konzern",  min: 1000, max: Infinity, description: "ab 1.000 Beschäftigte" }
];

/* ── Size Tiers V2 (NEU, kanonisch ab Welle 8/Migration 102) ───── */

/**
 * Tier-Schwellen V2: kanonisch für Pricing/Tarif-Konfigurator und
 * `organizations.individual_tier_auto`.
 */
export const SIZE_TIERS_V2 = [
  { tier: "individuell_s",          short: "S",          label: "Individuell S",          min: 1,   max: 50,       description: "bis 50 Beschäftigte"        },
  { tier: "individuell_m",          short: "M",          label: "Individuell M",          min: 51,  max: 150,      description: "51 bis 150 Beschäftigte"    },
  { tier: "individuell_l",          short: "L",          label: "Individuell L",          min: 151, max: 350,      description: "151 bis 350 Beschäftigte"   },
  { tier: "individuell_enterprise", short: "Enterprise", label: "Individuell Enterprise", min: 351, max: Infinity, description: "ab 351 Beschäftigten oder Sonderbedarf" }
];

/**
 * V1 -> V2 Mapping (für Backward-Compat-Reports).
 * Achtung: NICHT 1:1, weil sich die Schwellen verschoben haben. Die Tabelle
 * spiegelt die fachlich PASSENDSTE Zuordnung der alten Klasse zur neuen Tier-Achse.
 *   I  (1–30)    -> S
 *   II (31–250)  -> M (251–250 hätten in V2 L getroffen, aber 31–150 ist M)
 *   III(251–999) -> L (überlappt mit Enterprise-Bereich; konservativ L)
 *   IV (1000+)   -> Enterprise
 * Diese Map dient nur der OBERFLÄCHEN-Anzeige; für echte Klassifizierung immer
 * `classifyCompanySizeV2(employeeCount)` benutzen.
 */
export const SIZE_CLASS_V1_TO_V2 = Object.freeze({
  I:   "individuell_s",
  II:  "individuell_m",
  III: "individuell_l",
  IV:  "individuell_enterprise"
});

/* ── Base Pricing (Richtwerte EUR/Monat, netto) ────────────────── */

export const BASE_PRICING = {
  I:   { base_monthly: 299,  max_monthly: 499,   notes: "Bis 30 MA – Einstiegstarif, Self-Service-Schwerpunkt" },
  II:  { base_monthly: 799,  max_monthly: 1499,  notes: "31–250 MA – Managed Onboarding, Standard-SLA" },
  III: { base_monthly: 1999, max_monthly: 3999,   notes: "251–999 MA – Dedicated Success Manager, erweitertes SLA" },
  IV:  { base_monthly: null, max_monthly: null,   notes: "Enterprise – individuelle Verhandlung, Volumenrabatte, SLA-Garantie" }
};

/**
 * Determines the company size class from an employee count.
 * Returns null for invalid input (undefined, 0, negative).
 *
 * @param {number|null|undefined} employeeCount
 * @returns {{ class: string, label: string, min: number, max: number, description: string } | null}
 */
export function classifyCompanySize(employeeCount) {
  const count = parseInt(employeeCount, 10);
  if (!count || count < 1 || isNaN(count)) return null;

  for (const tier of SIZE_TIERS) {
    if (count >= tier.min && count <= tier.max) return tier;
  }
  return null; // should not happen since IV is unbounded
}

/**
 * Returns base pricing for a given size class.
 * @param {string} sizeClass - "I", "II", "III", "IV"
 * @returns {{ base_monthly: number|null, max_monthly: number|null, notes: string } | null}
 */
export function getBasePricing(sizeClass) {
  return BASE_PRICING[sizeClass] || null;
}

/**
 * Convenience: classify + price in one call.
 * @param {number} employeeCount
 * @returns {{ size_class: string, tier: object, pricing: object } | null}
 */
export function getIndividualPricingInfo(employeeCount) {
  const tier = classifyCompanySize(employeeCount);
  if (!tier) return null;
  const pricing = getBasePricing(tier.class);
  return { size_class: tier.class, tier, pricing };
}

/**
 * Persists the company size classification on an organization.
 * Setzt sowohl `company_size_class` (V1) als auch `individual_tier_auto` (V2),
 * damit die alten und neuen Reports konsistent bleiben.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {number} employeeCount
 * @returns {Promise<{ org_id: string, size_class: string, individual_tier_auto: string, employee_count: number }>}
 */
export async function setOrganizationSizeClass(pool, orgId, employeeCount) {
  const tier = classifyCompanySize(employeeCount);
  if (!tier) throw new Error("INVALID_EMPLOYEE_COUNT");
  const tierV2 = classifyCompanySizeV2(employeeCount);

  await pool.query(
    `UPDATE organizations
     SET company_size_class = $1,
         individual_tier_auto = $2,
         employee_count_approx = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [tier.class, tierV2 ? tierV2.tier : null, employeeCount, orgId]
  );
  return {
    org_id: orgId,
    size_class: tier.class,
    individual_tier_auto: tierV2 ? tierV2.tier : null,
    employee_count: employeeCount
  };
}

/**
 * V2-Klassifikation (50/150/350-Schwellen). Liefert das passende
 * SIZE_TIERS_V2-Eintrag oder null bei ungültiger Eingabe.
 *
 * @param {number|null|undefined} employeeCount
 * @returns {{ tier: string, short: string, label: string, min: number, max: number, description: string } | null}
 */
export function classifyCompanySizeV2(employeeCount) {
  const count = parseInt(employeeCount, 10);
  if (!count || count < 1 || isNaN(count)) return null;
  for (const t of SIZE_TIERS_V2) {
    if (count >= t.min && count <= t.max) return t;
  }
  return null;
}

/**
 * Liefert die V2-Tier-Achse zu einer alten V1-Klasse (I/II/III/IV).
 * Nur für Backward-Compat-Anzeigen einsetzen — niemals für echte
 * Klassifizierung neuer Daten.
 * @param {string} sizeClassV1
 * @returns {string|null}
 */
export function v1ClassToV2Tier(sizeClassV1) {
  return SIZE_CLASS_V1_TO_V2[sizeClassV1] || null;
}
