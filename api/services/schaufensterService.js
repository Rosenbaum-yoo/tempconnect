/**
 * Das oeffentliche Schaufenster (M1.6).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gemessen am 2026-09-02: die drei Endpunkte unter `/marketplace/public/*`
 * tragen ALLE `requireAuth`. "Oeffentlich" heisst dort "jeder ANGEMELDETE
 * Nutzer" — ohne Konto sieht man nichts. Und sie liefern eine LISTE, in der
 * `supplier_company_name` steht.
 *
 * Fuer ein indexierbares Schaufenster taugt beides nicht: eine Suchmaschine
 * hat kein Konto, und eine Liste mit Firmennamen ist kein Schaufenster,
 * sondern der Marktplatz selbst.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AGGREGIEREN ALLEIN IST NOCH KEINE ANONYMITAET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Plan sagt "aggregieren statt auflisten". Das genuegt nicht. Eine Gruppe
 * der Groesse EINS ist keine Statistik, sondern ein Datensatz mit anderem
 * Namen:
 *
 *     "1 Schweisser in Buxtehude, verfuegbar ab 15.09."
 *
 * Wer die Gegend kennt, weiss danach, welche Firma gemeint ist — und
 * womoeglich welcher Mensch. Deshalb hat dieser Dienst eine
 * MINDESTGRUPPENGROESSE: was kleiner ist, wandert in den Sammelposten
 * "Sonstige". Die Gesamtzahl bleibt richtig, nur die Zuordnung verschwindet.
 *
 * Das ist keine Vorsicht auf Verdacht. Der Marktplatz ist heute duenn besetzt
 * — 13 aktive Kapazitaeten, 11 offene Bedarfe (gemessen 2026-09-02). OHNE die
 * Schwelle waere fast jede Gruppe eine Einzelanzeige, und das Schaufenster
 * waere eine Personensuche mit Zwischenschritt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS BEWUSST NICHT DRIN IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Keine Kennung, kein Firmenname, kein Titel, kein Datum einer einzelnen
 * Anzeige, keine Preisspanne. Alles davon liesse sich mit dem angemeldeten
 * Feed abgleichen und wieder einer Firma zuordnen. Was bleibt, sind Mengen
 * und Kategorien — genug, um zu zeigen, dass der Markt lebt; zu wenig, um
 * jemanden zu finden.
 *
 * `api/test/schaufenster.test.js` haelt beides fest: die Schwelle UND die
 * Feldliste. Ein neues Feld muss dort eingetragen werden, sonst wird die
 * Probe rot — die Liste ist eine Erlaubnisliste, keine Verbotsliste.
 */

import { logger } from "../config/index.js";

/**
 * Kleinste Gruppe, die einzeln erscheinen darf.
 *
 * Drei ist nicht willkuerlich: bei zwei genuegt EIN Mitwisser, um auf den
 * anderen zu schliessen. Die Zahl steht hier und nicht in der Umgebung —
 * ein Schwellwert, den der Betrieb absenken kann, ist kein Schutz.
 */
export const MIND_GRUPPE = 3;

/** Der Sammelposten fuer alles unterhalb der Schwelle. */
export const SONSTIGE = "Sonstige";

/**
 * Die Felder, die eine Gruppe tragen darf. ERLAUBNISLISTE, nicht Verbotsliste:
 * ein neues Feld ist per Vorgabe nicht oeffentlich, bis jemand es hier
 * eintraegt und dabei nachdenkt.
 */
export const GRUPPEN_FELDER = Object.freeze(["name", "anzahl", "koepfe"]);

/**
 * Gruppen unterhalb der Schwelle in den Sammelposten falten.
 *
 * Rein — ohne Datenbank, damit die Schwelle ohne Aufbau pruefbar ist.
 *
 * @param {{name: string, anzahl: number, koepfe?: number}[]} gruppen
 * @param {number} [schwelle]
 */
