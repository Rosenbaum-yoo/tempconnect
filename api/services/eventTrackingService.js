/**
 * Platform Event Tracking Service.
 * Writes structured events to platform_events for analytics dashboards.
 *
 * P4.4: Der Katalog unten ist die EINZIGE Wahrheit — gueltiger Typ, Beschriftung und
 * Symbol stehen in derselben Zeile. Vorher waren "erlaubte Typen" (hier) und
 * "Beschriftung" (in routes/activityFeed.js) getrennt gepflegt: ein neuer Typ war
 * entweder ungueltig (Insert wirft) oder erschien im Feed als technischer Rohname.
 * Dasselbe Muster wie `notificationMatrix` — Eintrag fehlt, Feature ist still tot.
 */

/**
 * @typedef {{ label: string, icon: string }} ActivityMeta
 * @type {Record<string, ActivityMeta>}
 */
export const ACTIVITY_CATALOG = {
  // ── Lieferanten / Vendor Pool ──
  supplier_invited:            { label: 'Lieferant eingeladen',            icon: '&#129309;' },
  supplier_approved:           { label: 'Lieferant freigeschaltet',        icon: '&#9989;' },
  supplier_blocked:            { label: 'Lieferant gesperrt',              icon: '&#128683;' },

  // ── Arbeitsplatzangebote / Requisitions ──
  requisition_created:         { label: 'Arbeitsplatzangebot erstellt',    icon: '&#128196;' },
  requisition_distributed:     { label: 'Arbeitsplatzangebot verteilt',    icon: '&#128228;' },
  requisition_filled:          { label: 'Arbeitsplatzangebot besetzt',     icon: '&#9989;' },

  // ── Angebote / Deals ──
  offer_submitted:             { label: 'Angebot eingereicht',             icon: '&#128228;' },
  offer_created:               { label: 'Angebot erstellt',                icon: '&#128228;' },
  offer_accepted:              { label: 'Angebot angenommen',              icon: '&#9989;' },
  offer_rejected:              { label: 'Angebot abgelehnt',               icon: '&#10060;' },
  offer_withdrawn:             { label: 'Angebot zurueckgezogen',          icon: '&#8617;' },
  offer_countered:             { label: 'Gegenangebot eingereicht',        icon: '&#128260;' },
  deal_completed:              { label: 'Deal abgeschlossen',              icon: '&#127881;' },
  deal_cancelled:              { label: 'Deal storniert',                  icon: '&#10060;' },
  rating_submitted:            { label: 'Bewertung abgegeben',             icon: '&#11088;' },

  // ── Kapazitaeten / Marktplatz ──
  capacity_published:          { label: 'Personal eingestellt',            icon: '&#128259;' },
  capacity_expired:            { label: 'Personalangebot abgelaufen',      icon: '&#9203;' },
  capacity_filled:             { label: 'Personal zugewiesen',             icon: '&#9989;' },
  capacity_interest:           { label: 'Interesse an Personal',           icon: '&#128065;' },
  match_found:                 { label: 'Match gefunden',                  icon: '&#11088;' },

  // ── Einsaetze ──
  assignment_started:          { label: 'Einsatz gestartet',               icon: '&#128204;' },
  assignment_completed:        { label: 'Einsatz abgeschlossen',           icon: '&#9989;' },

  // ── Stundenzettel (P2) ──
  timesheet_submitted:         { label: 'Stundenzettel eingereicht',       icon: '&#9201;' },
  timesheet_approved:          { label: 'Stundenzettel genehmigt',         icon: '&#9989;' },
  timesheet_rejected:          { label: 'Stundenzettel abgelehnt',         icon: '&#10060;' },
  timesheet_customer_confirmed:{ label: 'Stundenzettel vom Kunden freigegeben', icon: '&#9989;' },
  timesheet_customer_rejected: { label: 'Stundenzettel vom Kunden beanstandet', icon: '&#9888;' },

  // ── Personal-Ripple (P1/P3) ──
  worker_replacement_assigned: { label: 'Ersatzkraft zugewiesen',          icon: '&#128260;' },
  worker_blocked:              { label: 'Kraft fuer Einsaetze gesperrt',   icon: '&#128683;' },
  worker_unblocked:            { label: 'Sperre fuer Kraft aufgehoben',    icon: '&#128275;' },
  complaint_filed:             { label: 'Beschwerde gemeldet',             icon: '&#9888;' },
  complaint_resolved:          { label: 'Beschwerde bearbeitet',           icon: '&#9989;' },

  // ── Profile / Suche / Dokumente ──
  profile_updated:             { label: 'Profil aktualisiert',             icon: '&#128100;' },
  search_job_created:          { label: 'Suchauftrag erstellt',            icon: '&#128269;' },
  search_job_closed:           { label: 'Suchauftrag geschlossen',         icon: '&#128274;' },
  document_uploaded:           { label: 'Dokument hochgeladen',            icon: '&#128206;' },
  document_verified:           { label: 'Dokument verifiziert',            icon: '&#128737;' },
  document_expired:            { label: 'Dokument abgelaufen',             icon: '&#9203;' },

  // ── Organisation / Konto ──
  org_created:                 { label: 'Organisation erstellt',           icon: '&#127970;' },
  org_updated:                 { label: 'Organisation aktualisiert',       icon: '&#127970;' },
  member_added:                { label: 'Mitglied hinzugefuegt',           icon: '&#128101;' },
  member_removed:              { label: 'Mitglied entfernt',               icon: '&#128101;' },
  role_changed:                { label: 'Rolle geaendert',                 icon: '&#128273;' },
  login:                       { label: 'Anmeldung',                       icon: '&#128274;' },
  password_changed:            { label: 'Passwort geaendert',              icon: '&#128273;' },
  notification_sent:           { label: 'Benachrichtigung gesendet',       icon: '&#128276;' },

  // ── Premium-Inserat-Analytik (Migration 045) ──
  listing_viewed:              { label: 'Inserat angesehen',               icon: '&#128065;' },
  listing_clicked:             { label: 'Inserat geoeffnet',               icon: '&#128070;' },
  listing_matched:             { label: 'Inserat gematcht',                icon: '&#11088;' }
};

