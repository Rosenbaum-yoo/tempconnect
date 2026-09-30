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
import * as companyBlocklistService from "./companyBlocklistService.js";

const log = createServiceLogger("searchService");

/* ══════════════════════════════════════════════════════════
 * Index-Definitionen
 * ════════════════════════════════════════════════════════ */

const INDEX_CONFIG = {
  companies: {
    primaryKey: "id",
    /* Attribute an der gemessenen Wahrheit: `organizations` hat weder
       `description`/`industry` noch `is_verified`/`plan_id`. Was es nicht gibt,
       steht hier auch nicht — sonst verspricht die Index-Beschreibung Felder,
       die nie ankommen. */
    searchableAttributes: ["company_name", "legal_name", "city", "postal_code"],
    filterableAttributes: ["city", "postal_code", "type", "plan"],
    sortableAttributes: ["company_name", "created_at"],
    /*
     * P1-15 (2026-09-28): DIESE ABFRAGE HATTE KEINEN EINWILLIGUNGSFILTER.
     *
     * Sie stand auf `FROM users u WHERE u.company_name IS NOT NULL` und hat
     * damit JEDE Firma indiziert. Der Datenbankweg derselben Domaene
     * (`domains.companies` weiter unten) laesst dagegen nur Organisationen mit
     * ausdruecklichem Opt-in durch: `profile_visibility_settings.is_public` UND
     * `status = 'approved'`. Ein Verzeichnis, das Profile zeigt, die niemand
     * veroeffentlicht hat, ist keine Suche, sondern eine Veroeffentlichung ohne
     * Einwilligung (Stop-Regel 7 der CLAUDE.md).
     *
     * Ausserdem stimmten drei Spalten nicht: `users` hat kein `type`, kein
     * `legal_name` und kein `plan_id` — die Firmenwahrheit liegt auf
     * `organizations` (gemessen am 2026-09-28). Die Abfolge ist kein Zufall:
     * WEIL die Spalten fehlten, warf der Reindex, und WEIL er warf, ist der
     * fehlende Filter nie aufgefallen. Ein Fehler war hier der einzige Schutz.
     *
     * Erzwungen wird der Filter jetzt von
     * `api/test/suchindexKenntDieGrenze.test.js` — eine Notiz haette es nicht
     * getan: die stand seit Langem in Zeile ~181 und hat nichts verhindert.
     */
    reindexQuery: `
      SELECT o.id, o.name AS company_name, o.legal_name,
             o.billing_city AS city, o.billing_postal_code AS postal_code,
             o.type, o.plan, o.created_at
      FROM organizations o
      WHERE o.name IS NOT NULL AND o.name != ''
        AND EXISTS (SELECT 1 FROM profile_visibility_settings pvs
                     WHERE pvs.org_id = o.id
                       AND pvs.is_public = TRUE
                       AND pvs.status = 'approved')
      ORDER BY o.id`
  },

  suppliers: {
    primaryKey: "id",
    /* `specializations` und `description` gibt es auf `organizations` nicht;
       ebenso kein `is_verified`. Entfernt statt versprochen. */
    searchableAttributes: ["company_name", "legal_name", "city"],
    filterableAttributes: ["city", "type", "plan"],
    sortableAttributes: ["company_name", "created_at"],
    /*
     * P1-15: dieselbe Verzeichnis-Regel wie bei `companies` — dieselbe Luecke,
     * dieselbe Behebung. Zusaetzlich stand die Auswahl auf `users.type`, eine
     * Spalte, die es nicht gibt; `organizations.type` ist per CHECK auf
     * 'company'/'agency' begrenzt (gemessen).
     *
     * Eine Zeitarbeitsfirma landet also nur im Index, wenn sie ihr Profil
     * ausdruecklich veroeffentlicht hat. Das ist strenger als vorher und genau
     * so streng wie der Datenbankweg.
     */
    reindexQuery: `
      SELECT o.id, o.name AS company_name, o.legal_name,
             o.billing_city AS city, o.billing_postal_code AS postal_code,
             o.type, o.plan, o.created_at
      FROM organizations o
      WHERE o.type = 'agency'
        AND EXISTS (SELECT 1 FROM profile_visibility_settings pvs
                     WHERE pvs.org_id = o.id
                       AND pvs.is_public = TRUE
                       AND pvs.status = 'approved')
      ORDER BY o.id`
  },

  capacity_posts: {
    primaryKey: "id",
    /* `description` und `hourly_rate` gibt es nicht (gemessen): der Freitext
       heisst `notes`, der Preis steht als `price_type`/`price_min`/`price_max`. */
    searchableAttributes: ["title", "role", "notes", "location_city", "skill_tags"],
    filterableAttributes: ["status", "role", "location_city", "supplier_company_id", "is_active"],
    sortableAttributes: ["created_at", "availability_from", "price_min"],
    /*
     * P1-15 (2026-09-28): DIESE ABFRAGE HATTE KEINE EINZIGE BEDINGUNG.
     *
     * `FROM capacity_posts cp ORDER BY cp.id` — also auch private
     * (`visibility_status = 'private'`), inaktive und abgelaufene Anzeigen. Der
     * Datenbankweg derselben Domaene laesst nur durch: `status = 'active'`,
     * nicht privat, nicht abgelaufen, und er beachtet ausserdem die Sperrliste
     * des fragenden Unternehmens.
     *
     * Die drei ersten Bedingungen stehen jetzt hier. Die Sperrliste NICHT, und
     * das ist kein Versehen: sie haengt am FRAGENDEN Unternehmen und ist damit
     * keine Eigenschaft des Dokuments. Ein gemeinsamer Index kann sie nicht
     * tragen; sie muss beim Suchen angewandt werden. Wer diesen Index aktiviert,
     * muss die Sperre also im Suchpfad nachziehen — `search()` tut das heute nur
     * auf dem Datenbankweg.
     */
    reindexQuery: `
      SELECT cp.id, cp.title, cp.role, cp.notes, cp.location_city,
             cp.status, cp.is_active, cp.supplier_company_id,
             cp.skill_tags, cp.availability_from, cp.availability_to,
             cp.price_type, cp.price_min, cp.price_max,
             cp.headcount, cp.location_lat, cp.location_lng,
             cp.created_at
      FROM capacity_posts cp
      WHERE cp.status = 'active'
        AND (cp.visibility_status IS NULL OR cp.visibility_status <> 'private')
        AND (cp.availability_to IS NULL OR cp.availability_to >= CURRENT_DATE)
      ORDER BY cp.id`
  },

  requisitions: {
    primaryKey: "id",
    searchableAttributes: ["title", "role", "description", "location_city", "skill_tags"],
    filterableAttributes: ["status", "org_id", "priority", "role", "location_city"],
    sortableAttributes: ["created_at", "start_date", "priority"],
    /*
     * ══════════════════════════════════════════════════════════════════════
     * P1-15 (2026-09-28): ORG-PRIVATE DATEN WERDEN NICHT INDIZIERT.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Hier stand `FROM requisitions r ORDER BY r.id` — ohne WHERE. Das haette
     * die Anforderungen ALLER Mandanten in EINEN gemeinsamen Index gelegt. Der
     * Datenbankweg derselben Domaene ist dagegen eindeutig: er filtert
     * `WHERE org_id = $5` und ist ohne Org-Kontext gar nicht vorhanden
     * (`requisitions: !viewerOrgId ? null : …`) — ohne Org keine Treffer.
     *
     * DASS `org_id` ALS FILTERBARES ATTRIBUT GEFUEHRT WIRD, SCHUETZT NICHT. Ein
     * Filter ist eine Bitte an die Abfrage; eine Mandantengrenze ist eine
     * Zusage ueber den Inhalt. Liegen die Daten im Index, liefert sie jede
     * Abfrage, die den Filter vergisst — und Abfragen vergisst man.
     *
     * Deshalb `null` wie bei `skills`: dieser Index wird nicht gefuellt, die
     * Suche nach Anforderungen laeuft ueber den korrekt gefilterten
     * Datenbankweg. Die Attribute darueber bleiben stehen, damit der Vertrag
     * dokumentiert ist, falls der Owner den Index will.
     *
     * OFFENE OWNER-ENTSCHEIDUNG (P1-15, Punkt 3): ob org-private Anforderungen
     * ueberhaupt in einen Suchindex gehoeren. Sauber waere ein Index JE
     * Organisation; ein gemeinsamer mit Filter ist es nicht. Bis das entschieden
     * ist, bleibt hier `null` — und `api/test/suchindexKenntDieGrenze.test.js`
     * faerbt rot, wenn jemand ihn ohne Org-Bindung wieder befuellt.
     */
    reindexQuery: null
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
    // capacity status, orgs is_public) — sonst cross-org-Leak. UND die Kundensperre (N4.2,
    // `companyBlocklistService.nichtGesperrtSql`): ohne sie sieht ein Unternehmen die von ihm
    // gesperrte Kraft in der Suche wieder, waehrend `searchService.rbac.test.js` gruen bleibt,
    // weil er nur den DB-Pfad prueft.
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
  /*
   * ═════════════════════════════════════════════════════════════════════════
   * N4.2 - DIE SUCHE KENNT DIE SPERRE
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Der Feed blendet eine fuer dieses Unternehmen gesperrte Kraft aus. Die
   * Suche tat es nicht - derselbe Datensatz, zwei Meinungen darueber, ob er
   * existiert. Wer den Namen tippte, fand ihn; wer blaetterte, nicht.
   *
   * Ohne Betrachter-Org bleibt die Bedingung WEG statt "false" zu werden: eine
   * anonyme oder org-lose Suche sieht den oeffentlichen Marktplatz, und dort
   * gibt es niemanden, der gesperrt haette. Ein hartes `false` haette hier den
   * ganzen Zweig geleert.
   *
   * Kein Rollen-Check davor. Steht in der Sperrliste eine Zeile mit dieser Org
   * als Kunde, dann IST sie in diesem Moment Kunde - unabhaengig davon, was in
   * `users.role` steht. Fuer eine Zeitarbeitsfirma findet die Bedingung nichts
   * und laesst alles durch; eine zusaetzliche Abfrage nach der Rolle waere ein
   * Rundgang fuer eine Antwort, die die Bedingung selbst schon gibt.
   */
  const gesperrtRaus = (platzhalter) =>
    viewerOrgId ? companyBlocklistService.nichtGesperrtSql("cp", platzhalter) : "TRUE";

  const domains = {
    requisitions: !viewerOrgId ? null : {
      sql: `SELECT id, title, role, location_city, status, org_id, 'requisitions' AS _index,
                   GREATEST(similarity(f_unaccent(coalesce(title,'')),f_unaccent($2)), similarity(f_unaccent(coalesce(role,'')),f_unaccent($2))) AS _score
            FROM requisitions
            WHERE org_id = $5
              AND (f_unaccent(title) ILIKE f_unaccent($1) OR f_unaccent(role) ILIKE f_unaccent($1) OR f_unaccent(location_city) ILIKE f_unaccent($1) OR f_unaccent(description) ILIKE f_unaccent($1)
                   OR f_unaccent(title) % f_unaccent($2) OR f_unaccent(role) % f_unaccent($2))
            ORDER BY _score DESC NULLS LAST, created_at DESC
            LIMIT $3 OFFSET $4`,
      params: [like, query, limit, offset, viewerOrgId],
      count: `SELECT COUNT(*)::int AS c FROM requisitions
              WHERE org_id = $3 AND (f_unaccent(title) ILIKE f_unaccent($1) OR f_unaccent(role) ILIKE f_unaccent($1) OR f_unaccent(location_city) ILIKE f_unaccent($1) OR f_unaccent(description) ILIKE f_unaccent($1) OR f_unaccent(title) % f_unaccent($2) OR f_unaccent(role) % f_unaccent($2))`,
      countParams: [like, query, viewerOrgId]
    },
    capacity_posts: {
      sql: `SELECT cp.id, cp.title, cp.role, cp.location_city, cp.status, 'capacity_posts' AS _index,
                   GREATEST(similarity(f_unaccent(coalesce(cp.title,'')),f_unaccent($2)), similarity(f_unaccent(coalesce(cp.role,'')),f_unaccent($2))) AS _score
            FROM capacity_posts cp
            WHERE cp.status = 'active'
              AND (cp.visibility_status IS NULL OR cp.visibility_status <> 'private')
              AND (cp.availability_to IS NULL OR cp.availability_to >= CURRENT_DATE)
              AND ${gesperrtRaus(5)}
              AND (f_unaccent(cp.title) ILIKE f_unaccent($1) OR f_unaccent(cp.role) ILIKE f_unaccent($1) OR f_unaccent(cp.location_city) ILIKE f_unaccent($1) OR f_unaccent(cp.title) % f_unaccent($2) OR f_unaccent(cp.role) % f_unaccent($2))
            ORDER BY _score DESC NULLS LAST, cp.created_at DESC
            LIMIT $3 OFFSET $4`,
      params: viewerOrgId ? [like, query, limit, offset, viewerOrgId] : [like, query, limit, offset],
      count: `SELECT COUNT(*)::int AS c FROM capacity_posts cp
              WHERE cp.status = 'active' AND (cp.visibility_status IS NULL OR cp.visibility_status <> 'private')
                AND (cp.availability_to IS NULL OR cp.availability_to >= CURRENT_DATE)
                AND ${gesperrtRaus(3)}
                AND (f_unaccent(cp.title) ILIKE f_unaccent($1) OR f_unaccent(cp.role) ILIKE f_unaccent($1) OR f_unaccent(cp.location_city) ILIKE f_unaccent($1) OR f_unaccent(cp.title) % f_unaccent($2) OR f_unaccent(cp.role) % f_unaccent($2))`,
      countParams: viewerOrgId ? [like, query, viewerOrgId] : [like, query]
    },
    companies: {
      sql: `SELECT o.id, o.name AS company_name, o.legal_name, 'companies' AS _index,
                   GREATEST(similarity(f_unaccent(coalesce(o.name,'')),f_unaccent($2)), similarity(f_unaccent(coalesce(o.legal_name,'')),f_unaccent($2))) AS _score
            FROM organizations o
            WHERE EXISTS (SELECT 1 FROM profile_visibility_settings pvs
                          WHERE pvs.org_id = o.id AND pvs.is_public = TRUE AND pvs.status = 'approved')
              AND (f_unaccent(o.name) ILIKE f_unaccent($1) OR f_unaccent(o.legal_name) ILIKE f_unaccent($1) OR f_unaccent(o.name) % f_unaccent($2) OR f_unaccent(o.legal_name) % f_unaccent($2))
            ORDER BY _score DESC NULLS LAST, o.name ASC
            LIMIT $3 OFFSET $4`,
      params: [like, query, limit, offset],
      count: `SELECT COUNT(*)::int AS c FROM organizations o
              WHERE EXISTS (SELECT 1 FROM profile_visibility_settings pvs
                            WHERE pvs.org_id = o.id AND pvs.is_public = TRUE AND pvs.status = 'approved')
                AND (f_unaccent(o.name) ILIKE f_unaccent($1) OR f_unaccent(o.legal_name) ILIKE f_unaccent($1) OR f_unaccent(o.name) % f_unaccent($2) OR f_unaccent(o.legal_name) % f_unaccent($2))`,
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
