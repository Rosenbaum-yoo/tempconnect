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

import { logger } from "../config/index.js";
import { withTransaction } from "../utils/transaction.js";

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

/* ═══════════════════════════════════════════════════════════════════════════
   N8.1b-7 — DAS VENTIL WIRD GELEERT
   ═══════════════════════════════════════════════════════════════════════════

   Der Vorschlagsweg ist seit Migration 160 gebaut, und er ist richtig gebaut:
   ein vorgeschlagener Begriff erreicht den Markt NIE ungeprueft (der Katalog
   liefert nur `approved`, das Katalog-Tor verlangt dasselbe). Genau deshalb
   ist er unter dem Owner-Entscheid vom 2026-09-22 ("keine Freitexte mehr") das
   EINZIGE Ventil: wer einen Begriff braucht, den es nicht gibt, kann nur noch
   hier hinein.

   GEMESSEN AM 2026-09-22: `status='proposed'` wird von KEINER Zeile im ganzen
   Stack gelesen — kein Endpunkt, keine Flaeche, kein Staff CC. Und
   `merged_into_skill_id` schreibt niemand. Der Arbeiter hoert "wird geprueft",
   und geprueft wird nie. Ein Ventil, das niemand leert, laeuft ueber.

   DREI AUSGAENGE, und der dritte ist der haeufigste:

     annehmen   der Begriff fehlte wirklich -> er wird Katalogeintrag
     ablehnen   kein Gewerk, Tippfehler, Unsinn -> stillgelegt
     zuordnen   es gibt ihn schon, anders geschrieben -> er wird ALIAS am
                vorhandenen Eintrag, und alle Zuordnungen wandern mit

   Warum der dritte der haeufigste ist, steht in den Daten: von 54
   katalogfremden Eintraegen im Markt sind 20 allein "Lagerhelfer" gegen
   "Lagerhelfer:in". Ein Alias loest die auf einen Schlag auf — und zwar
   DAUERHAFT, weil `proposeSkill` beim naechsten Mal ueber genau diesen Alias
   trifft und gar kein Vorschlag mehr entsteht.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Vergleichsform fuer den Zuordnungsvorschlag: wie im Browser (`katalogFeld.js`). */
function vergleichsform(wert) {
  return String(wert || "")
    .toLowerCase()
    .replace(/:in\b/g, "")
    .replace(/[\s\-_/]+/g, "")
    .replace(/[\u00e4\u00f6\u00fc\u00df]/g, (c) => ({ "\u00e4": "ae", "\u00f6": "oe", "\u00fc": "ue", "\u00df": "ss" }[c]))
    .trim();
}

/**
 * Offene Vorschlaege mit Zuordnungsvorschlag.
 *
 * WARUM DER ZUORDNUNGSVORSCHLAG HIER ENTSTEHT und nicht in der Oberflaeche:
 * er entscheidet nichts, aber er bestimmt, wie lange eine Kuratierung dauert.
 * Wer "Lagerhelfer" sieht und daneben "Lagerhelfer:in" vorgeschlagen bekommt,
 * ist in zwei Sekunden fertig; wer 162 Eintraege durchsuchen muss, vertagt.
 *
 * EINE Abfrage fuer die Vorschlaege, EINE fuer den Katalog — kein N+1. Der
 * Katalog hat 162 Zeilen; die Aehnlichkeit im Arbeitsspeicher zu rechnen ist
 * billiger als 162 Abfragen und braucht keine Erweiterung (pg_trgm).
 *
 * Wirft nie: eine Aufsichtsliste darf die Seite nicht mitreissen.
 */
