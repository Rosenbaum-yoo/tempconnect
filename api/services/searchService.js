/**
 * Enterprise Search Service — Meilisearch-Integration mit Graceful Degradation.
 *
 * Features:
 *   - Lazy Client-Initialisierung (nur wenn MEILISEARCH_URL gesetzt)
 *   - 5 Indexes: companies, suppliers, capacity_posts, requisitions, skills
 *   - CRUD-Sync: indexDocument(), removeDocument(), search(), reindexAll()
 *   - DB-LIKE-Fallback wenn Meilisearch nicht verfuegbar
 *   - Filterbare Attribute, sortierbare Felder pro Index
 *
 * Nutzung:
 *   import * as searchService from '../services/searchService.js';
 *   await searchService.search(pool, 'Pflege Berlin', { type: 'capacity_posts', limit: 20 });
 *   await searchService.indexDocument('capacity_posts', { id: '...', title: '...' });
 */

import { config } from "../config/index.js";
import { createServiceLogger, swallow } from "../utils/logger.js";

const log = createServiceLogger("searchService");

/* ══════════════════════════════════════════════════════════
 * Index-Definitionen
 * ════════════════════════════════════════════════════════ */

const INDEX_CONFIG = {
  companies: {
    primaryKey: "id",
    searchableAttributes: ["company_name", "legal_name", "city", "postal_code", "description", "industry"],
    filterableAttributes: ["city", "postal_code", "type", "is_verified", "plan_id"],
    sortableAttributes: ["company_name", "created_at"],
    // SQL fuer Reindex
    reindexQuery: `
      SELECT u.id, u.company_name, u.legal_name, u.city, u.postal_code,
             u.type, u.is_verified, u.plan_id, u.latitude, u.longitude,
             u.created_at
      FROM users u
      WHERE u.company_name IS NOT NULL AND u.company_name != ''
      ORDER BY u.id`
  },

  suppliers: {
    primaryKey: "id",
    searchableAttributes: ["company_name", "legal_name", "city", "specializations", "description"],
    filterableAttributes: ["city", "is_verified", "type", "specializations"],
    sortableAttributes: ["company_name", "created_at"],
    reindexQuery: `
      SELECT u.id, u.company_name, u.legal_name, u.city, u.postal_code,
             u.type, u.is_verified, u.latitude, u.longitude,
             u.created_at
      FROM users u
      WHERE u.type = 'agency'
      ORDER BY u.id`
  },

  capacity_posts: {
    primaryKey: "id",
    searchableAttributes: ["title", "role", "description", "location_city", "skill_tags"],
    filterableAttributes: ["status", "role", "location_city", "supplier_company_id", "is_active"],
    sortableAttributes: ["created_at", "availability_from", "hourly_rate"],
    reindexQuery: `
      SELECT cp.id, cp.title, cp.role, cp.description, cp.location_city,
             cp.status, cp.is_active, cp.supplier_company_id,
             cp.skill_tags, cp.availability_from, cp.availability_to,
             cp.hourly_rate, cp.headcount, cp.location_lat, cp.location_lng,
             cp.created_at
      FROM capacity_posts cp
      ORDER BY cp.id`
  },

  requisitions: {
    primaryKey: "id",
    searchableAttributes: ["title", "role", "description", "location_city", "skill_tags"],
    filterableAttributes: ["status", "org_id", "priority", "role", "location_city"],
    sortableAttributes: ["created_at", "start_date", "priority"],
    reindexQuery: `
      SELECT r.id, r.title, r.role, r.description, r.location_city,
             r.status, r.org_id, r.priority, r.skill_tags,
             r.start_date, r.end_date, r.headcount,
             r.created_at
      FROM requisitions r
      ORDER BY r.id`
  },

  skills: {
    primaryKey: "id",
    searchableAttributes: ["name", "category", "aliases"],
    filterableAttributes: ["category", "is_active"],
    sortableAttributes: ["name", "usage_count"],
    reindexQuery: null // Skills werden aus Tags aggregiert
  }
};

/* ══════════════════════════════════════════════════════════
 * Meilisearch Client (Lazy Init)
 * ════════════════════════════════════════════════════════ */

let _client = null;
let _clientChecked = false;

