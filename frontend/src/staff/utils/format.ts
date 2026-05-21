/** Format-Helpers für das SCC — identisch zu staffShell.js-Helpers */

export function fmtDate(s: string | null | undefined): string {
  try {
    if (!s) return "–";
    return new Date(s).toLocaleString("de-DE");
  } catch {
    return "–";
  }
}

export function fmtDateShort(s: string | null | undefined): string {
  try {
    if (!s) return "–";
    return new Date(s).toLocaleDateString("de-DE");
  } catch {
    return "–";
  }
}

export function fmtNum(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString("de-DE");
}

export function fmtCents(c: number | string | null | undefined): string {
  if (c == null || c === "") return "–";
  const n = Number(c) / 100;
  if (!isFinite(n)) return "–";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
}

export function shortId(id: string | null | undefined): string {
  if (!id) return "–";
  return String(id).slice(0, 8);
}

export function statusTone(status: string): string {
  if (status === "eingegangen" || status === "rueckfrage_offen") return "warn";
  if (status === "angebot_erstellt" || status === "bestaetigt") return "ok";
  if (status === "aktiviert") return "ok";
  if (status === "abgelehnt") return "danger";
  return "warn";
}

export function subStatusTone(status: string): string {
  if (["draft", "submitted", "under_review", "needs_clarification"].includes(status)) return "warn";
  if (["offered", "accepted", "active"].includes(status)) return "ok";
  if (["rejected", "cancelled", "expired"].includes(status)) return "danger";
  return "warn";
}

export function riskTone(level: string): string {
  if (level === "critical") return "critical";
  if (level === "high") return "danger";
  if (level === "medium") return "warn";
  return "ok";
}

export function priorityFromStatus(status: string): string {
  if (status === "rueckfrage_offen") return "high";
  if (status === "abgelehnt" || status === "abgeschlossen") return "low";
  return "normal";
}
