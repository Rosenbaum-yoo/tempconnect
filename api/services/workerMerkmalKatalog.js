/**
 * workerMerkmalKatalog — der feste Katalog positiver Merkmale (Welle J9)
 *
 * OWNER-FREIGABE 2026-08-26: "zuverlaessig, sehr fleissig, sauber,
 * laengerfristig einsetzbar" + zwei planungsrelevante Ergaenzungen. KEIN
 * Freitext: ein freies Urteil ueber einen Menschen, ausgespielt an fremde
 * Unternehmen, waere ein DSGVO-/AGG-Risiko — ein fester Katalog sachlicher,
 * positiver Merkmale ist es nicht (Plan J §J9).
 *
 * ZWEI RATSCHEN, EIN INHALT: Dieselbe Liste steht als CHECK in der Datenbank
 * (Migration 201, worker_profiles_markt_merkmale_check). Der Test
 * marktProfil.test.js haelt beide gegeneinander — wer ein Merkmal ergaenzt,
 * ergaenzt es an BEIDEN Stellen bewusst, sonst wird die Suite rot.
 *
 * Schluessel sind sprachneutral; die Anzeige uebersetzt das Frontend
 * (clw.merkmal.* / mit.merkmal.* in beiden Sprachen).
 */

export const MERKMAL_KATALOG = Object.freeze([
  "zuverlaessig",
  "sehr_fleissig",
  "arbeitet_sauber",
  "langfristig_einsetzbar",
  "kurzfristig_startklar",
  "schicht_flexibel"
]);

const KATALOG_SET = new Set(MERKMAL_KATALOG);

/**
 * Eingabe des Chefs pruefen und normalisieren.
 * @returns {{ok: string[]}|{error: 'MERKMAL_UNBEKANNT', unbekannt: string[]}}
 */
export function pruefeMerkmale(werte) {
  const liste = Array.isArray(werte) ? werte.map((w) => String(w).trim()).filter(Boolean) : [];
  const unbekannt = liste.filter((w) => !KATALOG_SET.has(w));
  if (unbekannt.length) return { error: "MERKMAL_UNBEKANNT", unbekannt };
  /* Dedupliziert und in Katalog-Reihenfolge — die Anzeige ist damit stabil,
   * egal in welcher Reihenfolge die Haken gesetzt wurden. */
  const gewaehlt = new Set(liste);
  return { ok: MERKMAL_KATALOG.filter((m) => gewaehlt.has(m)) };
}