async function getClient() {
  if (_clientChecked) return _client;
  _clientChecked = true;

  const url = config.MEILISEARCH_URL;
  const apiKey = config.MEILISEARCH_API_KEY;

  if (!url) {
    log.info("MEILISEARCH_URL nicht konfiguriert — Search nutzt DB-Fallback");
    return null;
  }

  try {
    const { MeiliSearch } = await import("meilisearch");
    _client = new MeiliSearch({ host: url, apiKey: apiKey || undefined });
    // Verbindungstest
    await _client.health();
    log.info({ url }, "Meilisearch verbunden");

    // Index-Settings initialisieren
    await initIndexes();
    return _client;
  } catch (err) {
    log.warn({ err: err.message }, "Meilisearch nicht erreichbar — DB-Fallback aktiv");
    _client = null;
    return null;
  }
}

/** Index-Settings bei Startup konfigurieren */
async function initIndexes() {
  if (!_client) return;

  for (const [name, cfg] of Object.entries(INDEX_CONFIG)) {
    try {
      const index = _client.index(name);
      // Index erstellen falls nicht vorhanden
      await _client.createIndex(name, { primaryKey: cfg.primaryKey }).catch(swallow("searchService"));

      // Settings setzen
      await index.updateSettings({
        searchableAttributes: cfg.searchableAttributes,
        filterableAttributes: cfg.filterableAttributes,
        sortableAttributes: cfg.sortableAttributes
      });
    } catch (err) {
      log.warn({ index: name, err: err.message }, "Index-Setup fehlgeschlagen");
    }
  }
  log.info({ indexes: Object.keys(INDEX_CONFIG) }, "Search-Indexes konfiguriert");
}

/* ══════════════════════════════════════════════════════════
 * Public API
 * ════════════════════════════════════════════════════════ */

/**
 * Einheitliche Suche ueber alle oder bestimmte Entity-Types.
 * @param {import('pg').Pool} pool - DB-Pool fuer Fallback
 * @param {string} query - Suchbegriff
 * @param {Object} opts
 * @param {string} [opts.type] - Einzelner Index-Name oder 'all'
 * @param {number} [opts.limit=20]
 * @param {number} [opts.offset=0]
 * @param {Object} [opts.filters] - Meilisearch-Filter-Objekt
 * @param {string} [opts.sort] - z.B. 'created_at:desc'
 * @returns {Promise<{ results: Array, total: number, source: 'meilisearch'|'database', durationMs: number }>}
 */
export async function search(pool, query, opts = {}) {
  const start = Date.now();
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;
  const type = opts.type || "all";

  const client = await getClient();

  if (client) {
    // SICHERHEIT: Der Meilisearch-Pfad filtert (noch) NICHT pro Viewer (org-privat/opt-in). In der
    // Pilot-/Hetzner-Umgebung ist Meilisearch nicht aktiv -> es laeuft der org-/sichtbarkeits-gescopte
    // DB-Pfad unten. Vor Aktivierung von Meilisearch: pro-Index-Filter ergaenzen (requisitions org_id,
    // capacity status, orgs is_public) — sonst cross-org-Leak.
    return searchMeilisearch(client, query, { type, limit, offset, filters: opts.filters, sort: opts.sort, start });
  }

  // DB-Fallback (org-/sichtbarkeits-gescoped + Fuzzy via pg_trgm)
  return searchDatabase(pool, query, { type, limit, offset, start, viewerOrgId: opts.viewerOrgId || null });
}

/**
 * Dokument in einen Index schreiben (Upsert).
 * @param {string} indexName - z.B. 'capacity_posts'
 * @param {Object|Array} documents - Ein oder mehrere Dokumente
 */
export async function indexDocument(indexName, documents) {
  const client = await getClient();
  if (!client) return null;

  const docs = Array.isArray(documents) ? documents : [documents];
  try {
    const task = await client.index(indexName).addDocuments(docs);
    log.info({ index: indexName, count: docs.length, taskUid: task.taskUid }, "Dokumente indexiert");
    return task;
  } catch (err) {
    log.warn({ index: indexName, err: err.message }, "Indexierung fehlgeschlagen");
    return null;
  }
}

/**
 * Dokument aus einem Index entfernen.
 * @param {string} indexName
 * @param {string|number} documentId
 */
export async function removeDocument(indexName, documentId) {
  const client = await getClient();
  if (!client) return null;

  try {
    const task = await client.index(indexName).deleteDocument(documentId);
    log.info({ index: indexName, documentId, taskUid: task.taskUid }, "Dokument entfernt");
    return task;
  } catch (err) {
    log.warn({ index: indexName, documentId, err: err.message }, "Entfernung fehlgeschlagen");
    return null;
  }
}

/**
 * Kompletten Index neu aufbauen aus der Datenbank.
 * @param {import('pg').Pool} pool
 * @param {string} indexName
 * @returns {Promise<{ indexed: number, durationMs: number }>}
 */
