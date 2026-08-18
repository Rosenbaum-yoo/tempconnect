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
import { dispatch, findOrgMembersWithPermission } from "./notificationMatrix.js";

/** Laut CHECK in Migration 177. Reihenfolge = Anzeige-Reihenfolge in der Oberflaeche. */
export const ABSENCE_ARTEN = Object.freeze(["krank", "urlaub", "termin", "sonstiges"]);

/* Wer gemeldet hat und ob die Meldung schon gilt — Mig 181, Welle G1.
 * Die Listen stehen hier UND als CHECK in der Datenbank. Das ist Absicht: der
 * Dienst gibt eine verstaendliche Meldung, die Datenbank haelt die Zusage auch
 * dann, wenn jemand an ihm vorbeischreibt. */
export const ABSENCE_QUELLEN = Object.freeze(["disponent", "mitarbeiter"]);
export const ABSENCE_ZUSTAENDE = Object.freeze(["wirksam", "beantragt", "abgelehnt"]);

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
  workerProfileId, art, von, bis = null, notiz = null, erfasstVon = null,
  quelle = "disponent", zustand = "wirksam", beschreibung = null
} = {}) {
  if (!supplierOrgId || !workerProfileId) return { error: "MISSING_PARAMS", status: 400 };
  if (!ABSENCE_ARTEN.includes(art)) return { error: "INVALID_ART", status: 400 };
  if (!ABSENCE_QUELLEN.includes(quelle)) return { error: "INVALID_QUELLE", status: 400 };
  if (!ABSENCE_ZUSTAENDE.includes(zustand)) return { error: "INVALID_ZUSTAND", status: 400 };

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
         (worker_profile_id, supplier_org_id, art, von, bis, notiz, erfasst_von,
          quelle, zustand, beschreibung)
       SELECT wp.id, wp.supplier_org_id, $3, $4::date, $5::date, $6, $7, $8, $9, $10
         FROM worker_profiles wp
        WHERE wp.id = $2 AND wp.supplier_org_id = $1
       RETURNING *`,
      [supplierOrgId, workerProfileId, art, vonDatum, bisDatum, text(notiz), erfasstVon,
       quelle, zustand, text(beschreibung)]
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
    /* `zustand` und `quelle` MUESSEN mit heraus. Ohne `zustand` liefert
     * `fuerKunde()` auf einer Zeile aus dieser Liste IMMER `faellt_aus: false`
     * — still, ohne Fehler, weil `undefined === "wirksam"` schlicht falsch ist.
     * Ein Aufrufer, der die Kundenmeldung aus einer Liste speist statt aus dem
     * RETURNING des INSERT, wuerde damit jeden Ausfall als "kein Ausfall"
     * melden. Genau die Sorte Luecke, die niemand sieht. (Welle G4b) */
    `SELECT a.id, a.worker_profile_id, a.art, a.von, a.bis, a.notiz,
            a.zustand, a.quelle,
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

/* ═══════════════════════════════════════════════════════════════════════════
 *  Welle G2 — die Selbstmeldung des Mitarbeiters
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Was kostet diese Meldung? — die Einsaetze, die dadurch offen werden.
 *
 * WARUM DAS EIN EIGENER LESEPFAD IST UND NICHT NUR EINE ANZEIGE
 * Der dritte Schritt der Meldung zeigt dem Menschen NAMENTLICH, welche Einsaetze
 * er freigibt (G-E5). Diese Liste muss dieselbe sein, die danach wirklich
 * betroffen ist — sonst ist die Huerde eine Behauptung. Deshalb EINE Abfrage,
 * die Vorschau und spaetere Auswertung gemeinsam benutzen.
 *
 * EINE FEINHEIT DES SCHEMAS: Abwesenheiten haengen am PROFIL, Einsaetze am
 * NUTZERKONTO (`worker_assignment_links.worker_user_id`). Ein Profil ohne Konto
 * — bei Personalnummer-Profilen der Normalfall — hat also keine Einsaetze. Das
 * ist kein Fehler, sondern die ehrliche Antwort: leere Liste.
 */
export async function folgenVorschau(pool, supplierOrgId, { workerProfileId, von, bis = null } = {}) {
  if (!supplierOrgId || !workerProfileId) return { error: "MISSING_PARAMS", status: 400 };

  const vonDatum = alsDatum(von);
  if (!vonDatum) return { error: "INVALID_DATE", status: 400 };
  const bisDatum = alsDatum(bis);

  const { rows } = await pool.query(
    /* `a.org_id` ist der KUNDE (Besteller), `a.supplier_org_id` der Lieferant —
     * belegt an der Erzeugerstelle (routes/requests.js: org_id = requesterOrg).
     *
     * WARUM NICHT `wal.org_id`, obwohl die Spalte NOT NULL ist und griffbereit
     * waere: Sie wird in routes/workers.js ungeprueft aus dem Anfrage-Rumpf
     * uebernommen (`orgId: parsed.data.org_id`) und nie gegen den Einsatz
     * abgeglichen. Wer sie als Empfaengerkreis benutzt, laesst den Aufrufer
     * bestimmen, welche fremde Firma eine Ausfallmeldung bekommt.
     * Verfuegbarkeit schlaegt hier nicht Vertrauenswuerdigkeit. (Welle G4b) */
    `SELECT a.id            AS assignment_id,
            a.status        AS assignment_status,
            a.org_id        AS kunde_org_id,
            wal.org_id      AS verknuepfung_org_id,
            o.name          AS kunde,
            wal.start_date  AS beginnt,
            wal.end_date    AS endet,
            wal.is_montage  AS montage
       FROM worker_profiles wp
       JOIN worker_assignment_links wal
         ON wal.worker_user_id = wp.user_id
        AND wal.supplier_org_id = $1
        AND wal.is_active = TRUE
       JOIN assignments a ON a.id = wal.assignment_id
       LEFT JOIN organizations o ON o.id = a.org_id
      WHERE wp.id = $2
        AND wp.supplier_org_id = $1
        AND daterange(wal.start_date, wal.end_date, '[]')
            && daterange($3::date, $4::date, '[]')
      ORDER BY wal.start_date ASC`,
    [supplierOrgId, workerProfileId, vonDatum, bisDatum]
  );

  return { einsaetze: rows, anzahl: rows.length };
}

/**
 * Die Meldung des Menschen ueber sich selbst.
 *
 * ZWEI DINGE, DIE HIER ANDERS SIND ALS BEIM DISPONENTEN:
 *   1. `quelle` ist fest 'mitarbeiter'. Sie kommt NICHT aus der Anfrage — wer
 *      diesen Weg benutzt, meldet sich selbst, und das laesst sich nicht
 *      umdeklarieren.
 *   2. Der Zustand haengt am Schalter der Firma (G-E2): standardmaessig sofort
 *      wirksam, bei eingeschalteter Freigabepflicht zunaechst beantragt. Der
 *      Schalter wird HIER gelesen und in die Zeile geschrieben — nicht spaeter
 *      beim Anzeigen ausgewertet. Sonst wuerde ein spaeteres Umlegen laengst
 *      disponierte Meldungen umwerten.
 */
export async function createSelbstmeldung(pool, supplierOrgId, {
  workerProfileId, art, von, bis = null, beschreibung = null, erfasstVon = null
} = {}) {
  if (!supplierOrgId || !workerProfileId) return { error: "MISSING_PARAMS", status: 400 };

  const { rows } = await pool.query(
    `SELECT COALESCE(abwesenheit_selbstmeldung_freigabepflicht, FALSE) AS pflicht
       FROM org_settings WHERE org_id = $1`,
    [supplierOrgId]
  );
  // Ohne Zeile in org_settings gilt der Standard (G-E1): sofort wirksam.
  const freigabepflicht = rows[0] ? rows[0].pflicht === true : false;

  return await createAbsence(pool, supplierOrgId, {
    workerProfileId,
    art,
    von,
    bis,
    beschreibung,
    erfasstVon,
    quelle: "mitarbeiter",
    zustand: freigabepflicht ? "beantragt" : "wirksam",
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Welle G2b — die Zeitsperre (G-E6)
 *
 *  Der Weiter-Knopf ist je Schritt eine Minute gesperrt. DIESE REGEL LIEGT
 *  HINTEN. Eine per JavaScript gesperrte Schaltflaeche ist ueber die
 *  Entwicklerkonsole in zehn Sekunden frei; der Browser zeigt den Zaehler nur an.
 *
 *  Warum eine REINE Funktion und kein Middleware-Geflecht: So laesst sich die
 *  Regel ohne Sitzung, ohne Datenbank und ohne Uhr pruefen — die Zeit kommt als
 *  Parameter herein. Ein Test, der eine Sperre pruefen will, darf nicht warten
 *  muessen; sonst wird er langsam, dann flakig, dann abgeschaltet.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Sekunden Sperre je Schritt. Konfigurierbar, weil die Dauer der erste
 *  Stellhebel ist, wenn Meldungen ausbleiben oder telefonisch vorbeilaufen. */
export const SPERRE_SEKUNDEN_JE_SCHRITT = Number(process.env.ABWESENHEIT_SPERRE_SEKUNDEN || 60);

/** Anzahl der Schritte des Ablaufs (Art -> Zeitraum/Grund -> Folgen bestaetigen). */
export const SPERRE_SCHRITTE = 3;

/**
 * Darf jetzt abgeschickt werden?
 *
 * @param {{begonnenMs:number}|null} vorgang  was die Sitzung ueber den Vorgang weiss
 * @param {number} jetztMs                    Zeitpunkt der Anfrage
 * @param {{sekundenJeSchritt?:number, schritte?:number}} konfig
 * @returns {{erlaubt:true} | {erlaubt:false, grund:string, status:number, verbleibendSekunden:number}}
 */
export function pruefeZeitsperre(vorgang, jetztMs, konfig = {}) {
  const jeSchritt = konfig.sekundenJeSchritt ?? SPERRE_SEKUNDEN_JE_SCHRITT;
  const schritte = konfig.schritte ?? SPERRE_SCHRITTE;
  const noetigMs = jeSchritt * schritte * 1000;

  /* Kein Vorgang = der Ablauf wurde uebersprungen. Das ist genau der Fall, den
   * die Sperre treffen soll: wer die Oberflaeche umgeht und direkt abschickt,
   * hat nie einen eroeffnet. */
  if (!vorgang || typeof vorgang.begonnenMs !== "number") {
    return {
      erlaubt: false,
      grund: "VORGANG_NICHT_EROEFFNET",
      status: 428,
      verbleibendSekunden: Math.ceil(noetigMs / 1000),
    };
  }

  /* Eine Uhr, die in der Zukunft startet, ist kein Vorgang, sondern ein Versuch.
   * (Passiert auch harmlos bei Zeitumstellung — behandelt wird beides gleich.) */
  const vergangenMs = jetztMs - vorgang.begonnenMs;
  if (vergangenMs < 0) {
    return { erlaubt: false, grund: "ZEITSPERRE", status: 429, verbleibendSekunden: Math.ceil(noetigMs / 1000) };
  }

  if (vergangenMs < noetigMs) {
    return {
      erlaubt: false,
      grund: "ZEITSPERRE",
      status: 429,
      verbleibendSekunden: Math.ceil((noetigMs - vergangenMs) / 1000),
    };
  }

  return { erlaubt: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Welle G2c — die Beschreibung, die das Buero lesen soll (G-E8)
 *
 *  Owner-Vorgabe: mindestens 30 Woerter, damit der Disponent beim Betreten des
 *  Bueros versteht, was los ist, statt erst telefonieren zu muessen.
 *
 *  UMGESETZT UEBER VIER FRAGEN, NICHT UEBER EIN LEERES TEXTFELD. Eine
 *  Mindest-Wortzahl misst Aufwand, nicht Inhalt: erzwungene 30 Woerter erzeugen
 *  Fuellsel ("ich kann heute leider nicht kommen, weil ich krank bin, deshalb
 *  kann ich heute nicht kommen"), und der Disponent liest anschliessend mehr und
 *  weiss weniger. Vier kurze Antworten sagen ihm mehr — und ergeben zusammen
 *  ohnehin die Laenge.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const BESCHREIBUNG_MINDESTWOERTER = Number(process.env.ABWESENHEIT_MINDESTWOERTER || 30);

/** Die vier Fragen — Reihenfolge ist die der Oberflaeche. */
export const BESCHREIBUNG_FRAGEN = Object.freeze([
  { schluessel: "seit_wann", frage: "Seit wann?" },
  { schluessel: "voraussichtlich_bis", frage: "Voraussichtlich bis wann?" },
  { schluessel: "arzt", frage: "Arzt aufgesucht oder Krankschreibung zu erwarten?" },
  { schluessel: "eingeschraenkt_einsetzbar", frage: "Waerst du eingeschraenkt einsetzbar?" },
]);

/** Woerter zaehlen — was zwischen Leerzeichen steht und mindestens einen
 *  Buchstaben oder eine Ziffer traegt. Reine Satzzeichen zaehlen nicht, sonst
 *  waere "... ... ..." eine Antwort. */
function woerter(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Reicht die Beschreibung?
 *
 * @param {Record<string,string>} antworten  je Frage eine Antwort, plus optional `freitext`
 * @returns {{ausreichend:true, text:string, woerter:number}
 *          |{ausreichend:false, status:number, error:string, woerter:number, fehlend:number}}
 */
export function pruefeBeschreibung(antworten = {}, konfig = {}) {
  const mindestens = konfig.mindestwoerter ?? BESCHREIBUNG_MINDESTWOERTER;

  const teile = [];
  for (const { schluessel, frage } of BESCHREIBUNG_FRAGEN) {
    const antwort = String(antworten[schluessel] ?? "").trim();
    if (antwort) teile.push(`${frage} ${antwort}`);
  }
  const freitext = String(antworten.freitext ?? "").trim();
  if (freitext) teile.push(freitext);

  /* Gezaehlt werden nur die ANTWORTEN. Die Fragen stehen im zusammengesetzten
   * Text, damit das Buero ihn am Stueck lesen kann — sie duerfen aber nicht zur
   * Laenge beitragen, sonst waeren vier leere Antworten schon fast genug. */
  const anzahl =
    BESCHREIBUNG_FRAGEN.reduce((n, { schluessel }) => n + woerter(antworten[schluessel]), 0) + woerter(freitext);

  if (anzahl < mindestens) {
    return {
      ausreichend: false,
      status: 400,
      error: "BESCHREIBUNG_ZU_KURZ",
      woerter: anzahl,
      fehlend: mindestens - anzahl,
    };
  }

  return { ausreichend: true, text: teile.join("\n"), woerter: anzahl };
}

/**
 * Was der KUNDE erfahren darf — und nur das (G-E7).
 *
 * Das Einsatzunternehmen ist ein Dritter. Es braucht fuer seine Planung, DASS
 * jemand ausfaellt und bis wann voraussichtlich. Es braucht NICHT die Art
 * ("krank" ist ein Gesundheitsdatum, Art. 9 DSGVO), nicht die Notiz und erst
 * recht nicht die 30-Woerter-Beschreibung.
 *
 * WARUM ALS EIGENE FUNKTION UND NICHT ALS SORGFALT AN JEDER STELLE: Sorgfalt
 * verteilt sich, Funktionen nicht. Wer dem Kunden etwas schickt, nimmt diese
 * Abbildung — dann kann die Beschreibung gar nicht erst mitrutschen, auch nicht
 * beim naechsten Feld, das jemand ergaenzt.
 */
export function fuerKunde(absence) {
  if (!absence) return null;
  return {
    id: absence.id,
    von: absence.von,
    bis: absence.bis,
    faellt_aus: absence.zustand === "wirksam" && !absence.aufgehoben_am,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Welle G3 — die Verspaetungsmeldung: der leichte Weg
 *
 *  Ein Tippen, Minutenangabe, fertig. KEINE Zeitsperre, KEINE 30 Woerter, KEINE
 *  Abwesenheit — der Mensch kommt ja.
 *
 *  Das ist keine Bequemlichkeit, sondern die Bedingung dafuer, dass die schwere
 *  Tuer schwer sein DARF. Gibt es nur einen Weg, wird er fuer alles benutzt.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Ab hier ist es keine Verspaetung mehr, sondern eine Abwesenheit. */
export const VERSPAETUNG_MAX_MINUTEN = 240;

/**
 * Ist das noch eine Verspaetung?
 *
 * Die Grenze ist der eigentliche Entwurf: ohne sie waere der leichte Weg genau
 * die Umgehung, gegen die er gebaut wurde — "ich verspaete mich um 480 Minuten"
 * waere ein freier Tag ohne Begruendung, ohne Wartezeit, ohne Folgenhinweis.
 *
 * Die Ablehnung VERWEIST auf den anderen Weg, statt nur nein zu sagen. Wer hier
 * scheitert, hat ein echtes Anliegen; ihn ohne Hinweis stehen zu lassen treibt
 * ihn ans Telefon — und dann steht die Meldung wieder ausserhalb des Systems.
 */
export function pruefeVerspaetung(minuten, konfig = {}) {
  const max = konfig.maxMinuten ?? VERSPAETUNG_MAX_MINUTEN;
  const zahl = Number(minuten);

  if (!Number.isInteger(zahl) || zahl < 1) {
    return { gueltig: false, status: 400, error: "MINUTEN_UNGUELTIG", max };
  }
  if (zahl > max) {
    return {
      gueltig: false,
      status: 400,
      error: "KEINE_VERSPAETUNG_MEHR",
      max,
      hinweis: "abwesenheit_melden",
    };
  }
  return { gueltig: true, minuten: zahl };
}

/**
 * Die Verspaetung festhalten. Beruehrt `worker_absences` NICHT — das ist die
 * Zusage dieser Welle, und ein Test prueft sie, indem er danach nachzaehlt.
 *
 * Zweimal am selben Tag ist eine KORREKTUR, kein zweiter Vorgang: der spaetere
 * Wert gilt. Sonst sammeln sich Dubletten und das Buero weiss nicht, welche
 * Zahl stimmt.
 */
export async function meldeVerspaetung(pool, supplierOrgId, {
  workerProfileId, minuten, giltFuer = null, notiz = null, gemeldetVon = null
} = {}) {
  if (!supplierOrgId || !workerProfileId) return { error: "MISSING_PARAMS", status: 400 };

  const geprueft = pruefeVerspaetung(minuten);
  if (!geprueft.gueltig) return geprueft;

  const tag = giltFuer ? alsDatum(giltFuer) : todayDE();
  if (!tag) return { error: "INVALID_DATE", status: 400 };

  const { rows } = await pool.query(
    /* Mandantengrenze IM Statement, wie bei der Abwesenheit: die Zeile entsteht
     * nur, wenn das Profil wirklich zu diesem Betrieb gehoert. */
    `INSERT INTO worker_delays (worker_profile_id, supplier_org_id, gilt_fuer, minuten, notiz, gemeldet_von)
     SELECT wp.id, wp.supplier_org_id, $3::date, $4, $5, $6
       FROM worker_profiles wp
      WHERE wp.id = $2 AND wp.supplier_org_id = $1
     ON CONFLICT (worker_profile_id, gilt_fuer)
     DO UPDATE SET minuten = EXCLUDED.minuten,
                   notiz = EXCLUDED.notiz,
                   gemeldet_von = EXCLUDED.gemeldet_von,
                   gemeldet_am = NOW()
     RETURNING *`,
    [supplierOrgId, workerProfileId, tag, geprueft.minuten, notiz ? String(notiz).slice(0, 1000) : null, gemeldetVon]
  );

  if (!rows[0]) return { error: "WORKER_NOT_IN_ORG", status: 404 };
  return { verspaetung: rows[0] };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Welle G4 — die Meldung erreicht das Buero
 *
 *  Die Leitfrage des ganzen Abschnitts G lautet nicht "wie bauen wir ein
 *  Formular", sondern: WIE ERFAEHRT DAS BUERO RECHTZEITIG GENUG, UM NOCH
 *  UMDISPONIEREN ZU KOENNEN. G1 bis G3 haben den Weg gebaut, auf dem sich
 *  jemand meldet. Bis hierher endete die Meldung in einer Tabelle.
 *
 *  DREI ENTSCHEIDUNGEN, DIE HIER GETROFFEN SIND:
 *
 *  1. EMPFAENGER SIND DIE, DIE HANDELN DUERFEN — nicht eine Rollenliste an
 *     dieser Stelle. `worker.manage` ist die Berechtigung zum Umdisponieren;
 *     wer sie hat, bekommt die Meldung. Aendert jemand die Rechte-Matrix,
 *     wandert der Empfaengerkreis automatisch mit. Eine hier abgeschriebene
 *     Liste ['owner','admin','dispatcher'] waere schon beim naechsten neuen
 *     Rollennamen still falsch.
 *
 *  2. DER LINK FUEHRT ZUM MENSCHEN, NICHT AUF EINE UEBERSICHT. Das ist das
 *     Gate dieser Welle. `?person=<profil>#live-abwesend` oeffnet die
 *     Live-Belegschaft, gefiltert auf die Abwesenden, mit der betroffenen
 *     Zeile hervorgehoben — und in dieser Zeile stehen Kunde, Einsatz und
 *     Enddatum. Ein Verweis auf die Startseite der Belegschaft haette den
 *     Disponenten die Suche ein zweites Mal machen lassen.
 *
 *  3. DIE 30-WOERTER-BESCHREIBUNG STEHT NICHT IM NACHRICHTENTEXT. Sie ist der
 *     Grund, warum es die vier Fragen gibt (G-E8) — aber der Text dieser
 *     Benachrichtigung laeuft ueber Kanaele, die ihn nicht brauchen: die
 *     Vorschau auf einem Sperrbildschirm, spaeter Slack/Teams ueber
 *     `dispatchToIntegrations`. Was in die Nachricht gehoert, ist das, was
 *     zum UMDISPONIEREN noetig ist: wer, welche Art, ab wann, wie viele
 *     Einsaetze. Die Beschreibung ist einen Klick entfernt, in der Akte des
 *     Arbeitgebers. Datenminimierung heisst nicht, dass niemand sie sieht —
 *     sondern dass sie nicht dorthin ausschwaermt, wo sie nichts entscheidet.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Wer umdisponieren darf, wird benachrichtigt. Eine Berechtigung, keine Rollenliste. */
export const BUERO_PERMISSION = "worker.manage";

/** Ziel des Verweises: die Live-Belegschaft, gefiltert, mit hervorgehobener Zeile. */
export function bueroDeepLink(workerProfileId, filter = "abwesend") {
  const person = encodeURIComponent(String(workerProfileId || ""));
  return `/public/mitarbeiter.html?person=${person}#live-${filter}`;
}

/** "Müller GmbH ab 18.08." — der Einsatz, der zuerst weh tut. */
function einsatzKlartext(einsatz) {
  if (!einsatz) return null;
  const kunde = einsatz.kunde || "Einsatz";
  const beginnt = einsatz.beginnt ? dateOnlyDE(einsatz.beginnt) : null;
  return beginnt ? `${kunde} ab ${beginnt}` : String(kunde);
}

/**
 * Die Selbstmeldung ins Buero tragen — sofort.
 *
 * WARUM DIESE FUNKTION NIE WIRFT: Sie laeuft NACH dem Schreiben der Meldung.
 * Wer sich krank meldet, hat sich krank gemeldet — auch wenn der Mailserver
 * klemmt oder niemand mit `worker.manage` in der Firma steht. Ein Zustellweg,
 * der die fachliche Wahrheit zuruecknehmen kann, waere schlimmer als gar keiner.
 * Deshalb: jeder Fehler wird zurueckgemeldet (`{ benachrichtigt: 0, grund }`),
 * nie geworfen. Der Aufrufer entscheidet, ob ihn das interessiert.
 *
 * @param {import('pg').Pool} pool
 * @param {string} supplierOrgId
 * @param {{anlass:'abwesenheit'|'verspaetung', absence?:object, verspaetung?:object,
 *          workerProfileId:string, melderUserId?:string|null}} meldung
 * @returns {Promise<{benachrichtigt:number, empfaenger?:number, grund?:string, linkPath?:string, message?:string}>}
 */
export async function benachrichtigeBuero(pool, supplierOrgId, meldung = {}) {
  const { anlass, absence = null, verspaetung = null, workerProfileId, melderUserId = null } = meldung;
  if (!pool || !supplierOrgId || !workerProfileId) return { benachrichtigt: 0, grund: "MISSING_PARAMS" };
  if (anlass !== "abwesenheit" && anlass !== "verspaetung") return { benachrichtigt: 0, grund: "UNBEKANNTER_ANLASS" };

  try {
    /* Name UND Empfaenger parallel — beide haengen von nichts ab, was der
     * jeweils andere liefert. Nacheinander waere es die doppelte Latenz auf
     * einem Pfad, der zwischen "melden" und "Antwort an den Menschen" liegt. */
    const [nameRes, empfaenger] = await Promise.all([
      pool.query(
        /* Die Mandantengrenze steht IM Statement, wie ueberall in diesem Dienst:
         * ein Profil aus einem fremden Betrieb liefert hier keine Zeile — und
         * damit auch keinen Namen in einer fremden Benachrichtigung. */
        `SELECT first_name, last_name, personnel_number
           FROM worker_profiles WHERE id = $1 AND supplier_org_id = $2`,
        [workerProfileId, supplierOrgId]
      ),
      findOrgMembersWithPermission(pool, supplierOrgId, BUERO_PERMISSION),
    ]);

    const profil = nameRes.rows[0];
    if (!profil) return { benachrichtigt: 0, grund: "WORKER_NOT_IN_ORG" };

    /* Der Melder bekommt seine eigene Meldung nicht zurueck. Normalerweise hat
     * ein Mitarbeiter keine `worker.manage`-Mitgliedschaft — aber in kleinen
     * Betrieben ist der Disponent manchmal selbst im Einsatz, und dann ist die
     * Benachrichtigung ueber die eigene Krankmeldung schlicht Unsinn. */
    const ziele = empfaenger.filter((id) => id && id !== melderUserId);
    if (!ziele.length) return { benachrichtigt: 0, grund: "KEIN_EMPFAENGER" };

    const name = `${profil.first_name || ""} ${profil.last_name || ""}`.trim()
      || (profil.personnel_number ? `#${profil.personnel_number}` : "Ein Mitarbeiter");

    let message, linkPath, eventKey, entityType, entityId;

    if (anlass === "verspaetung") {
      /* Der leichte Weg bleibt leicht — auch in der Benachrichtigung. Keine
       * Folgen-Abfrage: eine Verspaetung gibt keinen Einsatz frei (Gate G3),
       * also gibt es nichts vorzurechnen. Wer hier trotzdem `folgenVorschau()`
       * riefe, kaufte eine Abfrage fuer eine Zahl, die immer 0 bedeutet. */
      const min = verspaetung && verspaetung.minuten;
      message = `${name} kommt ${min} Minuten später.`;
      if (verspaetung && verspaetung.notiz) message += ` ${String(verspaetung.notiz).slice(0, 200)}`;
      linkPath = bueroDeepLink(workerProfileId, "im_einsatz");
      eventKey = "worker.delay_reported";
      entityType = "worker_delay";
      entityId = verspaetung && verspaetung.id;
    } else {
      /* DIESELBE FUNKTION, DIE DEM MENSCHEN DIE FOLGEN GEZEIGT HAT (G-E5).
       * Das ist der Punkt: Was im dritten Schritt auf seinem Bildschirm stand,
       * steht jetzt in der Benachrichtigung des Disponenten — dieselbe Quelle,
       * dieselben Einsaetze. Zwei getrennte Abfragen waeren zwei Wahrheiten,
       * und die Abweichung faende niemand, weil beide plausibel aussehen. */
      const folgen = await folgenVorschau(pool, supplierOrgId, {
        workerProfileId,
        von: absence && absence.von,
        bis: (absence && absence.bis) || null,
      });
      const einsaetze = (folgen && folgen.einsaetze) || [];

      const von = absence && absence.von ? dateOnlyDE(absence.von) : null;
      const teile = [`${name}: ${absence && absence.art}`];
      if (von) teile.push(`ab ${von}`);
      teile.push(absence && absence.bis ? `bis ${dateOnlyDE(absence.bis)}` : "Ende offen");

      /* Die Zahl der betroffenen Einsaetze ist die eigentliche Nachricht — sie
       * sagt dem Disponenten, ob er aufstehen muss. Der erste wird NAMENTLICH
       * genannt, weil "2 Einsätze betroffen" ihn zwingt nachzusehen, um zu
       * wissen, ob es dringend ist. */
      if (einsaetze.length) {
        const erster = einsatzKlartext(einsaetze[0]);
        teile.push(einsaetze.length === 1
          ? `Betroffen: ${erster}`
          : `Betroffen: ${einsaetze.length} Einsätze (${erster} …)`);
      } else {
        /* Kein Einsatz betroffen ist eine ECHTE Antwort, kein Fehlen von Daten:
         * der Mensch ist gerade nicht besetzt. Das zu sagen ist besser, als die
         * Zeile wegzulassen und den Disponenten raten zu lassen. */
        teile.push("Kein laufender Einsatz betroffen");
      }

      /* Beantragt statt wirksam (G-E2, Freigabepflicht-Schalter): der Disponent
       * muss WISSEN, dass hier noch seine Entscheidung fehlt — sonst wartet er
       * auf niemanden und der Mensch wartet auf ihn. */
      if (absence && absence.zustand === "beantragt") teile.push("— wartet auf Freigabe");

      message = teile.join(" · ");
      linkPath = bueroDeepLink(workerProfileId, "abwesend");
      eventKey = "worker.absence_reported";
      entityType = "worker_absence";
      entityId = absence && absence.id;
    }

    const ergebnis = await dispatch(pool, eventKey, {
      recipientUserIds: ziele,
      orgId: supplierOrgId,
      entityType,
      entityId,
      message,
      linkPath,
      /* E-Mail ist ANGEBOTEN, nicht erzwungen. `emailQueue: true` ist die
       * Erlaubnis; ob wirklich eine Mail rausgeht, entscheidet die Einstellung
       * des Empfaengers unter `workforce_updates` (Standard: aus).
       *
       * WARUM NICHT ALS DRINGEND ERZWUNGEN: `getUserPreferences` kennt einen
       * Weg, die Einstellung zu uebergehen (urgent/Notdienst bekommen IMMER
       * Mail). Fuer eine Krankmeldung waere das der falsche Griff — sie ist
       * nicht selten. Ein nicht abschaltbarer Mailstrom bei jeder Meldung ist
       * der schnellste Weg dahin, dass der Disponent alle Mails der Plattform
       * in einen Ordner filtert; dann verliert auch der echte Notdienst seine
       * Wirkung. Das Gate dieser Welle haengt ohnehin nicht an der Mail: In-App
       * plus Live-Push plus Glocken-Zaehler erreichen den, der ins Buero kommt. */
      emailQueue: true,
      emailSubject: anlass === "verspaetung" ? `Verspätung: ${name}` : `Abwesenheit: ${name}`,
    });

    return { benachrichtigt: ergebnis.sent || 0, empfaenger: ziele.length, linkPath, message };
  } catch (e) {
    /* Bewusst verschluckt — siehe der Kommentar oben. Der Aufrufer bekommt den
     * Grund zurueck und kann ihn protokollieren; die Meldung selbst steht. */
    return { benachrichtigt: 0, grund: e && e.message ? e.message : "DISPATCH_FEHLER" };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Welle G4b — der Kunde erfaehrt, DASS jemand ausfaellt, nie WARUM
 *
 *  DIE TRENNLINIE, AN DER DATENSCHUTZVERSTOESSE IN DIESER BRANCHE PASSIEREN:
 *  Die Zeitarbeitsfirma ist Arbeitgeber und darf "krank" verarbeiten. Das
 *  Einsatzunternehmen ist ein DRITTER. Fuer seine Planung genuegt, DASS jemand
 *  ausfaellt und bis wann voraussichtlich — die Art ist ein Gesundheitsdatum
 *  nach Art. 9 DSGVO und geht ihn nichts an.
 *
 *  WARUM fuerKunde() ALLEIN NICHT REICHT — der Befund, der diese Welle geformt
 *  hat: Die Funktion schuetzt das OBJEKT. Der Weg, auf dem die Art tatsaechlich
 *  entkaeme, ist aber der TEXT. dispatch() schreibt context.message unveraendert
 *  in die Tabelle, schickt ihn als Mailtext und reicht ihn an Slack/Teams
 *  weiter. Und die Vorlage aus G4 baut ihren Text woertlich aus Name und
 *  absence.art — wer sie kopiert, schreibt "krank" in die Kundenmeldung, in
 *  dessen Postfach und in dessen Chat, waehrend fuerKunde() danebensteht und
 *  formal recht behaelt.
 *
 *  DIE ANTWORT DARAUF: kundenNachricht() nimmt KEIN Abwesenheits-Objekt
 *  entgegen, sondern nur einzelne, benannte Werte. Was nicht uebergeben werden
 *  kann, kann auch nicht durchrutschen — auch nicht bei dem Feld, das jemand
 *  naechstes Jahr ergaenzt. Das ist eine Stufe strenger als eine Positivliste
 *  auf einem Objekt: es gibt kein Objekt.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Wer beim KUNDEN umdisponieren kann. Nicht assignment.view — das umfasst zehn
 *  Rollen bis hinunter zum Betrachter; wer nichts tun kann, braucht die Meldung
 *  nicht, und eine Meldung an alle ist eine an niemanden. */
export const KUNDE_PERMISSION = "assignment.edit";

/** Die drei Anlaesse, ueber die der Kunde etwas erfaehrt. */
export const KUNDE_ANLAESSE = Object.freeze(["ausfall", "entwarnung", "ersatz"]);

/** Einsaetze, die nicht mehr laufen, betreffen den Kunden nicht mehr. */
const EINSATZ_ERLEDIGT = Object.freeze(["completed", "cancelled", "closed"]);

/**
 * Der Text der Kundenmeldung.
 *
 * NIMMT BEWUSST NUR PRIMITIVE. Kein absence, kein link, kein profil — sonst
 * waere die naechste Ergaenzung an einem dieser Objekte automatisch ein
 * Kandidat fuer den Text. Wer hier etwas hinzufuegen will, muss es einzeln
 * benennen, und genau dabei faellt auf, ob es den Kunden angeht.
 *
 * @param {{anlass:string, name:string, kunde?:string|null, von?:string|null,
 *          bis?:string|null, ersatzName?:string|null}} teile
 */
export function kundenNachricht(teile = {}) {
  const { anlass, name, kunde = null, von = null, bis = null, ersatzName = null } = teile;
  const wer = String(name || "Eine Einsatzkraft").trim();
  const wo = kunde ? " (" + kunde + ")" : "";

  if (anlass === "entwarnung") {
    return wer + wo + " faellt doch nicht aus - die Meldung wurde zurueckgenommen.";
  }
  if (anlass === "ersatz") {
    return ersatzName
      ? "Ersatz fuer " + wer + wo + ": " + String(ersatzName).trim() + " uebernimmt."
      : "Fuer " + wer + wo + " ist Ersatz gestellt.";
  }

  /* Ausfall. KEIN Grund, KEINE Art — und das ist keine Auslassung, sondern die
   * Nachricht: Was der Kunde zum Planen braucht, ist der Zeitraum. */
  const teil = [wer + wo + " faellt aus"];
  if (von) teil.push("ab " + von);
  teil.push(bis ? "voraussichtlich bis " + bis : "Dauer noch offen");
  return teil.join(" · ") + ".";
}

/**
 * Darf dieser Einsatz ueberhaupt eine Kundenmeldung ausloesen?
 *
 * Drei Faelle sagen NEIN, und alle drei sind in den echten Daten belegt:
 *  1. KEIN KUNDE — assignments.org_id ist nullable. Ohne Besteller gibt es
 *     niemanden zu benachrichtigen.
 *  2. KUNDE IST DER LIEFERANT — im Bestand betrifft das ein Viertel der
 *     Verknuepfungen (interne Einsaetze). Ohne diese Pruefung bekaeme das Buero
 *     dieselbe Sache zweimal: einmal als Arbeitgeber MIT Art, einmal als
 *     "Kunde" ohne. Das ist nicht nur Laerm — es stellt beide Meldungen
 *     nebeneinander und macht die Reduktion sichtbar sinnlos.
 *  3. DIVERGENZ — worker_assignment_links.org_id kommt ungeprueft aus dem
 *     Anfrage-Rumpf (routes/workers.js: orgId aus dem Body). Weicht sie von
 *     assignments.org_id ab, ist unklar, wer der Kunde ist: Die Empfaenger
 *     kaemen aus der einen Quelle, die Ansicht des Kunden filtert aber nach der
 *     anderen — man benachrichtigte Menschen, die den Einsatz bei sich gar
 *     nicht sehen. Im Zweifel nicht senden.
 */
export function kundeIstEmpfangsberechtigt(einsatz, supplierOrgId) {
  const kunde = einsatz && einsatz.kunde_org_id;
  if (!kunde) return { erlaubt: false, grund: "KEIN_KUNDE" };
  if (kunde === supplierOrgId) return { erlaubt: false, grund: "KUNDE_IST_LIEFERANT" };
  const verknuepfung = einsatz.verknuepfung_org_id;
  if (verknuepfung && verknuepfung !== kunde) {
    return { erlaubt: false, grund: "ORG_DIVERGENZ" };
  }
  return { erlaubt: true, kundeOrgId: kunde };
}

/** Anlass zu Ereignisschluessel. Die Entwarnung teilt sich den Typ mit dem
 *  Ausfall: es ist dieselbe Sache, nur zurueckgenommen — ein eigener Typ wuerde
 *  die Zusammengehoerigkeit in Liste und Filter zerreissen. */
export function kundenEreignis(anlass) {
  return anlass === "ersatz" ? "assignment.worker_replaced" : "assignment.worker_unavailable";
}

/** Zum betroffenen Einsatz in der Kundenansicht — nicht auf eine Uebersicht. */
export function kundenDeepLink(assignmentId) {
  return "/public/company-timesheets.html?einsatz=" + encodeURIComponent(String(assignmentId || "")) + "#live";
}

/**
 * Den Kunden benachrichtigen — je betroffenem Einsatz genau einmal.
 *
 * WIRFT NIE, aus demselben Grund wie benachrichtigeBuero(): Die Meldung steht
 * bereits in der Datenbank; ein klemmender Zustellweg darf sie nicht
 * zuruecknehmen.
 *
 * @param {import('pg').Pool} pool
 * @param {string} supplierOrgId  die Zeitarbeitsfirma (Absender-Seite)
 * @param {{anlass:'ausfall'|'entwarnung'|'ersatz', absence?:object,
 *          workerProfileId:string, einsaetze?:Array, ersatzName?:string|null}} meldung
 */
export async function benachrichtigeKunde(pool, supplierOrgId, meldung = {}) {
  const { anlass, absence = null, workerProfileId, einsaetze = null, ersatzName = null } = meldung;

  if (!pool || !supplierOrgId || !workerProfileId) return { benachrichtigt: 0, grund: "MISSING_PARAMS" };
  if (!KUNDE_ANLAESSE.includes(anlass)) return { benachrichtigt: 0, grund: "UNBEKANNTER_ANLASS" };

  try {
    /* DIE FREIGABEPFLICHT IST EINE GRENZE NACH AUSSEN (G-E2, Welle G1).
     * Eine nur BEANTRAGTE Meldung hat die Firma noch nicht entschieden — sie
     * dem Kunden zu melden hiesse, eine Entscheidung nach aussen zu tragen, die
     * drinnen noch aussteht. fuerKunde() kodiert genau das in faellt_aus; hier
     * wird es zur Absendebedingung. */
    const sicht = anlass === "ausfall" ? fuerKunde(absence) : null;
    if (anlass === "ausfall" && (!sicht || !sicht.faellt_aus)) {
      return { benachrichtigt: 0, grund: "NICHT_WIRKSAM" };
    }

    /* Die betroffenen Einsaetze: entweder mitgegeben (der Ersatz-Pfad kennt
     * genau einen) oder aus derselben Quelle wie die Buero-Meldung — dieselben
     * Einsaetze, damit beide Seiten dasselbe Ereignis meinen. */
    let liste = einsaetze;
    if (!liste) {
      const folgen = await folgenVorschau(pool, supplierOrgId, {
        workerProfileId,
        von: absence && absence.von,
        bis: (absence && absence.bis) || null,
      });
      liste = (folgen && folgen.einsaetze) || [];
    }
    if (!liste.length) return { benachrichtigt: 0, grund: "KEIN_EINSATZ" };

    const { rows: profilRows } = await pool.query(
      "SELECT first_name, last_name, personnel_number\n" +
      "   FROM worker_profiles WHERE id = $1 AND supplier_org_id = $2",
      [workerProfileId, supplierOrgId]
    );
    const profil = profilRows[0];
    if (!profil) return { benachrichtigt: 0, grund: "WORKER_NOT_IN_ORG" };

    /* Der NAME darf mit: Der Kunde sieht seine Einsatzkraefte ohnehin namentlich
     * (Stundenzettel, Live-Ansicht). Geschuetzt ist die ART, nicht die Person. */
    const name = (String(profil.first_name || "") + " " + String(profil.last_name || "")).trim()
      || (profil.personnel_number ? "#" + profil.personnel_number : "Eine Einsatzkraft");

    let gesamt = 0;
    const uebersprungen = [];

    for (const einsatz of liste) {
      const status = String(einsatz.assignment_status || "").toLowerCase();
      if (EINSATZ_ERLEDIGT.includes(status)) { uebersprungen.push("EINSATZ_ERLEDIGT"); continue; }

      const pruefung = kundeIstEmpfangsberechtigt(einsatz, supplierOrgId);
      if (!pruefung.erlaubt) { uebersprungen.push(pruefung.grund); continue; }

      const empfaenger = await findOrgMembersWithPermission(pool, pruefung.kundeOrgId, KUNDE_PERMISSION);
      if (!empfaenger.length) { uebersprungen.push("KEIN_EMPFAENGER"); continue; }

      /* HIER GEHEN NUR PRIMITIVE HINEIN. Kein absence, kein einsatz-Objekt —
       * siehe der Kopf dieses Abschnitts. sicht ist bereits durch fuerKunde()
       * gelaufen und traegt ausschliesslich Datum und Zustand. */
      const message = kundenNachricht({
        anlass,
        name,
        kunde: einsatz.kunde || null,
        von: sicht ? sicht.von : null,
        bis: sicht ? sicht.bis : null,
        ersatzName,
      });

      const ergebnis = await dispatch(pool, kundenEreignis(anlass), {
        recipientUserIds: empfaenger,
        /* org_id ist die EMPFAENGER-Org, nicht die des Absenders: Das Feld
         * steuert den Org-Filter der Benachrichtigungsliste und die
         * Integrations-Weiterleitung. Stuende hier die Zeitarbeitsfirma, laege
         * die Meldung in der Ablage einer fremden Organisation. */
        orgId: pruefung.kundeOrgId,
        /* Der Anker ist der EINSATZ, nicht die Abwesenheit. Zwei Gruende: der
         * Kunde kennt keine Abwesenheits-ID und hat auf sie keinen Zugriff —
         * und die Dedupe-Klausel in dispatch() greift ueber entity_id, soll
         * hier aber JE EINSATZ einmal zustellen, nicht je Meldung einmal. */
        entityType: "assignment",
        entityId: einsatz.assignment_id,
        message,
        linkPath: kundenDeepLink(einsatz.assignment_id),
        emailQueue: true,
        emailSubject: anlass === "ersatz" ? "Ersatz gestellt: " + name : "Ausfall: " + name,
      });
      gesamt += ergebnis.sent || 0;
    }

    return { benachrichtigt: gesamt, einsaetze: liste.length, uebersprungen };
  } catch (e) {
    return { benachrichtigt: 0, grund: e && e.message ? e.message : "DISPATCH_FEHLER" };
  }
}

/**
 * Genau EIN Einsatz, in der Form, die die Kundenmeldung braucht.
 *
 * Warum nicht folgenVorschau() wiederverwenden: Die sucht ueber einen ZEITRAUM
 * und liefert alles, was sich damit schneidet. Der Ersatz-Pfad kennt dagegen
 * genau den einen Einsatz, um den es geht — ihn ueber ein Datumsfenster wieder
 * einzufangen hiesse, ihn mit fremden Einsaetzen desselben Menschen zu
 * vermischen und dann herauszufiltern. Dieselben Spalten und dieselben Aliase
 * wie dort, damit `kundeIstEmpfangsberechtigt()` beide Quellen gleich behandelt.
 *
 * Die Mandantengrenze steht IM Statement: ein Einsatz eines fremden Betriebs
 * liefert hier keine Zeile — und damit auch keine Meldung in dessen Namen.
 */
export async function einsatzFuerKundenmeldung(pool, supplierOrgId, assignmentId) {
  if (!pool || !supplierOrgId || !assignmentId) return null;
  const { rows } = await pool.query(
    `SELECT a.id       AS assignment_id,
            a.status   AS assignment_status,
            a.org_id   AS kunde_org_id,
            wal.org_id AS verknuepfung_org_id,
            o.name     AS kunde
       FROM assignments a
       JOIN worker_assignment_links wal
         ON wal.assignment_id = a.id
        AND wal.supplier_org_id = $1
       LEFT JOIN organizations o ON o.id = a.org_id
      WHERE a.id = $2
      LIMIT 1`,
    [supplierOrgId, assignmentId]
  );
  return rows[0] || null;
}

/**
 * Der Name einer Kraft ueber ihr NUTZERKONTO — fuer den Ersatz-Pfad, der mit
 * user_ids arbeitet, waehrend Abwesenheiten am Profil haengen (Mig 177).
 * Liefert zusaetzlich die Profil-ID, weil `benachrichtigeKunde()` sie braucht.
 */
export async function profilZuNutzer(pool, supplierOrgId, workerUserId) {
  if (!pool || !supplierOrgId || !workerUserId) return null;
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, personnel_number
       FROM worker_profiles
      WHERE user_id = $1 AND supplier_org_id = $2
      LIMIT 1`,
    [workerUserId, supplierOrgId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: (String(r.first_name || "") + " " + String(r.last_name || "")).trim()
      || (r.personnel_number ? "#" + r.personnel_number : null),
  };
}
