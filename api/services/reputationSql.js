/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE EINE ANTWORT AUF "WIE KOMMT MAN VON EINER ORGANISATION ZU IHRER REPUTATION"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DIESES MODUL GIBT — gemessen am 2026-09-27, nicht vermutet:
 *
 * `supplier_reputation` ist auf `supplier_id` geschluesselt, und diese Spalte
 * hat einen Fremdschluessel auf `users(id)`. Es ist also die Reputation eines
 * NUTZERS (des Eigentuemers der Zeitarbeitsfirma), obwohl der Name nach einer
 * Firma klingt. `vendor_pool.supplier_org_id` dagegen zeigt per Fremdschluessel
 * auf `organizations(id)`.
 *
 * ELF Stellen in `vendorPoolService.js` haben trotzdem
 *
 *     LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
 *
 * geschrieben. Ein Nutzer-Schluessel gegen einen Org-Schluessel trifft nie — und
 * weil es ein LEFT JOIN ist, gibt es keinen Fehler, nur lauter NULL. Die ganze
 * Lieferantenverwaltung hat deshalb KEINE Reputation angezeigt: keine Note, kein
 * Grade, keine Sterne, und die Liste der schwaechsten Lieferanten (mit
 * `WHERE sr.reputation_score IS NOT NULL`) war dauerhaft leer.
 *
 * DER RICHTIGE WEG geht ueber den Eigentuemer, und er stand schon in
 * `profileRankingService`: `org_memberships` mit `role_key = 'owner'`. Genau
 * dieser Weg steht jetzt EINMAL hier, statt elfmal verstreut — dasselbe Muster
 * wie `zusageFormel.js`, `bindungSql.js` und `koepfeFormel.js`: wer die Frage
 * neu stellt, bekommt dieselbe Antwort, und ein Fehler ist an einer Stelle zu
 * beheben statt an zwoelf.
 *
 * NICHT FUER supplier_metrics: `supplier_metrics.agency_id` zeigt selbst auf
 * `organizations` und wird direkt an der Org verbunden. Diese Joins waren
 * richtig und bleiben unangetastet — wer sie "mitkorrigiert", bricht sie.
 */

/* Erlaubt ist eine qualifizierte Spalte wie `vp.supplier_org_id` oder ein
   einfacher Name. Nichts anderes: dieser Text geht unveraendert in SQL. */
const SPALTE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i;
const ALIAS = /^[a-z_][a-z0-9_]*$/i;

/**
 * Der JOIN von einer Organisation zu ihrer Reputation, ueber den Eigentuemer.
 *
 * @param {string} orgSpalte - Spalte mit der Org-Kennung, z. B. "vp.supplier_org_id"
 * @param {{ alias?: string, brueckenAlias?: string }} [opts]
 *   alias: Alias fuer `supplier_reputation` (Vorgabe "sr")
 *   brueckenAlias: Alias fuer `org_memberships` (Vorgabe "srom") — nur aendern,
 *   wenn die Abfrage den Namen schon belegt.
 * @returns {string} zwei LEFT JOINs, einsetzbar in eine FROM-Kette
 */
export function reputationJoinSql(orgSpalte, opts = {}) {
  const spalte = String(orgSpalte);
  if (!SPALTE.test(spalte)) throw new Error("REPUTATION_SPALTE_UNGUELTIG");
  const alias = String(opts.alias ?? "sr");
  const bruecke = String(opts.brueckenAlias ?? "srom");
  if (!ALIAS.test(alias) || !ALIAS.test(bruecke)) throw new Error("REPUTATION_ALIAS_UNGUELTIG");
  if (alias === bruecke) throw new Error("REPUTATION_ALIAS_KOLLISION");
  return `LEFT JOIN org_memberships ${bruecke}
             ON ${bruecke}.org_id = ${spalte} AND ${bruecke}.role_key = 'owner'
          LEFT JOIN supplier_reputation ${alias}
             ON ${alias}.supplier_id = ${bruecke}.user_id`;
}

/** Die Rolle, die den Eigentuemer einer Organisation bezeichnet. Einmal benannt,
 *  damit ein Umbenennen im Rechtemodell nicht elf Abfragen still bricht. */
export const EIGENTUEMER_ROLLE = "owner";
