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
    `SELECT a.id            AS assignment_id,
            a.status        AS assignment_status,
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
