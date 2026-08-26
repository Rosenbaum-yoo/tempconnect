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
const MATERIALISIEREN_SQL = `
  INSERT INTO capacity_posts (
    supplier_company_id, title, role, skill_tags, headcount,
    availability_from, location_city, location_postal, worker_category,
    status, is_active, org_id, worker_profile_id, primary_skill_id,
    offer_kind, priority_level, placement_boost_level, is_anonymous, quelle
  )
  SELECT
    (${AGENTUR_NUTZER_SQL}),
    ps.name, ps.name, ARRAY[ps.name], 1,
    CURRENT_DATE, wp.city, wp.postal_code, ps.category,
    'active', TRUE, wp.supplier_org_id, wp.id, ps.id,
    'single_skill', 'normal', 0, TRUE, 'live_belegschaft'
    FROM worker_profiles wp
    JOIN worker_profile_skills wps ON wps.worker_profile_id = wp.id
    JOIN platform_skills ps ON ps.id = wps.skill_id AND ps.is_active = TRUE
   WHERE wp.is_active = TRUE
     AND wp.marktpraesenz_deaktiviert = FALSE
     AND wp.city IS NOT NULL AND wp.city <> ''
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
  DO NOTHING`;

/* Ruecknahme: der Ausschalter greift, oder das Profil ist deaktiviert.
 * NUR eigene Zeilen (quelle), NUR offene Zustaende — 'reserved' und 'filled'
 * tragen laufende Geschaefte und bleiben unberuehrt. */
const ZURUECKNEHMEN_SQL = `
  UPDATE capacity_posts cp
     SET status = 'archived', is_active = FALSE, updated_at = NOW()
   WHERE cp.quelle = 'live_belegschaft'
     AND cp.status IN ('draft', 'active', 'paused')
     AND EXISTS (
       SELECT 1 FROM worker_profiles wp
        WHERE wp.id = cp.worker_profile_id
          AND (wp.marktpraesenz_deaktiviert = TRUE OR wp.is_active = FALSE)
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
     )`;

/**
 * Vollstaendiger Sweep: (1) Ruecknahme abgeschalteter Kraefte,
 * (2) Wiederkehr wieder eingeschalteter, (3) fehlende Angebote anlegen.
 * Reihenfolge ist Absicht: erst aufraeumen, dann anlegen — sonst legt (3)
 * an, was (1) im selben Lauf wieder wegnimmt.
 *
 * Der Aufrufer (Cron staffing-maintenance) laesst DANACH
 * `workerOfferReservationService.sweepReservations` laufen, damit Angebote
 * gebundener Kraefte pausiert sind, bevor irgendjemand den Feed liest.
 */
export async function sweepMarktpraesenz(pool) {
  const zurueck = await pool.query(`${ZURUECKNEHMEN_SQL} RETURNING cp.id`);
  const wieder = await pool.query(`${WIEDERHERSTELLEN_SQL} RETURNING cp.id`);
  const neu = await pool.query(`${MATERIALISIEREN_SQL} RETURNING id`);
  /* Die Luecke wird MITGEMESSEN, nicht verschluckt (Plan J §0.12, "No silent
   * caps"): eine aktive, praesente Kraft ohne Katalog-Skill oder ohne Ort
   * kann nicht materialisiert werden — sie ist am Markt unsichtbar, und
   * niemand wuerde es merken. Gemessen am 2026-08-26 traf das 30 von 33
   * Kraeften (3 mit Katalog-Skill). Diese Zahlen speisen die Aufsicht
   * (Welle J6) und den Hinweis auf der Agenturtafel (Welle J2c). */
  const luecke = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM worker_profile_skills s WHERE s.worker_profile_id = wp.id
      ))::int AS ohne_skill,
      COUNT(*) FILTER (WHERE (wp.city IS NULL OR wp.city = '') AND EXISTS (
        SELECT 1 FROM worker_profile_skills s WHERE s.worker_profile_id = wp.id
      ))::int AS ohne_ort
      FROM worker_profiles wp
     WHERE wp.is_active = TRUE
       AND wp.marktpraesenz_deaktiviert = FALSE`);
  return {
    zurueckgenommen: zurueck.rowCount || 0,
    wiederhergestellt: wieder.rowCount || 0,
    materialisiert: neu.rowCount || 0,
    unsichtbar_ohne_skill: luecke.rows[0]?.ohne_skill || 0,
    unsichtbar_ohne_ort: luecke.rows[0]?.ohne_ort || 0
  };
}

/**
 * Der Praesenz-Schalter fuer EINE Kraft — der Weg, den die Agenturtafel
 * (Welle J2c) aufruft. Setzt den Ausschalter und zieht die Folgen sofort
 * nach, statt auf den naechsten Cron-Takt zu warten: wer abschaltet, will
 * die Kraft JETZT nicht mehr im Marktplatz sehen.
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
  const folgen = await sweepMarktpraesenz(pool);
  return { worker_profile_id: rows[0].id, marktpraesenz_deaktiviert: rows[0].marktpraesenz_deaktiviert, ...folgen };
}
