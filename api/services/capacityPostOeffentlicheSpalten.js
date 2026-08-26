/**
 * Die oeffentlichen Spalten von `capacity_posts` — die EINZIGE Wahrheit darueber,
 * was ein Marktplatz-Betrachter von einem Kapazitaetsposten zu sehen bekommt.
 *
 * WARUM ES DIESE DATEI GIBT (Welle J2, Befund 2.2e):
 * Der Feed lieferte `cp.*` aus — alle Spalten, darunter `worker_profile_id`
 * (die interne Kennung des Menschen hinter dem Angebot) und `created_by`
 * (das Agentur-Mitglied, das es angelegt hat). `is_anonymous` stand bei allen
 * Zeilen auf TRUE und wurde von keiner einzigen Abfrage gelesen: die
 * Anonymitaet existierte als Absicht, nicht als Vollzug. Dazu ging
 * `u.email AS supplier_email` an jeden Betrachter, obwohl kein Frontend sie
 * je benutzt hat (repo-weit gemessen am 2026-08-26).
 *
 * DIE REGEL: Eine neue Spalte auf `capacity_posts` erreicht den Marktplatz
 * erst, wenn sie hier BEWUSST eingetragen wird — entweder in OEFFENTLICH
 * oder in NUR_INTERN. Der Waechter (marktplatzFeldWaechter.test.js) haelt
 * beide Listen gegen die laufende Datenbank: eine unklassifizierte Spalte
 * wird rot, bevor sie einen Betrachter erreicht.
 */

/** Was jeder Marktplatz-Betrachter sehen darf. */
export const OEFFENTLICH = Object.freeze([
  "id", "supplier_company_id", "title", "role", "skill_tags", "headcount",
  "availability_from", "availability_to",
  "location_city", "location_postal", "location_lat", "location_lng", "radius_km",
  "price_type", "price_min", "price_max", "price_hint",
  "is_active", "is_search_agent", "created_at", "updated_at", "status",
  "worker_category", "availability_type", "shift_model", "employment_type",
  "country", "mobility_notes", "qualification_summary", "certifications_summary",
  "compliance_status", "notes", "visibility_status", "priority_level",
  "valid_until", "last_confirmed_at",
  "org_id", "department_id", "location_id",
  "placement_boost_level", "featured_until",
  "primary_skill_id", "offer_kind", "is_anonymous",
  "worker_reserved", "worker_reserved_at"
]);

/** Was den Marktplatz NIE verlaesst — mit Begruendung je Zeile. */
export const NUR_INTERN = Object.freeze([
  // Die interne Kennung des Menschen hinter dem Angebot. `is_anonymous` ist
  // das Versprechen; diese Spalte draussen zu halten ist sein Vollzug.
  "worker_profile_id",
  // Das Agentur-Mitglied, das den Posten angelegt hat — eine Personenkennung,
  // die den Betrachter nichts angeht.
  "created_by"
]);

/**
 * SELECT-Fragment fuer den gegebenen Tabellen-Alias, z. B. cpSpaltenSql("cp")
 * -> "cp.id, cp.supplier_company_id, …". Ersetzt das fruehere `cp.*`.
 */
export function cpSpaltenSql(alias = "cp") {
  return OEFFENTLICH.map((s) => `${alias}.${s}`).join(", ");
}
