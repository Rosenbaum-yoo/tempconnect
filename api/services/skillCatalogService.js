/**
 * skillCatalogService.js — Zentraler Skill-Katalog (platform_skills)
 *
 * Aktiviert die seit Migration 023 vorhandene, aber bis Welle 1 ungenutzte
 * platform_skills-Tabelle. Liefert den Katalog kategoriegruppiert für die
 * Checkbox-UX ("erst Kategorie wählen -> dann Skills") im Onboarding sowie
 * später für den Multi-Skill-Angebotsgenerator und die Suche.
 *
 * Rein funktional: liest/normalisiert, hält keinen Zustand. Org-unabhängig —
 * der Katalog ist plattformweite Referenzdaten (kein Org-Scope nötig).
 */

// Kuratierte Reihenfolge der Branchen für eine stabile, sinnvolle UI.
// Kategorien, die (noch) nicht in dieser Liste stehen, werden alphabetisch
// hinten angehängt — der Katalog bleibt also robust gegen spätere Ergänzungen.
export const CATEGORY_ORDER = [
  "Pflege & Betreuung",
  "Medizin & Gesundheit",
  "Logistik & Lager",
  "Transport & Fahrdienst",
  "Bau & Handwerk",
  "Produktion & Industrie",
  "Gastronomie & Hotel",
  "Reinigung & Facility",
  "Sicherheit",
  "Büro & Verwaltung",
  "Handel & Verkauf",
  "Kundenservice & Callcenter",
  "IT & Fachkräfte",
  "Helfer & Allgemein"
];

const UNCATEGORIZED = "Sonstige";

function orderCategories(a, b) {
  const ia = CATEGORY_ORDER.indexOf(a);
  const ib = CATEGORY_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b, "de");
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

/**
 * Vollständiger Katalog, kategoriegruppiert.
 * Soft-Fail/Zero-State: bei leerem Katalog available:false + leere Arrays,
 * niemals ein Fehler (Enterprise-Pfeiler #2).
 *
 * @returns {Promise<{available:boolean,total:number,category_count:number,
 *   categories:Array<{category:string,skill_count:number,
 *   skills:Array<{id:string,name:string,aliases:string[],usage_count:number}>}>,
 *   generated_at:string}>}
 */
export async function getSkillCatalog(pool, { includeInactive = false } = {}) {
  // status='approved' (Mig 160): noch nicht kuratierte Vorschlaege einzelner
  // Arbeiter duerfen NICHT im Auswahlkatalog aller anderen auftauchen — sonst
  // zerfaellt die gemeinsame Matching-Achse in Schreibvarianten.
  const { rows } = await pool.query(
    `SELECT id, name, category, aliases, usage_count
       FROM platform_skills
      WHERE status = 'approved'${includeInactive ? "" : " AND is_active = TRUE"}
      ORDER BY category NULLS LAST, name ASC`
  );

  const byCat = new Map();
  for (const row of rows) {
    const cat = row.category || UNCATEGORIZED;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push({
      id: row.id,
      name: row.name,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      usage_count: Number(row.usage_count || 0)
    });
  }

  const categories = [...byCat.keys()]
    .sort(orderCategories)
    .map((category) => ({
      category,
      skill_count: byCat.get(category).length,
      skills: byCat.get(category)
    }));

  return {
    available: rows.length > 0,
    total: rows.length,
    category_count: categories.length,
    categories,
    generated_at: new Date().toISOString()
  };
}

/**
 * Nur die Kategorienamen (für Filter/Chips), in kuratierter Reihenfolge.
 */
export async function listCategories(pool) {
  const { rows } = await pool.query(
    `SELECT DISTINCT category
       FROM platform_skills
      WHERE is_active = TRUE AND category IS NOT NULL
      ORDER BY category`
  );
  return rows.map((r) => r.category).sort(orderCategories);
}

/**
 * Validiert eine Liste von Skill-IDs gegen den aktiven Katalog und gibt
 * die gefundenen {id, name, category} zurück. Basis für die spätere
 * Angebots-Generierung und für die Absicherung der Worker-Skill-Zuweisung.
 */
