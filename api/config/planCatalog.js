/**
 * planCatalog.js — Single Source of Truth fuer Tarife, Groessenklassen,
 * Features und Add-ons.
 *
 * Diese Datei ist die zentrale fachliche Wahrheit fuer:
 *   - oeffentliche Pricing-Seite (`/public/pricing.html`)
 *   - Abo-Verwaltung (`/public/sla_abo.html`)
 *   - Enterprise-Anfrage-Konfigurator (`/public/enterprise_anfrage.html`)
 *   - Staff Control Center (Eingangs-Listen + Detail)
 *
 * Doppelte Pflege ist unzulaessig. Wer Preis/Feature/Addon aendert, aendert
 * NUR diese Datei und (falls noetig) die `subscriptions_plan_check`-Migration.
 *
 * Verhaeltnis zu bestehenden Strukturen:
 *   - `api/config/planFeatures.js` bleibt der Runtime-Feature-Gate (`hasFeature`,
 *     `MATURITY_GATES`). Diese Datei IMPORTIERT von dort und dupliziert NICHTS.
 *   - `api/services/userService.js` `PLAN_LIMITS` bleibt die Limit-Quelle pro
 *     Plan; Preise werden hier ueber `getPlanPriceCentsByKey()` gespiegelt,
 *     damit `payment.js` weiterhin direkt auf PLAN_LIMITS zugreifen kann.
 *   - `api/services/pricingTierService.js` (Klassen I/II/III/IV mit Schwellen
 *     30/250/999) bleibt vorerst aus Backward-Compat erhalten. Die HIER neu
 *     eingefuehrten S/M/L/Enterprise-Schwellen 50/150/350 sind die KUENFTIGE
 *     Anzeige- und Tarif-Klassifikation. Migration der Org-Klassifizierung
 *     auf die neuen Schwellen erfolgt in einer separaten Welle mit Backfill.
 */

import { PLAN, INDIVIDUAL_TIERS, planFeatures, MATURITY_GATES, getIndividualTierByEmployeeCount } from "./planFeatures.js";

/* ── Versionierung ───────────────────────────────────────────────
 * Beim Aendern von Preisen/Features/Addons hochzaehlen. Frontend kann
 * diesen Wert als ETag/Cache-Buster nutzen.
 *
 * DB-Verlauf liegt in `catalog_versions` (Migration 102). Wer den Katalog
 * aendert, sollte zusaetzlich einen neuen DB-Eintrag ueber
 * `catalogVersionService.recordCatalogVersion()` schreiben — nur dann
 * ist der Verlauf vollstaendig (Zeit, Aktor, Snapshot, Changelog).
 * ───────────────────────────────────────────────────────────────── */
export const CATALOG_VERSION = "2026.04.27.1";
export const CATALOG_CURRENCY = "EUR";

/* ── Kanonische Plan-Wahrheit ────────────────────────────────────
 * Diese 5 Keys sind verbindlich — alle anderen Schreibweisen sind
 * Bestandsdaten-Aliase und werden ueber `normalizePlanKey()` gemappt.
 *
 * In SQL (Migration 102) steht der korrespondierende CHECK auf
 * `subscriptions.plan` / `organizations.plan` / `invoices.plan` /
 * `payment_sessions.plan`. Wer hier etwas aendert, MUSS dort eine
 * neue Migration mit dem aktualisierten CHECK schreiben.
 * ───────────────────────────────────────────────────────────────── */
export const CANONICAL_PLAN_KEYS = Object.freeze([
  "DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"
]);

const PLAN_ALIASES = Object.freeze({
  "":           "DEMO",
  FREE:         "DEMO",
  TRIAL:        "DEMO",
  STARTER:      "BASIS",        // Migration 002 Legacy
  NOTDIENST:    "PLUS",         // Notdienst war frueher eigener Plan, ist heute Feature
  ENTERPRISE:   "INDIVIDUELL",
  INDIVIDUAL:   "INDIVIDUELL",
  PROFESSIONAL: "PRO"           // Defensiver Alias — wurde nie oeffentlich verwendet, aber
                                // koennte in alten DB-Eintraegen vorkommen
});

/**
 * Bringt eine beliebige Plan-Schreibweise auf die kanonische Form.
 * @param {unknown} value
 * @param {{ fallback?: string|null }} [opts] Fallback (Default: 'DEMO').
 *        `null` setzt explizit keinen Fallback (gibt null zurueck).
 * @returns {string|null}
 */
