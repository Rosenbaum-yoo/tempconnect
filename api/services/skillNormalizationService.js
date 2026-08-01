/**
 * Faehigkeiten auf den Katalog normalisieren (Multi-Skill Welle 11).
 *
 * WARUM ES DIESEN DIENST GIBT — der gemessene Schaden
 * Das Matching verglich Faehigkeiten als exakte Zeichenketten. Ein Unternehmen, das
 * "Seniorenpflege" sucht, bekam auf ein Angebot "Altenpflege" **0 von 25** Skill-Punkten —
 * obwohl beides im eigenen Katalog dieselbe Faehigkeit ist, Synonym inklusive. Von 162
 * Katalog-Eintraegen tragen **115** Synonyme; sie waren allesamt wirkungslos.
 *
 * Das trifft die USP direkt: der Angebotsgenerator (Welle 3) schreibt den **exakten
 * Katalognamen** in `skill_tags`, waehrend die Nachfrageseite Umgangssprache tippt. Der
 * Multi-Skill-Fan-out erzeugte also genau die Angebote, die das Matching nicht findet.
 *
 * WIE
 * Ein Index bildet jede Schreibweise (Name **und** Synonym, kleingeschrieben) auf die
 * kanonische Skill-Id ab. Damit wird aus dem Zeichenketten-Vergleich ein Vergleich von
 * Bedeutungen — ohne das Bewertungsverfahren umzubauen.
 *
 * WARUM GECACHT UND SYNCHRON
 * `scoreMatch` ist eine reine, synchrone Funktion und laeuft in Schleifen ueber viele
 * Kandidaten. Eine Abfrage pro Faehigkeit waere dort der teuerste Pfad im ganzen System.
 * Der Katalog ist Referenzdatenbestand (kein Org-Scope) und aendert sich selten — er wird
 * einmal geladen und fuer `INDEX_TTL_MS` gehalten.
 *
 * RUECKWAERTSKOMPATIBEL
 * Ohne Index verhaelt sich alles wie bisher. Eine Faehigkeit, die im Katalog nicht
 * vorkommt, behaelt ihre kleingeschriebene Rohform als Schluessel — zwei Betriebe, die
 * dasselbe Eigengewaechs tippen, finden sich also weiterhin.
 */

/** Wie lange der Katalog-Index gehalten wird. Referenzdaten, aendern sich selten. */
export const INDEX_TTL_MS = 10 * 60 * 1000;

let _cache = null;
let _geladenUm = 0;

/** Nur fuer Tests: verwirft den Cache. */
export function resetSkillIndexCache() {
  _cache = null;
  _geladenUm = 0;
}

/**
 * Baut den Index Schreibweise -> kanonische Skill-Id.
 *
 * Kollisionen: taucht dieselbe Schreibweise bei mehreren Skills auf, gewinnt der
 * **Name** vor dem Synonym (ein Name ist die staerkere Aussage). Bei zwei gleichwertigen
 * Treffern gewinnt der erste — stabil sortiert, damit das Ergebnis reproduzierbar bleibt.
 */
