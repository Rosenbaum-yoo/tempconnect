/**
 * Die EINE Antwort auf "ist dieses Angebot im Markt aktiv?" (Posten 5, Vorarbeit zu M4b.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EIN EIGENES MODUL — UND WARUM DIE ENTSCHEIDUNG NICHT MEINE WAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Aktiv" hatte auf `capacity_posts` mehrere Definitionen, und sie widersprechen
 * sich IN DEN DATEN. Gemessen an der Entwicklungsdatenbank am 2026-10-03, 52
 * Angebote:
 *
 *   status = 'active' UND is_active = TRUE    10
 *   status = 'active' ABER is_active = FALSE   2   <-- der Widerspruch
 *   is_active = TRUE  ABER status <> 'active'  0   <-- nie, in keiner Zeile
 *
 * Die dritte Zeile ist der Beweis: `is_active` ist in keiner der 40
 * Nicht-active-Zeilen wahr. Das Flag traegt also KEINE Information, die
 * `status` nicht schon traegt — ausser dort, wo es abgedriftet ist.
 *
 * UND DIE FESTLEGUNG STAND SCHON ZWEIMAL IM REPO, sie wurde nur nicht
 * eingehalten. `capacityWorkflow.isEffectivelyActive` sagt es woertlich:
 *
 *     Compute the is_active boolean for backward compatibility.
 *     Active capacity posts = status 'active'.
 *
 * Und die Migration, die `status` eingefuehrt hat, sagt es noch deutlicher —
 * sql/migrations/021_capacity_exchange.sql, Zeile 10:
 *
 *     -- Status workflow (replaces simple is_active boolean)
 *
 * "replaces". Darunter fuellt sie `status` EINMALIG aus `is_active` — in EINE
 * Richtung. Seit 021 ist das Flag ein Rueckstand, kein Partner.
 *
 * `status` ist damit die Wahrheit: ein Lebenszyklus-Feld mit CHECK ueber sieben
 * Werte und einer Uebergangstabelle (`CAPACITY_POST_TRANSITIONS`). `is_active`
 * ist ein abgeleiteter Alt-Spiegel. Es war also keine Produktentscheidung
 * offen — die Leseseite hat die eigene Festlegung des Projekts nur nie benutzt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS DER WIDERSPRUCH GEKOSTET HAT — GEMESSEN, NICHT GESCHAETZT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die zwei abgedrifteten Angebote stehen in der Marktplatz-Liste (sie liest
 * `status`) und sind fuer JEDE Stelle unsichtbar, die das Flag liest: beide
 * Matching-Wege, die Preisfindung, zwei Zaehlungen im Lieferantenpool, der
 * Match-Anstoss und drei Kennzahlen in Verwaltung und Berichtswesen. Zwei von
 * zwoelf als aktiv gefuehrten Angeboten — 17 Prozent. Ein Unternehmen sieht ein
 * Angebot und bekommt es nie vorgeschlagen; die Zeitarbeitsfirma sieht ihr
 * Angebot gelistet und wird nicht gefunden.
 *
 * UND DIE GEFAEHRLICHERE RICHTUNG IST DIE, DIE HEUTE NOCH NICHT EINGETRETEN IST.
 * Der Reservierungs-Sweep setzt `status = 'paused'` und laesst das Flag
 * unberuehrt (workerOfferReservationService, RESERVE_SQL — so seit der ersten
 * Fassung vom 2026-07-22). Wer dann `is_active = TRUE` liest, sieht ein
 * Angebot, dessen Mensch GEBUNDEN ist: beide Matching-Wege haetten es weiter
 * vorgeschlagen. Das ist die Doppelbuchung, die die Hard-Reserve gerade
 * verhindern soll — der Zustand, den der Owner Betrug nennt.
 *
 * Gemessen am 2026-10-03: **0** solche Zeilen. Aber 10 der 12 aktiven Angebote
 * tragen `is_active = TRUE`, also erzeugt die NAECHSTE Reservierung auf einer
 * davon die erste. Dieser Defekt war latent, nicht historisch — und er
 * verschwindet mit der einen Wahrheit von selbst, weil danach niemand mehr das
 * Flag liest. Das ist das staerkste Argument fuer diese Welle, staerker als die
 * zwei verlorenen Angebote.
 *
 * UND EIN DRITTER SCHADEN, DER OHNE DIESE ZUSAMMENFUEHRUNG UNSICHTBAR BLEIBT:
 * `getUnassignedCapacityPosts` (Disponenten-Sicht) liest ABSICHTLICH
 * `status IN ('active','reserved')` — ein reserviertes Angebot braucht weiter
 * Koepfe. Dahinter stand `AND cp.is_active IS DISTINCT FROM FALSE`, und weil
 * `isEffectivelyActive('reserved')` falsch ist, loescht die zweite Bedingung
 * die erste wieder weg. Gemessen: 6 reservierte Angebote, alle mit
 * `is_active = FALSE`. Das 'reserved' in der Liste war TOTER CODE — und der
 * Kommentar der Funktion warnt woertlich vor genau diesem Symptom ("sonst
 * bleibt '+ Kapazitaet zuweisen' leer, obwohl aktive Kapazitaeten existieren").
 * Zwei Bedingungen, die beide fuer sich plausibel aussehen, haben sich
 * gegenseitig aufgehoben.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE ZUSTANDSMENGE EIN PARAMETER IST UND KEINE KONSTANTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die naheliegende Fassung waere ein fester Ausdruck `status = 'active'`
 * gewesen. Sie waere falsch: der Disponent braucht belegbar eine BREITERE
 * Menge. Ein Modul, das nur den engen Fall kennt, haette genau diese Stelle
 * zurueckgelassen — und damit die naechste eigene Abschrift erzeugt, also den
 * Defekt, den es beseitigen soll.
 *
 * Deshalb: die Menge kommt von der Aufrufstelle, aber IMMER aus einer hier
 * benannten Konstante. Ein freier Zustandsname wirft. Das macht die Absicht
 * lesbar ("besetzbar", nicht "('active','reserved')") und haelt die Zahl der
 * Bedeutungen klein genug, um sie zu ueberblicken.
 *
 * Was dieses Modul ABSICHTLICH NICHT tut: `visibility_status` pruefen. Es ist
 * eine eigene Frage (oeffentlich vs. privat), es steht bei allen 52 Zeilen auf
 * 'public' und schliesst heute nichts aus. Wer es hier mit hineinnimmt, aendert
 * das Ergebnis von Stellen, die es heute bewusst nicht pruefen.
 */

