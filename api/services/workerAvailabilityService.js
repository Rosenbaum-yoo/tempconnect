/**
 * Verfuegbarkeit einer Einsatzkraft — herleiten statt fragen.
 *
 * WARUM ES DIESEN DIENST GIBT (Multi-Skill Welle 2)
 * Der Angebotsgenerator aus Welle 3 erzeugt Angebote fuer Kraefte, von denen das System
 * bisher nicht wusste, ab wann sie koennen. `worker_profiles.availability_note` war ein
 * Freitextfeld — daraus laesst sich nicht rechnen. Die naheliegende Antwort waere gewesen,
 * drei Felder ins Aufnahmeformular zu haengen. Die bessere: **nicht fragen, was das System
 * ohnehin weiss.**
 *
 * Drei Quellen, in dieser Rangfolge:
 *   1. AUSDRUECKLICH  — jemand hat es hingeschrieben (`worker_profiles.*`). Gewinnt immer.
 *   2. ABGELEITET     — aus den Einsatzverknuepfungen (`worker_assignment_links`).
 *   3. GEERBT         — Betriebseinstellung (`org_settings.default_radius_km`).
 * Bleibt alles leer: UNBEKANNT. Das ist ein ehrliches Ergebnis, kein Fehler — und die
 * Oberflaeche fragt dann genau diese eine Sache.
 *
 * Jeder Wert kommt mit seiner HERKUNFT zurueck. Das ist kein Beiwerk: nur so kann die
 * Oberflaeche "abgeleitet aus dem Einsatz bis 15.09." anzeigen statt eines leeren Feldes —
 * und nur so sieht ein Disponent, ob "40 Stunden" eine Aussage oder eine Annahme ist.
 *
 * WAS BEWUSST NICHT DRIN IST
 * Ein Schichtmuster. Die Spalten `default_shift_start`/`_end` existieren, sind aber in
 * allen 21 Bestandszeilen leer (Stand 2026-07-26). Eine Herleitung ohne Datenbasis waere
 * geraten, nicht gewusst. Sobald die Felder befuellt werden, gehoert sie hierher.
 */

import { todayDE, dateOnlyDE } from "../utils/dateDE.js";

/** Herkunft eines Wertes. Bewusst sprechend — die Oberflaeche zeigt sie an. */
export const HERKUNFT = Object.freeze({
  AUSDRUECKLICH: "ausdruecklich",
  ABGELEITET: "abgeleitet",
  GEERBT: "geerbt",
  UNBEKANNT: "unbekannt"
});

/** Ohne Betriebseinstellung und ohne Angabe: derselbe Wert wie in `settingsService`. */
const RADIUS_RUECKFALL_KM = 25;

/** Arbeitstage pro Woche fuer die Umrechnung Tagesstunden -> Wochenstunden. */
const ARBEITSTAGE_PRO_WOCHE = 5;

/**
 * Datum ohne Zeitanteil als 'YYYY-MM-DD'.
 *
 * DATE-Spalten kommen dank `db/typeParsers.js` bereits als Zeichenkette an — der
 * String-Zweig ist also der Normalfall. Der Date-Zweig greift nur, wenn hier je ein
 * Zeitstempel statt eines Kalendertags landet; dann muss er ueber dateOnlyDE laufen,
 * weil `toISOString()` lokale Mitternacht in Berlin auf 22:00 des VORTAGS schiebt.
 */
function alsDatum(wert) {
  if (!wert) return null;
  if (typeof wert === "string") return wert.slice(0, 10);
  return dateOnlyDE(wert);
}

