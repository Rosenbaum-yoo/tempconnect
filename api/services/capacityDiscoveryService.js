/**
 * Capacity Discovery Service.
 * Aggregated views of active capacity for real-time workforce visibility.
 * "5 electricians available in Stuttgart" style summaries.
 */

const COMMERCIAL_COMMITMENT_JOIN = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(
      CASE
        WHEN o.status = 'accepted'
          AND COALESCE(o.agreement_status, 'none') NOT IN ('cancelled', 'expired')
        THEN GREATEST(COALESCE(o.offered_quantity, dr.headcount, 0), 0)
        ELSE 0
      END
    ), 0)::int AS committed_headcount
    FROM offers o
    JOIN demand_requests dr ON dr.id = o.demand_request_id
    WHERE o.capacity_post_id = cp.id
  ) commercial_state ON TRUE
`;

const REMAINING_HEADCOUNT_SQL = `GREATEST(cp.headcount - COALESCE(commercial_state.committed_headcount, 0), 0)`;

/* -- Aggregate by Skill (N1.3) ------------------------- */

/**
 * Der Bestand JE FAEHIGKEIT - nicht je Rolle.
 *
 * WARUM ES DAS BRAUCHT. Der Plan zu Welle N1 nennt als Nachweis "je Faehigkeit
 * die Zahl verfuegbarer Kraefte, aus `capacity-discovery/by-role`". Gemessen am
 * 2026-09-06 stimmt das nicht: `aggregateByRole` gruppiert nach `cp.role`
 * ("Pflegekraft"), nicht nach `cp.skill_tags` ("Stapler"). Die Rolle beantwortet
 * eine andere Frage.
 *
 * Und die Frage der Faehigkeit ist die interessantere: wer im Auswahlkatalog
 * "Pick-by-Voice" anklickt und daneben eine 0 sieht, waehlt etwas anderes -
 * BEVOR er eine Ausschreibung schreibt, auf die sich niemand meldet. Genau
 * dafuer steht die Zahl neben der Faehigkeit und nicht in einem Bericht danach.
 *
 * `UNNEST` statt eines Treffers je Zeile: ein Eintrag mit drei Faehigkeiten
 * zaehlt bei allen dreien. Das ist gewollt - die Frage lautet "wie viele Kraefte
 * bringen diese Faehigkeit mit", nicht "wie viele Eintraege gibt es". Die Summen
 * ueber alle Faehigkeiten sind deshalb GROESSER als die Zahl der Kraefte; wer
 * sie addiert, addiert falsch. Deshalb liefert die Antwort auch keine
 * Gesamtsumme, die zum Addieren einlaedt.
 *
 * Dieselbe Rest-Rechnung wie ueberall in dieser Datei: bereits verbindlich
 * vergebene Koepfe zaehlen nicht mehr als verfuegbar.
 *
 * ZUR SCHREIBWEISE, und zwar ehrlich: `CROSS JOIN LATERAL UNNEST(...)` statt
 * `TRIM(UNNEST(...))`. Ich hatte beim Bauen angenommen, Postgres weise die
 * zweite Form ab - das ist FALSCH, sie laeuft (gemessen gegen PostgreSQL 16.12
 * am 2026-09-06, beide Formen liefern dasselbe). Der Grund ist ein anderer und
 * kleiner: eine mengenliefernde Funktion in der Auswahlliste entfaltet die
 * Zeilen implizit, und sobald eine ZWEITE dazukommt, laufen beide im Gleich-
 * schritt statt ueber Kreuz - eine Semantik, die man beim Lesen nicht sieht und
 * beim Erweitern falsch rät. Der laterale Verbund schreibt die Entfaltung hin.
 *
 * Die DB-gebundene Rauchprobe daneben bleibt trotzdem richtig: sie beweist,
 * dass Postgres die Abfrage versteht - was ein Muster-Zugang nie zeigen kann,
 * weil er sie nie ausfuehrt.
 *
 * Returns: [{ skill, entry_count, total_headcount, cities }]
 */
export async function aggregateBySkill(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'"];
  let idx = 1;

  if (filters.org_id) {
    where.push(`cp.org_id = $${idx}`); params.push(filters.org_id); idx++;
  }
  if (filters.city) {
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }
  if (filters.worker_category) {
    where.push(`cp.worker_category = $${idx}`); params.push(filters.worker_category); idx++;
  }
  /* Eine Vorauswahl von Faehigkeiten: die Oberflaeche fragt nur nach denen, die
     gerade auf dem Schirm stehen, statt den ganzen Katalog zu holen. */
  const skillFilter = Array.isArray(filters.skills) && filters.skills.length
    ? filters.skills.map((x) => String(x)).filter(Boolean)
    : null;

  const limit = Math.min(300, filters.limit || 200);

  let skillWhere = "";
  if (skillFilter && skillFilter.length) {
    skillWhere = ` WHERE LOWER(je.skill) = ANY($${idx}::text[])`;
    params.push(skillFilter.map((x) => x.toLowerCase()));
    idx++;
  }
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT je.skill,
            COUNT(*)::int AS entry_count,
            SUM(je.rest)::int AS total_headcount,
            ARRAY_AGG(DISTINCT je.location_city) FILTER (WHERE je.location_city IS NOT NULL) AS cities
       FROM (
         SELECT TRIM(t.skill) AS skill,
                cp.location_city,
                ${REMAINING_HEADCOUNT_SQL} AS rest
           FROM capacity_posts cp
           ${COMMERCIAL_COMMITMENT_JOIN}
           CROSS JOIN LATERAL UNNEST(cp.skill_tags) AS t(skill)
          WHERE ${where.join(" AND ")}
            AND ${REMAINING_HEADCOUNT_SQL} > 0
       ) je
      ${skillWhere}
      GROUP BY je.skill
      HAVING je.skill <> ''
      ORDER BY total_headcount DESC
      LIMIT $${idx}`,
    params
  );

  return rows.map((r) => ({
    skill: r.skill,
    entry_count: Number(r.entry_count) || 0,
    total_headcount: Number(r.total_headcount) || 0,
    cities: Array.isArray(r.cities) ? r.cities : []
  }));
}

