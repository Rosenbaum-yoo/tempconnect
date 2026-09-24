/**
 * workerOfferReservationService — Hard-Reserve / Konflikt-Engine (Welle 4b, M4c.3)
 *
 * Verhindert Doppelbuchung: ein Arbeiter erscheint über den Multi-Skill-Fan-out in
 * vielen Angeboten (Einzelskill + Bündel). Ist er aktuell im Einsatz (aktiver
 * worker_assignment_link), dürfen diese Angebote nicht buchbar sein. Dieser Service
 * pausiert sie automatisch (worker_reserved=TRUE) und reaktiviert sie, sobald der
 * Arbeiter wieder frei ist.
 *
 * Bewusst set-basiert + idempotent und über das bestehende "im Einsatz"-Signal
 * (worker_assignment_links.is_active) getrieben — greift NICHT in den Deal-/Einstell-
 * Flow ein und ist daher sicher periodisch ausführbar.
 *
 * M4c.3 — SAMMELANGEBOTE SIND NICHT MEHR AUSGENOMMEN.
 *
 * Hier stand: "Sammelangebote (pool_*) sind ausgenommen: dort reduziert ein belegter
 * Arbeiter nur die verfügbare Anzahl, statt das ganze Angebot zu sperren (Feinlogik:
 * eigener Ausbau)." Diese Reduktion wurde nie gebaut. Migration 146 hat
 * capacity_post_pool_members ausdrücklich für "die spätere Reservierung (Welle 4b)"
 * angelegt — und genau diese Welle hat die Tabelle dann ausgespart. Sie wurde seither
 * nur geschrieben, nie gelesen.
 *
 * Gemessen am 2026-09-24 gegen die Entwicklungsdatenbank: ein und derselbe Mensch
 * steht gleichzeitig in einem aktiven Sammelangebot UND in einem aktiven Einzelangebot.
 * Er ist heute zweimal buchbar. Das ist der Zustand, den der Owner Betrug nennt —
 * "ein Mensch, fünfmal gebucht, wäre Betrug" —, und er entsteht lautlos, weil jede
 * einzelne Buchung für sich gültig aussieht.
 *
 * Die Trennung der MECHANIK bleibt trotzdem richtig, nur die Ausnahme fällt weg:
 *
 *   - Personengebundene Angebote (single_skill, bundle) tragen worker_profile_id.
 *     Ist dieser eine Mensch gebunden, kann das Angebot nichts mehr liefern → pausieren.
 *   - Sammelangebote tragen ihre Menschen in capacity_post_pool_members. Sie können
 *     liefern, solange NOCH EIN Mitglied frei ist. Erst wenn KEINES mehr frei ist,
 *     wird pausiert. Die Teilbelegung (30 Kräfte, 29 gebunden) fängt nicht dieser
 *     Sweep, sondern die freie Kopfzahl im Feed (capacityExchangeService) — sonst
 *     verschwände ein Angebot, das noch eine echte Kraft anzubieten hat.
 *   - Ein Sammelangebot OHNE Mitglieder ist der von Migration 146 ausdrücklich
 *     erlaubte Fall "pauschal N Helfer ohne konkrete Personen". Dort gibt es niemanden,
 *     der gebunden sein könnte — es wird nicht angefasst.
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

/* Dieselbe "im Einsatz"-Regel wie oben, nur an ein POOL-MITGLIED gehängt statt an
 * cp.worker_profile_id. Bewusst derselbe Wortlaut in den Bedingungen: liefe hier eine
 * andere Datums- oder is_active-Regel, wäre derselbe Mensch über zwei Darstellungen
 * unterschiedlich gebunden — und genau daraus entsteht die Doppelbuchung wieder. */
const POOL_FREIE_MITGLIEDER_SQL = `
  (SELECT COUNT(*)
     FROM capacity_post_pool_members m
     JOIN worker_profiles poolwp ON poolwp.id = m.worker_profile_id
    WHERE m.capacity_post_id = cp.id
      AND NOT EXISTS (
        SELECT 1
          FROM worker_assignment_links walm
         WHERE walm.worker_user_id = poolwp.user_id
           AND walm.is_active = TRUE
           AND (walm.end_date IS NULL OR walm.end_date >= CURRENT_DATE)
      ))`;

