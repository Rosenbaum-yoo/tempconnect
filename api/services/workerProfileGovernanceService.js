/**
 * workerProfileGovernanceService — Auskunft und Löschung für Menschen OHNE Konto
 * (P10 Spur D / Welle D6, Owner-Entscheidung D-E3 = Weg **(a)**).
 *
 * WARUM EINE EIGENE DATEI UND KEIN ZUSATZ IN dataGovernanceService
 * Die dortigen Pfade (`anonymizeUser`, `deleteWorkerData`) nehmen eine KONTO-ID
 * und sind auditiert. Weg (a) hiess ausdruecklich: an ihnen aendert sich nichts.
 * Ein zweiter Einstieg neben ihnen ist additiv und laesst die geprueften Pfade
 * unberuehrt — die Alternative (beide Funktionen nehmen Konto- ODER Profil-ID)
 * haette jeden Aufrufer eines Loeschpfads beruehrt.
 *
 * DIE LEITPLANKE (Erkenntnis 2026-08-03, CLAUDE.md)
 * "Fallback-Pfade in Loesch-/Compliance-Flows sind selbst sicherheitskritisch —
 * ein Notnagel feuert genau in den Faellen, die die Schutzlogik verhindern soll."
 * Hier gibt es deshalb KEINEN Fallback: schlaegt die Anonymisierung fehl, rollt
 * die Transaktion zurueck und der Fehler steigt auf. Niemals ein Hard-Delete als
 * Ersatz — das verletzte Aufbewahrungspflichten (HGB §257) genau dann, wenn die
 * Schutzlogik ohnehin schon nicht griff.
 *
 * D6.1 — DIE KARTIERUNG (an der Datenbank gemessen, 2026-08-13)
 * `information_schema` kennt 17 Tabellen, die einen Mitarbeiter adressieren:
 *
 *   AM PROFIL (worker_profile_id) — kann ein Mensch OHNE Konto haben:
 *     worker_absences · worker_profile_skills · worker_status_events
 *     worker_invites (fuehrt beides) · capacity_posts · capacity_post_pool_members
 *
 *   AM KONTO (worker_user_id) — fuer ein Profil ohne Konto strukturell LEER:
 *     worker_assignment_links · worker_time_submissions · worker_complaints
 *     worker_profile_documents · company_worker_blocklist
 *     assignment_staffing_{invites,reservations,waitlist,messages,
 *                          choice_sets,choice_options}
 *
 * Das ist kein Argument, sie wegzulassen: sobald derselbe Mensch spaeter
 * eingeladen wird, haengt sein Profil an einem Konto (Mig 176) und die
 * Konto-Tabellen fuellen sich. Die Auskunft liest deshalb BEIDE Seiten — ueber
 * `user_id`, wenn es eine gibt. So liefert sie fuer einen Menschen ohne Konto
 * denselben Umfang wie fuer einen mit, ohne zwei Funktionen zu brauchen.
 */

import { withTransaction } from "../utils/transaction.js";

/** Wie bei den mutierenden OCC-Aktionen: eine Begruendung, die etwas erklaert. */
const REASON_MIN = 10;
const GELOESCHT = "[Gelöscht]";

/**
 * Profil org-gebunden aufloesen. Trennt "gibt es nicht" von "gehoert einem
 * anderen Betrieb" — und zwar nur auf dem Fehlerpfad.
 */
async function profilImBetrieb(pool, orgId, profileId) {
  if (!orgId || !profileId) return { error: "MISSING_PARAMS", status: 400 };
  const { rows } = await pool.query(
    `SELECT wp.* FROM worker_profiles wp WHERE wp.id = $2 AND wp.supplier_org_id = $1`,
    [orgId, profileId]
  );
  if (rows[0]) return { profil: rows[0] };

  const { rows: fremd } = await pool.query(
    `SELECT supplier_org_id FROM worker_profiles WHERE id = $1`, [profileId]
  );
  if (!fremd[0]) return { error: "NOT_FOUND", status: 404 };
  return { error: "ORG_BOUNDARY_VIOLATION", status: 403 };
}

