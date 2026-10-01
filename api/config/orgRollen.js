/**
 * Org-Rollen: welche Rolle zu welcher Seite gehoert und wie sie heisst.
 *
 * WARUM ES DIESE DATEI GIBT (Owner-Entscheidung W-E9, 2026-10-01)
 * Die Einladung bot bis dahin JEDER Firma alle zehn Rollen an — der
 * Zeitarbeitsfirma den "Hiring-Manager", dem Unternehmen den "Dispatcher".
 * Und dieselben Rollen trugen drei verschiedene Beschriftungen
 * (`roleBadge.js`, zweimal `organization.html`). Hier steht beides EINMAL,
 * und der Server prueft es, statt dass die Oberflaeche es nur weglaesst.
 *
 * WIE DIE ZUORDNUNG ENTSTANDEN IST — aus der Rechte-Matrix, nicht geraten:
 *   - `dispatcher` traegt Stundenzettel anlegen/einreichen und die
 *     Arbeiterverwaltung (`timesheet.create`, `worker.*`) — das tut die
 *     Zeitarbeitsfirma fuer ihre Kraefte.
 *   - `hiring_manager`, `program_manager`, `supplier_manager` tragen Bedarfe,
 *     Kandidaten und Lieferantensteuerung — die Einkaufsseite.
 *   - `supplier_user` darf Compliance-Nachweise HOCHLADEN und Angebote anlegen:
 *     der externe Lieferant im Bereich eines Unternehmens.
 *   - `recruiter` steht auf BEIDEN Seiten: `requisition.create` (Bedarf im
 *     Unternehmen) und `worker.review` (Kraefte der Zeitarbeitsfirma). Die
 *     Vorschau vom 2026-09-30 hatte ihn nur bei der Zeitarbeitsfirma — das
 *     haette Unternehmen eine Rolle genommen, fuer die es dort Rechte gibt.
 *
 * Bestehende Mitgliedschaften werden NICHT angefasst: eine Rolle, die heute
 * nicht mehr zur Seite passt, bleibt, bis jemand sie aendert. Geprueft wird nur,
 * was ab jetzt vergeben wird.
 */

/** Anzeigename je Rollenschluessel — die eine Beschriftung fuer alle Flaechen. */
export const ROLLEN_NAMEN = Object.freeze({
  platform_admin: "Plattform-Admin",
  owner: "Owner",
  admin: "Admin",
  program_manager: "Programm-Manager/in",
  hiring_manager: "Hiring-Manager/in",
  supplier_manager: "Supplier-Manager/in",
  recruiter: "Recruiter/in",
  dispatcher: "Disponent/in",
  finance: "Finanzen",
  member: "Mitglied",
  viewer: "Betrachter/in",
  supplier_user: "Lieferant (extern)",
  worker: "Arbeitskraft"
});

/**
 * Was eine Firma vergeben darf, je Seite. `owner` steht in keiner Liste:
 * Owner-Rechte werden nie per Einladung vergeben, nur per Rollenwechsel
 * (Uebergabe), und der ist auf beiden Seiten erlaubt.
 */
export const ROLLEN_JE_SEITE = Object.freeze({
  company: Object.freeze([
    "admin", "program_manager", "hiring_manager", "supplier_manager",
    "recruiter", "finance", "member", "viewer", "supplier_user"
  ]),
  agency: Object.freeze([
    "admin", "dispatcher", "recruiter", "finance", "member", "viewer"
  ])
});

/** Anzeigename einer Rolle; unbekannte Schluessel bleiben, wie sie sind. */
export function rollenName(rolle) {
  return Object.prototype.hasOwnProperty.call(ROLLEN_NAMEN, rolle) ? ROLLEN_NAMEN[rolle] : String(rolle || "");
}

/**
 * Die vergebbaren Rollen einer Seite. Eine Seite, die es nicht gibt, bekommt
 * KEINE — fail-closed: `organizations.type` ist NOT NULL mit CHECK auf genau
 * diese zwei Werte (Migration 019), ein dritter Wert waere ein Datenfehler und
 * darf nicht zu "alles erlaubt" werden.
 */
export function rollenFuerSeite(seite) {
  return Object.prototype.hasOwnProperty.call(ROLLEN_JE_SEITE, seite) ? ROLLEN_JE_SEITE[seite] : [];
}

/**
 * Darf diese Rolle in einer Firma dieser Seite vergeben werden?
 * `owner` nur, wenn ausdruecklich erlaubt (Rollenwechsel, nie Einladung).
 */
export function rolleErlaubt(seite, rolle, { ownerErlaubt = false } = {}) {
  if (rolle === "owner") return ownerErlaubt && rollenFuerSeite(seite).length > 0;
  return rollenFuerSeite(seite).includes(rolle);
}

/** Fuer die Oberflaeche: die vergebbaren Rollen einer Seite samt Namen. */
export function rollenAngebot(seite) {
  return rollenFuerSeite(seite).map((key) => ({ key, label: ROLLEN_NAMEN[key] }));
}
