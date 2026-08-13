/**
 * workerStatusEventService — der Zeitstrahl eines Mitarbeiters (P10 Spur E, Welle E5).
 *
 * Dieser Dienst SCHREIBT NICHT. Das Protokoll entsteht in der Datenbank, durch
 * Trigger an den drei Quelltabellen (Migration 179). Das ist der Kern der Zusage
 * aus Gate E5: ein Zustandswechsel ohne Protokolleintrag ist nicht moeglich —
 * auch nicht ueber eine Route, die es spaeter einmal geben wird, und auch nicht
 * ueber ein UPDATE per psql.
 *
 * Eine Schreibfunktion an dieser Stelle waere deshalb aktiv schaedlich: sie
 * suggerierte, dass es der richtige Weg sei, und der naechste Entwickler wuerde
 * sie an einer Stelle vergessen. Hier wird nur gelesen und aufgeraeumt.
 */

/** Die fachlichen Zustaende laut CHECK in Migration 179 — ohne `endet_bald`. */
export const STATUS_EVENT_ZUSTAENDE = Object.freeze([
  "verfuegbar", "im_einsatz", "montage", "abwesend", "inaktiv"
]);

/** Was eine Aenderung ausgeloest hat. */
export const STATUS_EVENT_AUSLOESER = Object.freeze(["abwesenheit", "einsatz", "profil"]);

/** Gate E5 verlangt die letzten 90 Tage; die Aufbewahrung reicht 24 Monate. */
export const TIMELINE_STANDARD_TAGE = 90;
const TIMELINE_MAX_TAGE = 730;

/**
 * Zeitstrahl eines Mitarbeiters. Strikt org-gebunden — die Mandantengrenze steht
 * im Statement, nicht als nachgelagerter Vergleich.
 *
 * @returns {{available:boolean, items:Array, worker:object|null, scope:object}}
 */
export async function getStatusTimeline(pool, supplierOrgId, workerProfileId, { tage, limit } = {}) {
  const fenster = Math.min(TIMELINE_MAX_TAGE, Math.max(1, Number(tage) || TIMELINE_STANDARD_TAGE));
  const grenze = Math.min(500, Math.max(1, Number(limit) || 200));

  if (!supplierOrgId || !workerProfileId) {
    return { available: false, items: [], worker: null, scope: { tage: fenster } };
  }

  /* Der Mensch selbst kommt aus derselben org-gebundenen Abfrage — sonst
   * koennte ein fremder Betrieb ueber eine Profil-ID zumindest erfahren, dass es
   * sie gibt (leere Liste statt 404 ist auch eine Auskunft). */
  const { rows: profil } = await pool.query(
    `SELECT wp.id, wp.first_name, wp.last_name, wp.personnel_number, wp.is_active
       FROM worker_profiles wp
      WHERE wp.id = $2 AND wp.supplier_org_id = $1`,
    [supplierOrgId, workerProfileId]
  );
  if (!profil[0]) {
    const { rows: fremd } = await pool.query(
      `SELECT supplier_org_id FROM worker_profiles WHERE id = $1`,
      [workerProfileId]
    );
    if (fremd[0]) return { error: "ORG_BOUNDARY_VIOLATION", status: 403 };
    return { error: "NOT_FOUND", status: 404 };
  }

  const { rows } = await pool.query(
    `SELECT e.id, e.von_zustand, e.nach_zustand, e.ausgeloest_durch,
            e.bezug_typ, e.bezug_id, e.zeitpunkt
       FROM worker_status_events e
      WHERE e.worker_profile_id = $2
        AND e.supplier_org_id = $1
        AND e.zeitpunkt >= NOW() - ($3 || ' days')::interval
      ORDER BY e.zeitpunkt DESC, e.id DESC
      LIMIT $4`,
    [supplierOrgId, workerProfileId, String(fenster), grenze]
  );

  return {
    available: true,
    worker: profil[0],
    items: rows,
    total: rows.length,
    scope: { supplier_org_id: supplierOrgId, worker_profile_id: workerProfileId, tage: fenster, limit: grenze },
    generated_at: new Date().toISOString()
  };
}

/**
 * Aufbewahrung durchsetzen (24 Monate, Owner-Entscheidung 2026-08-13).
 *
 * Die Frist selbst steht in der Datenbank (`worker_status_events_aufraeumen`),
 * nicht hier — sonst gaebe es zwei Zahlen, und die zweite waere irgendwann die
 * falsche. Dieser Aufruf ist nur der Ausloeser aus dem Taktgeber.
 *
 * @returns {{geloescht:number}}
 */
export async function aufbewahrungDurchsetzen(pool) {
  const { rows } = await pool.query(`SELECT worker_status_events_aufraeumen() AS geloescht`);
  return { geloescht: Number(rows[0]?.geloescht) || 0 };
}
