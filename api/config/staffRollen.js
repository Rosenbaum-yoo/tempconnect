/**
 * Wer im Staff Control Center was bearbeiten darf.
 *
 * BEFUND (2026-08-24, an Repo und laufender Datenbank gemessen): Migration 118
 * legt `tempconnect_staff.role` an, dokumentiert im Spaltenkommentar sechs
 * Werte — und **niemand liest die Spalte**. Es gibt einen Index darauf, aber
 * keine Zeile Code, die sie auswertet. Ein Access-Reviewer sah sechs Rollen und
 * durfte annehmen, sie bedeuteten etwas; sie bedeuteten nichts.
 *
 * OWNER-ENTSCHEID (2026-08-24): `staff_member` ist das **vollwertige
 * Teammitglied** — alle Fachbereiche, nur die Staff-Verwaltung selbst bleibt
 * `staff_admin`. Die anderen Rollen sind damit bewusste EINSCHRAENKUNGEN, die
 * man vergibt, keine Erweiterungen, die man freischalten muss. Wirkung heute:
 * gemessen eine Staff-Zeile, Rolle `staff_member` — sie verliert nichts.
 *
 * WARUM DIE ZUORDNUNG AM PFAD HAENGT UND NICHT AN 105 EINZELDEKLARATIONEN:
 * Der Bereich steht bereits im Pfad (`/pilots/...` ist Pilotverwaltung). Eine
 * Deklaration je Route waere 105 Stellen, die man beim 106. Mal vergisst —
 * und genau so ist der Befund entstanden, den diese Datei schliesst. Hier ist
 * es EINE Tabelle, und `unbekannterBereich()` faellt fail-closed: ein neuer
 * Pfad ohne Eintrag wird abgewiesen, nicht durchgewunken. Eine Probe haelt
 * ausserdem jeden Pfad des Routers gegen diese Tabelle.
 */

/** Die sechs Werte aus dem Spaltenkommentar von Migration 118 — woertlich. */
export const STAFF_ROLLEN = Object.freeze([
  "staff_admin",
  "staff_commercial",
  "staff_ops",
  "staff_support",
  "staff_audit",
  "staff_member",
]);

/**
 * Bereiche, die JEDE Rolle braucht. Ohne sie kaeme niemand an der Anmeldung
 * vorbei oder saehe die Schale, in der alles andere haengt — eine Rolle, die
 * sich nicht anmelden kann, ist keine Einschraenkung, sondern ein Ausfall.
 */
export const GEMEINSAM = Object.freeze(["bootstrap", "auth"]);

/**
 * Die Staff-Verwaltung selbst. Wer hier schreibt, vergibt Zugaenge — das ist
 * die eine Flaeche, auf der ein Teammitglied sich selbst befoerdern koennte.
 */
export const NUR_ADMIN = Object.freeze(["staff-access", "staff-members"]);

/**
 * Pfad-Praefix -> Fachbereich. Der Praefix ist das erste Pfadsegment.
 * Vollstaendig gegen `staffControlCenter.js` erhoben; die Probe
 * `staffRollen.test.js` faellt rot, sobald ein Router-Pfad hier fehlt.
 */
export const BEREICH_JE_PFAD = Object.freeze({
  // Gemeinsam
  bootstrap: "bootstrap",
  auth: "auth",

  // Staff-Verwaltung (nur staff_admin)
  "staff-access": "staff-access",
  "staff-members": "staff-members",

  // Kommerz: Geld, Vertraege, Kunden, Piloten
  billing: "commercial",
  revenue: "commercial",
  "subscription-requests": "commercial",
  "subscription-requests-meta": "commercial",
  "subscription-documents": "commercial",
  "bounty-catalog": "commercial",
  customers: "commercial",
  "customers-meta": "commercial",
  pilots: "pilots",
  preregistrations: "preregistrations",
  "strategic-requests": "commercial",

  // Betrieb: die Plattform am Laufen halten
  operations: "operations",
  hetzner: "hetzner",
  automation: "automation",
  incidents: "operations",
  platform: "platform",
  "platform-audit": "platform",
  "data-explorer": "platform",
  "data-governance": "platform",
  mail: "operations",
  "document-vault": "operations",

  // Support und Moderation
  support: "support",
  "support-vendors": "support",
  "customer-requests": "support",
  "customer-requests-meta": "support",
  inbox: "support",
  "search-moderation": "moderation",
  "marketplace-visibility": "moderation",
  "risk-trust": "moderation",

  // Aufsicht: lesen duerfen alle, entscheiden nicht
  audit: "audit",
  "audit-decisions": "audit",
  executive: "audit",
});

