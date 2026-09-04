import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger("marktpraesenz");

/**
 * marktpraesenzService — Verfuegbarkeit IST das Angebot (Welle J2b)
 *
 * DIE OWNER-VISION (Plan J §0/§1, Freigabe 2026-08-26): Unternehmen sehen die
 * freien Kraefte der gesamten Plattform, ohne dass eine Zeitarbeitsfirma dafuer
 * Angebote pflegt. Gemessen am 2026-08-26: 24 von 33 aktiven Kraeften waren
 * frei — im Marktplatz stand EIN aktives Einzelangebot.
 *
 * WAS DIESER DIENST TUT: Er materialisiert fuer jede aktive, markt-praesente
 * Kraft mit Katalog-Skills die fehlenden Einzelskill-Angebote — als ganz
 * normale `capacity_posts` (offer_kind 'single_skill', quelle
 * 'live_belegschaft'). Damit laeuft ALLES Weitere ueber die vorhandenen
 * Schienen: der Feed zeigt sie, `workerOfferReservationService` pausiert sie,
 * solange die Kraft im Einsatz ist, und gibt sie frei, sobald sie es nicht
 * mehr ist, `accept-deal` bucht sie, der Dedup-Index (Mig 145) verhindert
 * Doppel-Angebote. Kein zweiter Marktplatz, kein zweiter Zustand.
 *
 * ARBEITSTEILUNG, bewusst: Dieser Dienst kennt KEINE Einsaetze. Ob eine Kraft
 * gerade gebunden ist, entscheidet ausschliesslich der Reservierungs-Sweep —
 * er laeuft im selben Cron-Takt DIREKT NACH der Materialisierung und pausiert
 * die Angebote gebundener Kraefte, bevor irgendjemand sie sieht. Zwei Dienste,
 * die beide "frei?" beantworten, waeren zwei Wahrheiten.
 *
 * DER AUSSCHALTER (Mig 200, Plan J §3.2): `marktpraesenz_deaktiviert` ist ein
 * Ausschalter, kein Einschalter — Praesenz ist der Grundzustand. Beim
 * Abschalten (oder Deaktivieren des Profils) nimmt der Sweep NUR zurueck, was
 * er selbst erzeugt hat (`quelle = 'live_belegschaft'`); von Hand gepflegte
 * Angebote sind die Entscheidung der Agentur und bleiben stehen. Laufende
 * Geschaefte ('reserved'/'filled') werden nie angefasst — eine Praesenz-
 * Entscheidung storniert keinen Deal.
 *
 * Set-basiert + idempotent wie der Reservierungs-Sweep: mehrfach ausfuehrbar
 * ohne Nebenwirkung, gefahrlos im Cron.
 */

/* Der Ansprechpartner der Agentur fuer das automatische Angebot:
 * `capacity_posts.supplier_company_id` ist NOT NULL und zeigt auf einen
 * Nutzer. Die Automatik nimmt deterministisch das dienstaelteste aktive
 * Mitglied mit Leitungsrolle der Org; gibt es keines, das dienstaelteste
 * aktive Mitglied ueberhaupt. Eine Org ganz ohne aktives Mitglied bekommt
 * keine automatischen Angebote — es gaebe niemanden, der antwortet. */
const AGENTUR_NUTZER_SQL = `
  SELECT om.user_id
    FROM org_memberships om
   WHERE om.org_id = wp.supplier_org_id
     AND om.is_active = TRUE
     AND om.role_key <> 'worker'
   ORDER BY (om.role_key NOT IN ('owner', 'admin')), om.created_at ASC
   LIMIT 1`;

/* Fehlende Einzelskill-Angebote anlegen. Spiegel von
 * buildSingleSkillOfferData (capacityOfferGeneratorService) — mit zwei
 * gewollten Abweichungen: status 'active' statt 'draft' (die Automatik IST
 * die Veroeffentlichung; ein Entwurf, den niemand freischaltet, waere wieder
 * das Pflegeproblem) und quelle 'live_belegschaft' (damit die Ruecknahme
 * weiss, was ihr gehoert). Kraefte ohne Ort werden ausgelassen —
 * location_city ist NOT NULL, und ein erfundener Ort waere eine Luege im
 * Marktplatz. ON CONFLICT gegen den Dedup-Index (Mig 145): ein bereits
 * vorhandenes Angebot (egal welcher quelle) hat Vorrang. */
