/**
 * Deckt die eigene Belegschaft dieses Angebot? (Multi-Skill Welle 6)
 *
 * WARUM ES DIESEN DIENST GIBT
 * Das Angebotsformular war bis hierher reiner Freitext: der Disponent tippt eine Rolle,
 * ein paar Faehigkeiten und eine Kopfzahl — und niemand prueft, ob die Firma diese Leute
 * ueberhaupt hat. Wer "6 Pflegekraefte ab 01.09." einstellt und dann vier liefern kann,
 * verliert den Kunden beim ersten Mal. Genau davor warnt der Verfuegbarkeits-Dienst aus
 * Welle 2: ein Angebot, das die Agentur nicht halten kann, ist schaedlicher als keins.
 *
 * Dieser Dienst beantwortet die Frage VOR dem Absenden — mit Namen, nicht mit einer Zahl:
 * wer passt, wer ist im gewuenschten Zeitraum frei, wer ist verplant und bis wann.
 *
 * ZEITRAUM-BEZUG IST DER KERN
 * `buildPoolSuggestion` (Welle 4a) kennt nur "hat gerade einen Einsatz". Fuer ein Angebot,
 * das erst in sechs Wochen beginnt, ist das die falsche Frage: eine Kraft, deren Einsatz
 * naechste Woche endet, ist dafuer frei. Hier wird deshalb gegen den ANGEBOTENEN Zeitraum
 * geprueft — dieselbe Ueberlappungsregel wie `findWorkerScheduleConflicts`, damit Vorschau
 * und spaeterer Zuweisungs-Guard nicht auseinanderlaufen.
 *
 * EINE Abfrage fuer alle Kandidaten (kein N+1): die Belegschaft waechst mit jedem Kunden,
 * eine Abfrage pro Kraft waere bei 300 Kunden der teuerste Pfad im Formular.
 */
import { todayDE, dateOnlyDE } from "../utils/dateDE.js";

/** Zustand einer Kraft bezogen auf den angefragten Zeitraum. */
export const ZUSTAND = Object.freeze({
  FREI: "frei",
  VERPLANT: "verplant",
  SPAETER_FREI: "spaeter_frei",
  ABWESEND: "abwesend"
});

/** Ohne Enddatum rechnet die Ueberlappung gegen einen offenen Horizont. */
const OFFENES_ENDE = "9999-12-31";

function alsDatum(wert) {
  if (!wert) return null;
  if (typeof wert === "string") return wert.slice(0, 10);
  return dateOnlyDE(wert);
}

/**
 * Loest Freitext-Faehigkeiten gegen den Skill-Katalog auf.
 *
 * Das Formular kennt nur Freitext ("Pflegekraft, Nachtdienst"), der Katalog kennt Skills
 * mit Synonymen. Gematcht wird in dieser Reihenfolge: exakter Name, hinterlegtes Synonym,
 * Teiltreffer. Was sich nicht aufloesen laesst, wird als `unbekannte_faehigkeiten`
 * zurueckgegeben — die Oberflaeche sagt dann "dafuer fuehren wir keinen Katalog-Eintrag",
 * statt stillschweigend 0 Treffer zu zeigen und wie ein Fehler auszusehen.
 */
export async function resolveSkillTags(pool, tags = []) {
  const sauber = [...new Set(tags.map((t) => String(t || "").trim()).filter(Boolean))];
  if (!sauber.length) return { skills: [], unbekannte_faehigkeiten: [] };

  const klein = sauber.map((t) => t.toLowerCase());
  // Fuer den Teiltreffer muessen LIKE-Sonderzeichen maskiert werden, sonst ist ein
  // getipptes "%" eine Wildcard und liefert den GESAMTEN Katalog — die Suche taete dann
  // etwas anderes als das, was dasteht. Der unmaskierte Begriff bleibt fuer den exakten
  // Vergleich; beide Formen laufen deshalb als eigene Spalte mit.
  const fuerLike = klein.map((t) => t.replace(/([\\%_])/g, "\\$1"));
  const { rows } = await pool.query(
    `SELECT ps.id, ps.name, ps.category, t.suchbegriff
       FROM unnest($1::text[], $2::text[]) AS t(suchbegriff, muster)
       JOIN platform_skills ps
         ON ps.is_active = TRUE
        AND (lower(ps.name) = t.suchbegriff
             OR EXISTS (SELECT 1 FROM unnest(COALESCE(ps.aliases, ARRAY[]::text[])) a
                         WHERE lower(a) = t.suchbegriff)
             OR lower(ps.name) LIKE '%' || t.muster || '%' ESCAPE '\')
      ORDER BY (lower(ps.name) = t.suchbegriff) DESC, ps.name`,
    [klein, fuerLike]
  );

  const getroffen = new Set(rows.map((r) => r.suchbegriff));
  const skills = [];
  const gesehen = new Set();
  // Zuordnung Skill -> Suchbegriff. Sie ist der Grund, warum "alle Faehigkeiten" ueberhaupt
  // sinnvoll rechenbar ist: ein einziges "stapler" loest vier Katalog-Eintraege auf, und
  // "die Kraft muss alle vier haben" findet niemanden. Gefordert ist je Suchbegriff EIN
  // Treffer — das ist, was der Disponent meint, wenn er zwei Faehigkeiten nebeneinander tippt.
  const zuordnung = [];
  for (const r of rows) {
    zuordnung.push({ skill_id: r.id, gruppe: r.suchbegriff });
    if (gesehen.has(r.id)) continue;
    gesehen.add(r.id);
    skills.push({ id: r.id, name: r.name, category: r.category });
  }

  return {
    skills,
    zuordnung,
    unbekannte_faehigkeiten: sauber.filter((t) => !getroffen.has(t.toLowerCase()))
  };
}

