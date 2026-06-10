/**
 * individuellPricingService.js — Deterministische Preis-Engine fuer den
 * INDIVIDUELL-Selbstbuchungs-Konfigurator (Phase 2, Slice A).
 *
 * Owner-Entscheidung (gesperrt): Der Preis ist NICHT verhandelbar. Er ergibt
 * sich deterministisch aus den Auswahlmoeglichkeiten im Formular — gleiche
 * Eingabe => gleicher Preis, immer. Diese Datei ist die EINE Stelle, an der aus
 * einer Konfigurator-Auswahl ein buchbarer Gesamtpreis wird.
 *
 * Bewusst rein funktional (kein DB/IO, kein Stripe-Key) — analog zu
 * billingProviderService.js: vollstaendig unit-testbar und gefahrlos additiv
 * einsetzbar. Der Server rechnet den Preis IMMER selbst aus der Katalog-Wahrheit
 * (planCatalog.js) — dem Client-Preis wird NIE vertraut (Security-Kontrolle fuer
 * die spaeteren Checkout-/Webhook-Slices).
 *
 * Liefert zusaetzlich `requires_staff_approval`: enthaelt die Auswahl ein Add-on,
 * das Staff-Freigabe braucht (z. B. SSO, Multi-Mandant, erweiterter SLA), ist die
 * Buchung NICHT reines Self-Service und muss in den Anfrage-Pfad
 * (`subscription_requests`, requires_staff_approval) statt in den Stripe-Checkout.
 */

import {
  CATALOG_CURRENCY,
  CATALOG_VERSION,
  ADDON_CATALOG,
  INDIVIDUELL_BASELINE,
  INDIVIDUAL_TIER_CATALOG,
  getIndividualTierByEmployeeCountV2
} from "../config/planCatalog.js";
import { PLAN } from "../config/planFeatures.js";

/** Fehlercodes der Engine (stabil — Frontend/Tests binden darauf). */
export const PRICING_ERRORS = Object.freeze({
  INVALID_SEATS: "INVALID_SEATS",
  UNKNOWN_ADDON: "UNKNOWN_ADDON",
  ADDON_INACTIVE: "ADDON_INACTIVE",
  ADDON_COMING_SOON: "ADDON_COMING_SOON",
  ADDON_NOT_FOR_PLAN: "ADDON_NOT_FOR_PLAN"
});

const MAX_SEATS = 100000; // Schutz gegen absurde Eingaben; reale Enterprise-Werte liegen weit darunter.

/**
 * Normalisiert die rohe Add-on-Auswahl (Strings oder {key}) auf eindeutige Keys.
 * @param {Array<string|{key?:string,addon_key?:string,id?:string}>} addons
 * @returns {string[]}
 */