/*
 * F27 (Owner-Entscheid 2026-09-04) — `last_confirmed_at` gehoert an die Quelle.
 *
 * `findStaleEntries` prueft `last_confirmed_at IS NULL OR ... < NOW() - 7 Tage`.
 * Die erste Haelfte trifft SOFORT: ein Eintrag ohne Bestaetigung ist ueberfaellig,
 * nicht erst nach sieben Tagen. Gemessen am 2026-09-03 waren dadurch zwoelf von
 * dreizehn aktiven Eintraegen dauerhaft ueberfaellig — darunter alle sechs, die
 * diese Automatik erzeugt hat und die NIEMAND bestaetigen kann, weil sie
 * maschinell entstehen. Der taegliche Sweep verschickte je Eintrag eine Meldung
 * an einen echten Menschen (den owner/admin der Agentur), unbefristet.
 *
 * Gewaehlt wurde nicht der Filter auf `quelle`, sondern die Bestaetigung an der
 * Quelle: was die Automatik gerade nachgeprueft hat, IST bestaetigt — und zwar
 * frischer als jede Bestaetigung von Hand. Sie prueft bei jedem Lauf, dass die
 * Kraft aktiv ist, die Faehigkeit noch traegt, nicht abwesend ist und einen Ort
 * hat.
 *
 * DAS ERNEUERN IST DER TEIL, DER DIE BESTANDSZEILEN HEILT. `DO NOTHING` liesse
 * die sechs vorhandenen fuer immer leer; `DO UPDATE` schreibt beim naechsten
 * Lauf die Bestaetigung nach. Die Bedingung `quelle = 'live_belegschaft'` haelt
 * dabei die Zusage der Zeile darueber ein: ein von Hand angelegtes Angebot hat
 * Vorrang und wird von der Maschine NICHT bestaetigt — dort ist die
 * Bestaetigungspflicht gewollt.
 */
const MATERIALISIEREN_SQL = `
  INSERT INTO capacity_posts (
    supplier_company_id, title, role, skill_tags, headcount,
    availability_from, availability_to, location_city, location_postal, worker_category,
    status, is_active, org_id, worker_profile_id, primary_skill_id,
    offer_kind, priority_level, placement_boost_level, is_anonymous, quelle,
    last_confirmed_at
  )
  SELECT
    (${AGENTUR_NUTZER_SQL}),
    ps.name, ps.name, ARRAY[ps.name], 1,
    CURRENT_DATE, wp.einsetzbar_bis, wp.city, wp.postal_code, ps.category,
    'active', TRUE, wp.supplier_org_id, wp.id, ps.id,
    'single_skill', 'normal', 0, TRUE, 'live_belegschaft',
    NOW()
    FROM worker_profiles wp
    JOIN worker_profile_skills wps ON wps.worker_profile_id = wp.id
    JOIN platform_skills ps ON ps.id = wps.skill_id AND ps.is_active = TRUE
   WHERE wp.is_active = TRUE
     AND wp.marktpraesenz_deaktiviert = FALSE
     AND wp.city IS NOT NULL AND wp.city <> ''
     AND NOT ${abwesendHeuteSql("wp.id")}
     AND (${AGENTUR_NUTZER_SQL}) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM capacity_posts cp
        WHERE cp.worker_profile_id = wp.id
          AND cp.primary_skill_id = ps.id
          AND cp.offer_kind = 'single_skill'
          AND cp.status IN ('draft', 'active', 'paused')
     )
  ON CONFLICT (worker_profile_id, primary_skill_id)
    WHERE offer_kind = 'single_skill'
      AND worker_profile_id IS NOT NULL
      AND primary_skill_id IS NOT NULL
      AND status IN ('draft', 'active', 'paused')
  DO UPDATE SET last_confirmed_at = NOW()
    WHERE capacity_posts.quelle = 'live_belegschaft'`;

