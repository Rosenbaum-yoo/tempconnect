/**
 * Die EINE Antwort auf "ist dieser Mensch gerade gebunden?" (M4c.3b).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EIN EIGENES MODUL (2026-09-24)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis hierher hiess "gebunden" im ganzen System: es gibt eine aktive
 * `worker_assignment_links`-Zeile. Der adversariale Audit vom 2026-09-24 hat
 * gezeigt, was daraus folgt — eine BUCHUNG bindet niemanden:
 *
 *   `accept-deal` sperrt genau die eine gebuchte Zeile, prueft nur deren
 *   Kopfzahl-Rest, legt ein angenommenes Angebot an und setzt diese Zeile auf
 *   'reserved'. Eine Einsatz-Verknuepfung entsteht erst, wenn jemand spaeter
 *   von Hand zuweist. Bis dahin bleibt derselbe Mensch ueber JEDE andere
 *   Darstellung buchbar: seine uebrigen Einzelangebote, sein Gesamtangebot,
 *   jedes Sammelangebot, in dem er Mitglied ist. Und der Takt legte fuer die
 *   gebuchte Faehigkeit sogar einen Zwilling an, weil 'reserved' fuer ihn kein
 *   belegter Platz war.
 *
 * Genau den Zustand nennt der Owner Betrug: "ein Mensch, fuenfmal gebucht,
 * waere Betrug." Und genau diese Abnahme stand im Plan fuer M4c.3: "Kraft
 * buchen → beide Arten weg". Die erste Fassung von M4c.3 hat sie nicht erfuellt
 * — alle Proben waren gruen, weil sie die Einsatz-Verknuepfung prueften und
 * nicht die Buchung.
 *
 * Die Bedingung stand ausserdem an DREI Stellen als eigene Abschrift
 * (Reservierung personengebunden, Reservierung Sammelangebot, Kopfzahl im
 * Feed). Hier steht sie einmal; alle setzen sie ein.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WANN EINE BUCHUNG BINDET — UND WANN SIE WIEDER FREIGIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Vereinbarung kennt sieben Zustaende (Mig 083). Gebunden macht eine
 * angenommene Buchung auf einer PERSONENGEBUNDENEN Zeile (worker_profile_id
 * gesetzt — gleich welcher Art), solange sie VOR dem Einsatz steht:
 *
 *   none, agreement_created, pending_confirmation, confirmed   → bindet
 *   activated                                                   → bindet NICHT
 *   cancelled, expired                                          → bindet NICHT
 *
 * 'activated' bindet hier bewusst nicht: ab dann ist der Einsatz da, und die
 * Einsatz-Verknuepfung bindet — mit Datum. Zaehlte die Buchung weiter, bliebe
 * ein Mensch nach einem unbefristeten Deal fuer immer unsichtbar, denn eine
 * aktivierte Vereinbarung endet nie. Und hat die Agentur beim Aktivieren
 * jemand anderen eingesetzt, ist der Gebuchte damit wieder frei — richtig so.
 *
 * Das Einsatzende der Buchung (offers.end_date) begrenzt die Bindung
 * zusaetzlich: eine Buchung, deren Zeitraum vorbei ist, haelt niemanden fest.
 *
 * Sammelangebote binden hier NIEMANDEN: eine Buchung "2 von 30" nennt keinen
 * bestimmten Menschen. Ihre Zusage senkt die freie Kopfzahl DES Angebots
 * (FREIE_KOPFZAHL_SQL) — wer davon betroffen ist, steht erst beim Zuweisen
 * fest. Das ist eine benannte Grenze, kein Versehen (M4c.2).
 */

const SPALTE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i;

/** Die Vereinbarungszustaende, in denen eine Buchung den Menschen bindet. */
export const BINDENDE_VEREINBARUNGEN = Object.freeze([
  "none",
  "agreement_created",
  "pending_confirmation",
  "confirmed"
]);

/**
 * @param {string} profil Spalte mit der worker_profiles.id (z. B. `cp.worker_profile_id`)
 * @returns {string} ein SQL-Ausdruck, der TRUE ist, solange dieser Mensch gebunden ist
 */
export function gebundenSql(profil) {
  /* Die Spalte landet unmaskiert im SQL. Sie kommt aus dem eigenen Code — die
     Schranke steht trotzdem hier, nicht im Vertrauen auf kuenftige Aufrufer. */
  if (!SPALTE.test(String(profil))) throw new Error("BINDUNG_SPALTE_UNGUELTIG");
  const zustaende = BINDENDE_VEREINBARUNGEN.map((z) => `'${z}'`).join(", ");
  return `(
    EXISTS (
      SELECT 1
        FROM worker_profiles bnd_wp
        JOIN worker_assignment_links bnd_wal
          ON bnd_wal.worker_user_id = bnd_wp.user_id
         AND bnd_wal.is_active = TRUE
         AND (bnd_wal.end_date IS NULL OR bnd_wal.end_date >= CURRENT_DATE)
       WHERE bnd_wp.id = ${profil}
    )
    OR EXISTS (
      SELECT 1
        FROM capacity_posts bnd_cp
        JOIN offers bnd_o ON bnd_o.capacity_post_id = bnd_cp.id
       WHERE bnd_cp.worker_profile_id = ${profil}
         AND bnd_o.status = 'accepted'
         AND COALESCE(bnd_o.agreement_status, 'none') IN (${zustaende})
         AND (bnd_o.end_date IS NULL OR bnd_o.end_date >= CURRENT_DATE)
    )
  )`;
}