/**
 * Rolle -> Fachbereiche. `null` heisst ALLE (ausser NUR_ADMIN, das wird
 * getrennt geprueft). GEMEINSAM kommt ueberall automatisch dazu.
 */
export const BEREICHE_JE_ROLLE = Object.freeze({
  /* Alles, inklusive der Staff-Verwaltung. */
  staff_admin: null,

  /* Owner-Entscheid: vollwertiges Teammitglied, nur die Staff-Verwaltung nicht. */
  staff_member: null,

  staff_commercial: Object.freeze(["commercial", "pilots", "preregistrations", "audit"]),
  staff_ops: Object.freeze(["operations", "hetzner", "automation", "platform", "audit"]),
  staff_support: Object.freeze(["support", "moderation", "audit"]),

  /* Aufsicht: sieht alles, aendert nichts. Die Leseerlaubnis ist hier absichtlich
   * weit — eine Revision, die nur Ausschnitte sieht, ist keine. Die Schreibsperre
   * greift in `darfStaffBereich` ueber die Methode, nicht ueber die Bereichsliste. */
  staff_audit: null,
});

/** Rollen, die ausschliesslich lesen duerfen. */
export const NUR_LESEND = Object.freeze(["staff_audit"]);

/** Das erste Pfadsegment eines Router-Pfads ("/pilots/:id/extend" -> "pilots"). */
export function pfadPraefix(pfad) {
  const roh = String(pfad || "").split("?")[0];
  const teile = roh.split("/").filter(Boolean);
  return teile[0] || "";
}

/** Der Fachbereich zu einem Router-Pfad, oder null wenn unbekannt. */
export function bereichZuPfad(pfad) {
  const praefix = pfadPraefix(pfad);
  return Object.prototype.hasOwnProperty.call(BEREICH_JE_PFAD, praefix)
    ? BEREICH_JE_PFAD[praefix]
    : null;
}

/**
 * Die Entscheidung. Gibt `{ erlaubt: true }` oder `{ erlaubt: false, grund }`.
 *
 * Fail-closed an drei Stellen, jede mit eigenem Grund — damit ein 403 im
 * Protokoll erklaerbar ist und nicht als Raetsel endet:
 *   unbekannte Rolle  -> die Spalte akzeptiert jeden String (kein CHECK)
 *   unbekannter Pfad  -> neue Route, hier nicht eingetragen
 *   Bereich verwehrt  -> die Rolle darf ihn nicht
 */
export function darfStaffBereich(rolle, pfad, methode = "GET") {
  const r = String(rolle || "");
  if (!STAFF_ROLLEN.includes(r)) {
    return { erlaubt: false, grund: "ROLLE_UNBEKANNT", detail: r || "(leer)" };
  }

  const bereich = bereichZuPfad(pfad);
  if (!bereich) {
    return { erlaubt: false, grund: "BEREICH_NICHT_REGISTRIERT", detail: pfadPraefix(pfad) };
  }

  const lesend = ["GET", "HEAD", "OPTIONS"].includes(String(methode || "GET").toUpperCase());

  /* Gemeinsame Bereiche zuerst: sie gelten fuer jede Rolle und fuer beide
   * Richtungen (Anmeldung und Step-up sind POSTs). */
  if (GEMEINSAM.includes(bereich)) return { erlaubt: true };

  if (NUR_LESEND.includes(r) && !lesend) {
    return { erlaubt: false, grund: "NUR_LESEND", detail: r };
  }

  if (NUR_ADMIN.includes(bereich) && r !== "staff_admin") {
    return { erlaubt: false, grund: "NUR_ADMIN", detail: bereich };
  }

  const erlaubte = BEREICHE_JE_ROLLE[r];
  if (erlaubte === null) return { erlaubt: true };
  if (erlaubte.includes(bereich)) return { erlaubt: true };
  return { erlaubt: false, grund: "BEREICH_VERWEHRT", detail: bereich };
}