/* Der Alias landet unmaskiert im SQL. Er kommt aus dem eigenen Code — die
   Schranke steht trotzdem hier, nicht im Vertrauen auf kuenftige Aufrufer.
   Erlaubt ist auch ein reiner Tabellenname (`capacity_posts`), weil nicht
   jede Abfrage einen Alias setzt. */
const ALIAS = /^[a-z_][a-z0-9_]*$/i;

/**
 * Alle Lebenszustaende eines Angebots — wortgleich mit dem CHECK auf
 * `capacity_posts.status` (gemessen am 2026-10-03) und mit den Schluesseln von
 * `CAPACITY_POST_TRANSITIONS` in `capacityWorkflow.js`.
 */
export const ANGEBOT_ZUSTAENDE = Object.freeze([
  "draft",
  "active",
  "paused",
  "expired",
  "filled",
  "archived",
  "reserved"
]);

/**
 * Im Markt sichtbar und frei buchbar. Das ist die Bedeutung, die
 * `isEffectivelyActive` meint, und der Normalfall fuer Feed, Suche, Matching,
 * Preisfindung und Kennzahlen.
 */
export const MARKT_AKTIV = Object.freeze(["active"]);

/**
 * Aktiv ODER reserviert — die Sicht derer, die noch Koepfe zuweisen koennen.
 * Ein reserviertes Angebot ist aus dem Markt genommen, aber nicht erledigt:
 * seine Kopfzahl kann teilbesetzt sein. Nur fuer die Disponenten-Sicht; wer es
 * fuer den Feed benutzt, zeigt gebundene Kraefte als frei an.
 */
export const MARKT_BESETZBAR = Object.freeze(["active", "reserved"]);

/**
 * @param {string} alias Tabellen-Alias oder Tabellenname (z. B. "cp")
 * @param {readonly string[]} zustaende eine der Konstanten oben
 * @returns {string} SQL-Bedingung, wahr fuer Angebote in diesen Zustaenden
 */
export function angebotAktivSql(alias = "cp", zustaende = MARKT_AKTIV) {
  if (!ALIAS.test(String(alias))) throw new Error("ANGEBOT_ALIAS_UNGUELTIG");

  const menge = Array.from(zustaende || []);
  if (menge.length === 0) throw new Error("ANGEBOT_ZUSTAENDE_LEER");
  for (const z of menge) {
    /* Ein Tippfehler wuerde sonst lautlos nichts treffen — und eine Liste, die
       nichts trifft, sieht wie eine leere Datenbank aus. */
    if (!ANGEBOT_ZUSTAENDE.includes(z)) throw new Error("ANGEBOT_ZUSTAND_UNBEKANNT");
  }

  if (menge.length === 1) return `${alias}.status = '${menge[0]}'`;
  return `${alias}.status IN (${menge.map((z) => `'${z}'`).join(", ")})`;
}