export function normalizePlanKey(value, opts = {}) {
  const fallback = Object.prototype.hasOwnProperty.call(opts, "fallback")
    ? opts.fallback
    : "DEMO";
  if (value === null || value === undefined) return fallback;
  let p = String(value).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(PLAN_ALIASES, p)) p = PLAN_ALIASES[p];
  if (CANONICAL_PLAN_KEYS.includes(p)) return p;
  return fallback;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isCanonicalPlanKey(value) {
  return CANONICAL_PLAN_KEYS.includes(String(value || "").toUpperCase());
}

/* ── Jahrespreise (Status) ───────────────────────────────────────
 * `annual_price_cents` ist heute fachlich NICHT produktiv genutzt.
 * Das `annual_price_status` macht das in der Antwort sichtbar:
 *   - 'not_offered'  : kein Jahrespreis vorgesehen
 *   - 'preview'      : Preis ist hinterlegt, aber NICHT offiziell verkauft
 *   - 'active'       : Preis wird im Checkout verwendet
 * Frontend darf nur dann eine Rabatt-/Spar-Anzeige rendern, wenn
 * `annual_price_status === 'active'` UND `annual_price_cents > 0`.
 * ───────────────────────────────────────────────────────────────── */
const ANNUAL_STATUS_DEFAULT = "not_offered";

/* ── Tarifgroessen S/M/L/Enterprise (NEUE Schwellen 50/150/350) ──
 * Schluesselwerte sind kompatibel mit `INDIVIDUAL_TIERS` aus
 * planFeatures.js und mit dem CHECK-Constraint
 * `organizations.individual_tier_auto` aus Migration 080.
 * ───────────────────────────────────────────────────────────────── */
export const INDIVIDUAL_TIER_CATALOG = [
  {
    key: INDIVIDUAL_TIERS.S,
    label: "Individuell S",
    short_label: "S",
    description: "Einstiegsklasse fuer kleine Teams (bis 50 Beschaeftigte).",
    min_employees: 1,
    max_employees: 50,
    badge: null,
    sort_order: 10,
    is_open_ended: false,
    is_enterprise: false
  },
  {
    key: INDIVIDUAL_TIERS.M,
    label: "Individuell M",
    short_label: "M",
    description: "Mittelstand mit Standortanbindung und Multi-User-Setup (bis 150).",
    min_employees: 51,
    max_employees: 150,
    badge: null,
    sort_order: 20,
    is_open_ended: false,
    is_enterprise: false
  },
  {
    key: INDIVIDUAL_TIERS.L,
    label: "Individuell L",
    short_label: "L",
    description: "Groesseres Unternehmen mit mehreren Lieferanten und SLA (bis 350).",
    min_employees: 151,
    max_employees: 350,
    badge: null,
    sort_order: 30,
    is_open_ended: false,
    is_enterprise: false
  },
  {
    key: INDIVIDUAL_TIERS.ENTERPRISE,
    label: "Individuell Enterprise",
    short_label: "Enterprise",
    description: "Konzernweite Loesung mit Sonderkonditionen (ab 351 oder Sonderbedarf).",
    min_employees: 351,
    max_employees: null,
    badge: "Custom",
    sort_order: 40,
    is_open_ended: true,
    is_enterprise: true
  }
];

/**
 * Tier-Erkennung nach Beschaeftigtenzahl. SINGLE SOURCE: die Logik + Schwellen
 * (50/150/350, deckungsgleich mit INDIVIDUAL_TIER_CATALOG) leben in
 * planFeatures.getIndividualTierByEmployeeCount. Frueher existierte hier eine zweite,
 * abweichende Definition (30/250/999) = Commercial-Doppelwahrheit (P2.0) — entfernt.
 * Dieser Alias bleibt fuer Bestandsaufrufer (z. B. individuellPricingService).
 * @param {number} employeeCount
 * @returns {string} Tier-Key (individuell_s / _m / _l / _enterprise)
 */
export const getIndividualTierByEmployeeCountV2 = getIndividualTierByEmployeeCount;

/* ── Tarifarten ───────────────────────────────────────────────────
 * Steuern, wie eine Subscription/Order entstanden ist. Keine direkte
 * Plan-Ebene, sondern eine Cross-Cutting-Dimension fuer Vertrieb/Staff.
 * ───────────────────────────────────────────────────────────────── */