/**
 * Art. 15 DSGVO — Auskunft ueber einen Mitarbeiter, adressiert ueber sein PROFIL.
 *
 * Funktioniert fuer Menschen mit und ohne Konto. Die konto-gebundenen Abschnitte
 * bleiben leer, wenn es kein Konto gibt — das ist die Wahrheit, kein Fehler, und
 * die Antwort sagt es ausdruecklich (`hat_konto`).
 *
 * @returns {{available:true, ...}|{error:string,status:number}}
 */
export async function exportWorkerProfileData(pool, orgId, profileId) {
  const auf = await profilImBetrieb(pool, orgId, profileId);
  if (auf.error) return auf;
  const profil = auf.profil;
  const userId = profil.user_id || null;

  /* Am Profil haengend — immer lesbar. */
  const [absenzen, faehigkeiten, zustaende, einladungen] = await Promise.all([
    pool.query(
      `SELECT art, von, bis, notiz, erfasst_am, aufgehoben_am, aufhebung_grund
         FROM worker_absences WHERE worker_profile_id = $1 ORDER BY von DESC`, [profileId]),
    pool.query(
      `SELECT ps.name FROM worker_profile_skills wps
         JOIN platform_skills ps ON ps.id = wps.skill_id
        WHERE wps.worker_profile_id = $1 ORDER BY ps.name`, [profileId]),
    pool.query(
      `SELECT von_zustand, nach_zustand, ausgeloest_durch, zeitpunkt
         FROM worker_status_events WHERE worker_profile_id = $1
        ORDER BY zeitpunkt DESC LIMIT 500`, [profileId]),
    pool.query(
      `SELECT email, status, created_at, accepted_at
         FROM worker_invites WHERE worker_profile_id = $1 ORDER BY created_at DESC`, [profileId])
  ]);

  /* Am Konto haengend — nur wenn es eines gibt. Ohne diesen Zweig waere die
   * Auskunft fuer einen eingeladenen Mitarbeiter unvollstaendig, und genau das
   * verlangt Gate D6 ("derselbe Umfang wie fuer einen mit Konto"). */
  let einsaetze = { rows: [] };
  let stundenzettel = { rows: [] };
  let dokumente = { rows: [] };
  let beschwerden = { rows: [] };
  if (userId) {
    [einsaetze, stundenzettel, dokumente, beschwerden] = await Promise.all([
      pool.query(
        `SELECT client_name, location_address, start_date, end_date, is_active, is_montage
           FROM worker_assignment_links WHERE worker_user_id = $1 ORDER BY start_date DESC`, [userId]),
      pool.query(
        `SELECT week_start, week_end, total_hours, status, submitted_at
           FROM worker_time_submissions
          WHERE worker_user_id = $1 ORDER BY week_start DESC LIMIT 500`, [userId]),
      pool.query(
        `SELECT category, title, original_name, status, created_at
           FROM worker_profile_documents
          WHERE worker_user_id = $1 ORDER BY created_at DESC`, [userId]),
      pool.query(
        `SELECT severity, reason, status, created_at FROM worker_complaints
          WHERE worker_user_id = $1 ORDER BY created_at DESC`, [userId])
    ]);
  }

  return {
    available: true,
    hat_konto: Boolean(userId),
    stammdaten: {
      id: profil.id, personalnummer: profil.personnel_number,
      vorname: profil.first_name, nachname: profil.last_name,
      telefon: profil.phone, strasse: profil.street,
      plz: profil.postal_code, ort: profil.city, land: profil.country,
      geburtsdatum: profil.date_of_birth, iban_last4: profil.iban_last4,
      notizen: profil.notes, aktiv: profil.is_active, erfasst_am: profil.created_at
    },
    abwesenheiten: absenzen.rows,
    faehigkeiten: faehigkeiten.rows.map((r) => r.name),
    zustandsverlauf: zustaende.rows,
    einladungen: einladungen.rows,
    einsaetze: einsaetze.rows,
    stundenzettel: stundenzettel.rows,
    dokumente: dokumente.rows,
    beschwerden: beschwerden.rows,
    scope: { supplier_org_id: orgId, worker_profile_id: profileId },
    generated_at: new Date().toISOString()
  };
}