export async function resolveSkillIds(pool, skillIds = []) {
  const ids = [...new Set((skillIds || []).filter(Boolean))];
  if (!ids.length) return [];
  // Bewusst OHNE status-Filter: ein Arbeiter darf einen selbst vorgeschlagenen
  // Skill in seinem Profil fuehren, solange er kuratiert wird. Ausgeschlossen
  // wird er erst dort, wo er die ganze Plattform beruehrt (Katalog, Angebote).
  const { rows } = await pool.query(
    `SELECT id, name, category, status
       FROM platform_skills
      WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
    [ids]
  );
  return rows;
}

/** Vergleichsform: Gross-/Kleinschreibung, Mehrfach-Leerzeichen und Rand egal. */
function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAS GEMEINSAME KATALOG-TOR (M4b.1, 2026-09-05)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WAS HIER FALSCH WAR, GEMESSEN AN DREI STELLEN:
 *
 *   `proposeSkill` legt an mit   status = 'proposed'   (Zeile weiter unten)
 *   `platform_skills.is_active`  NOT NULL DEFAULT TRUE (Mig 023)
 *
 * Ein frischer Vorschlag ist damit `is_active = TRUE, status = 'proposed'` —
 * und die beiden Wege in den Marktplatz pruefen VERSCHIEDENE Spalten:
 *
 *   marktpraesenzService (Automatik)      JOIN ... AND ps.is_active = TRUE
 *   capacityOfferGeneratorService (Hand)  AND ps.status = 'approved'
 *
 * Die Automatik nahm den unkuratierten Vorschlag also MIT. Der manuelle Weg
 * lehnte ihn ab — und sein Kommentar begruendet ausdruecklich, warum das nicht
 * passieren darf ("sonst stuende im Marktplatz eine Faehigkeit, nach der
 * niemand sucht"). Beides gleichzeitig ist unwahr, und der Weg, der laeuft, ist
 * der falsche: waehrend das Portal dem Menschen sagt "wir pruefen sie, danach
 * zaehlt sie", stand sie laengst oeffentlich im Markt.
 *
 * Die Gegenrichtung war genauso offen: der manuelle Weg nahm eine
 * `approved`-Faehigkeit auch dann, wenn sie inzwischen DEAKTIVIERT wurde.
 *
 * BEIDE SPALTEN, EIN ORT. Nicht zwei Zeilen, die zufaellig dasselbe sagen —
 * die sind heute schon auseinandergelaufen. Wer eine Bedingung aendert, aendert
 * sie fuer jeden Veroeffentlichungsweg.
 *
 * WAS HIER BEWUSST NICHT DURCHGESETZT WIRD: das Tor gilt fuer die
 * VEROEFFENTLICHUNG, nicht fuer das Zuordnen. Ein Mensch darf einen Vorschlag
 * an sein Profil haengen (M4b.3: "Pflicht ist mindestens eine Faehigkeit — ein
 * Vorschlag zaehlt dafuer"), und die Namensaufloesung muss Vorschlaege sehen,
 * sonst entstuende bei jeder Schreibweise ein neuer. Oeffentlich wird er erst
 * nach der Kuratierung.
 *
 * @param {string} alias Der Tabellen-Alias von `platform_skills` in der Abfrage.
 * @returns {string} Eine SQL-Bedingung fuer die WHERE- oder JOIN-Klausel.
 */
export function katalogTorSql(alias = "ps") {
  const a = String(alias || "ps").trim();
  return `${a}.is_active = TRUE AND ${a}.status = 'approved'`;
}

/**
 * Eigene Faehigkeit eintragen (Mig 160).
 *
 * Erst suchen, dann anlegen — und zwar in dieser Reihenfolge, weil der haeufigste
 * Fall NICHT eine neue Faehigkeit ist, sondern eine andere Schreibweise einer
 * vorhandenen ("Stapler" fuer "Gabelstaplerfahrer"). Wird ein Treffer gefunden,
 * bekommt der Arbeiter den KURATIERTEN Skill — damit ist er sofort auffindbar,
 * ohne dass jemand etwas freigeben muss.
 *
 * Erst wenn wirklich nichts passt, entsteht ein Vorschlag (status='proposed').
 * Er gehoert dem Arbeiter, ist fuer seine Agentur sichtbar und wartet auf
 * Kuratierung — er verschmutzt aber weder den Katalog noch den Marktplatz.
 *
 * @returns {Promise<{skill:{id,name,category,status}, matched:boolean, matched_on:'name'|'alias'|null}>}
 */
export async function proposeSkill(pool, { name, userId = null, orgId = null, category = null }) {
  const clean = normalizeName(name);
  if (clean.length < 2 || clean.length > 100) {
    throw Object.assign(new Error("INVALID_SKILL_NAME"), { code: "INVALID_SKILL_NAME" });
  }

  // 1) Exakter Name (case-insensitive) unter den kuratierten Skills
  const byName = await pool.query(
    `SELECT id, name, category, status
       FROM platform_skills
      WHERE status = 'approved' AND is_active = TRUE AND LOWER(name) = LOWER($1)
      LIMIT 1`,
    [clean]
  );
  if (byName.rows[0]) return { skill: byName.rows[0], matched: true, matched_on: "name" };

  // 2) Bekannte Schreibvariante (aliases[]). Genau dafuer gibt es die Spalte.
  const byAlias = await pool.query(
    `SELECT id, name, category, status
       FROM platform_skills
      WHERE status = 'approved' AND is_active = TRUE
        AND EXISTS (
          SELECT 1 FROM unnest(aliases) a WHERE LOWER(a) = LOWER($1)
        )
      LIMIT 1`,
    [clean]
  );
  if (byAlias.rows[0]) return { skill: byAlias.rows[0], matched: true, matched_on: "alias" };

  // 3) Wirklich neu -> Vorschlag. ON CONFLICT (name) faengt den Fall ab, dass
  //    zwei Arbeiter zeitgleich dieselbe Faehigkeit vorschlagen: der zweite
  //    bekommt denselben Datensatz statt eines Fehlers.
  const inserted = await pool.query(
    `INSERT INTO platform_skills (name, category, status, proposed_by_user_id, proposed_by_org_id)
     VALUES ($1, $2, 'proposed', $3, $4)
     ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
     RETURNING id, name, category, status`,
    [clean, category, userId, orgId]
  );
  return { skill: inserted.rows[0], matched: false, matched_on: null };
}