export async function listeVorschlaege(pool, { limit = 100 } = {}) {
  const leer = { verfuegbar: false, anzahl: 0, vorschlaege: [] };
  if (!pool || typeof pool.query !== "function") return leer;

  let offen = [];
  let katalog = [];
  try {
    const [v, k] = await Promise.all([
      pool.query(
        `SELECT ps.id, ps.name, ps.category, ps.created_at,
                ps.proposed_by_user_id, ps.proposed_by_org_id,
                o.name AS org_name,
                (SELECT COUNT(*) FROM worker_profile_skills wps
                  WHERE wps.skill_id = ps.id)::int AS traeger
           FROM platform_skills ps
           LEFT JOIN organizations o ON o.id = ps.proposed_by_org_id
          WHERE ps.status = 'proposed'
          ORDER BY ps.created_at ASC
          LIMIT $1`, [Math.min(Math.max(Number(limit) || 100, 1), 500)]),
      pool.query(
        `SELECT id, name, aliases FROM platform_skills
          WHERE status = 'approved' AND is_active = TRUE`)
    ]);
    offen = v.rows || [];
    katalog = k.rows || [];
  } catch (e) {
    logger.warn({ err: e?.message }, "Offene Faehigkeits-Vorschlaege konnten nicht gelesen werden");
    return leer;
  }

  const vorschlaege = offen.map((v) => {
    const form = vergleichsform(v.name);
    /* Naheliegend heisst: der Katalogeintrag faengt mit dem Vorschlag an oder
       umgekehrt. Das trifft genau die Schreibvarianten ("Lagerhelfer" ->
       "Lagerhelfer:in") und laesst fremde Gewerke aussen vor. */
    const nahe = katalog.filter((k) => {
      const kf = vergleichsform(k.name);
      if (!kf || !form) return false;
      return kf.indexOf(form) === 0 || form.indexOf(kf) === 0
        || (k.aliases || []).some((a) => vergleichsform(a).indexOf(form) === 0);
    }).slice(0, 5).map((k) => ({ id: k.id, name: k.name }));

    return {
      id: v.id,
      name: v.name,
      kategorie: v.category || null,
      seit: v.created_at,
      traeger: Number(v.traeger) || 0,
      vorgeschlagen_von_org: v.org_name || null,
      zuordnungsvorschlag: nahe
    };
  });

  return { verfuegbar: true, anzahl: vorschlaege.length, vorschlaege };
}

/**
 * Die drei Ausgaenge, in der Reihenfolge ihrer HAEUFIGKEIT — nicht in der
 * Reihenfolge, in der man sie sich ausdenkt. Wer kuratiert, soll die
 * haeufigste Antwort zuerst sehen: von 54 katalogfremden Eintraegen im Markt
 * sind 20 allein "Lagerhelfer" gegen "Lagerhelfer:in" — eine Zuordnung, keine
 * neue Faehigkeit. Eine Oberflaeche, die "annehmen" zuerst anbietet, laesst den
 * Katalog wachsen, wo er nur praeziser werden sollte.
 */
export const VORSCHLAG_ENTSCHEIDUNGEN = Object.freeze(["zuordnen", "annehmen", "ablehnen"]);

/**
 * Einen Vorschlag entscheiden.
 *
 * ALLES IN EINER TRANSAKTION, und zwar aus einem Grund: beim Zuordnen haengen
 * drei Schreibvorgaenge zusammen (Alias am Ziel, Zuordnungen umhaengen,
 * Vorschlag stilllegen). Bricht einer davon ab, stuende eine Faehigkeit an
 * einem stillgelegten Eintrag — der Arbeiter haette sie dann verloren.
 *
 * @param {import('pg').Pool} pool
 * @param {{vorschlagId: string, entscheidung: string, zielSkillId?: string,
 *          grund: string, actorId?: string}} eingabe
 */