/* Eine WIRKSAME Abwesenheit, die HEUTE gilt (Owner 2026-08-26: das Unternehmen
 * muss erkennen, "ob er wirklich verfuegbar ist"). Dieselben Bedingungen wie
 * die Kundentafel (H1): nur 'wirksam' — eine erst BEANTRAGTE Selbstmeldung ist
 * eine Entscheidung, die beim Arbeitgeber noch aussteht, und nimmt niemanden
 * vom Markt. Und es gilt DASS-nicht-WARUM: die Art der Abwesenheit erreicht
 * den Markt nie — die Kraft verschwindet einfach bis zur Rueckkehr und kommt
 * mit dem naechsten Takt von selbst wieder. */
function abwesendHeuteSql(profilSpalte) {
  return `EXISTS (
       SELECT 1 FROM worker_absences ab
        WHERE ab.worker_profile_id = ${profilSpalte}
          AND ab.zustand = 'wirksam'
          AND ab.aufgehoben_am IS NULL
          AND ab.von <= CURRENT_DATE
          AND (ab.bis IS NULL OR ab.bis >= CURRENT_DATE)
     )`;
}

/* Ruecknahme: der Ausschalter greift, das Profil ist deaktiviert, ODER die
 * Kraft ist heute wirksam abwesend. NUR eigene Zeilen (quelle), NUR offene
 * Zustaende — 'reserved' und 'filled' tragen laufende Geschaefte und bleiben
 * unberuehrt. */
const ZURUECKNEHMEN_SQL = `
  UPDATE capacity_posts cp
     SET status = 'archived', is_active = FALSE, updated_at = NOW()
   WHERE cp.quelle = 'live_belegschaft'
     AND cp.status IN ('draft', 'active', 'paused')
     AND (
       EXISTS (
         SELECT 1 FROM worker_profiles wp
          WHERE wp.id = cp.worker_profile_id
            AND (wp.marktpraesenz_deaktiviert = TRUE OR wp.is_active = FALSE)
       )
       OR ${abwesendHeuteSql("cp.worker_profile_id")}
     )`;

/* Wiederkehr: der Ausschalter wurde zurueckgenommen. Nur eigene, von der
 * Ruecknahme archivierte Zeilen kommen zurueck — und zwar auf 'active'; ob
 * die Kraft gerade gebunden ist, entscheidet unmittelbar danach der
 * Reservierungs-Sweep. worker_reserved-Zeilen gehoeren dem Sweep und werden
 * hier nicht angefasst. */
const WIEDERHERSTELLEN_SQL = `
  UPDATE capacity_posts cp
     SET status = 'active', is_active = TRUE, updated_at = NOW()
   WHERE cp.quelle = 'live_belegschaft'
     AND cp.status = 'archived'
     AND cp.worker_reserved = FALSE
     AND EXISTS (
       SELECT 1 FROM worker_profiles wp
        WHERE wp.id = cp.worker_profile_id
          AND wp.marktpraesenz_deaktiviert = FALSE
          AND wp.is_active = TRUE
     )
     AND NOT ${abwesendHeuteSql("cp.worker_profile_id")}`;

/* Horizont-Spiegel (Welle J9): `einsetzbar_bis` des Profils ist die Wahrheit,
 * `availability_to` der eigenen Auto-Angebote ihr Spiegel. So rechnet ALLES
 * Vorhandene einfach mit — der Feed blendet abgelaufene Angebote aus, die
 * Buchungspruefung (pruefeBuchungsWuensche) haelt den Zeitraum im Fenster,
 * die Anzeige zeigt "verfuegbar bis". Nur eigene Zeilen, nur offene
 * Zustaende, nur bei echter Abweichung (IS DISTINCT FROM haelt den Sweep
 * leerlauf-frei). */
const HORIZONT_SQL = `
  UPDATE capacity_posts cp
     SET availability_to = wp.einsetzbar_bis, updated_at = NOW()
    FROM worker_profiles wp
   WHERE wp.id = cp.worker_profile_id
     AND cp.quelle = 'live_belegschaft'
     AND cp.status IN ('draft', 'active', 'paused')
     AND cp.availability_to IS DISTINCT FROM wp.einsetzbar_bis`;