/** Ein Tag nach dem uebergebenen Datum. */
function tagDanach(datum) {
  const d = new Date(`${alsDatum(datum)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function heute() {
  return todayDE();
}

/**
 * Loest die Verfuegbarkeit einer Kraft auf.
 *
 * @param {import('pg').Pool} pool
 * @param {string} workerProfileId
 * @returns {Promise<null|{
 *   available_from: string|null, weekly_hours: number|null, radius_km: number|null,
 *   herkunft: { available_from: string, weekly_hours: string, radius_km: string },
 *   belegt_bis: string|null, abwesend_ab: string|null, abwesenheitsgrund: string|null,
 *   offene_fragen: string[]
 * }>}
 */
export async function resolveAvailability(pool, workerProfileId) {
  const { rows: [profil] } = await pool.query(
    `SELECT wp.id, wp.user_id, wp.supplier_org_id,
            wp.available_from, wp.weekly_hours, wp.travel_radius_km,
            os.default_radius_km
       FROM worker_profiles wp
       LEFT JOIN org_settings os ON os.org_id = wp.supplier_org_id
      WHERE wp.id = $1`,
    [workerProfileId]
  );
  if (!profil) return null;

  // Einsatzhistorie: das spaeteste Ende, der uebliche Tagesumfang, gemeldete Abwesenheit.
  // Nur aktive Verknuepfungen — eine geloeste Zuordnung sagt nichts ueber die Zukunft.
  const { rows: [historie] } = await pool.query(
    `SELECT MAX(end_date)                      AS letztes_ende,
            bool_or(end_date IS NULL)          AS unbefristet_gebunden,
            AVG(default_hours_per_day)         AS schnitt_stunden_tag,
            MIN(unavailable_from)              AS abwesend_ab,
            MIN(unavailable_reason)            AS abwesenheitsgrund
       FROM worker_assignment_links
      WHERE worker_user_id = $1 AND is_active = TRUE`,
    [profil.user_id]
  );

  const offeneFragen = [];

  // ── verfuegbar ab ─────────────────────────────────────────────────────────
  let availableFrom = null;
  let herkunftAb = HERKUNFT.UNBEKANNT;

  if (profil.available_from) {
    availableFrom = alsDatum(profil.available_from);
    herkunftAb = HERKUNFT.AUSDRUECKLICH;
  } else if (historie?.unbefristet_gebunden) {
    // Ein laufender Einsatz ohne Enddatum: das System kann es nicht wissen, und Raten
    // waere hier besonders schaedlich (ein falsches "ab morgen" erzeugt Angebote, die
    // die Agentur nicht halten kann).
    herkunftAb = HERKUNFT.UNBEKANNT;
    offeneFragen.push("available_from");
  } else if (historie?.letztes_ende) {
    availableFrom = tagDanach(historie.letztes_ende);
    herkunftAb = HERKUNFT.ABGELEITET;
    // Liegt das Ende in der Vergangenheit, ist die Kraft laengst wieder frei.
    if (availableFrom < heute()) availableFrom = heute();
  } else {
    // Keine Historie = neue Kraft. Das ist genau der Fall, den der Aufnahme-Assistent
    // abdeckt: eine Frage statt einer Annahme.
    offeneFragen.push("available_from");
  }

  // ── Umfang ────────────────────────────────────────────────────────────────
  let weeklyHours = null;
  let herkunftStunden = HERKUNFT.UNBEKANNT;

  if (profil.weekly_hours != null) {
    weeklyHours = Number(profil.weekly_hours);
    herkunftStunden = HERKUNFT.AUSDRUECKLICH;
  } else if (historie?.schnitt_stunden_tag != null) {
    weeklyHours = Math.round(Number(historie.schnitt_stunden_tag) * ARBEITSTAGE_PRO_WOCHE * 100) / 100;
    herkunftStunden = HERKUNFT.ABGELEITET;
  } else {
    offeneFragen.push("weekly_hours");
  }

  // ── Einsatzradius ─────────────────────────────────────────────────────────
  // Der einzige Wert, der nie erfragt werden muss: er gehoert an den Betrieb.
  let radiusKm;
  let herkunftRadius;
  if (profil.travel_radius_km != null) {
    radiusKm = profil.travel_radius_km;
    herkunftRadius = HERKUNFT.AUSDRUECKLICH;
  } else if (profil.default_radius_km != null) {
    radiusKm = profil.default_radius_km;
    herkunftRadius = HERKUNFT.GEERBT;
  } else {
    radiusKm = RADIUS_RUECKFALL_KM;
    herkunftRadius = HERKUNFT.GEERBT;
  }

  return {
    available_from: availableFrom,
    weekly_hours: weeklyHours,
    radius_km: radiusKm,
    herkunft: {
      available_from: herkunftAb,
      weekly_hours: herkunftStunden,
      radius_km: herkunftRadius
    },
    belegt_bis: historie?.unbefristet_gebunden ? null : alsDatum(historie?.letztes_ende),
    abwesend_ab: alsDatum(historie?.abwesend_ab),
    abwesenheitsgrund: historie?.abwesenheitsgrund || null,
    offene_fragen: offeneFragen
  };
}

/**
 * Setzt die ausdruecklichen Angaben. `null` loescht eine Angabe und schaltet damit
 * bewusst wieder auf Herleitung um — deshalb wird zwischen "nicht uebergeben" und
 * "ausdruecklich auf null gesetzt" unterschieden.
 *
 * @param {import('pg').Pool} pool
 * @param {string} workerProfileId
 * @param {{available_from?: string|null, weekly_hours?: number|null, travel_radius_km?: number|null}} angaben
 * @param {string} supplierOrgId Org-Grenze: nur die eigene Kraft
 */
export async function setAvailability(pool, workerProfileId, angaben, supplierOrgId) {
  const felder = [];
  const werte = [];
  let i = 1;

  for (const feld of ["available_from", "weekly_hours", "travel_radius_km"]) {
    if (!Object.prototype.hasOwnProperty.call(angaben, feld)) continue;
    felder.push(`${feld} = $${i++}`);
    werte.push(angaben[feld] === "" ? null : angaben[feld]);
  }
  if (!felder.length) return { unveraendert: true };

  werte.push(workerProfileId, supplierOrgId);
  const { rows } = await pool.query(
    `UPDATE worker_profiles
        SET ${felder.join(", ")}, updated_at = NOW()
      WHERE id = $${i++} AND supplier_org_id = $${i}
      RETURNING id, available_from, weekly_hours, travel_radius_km`,
    werte
  );
  if (!rows[0]) return { error: "NOT_FOUND" };
  return { ok: true, profil: rows[0] };
}