export async function entscheideVorschlag(pool, eingabe = {}) {
  const { vorschlagId, entscheidung, zielSkillId = null, grund = "", actorId = null } = eingabe;

  if (!vorschlagId) throw Object.assign(new Error("VORSCHLAG_FEHLT"), { code: "VORSCHLAG_FEHLT" });
  if (!VORSCHLAG_ENTSCHEIDUNGEN.includes(entscheidung)) {
    throw Object.assign(new Error("UNBEKANNTE_ENTSCHEIDUNG"), { code: "UNBEKANNTE_ENTSCHEIDUNG" });
  }
  /* Begruendungspflicht wie bei jeder mutierenden Staff-Aktion. Der Katalog
     ist plattformweite Wahrheit; wer ihn aendert, sagt warum. */
  if (String(grund || "").trim().length < 10) {
    throw Object.assign(new Error("BEGRUENDUNG_FEHLT"), { code: "BEGRUENDUNG_FEHLT" });
  }
  if (entscheidung === "zuordnen" && !zielSkillId) {
    throw Object.assign(new Error("ZIEL_FEHLT"), { code: "ZIEL_FEHLT" });
  }

  return withTransaction(pool, async (client) => {
    /* Gesperrt lesen: zwei Kuratierende duerfen denselben Vorschlag nicht
       gleichzeitig entscheiden. */
    const { rows: gefunden } = await client.query(
      `SELECT id, name, status FROM platform_skills WHERE id = $1 FOR UPDATE`, [vorschlagId]);
    const vorschlag = gefunden[0];
    if (!vorschlag) throw Object.assign(new Error("NICHT_GEFUNDEN"), { code: "NICHT_GEFUNDEN" });
    if (vorschlag.status !== "proposed") {
      throw Object.assign(new Error("SCHON_ENTSCHIEDEN"), { code: "SCHON_ENTSCHIEDEN" });
    }

    if (entscheidung === "annehmen") {
      await client.query(
        `UPDATE platform_skills
            SET status = 'approved', is_active = TRUE, updated_at = NOW()
          WHERE id = $1`, [vorschlagId]);
      return { entscheidung, name: vorschlag.name, ziel: null, umgehaengt: 0 };
    }

    if (entscheidung === "ablehnen") {
      await client.query(
        `UPDATE platform_skills
            SET status = 'rejected', is_active = FALSE, updated_at = NOW()
          WHERE id = $1`, [vorschlagId]);
      return { entscheidung, name: vorschlag.name, ziel: null, umgehaengt: 0 };
    }

    /* ── zuordnen ────────────────────────────────────────────────────── */
    const { rows: zielZeilen } = await client.query(
      `SELECT id, name FROM platform_skills
        WHERE id = $1 AND status = 'approved' AND is_active = TRUE`, [zielSkillId]);
    const ziel = zielZeilen[0];
    if (!ziel) throw Object.assign(new Error("ZIEL_UNGUELTIG"), { code: "ZIEL_UNGUELTIG" });
    if (String(ziel.id) === String(vorschlagId)) {
      throw Object.assign(new Error("ZIEL_IST_VORSCHLAG"), { code: "ZIEL_IST_VORSCHLAG" });
    }

    /* 1. Der Name wird ALIAS am Ziel — das ist der eigentliche Gewinn: beim
          naechsten Mal trifft `proposeSkill` sofort, und es entsteht gar kein
          Vorschlag mehr. Ohne diesen Schritt waere die Zuordnung eine
          Einmal-Aufraeumung statt einer Regel. */
    await client.query(
      `UPDATE platform_skills
          SET aliases = (
                SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(aliases, '{}') || ARRAY[$2::text]))
              ),
              updated_at = NOW()
        WHERE id = $1
          AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(aliases, '{}')) a
                           WHERE LOWER(a) = LOWER($2))`,
      [ziel.id, vorschlag.name]);

    /* 2. Wer den Vorschlag UND das Ziel traegt, verliert die Dublette —
          sonst schluege die Eindeutigkeit (worker_profile_id, skill_id) zu. */
    await client.query(
      `DELETE FROM worker_profile_skills alt
        WHERE alt.skill_id = $1
          AND EXISTS (SELECT 1 FROM worker_profile_skills neu
                       WHERE neu.worker_profile_id = alt.worker_profile_id
                         AND neu.skill_id = $2)`,
      [vorschlagId, ziel.id]);

    /* 3. Die uebrigen wandern mit. Ohne diesen Schritt haette der Arbeiter
          seine Faehigkeit an einem stillgelegten Eintrag — also verloren. */
    const { rowCount: umgehaengt } = await client.query(
      `UPDATE worker_profile_skills SET skill_id = $2, updated_at = NOW()
        WHERE skill_id = $1`, [vorschlagId, ziel.id]);

    await client.query(
      `UPDATE platform_skills
          SET status = 'merged', is_active = FALSE,
              merged_into_skill_id = $2, updated_at = NOW()
        WHERE id = $1`, [vorschlagId, ziel.id]);

    return {
      entscheidung,
      name: vorschlag.name,
      ziel: { id: ziel.id, name: ziel.name },
      umgehaengt: Number(umgehaengt) || 0,
      actorId
    };
  });
}