export function faltenNachSchwelle(gruppen, schwelle = MIND_GRUPPE) {
  const gross = [];
  let restAnzahl = 0;
  let restKoepfe = 0;

  for (const g of gruppen || []) {
    const anzahl = Number(g?.anzahl) || 0;
    const koepfe = Number(g?.koepfe) || 0;
    const name = String(g?.name ?? "").trim();
    /* Ein leerer Name ist selbst eine Auskunft ("Ort nicht gepflegt") und
     * gehoert deshalb ebenfalls in den Sammelposten, nicht als eigene
     * Gruppe mit leerer Beschriftung. */
    if (!name || anzahl < schwelle) {
      restAnzahl += anzahl;
      restKoepfe += koepfe;
      continue;
    }
    gross.push({ name, anzahl, koepfe });
  }

  gross.sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de"));
  if (restAnzahl > 0) gross.push({ name: SONSTIGE, anzahl: restAnzahl, koepfe: restKoepfe });
  return gross;
}

/**
 * Zahlen fuer das Schaufenster. Wirft nicht — ein leeres Schaufenster ist
 * eine Aussage, ein Fehler auf der Startseite ist keine.
 *
 * Zwei Abfragen, nicht eine je Kategorie: die Gruppierung passiert in der
 * Datenbank, das Falten danach im Speicher. Bei wachsendem Markt bleibt das
 * eine feste Zahl Abfragen.
 */
export async function schaufensterZahlen(pool, { schwelle = MIND_GRUPPE } = {}) {
  const leer = {
    verfuegbar: false,
    stand: new Date().toISOString(),
    mindestgruppe: schwelle,
    kapazitaet: { anzeigen: 0, koepfe: 0, nach_rolle: [], nach_ort: [] },
    bedarf: { anfragen: 0, koepfe: 0, nach_rolle: [], nach_ort: [] }
  };
  if (!pool || typeof pool.query !== "function") return leer;

  try {
    const [kap, bed] = await Promise.all([
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(role), ''), '')          AS rolle,
                COALESCE(NULLIF(TRIM(location_city), ''), '') AS ort,
                COUNT(*)::int                                 AS anzahl,
                COALESCE(SUM(headcount), 0)::int              AS koepfe
           FROM capacity_posts
          WHERE status = 'active'
          GROUP BY 1, 2`
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(role), ''), '')          AS rolle,
                COALESCE(NULLIF(TRIM(location_city), ''), '') AS ort,
                COUNT(*)::int                                 AS anzahl,
                COALESCE(SUM(headcount), 0)::int              AS koepfe
           FROM demand_requests
          WHERE status = 'open'
          GROUP BY 1, 2`
      )
    ]);

    return {
      verfuegbar: true,
      stand: new Date().toISOString(),
      mindestgruppe: schwelle,
      kapazitaet: verdichten(kap.rows, schwelle),
      bedarf: verdichten(bed.rows, schwelle, "anfragen")
    };
  } catch (e) {
    logger.warn({ err: e?.message }, "Schaufenster-Zahlen konnten nicht gelesen werden");
    return leer;
  }
}

/**
 * Aus Zeilen (rolle, ort, anzahl, koepfe) die zwei gefalteten Sichten bauen.
 *
 * Wichtig: die Gesamtzahl kommt aus den ROHZEILEN, nicht aus den gefalteten
 * Gruppen. Sonst waere sie je nach Schwelle eine andere — und eine Kennzahl,
 * die sich mit ihrer Darstellung aendert, ist keine.
 */
function verdichten(zeilen, schwelle, mengenName = "anzeigen") {
  const roh = zeilen || [];
  const gesamt = roh.reduce((n, r) => n + (Number(r.anzahl) || 0), 0);
  const koepfe = roh.reduce((n, r) => n + (Number(r.koepfe) || 0), 0);

  const summieren = (feld) => {
    const m = new Map();
    for (const r of roh) {
      const name = String(r[feld] ?? "").trim();
      const e = m.get(name) || { name, anzahl: 0, koepfe: 0 };
      e.anzahl += Number(r.anzahl) || 0;
      e.koepfe += Number(r.koepfe) || 0;
      m.set(name, e);
    }
    return faltenNachSchwelle([...m.values()], schwelle);
  };

  return {
    [mengenName]: gesamt,
    koepfe,
    nach_rolle: summieren("rolle"),
    nach_ort: summieren("ort")
  };
}
