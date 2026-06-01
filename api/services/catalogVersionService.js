/**
 * catalogVersionService.js — Versions-Verlauf des zentralen Tarif-Katalogs.
 *
 * Quelle: api/config/planCatalog.js
 * DB:     catalog_versions (Migration 102)
 *
 * Aufgaben:
 *   - aktuelle aktive Version aus DB lesen (`getActiveCatalogVersion`)
 *   - vollstaendigen Versions-Verlauf listen (`listCatalogVersions`)
 *   - eine NEUE Version aufnehmen + alte deaktivieren
 *     (`recordCatalogVersion`)
 *   - sicherstellen, dass beim App-Boot die in `planCatalog.js` definierte
 *     Version mit Snapshot in der DB liegt (`ensureCurrentCatalogVersion`)
 *
 * Aufrufer:
 *   - `app.js` Boot-Hook (ensureCurrentCatalogVersion) — automatischer Sync
 *     der App-Version mit der DB beim Start
 *   - Staff Control Center / Admin-UI fuer den Verlauf
 *   - Cron / Pricing-Tools fuer historische Berechnungen
 */

import {
  CATALOG_VERSION,
  CATALOG_CURRENCY,
  buildCatalogResponse
} from "../config/planCatalog.js";
import { SIZE_TIERS_V2 } from "./pricingTierService.js";

/**
 * Liefert die aktuell aktive DB-Version oder null, wenn die Tabelle leer ist.
 * @param {import('pg').Pool} pool
 */
export async function getActiveCatalogVersion(pool) {
  const { rows } = await pool.query(
    `SELECT id, version, changelog, snapshot_json, currency, size_tier_thresholds,
            is_active, created_by, created_at, retired_at
     FROM catalog_versions
     WHERE is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

/**
 * Liefert den vollstaendigen Verlauf, neueste Version zuerst.
 * @param {import('pg').Pool} pool
 * @param {{limit?:number, offset?:number}} [opts]
 */
export async function listCatalogVersions(pool, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id, version, changelog, currency, size_tier_thresholds,
            is_active, created_by, created_at, retired_at
     FROM catalog_versions
     ORDER BY created_at DESC, version DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

/**
 * Schreibt eine NEUE Version atomar:
 *   - bestehende aktive Version wird auf retired_at = NOW(), is_active = FALSE
 *     zurueckgesetzt
 *   - neue Zeile mit is_active = TRUE wird angelegt
 *
 * Idempotent: existiert die Version bereits, wird sie unveraendert
 * zurueckgegeben.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   version: string,
 *   changelog?: string|null,
 *   snapshotJson: object,
 *   currency?: string,
 *   sizeTierThresholds?: object|null,
 *   actorUserId?: string|null
 * }} args
 */
export async function recordCatalogVersion(pool, args) {
  if (!args || !args.version) throw new Error("VERSION_REQUIRED");
  if (!args.snapshotJson || typeof args.snapshotJson !== "object") {
    throw new Error("SNAPSHOT_REQUIRED");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, version, is_active FROM catalog_versions WHERE version = $1 LIMIT 1`,
      [args.version]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    await client.query(
      `UPDATE catalog_versions
       SET is_active = FALSE,
           retired_at = COALESCE(retired_at, NOW())
       WHERE is_active = TRUE`
    );

    const { rows } = await client.query(
      `INSERT INTO catalog_versions (
         version, changelog, snapshot_json, currency, size_tier_thresholds,
         is_active, created_by
       )
       VALUES ($1, $2, $3::jsonb, COALESCE($4, 'EUR'), $5::jsonb, TRUE, $6)
       RETURNING id, version, changelog, currency, size_tier_thresholds, is_active, created_by, created_at`,
      [
        args.version,
        args.changelog || null,
        JSON.stringify(args.snapshotJson),
        args.currency || CATALOG_CURRENCY,
        args.sizeTierThresholds ? JSON.stringify(args.sizeTierThresholds) : null,
        args.actorUserId || null
      ]
    );

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Stellt sicher, dass die in `planCatalog.js` definierte Version
 * (`CATALOG_VERSION`) auch als aktiver DB-Eintrag vorhanden ist.
 * Beim App-Boot aufzurufen.
 *
 * Liefert die aktive Version (entweder bestehende oder neu angelegte).
 *
 * @param {import('pg').Pool} pool
 * @param {{ logger?: object }} [deps]
 */
export async function ensureCurrentCatalogVersion(pool, deps = {}) {
  const logger = deps.logger || null;
  try {
    const active = await getActiveCatalogVersion(pool);
    if (active && active.version === CATALOG_VERSION) return active;

    const snapshot = buildCatalogResponse();
    const thresholds = SIZE_TIERS_V2.reduce((acc, t) => {
      acc[t.short] = Number.isFinite(t.max) ? t.max : null;
      return acc;
    }, {});
    if (Number.isFinite(SIZE_TIERS_V2.at(-1)?.min)) {
      thresholds.enterprise_min = SIZE_TIERS_V2.at(-1).min;
    }

    const rec = await recordCatalogVersion(pool, {
      version: CATALOG_VERSION,
      changelog: active
        ? `Auto-Sync Boot: Aufstieg von ${active.version} auf ${CATALOG_VERSION}.`
        : `Initialer App-Snapshot fuer ${CATALOG_VERSION}.`,
      snapshotJson: snapshot,
      currency: CATALOG_CURRENCY,
      sizeTierThresholds: thresholds
    });
    logger?.info?.({ version: CATALOG_VERSION }, "catalog_version.synced");
    return rec;
  } catch (err) {
    // Boot-Sync darf den Start NICHT killen.
    logger?.warn?.({ err: err?.message }, "catalog_version.sync_failed");
    return null;
  }
}
