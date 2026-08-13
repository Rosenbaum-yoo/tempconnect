/**
 * workerAbsenceService — Abwesenheit gehoert zum Menschen (P10 Spur E, Welle E2).
 *
 * Gegenstueck zu den Feldern auf `worker_assignment_links`: die beantworten
 * "diese Kraft faellt fuer DIESEN Auftrag aus". Dieser Service beantwortet
 * "dieser Mensch ist von-bis nicht da" — auch ohne laufenden Einsatz, und mit
 * einem Grund, den man auswerten kann statt ihn zu lesen.
 *
 * Zwei Regeln, die hier nicht verhandelbar sind:
 *  1. Die Mandantengrenze steht IM Statement (INSERT ... SELECT / UPDATE ... WHERE),
 *     nie als nachgelagerter Vergleich, den ein spaeterer Aufrufer vergessen kann.
 *  2. Die Ueberlappungssperre kommt aus der Datenbank (EXCLUDE, Mig 177).
 *     Ein Vorab-SELECT waere ein Wettlauf: zwei gleichzeitige Krankmeldungen
 *     laufen beide durch die Pruefung und beide in den INSERT.
 */

import { todayDE, dateOnlyDE } from "../utils/dateDE.js";

/** Laut CHECK in Migration 177. Reihenfolge = Anzeige-Reihenfolge in der Oberflaeche. */
export const ABSENCE_ARTEN = Object.freeze(["krank", "urlaub", "termin", "sonstiges"]);

/** Postgres: Verletzung einer EXCLUDE-Bedingung. */
const PG_EXCLUSION_VIOLATION = "23P01";

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Eingabe auf ein Kalenderdatum bringen. Strings muessen bereits YYYY-MM-DD sein
 * (die Zod-Schicht in der Route setzt das durch); Date-Objekte laufen ueber die
 * DACH-Utility, weil ein roher UTC-Schnitt in Europe/Berlin ganztaegig den
 * falschen Tag liefert (Wellen F1/F2, Waechter api/test/kalendertagDE.test.js).
 */
function alsDatum(wert) {
  if (wert == null || wert === "") return null;
  if (typeof wert === "string") return DATE_RX.test(wert) ? wert : null;
  return dateOnlyDE(wert);
}

/**
 * Unterscheidet "gibt es nicht" von "gehoert einem anderen Betrieb".
 * Nur auf dem Fehlerpfad — der Normalfall kostet keine zusaetzliche Abfrage.
 */
async function warumNichtGefunden(pool, supplierOrgId, workerProfileId) {
  const { rows } = await pool.query(
    `SELECT supplier_org_id FROM worker_profiles WHERE id = $1`,
    [workerProfileId]
  );
  if (!rows[0]) return { error: "NOT_FOUND", status: 404 };
  if (rows[0].supplier_org_id !== supplierOrgId) return { error: "ORG_BOUNDARY_VIOLATION", status: 403 };
  return { error: "NOT_FOUND", status: 404 };
}

/**
 * Abwesenheit erfassen.
 *
 * @returns {{absence}|{error:string,status:number,conflict?:object}}
 */
export async function createAbsence(pool, supplierOrgId, {
  workerProfileId, art, von, bis = null, notiz = null, erfasstVon = null
} = {}) {
  if (!supplierOrgId || !workerProfileId) return { error: "MISSING_PARAMS", status: 400 };
  if (!ABSENCE_ARTEN.includes(art)) return { error: "INVALID_ART", status: 400 };

  const vonDatum = alsDatum(von);
  const bisDatum = alsDatum(bis);
  if (!vonDatum) return { error: "INVALID_DATE", status: 400 };
  if (bis != null && bis !== "" && !bisDatum) return { error: "INVALID_DATE", status: 400 };
  // Der CHECK in der DB faengt das ebenfalls — hier nur, um dem Nutzer eine
  // verstaendliche Meldung statt eines Constraint-Namens zu geben.
  if (bisDatum && bisDatum < vonDatum) return { error: "INVALID_RANGE", status: 400 };

  const text = (s) => {
    const v = String(s == null ? "" : s).trim();
    return v ? v.slice(0, 2000) : null;
  };

  try {
    /* Mandantengrenze IM Statement: die Zeile entsteht nur, wenn das Profil
     * wirklich zu diesem Betrieb gehoert. supplier_org_id wird aus dem Profil
     * uebernommen, nicht aus der Anfrage — so kann sie gar nicht falsch sein. */
    const { rows } = await pool.query(
      `INSERT INTO worker_absences
         (worker_profile_id, supplier_org_id, art, von, bis, notiz, erfasst_von)
       SELECT wp.id, wp.supplier_org_id, $3, $4::date, $5::date, $6, $7
         FROM worker_profiles wp
        WHERE wp.id = $2 AND wp.supplier_org_id = $1
       RETURNING *`,
      [supplierOrgId, workerProfileId, art, vonDatum, bisDatum, text(notiz), erfasstVon]
    );
    if (!rows[0]) return await warumNichtGefunden(pool, supplierOrgId, workerProfileId);
    return { absence: rows[0] };
  } catch (err) {
    if (err && err.code === PG_EXCLUSION_VIOLATION) {
      /* Der Nutzer soll erfahren, WELCHE Abwesenheit im Weg steht — sonst
       * probiert er Daten durch, bis eines passt. */
      const konflikt = await findeUeberlappung(pool, supplierOrgId, workerProfileId, vonDatum, bisDatum);
      return { error: "ABSENCE_OVERLAP", status: 409, conflict: konflikt || null };
    }
    throw err;
  }
}

