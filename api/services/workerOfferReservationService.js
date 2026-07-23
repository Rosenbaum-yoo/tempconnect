/**
 * workerOfferReservationService — Hard-Reserve / Konflikt-Engine (Welle 4b)
 *
 * Verhindert Doppelbuchung: ein Arbeiter erscheint über den Multi-Skill-Fan-out in
 * vielen Angeboten (Einzelskill + Bündel). Ist er aktuell im Einsatz (aktiver
 * worker_assignment_link), dürfen diese Angebote nicht buchbar sein. Dieser Service
 * pausiert sie automatisch (worker_reserved=TRUE) und reaktiviert sie, sobald der
 * Arbeiter wieder frei ist.
 *
 * Bewusst set-basiert + idempotent und über das bestehende "im Einsatz"-Signal
 * (worker_assignment_links.is_active) getrieben — greift NICHT in den Deal-/Einstell-
 * Flow ein und ist daher sicher periodisch ausführbar. Sammelangebote (pool_*) sind
 * ausgenommen: dort reduziert ein belegter Arbeiter nur die verfügbare Anzahl, statt
 * das ganze Angebot zu sperren (Feinlogik: eigener Ausbau).
 */

// Ein Arbeiter gilt als "im Einsatz", wenn er mindestens einen aktiven
// worker_assignment_link hat (dasselbe Signal wie die Pool-"frei"-Erkennung).
// Datum-bewusst (P1): reserviert, solange ein aktiver Einsatz läuft ODER noch nicht
// abgelaufen ist. Am Tag NACH end_date (CURRENT_DATE > end_date, DB = Europe/Berlin)
// fällt die Reservierung weg → Arbeiter taucht automatisch wieder im Marktplatz auf.
const BUSY_EXISTS_SQL = `
  EXISTS (
    SELECT 1
      FROM worker_profiles wp2
      JOIN worker_assignment_links wal
        ON wal.worker_user_id = wp2.user_id
       AND wal.is_active = TRUE
       AND (wal.end_date IS NULL OR wal.end_date >= CURRENT_DATE)
     WHERE wp2.id = cp.worker_profile_id
  )`;

const RESERVE_SQL = `
  UPDATE capacity_posts cp
     SET status = 'paused', worker_reserved = TRUE, worker_reserved_at = NOW(), updated_at = NOW()
   WHERE cp.status = 'active'
     AND cp.offer_kind IN ('single_skill', 'bundle')
     AND cp.worker_profile_id IS NOT NULL
     AND ${BUSY_EXISTS_SQL}`;

const RELEASE_SQL = `
  UPDATE capacity_posts cp
     SET status = 'active', worker_reserved = FALSE, worker_reserved_at = NULL, updated_at = NOW()
   WHERE cp.worker_reserved = TRUE
     AND cp.status = 'paused'
     AND cp.worker_profile_id IS NOT NULL
     AND NOT ${BUSY_EXISTS_SQL}`;

/**
 * Vollständiger Sweep über alle worker-spezifischen Angebote:
 * (1) aktive Angebote im-Einsatz-Arbeiter pausieren, (2) reservierte Angebote frei
 * gewordener Arbeiter reaktivieren. Idempotent — mehrfach ausführbar ohne Nebenwirkung.
 */
export async function sweepReservations(pool) {
  const reserved = await pool.query(`${RESERVE_SQL} RETURNING cp.id`);
  const released = await pool.query(`${RELEASE_SQL} RETURNING cp.id`);
  return { reserved: reserved.rowCount || 0, released: released.rowCount || 0 };
}

/**
 * Synchronisiert nur die Angebote EINES Arbeiters (z. B. direkt nach Hire/Einsatz-Ende
 * als Echtzeit-Trigger). Gleiche Logik wie der Sweep, org-/worker-eingegrenzt.
 */
export async function syncWorkerReservation(pool, workerProfileId) {
  const reserved = await pool.query(`${RESERVE_SQL} AND cp.worker_profile_id = $1 RETURNING cp.id`, [workerProfileId]);
  const released = await pool.query(`${RELEASE_SQL} AND cp.worker_profile_id = $1 RETURNING cp.id`, [workerProfileId]);
  return { reserved: reserved.rowCount || 0, released: released.rowCount || 0 };
}