export async function reindexAll(pool, indexName) {
  const client = await getClient();
  const cfg = INDEX_CONFIG[indexName];
  if (!client || !cfg || !cfg.reindexQuery) {
    return { indexed: 0, durationMs: 0, error: "Not available" };
  }

  const start = Date.now();
  const { rows } = await pool.query(cfg.reindexQuery);

  // Skill_tags als Array sicherstellen
  const docs = rows.map(r => ({
    ...r,
    skill_tags: Array.isArray(r.skill_tags) ? r.skill_tags : []
  }));

  // Batch-Upload in Chunks von 500
  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    await client.index(indexName).addDocuments(chunk);
  }

  const durationMs = Date.now() - start;
  log.info({ index: indexName, indexed: docs.length, durationMs }, "Reindex abgeschlossen");
  return { indexed: docs.length, durationMs };
}

/**
 * Alle Indexes neu aufbauen.
 * @param {import('pg').Pool} pool
 */
export async function reindexAllIndexes(pool) {
  const results = {};
  for (const name of Object.keys(INDEX_CONFIG)) {
    if (!INDEX_CONFIG[name].reindexQuery) continue;
    results[name] = await reindexAll(pool, name);
  }
  return results;
}

/**
 * Search-Engine Status pruefen.
 * @returns {Promise<{ available: boolean, engine: string, info: Object|null }>}
 */
export async function getSearchStatus() {
  const client = await getClient();
  if (!client) {
    return { available: false, engine: "database_fallback", info: null };
  }
  try {
    const health = await client.health();
    const stats = await client.getStats();
    return {
      available: true,
      engine: "meilisearch",
      info: {
        status: health.status,
        indexes: stats.indexes ? Object.keys(stats.indexes) : [],
        totalDocuments: stats.indexes
          ? Object.values(stats.indexes).reduce((sum, idx) => sum + (idx.numberOfDocuments || 0), 0)
          : 0
      }
    };
  } catch (err) {
    return { available: false, engine: "meilisearch", info: { error: err.message } };
  }
}

/**
 * Verfuegbare Index-Namen.
 */
export function getAvailableIndexes() {
  return Object.keys(INDEX_CONFIG);
}

/* ══════════════════════════════════════════════════════════
 * Meilisearch Search
 * ════════════════════════════════════════════════════════ */

async function searchMeilisearch(client, query, { type, limit, offset, filters, sort, start }) {
  const searchOpts = { limit, offset };
  if (filters) searchOpts.filter = buildFilterString(filters);
  if (sort) searchOpts.sort = [sort];

  let results = [];
  let total = 0;

  if (type === "all") {
    // Multi-Index Search
    const queries = Object.keys(INDEX_CONFIG).map(indexName => ({
      indexUid: indexName,
      q: query,
      ...searchOpts
    }));

    try {
      const multiResult = await client.multiSearch({ queries });
      for (const r of multiResult.results) {
        results.push(...r.hits.map(h => ({ ...h, _index: r.indexUid })));
        total += r.estimatedTotalHits || r.hits.length;
      }
    } catch (err) {
      log.warn({ err: err.message }, "Multi-Search fehlgeschlagen");
    }
  } else {
    // Single-Index Search
    try {
      const result = await client.index(type).search(query, searchOpts);
      results = result.hits.map(h => ({ ...h, _index: type }));
      total = result.estimatedTotalHits || result.hits.length;
    } catch (err) {
      log.warn({ index: type, err: err.message }, "Search fehlgeschlagen");
    }
  }

  return {
    results,
    total,
    source: "meilisearch",
    durationMs: Date.now() - start
  };
}

/** Filter-Objekt in Meilisearch-Filter-String konvertieren */
function buildFilterString(filters) {
  const parts = [];
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      parts.push(`${key} IN [${value.map(v => `"${v}"`).join(", ")}]`);
    } else if (value !== undefined && value !== null) {
      parts.push(`${key} = "${value}"`);
    }
  }
  return parts.join(" AND ");
}

/* ══════════════════════════════════════════════════════════
 * Database Fallback Search
 * ════════════════════════════════════════════════════════ */

