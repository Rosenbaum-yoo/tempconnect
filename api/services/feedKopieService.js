/**
 * Die letzte gute Feed-Seite — damit ein Fehler nie zu einer leeren Liste wird.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER ANLASS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Am 26.08. warf `GET /capacity-exchange/feed` fuer JEDEN angemeldeten
 * Betrachter einen 500er — ein ueberzaehliger Bind-Parameter (Postgres 08P01),
 * behoben in `e845c2d`. Was der Betrachter sah, war eine leere Flaeche.
 *
 * Und eine leere Flaeche ist ununterscheidbar von "es gibt gerade keine
 * Angebote". Das ist die schlimmere Lesart: sie ist falsch UND sie alarmiert
 * niemanden. Ein Marktplatz, der leer aussieht, verliert Vertrauen; einer, der
 * "Stand von 14:20" sagt, verliert nur Aktualitaet.
 *
 * Owner-Entscheid 2026-08-27 (Welle K4): bei einem Fehler die letzte gute
 * Liste zeigen, dauerhaft vorgehalten.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE VIER REGELN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. NUR DIE UNGEFILTERTE ERSTE SEITE wird kopiert, UND ZWAR JE MARKTSEITE.
 *    Jede Filterkombination zu speichern waere Verschwendung ohne Nutzen — der
 *    Normalfall deckt den Normalbesucher, und wer gefiltert hat, sieht im
 *    Fehlerfall lieber die ehrliche Meldung als eine Liste, die seinen Filter
 *    ignoriert.
 *
 *    "Ungefiltert" schliesst seit Welle N4.4 die Einschraenkungen aus dem
 *    BETRACHTER ein — Sperrliste und Inter-Agency-Freigabe wirken staerker als
 *    jeder Query-Filter. Bis dahin zaehlte hier nur, was in der URL stand.
 *
 * 2. AUSGELIEFERT WIRD NUR IM FEHLERFALL. Das hier ist KEIN Cache zur
 *    Beschleunigung. Im Normalbetrieb aendert sich nichts — sonst gaebe es eine
 *    zweite Wahrheit ueber den Marktplatz.
 *
 * 3. IMMER MIT DATUM. Eine Kopie, die man fuer aktuell haelt, ist gefaehrlicher
 *    als gar keine.
 *
 * 4. NACH 24 STUNDEN SCHWEIGEN. Ab da ist eine ehrliche Fehlermeldung besser
 *    als ein Stand von gestern.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER NIE PASSIERT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Werfen. Weder das Schreiben noch das Lesen darf den Endpunkt gefaehrden —
 * dieselbe Regel wie beim Live-Strom und beim Mailweg: ein Zusatzweg darf den
 * Hauptweg nie umbringen. Scheitert das Schreiben, ist die naechste Kopie
 * eben aelter. Scheitert das Lesen, bleibt es beim 500er, den es ohnehin
 * gegeben haette.
 */

import { logger } from "../config/index.js";

/** Ab wann eine Kopie nicht mehr ausgeliefert wird. */
export const HOECHSTALTER_STUNDEN = 24;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE MARKTSEITE (Welle N4.4, Owner-Entscheid 2026-09-06)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Marktplatz hat keinen "beliebigen Besucher". Er hat ZWEI SEITEN, und
 * `browseFeed` stellt die Liste anhand von `viewer_role` zusammen:
 *
 *   Unternehmen      sieht ausschliesslich `supply`  (Angebote der Agenturen)
 *   Zeitarbeitsfirma sieht ausschliesslich `demand`  (Bedarfe der Unternehmen)
 *
 * Bis zum 2026-09-06 gab es EINE Kopie fuer beide. Geschrieben hat sie, wessen
 * unfilterte Seite-1-Anfrage zuletzt lief — war das eine Agentur, bekam ein
 * Unternehmen im Fehlerfall die Einkaufsliste anderer Unternehmen statt der
 * Angebote. Migration 216 trennt die Seiten.
 *
 * Die Zuordnung steht HIER und nur hier; im SQL sind es Zahlen, im Code ist es
 * ein Wort.
 */