/**
 * Prueft, ob die eigene Belegschaft ein geplantes Angebot deckt.
 *
 * @param {import('pg').Pool} pool
 * @param {object} p
 * @param {string} p.orgId            Agentur-Org (Org-Grenze, nicht verhandelbar)
 * @param {string[]} [p.skillTags]    Freitext-Faehigkeiten aus dem Formular
 * @param {string[]} [p.skillIds]     Bereits aufgeloeste Katalog-Skills (haben Vorrang)
 * @param {number} [p.headcount]      Angebotene Kopfzahl
 * @param {string} [p.from]           Beginn (YYYY-MM-DD), Vorgabe: heute
 * @param {string} [p.to]             Ende (YYYY-MM-DD), leer = offen
 * @param {boolean} [p.alleSkills]    true = Kraft muss ALLE Faehigkeiten haben (Buendel-Logik)
 */
export async function checkOfferCoverage(pool, {
  orgId, skillTags = [], skillIds = [], headcount = 1, from = null, to = null, alleSkills = false
}) {
  if (!orgId) throw Object.assign(new Error("ORG_REQUIRED"), { code: "ORG_REQUIRED" });

  const von = alsDatum(from) || todayDE();
  const bis = alsDatum(to);
  const gefordert = Math.max(1, Number(headcount) || 1);

  let skills = [];
  let unbekannt = [];
  let zuordnung = [];
  if (skillIds.length) {
    const { rows } = await pool.query(
      `SELECT id, name, category FROM platform_skills WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
      [[...new Set(skillIds)]]
    );
    skills = rows;
    // Ausdruecklich gewaehlte Skills sind je eine eigene Forderung.
    zuordnung = rows.map((s) => ({ skill_id: s.id, gruppe: s.id }));
  } else {
    const aufgeloest = await resolveSkillTags(pool, skillTags);
    skills = aufgeloest.skills;
    zuordnung = aufgeloest.zuordnung;
    unbekannt = aufgeloest.unbekannte_faehigkeiten;
  }

  // Ohne auswertbare Faehigkeit gibt es nichts zu rechnen. Das ist ein gueltiger
  // Zustand (leeres Formularfeld), kein Fehler — die Oberflaeche bleibt dann ruhig.
  if (!skills.length) {
    return {
      auswertbar: false,
      zeitraum: { von, bis },
      skills: [],
      unbekannte_faehigkeiten: unbekannt,
      gefordert,
      frei: 0,
      luecke: gefordert,
      kandidaten: []
    };
  }

  const zuordnungIds = zuordnung.map((z) => z.skill_id);
  const zuordnungGruppen = zuordnung.map((z) => String(z.gruppe));
  const gruppenAnzahl = new Set(zuordnungGruppen).size;
  // Eine Abfrage fuer die gesamte Belegschaft: Treffer, Ueberschneidungen im Zeitraum und
  // die Bindungslage. Die Ueberlappungsregel ist absichtlich Zeichen fuer Zeichen dieselbe
  // wie in findWorkerScheduleConflicts — sonst zeigt die Vorschau "frei" und der spaetere
  // Zuweisungs-Guard antwortet 409.
  const { rows } = await pool.query(
    `WITH forderung AS (
       SELECT * FROM unnest($1::uuid[], $7::text[]) AS f(skill_id, gruppe)
     ),
     kandidat AS (
       SELECT wp.id, wp.user_id, wp.first_name, wp.last_name, wp.city,
              wp.available_from,
              COUNT(DISTINCT f.gruppe) AS treffer,
              ARRAY_AGG(DISTINCT ps.name) AS treffer_namen
         FROM worker_profiles wp
         JOIN worker_profile_skills wps ON wps.worker_profile_id = wp.id
         JOIN forderung f ON f.skill_id = wps.skill_id
         JOIN platform_skills ps ON ps.id = wps.skill_id
        WHERE wp.supplier_org_id = $2 AND wp.is_active = TRUE
        GROUP BY wp.id
     )
     SELECT k.id AS worker_profile_id, k.first_name, k.last_name, k.city,
            k.available_from, k.treffer, k.treffer_namen,
            konflikt.anzahl        AS konflikt_anzahl,
            konflikt.bis           AS konflikt_bis,
            konflikt.offen         AS konflikt_offen,
            konflikt.kunde         AS konflikt_kunde,
            bindung.letztes_ende   AS letztes_ende,
            bindung.unbefristet    AS unbefristet,
            bindung.abwesend_ab    AS abwesend_ab,
            bindung.abwesenheitsgrund AS abwesenheitsgrund
       FROM kandidat k
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS anzahl,
                MAX(wal.end_date) AS bis,
                bool_or(wal.end_date IS NULL) AS offen,
                MIN(wal.client_name) AS kunde
           FROM worker_assignment_links wal
          WHERE wal.worker_user_id = k.user_id AND wal.is_active = TRUE
            AND wal.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')
            AND wal.start_date <= $4 AND (wal.end_date IS NULL OR wal.end_date >= $3)
       ) konflikt ON TRUE
       LEFT JOIN LATERAL (
         SELECT MAX(wal.end_date) AS letztes_ende,
                bool_or(wal.end_date IS NULL) AS unbefristet,
                MIN(wal.unavailable_from) AS abwesend_ab,
                MIN(wal.unavailable_reason) AS abwesenheitsgrund
           FROM worker_assignment_links wal
          WHERE wal.worker_user_id = k.user_id AND wal.is_active = TRUE
       ) bindung ON TRUE
      WHERE ($5::boolean IS NOT TRUE OR k.treffer = $6)
      ORDER BY k.treffer DESC, k.last_name, k.first_name`,
    [zuordnungIds, orgId, von, bis || OFFENES_ENDE, alleSkills, gruppenAnzahl, zuordnungGruppen]
  );

  const heute = todayDE();
  const kandidaten = rows.map((r) => {
    const konflikte = Number(r.konflikt_anzahl) || 0;
    const abwesendAb = alsDatum(r.abwesend_ab);
    const ausdruecklichAb = alsDatum(r.available_from);

    let zustand = ZUSTAND.FREI;
    let frei_ab = null;
    let grund = null;

    if (konflikte > 0) {
      zustand = ZUSTAND.VERPLANT;
      grund = r.konflikt_kunde || null;
      // Ohne Enddatum ist das Ende unbekannt — hier wird bewusst nicht geraten (Welle 2).
      frei_ab = r.konflikt_offen ? null : naechsterTag(alsDatum(r.konflikt_bis));
    } else if (abwesendAb && (!bis || abwesendAb <= (bis || OFFENES_ENDE)) && abwesendAb >= heute) {
      zustand = ZUSTAND.ABWESEND;
      grund = r.abwesenheitsgrund || null;
    } else if (ausdruecklichAb && ausdruecklichAb > von) {
      // Ausdrueckliche Angabe der Kraft schlaegt jede Herleitung (Rangfolge aus Welle 2).
      zustand = ZUSTAND.SPAETER_FREI;
      frei_ab = ausdruecklichAb;
    }

    return {
      worker_profile_id: r.worker_profile_id,
      name: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
      city: r.city || null,
      treffer: Number(r.treffer) || 0,
      treffer_namen: r.treffer_namen || [],
      zustand,
      frei_ab,
      grund
    };
  });

  const frei = kandidaten.filter((k) => k.zustand === ZUSTAND.FREI).length;

  return {
    auswertbar: true,
    zeitraum: { von, bis },
    skills,
    unbekannte_faehigkeiten: unbekannt,
    gefordert,
    frei,
    luecke: Math.max(0, gefordert - frei),
    kandidaten
  };
}

function naechsterTag(datum) {
  if (!datum) return null;
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
