// Geteilte SOC-UI-Bausteine + Formatter.
import type { ReactNode } from "react";

export function Spinner() {
  return <div className="soc-spinner" role="status" aria-label="Lädt" />;
}

export function CenterState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="soc-center">
      <div className="soc-brand-sub">TempConnect — Support Operations Center</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
      {children}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="soc-empty">{text}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="soc-error-box">{message}</div>;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function pct(v: number | null): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}
export function hours(v: number | null): string {
  return v === null || v === undefined ? "—" : `${v} h`;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Neu", open: "Offen", in_progress: "In Arbeit", waiting_customer: "Wartet (Kunde)",
  waiting_internal: "Wartet (intern)", escalated: "Eskaliert", escalated_decisions: "Eskaliert (Decisions)",
  escalated_commercial: "Eskaliert (Commercial)", escalated_ops: "Eskaliert (Ops)",
  resolved: "Gelöst", closed: "Geschlossen", reopened: "Wieder geöffnet",
};
export function statusLabel(s: string): string { return STATUS_LABEL[s] || s; }

export function StatusBadge({ status }: { status: string }) {
  const closed = status === "closed" || status === "resolved";
  const esc = status.startsWith("escalated");
  const cls = esc ? "soc-badge--warn" : closed ? "soc-badge--ok" : "soc-badge--accent";
  return <span className={`soc-badge ${cls}`}>{statusLabel(status)}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cls = priority === "critical" || priority === "urgent" ? "soc-badge--danger"
    : priority === "high" ? "soc-badge--warn" : "soc-badge--neutral";
  return <span className={`soc-badge ${cls}`}>{priority}</span>;
}

export function SlaBadge({ state, hoursRemaining }: { state: string; hoursRemaining: number | null }) {
  if (state === "breached") return <span className="soc-badge soc-badge--danger">SLA verletzt</span>;
  if (state === "at_risk") return <span className="soc-badge soc-badge--warn">SLA-Risiko{hoursRemaining != null ? ` · ${hoursRemaining}h` : ""}</span>;
  return <span className="soc-badge soc-badge--ok">SLA ok</span>;
}

export function Pager({ page, perPage, total, hasMore, onPage }: {
  page: number; perPage: number; total: number; hasMore: boolean; onPage: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <div className="soc-pager">
      <span>{from}–{to} von {total}</span>
      <button className="soc-btn soc-btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Zurück</button>
      <button className="soc-btn soc-btn--sm" disabled={!hasMore} onClick={() => onPage(page + 1)}>Weiter</button>
    </div>
  );
}