/* ═══════════════════════════════════════════════════════════════════════════
 * WER IST AM MARKT UNSICHTBAR — UND WARUM (eine Wahrheit, zwei Verbraucher)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Sweep misst seine eigene Luecke seit jeher mit. Gemessen am 2026-09-02:
 * 33 aktive Kraefte, 30 davon OHNE Katalog-Faehigkeit — sie koennen gar nicht
 * materialisiert werden und sind am Markt unauffindbar.
 *
 * Diese Zahl ging bisher an ihren Aufrufer, landete im Antwortkoerper von
 * `POST /internal/staffing-maintenance` und in einer Log-Zeile — und war mit
 * der naechsten Log-Rotation weg (M0-Bericht, Punkt 29). Ein Befund, den
 * niemand sieht, ist derselbe stille Ausfall wie ein Automatismus, der nie
 * laeuft.
 *
 * `marktSichtbarkeit()` am Ende dieser Datei liest denselben Bestand fuer die
 * Anzeige. Damit gaebe es zwei Stellen, die "unsichtbar" definieren — genau
 * die Doppelung, die M1.7 an anderer Stelle geloescht hat. Deshalb stehen die
 * Bedingungen HIER, einmal, und beide Abfragen setzen sie ein.
 * `api/test/marktSichtbarkeit.test.js` prueft nach, dass keine der beiden
 * ihre eigene Fassung mitbringt.
 */

/** Wer ueberhaupt am Markt erscheinen SOLL: aktiv und nicht abgeschaltet. */
export const PRAESENT_SQL = "wp.is_active = TRUE AND wp.marktpraesenz_deaktiviert = FALSE";

/** Grund 1: keine Katalog-Faehigkeit — dann gibt es nichts zu materialisieren. */
export const OHNE_SKILL_SQL =
  "NOT EXISTS (SELECT 1 FROM worker_profile_skills s WHERE s.worker_profile_id = wp.id)";

/**
 * Grund 2: Faehigkeit ja, Ort nein. Bewusst MIT der Faehigkeits-Bedingung,
 * damit die beiden Gruende einander ausschliessen und ihre Summe die Zahl der
 * unsichtbaren Kraefte ist — nicht mehr.
 */
export const OHNE_ORT_SQL =
  "(wp.city IS NULL OR wp.city = '') AND EXISTS "
  + "(SELECT 1 FROM worker_profile_skills s WHERE s.worker_profile_id = wp.id)";

/**
 * Der Vorbehalt reist MIT der Zahl, nicht in der Oberflaeche.
 *
 * Gezaehlt werden ZWEI Gruende, und beide sind Pflegezustaende, die die
 * Kundin selbst beheben kann. Ob der Rest tatsaechlich am Markt erscheint,
 * sagt diese Zahl NICHT — die Materialisierung schliesst zusaetzlich
 * Abwesende aus und verlangt einen Agentur-Nutzer.
 */
export const SICHTBARKEIT_HINWEIS =
  "Gezaehlt sind zwei behebbare Gruende: keine Katalog-Faehigkeit und kein "
  + "gepflegter Ort. Der Rest ist damit noch nicht zwingend am Markt sichtbar — "
  + "Abwesenheit und ein fehlender Agentur-Nutzer schliessen zusaetzlich aus.";

/**
 * Vollstaendiger Sweep: (1) Ruecknahme abgeschalteter Kraefte,
 * (2) Wiederkehr wieder eingeschalteter, (3) Horizont spiegeln,
 * (4) fehlende Angebote anlegen.
 * Reihenfolge ist Absicht: erst aufraeumen, dann anlegen — sonst legt (4)
 * an, was (1) im selben Lauf wieder wegnimmt.
 *
 * Der Aufrufer (Cron staffing-maintenance) laesst DANACH
 * `workerOfferReservationService.sweepReservations` laufen, damit Angebote
 * gebundener Kraefte pausiert sind, bevor irgendjemand den Feed liest.
 */