/* ── Aggregate by Role ────────────────────────────────── */

/**
 * Groups active capacity entries by role.
 * Returns: [{ role, entry_count, total_headcount, cities, avg_headcount }]
 */
export async function aggregateByRole(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'"];
  let idx = 1;

  if (filters.org_id) {
    where.push(`cp.org_id = $${idx}`); params.push(filters.org_id); idx++;
  }
  if (filters.city) {
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }
  if (filters.worker_category) {
    where.push(`cp.worker_category = $${idx}`); params.push(filters.worker_category); idx++;
  }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.role,
       COUNT(*)::int AS entry_count,
       SUM(${REMAINING_HEADCOUNT_SQL})::int AS total_headcount,
       ROUND(AVG(${REMAINING_HEADCOUNT_SQL}), 1) AS avg_headcount,
       ARRAY_AGG(DISTINCT cp.location_city) FILTER (WHERE cp.location_city IS NOT NULL) AS cities
     FROM capacity_posts cp
     ${COMMERCIAL_COMMITMENT_JOIN}
     WHERE ${where.join(' AND ')}
       AND ${REMAINING_HEADCOUNT_SQL} > 0
     GROUP BY cp.role
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── Das Nachfragesignal (N7.1) ────────────────────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS DER PLAN ANNAHM, UND WAS GEMESSEN DASTAND (2026-09-05)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * N7.1 verspricht der Zeitarbeitsfirma einen Satz wie
 *
 *     "Im Raum Muenster werden 34 Pflegekraefte gesucht, verfuegbar sind 6."
 *
 * und der Plan sagt dazu: "Aus `capacity-discovery`, von der anderen Seite
 * gelesen". Das trifft nicht zu. Der Dienst liest ausschliesslich
 * `capacity_posts` — das ist die ANGEBOTSSEITE. Die Nachfrage liegt in einer
 * eigenen Tabelle, `demand_requests` (Mig 014). Aus einer Tabelle laesst sich
 * die andere Zahl nicht lesen, egal von welcher Seite.
 *
 * Die zweite Haelfte steht deshalb hier. Sie spiegelt `aggregateByRole` Zeile
 * fuer Zeile — gleiche Filter, gleiche Form, gleicher Deckel —, damit die
 * beiden Zahlen im Satz oben ueberhaupt vergleichbar sind. Zwei Aggregate mit
 * verschiedenen Filtern waeren ein Vergleich, der keiner ist.
 *
 * NUR OFFENE BEDARFE. `status = 'open'` — ein erfuellter oder geschlossener
 * Bedarf ist keine Nachfrage mehr, und ihn mitzuzaehlen hiesse, der Firma eine
 * Luecke zu zeigen, die es nicht gibt.
 *
 * @param {import('pg').Pool} pool
 * @param {{city?: string, role?: string, limit?: number}} filters
 * @returns {Promise<Array<{role: string, request_count: number, total_headcount: number, cities: string[]}>>}
 */
export async function aggregateDemandByRole(pool, filters = {}) {
  const params = [];
  const where = ["dr.status = 'open'"];
  let idx = 1;

  if (filters.city) {
    where.push(`LOWER(dr.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }
  if (filters.role) {
    where.push(`LOWER(dr.role) = LOWER($${idx})`); params.push(filters.role); idx++;
  }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       dr.role,
       COUNT(*)::int AS request_count,
       SUM(dr.headcount)::int AS total_headcount,
       ARRAY_AGG(DISTINCT dr.location_city) FILTER (WHERE dr.location_city IS NOT NULL) AS cities
     FROM demand_requests dr
     WHERE ${where.join(' AND ')}
     GROUP BY dr.role
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/**
 * Nachfrage und Angebot je Rolle nebeneinander — die Zahl, die N7.1 zeigt.
 *
 * BEIDE SEITEN IN EINEM AUFRUF, und zwar aus einem Grund: wer sie getrennt
 * holt, filtert sie zwangslaeufig irgendwann verschieden — und dann steht in
 * der Oberflaeche ein Vergleich, der keiner ist. Der Ort wird EINMAL
 * uebergeben und gilt fuer beide Haelften.
 *
 * Eine Rolle erscheint, wenn sie auf EINER Seite vorkommt. Gerade die Rollen
 * mit `verfuegbar: 0` sind die interessanten — sie sind die Antwort auf die
 * teuerste Frage der Firma: wen stelle ich als Naechstes ein.
 */
export async function getMarktLuecke(pool, filters = {}) {
  const [nachfrage, angebot] = await Promise.all([
    aggregateDemandByRole(pool, filters),
    aggregateByRole(pool, filters)
  ]);

  const nachRolle = new Map();
  for (const n of nachfrage) {
    nachRolle.set(String(n.role).toLowerCase(), {
      role: n.role,
      gesucht: Number(n.total_headcount) || 0,
      anfragen: Number(n.request_count) || 0,
      verfuegbar: 0,
      angebote: 0
    });
  }
  for (const a of angebot) {
    const schluessel = String(a.role).toLowerCase();
    const vorhanden = nachRolle.get(schluessel) || {
      role: a.role, gesucht: 0, anfragen: 0, verfuegbar: 0, angebote: 0
    };
    vorhanden.verfuegbar = Number(a.total_headcount) || 0;
    vorhanden.angebote = Number(a.entry_count) || 0;
    nachRolle.set(schluessel, vorhanden);
  }

  /* Die groesste Luecke zuerst: das ist die Zeile, wegen der die Firma
     hinsieht. Bei Gleichstand die groessere Nachfrage. */
  return [...nachRolle.values()]
    .map((z) => ({ ...z, luecke: z.gesucht - z.verfuegbar }))
    .sort((a, b) => (b.luecke - a.luecke) || (b.gesucht - a.gesucht));
}

/* ── Aggregate by Region ──────────────────────────────── */

/**
 * Groups active capacity entries by location_city.
 * Returns: [{ city, entry_count, total_headcount, roles }]
 */
export async function aggregateByRegion(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'", "cp.location_city IS NOT NULL"];
  let idx = 1;

  if (filters.org_id) {
    where.push(`cp.org_id = $${idx}`); params.push(filters.org_id); idx++;
  }
  if (filters.role) {
    where.push(`LOWER(cp.role) LIKE LOWER($${idx})`); params.push('%' + filters.role + '%'); idx++;
  }
  if (filters.worker_category) {
    where.push(`cp.worker_category = $${idx}`); params.push(filters.worker_category); idx++;
  }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.location_city AS city,
       LEFT(cp.location_postal, 2) AS postal_prefix,
       COUNT(*)::int AS entry_count,
       SUM(${REMAINING_HEADCOUNT_SQL})::int AS total_headcount,
       ARRAY_AGG(DISTINCT cp.role) AS roles
     FROM capacity_posts cp
     ${COMMERCIAL_COMMITMENT_JOIN}
     WHERE ${where.join(' AND ')}
       AND ${REMAINING_HEADCOUNT_SQL} > 0
     GROUP BY cp.location_city, LEFT(cp.location_postal, 2)
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── Aggregate by Category ────────────────────────────── */

/**
 * Groups active capacity entries by worker_category.
 * Returns: [{ category, entry_count, total_headcount, cities }]
 */
export async function aggregateByCategory(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'", "cp.worker_category IS NOT NULL"];
  let idx = 1;

  if (filters.org_id) {
    where.push(`cp.org_id = $${idx}`); params.push(filters.org_id); idx++;
  }
  if (filters.city) {
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }

  const limit = Math.min(100, filters.limit || 50);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.worker_category AS category,
       COUNT(*)::int AS entry_count,
       SUM(${REMAINING_HEADCOUNT_SQL})::int AS total_headcount,
       ARRAY_AGG(DISTINCT cp.location_city) FILTER (WHERE cp.location_city IS NOT NULL) AS cities,
       ARRAY_AGG(DISTINCT cp.role) AS roles
     FROM capacity_posts cp
     ${COMMERCIAL_COMMITMENT_JOIN}
     WHERE ${where.join(' AND ')}
       AND ${REMAINING_HEADCOUNT_SQL} > 0
     GROUP BY cp.worker_category
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/* ── Availability Summary ─────────────────────────────── */

/**
 * Human-readable summaries: "12 Lagerhelfer in Stuttgart verfuegbar ab 2026-03-10".
 * Returns top N summaries.
 */
export async function getAvailabilitySummary(pool, filters = {}) {
  const params = [];
  const where = ["cp.status = 'active'"];
  let idx = 1;

  if (filters.org_id) {
    where.push(`cp.org_id = $${idx}`); params.push(filters.org_id); idx++;
  }
  if (filters.city) {
    where.push(`LOWER(cp.location_city) = LOWER($${idx})`); params.push(filters.city); idx++;
  }
  if (filters.role) {
    where.push(`LOWER(cp.role) LIKE LOWER($${idx})`); params.push('%' + filters.role + '%'); idx++;
  }

  const limit = Math.min(50, filters.limit || 20);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT
       cp.role,
       cp.location_city AS city,
       SUM(${REMAINING_HEADCOUNT_SQL})::int AS total_headcount,
       MIN(cp.availability_from) AS earliest_available,
       COUNT(*)::int AS entry_count,
       COUNT(DISTINCT cp.supplier_company_id)::int AS supplier_count
     FROM capacity_posts cp
     ${COMMERCIAL_COMMITMENT_JOIN}
     WHERE ${where.join(' AND ')}
       AND ${REMAINING_HEADCOUNT_SQL} > 0
     GROUP BY cp.role, cp.location_city
     HAVING SUM(${REMAINING_HEADCOUNT_SQL}) > 0
     ORDER BY total_headcount DESC
     LIMIT $${idx}`,
    params
  );

  return rows.map(r => ({
    role: r.role,
    city: r.city,
    total_headcount: r.total_headcount,
    earliest_available: r.earliest_available,
    entry_count: r.entry_count,
    supplier_count: r.supplier_count,
    summary: `${r.total_headcount} ${r.role} in ${r.city || 'verschiedenen Regionen'} verfuegbar`
      + (r.earliest_available ? ` ab ${String(r.earliest_available).substring(0, 10)}` : '')
  }));
}