async function searchDatabase(pool, query, { type, limit, offset, start, viewerOrgId }) {
  // ILIKE-Term (Substring) + Roh-Query fuer den Trigram-%-Operator (Fuzzy/Tippfehler).
  const like = `%${String(query).replace(/[%_\\]/g, "\\$&")}%`;
  const results = [];
  let total = 0;

  // KORREKTE Sichtbarkeit pro Domain (Phase-5-Mapping, gegen den Domain-Code verifiziert):
  //  - requisitions: ORG-PRIVAT -> nur die eigene Org (org_id = viewerOrgId). Kein viewerOrgId -> keine Treffer.
  //  - capacity_posts: MARKTPLATZ -> nur aktiv, nicht-privat, nicht-abgelaufen.
  //  - companies: VERZEICHNIS -> nur Orgs mit Opt-in (profile_visibility_settings is_public + approved).
  // Match = Substring (ILIKE) ODER Trigram-Aehnlichkeit (%) -> Tippfehler-/Teilwort-Toleranz; Ranking via similarity().
  const domains = {
    requisitions: !viewerOrgId ? null : {
      sql: `SELECT id, title, role, location_city, status, org_id, 'requisitions' AS _index,
                   GREATEST(similarity(coalesce(title,''),$2), similarity(coalesce(role,''),$2)) AS _score
            FROM requisitions
            WHERE org_id = $5
              AND (title ILIKE $1 OR role ILIKE $1 OR location_city ILIKE $1 OR description ILIKE $1
                   OR title % $2 OR role % $2)
            ORDER BY _score DESC NULLS LAST, created_at DESC
            LIMIT $3 OFFSET $4`,
      params: [like, query, limit, offset, viewerOrgId],
      count: `SELECT COUNT(*)::int AS c FROM requisitions
              WHERE org_id = $3 AND (title ILIKE $1 OR role ILIKE $1 OR location_city ILIKE $1 OR description ILIKE $1 OR title % $2 OR role % $2)`,
      countParams: [like, query, viewerOrgId]
    },
    capacity_posts: {
      sql: `SELECT id, title, role, location_city, status, 'capacity_posts' AS _index,
                   GREATEST(similarity(coalesce(title,''),$2), similarity(coalesce(role,''),$2)) AS _score
            FROM capacity_posts
            WHERE status = 'active'
              AND (visibility_status IS NULL OR visibility_status <> 'private')
              AND (availability_to IS NULL OR availability_to >= CURRENT_DATE)
              AND (title ILIKE $1 OR role ILIKE $1 OR location_city ILIKE $1 OR title % $2 OR role % $2)
            ORDER BY _score DESC NULLS LAST, created_at DESC
            LIMIT $3 OFFSET $4`,
      params: [like, query, limit, offset],
      count: `SELECT COUNT(*)::int AS c FROM capacity_posts
              WHERE status = 'active' AND (visibility_status IS NULL OR visibility_status <> 'private')
                AND (availability_to IS NULL OR availability_to >= CURRENT_DATE)
                AND (title ILIKE $1 OR role ILIKE $1 OR location_city ILIKE $1 OR title % $2 OR role % $2)`,
      countParams: [like, query]
    },
    companies: {
      sql: `SELECT o.id, o.name AS company_name, o.legal_name, 'companies' AS _index,
                   GREATEST(similarity(coalesce(o.name,''),$2), similarity(coalesce(o.legal_name,''),$2)) AS _score
            FROM organizations o
            WHERE EXISTS (SELECT 1 FROM profile_visibility_settings pvs
                          WHERE pvs.org_id = o.id AND pvs.is_public = TRUE AND pvs.status = 'approved')
              AND (o.name ILIKE $1 OR o.legal_name ILIKE $1 OR o.name % $2 OR o.legal_name % $2)
            ORDER BY _score DESC NULLS LAST, o.name ASC
            LIMIT $3 OFFSET $4`,
      params: [like, query, limit, offset],
      count: `SELECT COUNT(*)::int AS c FROM organizations o
              WHERE EXISTS (SELECT 1 FROM profile_visibility_settings pvs
                            WHERE pvs.org_id = o.id AND pvs.is_public = TRUE AND pvs.status = 'approved')
                AND (o.name ILIKE $1 OR o.legal_name ILIKE $1 OR o.name % $2 OR o.legal_name % $2)`,
      countParams: [like, query]
    }
  };

  const want = type === "all" ? Object.keys(domains) : (domains[type] ? [type] : []);
  for (const t of want) {
    const d = domains[t];
    if (!d) continue; // z.B. requisitions ohne viewerOrgId -> sicher uebersprungen
    try {
      const { rows } = await pool.query(d.sql, d.params);
      results.push(...rows);
      const { rows: c } = await pool.query(d.count, d.countParams);
      total += c[0]?.c || 0;
    } catch (err) {
      log.warn({ type: t, err: err.message }, "DB-Suche fehlgeschlagen");
    }
  }

  return { results, total, source: "database", durationMs: Date.now() - start };
}