/** Die aktive Abwesenheit, die sich mit [von, bis] schneidet (fuer die Konfliktmeldung). */
async function findeUeberlappung(pool, supplierOrgId, workerProfileId, von, bis) {
  const { rows } = await pool.query(
    `SELECT id, art, von, bis, notiz
       FROM worker_absences
      WHERE worker_profile_id = $2
        AND supplier_org_id = $1
        AND aufgehoben_am IS NULL
        AND daterange(von, bis, '[]') && daterange($3::date, $4::date, '[]')
      ORDER BY von ASC
      LIMIT 1`,
    [supplierOrgId, workerProfileId, von, bis]
  );
  return rows[0] || null;
}

/**
 * Abwesenheiten eines Betriebs. Standard: nur gueltige (nicht aufgehobene).
 *
 * @param {object} filters
 *   workerProfileId  auf einen Menschen einschraenken
 *   aktivAm          'YYYY-MM-DD' — nur Zeitraeume, die diesen Tag enthalten
 *                    (Default beim Schalter `nurAktuelle`: heute in Europe/Berlin)
 *   ab / bis         Zeitfenster, das sich mit dem Zeitraum schneidet
 *   nurAktuelle      Kurzform fuer aktivAm = heute
 *   mitAufgehobenen  auch zurueckgenommene Eintraege liefern (Akte/Zeitstrahl)
 */
export async function listAbsences(pool, supplierOrgId, filters = {}) {
  if (!supplierOrgId) return { available: false, items: [], total: 0 };

  const params = [supplierOrgId];
  const wo = ["a.supplier_org_id = $1"];

  if (!filters.mitAufgehobenen) wo.push("a.aufgehoben_am IS NULL");

  if (filters.workerProfileId) {
    params.push(filters.workerProfileId);
    wo.push(`a.worker_profile_id = $${params.length}`);
  }

  const aktivAm = filters.aktivAm || (filters.nurAktuelle ? todayDE() : null);
  if (aktivAm) {
    params.push(aktivAm);
    wo.push(`a.von <= $${params.length}::date AND (a.bis IS NULL OR a.bis >= $${params.length}::date)`);
  }

  if (filters.ab) {
    params.push(filters.ab);
    wo.push(`(a.bis IS NULL OR a.bis >= $${params.length}::date)`);
  }
  if (filters.bis) {
    params.push(filters.bis);
    wo.push(`a.von <= $${params.length}::date`);
  }
  if (filters.art && ABSENCE_ARTEN.includes(filters.art)) {
    params.push(filters.art);
    wo.push(`a.art = $${params.length}`);
  }

  params.push(Math.min(500, Math.max(1, Number(filters.limit) || 200)));

  const { rows } = await pool.query(
    `SELECT a.id, a.worker_profile_id, a.art, a.von, a.bis, a.notiz,
            a.erfasst_von, a.erfasst_am, a.aufgehoben_am, a.aufgehoben_von, a.aufhebung_grund,
            wp.first_name, wp.last_name, wp.personnel_number, wp.user_id AS worker_user_id
       FROM worker_absences a
       JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      WHERE ${wo.join(" AND ")}
      ORDER BY a.von DESC, a.erfasst_am DESC
      LIMIT $${params.length}`,
    params
  );

  return {
    available: true,
    items: rows,
    total: rows.length,
    scope: { supplier_org_id: supplierOrgId, aktiv_am: aktivAm || null },
    generated_at: new Date().toISOString()
  };
}

/**
 * Abwesenheit zuruecknehmen (nicht loeschen — sie bleibt in der Akte).
 * Org-Boundary im UPDATE selbst, damit ein fremder Betrieb sie nicht per ID aufhebt.
 *
 * @returns {{absence}|{error:string,status:number}}
 */
export async function cancelAbsence(pool, supplierOrgId, absenceId, { userId = null, grund = null } = {}) {
  if (!supplierOrgId || !absenceId) return { error: "MISSING_PARAMS", status: 400 };

  const text = String(grund == null ? "" : grund).trim();
  const { rows } = await pool.query(
    `UPDATE worker_absences
        SET aufgehoben_am = NOW(), aufgehoben_von = $3, aufhebung_grund = $4
      WHERE id = $2 AND supplier_org_id = $1 AND aufgehoben_am IS NULL
      RETURNING *`,
    [supplierOrgId, absenceId, userId, text ? text.slice(0, 1000) : null]
  );
  if (rows[0]) return { absence: rows[0] };

  /* Nichts getroffen: gibt es die Zeile nicht, gehoert sie einem anderen Betrieb,
   * oder war sie bereits aufgehoben? Der Unterschied ist fuer den Nutzer wichtig
   * ("schon zurueckgenommen" ist kein Fehler, sondern eine Auskunft). */
  const { rows: vorhanden } = await pool.query(
    `SELECT supplier_org_id, aufgehoben_am FROM worker_absences WHERE id = $1`,
    [absenceId]
  );
  const z = vorhanden[0];
  if (!z) return { error: "NOT_FOUND", status: 404 };
  if (z.supplier_org_id !== supplierOrgId) return { error: "ORG_BOUNDARY_VIOLATION", status: 403 };
  return { error: "ALREADY_CANCELLED", status: 409 };
}