const VALID_EVENT_TYPES = Object.keys(ACTIVITY_CATALOG);

/** Gueltige Event-Typen (Kopie — der Katalog bleibt die Quelle). */
export function getActivityTypes() {
  return [...VALID_EVENT_TYPES];
}

/**
 * Ziel-Deep-Link fuer ein Event. Ein Eintrag im Verlauf, der auf etwas verweist, muss
 * dorthin fuehren — nicht auf eine Uebersicht (CLAUDE.md: keine Sackgassen).
 */
export function activityLinkFor(entityType, entityId) {
  if (!entityType) return null;
  const id = entityId ? encodeURIComponent(entityId) : null;
  switch (entityType) {
    case 'capacity_post':
    case 'capacity':            return id ? `/public/capacity_exchange_detail.html?id=${id}&type=supply` : '/public/capacity_exchange_manage.html';
    case 'demand_request':
    case 'demand':              return id ? `/public/capacity_exchange_detail.html?id=${id}&type=demand` : '/public/capacity_exchange_feed.html';
    case 'requisition':         return id ? `/public/requisitions.html?focus_id=${id}` : '/public/requisitions.html';
    case 'offer':               return id ? `/public/offer_detail.html?id=${id}` : '/public/angebote_verwalten.html';
    case 'timesheet':
    case 'worker_submission':   return '/public/timesheets.html';
    case 'worker_complaint':    return '/public/worker-submissions-review.html';
    case 'worker_assignment_link':
    case 'assignment':          return '/public/timesheets.html';
    case 'worker':              return id ? `/public/worker-profile.html?user_id=${id}` : '/public/workers.html';
    case 'compliance_document': return '/public/compliance_overview.html';
    case 'search_job':          return id ? `/public/sla_search_job_detail.html?id=${id}` : '/public/sla_search_jobs_list.html';
    case 'vendor_pool':
    case 'supplier':            return '/public/vendor_pool.html';
    default:                    return null;
  }
}

/** Event-Zeile um Beschriftung, Symbol und Ziel anreichern (Server ist die Wahrheit). */
export function describeEvent(row) {
  const meta = ACTIVITY_CATALOG[row?.event_type] || null;
  return {
    ...row,
    label: meta?.label || row?.event_type || 'Aktivitaet',
    icon: meta?.icon || '&#128308;',
    link_path: activityLinkFor(row?.entity_type, row?.entity_id)
  };
}

/**
 * Record a platform event.
 * @param {import('pg').Pool} pool
 * @param {Object} event
 * @param {string} event.event_type
 * @param {string} [event.actor_id]
 * @param {string} [event.org_id]
 * @param {string} [event.entity_type]
 * @param {string} [event.entity_id]
 * @param {string} [event.target_org_id]
 * @param {Object} [event.metadata]
 */