export async function sweepMarktpraesenz(pool) {
  const zurueck = await pool.query(`${ZURUECKNEHMEN_SQL} RETURNING cp.id`);
  const wieder = await pool.query(`${WIEDERHERSTELLEN_SQL} RETURNING cp.id`);
  const horizont = await pool.query(`${HORIZONT_SQL} RETURNING cp.id`);
  const neu = await pool.query(`${MATERIALISIEREN_SQL} RETURNING id`);
  /* Die Luecke wird MITGEMESSEN, nicht verschluckt (Plan J §0.12, "No silent
   * caps"): eine aktive, praesente Kraft ohne Katalog-Skill oder ohne Ort
   * kann nicht materialisiert werden — sie ist am Markt unsichtbar, und
   * niemand wuerde es merken. Gemessen am 2026-08-26 traf das 30 von 33
   * Kraeften (3 mit Katalog-Skill). Diese Zahlen speisen die Aufsicht
   * (Welle J6) und den Hinweis auf der Agenturtafel (Welle J2c). */
  const luecke = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${OHNE_SKILL_SQL})::int AS ohne_skill,
      COUNT(*) FILTER (WHERE ${OHNE_ORT_SQL})::int AS ohne_ort
      FROM worker_profiles wp
     WHERE ${PRAESENT_SQL}`);
  return {
    zurueckgenommen: zurueck.rowCount || 0,
    wiederhergestellt: wieder.rowCount || 0,
    horizont_gespiegelt: horizont.rowCount || 0,
    materialisiert: neu.rowCount || 0,
    unsichtbar_ohne_skill: luecke.rows[0]?.ohne_skill || 0,
    unsichtbar_ohne_ort: luecke.rows[0]?.ohne_ort || 0
  };
}

/**
 * Das Markt-Profil einer Kraft setzen (Welle J9): Merkmale aus dem festen
 * Katalog, Planungshorizont, interne Dispo-Notiz. Org-gebunden im
 * Schreibvorgang selbst (dieselbe Grenze wie der Praesenz-Schalter); der
 * Horizont wird SOFORT in die eigenen Auto-Angebote gespiegelt — kraft- und
 * org-gebunden, damit die Route beweisbar in ihrer Mandantengrenze bleibt.
 *
 * Die MERKMALE brauchen keinen Spiegel: der Feed liest sie zur Lesezeit vom
 * Profil (eine Wahrheit — eine Aenderung wirkt sofort in allen Angeboten).
 * Die DISPO_NOTIZ verlaesst diesen Dienst nie Richtung Markt.
 *
 * @returns {null} wenn die Kraft nicht zu dieser Org gehoert.
 */
export async function setzeMarktProfil(pool, supplierOrgId, workerProfileId, { merkmale, einsetzbarBis, dispoNotiz }) {
  const { rows } = await pool.query(
    `UPDATE worker_profiles
        SET markt_merkmale = $3,
            einsetzbar_bis = $4,
            dispo_notiz = $5,
            updated_at = NOW()
      WHERE id = $1 AND supplier_org_id = $2
      RETURNING id, markt_merkmale, einsetzbar_bis, dispo_notiz`,
    [workerProfileId, supplierOrgId, merkmale, einsetzbarBis, dispoNotiz]
  );
  if (!rows[0]) return null;
  const horizont = await pool.query(
    `UPDATE capacity_posts cp
        SET availability_to = $3, updated_at = NOW()
      WHERE cp.worker_profile_id = $1
        AND cp.quelle = 'live_belegschaft'
        AND cp.status IN ('draft', 'active', 'paused')
        AND cp.availability_to IS DISTINCT FROM $3
        AND EXISTS (
          SELECT 1 FROM worker_profiles wp
           WHERE wp.id = $1 AND wp.supplier_org_id = $2
        )
      RETURNING cp.id`,
    [workerProfileId, supplierOrgId, einsetzbarBis]
  );
  return {
    worker_profile_id: rows[0].id,
    markt_merkmale: rows[0].markt_merkmale,
    einsetzbar_bis: rows[0].einsetzbar_bis,
    dispo_notiz: rows[0].dispo_notiz,
    horizont_gespiegelt: horizont.rowCount || 0
  };
}

/**
 * Der Praesenz-Schalter fuer EINE Kraft — der Weg, den die Agenturtafel
 * (Welle J2c) aufruft. Setzt den Ausschalter und zieht die Folgen sofort
 * nach, statt auf den naechsten Cron-Takt zu warten: wer abschaltet, will
 * die Kraft JETZT nicht mehr im Marktplatz sehen.
 *
 * JEDE Anweisung hier ist kraft- UND org-gebunden ($1 = Profil, $2 = Org).
 * Der Org-Grenzen-Waechter (Spion-Pool) hat die erste Fassung zu Recht
 * abgewiesen: sie liess nach dem org-gebundenen UPDATE den GLOBALEN Sweep
 * laufen — im Ergebnis richtig (idempotent), als Mandantengrenze aber
 * unbeweisbar. Eine Route, die fuer Org A handelt, schreibt hier nichts,
 * was nicht nachweislich an Org A haengt; den Rest erledigt der Cron.
 *
 * @returns {null} wenn die Kraft nicht zu dieser Org gehoert.
 */
export async function setzeMarktpraesenz(pool, supplierOrgId, workerProfileId, deaktiviert) {
  const { rows } = await pool.query(
    `UPDATE worker_profiles
        SET marktpraesenz_deaktiviert = $3, updated_at = NOW()
      WHERE id = $1 AND supplier_org_id = $2
      RETURNING id, marktpraesenz_deaktiviert`,
    [workerProfileId, supplierOrgId, deaktiviert === true]
  );
  if (!rows[0]) return null;

  const kennung = [workerProfileId, supplierOrgId];
  const zurueck = await pool.query(
    `UPDATE capacity_posts cp
        SET status = 'archived', is_active = FALSE, updated_at = NOW()
      WHERE cp.quelle = 'live_belegschaft'
        AND cp.worker_profile_id = $1
        AND cp.status IN ('draft', 'active', 'paused')
        AND (
          EXISTS (
            SELECT 1 FROM worker_profiles wp
             WHERE wp.id = $1 AND wp.supplier_org_id = $2
               AND (wp.marktpraesenz_deaktiviert = TRUE OR wp.is_active = FALSE)
          )
          OR ${abwesendHeuteSql("cp.worker_profile_id")}
        )
      RETURNING cp.id`,
    kennung
  );
  const wieder = await pool.query(
    `UPDATE capacity_posts cp
        SET status = 'active', is_active = TRUE, updated_at = NOW()
      WHERE cp.quelle = 'live_belegschaft'
        AND cp.worker_profile_id = $1
        AND cp.status = 'archived'
        AND cp.worker_reserved = FALSE
        AND EXISTS (
          SELECT 1 FROM worker_profiles wp
           WHERE wp.id = $1 AND wp.supplier_org_id = $2
             AND wp.marktpraesenz_deaktiviert = FALSE AND wp.is_active = TRUE
        )
        AND NOT ${abwesendHeuteSql("cp.worker_profile_id")}
      RETURNING cp.id`,
    kennung
  );
  const neu = await pool.query(
    `INSERT INTO capacity_posts (
       supplier_company_id, title, role, skill_tags, headcount,
       availability_from, availability_to, location_city, location_postal, worker_category,
       status, is_active, org_id, worker_profile_id, primary_skill_id,
       offer_kind, priority_level, placement_boost_level, is_anonymous, quelle,
       last_confirmed_at
     )
     SELECT
       (${AGENTUR_NUTZER_SQL}),
       ps.name, ps.name, ARRAY[ps.name], 1,
       CURRENT_DATE, wp.einsetzbar_bis, wp.city, wp.postal_code, ps.category,
       'active', TRUE, wp.supplier_org_id, wp.id, ps.id,
       'single_skill', 'normal', 0, TRUE, 'live_belegschaft',
       NOW()
       FROM worker_profiles wp
       JOIN worker_profile_skills wps ON wps.worker_profile_id = wp.id
       JOIN platform_skills ps ON ps.id = wps.skill_id AND ps.is_active = TRUE
      WHERE wp.id = $1 AND wp.supplier_org_id = $2
        AND wp.is_active = TRUE
        AND wp.marktpraesenz_deaktiviert = FALSE
        AND wp.city IS NOT NULL AND wp.city <> ''
        AND NOT ${abwesendHeuteSql("wp.id")}
        AND (${AGENTUR_NUTZER_SQL}) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM capacity_posts cp
           WHERE cp.worker_profile_id = wp.id
             AND cp.primary_skill_id = ps.id
             AND cp.offer_kind = 'single_skill'
             AND cp.status IN ('draft', 'active', 'paused')
        )
     ON CONFLICT (worker_profile_id, primary_skill_id)
       WHERE offer_kind = 'single_skill'
         AND worker_profile_id IS NOT NULL
         AND primary_skill_id IS NOT NULL
         AND status IN ('draft', 'active', 'paused')
     DO UPDATE SET last_confirmed_at = NOW()
       WHERE capacity_posts.quelle = 'live_belegschaft'
     RETURNING id`,
    kennung
  );
  return {
    worker_profile_id: rows[0].id,
    marktpraesenz_deaktiviert: rows[0].marktpraesenz_deaktiviert,
    zurueckgenommen: zurueck.rowCount || 0,
    wiederhergestellt: wieder.rowCount || 0,
    materialisiert: neu.rowCount || 0
  };
}

/**
 * Wer ist am Markt unsichtbar — und bei WEM (2026-09-02).
 *
 * Der Sweep zaehlt die Unsichtbaren plattformweit. Fuer eine Handlung genuegt
 * das nicht: "30 von 33" sagt, DASS es ein Problem gibt, nicht WEN man anruft.
 * Diese Funktion liefert dieselbe Zahl je Agentur, absteigend nach
 * Betroffenen — das ist die Anrufliste.
 *
 * REIN LESEND. Sie schreibt nichts und laeuft deshalb auch dann, wenn der
 * Sweep gerade nicht laeuft.
 *
 * WAS SIE BEWUSST NICHT BEHAUPTET: dass der Rest sichtbar IST. Die
 * Materialisierung schliesst zusaetzlich Abwesende aus und verlangt einen
 * Agentur-Nutzer (siehe MATERIALISIEREN_SQL). Gezaehlt werden die zwei
 * Gruende, die ein PFLEGEZUSTAND sind und die die Kundin selbst beheben kann.
 * Der Unterschied steht im Feld `hinweis` und wird mitgezeigt.
 *
 * Wirft nie: eine Aufsichtszahl darf die Seite nicht mitreissen.
 */
export async function marktSichtbarkeit(pool) {
  const leer = {
    verfuegbar: false,
    gesamt: { aktive: 0, ohne_skill: 0, ohne_ort: 0, unsichtbar: 0 },
    je_agentur: [],
    hinweis: SICHTBARKEIT_HINWEIS
  };
  if (!pool || typeof pool.query !== "function") return leer;

  let zeilen = [];
  try {
    const { rows } = await pool.query(`
      SELECT wp.supplier_org_id                             AS org_id,
             COALESCE(o.name, 'ohne Organisation')          AS name,
             COUNT(*)::int                                  AS aktive,
             COUNT(*) FILTER (WHERE ${OHNE_SKILL_SQL})::int AS ohne_skill,
             COUNT(*) FILTER (WHERE ${OHNE_ORT_SQL})::int   AS ohne_ort
        FROM worker_profiles wp
        LEFT JOIN organizations o ON o.id = wp.supplier_org_id
       WHERE ${PRAESENT_SQL}
       GROUP BY wp.supplier_org_id, o.name`);
    zeilen = rows || [];
  } catch (e) {
    logger.warn({ err: e?.message }, "Markt-Sichtbarkeit konnte nicht gelesen werden");
    return leer;
  }

  const jeAgentur = zeilen.map((r) => {
    const aktive = Number(r.aktive) || 0;
    const ohneSkill = Number(r.ohne_skill) || 0;
    const ohneOrt = Number(r.ohne_ort) || 0;
    return {
      org_id: r.org_id || null,
      name: String(r.name || "ohne Organisation"),
      aktive,
      ohne_skill: ohneSkill,
      ohne_ort: ohneOrt,
      unsichtbar: ohneSkill + ohneOrt
    };
  }).sort((a, b) => b.unsichtbar - a.unsichtbar
    || b.aktive - a.aktive
    || a.name.localeCompare(b.name, "de"));

  /* Die Kopfzahl wird aus den ZEILEN summiert, nicht getrennt abgefragt.
   * Sonst koennten Kopf und Liste auseinanderlaufen — und eine Kennzahl, die
   * ihrer eigenen Aufschluesselung widerspricht, ist keine. */
  const summe = (feld) => jeAgentur.reduce((n, a) => n + a[feld], 0);

  return {
    verfuegbar: true,
    gesamt: {
      aktive: summe("aktive"),
      ohne_skill: summe("ohne_skill"),
      ohne_ort: summe("ohne_ort"),
      unsichtbar: summe("unsichtbar")
    },
    je_agentur: jeAgentur,
    hinweis: SICHTBARKEIT_HINWEIS
  };
}