/**
 * Art. 17 DSGVO — Anonymisierung eines Mitarbeiters ueber sein PROFIL.
 *
 * Anonymisiert, loescht NICHT: Einsatz-, Stundenzettel- und Rechnungsbezuege
 * unterliegen der Aufbewahrung (HGB §257). Entfernt werden nur die Angaben, die
 * den Menschen identifizieren — die Vorgaenge bleiben als Zahlenwerk bestehen.
 *
 * @returns {{success:true, anonymisierte_tabellen:string[]}|{error:string,status:number}}
 */
export async function anonymizeWorkerProfile(pool, orgId, profileId, { actorId = null, reason = "" } = {}) {
  const grund = String(reason || "").trim();
  if (grund.length < REASON_MIN) return { error: "REASON_REQUIRED", status: 400, min: REASON_MIN };

  const auf = await profilImBetrieb(pool, orgId, profileId);
  if (auf.error) return auf;
  if (auf.profil.first_name === GELOESCHT && auf.profil.last_name === GELOESCHT) {
    // Zweimal anonymisieren ist kein stiller Erfolg — sonst zaehlt das Audit
    // einen Vorgang, der gar nicht stattgefunden hat.
    return { error: "ALREADY_ANONYMIZED", status: 409 };
  }

  /* Kein try/catch um den Block: schlaegt etwas fehl, rollt withTransaction
   * zurueck und der Fehler steigt zur Route auf (500). Ein Auffangzweig, der
   * stattdessen hart loescht, waere genau der Notnagel, der in den kritischen
   * Faellen feuert. */
  const tabellen = await withTransaction(pool, async (client) => {
    const t = [];

    await client.query(
      `UPDATE worker_profiles
          SET first_name = $2, last_name = $2, phone = NULL, street = NULL,
              postal_code = NULL, city = NULL, date_of_birth = NULL,
              iban_last4 = NULL, notes = NULL, is_active = FALSE, updated_at = NOW()
        WHERE id = $1 AND supplier_org_id = $3`,
      [profileId, GELOESCHT, orgId]
    );
    t.push("worker_profiles");

    // Abwesenheiten: der Zeitraum bleibt (Nachweis gegenueber dem Kunden), die
    // freie Notiz geht — dort steht erfahrungsgemaess Gesundheitliches.
    const abw = await client.query(
      `UPDATE worker_absences SET notiz = NULL
        WHERE worker_profile_id = $1 AND supplier_org_id = $2 AND notiz IS NOT NULL
        RETURNING id`, [profileId, orgId]);
    if (abw.rowCount) t.push("worker_absences");

    // Offene Einladungen an diesen Menschen sind Kontaktdaten ohne Vorgang.
    const einl = await client.query(
      `DELETE FROM worker_invites WHERE worker_profile_id = $1 RETURNING id`, [profileId]);
    if (einl.rowCount) t.push("worker_invites");

    /* Konto-gebundene Angaben nur, wenn es ein Konto gibt. Das users-Konto selbst
     * bleibt unberuehrt: dafuer gibt es anonymizeUser, und ein zweiter Pfad auf
     * dieselbe Zeile waere genau die Vermischung, die Weg (a) vermeiden sollte. */
    const userId = auf.profil.user_id;
    if (userId) {
      const dok = await client.query(
        `DELETE FROM worker_profile_documents WHERE worker_user_id = $1 RETURNING id`, [userId]);
      if (dok.rowCount) t.push("worker_profile_documents");

      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
      t.push("notifications");
    }

    /* Audit ist Pflicht und Teil derselben Transaktion: eine Anonymisierung ohne
     * Nachweis waere aus Sicht einer Pruefung nicht passiert. */
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, created_at)
       VALUES ($1, 'dsgvo.anonymize_worker_profile', 'worker_profile', $2, $3, NOW())`,
      [actorId, profileId, JSON.stringify({
        anonymized_tables: t, reason: grund, supplier_org_id: orgId,
        had_account: Boolean(userId), responsible_actor_user_id: actorId
      })]
    );

    return t;
  });

  return { success: true, anonymisierte_tabellen: tabellen, worker_profile_id: profileId };
}