export const PLAN_VARIANTS = Object.freeze({
  STANDARD: "standard",
  PILOT_INDIVIDUAL: "pilot_individual",
  INDIVIDUAL: "individual",
  ENTERPRISE_INDIVIDUAL: "enterprise_individual"
});

/* ── Plan-Katalog (Standardtarife + Individuell-Schale) ──
 * Preise in Cents. Fuer DEMO/INDIVIDUELL ist `monthly_price_cents=null`,
 * weil sie kein Standard-Stueckpreis haben.
 * ───────────────────────────────────────────────────────────────── */
export const PLAN_CATALOG = [
  {
    key: PLAN.DEMO,
    label: "DEMO",
    display_label: "DEMO",
    description: "Plattform 14 Tage kostenlos testen. Marketplace und Funktionen kennenlernen.",
    badge: null,
    sort_order: 10,
    monthly_price_cents: 0,
    annual_price_cents: null,
    annual_price_status: ANNUAL_STATUS_DEFAULT,
    interval: "trial14d",
    interval_label: "/ 14 Tage",
    visible_in_pricing: true,
    visible_in_subscription_admin: true,
    selectable_via_self_service: true,
    requires_individual_inquiry: false,
    pilot_eligible: false,
    deprecated: false
  },
  {
    key: PLAN.BASIS,
    label: "BASIS",
    display_label: "BASIS",
    description: "Anfragen senden, Angebote erstellen, Deals abschliessen — der operative Einstieg.",
    badge: null,
    sort_order: 20,
    monthly_price_cents: 15000,
    annual_price_cents: null,
    annual_price_status: ANNUAL_STATUS_DEFAULT,
    interval: "monthly",
    interval_label: "/ Monat",
    visible_in_pricing: true,
    visible_in_subscription_admin: true,
    selectable_via_self_service: true,
    requires_individual_inquiry: false,
    pilot_eligible: false,
    deprecated: false
  },
  {
    key: PLAN.PLUS,
    label: "PLUS",
    display_label: "PLUS",
    description: "Digitale Stundenzettel, automatische Abrechnung, Notdienst und Smart Pricing.",
    badge: "Empfohlen",
    sort_order: 30,
    monthly_price_cents: 49900,
    annual_price_cents: null,
    annual_price_status: ANNUAL_STATUS_DEFAULT,
    interval: "monthly",
    interval_label: "/ Monat",
    visible_in_pricing: true,
    visible_in_subscription_admin: true,
    selectable_via_self_service: true,
    requires_individual_inquiry: false,
    pilot_eligible: false,
    deprecated: false
  },
  {
    key: PLAN.PRO,
    label: "PRO",
    display_label: "PRO",
    description: "Unbegrenzte Anfragen, erweitertes Matching mit AI-Ranking, Lieferanten-Bewertung.",
    badge: null,
    sort_order: 40,
    monthly_price_cents: 79900,
    annual_price_cents: null,
    annual_price_status: ANNUAL_STATUS_DEFAULT,
    interval: "monthly",
    interval_label: "/ Monat",
    visible_in_pricing: true,
    visible_in_subscription_admin: true,
    selectable_via_self_service: true,
    requires_individual_inquiry: false,
    pilot_eligible: false,
    deprecated: false
  },
  {
    key: PLAN.INDIVIDUELL,
    label: "Individuell",
    display_label: "Individueller Tarif",
    description: "Individueller Tarif fuer mehrere Standorte, Rahmenkonditionen und Governance.",
    badge: "Custom",
    sort_order: 50,
    monthly_price_cents: null,
    annual_price_cents: null,
    annual_price_status: ANNUAL_STATUS_DEFAULT,
    interval: "custom",
    interval_label: "auf Anfrage",
    visible_in_pricing: true,
    visible_in_subscription_admin: true,
    selectable_via_self_service: false,
    requires_individual_inquiry: true,
    pilot_eligible: true,
    deprecated: false
  }
];

/* ── Feature-Katalog ───────────────────────────────────────────── */

export const FEATURE_CATEGORIES = Object.freeze({
  CORE: "core",
  STAFFING: "staffing",
  MATCHING: "matching",
  CAPACITY: "capacity",
  ANALYTICS: "analytics",
  GOVERNANCE: "governance",
  COMPLIANCE: "compliance",
  INTEGRATION: "integration",
  SUPPORT: "support",
  SECURITY: "security"
});

