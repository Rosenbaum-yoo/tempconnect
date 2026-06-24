/**
 * datevExportService — DATEV-Export für die Finanzbuchhaltung/Lohn (Integrations-Epic Welle C).
 *
 * C1 (diese Datei, Teil 1): **Fibu-Buchungsstapel im DATEV-EXTF-Format (700, Kategorie 21).**
 * Wandelt TempConnect-Rechnungen in eine DATEV-importierbare CSV (Buchungsstapel) — der Standard,
 * den jeder deutsche Steuerberater/jede Fibu importiert.
 *
 * WICHTIG (mandantenspezifisch): SKR, Berater-/Mandanten-Nr, Wirtschaftsjahr und vor allem die
 * KONTEN (Debitoren-Sammelkonto, Erlöskonten je Steuersatz) sind je Kanzlei verschieden. Sie
 * kommen pro Org aus `org_erp_mappings.sync_config` (system_type='datev'); fehlt etwas, greifen
 * konservative **SKR03-Defaults**. Die Konten MÜSSEN vor produktivem Import mit dem Steuerberater
 * bestätigt werden — der Generator liefert ein STRUKTUR-valides Stapel, kein steuerlich finales Mapping.
 *
 * Pure Funktionen (keine DB/IO) → vollständig testbar. Encoding: DATEV erwartet ISO-8859-1/CP1252;
 * der Aufrufer setzt den Content-Type entsprechend (Umlaute in Texten werden ASCII-nah gehalten).
 */

/** Konservative SKR03-Defaults. Pro Org via sync_config überschreibbar. */
export const DATEV_DEFAULTS = {
  skr: "03",
  berater_nr: "0",            // DATEV-Beraternummer (Pflicht beim echten Import; 0 = Platzhalter)
  mandant_nr: "0",            // DATEV-Mandantennummer
  sachkontenlaenge: 4,        // Stellenanzahl der Sachkonten (SKR03 üblich: 4)
  debitor_konto: "10000",     // Debitoren-Sammel-/Personenkonto (Forderung)
  erloes_konto: {             // Erlöskonten je USt-Satz (SKR03)
    "19": "8400",             // Erlöse 19 % USt
    "7": "8300",              // Erlöse 7 % USt
    "0": "8200"               // Erlöse steuerfrei
  },
  bu_schluessel: {            // BU-Schlüssel (Steuerautomatik) je Satz — leer = aus Konto abgeleitet
    "19": "",
    "7": "",
    "0": ""
  }
};

/** Betrag (Cent) → DATEV-Dezimal "1234,56" (Komma, 2 Nachkommastellen, kein Tausenderpunkt). */
export function centsToDatev(cents) {
  const n = Math.round(Number(cents) || 0);
  return (n / 100).toFixed(2).replace(".", ",");
}

/** Date → "TTMM" (Belegdatum im Buchungsstapel; Jahr kommt aus dem Wirtschaftsjahr). */
export function toBelegdatum(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return dd + mm;
}

/** Date → "yyyyMMdd" (für EXTF-Header-Datumsfelder). */
function toYmd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.getUTCFullYear() + String(dt.getUTCMonth() + 1).padStart(2, "0") + String(dt.getUTCDate()).padStart(2, "0");
}

