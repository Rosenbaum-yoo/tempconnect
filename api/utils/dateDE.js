/**
 * dateDE — DACH-Zeit (Europe/Berlin) Datums-Utilities.
 *
 * Node's `toISOString()` ist IMMER UTC — für date-only-Werte (DATE-Spalten, Wochen,
 * Start-/Arbeitsdaten) in einem DACH-Markt ist das der klassische +/-1-Tag-Bug.
 * Diese Helfer liefern das lokale Kalenderdatum in Europe/Berlin, unabhängig von der
 * Container-Zeitzone.
 *
 * Verwendung: für **fachliche, nutzersichtbare** date-only-Werte (heutiges Startdatum,
 * Arbeitsdatum, Fristen). NICHT verwenden für technische UTC-Buckets (Analytics-Tages-
 * aggregation, Idempotenz-/Dedup-Keys) — dort muss UTC-Konsistenz erhalten bleiben.
 */

const TZ = "Europe/Berlin";
// en-CA erzeugt ISO-artiges YYYY-MM-DD.
const _dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
});

/** Heutiges Kalenderdatum (YYYY-MM-DD) in Europe/Berlin. */
export function todayDE() {
  return _dateFmt.format(new Date());
}

/** Beliebigen Zeitpunkt auf das Kalenderdatum (YYYY-MM-DD) in Europe/Berlin abbilden. */
export function dateOnlyDE(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return _dateFmt.format(d);
}