/**
 * Helper, damit jedes Feature die Plan-Liste aus der `planFeatures`-Matrix
 * bekommt, ohne Doppelpflege. Sortierung folgt PLAN_CATALOG.sort_order.
 */
function plansFor(featureKey) {
  const allowed = planFeatures[featureKey];
  if (!Array.isArray(allowed)) return [];
  const order = new Map(PLAN_CATALOG.map((p) => [p.key, p.sort_order]));
  return [...allowed].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

/**
 * Vollstaendiger Feature-Katalog mit Anzeige-Metadaten.
 * `included_in_plans` wird zur Laufzeit aus `planFeatures.js` aufgeloest,
 * damit die Plan-zu-Feature-Wahrheit nicht doppelt gepflegt werden muss.
 */
const FEATURE_CATALOG_RAW = [
  // ── CORE ──
  { feature_key: "legacy_access",            name: "Marketplace-Zugang",                 description: "Vermittlung und Vermittlungs-Listings durchsuchen.",                                  category: FEATURE_CATEGORIES.CORE,        sort_order: 100, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "sla_access",               name: "SLA-Bereich",                         description: "Zugriff auf SLA-Dashboards, Suchauftraege und Pulse-Sicht.",                       category: FEATURE_CATEGORIES.CORE,        sort_order: 110, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },

  // ── STAFFING ──
  { feature_key: "worker_module",            name: "Worker-Modul",                        description: "Mitarbeiter pflegen, qualifizieren und in Einsaetze einplanen.",                  category: FEATURE_CATEGORIES.STAFFING,    sort_order: 200, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "timesheets",               name: "Digitale Stundenzettel",               description: "ArbZG-konforme Erfassung, Freigabe und Rechnungsbezug.",                          category: FEATURE_CATEGORIES.STAFFING,    sort_order: 210, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "emergency_staffing",       name: "Notdienst / Emergency Staffing",       description: "Schnelle Besetzung kurzfristiger Arbeitsplatzangebote inkl. Eskalation.",                       category: FEATURE_CATEGORIES.STAFFING,    sort_order: 220, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "smart_pricing",            name: "Smart Pricing",                        description: "Datenbasierte Preisempfehlungen fuer Arbeitsplatzangebote und Angebote.",                       category: FEATURE_CATEGORIES.STAFFING,    sort_order: 230, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "alerts",                   name: "Alerts und Benachrichtigungen",        description: "E-Mail- und Plattform-Benachrichtigungen fuer Arbeitsplatzangebote, Deals, Einsaetze.",          category: FEATURE_CATEGORIES.STAFFING,    sort_order: 240, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "persistent_requisitions",  name: "Persistente Suchauftraege",            description: "Daueranfragen mit Auto-Match und Match-Alerts.",                                  category: FEATURE_CATEGORIES.STAFFING,    sort_order: 250, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },

  // ── MATCHING ──
  { feature_key: "advanced_matching",        name: "Erweitertes 13-Faktor-Matching",        description: "Score-basiertes Ranking nach Skills, Region, Erfahrung, Reputation.",            category: FEATURE_CATEGORIES.MATCHING,    sort_order: 300, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "supplier_ratings",         name: "Lieferanten-Bewertungen",               description: "Bewertung und Reputation auf Lieferanten-/Worker-Ebene.",                          category: FEATURE_CATEGORIES.MATCHING,    sort_order: 310, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "premium_visibility",       name: "Prioritaets-Platzierung",               description: "Hoehere Sichtbarkeit im Vermittlungs-Ranking.",                                     category: FEATURE_CATEGORIES.MATCHING,    sort_order: 320, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },

  // ── CAPACITY ──
  { feature_key: "capacity_exchange_basic",  name: "Capacity Exchange (Basis)",             description: "Personal anbieten und durchsuchen.",                                          category: FEATURE_CATEGORIES.CAPACITY,    sort_order: 400, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "capacity_exchange_matching", name: "Capacity-Matching",                   description: "Automatisches Matching zwischen Personal und Arbeitsplatzangebot.",                          category: FEATURE_CATEGORIES.CAPACITY,    sort_order: 410, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "capacity_exchange_priority", name: "Capacity-Prioritaet",                 description: "Bevorzugte Sichtbarkeit des eigenen Personals.",                               category: FEATURE_CATEGORIES.CAPACITY,    sort_order: 420, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "capacity_exchange_multi",  name: "Capacity Multi-Pool",                   description: "Mehrere Pools, Sites oder Mandanten gleichzeitig.",                               category: FEATURE_CATEGORIES.CAPACITY,    sort_order: 430, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "inter_agency_matching",    name: "Inter-Agency Matching",                 description: "Cross-Agency-Vermittlung zwischen Lieferanten.",                                  category: FEATURE_CATEGORIES.CAPACITY,    sort_order: 440, available_as_addon: false, requires_staff_approval: true,  visible_in_pricing: false, visible_in_subscription: true,  active: true },

  // ── ANALYTICS ──
  { feature_key: "basic_analytics",          name: "Basis-Analysen",                        description: "Zentrale Kennzahlen zu Arbeitsplatzangeboten, Deals, Einsaetzen.",                              category: FEATURE_CATEGORIES.ANALYTICS,   sort_order: 500, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "enterprise_analytics",     name: "Erweiterte Analytics",                   description: "Multi-Dim-KPIs, Drilldowns, Exporte fuer Steuerung.",                              category: FEATURE_CATEGORIES.ANALYTICS,   sort_order: 510, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "spend_analytics",          name: "Spend Analytics",                        description: "Ausgaben pro Lieferant/Region/Qualifikation, Budgets.",                            category: FEATURE_CATEGORIES.ANALYTICS,   sort_order: 520, available_as_addon: true,  requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },

  // ── GOVERNANCE ──
  { feature_key: "approval_workflows",       name: "Freigabe-Workflows",                    description: "Mehrstufige Freigaben fuer Arbeitsplatzangebote, Deals, Einsatzvereinbarungen.",                category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 600, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "departments",              name: "Multi-Abteilungen / Teams",             description: "Org-interne Abteilungen, Standorte und Verantwortliche.",                          category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 610, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "multi_location",           name: "Multi-Standort",                         description: "Mehrere Sites mit eigener Steuerung und Auswertung.",                              category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 620, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "supplier_management",      name: "Lieferantensteuerung",                   description: "Vendor-Pool, Tier-Verwaltung, Preferred First, Coverage.",                          category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 630, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "contracts",                name: "Vertragsmanagement",                     description: "Rahmenvertraege, Bedingungen, Lifecycle-Tracking.",                                category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 640, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "audit_traceability",       name: "Audit-Traceability",                     description: "Detail-Audit auf Aktionen und Datenaenderungen.",                                  category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 650, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "org_settings",             name: "Erweiterte Org-Einstellungen",           description: "Branding, Workflows, Domain-Bindung, Feature-Bundles.",                            category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 660, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "assignments",              name: "Einsaetze (Multi-Staffing)",             description: "Mehrere Worker pro Arbeitsplatzangebot, Reservierungen, Backfill.",                              category: FEATURE_CATEGORIES.GOVERNANCE,  sort_order: 670, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },

  // ── COMPLIANCE ──
  { feature_key: "compliance",               name: "Compliance-Management",                  description: "Compliance-Ampel, Pflichtnachweise, Verfaelle.",                                   category: FEATURE_CATEGORIES.COMPLIANCE,  sort_order: 700, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "data_governance",          name: "Data Governance",                        description: "Datenschutz-Tools (Loeschung, Aufbewahrung, Consent, Audit).",                     category: FEATURE_CATEGORIES.COMPLIANCE,  sort_order: 710, available_as_addon: true,  requires_staff_approval: true,  visible_in_pricing: true,  visible_in_subscription: true,  active: true },

  // ── INTEGRATION ──
  { feature_key: "integrations",             name: "API-Zugang & Webhooks",                description: "Integrationen, Webhooks und API-Schluessel fuer externe Systeme.",                  category: FEATURE_CATEGORIES.INTEGRATION, sort_order: 790, available_as_addon: true,  requires_staff_approval: true,  visible_in_pricing: true,  visible_in_subscription: true,  active: true },
  { feature_key: "rate_card_management",     name: "Rate Card Management",                   description: "Rahmenpreise hinterlegen, Abweichungen erkennen.",                                 category: FEATURE_CATEGORIES.INTEGRATION, sort_order: 800, available_as_addon: true,  requires_staff_approval: false, visible_in_pricing: true,  visible_in_subscription: true,  active: true },

  // ── SLA-Subflaechen (zaehlen technisch zur SLA-Achse, hier sichtbar im Subscription-Admin) ──
  { feature_key: "sla_offers_create",        name: "SLA-Angebote erstellen",                description: "Eigenstaendige SLA-Angebote anlegen.",                                             category: FEATURE_CATEGORIES.STAFFING,    sort_order: 900, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "sla_help",                 name: "SLA-Helpdesk",                          description: "Helpdesk-Bereich fuer SLA-Anfragen.",                                              category: FEATURE_CATEGORIES.SUPPORT,     sort_order: 910, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "sla_subscriptions",        name: "SLA-Abos verwalten",                    description: "Eigene SLA-Abos einsehen und steuern.",                                            category: FEATURE_CATEGORIES.CORE,        sort_order: 920, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "sla_profile",              name: "SLA-Profil",                            description: "Eigenes SLA-Profil pflegen.",                                                      category: FEATURE_CATEGORIES.CORE,        sort_order: 930, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true },
  { feature_key: "sla_proofs",               name: "SLA-Nachweise",                         description: "Nachweise und Compliance-Dokumente im SLA-Kontext.",                               category: FEATURE_CATEGORIES.COMPLIANCE,  sort_order: 940, available_as_addon: false, requires_staff_approval: false, visible_in_pricing: false, visible_in_subscription: true,  active: true }
];

/**
 * Public Feature-Katalog mit Plan-Zuweisung (aufgeloest aus planFeatures-Matrix).
 */
export const FEATURE_CATALOG = FEATURE_CATALOG_RAW.map((f) => ({
  ...f,
  included_in_plans: plansFor(f.feature_key)
}));

/* ── Add-on-Katalog ──────────────────────────────────────────────
 * Add-ons sind buchbare Erweiterungen; aktuell nur fuer Individuell.
 * Spiegelt die hartcodierten Werte aus `enterpriseAnfrage.js` 1:1.
 * ───────────────────────────────────────────────────────────────── */
export const ADDON_CATALOG = [
  { key: "api",         name: "API-Zugang & Webhooks",              description: "REST-API fuer HR- und Drittsystem-Integration. Webhooks fuer Echtzeit-Events bei Anfragen, Matches und Statusaenderungen.",   price_cents: 39900,  interval: "monthly",  category: FEATURE_CATEGORIES.INTEGRATION, requires_staff_approval: false, sort_order: 10,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "spend",       name: "Spend Analytics Premium",             description: "Erweiterte Kostenanalysen pro Dienstleister, Region, Qualifikation. Budgetplanung und Kostenprognosen.",                  price_cents: 34900,  interval: "monthly",  category: FEATURE_CATEGORIES.ANALYTICS,   requires_staff_approval: false, sort_order: 20,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "ratecards",   name: "Rate Card Management",                description: "Verbindliche Stundensatz-Governance. Rahmenvertragspreise hinterlegen, automatische Abweichungserkennung.",                price_cents: 29900,  interval: "monthly",  category: FEATURE_CATEGORIES.INTEGRATION, requires_staff_approval: false, sort_order: 30,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "sla99",       name: "Erweiterter SLA (99,9 %)",            description: "Garantierte Plattformverfuegbarkeit von 99,9 % statt 99,5 %. Inkl. erweiterter Incident-Response.",                       price_cents: 44900,  interval: "monthly",  category: FEATURE_CATEGORIES.SUPPORT,     requires_staff_approval: true,  sort_order: 40,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "pulse15",     name: "Pulse-Timer 15 Minuten",              description: "Schnellster Matching-SLA: dokumentierter Matching-Versuch innerhalb von 15 statt 30 Minuten.",                            price_cents: 34900,  interval: "monthly",  category: FEATURE_CATEGORIES.STAFFING,    requires_staff_approval: false, sort_order: 50,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "multitenant", name: "Multi-Mandanten (Konzern)",           description: "Mehrere unabhaengige Organisationen unter einem Rahmenvertrag. Zentrale Verwaltung, getrennte Daten und Nutzer.",        price_cents: 79900,  interval: "monthly",  category: FEATURE_CATEGORIES.GOVERNANCE,  requires_staff_approval: true,  sort_order: 60,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "governance",  name: "Data Governance & Compliance-Paket",  description: "Erweiterte DSGVO-Tools: Loeschfristen-Automatik, Aufbewahrungsrichtlinien, Consent-Tracking und Audit-Protokolle.",       price_cents: 29900,  interval: "monthly",  category: FEATURE_CATEGORIES.COMPLIANCE,  requires_staff_approval: false, sort_order: 70,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "sso",         name: "SSO / SAML-Integration",              description: "Single Sign-On ueber Azure AD, Okta oder Google Workspace.",                                                              price_cents: 44900,  interval: "monthly",  category: FEATURE_CATEGORIES.SECURITY,    requires_staff_approval: true,  sort_order: 80,  active: true,  coming_soon: true,  available_for_plans: [PLAN.INDIVIDUELL] },
  { key: "onboarding",  name: "Dediziertes Onboarding-Paket",        description: "Persoenliche Schulung, Daten-Migration, Go-Live-Begleitung und 30 Tage Premium-Support.",                                price_cents: 249900, interval: "onetime",  category: FEATURE_CATEGORIES.SUPPORT,     requires_staff_approval: true,  sort_order: 90,  active: true,  coming_soon: false, available_for_plans: [PLAN.INDIVIDUELL] }
];

/* ── Individuell-Konfigurator: Default-Sockel ─────────────────── */
export const INDIVIDUELL_BASELINE = Object.freeze({
  base_monthly_cents: 249900,
  seats_included: 50,
  extra_seat_cents_per_month: 2900,
  notes: "Bis 50 Nutzer im Basispaket enthalten. Darueber 29 EUR / Nutzer / Monat."
});

/* ── Helpers ─────────────────────────────────────────────────── */

/**
 * @param {string} planKey
 * @returns {number|null} Monatspreis in Cents oder null fuer Custom/Trial.
 */
export function getPlanPriceCentsByKey(planKey) {
  const key = normalizePlanKey(planKey, { fallback: null });
  if (!key) return null;
  const row = PLAN_CATALOG.find((p) => p.key === key);
  return row ? row.monthly_price_cents : null;
}

/**
 * Liefert das ganze Plan-Objekt (kanonische Schreibweise).
 * @param {string} planKey
 * @returns {object|null}
 */
export function getPlanByKey(planKey) {
  const key = normalizePlanKey(planKey, { fallback: null });
  if (!key) return null;
  return PLAN_CATALOG.find((p) => p.key === key) || null;
}

/**
 * Plan-Katalog gefiltert auf oeffentlich sichtbare Eintraege.
 */
export function listPublicPlans() {
  return PLAN_CATALOG
    .filter((p) => p.visible_in_pricing && !p.deprecated)
    .map((p) => ({ ...p }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Feature-Katalog gefiltert auf oeffentlich sichtbare Eintraege.
 */
export function listPublicFeatures() {
  return FEATURE_CATALOG
    .filter((f) => f.active && f.visible_in_pricing)
    .map((f) => ({ ...f }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Add-on-Katalog gefiltert auf oeffentlich sichtbare Eintraege.
 */
export function listPublicAddons() {
  return ADDON_CATALOG
    .filter((a) => a.active)
    .map((a) => ({ ...a }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Komposition fuer eine einzige Frontend-Antwort.
 */
export function buildCatalogResponse() {
  return {
    catalog_version: CATALOG_VERSION,
    currency: CATALOG_CURRENCY,
    plan_variants: PLAN_VARIANTS,
    plans: listPublicPlans(),
    features: listPublicFeatures(),
    addons: listPublicAddons(),
    individual_tiers: INDIVIDUAL_TIER_CATALOG.map((t) => ({ ...t })),
    individuell_baseline: { ...INDIVIDUELL_BASELINE },
    maturity_gates: { ...MATURITY_GATES }
  };
}

/* ── Premium-Anzeige (Marktplatz) ─────────────────────────────
   Einmalige In-App-Gebuehr je Anzeige; wird von createInvoice automatisch auf die
   NAECHSTE Monatsrechnung addiert (manual-first, kein Sofort-Charge).
   Preis/Laufzeit hier zentral pflegen (Owner-Entscheidung). */
export const PREMIUM_LISTING = Object.freeze({
  price_cents: 4900,   // 49,00 EUR netto je Anzeige
  duration_days: 14    // Hervorhebungsdauer
});
