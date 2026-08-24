/**
 * workforceSchedulePdfService — Monats-Einsatzplan als PDF (P1.5, abrechnungsrelevant).
 *
 * Nutzt DIESELBE Datenquelle wie die Planungs-Timeline (getAssignmentLinksForSupplier),
 * damit PDF und Bildschirm garantiert konsistent sind. Rendert via pdf-lib (pure-JS,
 * kein Chromium) — gleiches Muster wie invoicePdfService. Multi-page-fähig.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

const pad = (n) => String(n).padStart(2, "0");
const parseD = (s) => (s ? String(s).substring(0, 10) : null);
function fmtDE(iso) {
  const d = parseD(iso);
  if (!d) return "-";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "-";
}

/**
 * @param {object} opts
 * @param {string} opts.orgName
 * @param {number} opts.year
 * @param {number} opts.month  1-basiert (1 = Januar)
 * @param {Array}  opts.links   Rohdaten aus getAssignmentLinksForSupplier
 * @param {string|Date} [opts.generatedAt]
 * @returns {Promise<Uint8Array>}
 */
export async function renderMonthlyPlanPdf({ orgName, year, month, links, generatedAt = new Date() }) {
  const monthStart = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // month 1-basiert → Tag 0 des Folgemonats
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

  // Nur Einsätze, die den Monat berühren (gleiche Overlap-Logik wie die Timeline)
  const inMonth = (links || []).filter((l) => {
    const s = parseD(l.start_date);
    if (!s) return false;
    const e = parseD(l.end_date) || "9999-12-31";
    return s <= monthEnd && e >= monthStart;
  });

  const byWorker = new Map();
  for (const l of inMonth) {
    const name = (`${l.last_name || ""}, ${l.first_name || ""}`).trim().replace(/^,\s*/, "").replace(/,\s*$/, "")
      || l.worker_email || "Arbeiter";
    const key = l.worker_user_id || name;
    if (!byWorker.has(key)) byWorker.set(key, { name, pn: l.personnel_number || null, blocks: [] });
    byWorker.get(key).blocks.push(l);
  }
  const workers = Array.from(byWorker.values()).sort((a, b) => a.name.localeCompare(b.name, "de"));

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const A4 = [595.28, 841.89];
  const M = 50;
  const ink = rgb(0.1, 0.12, 0.14), muted = rgb(0.45, 0.45, 0.45), line = rgb(0.8, 0.8, 0.8);
  // WinAnsi-sicher (wie invoicePdfService): Gedankenstriche/Euro/Nicht-Latin1 ersetzen.
  const san = (s) => String(s == null ? "" : s).replace(/[–—]/g, "-").replace(/€/g, "EUR").replace(/[^\x20-\x7EÀ-ÿ]/g, "?");

  let page = doc.addPage(A4);
  const { width, height } = page.getSize();
  let y = height - M;
  const T = (s, x, yy, o = {}) => page.drawText(san(s), { x, y: yy, size: o.size || 10, font: o.f || font, color: o.color || ink });
  const HR = (yy) => page.drawLine({ start: { x: M, y: yy }, end: { x: width - M, y: yy }, thickness: 0.5, color: line });
  const newPage = () => { page = doc.addPage(A4); y = height - M; };

  const cX = { client: M, von: M + 250, bis: M + 320, tage: M + 400, std: M + 455 };
  const colHead = () => {
    T("Kunde / Einsatzort", cX.client, y, { size: 8, color: muted });
    T("Von", cX.von, y, { size: 8, color: muted });
    T("Bis", cX.bis, y, { size: 8, color: muted });
    T("Tage", cX.tage, y, { size: 8, color: muted });
    T("Std/Tag", cX.std, y, { size: 8, color: muted });
    y -= 6; HR(y); y -= 13;
  };

  // Kopf
  T("Einsatzplan", M, y, { size: 22, f: bold });
  T(san(orgName || ""), width - M - 230, y, { size: 10, f: bold });
  y -= 20;
  T(`${MONTHS_DE[month - 1]} ${year}`, M, y, { size: 13, f: bold, color: muted });
  y -= 15;
  T(`Erstellt: ${fmtDE(generatedAt)}   ·   ${workers.length} Mitarbeiter   ·   ${inMonth.length} Einsaetze`, M, y, { size: 8, color: muted });
  y -= 12; HR(y); y -= 20;

  if (!workers.length) {
    T("Keine Einsaetze in diesem Monat geplant.", M, y, { size: 10, color: muted });
    return await doc.save();
  }

  for (const w of workers) {
    if (y - 60 < M + 20) newPage();
    T(`${w.name}${w.pn ? `   (${w.pn})` : ""}`, M, y, { size: 11, f: bold });
    y -= 15;
    colHead();
    const blocks = w.blocks.slice().sort((x, z) => String(x.start_date || "").localeCompare(String(z.start_date || "")));
    for (const b of blocks) {
      if (y - 16 < M + 20) { newPage(); T(`${w.name} (Forts.)`, M, y, { size: 10, f: bold }); y -= 15; colHead(); }
      const s = parseD(b.start_date), e = parseD(b.end_date);
      const cs = (s && s < monthStart) ? 1 : (s ? parseInt(s.substring(8, 10), 10) : 1);
      const ce = (!e || e > monthEnd) ? lastDay : parseInt(e.substring(8, 10), 10);
      const days = Math.max(1, ce - cs + 1);
      const label = b.client_name || b.location_address || b.worker_description || "Einsatz";
      /* JEDER Zustand, der KEINE Besetzung ist, muss hier stehen. Das PDF ist
       * als abrechnungsrelevant ausgewiesen, und die Quelle
       * (`getAssignmentLinksForSupplier`) filtert `is_active` nicht — eine
       * verfallene oder abgelehnte Zuweisung stand deshalb als ganz normaler
       * Einsatzblock im Plan, ununterscheidbar von einer bestaetigten.
       * `expired` seit Migration 195, `worker_declined` war schon vorher
       * unsichtbar. Ein unbekannter Wert bleibt lieber unmarkiert, als eine
       * Besetzung zu behaupten — deshalb die ausdrueckliche Liste. */
      const ZUSATZ = {
        worker_unavailable:   "  (freigestellt)",
        pending_confirmation: "  (unbestaetigt)",
        expired:              "  (Frist abgelaufen)",
        worker_declined:      "  (abgelehnt)"
      };
      const flag = ZUSATZ[b.worker_confirmation_status] || "";
      T(san(label).slice(0, 46) + flag, cX.client, y, { size: 9 });
      T(fmtDE(b.start_date), cX.von, y, { size: 9 });
      T(b.end_date ? fmtDE(b.end_date) : "offen", cX.bis, y, { size: 9 });
      T(String(days), cX.tage, y, { size: 9 });
      T(b.default_hours_per_day != null ? String(b.default_hours_per_day) : "-", cX.std, y, { size: 9 });
      y -= 13;
    }
    y -= 12;
  }

  return await doc.save();
}
