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

/** Transliterations-Tabelle für häufige Nicht-ISO-8859-1-Zeichen (CP1252/„Smart"-Zeichen → ASCII). */
const CP1252_TRANSLIT = {
  // Windows-1252-Extras (0x80–0x9F), die Node-latin1 sonst falsch byte-trunkiert:
  "€": "EUR", "‚": ",", "ƒ": "f", "„": '"', "…": "...", "†": "+", "‡": "++",
  "ˆ": "^", "‰": "%o", "Š": "S", "‹": "<", "Œ": "OE", "Ž": "Z",
  "‘": "'", "’": "'", "“": '"', "”": '"', "•": "*", "–": "-", "—": "-",
  "˜": "~", "™": "(TM)", "š": "s", "›": ">", "œ": "oe", "ž": "z", "Ÿ": "Y",
  // Häufige Latein-Buchstaben OHNE NFKD-Zerlegung (Strich statt Akzent):
  "Ł": "L", "ł": "l", "Đ": "D", "đ": "d"
};

/**
 * Macht einen String ISO-8859-1-sicher (der Aufrufer kodiert die CSV mit latin1):
 * Code Points ≤ 0xFF bleiben (inkl. ä/ö/ü/ß/é …); darüber transliterieren wir deterministisch
 * (Map → NFKD-Akzent-Strip → "?"), statt uns auf stille Byte-Truncation zu verlassen, die sonst
 * Zeichen korrumpiert ODER — falls das Low-Byte zufällig 0x3B(';') / 0x22('"') ist — die CSV-Struktur bricht.
 */
export function cp1252Safe(v) {
  let out = "";
  for (const ch of String(v)) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xFF) { out += ch; continue; }
    if (CP1252_TRANSLIT[ch] !== undefined) { out += CP1252_TRANSLIT[ch]; continue; }
    const ascii = [...ch.normalize("NFKD")].filter((c) => c.codePointAt(0) <= 0xFF).join("");
    out += ascii || "?";
  }
  return out;
}

/**
 * EXTF-Feld: Strings in Anführungszeichen + verdoppeltes ", Zahlen/leer roh.
 * Alle Werte werden ISO-8859-1-sicher transliteriert. Quoted (= Text-)Felder werden zusätzlich
 * gegen CSV-/Formel-Injection gehärtet: ein führendes =,+,-,@,TAB,CR wird mit Apostroph neutralisiert
 * (verhindert Formel-Ausführung beim Öffnen in Excel/LibreOffice; DATEV importiert den Wert unverändert).
 */
function f(v, { quote = false } = {}) {
  if (v === null || v === undefined) return quote ? '""' : "";
  let s = cp1252Safe(String(v));
  if (quote) {
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
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

/* ─────────────────────────────────────────────────────────────────────────────
 * C2: DATEV-Lohn — Bewegungsdaten (Stunden je Mitarbeiter je Abrechnungsmonat).
 * Aus freigegebenen Stundenzetteln; mappbar in DATEV LODAS / Lohn und Gehalt (Import
 * "Bewegungsdaten"). Lohnarten + Berater/Mandant sind mandantenspezifisch → aus dem
 * DATEV-ERP-Mapping (sync_config.lohn) bzw. konservative Defaults. Pure/testbar.
 * ─────────────────────────────────────────────────────────────────────────── */

export const DATEV_LOHN_DEFAULTS = {
  berater_nr: "0",
  mandant_nr: "0",
  lohnart_regular: "1",    // Lohnart reguläre Stunden (MANDANTENSPEZIFISCH — mit Lohnbüro abstimmen)
  lohnart_overtime: "2"    // Lohnart Überstunden
};

/** Date → "yyyyMM" (Abrechnungsmonat). */
export function monthKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.getUTCFullYear() + String(dt.getUTCMonth() + 1).padStart(2, "0");
}

/** Stunden → DATEV-Dezimal "12,50" (Komma, 2 Nachkommastellen). */
export function hoursToDatev(h) {
  return (Math.round((Number(h) || 0) * 100) / 100).toFixed(2).replace(".", ",");
}

/**
 * Baut DATEV-Lohn-Bewegungsdaten (CSV) aus (freigegebenen) Stundenzetteln.
 * Aggregiert je (Personalnummer × Abrechnungsmonat) und splittet Regulär/Überstunden auf
 * je eine Lohnart-Zeile. Stundenzettel ohne `worker_identifier` (Personalnummer) oder ohne
 * Periode werden übersprungen (nicht lohn-verbuchbar) und in `skipped` gemeldet.
 *
 * @param {object[]} timesheets  Rows (worker_identifier, worker_name, total_hours, overtime_hours, week_start, status)
 * @param {object} [cfg]         sync_config.lohn der Org (überschreibt DATEV_LOHN_DEFAULTS)
 * @returns {{ csv: string, rows: number, skipped: number }}
 */
export function buildLohnBewegungsdaten(timesheets, cfg = {}) {
  const c = { ...DATEV_LOHN_DEFAULTS, ...cfg };
  const list = Array.isArray(timesheets) ? timesheets : [];
  const agg = new Map();
  let skipped = 0;
  for (const ts of list) {
    const pnr = (ts.worker_identifier || "").toString().trim();
    const mon = monthKey(ts.week_start || ts.created_at);
    if (!pnr || !mon) { skipped++; continue; }
    const total = Number(ts.total_hours) || 0;
    const ot = Number(ts.overtime_hours) || 0;
    const reg = Math.max(0, total - ot);
    const key = pnr + "|" + mon;
    const e = agg.get(key) || { pnr, mon, name: ts.worker_name || "", reg: 0, ot: 0 };
    e.reg += reg; e.ot += ot;
    agg.set(key, e);
  }
  const header = ["Personalnummer", "Name", "Abrechnungsmonat", "Lohnart", "Stunden", "Berater", "Mandant"]
    .map((h) => f(h, { quote: true })).join(";");
  const rows = [];
  for (const e of agg.values()) {
    rows.push([f(e.pnr, { quote: true }), f(e.name, { quote: true }), e.mon, f(c.lohnart_regular, { quote: true }), f(hoursToDatev(e.reg)), f(c.berater_nr), f(c.mandant_nr)].join(";"));
    if (e.ot > 0) {
      rows.push([f(e.pnr, { quote: true }), f(e.name, { quote: true }), e.mon, f(c.lohnart_overtime, { quote: true }), f(hoursToDatev(e.ot)), f(c.berater_nr), f(c.mandant_nr)].join(";"));
    }
  }
  return { csv: [header, ...rows].join("\r\n") + "\r\n", rows: rows.length, skipped };
}