export const SEITEN = Object.freeze({ supply: 1, demand: 2 });

/**
 * Welche Marktseite dieser Betrachter sieht — oder `null`, wenn die Rolle
 * keine der beiden Seiten meint (dann wird weder geschrieben noch gelesen).
 */
export function seiteFuer(viewerRole) {
  if (viewerRole === "company") return SEITEN.supply;
  if (viewerRole === "agency") return SEITEN.demand;
  return null;
}

/**
 * Entscheidet, ob dieser Abruf der ist, dessen Ergebnis wir aufheben.
 *
 * Bewusst streng: Seite 1, Standardgroesse, kein einziger Filter. Sobald etwas
 * eingeschraenkt ist, ist das Ergebnis nicht mehr das, was ein beliebiger
 * Besucher DIESER MARKTSEITE sehen wuerde — und genau das soll die Kopie sein.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM HIER MEHR STEHT ALS DIE FILTER AUS DER URL (N4.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis zum 2026-09-06 zaehlte diese Funktion nur die 15 Query-Filter — und
 * nannte das "kein einziger Filter". Das war eine Verwechslung von Wort und
 * Sache: eingeschraenkt wird die Liste auch durch den BETRACHTER, und zwar
 * staerker als durch jeden Filter.
 *
 *   viewer_company_org_id       schneidet die Sperrliste dieses einen Kunden
 *                               heraus. Seine Liste als Kopie fuer alle hiesse:
 *                               ein Kunde traegt sein Urteil ueber einen
 *                               Menschen in die Ansicht aller anderen.
 *   inter_agency_*              blendet zusaetzlich die andere Marktseite ein.
 *
 * Beides gehoert nicht in eine Kopie, die fuer jeden gelten soll. Gemessen:
 * vorher galten alle drei Betrachter-Situationen als kopierwuerdig.
 */
export function istKopierwuerdig(opts = {}) {
  if (!opts || typeof opts !== "object") return false;
  if ((opts.page ?? 1) !== 1) return false;

  /* Ohne erkennbare Marktseite gibt es keine Kopie: es waere unklar, wem sie
     je gehoeren soll. */
  if (seiteFuer(opts.viewer_role) === null) return false;

  /* Aus dem Betrachter abgeleitet — keine Query-Filter, aber dieselbe Wirkung. */
  if (opts.viewer_company_org_id) return false;
  if (opts.inter_agency_enabled === true) return false;
  if (opts.inter_agency_supply_visible === true) return false;

  const FILTER = [
    "worker_category", "role", "location_city", "availability_from",
    "availability_window", "min_headcount", "shift_model", "compliance_status",
    "priority_level", "latitude", "longitude", "radius_km", "skill_tags",
    "merkmale", "sort"
  ];
  return FILTER.every((k) => opts[k] === undefined || opts[k] === null);
}

/**
 * Legt die Kopie ab — eine Zeile JE MARKTSEITE, per UPSERT.
 *
 * WIRFT NIE.
 *
 * @param {number} seite Eine der beiden `SEITEN`. Eine unbekannte Seite wird
 *        abgelehnt statt geraten: die Zahl landet im Primaerschluessel.
 */
