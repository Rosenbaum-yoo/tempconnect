/**
 * Der Nachtrag nach dem Import — als erweiterbare Liste, nicht als festes
 * Formular (M4b.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE OWNER-VORGABE IST EINE BAUVORGABE, KEINE BITTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner 2026-09-05: *"mach da bei der Abfrage noch mehr Platz fuer weitere
 * Sachen, die abgefragt werden koennen."* Und die Abnahme im Plan: **ein neuer
 * Punkt kommt als REGISTEREINTRAG dazu, nicht als Umbau.**
 *
 * Deshalb ist dieses Modul eine Liste und keine Funktion mit Zweigen. Wer etwas
 * ergaenzen will, schreibt eine Zeile; die Oberflaeche, die Reihenfolge und die
 * Zaehlung ergeben sich daraus.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZWEI EBENEN, UND DAS IST DER KERN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nach einem Import fehlen Dinge auf ZWEI Ebenen, und sie zu vermischen waere
 * genau der Fehler, den der erste Entwurf gemacht hat:
 *
 *   PERSON        — Wohnort, eine freigegebene Faehigkeit. Je Mensch verschieden,
 *                   und sie halten ihn aus dem Markt. Diese Punkte stehen schon
 *                   in `PRAESENZ_BEDINGUNGEN`; sie werden hier NICHT abgeschrieben,
 *                   sondern von dort gelesen.
 *   ORGANISATION  — der Einsatzradius (M-E11). Einmal fuer alle, und er haelt
 *                   NIEMANDEN aus dem Markt.
 *
 * DER ERSTE ENTWURF HATTE DEN RADIUS ALS NEUNTE PRAESENZ-BEDINGUNG, und der
 * Rauchtest gegen die echte Datenbank hat ihn widerlegt: er war fuer ALLE 12
 * gemeldeten Kraefte unerfuellt (gemessen 2026-10-03: keine der 13 Agenturen mit
 * Kraeften hat eine `org_settings`-Zeile, 0 von 45 Profilen einen eigenen
 * Radius). Ein Punkt, der jeden betrifft, haette jeden ohnehin praesenten
 * Menschen in eine Liste gezogen, die "Nicht im Markt" heisst — ein Alarm, der
 * immer schrillt, wird abgeschaltet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS JEDER EINTRAG SAGEN MUSS (Abnahme aus dem Plan)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   frage      — was fehlt, in Worten fuer einen Menschen
 *   warum      — warum es zaehlt; ohne das wird die Frage uebergangen
 *   wer        — wer sie beantworten kann: "firma" oder "mensch"
 *   blockiert  — ob es die Marktpraesenz blockiert. NICHT dekorativ: sie
 *                entscheidet, ob die Flaeche draengen darf oder nur anbieten
 *   pruefung   — eine Abfrage, die TRUE liefert, wenn der Punkt ERLEDIGT ist
 */

/** Rueckfall aus `workerAvailabilityService`; hier nur zum Vorlesen im Text. */
const RADIUS_RUECKFALL_KM = 25;

/**
 * Punkte auf Ebene der ORGANISATION. Einmal beantwortet, gelten sie fuer alle.
 *
 * Ein neuer Punkt ist eine Zeile hier — das ist die ganze Erweiterung.
 */
export const NACHTRAG_ORGANISATION = Object.freeze([
  {
    schluessel: "einsatzradius",
    wer: "firma",
    /*
     * BLOCKIERT NICHT, und das ist gemessen, nicht geschaetzt: der Radius loest
     * sich dreistufig auf (eigener Wert, dann org_settings.default_radius_km,
     * dann 25 km). Es gibt immer einen Wert. Wer ihn als Blocker auswiese, wuerde
     * eine ganze Belegschaft als unsichtbar melden, die im Markt steht.
     */
    blockiert: false,
    frage: "Welchen Einsatzradius soll der Betrieb vorgeben?",
    warum: `Ohne Angabe rechnet der Markt mit ${RADIUS_RUECKFALL_KM} km Umgebung. `
      + "Wer weiter faehrt, wird sonst nicht gefunden; wer kuerzer faehrt, bekommt "
      + "Vorschlaege, die er ablehnen muss.",
    /* Erledigt, sobald der Betrieb einen Wert hat. Je-Person-Werte zaehlen hier
       ABSICHTLICH nicht: der Dateikopf von workerAvailabilityService nennt den
       Radius "den einzigen Wert, der nie erfragt werden muss: er gehoert an den
       Betrieb". Wer ihn je Mensch erfragt, widerspricht dieser Entscheidung. */
    pruefung: `SELECT EXISTS (
        SELECT 1 FROM org_settings os
         WHERE os.org_id = $1 AND os.default_radius_km IS NOT NULL
      ) AS erledigt`
  }
]);

/**
 * Der Nachtrag fuer einen Import-Stapel.
 *
 * @param {import("pg").Pool} pool
 * @param {string} orgId
 * @param {{profileIds?: string[]|null, limit?: number}} [opts] `profileIds`
 *   grenzt auf die gerade angelegten Menschen ein. Fehlt es, gilt die ganze
 *   Belegschaft — das ist der Aufruf "was fehlt uns ueberhaupt", nicht der
 *   Nachtrag nach einem Import.
 * @returns {Promise<{organisation: Array, personen: Array, offen_gesamt: number,
 *   blockierend_gesamt: number}>}
 */
export async function nachtragFuerStapel(pool, orgId, opts = {}) {
  if (!orgId) return { organisation: [], personen: [], offen_gesamt: 0, blockierend_gesamt: 0 };

  /* Spaet geladen, damit dieses Modul keine Abhaengigkeits-Schleife mit
     marktpraesenzService bildet (dessen Kopf verweist hierher). */
  const { unsichtbareKraefte } = await import("./marktpraesenzService.js");

  const [organisation, personen] = await Promise.all([
    offeneOrganisationsPunkte(pool, orgId),
    unsichtbareKraefte(pool, orgId, {
      profileIds: Array.isArray(opts.profileIds) ? opts.profileIds : null,
      limit: opts.limit
    })
  ]);

  /* Die Zahl der BLOCKIERENDEN getrennt: sie entscheidet, ob die Flaeche
     "diese Leute stehen noch nicht im Markt" sagen darf oder nur "wir koennten
     noch etwas wissen". Ein Draengen ohne Blocker waere Laerm. */
  let blockierend = 0;
  for (const p of personen) {
    for (const g of p.gruende || []) if (g.blockiert) blockierend++;
  }

  return {
    organisation,
    personen,
    offen_gesamt: organisation.length + personen.length,
    blockierend_gesamt: blockierend
  };
}

/** Die Organisations-Punkte, die noch offen sind — je Punkt eine Abfrage. */
async function offeneOrganisationsPunkte(pool, orgId) {
  const offen = [];
  for (const punkt of NACHTRAG_ORGANISATION) {
    const { rows } = await pool.query(punkt.pruefung, [orgId]);
    if (rows[0]?.erledigt === true) continue;
    offen.push({
      schluessel: punkt.schluessel,
      wer: punkt.wer,
      blockiert: punkt.blockiert,
      frage: punkt.frage,
      warum: punkt.warum
    });
  }
  return offen;
}
