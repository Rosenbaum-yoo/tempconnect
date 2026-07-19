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
  const { rows } = await pool.query(
    `SELECT id, name, category, aliases, usage_count
       FROM platform_skills
      ${includeInactive ? "" : "WHERE is_active = TRUE"}
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
  const { rows } = await pool.query(
    `SELECT id, name, category
       FROM platform_skills
      WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
    [ids]
  );
  return rows;
}
