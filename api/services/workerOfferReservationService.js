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
import { gebundenSql } from "./bindungSql.js";
/* Posten 5 — die EINE Antwort auf "ist dieses Angebot aktiv?". Der Sweep prueft
   den Ausgangszustand seiner beiden Uebergaenge; er schreibt `status` dabei
   ohne `is_active`, was den Widerspruch mit erzeugen konnte. */
import { angebotAktivSql } from "./angebotAktivSql.js";

/*
 * M4c.3b — "GEBUNDEN" HIESS HIER NUR "IM EINSATZ", UND DAS WAR ZU WENIG.
 *
 * Hier stand eine eigene Fassung: ein Arbeiter gilt als im Einsatz, wenn er
 * mindestens einen aktiven `worker_assignment_link` hat. Der Audit vom
 * 2026-09-24 hat gezeigt, was daraus folgt — eine BUCHUNG bindet niemanden:
 *
 *   `accept-deal` sperrt genau die gebuchte Zeile, prueft nur deren freie
 *   Kopfzahl, legt ein angenommenes Angebot an und setzt diese Zeile auf
 *   'reserved'. Eine Einsatz-Verknuepfung entsteht erst, wenn jemand spaeter von
 *   Hand zuweist. Bis dahin blieb derselbe Mensch ueber JEDE andere Darstellung
 *   buchbar — seine uebrigen Einzelangebote, sein Gesamtangebot, jedes
 *   Sammelangebot mit ihm als Mitglied.
 *
 * Die Abnahme von M4c.3 lautet "Kraft buchen → beide Arten weg". Die erste
 * Fassung hat sie NICHT erfuellt, und alle Proben waren gruen: sie prueften die
 * Einsatz-Verknuepfung — also den eigenen Begriff von gebunden — und nicht den
 * des Owners. Dieselbe Klasse wie `merged_von`, nur eine Ebene hoeher.
 *
 * Die Antwort steht jetzt in `bindungSql.js`, einmal, fuer alle drei Stellen,
 * die sie brauchen: Reservierung personengebunden, Reservierung Sammelangebot,
 * freie Kopfzahl im Feed. Datum-bewusst wie vorher: am Tag NACH `end_date`
 * (DB = Europe/Berlin) faellt die Bindung weg, und die Kraft taucht von selbst
 * wieder im Marktplatz auf.
 */
const BUSY_EXISTS_SQL = gebundenSql("cp.worker_profile_id");

const RESERVE_SQL = `
  UPDATE capacity_posts cp
     SET status = 'paused', worker_reserved = TRUE, worker_reserved_at = NOW(), updated_at = NOW()
   WHERE ${angebotAktivSql("cp")}
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

/* Dieselbe Bindungs-Regel wie oben, nur an ein POOL-MITGLIED gehängt statt an
 * cp.worker_profile_id — und zwar buchstäblich dieselbe, aus `bindungSql.js`.
 * Liefe hier eine eigene Fassung, wäre derselbe Mensch über zwei Darstellungen
 * unterschiedlich gebunden — und genau daraus entsteht die Doppelbuchung wieder.
 * Bis M4c.3b war es eine Abschrift, und sie kannte die Buchung nicht. */
const POOL_FREIE_MITGLIEDER_SQL = `
  (SELECT COUNT(*)
     FROM capacity_post_pool_members m
    WHERE m.capacity_post_id = cp.id
      AND NOT ${gebundenSql("m.worker_profile_id")})`;

const POOL_HAT_MITGLIEDER_SQL = `
  EXISTS (SELECT 1 FROM capacity_post_pool_members m0 WHERE m0.capacity_post_id = cp.id)`;

const POOL_RESERVE_SQL = `
  UPDATE capacity_posts cp
     SET status = 'paused', worker_reserved = TRUE, worker_reserved_at = NOW(), updated_at = NOW()
   WHERE ${angebotAktivSql("cp")}
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