/** EXTF-Feld: Strings in Anführungszeichen + verdoppeltes ", Zahlen/leer roh. */
function f(v, { quote = false } = {}) {
  if (v === null || v === undefined) return quote ? '""' : "";
  const s = String(v);
  if (quote) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** USt-Satz einer Rechnung als Schlüssel ("19"/"7"/"0"). */
function rateKey(inv) {
  const pct = Math.round(Number(inv.tax_rate_pct));
  if (pct === 19 || pct === 7) return String(pct);
  if (Number(inv.tax_amount_cents) > 0) return "19"; // Fallback: USt vorhanden → Regelsatz
  return "0";
}

/**
 * Baut den vollständigen DATEV-EXTF-Buchungsstapel (CSV-String) aus Rechnungen.
 *
 * @param {object[]} invoices  invoice-Rows (invoice_number, total_cents, tax_rate_pct, issued_at, billing_name, …)
 * @param {object} [cfg]       sync_config der Org (überschreibt DATEV_DEFAULTS)
 * @param {object} [opts]      { now?: Date, bezeichnung?: string } — now für deterministische Tests
 * @returns {string} CSV (EXTF-Header-Zeile + Spalten-Header-Zeile + 1 Buchungssatz/Rechnung), CRLF-getrennt
 */
export function buildFibuBuchungsstapel(invoices, cfg = {}, opts = {}) {
  const c = {
    ...DATEV_DEFAULTS, ...cfg,
    erloes_konto: { ...DATEV_DEFAULTS.erloes_konto, ...(cfg.erloes_konto || {}) },
    bu_schluessel: { ...DATEV_DEFAULTS.bu_schluessel, ...(cfg.bu_schluessel || {}) }
  };
  const list = Array.isArray(invoices) ? invoices : [];
  const now = opts.now instanceof Date ? opts.now : new Date();
  const bezeichnung = opts.bezeichnung || "TempConnect Rechnungen";

  // Zeitraum aus den Belegdaten (für die EXTF-Header-Felder Datum-von/bis).
  const dates = list.map((i) => new Date(i.issued_at || i.created_at)).filter((d) => !Number.isNaN(d.getTime()));
  const von = dates.length ? new Date(Math.min(...dates)) : now;
  const bis = dates.length ? new Date(Math.max(...dates)) : now;
  const wjBeginn = c.wj_beginn || (von.getUTCFullYear() + "0101");

  const ts = toYmd(now) + String(now.getUTCHours()).padStart(2, "0")
    + String(now.getUTCMinutes()).padStart(2, "0") + String(now.getUTCSeconds()).padStart(2, "0") + "000";

  // ── EXTF-Header (Kennzeichen "EXTF", Format 700, Kategorie 21 = Buchungsstapel, Version 7) ──
  const header = [
    f("EXTF", { quote: true }), 700, 21, f("Buchungsstapel", { quote: true }), 7,
    ts, "", f("RE", { quote: true }), f("", { quote: true }), f("", { quote: true }),
    f(c.berater_nr), f(c.mandant_nr), wjBeginn, c.sachkontenlaenge, toYmd(von), toYmd(bis),
    f(bezeichnung, { quote: true }), f("", { quote: true }), 1, 0, 0,
    f("EUR", { quote: true }), "", "", "", "", 0, 0, f("", { quote: true }), f("", { quote: true }), f("", { quote: true })
  ].join(";");

  // ── Spalten-Header (Buchungsstapel-Kernspalten, DATEV-Feldnamen) ──
  const columns = [
    "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz",
    "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel",
    "Belegdatum", "Belegfeld 1", "Buchungstext"
  ].map((h) => f(h, { quote: true })).join(";");

  // ── Buchungssätze: je Rechnung 1 Satz (Brutto, Soll Debitor an Erlös) ──
  const rows = list.map((inv) => {
    const rk = rateKey(inv);
    const erloes = c.erloes_konto[rk] || DATEV_DEFAULTS.erloes_konto[rk] || DATEV_DEFAULTS.erloes_konto["19"];
    const bu = c.bu_schluessel[rk] || "";
    const text = ("Rechnung " + (inv.invoice_number || "") + " " + (inv.billing_name || "")).trim().slice(0, 60);
    return [
      f(centsToDatev(inv.total_cents)),          // Umsatz brutto
      f("S", { quote: true }),                   // Soll (Forderung im Soll)
      f("EUR", { quote: true }),                 // WKZ
      f(c.debitor_konto),                        // Konto = Debitor/Forderung
      f(erloes),                                 // Gegenkonto = Erlöskonto
      f(bu, { quote: true }),                    // BU-Schlüssel (Steuerautomatik)
      f(toBelegdatum(inv.issued_at || inv.created_at)),
      f(inv.invoice_number, { quote: true }),    // Belegfeld 1 = Rechnungsnummer
      f(text, { quote: true })                   // Buchungstext
    ].join(";");
  });

  return [header, columns, ...rows].join("\r\n") + "\r\n";
}