export async function trackEvent(pool, event) {
  if (!VALID_EVENT_TYPES.includes(event.event_type)) {
    throw new Error('Invalid event_type: ' + event.event_type);
  }
  // `return await` statt `return`: die Funktion muss `async` bleiben, weil Aufrufer sich auf
  // ein abgelehntes Promise verlassen (`trackEvent(...).catch(swallow(...))` in marketplace.js).
  // Ohne `async` wuerde der Wurf oben synchron fliegen und den Geschaeftsvorgang mitreissen.
  return await insertEvent(pool, event);
}

async function insertEvent(pool, event) {
  const { rows } = await pool.query(
    `INSERT INTO platform_events
     (event_type, actor_id, org_id, entity_type, entity_id, target_org_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      event.event_type,
      event.actor_id || null,
      event.org_id || null,
      event.entity_type || null,
      event.entity_id || null,
      event.target_org_id || null,
      event.metadata ? JSON.stringify(event.metadata) : '{}'
    ]
  );
  return rows[0];
}

/**
 * Fire-and-forget-Emitter fuer Geschaeftspfade (P4.4).
 *
 * Warum getrennt von `trackEvent`: der wirft bei unbekanntem Typ — in einem
 * `.catch(swallow(...))`-Pfad heisst das "Aktivitaet verschwindet lautlos", genau die
 * Falle, die den Activity-Feed jahrelang leer gelassen hat. Hier wird ein unbekannter
 * Typ **laut** geloggt (nicht geworfen), und ein DB-Fehler kann den Geschaeftsvorgang
 * nie scheitern lassen. Der Aufrufer wartet nicht.
 */
export function recordActivity(pool, event = {}) {
  Promise.resolve()
    .then(async () => {
      if (!ACTIVITY_CATALOG[event.event_type]) {
        const { createServiceLogger } = await import("../utils/logger.js");
        createServiceLogger("eventTracking").warn(
          { event_type: event.event_type },
          'Unbekannter Aktivitaets-Typ — Eintrag fehlt im ACTIVITY_CATALOG, Event verworfen'
        );
        return;
      }
      await insertEvent(pool, event);
    })
    .catch(async (err) => {
      const { createServiceLogger } = await import("../utils/logger.js");
      createServiceLogger("eventTracking").warn(
        { err: err?.message, event_type: event.event_type },
        'Aktivitaet konnte nicht gespeichert werden (nicht blockierend)'
      );
    });
}

/**
 * Query platform events with optional filters.
 */
export async function queryEvents(pool, filters = {}) {
  const params = [];
  const where = [];
  let idx = 1;

  if (filters.event_type) {
    where.push(`pe.event_type = $${idx}`); params.push(filters.event_type); idx++;
  }
  if (filters.org_id) {
    where.push(`(pe.org_id = $${idx} OR pe.target_org_id = $${idx})`); params.push(filters.org_id); idx++;
  }
  if (filters.actor_id) {
    where.push(`pe.actor_id = $${idx}`); params.push(filters.actor_id); idx++;
  }
  if (filters.entity_type) {
    where.push(`pe.entity_type = $${idx}`); params.push(filters.entity_type); idx++;
  }
  if (filters.from_date) {
    where.push(`pe.created_at >= $${idx}`); params.push(filters.from_date); idx++;
  }
  if (filters.to_date) {
    where.push(`pe.created_at <= $${idx}`); params.push(filters.to_date); idx++;
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(500, filters.limit || 100);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT pe.*,
            u.email AS actor_email, u.company_name AS actor_name
     FROM platform_events pe
     LEFT JOIN users u ON u.id = pe.actor_id
     ${whereClause}
     ORDER BY pe.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/**
 * Aggregated event counts by type, optionally scoped to an org and time window.
 */
export async function eventCounts(pool, orgId = null, days = 30) {
  const params = [days];
  let orgClause = '';
  if (orgId) {
    params.push(orgId);
    orgClause = `AND (pe.org_id = $${params.length} OR pe.target_org_id = $${params.length})`;
  }

  const { rows } = await pool.query(
    `SELECT pe.event_type, COUNT(*)::int AS count
     FROM platform_events pe
     WHERE pe.created_at >= NOW() - ($1 || ' days')::interval ${orgClause}
     GROUP BY pe.event_type
     ORDER BY count DESC`,
    params
  );

  const totals = {};
  let total = 0;
  for (const r of rows) {
    totals[r.event_type] = r.count;
    total += r.count;
  }
  return { period_days: days, total, by_type: totals };
}