export async function kopieSchreiben(pool, ergebnis, seite) {
  try {
    if (!ergebnis || typeof ergebnis !== "object") return false;
    if (!Object.values(SEITEN).includes(seite)) {
      logger.warn({ seite }, "Feed-Kopie ohne gueltige Marktseite — nicht geschrieben");
      return false;
    }
    const eintraege = Array.isArray(ergebnis.items) ? ergebnis.items.length : 0;

    /* Eine LEERE Liste wird nicht aufgehoben. Sonst koennte ein einzelner
     * leerer Moment — alle Angebote gerade abgelaufen — zur dauerhaften
     * Rueckfall-Antwort werden, und der Rueckfall zeigte dann genau das, was
     * er verhindern soll. */
    if (eintraege === 0) return false;

    await pool.query(
      `INSERT INTO marktplatz_feed_kopie (id, inhalt, eintraege, erstellt_am)
       VALUES ($3, $1::jsonb, $2, NOW())
       ON CONFLICT (id) DO UPDATE
         SET inhalt = EXCLUDED.inhalt,
             eintraege = EXCLUDED.eintraege,
             erstellt_am = EXCLUDED.erstellt_am`,
      [JSON.stringify(ergebnis), eintraege, seite]
    );
    return true;
  } catch (e) {
    logger.warn({ err: e?.message }, "Feed-Kopie nicht geschrieben — der Feed selbst ist unberuehrt");
    return false;
  }
}

/**
 * Holt die Kopie, wenn sie jung genug ist.
 *
 * @returns {Promise<null | { inhalt: object, erstellt_am: Date, alter_stunden: number }>}
 *          `null` heisst: es gibt nichts Brauchbares — der Aufrufer meldet den
 *          Fehler dann ehrlich.
 *
 * WIRFT NIE.
 */
export async function kopieLesen(pool, seite) {
  try {
    /* Ohne gueltige Marktseite wird gar nicht erst gelesen. Ein Rueckfall auf
       "irgendeine" Kopie waere genau der Fehler, den N4.4 beendet. */
    if (!Object.values(SEITEN).includes(seite)) return null;

    const { rows } = await pool.query(
      `SELECT inhalt, eintraege, erstellt_am,
              EXTRACT(EPOCH FROM (NOW() - erstellt_am)) / 3600.0 AS alter_stunden
         FROM marktplatz_feed_kopie
        WHERE id = $1`,
      [seite]
    );
    const zeile = rows[0];
    if (!zeile) return null;

    const alter = Number(zeile.alter_stunden);
    if (!Number.isFinite(alter) || alter > HOECHSTALTER_STUNDEN) {
      /* Zu alt: lieber eine ehrliche Fehlermeldung mit Zeitangabe als ein
       * Stand von gestern, den jemand fuer heute haelt. */
      return null;
    }

    /*
     * Der Rueckfall wird GEZAEHLT — beim Bauen zeigte sich, dass es keinen
     * Kanal gibt, der das Team erreicht: die Meldungs-Matrix kennt nur org-
     * und vorgangsbezogene Empfaenger (unbekannte Schluessel werden dort still
     * uebersprungen), und `writeStaffAudit` verlangt zwingend eine handelnde
     * Person. Einen Kanal zu erfinden waere hier der falsche Ort.
     *
     * Die Zahl beantwortet die Frage, die zaehlt: laeuft der Marktplatz gerade
     * aus der Konserve, und seit wann? Sie ist abfragbar, sobald es eine
     * Betriebs-Flaeche im Staff Center gibt.
     *
     * Eigenes try: scheitert das Zaehlen, wird trotzdem ausgeliefert. Die
     * Liste ist wichtiger als ihre Statistik.
     */
    try {
      await pool.query(
        `UPDATE marktplatz_feed_kopie
            SET rueckfaelle = rueckfaelle + 1, letzter_rueckfall = NOW()
          WHERE id = $1`,
        [seite]
      );
    } catch (zaehlFehler) {
      logger.warn({ err: zaehlFehler?.message }, "Rueckfall nicht gezaehlt");
    }

    /* Auf ERROR, nicht auf WARN: der Feed laeuft aus der Konserve, das ist
     * kein Normalzustand. */
    logger.error({ alter_stunden: Math.round(alter * 10) / 10, eintraege: zeile.eintraege, seite },
      "Marktplatz-Feed aus der Kopie ausgeliefert");

    return { inhalt: zeile.inhalt, erstellt_am: zeile.erstellt_am, alter_stunden: alter };
  } catch (e) {
    logger.warn({ err: e?.message }, "Feed-Kopie nicht lesbar");
    return null;
  }
}
