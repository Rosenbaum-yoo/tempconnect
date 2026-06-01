/**
 * subscriptionQuoteSnapshotService.js
 *
 * Zentrale Quote-Snapshot-Logik fuer Subscription-/Tarifangebote.
 * Ein eingefrorener Snapshot ist Vertragswahrheit fuer Angebot,
 * Approval und nachgelagerte Dokumente. Spaetere Catalog-Aenderungen
 * duerfen bestehende Angebote NICHT veraendern.
 */

import {
  CATALOG_VERSION,
  CATALOG_CURRENCY,
  PLAN_CATALOG,
  ADDON_CATALOG,
  INDIVIDUELL_BASELINE,
  normalizePlanKey
} from "../config/planCatalog.js";
import { planFeatures } from "../config/planFeatures.js";
import { PLAN_LIMITS } from "./userService.js";
import * as auditLog from "./auditLog.js";

export const DEFAULT_OFFER_VALIDITY_DAYS = 14;

/**
 * Baut den Snapshot-Inhalt aus dem aktuellen Catalog-Stand + den auf
 * der Anfrage hinterlegten Wunsch-Parametern. Reine Helper-Funktion,
 * wirft nicht.
 *
 * @param {object} req subscription_requests-Zeile
 * @returns {object} JSON-serialisierbarer Snapshot
 */
export function buildQuoteSnapshot(req) {
  if (!req) return { catalog_version: CATALOG_VERSION, frozen_at: new Date().toISOString() };
  const planKey = normalizePlanKey(req.desired_plan || req.current_plan, { fallback: "DEMO" });
  const plan = PLAN_CATALOG.find((p) => p.key === planKey) || PLAN_CATALOG[0];
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.DEMO || {};
  const featureKeys = Object.keys(planFeatures).filter(
    (k) => Array.isArray(planFeatures[k]) && planFeatures[k].includes(planKey)
  );

  const addons = (Array.isArray(req.desired_addons) ? req.desired_addons : []).map((a) => {
    const cat = ADDON_CATALOG.find((x) => x.key === a.key);
    if (!cat) {
      return {
        key: a.key || null,
        name: a.name || a.key || null,
        price_cents: Number.isFinite(a.price_cents) ? a.price_cents : null,
        interval: a.interval || null,
        coming_soon: a.coming_soon === true,
        not_in_catalog: true
      };
    }
    return {
      key: cat.key,
      name: cat.name,
      description: cat.description,
      price_cents: cat.price_cents,
      interval: cat.interval,
      category: cat.category,
      requires_staff_approval: cat.requires_staff_approval === true,
      coming_soon: cat.coming_soon === true
    };
  });

  return {
    catalog_version: CATALOG_VERSION,
    currency: CATALOG_CURRENCY,
    frozen_at: new Date().toISOString(),
    plan: planKey,
    plan_label: plan?.label || planKey,
    plan_display_label: plan?.display_label || plan?.label || planKey,
    plan_monthly_price_cents: plan?.monthly_price_cents ?? null,
    plan_interval: plan?.interval || null,
    individual_tier: req.desired_individual_tier || null,
    individuell_baseline: planKey === "INDIVIDUELL" ? { ...INDIVIDUELL_BASELINE } : null,
    proposed_price_cents: Number.isFinite(req.proposed_price_cents) ? req.proposed_price_cents : null,
    proposed_term_months: Number.isFinite(req.proposed_term_months) ? req.proposed_term_months : null,
    addons,
    feature_keys: featureKeys,
    limits: { ...limits }
  };
}

/**
 * Friert den Quote-Snapshot ein. Idempotent: wenn bereits gefroren,
 * wird `already_frozen=true` mit dem bestehenden Snapshot zurueckgegeben.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {{ requestId: string, actorUserId?: string|null, offerValidityDays?: number, force?: boolean }} args
 */
export async function freezeQuoteSnapshot(pool, args) {
  if (!args || !args.requestId) return { ok: false, error: "REQUEST_ID_REQUIRED" };
  const cur = await pool.query("SELECT * FROM subscription_requests WHERE id = $1", [args.requestId]);
  const r = cur.rows[0];
  if (!r) return { ok: false, error: "REQUEST_NOT_FOUND" };

  // Idempotent: bei vorhandenem frozen Snapshot nicht ueberschreiben (ausser explizit force=true)
  if (!args.force && r.quote_frozen_at && r.quote_snapshot && Object.keys(r.quote_snapshot).length > 0) {
    return { ok: true, snapshot: r.quote_snapshot, already_frozen: true, row: r };
  }

  const snapshot = buildQuoteSnapshot(r);
  const days = Number.isFinite(args.offerValidityDays) ? args.offerValidityDays : DEFAULT_OFFER_VALIDITY_DAYS;
  const offerExpiresAt = r.offer_expires_at
    ? r.offer_expires_at
    : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const upd = await pool.query(
    `UPDATE subscription_requests
        SET quote_snapshot = $2::jsonb,
            quote_frozen_at = NOW(),
            quote_catalog_version = $3,
            offer_expires_at = COALESCE(offer_expires_at, $4),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [args.requestId, JSON.stringify(snapshot), snapshot.catalog_version, offerExpiresAt]
  );

  // Audit: im Apply-/Approval-Pfad ist das Teil derselben Transaktion, weil
  // der Aufrufer denselben Client uebergibt.
  await auditLog.writeAudit(pool, {
    action: "subscription_request.quote_frozen",
    entity_type: "subscription_request",
    entity_id: args.requestId,
    details: {
      catalog_version: snapshot.catalog_version,
      plan: snapshot.plan,
      addons_count: Array.isArray(snapshot.addons) ? snapshot.addons.length : 0,
      offer_expires_at: offerExpiresAt,
      actor_user_id: args.actorUserId || null
    }
  });

  return { ok: true, snapshot, row: upd.rows[0], already_frozen: false };
}