export function buildSkillIndex(zeilen = []) {
  const nachSchluessel = new Map();
  const kanonischerName = new Map();

  const setzen = (schluessel, id, istName) => {
    const s = String(schluessel || "").toLowerCase().trim();
    if (!s) return;
    const vorhanden = nachSchluessel.get(s);
    if (vorhanden && !(istName && !vorhanden.istName)) return;
    nachSchluessel.set(s, { id, istName });
  };

  const sortiert = zeilen
    .filter((z) => z?.id)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  for (const z of sortiert) {
    kanonischerName.set(z.id, z.name);
    setzen(z.name, z.id, true);
    for (const a of z.aliases || []) setzen(a, z.id, false);
  }

  // Rueckrichtung: kanonische Id -> alle Schreibweisen, in der ORIGINAL-Schreibung des
  // Katalogs. Gebraucht fuer die Suche (expandTags): `skill_tags` enthaelt genau diese
  // Schreibung, weil der Angebotsgenerator den Katalognamen uebernimmt. Kleingeschriebene
  // Varianten wuerden den Array-Filter der Datenbank nicht treffen.
  const schreibweisenJeId = new Map();
  for (const z of sortiert) {
    const menge = schreibweisenJeId.get(z.id) || new Set();
    if (z.name) menge.add(z.name);
    for (const a of z.aliases || []) if (a) menge.add(a);
    schreibweisenJeId.set(z.id, menge);
  }

  return {
    groesse: nachSchluessel.size,
    /**
     * Alle Schreibweisen derselben Faehigkeit, in der Original-Schreibung des Katalogs.
     * Unbekannte Begriffe kommen unveraendert zurueck — die Suche verliert dadurch nichts.
     */
    schreibweisen(tag) {
      const roh = String(tag || "").trim();
      const s = roh.toLowerCase();
      if (!s) return [];
      const treffer = nachSchluessel.get(s);
      if (!treffer) return [roh];
      return [...(schreibweisenJeId.get(treffer.id) || new Set([roh]))];
    },
    /** Kanonischer Schluessel einer Schreibweise — oder die Rohform, wenn unbekannt. */
    schluessel(tag) {
      const s = String(tag || "").toLowerCase().trim();
      if (!s) return "";
      const treffer = nachSchluessel.get(s);
      return treffer ? treffer.id : s;
    },
    /** Anzeigename zu einem Schluessel (fuer Begruendungstexte). */
    anzeige(schluessel) {
      return kanonischerName.get(schluessel) || schluessel;
    },
    /** Wurde die Schreibweise im Katalog gefunden? */
    kennt(tag) {
      return nachSchluessel.has(String(tag || "").toLowerCase().trim());
    }
  };
}

/**
 * Laedt den Index (gecacht). Faellt bei einem DB-Fehler bewusst auf `null` zurueck:
 * ein nicht erreichbarer Katalog darf das Matching nicht lahmlegen — es rechnet dann
 * weiter wie vor Welle 11, nur ohne Synonym-Aufloesung.
 */
export async function loadSkillIndex(pool, { jetzt = Date.now() } = {}) {
  if (_cache && jetzt - _geladenUm < INDEX_TTL_MS) return _cache;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, aliases FROM platform_skills WHERE is_active = TRUE`
    );
    _cache = buildSkillIndex(rows);
    _geladenUm = jetzt;
    return _cache;
  } catch {
    return _cache || null;
  }
}

/**
 * Erweitert Suchbegriffe um alle Schreibweisen derselben Faehigkeit.
 *
 * WARUM DAS NOETIG IST (und Normalisierung beim Bewerten allein nicht reicht):
 * Der Marktplatz-Feed filtert in SQL per Array-Ueberlappung (`cp.skill_tags && $n`) —
 * ein harter Vergleich exakter Zeichenketten. Wer "Seniorenpflege" sucht, bekommt die
 * "Altenpflege"-Angebote deshalb GAR NICHT geliefert; wie gut sie bewertet wuerden, ist
 * dann schon egal. Erweitert wird darum VOR der Abfrage.
 *
 * Die Gross-/Kleinschreibung der Datenbestaende wird dabei mitgenommen: `skill_tags`
 * enthaelt "Altenpflege" (so schreibt es der Angebotsgenerator), der Index arbeitet
 * kleingeschrieben. Deshalb liefert diese Funktion beide Formen.
 */
export function expandTags(tags = [], index = null) {
  const out = new Set();
  for (const t of tags) {
    const roh = String(t || "").trim();
    if (!roh) continue;
    out.add(roh);
    if (index) for (const s of index.schreibweisen(roh)) out.add(s);
  }
  return [...out];
}

/**
 * Bildet eine Liste Freitext-Faehigkeiten auf kanonische Schluessel ab.
 * Ohne Index: kleingeschriebene Rohform (= bisheriges Verhalten).
 */
export function normalizeTags(tags = [], index = null) {
  const out = new Set();
  for (const t of tags) {
    const roh = String(t || "").toLowerCase().trim();
    if (!roh) continue;
    out.add(index ? index.schluessel(roh) : roh);
  }
  return out;
}