function normalizeAddonKeys(addons) {
  if (!Array.isArray(addons)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of addons) {
    const key = String(
      (typeof raw === "string" ? raw : raw?.key || raw?.addon_key || raw?.id) || ""
    ).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Validiert + bewertet die gewuenschten Add-ons gegen die Katalog-Wahrheit.
 * Bei JEDEM Defekt (unbekannt/inaktiv/coming_soon/falscher Plan) wird ein Fehler
 * gesammelt und das Add-on NICHT eingepreist — niemals ein Teil-Preis aus
 * ungueltiger Auswahl.
 */
function resolveAddons(addonKeys) {
  const errors = [];
  const resolved = [];
  for (const key of addonKeys) {
    const cat = ADDON_CATALOG.find((a) => a.key === key);
    if (!cat) {
      errors.push({ code: PRICING_ERRORS.UNKNOWN_ADDON, addon_key: key });
      continue;
    }
    if (cat.active === false) {
      errors.push({ code: PRICING_ERRORS.ADDON_INACTIVE, addon_key: key });
      continue;
    }
    if (cat.coming_soon === true) {
      errors.push({ code: PRICING_ERRORS.ADDON_COMING_SOON, addon_key: key });
      continue;
    }
    const forPlans = Array.isArray(cat.available_for_plans) ? cat.available_for_plans : [];
    if (!forPlans.includes(PLAN.INDIVIDUELL)) {
      errors.push({ code: PRICING_ERRORS.ADDON_NOT_FOR_PLAN, addon_key: key });
      continue;
    }
    resolved.push({
      key: cat.key,
      name: cat.name,
      price_cents: Number.isFinite(cat.price_cents) ? cat.price_cents : 0,
      interval: cat.interval || "monthly",
      requires_staff_approval: cat.requires_staff_approval === true
    });
  }
  return { resolved, errors };
}

/**
 * Berechnet das deterministische Angebot fuer eine INDIVIDUELL-Konfiguration.
 *
 * @param {{ seats:number, addons?:Array<string|object>, employee_count?:number }} selection
 * @returns {{
 *   ok:boolean,
 *   errors:Array<{code:string, addon_key?:string}>,
 *   currency:string,
 *   catalog_version:string,
 *   tier:string|null,
 *   seats:{ requested:number, included:number, billable_extra:number, extra_unit_cents:number, extra_total_cents:number },
 *   base_monthly_cents:number,
 *   addons:Array<{key:string,name:string,price_cents:number,interval:string,requires_staff_approval:boolean}>,
 *   addons_monthly_cents:number,
 *   addons_onetime_cents:number,
 *   total_monthly_cents:number|null,
 *   total_onetime_cents:number|null,
 *   requires_staff_approval:boolean
 * }}
 */
export function computeIndividuellQuote(selection = {}) {
  const errors = [];
  const baseline = INDIVIDUELL_BASELINE;

  // ── Seats validieren (Preistreiber) ──
  const rawSeats = selection.seats;
  const seats = Number(rawSeats);
  const seatsValid =
    Number.isFinite(seats) && Number.isInteger(seats) && seats >= 1 && seats <= MAX_SEATS;
  if (!seatsValid) {
    errors.push({ code: PRICING_ERRORS.INVALID_SEATS });
  }

  // ── Add-ons aufloesen ──
  const addonKeys = normalizeAddonKeys(selection.addons);
  const { resolved, errors: addonErrors } = resolveAddons(addonKeys);
  errors.push(...addonErrors);

  // Tier nur zur Anzeige/Klassifikation — kein Preistreiber. Aus employee_count
  // (falls vorhanden), sonst aus seats abgeleitet.
  const tierBasis = Number.isFinite(Number(selection.employee_count))
    ? Number(selection.employee_count)
    : seatsValid
      ? seats
      : null;
  const tier = tierBasis != null ? getIndividualTierByEmployeeCountV2(tierBasis) : null;

  // requires_staff_approval gilt unabhaengig von Preisfehlern: sobald ein
  // freigabepflichtiges Add-on gewaehlt ist, ist es kein Self-Service-Checkout.
  const requiresStaffApproval = resolved.some((a) => a.requires_staff_approval === true);

  const included = Number(baseline.seats_included) || 0;
  const extraUnit = Number(baseline.extra_seat_cents_per_month) || 0;
  const billableExtra = seatsValid ? Math.max(0, seats - included) : 0;
  const extraTotal = billableExtra * extraUnit;

  let addonsMonthly = 0;
  let addonsOnetime = 0;
  for (const a of resolved) {
    if (a.interval === "onetime") addonsOnetime += a.price_cents;
    else addonsMonthly += a.price_cents;
  }

  const ok = errors.length === 0;
  const baseMonthly = Number(baseline.base_monthly_cents) || 0;

  return {
    ok,
    errors,
    currency: CATALOG_CURRENCY,
    catalog_version: CATALOG_VERSION,
    tier,
    seats: {
      requested: seatsValid ? seats : null,
      included,
      billable_extra: billableExtra,
      extra_unit_cents: extraUnit,
      extra_total_cents: extraTotal
    },
    base_monthly_cents: baseMonthly,
    addons: resolved,
    addons_monthly_cents: addonsMonthly,
    addons_onetime_cents: addonsOnetime,
    // Bei ungueltiger Auswahl KEIN buchbarer Preis (null statt Teil-Summe).
    total_monthly_cents: ok ? baseMonthly + extraTotal + addonsMonthly : null,
    total_onetime_cents: ok ? addonsOnetime : null,
    requires_staff_approval: requiresStaffApproval
  };
}

/**
 * Selbstauskunft fuer das Konfigurator-Frontend: Baseline + buchbare Add-ons
 * (nur self-service-faehige, d. h. aktiv, nicht coming_soon, INDIVIDUELL) plus
 * die freigabepflichtigen separat — damit die UI „buchbar" vs. „auf Anfrage"
 * sauber trennen kann. Reine Projektion der Katalog-Wahrheit.
 */
export function describeIndividuellConfigurator() {
  const all = ADDON_CATALOG.filter(
    (a) => a.active !== false && (a.available_for_plans || []).includes(PLAN.INDIVIDUELL)
  );
  const map = (a) => ({
    key: a.key,
    name: a.name,
    description: a.description,
    price_cents: a.price_cents,
    interval: a.interval,
    category: a.category,
    requires_staff_approval: a.requires_staff_approval === true,
    coming_soon: a.coming_soon === true
  });
  return {
    currency: CATALOG_CURRENCY,
    catalog_version: CATALOG_VERSION,
    baseline: { ...INDIVIDUELL_BASELINE },
    tiers: INDIVIDUAL_TIER_CATALOG.map((t) => ({ ...t })),
    // Self-Service buchbar: aktiv, nicht coming_soon, keine Staff-Freigabe noetig.
    bookable_addons: all.filter((a) => a.coming_soon !== true && a.requires_staff_approval !== true).map(map),
    // Brauchen Anfrage/Staff (oder noch nicht verfuegbar) — UI zeigt „auf Anfrage".
    inquiry_addons: all.filter((a) => a.coming_soon === true || a.requires_staff_approval === true).map(map)
  };
}