const POOL_HAT_MITGLIEDER_SQL = `
  EXISTS (SELECT 1 FROM capacity_post_pool_members m0 WHERE m0.capacity_post_id = cp.id)`;

const POOL_RESERVE_SQL = `
  UPDATE capacity_posts cp
     SET status = 'paused', worker_reserved = TRUE, worker_reserved_at = NOW(), updated_at = NOW()
   WHERE cp.status = 'active'
     AND cp.offer_kind IN ('pool_single_skill', 'pool_multi_skill')
     AND ${POOL_HAT_MITGLIEDER_SQL}
     AND ${POOL_FREIE_MITGLIEDER_SQL} = 0`;

const POOL_RELEASE_SQL = `
  UPDATE capacity_posts cp
     SET status = 'active', worker_reserved = FALSE, worker_reserved_at = NULL, updated_at = NOW()
   WHERE cp.worker_reserved = TRUE
     AND cp.status = 'paused'
     AND cp.offer_kind IN ('pool_single_skill', 'pool_multi_skill')
     AND ${POOL_FREIE_MITGLIEDER_SQL} > 0`;

/* Die Eingrenzung auf EINEN Menschen: personengebundene Angebote hängen an
 * cp.worker_profile_id, Sammelangebote an ihrer Mitgliedschaft. Beide Wege sind
 * gleich eng — kein Sweep über die ganze Plattform, wenn ein einzelner Mensch
 * seinen Zustand ändert. */
const POOL_EINGRENZUNG_SQL = `
     AND EXISTS (SELECT 1 FROM capacity_post_pool_members m2
                  WHERE m2.capacity_post_id = cp.id
                    AND m2.worker_profile_id = $1)`;

/**
 * Vollständiger Sweep über alle worker-spezifischen Angebote:
 * (1) aktive Angebote im-Einsatz-Arbeiter pausieren, (2) reservierte Angebote frei
 * gewordener Arbeiter reaktivieren, (3+4) dasselbe für Sammelangebote, deren Mitglieder
 * alle gebunden bzw. wieder frei sind. Idempotent — mehrfach ausführbar ohne Nebenwirkung.
 */
export async function sweepReservations(pool) {
  const reserved = await pool.query(`${RESERVE_SQL} RETURNING cp.id`);
  const released = await pool.query(`${RELEASE_SQL} RETURNING cp.id`);
  const poolsReserved = await pool.query(`${POOL_RESERVE_SQL} RETURNING cp.id`);
  const poolsReleased = await pool.query(`${POOL_RELEASE_SQL} RETURNING cp.id`);
  return {
    reserved: reserved.rowCount || 0,
    released: released.rowCount || 0,
    pools_reserved: poolsReserved.rowCount || 0,
    pools_released: poolsReleased.rowCount || 0
  };
}

/**
 * Synchronisiert nur die Angebote EINES Arbeiters (z. B. direkt nach Hire/Einsatz-Ende
 * als Echtzeit-Trigger). Gleiche Logik wie der Sweep, org-/worker-eingegrenzt — und
 * seit M4c.3 auch über die Sammelangebote, in denen dieser Mensch Mitglied ist.
 */
export async function syncWorkerReservation(pool, workerProfileId) {
  const reserved = await pool.query(`${RESERVE_SQL} AND cp.worker_profile_id = $1 RETURNING cp.id`, [workerProfileId]);
  const released = await pool.query(`${RELEASE_SQL} AND cp.worker_profile_id = $1 RETURNING cp.id`, [workerProfileId]);
  const poolsReserved = await pool.query(`${POOL_RESERVE_SQL}${POOL_EINGRENZUNG_SQL} RETURNING cp.id`, [workerProfileId]);
  const poolsReleased = await pool.query(`${POOL_RELEASE_SQL}${POOL_EINGRENZUNG_SQL} RETURNING cp.id`, [workerProfileId]);
  return {
    reserved: reserved.rowCount || 0,
    released: released.rowCount || 0,
    pools_reserved: poolsReserved.rowCount || 0,
    pools_released: poolsReleased.rowCount || 0
  };
}

export const _FUER_PROBEN = Object.freeze({
  RESERVE_SQL,
  RELEASE_SQL,
  POOL_RESERVE_SQL,
  POOL_RELEASE_SQL,
  POOL_FREIE_MITGLIEDER_SQL,
  POOL_HAT_MITGLIEDER_SQL,
  POOL_EINGRENZUNG_SQL
});
