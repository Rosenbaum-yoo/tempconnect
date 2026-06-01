/**
 * Support — SCC WAVE 07
 *
 * KPI-Karten: Offene Cases, Eskaliert, SLA-Brüche, Kritisch
 * Eskalations-Tabelle (aus Snapshot — ausstehende Eskalationen)
 * Cases-Liste mit Filter (status / priority / case_type)
 * Detail-Pane bei Auswahl: Case-Info + Notes-Timeline + Eskalations-Detail
 * Impersonation-Policy-Banner
 * Vollständiger Zero-State + Soft-Fail-Muster
 */

import { useState, useEffect, useCallback } from "react";
import { sccApi }       from "@scc/api/client";
import { useSccQuery }  from "@scc/hooks/useSccQuery";
import { fmtNum }       from "@scc/utils/format";

// ─── Types ───────────────────────────────────────────────────

interface SupportKpi {
  open_cases:       number;
  escalated_cases:  number;
  sla_breach_count: number;
  critical_count:   number;
}

interface EscalationItem {
  id:           string;
  case_number:  string;
  case_subject: string;
  org_name:     string | null;
  target:       string;
  priority:     string;
  summary:      string;
  reason:       string;
  status:       "pending" | "acknowledged" | "resolved" | "rejected";
  created_at:   string;
  resolved_at:  string | null;
  resolution_note: string | null;
}

interface SupportSnapshot {
  generated_at: string;
  kpi:          SupportKpi;
  escalations:  EscalationItem[];
  impersonation:{ allowed: boolean; reason: string };
  errors?:      Array<{ area: string; error: string }>;
}

interface SupportCase {
  id:                         string;
  case_number:                string;
  subject:                    string;
  status:                     string;
  priority:                   string;
  case_type:                  string;
  is_escalated:               boolean;
  escalation_target:          string | null;
  sla_resolution_deadline:    string | null;
  sla_first_response_deadline:string | null;
  sla_resolved_at:            string | null;
  sla_first_responded_at:     string | null;
  created_at:                 string;
  updated_at:                 string;
  closed_at:                  string | null;
  org_name:                   string | null;
  reporter_name:              string | null;
  queue_name:                 string | null;
}

interface CaseNote {
  id:           string;
  note_type:    "internal" | "external" | "system";
  body:         string;
  created_at:   string;
  author_name:  string | null;
  author_email: string | null;
}

interface CaseDetail extends SupportCase {
  description: string | null;
  notes:       CaseNote[];
  escalations: EscalationItem[];
}

interface CasesResponse {
  items:  SupportCase[];
  total:  number;
  limit:  number;
  offset: number;
}

// ─── Filter ──────────────────────────────────────────────────

interface FilterState { status: string; priority: string; case_type: string; }
const EMPTY_FILTER: FilterState = { status: "", priority: "", case_type: "" };

// ─── Lookup-Tabellen ─────────────────────────────────────────

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Kritisch", urgent: "Dringend", high: "Hoch",
  normal: "Normal", low: "Niedrig",
};
const PRIORITY_TONES: Record<string, string> = {
  critical: "danger", urgent: "danger", high: "warn", normal: "", low: "ok",
};
const STATUS_LABELS: Record<string, string> = {
  new: "Neu", open: "Offen", in_progress: "In Bearbeitung",
  waiting_customer: "Wartet auf Kunden", waiting_internal: "Wartet intern",
  escalated: "Eskaliert", escalated_decisions: "Esk. (Entscheidung)",
  escalated_commercial: "Esk. (Commercial)", escalated_ops: "Esk. (Ops)",
  resolved: "Gelöst", closed: "Geschlossen", reopened: "Wiedereröffnet",
};
const CASE_TYPE_LABELS: Record<string, string> = {
  general: "Allgemein", verification: "Verifikation", invite: "Einladung",
  onboarding: "Onboarding", login_access: "Login/Zugang", billing: "Billing",
  feature_question: "Produktfrage", bug_report: "Bug", complaint: "Beschwerde",
  other: "Sonstiges",
};
const NOTE_TYPE_COLORS: Record<string, string> = {
  external: "rgba(56,189,248,0.06)",
  system:   "rgba(139,149,168,0.08)",
  internal: "transparent",
};
const NOTE_TYPE_BORDERS: Record<string, string> = {
  external: "rgba(56,189,248,0.25)",
  system:   "rgba(139,149,168,0.2)",
  internal: "var(--scc-line)",
};

// ─── Helpers ─────────────────────────────────────────────────

function isSlaBreached(d: string | null): boolean {
  return !!d && new Date(d) < new Date();
}

function fmtDeadline(d: string | null): string {
  if (!d) return "–";
  const diffMs = new Date(d).getTime() - Date.now();
  const hrs = Math.floor(Math.abs(diffMs) / 3_600_000);
  if (diffMs < 0) return `${hrs}h überfällig`;
  if (hrs < 1) return "<1h";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────────

export default function Support() {
  const {
    data: snapshot, loading: snapLoading, error: snapError, reload: reloadSnap,
  } = useSccQuery<SupportSnapshot>("/support");

  const [filter,       setFilter]       = useState<FilterState>(EMPTY_FILTER);
  const [cases,        setCases]        = useState<SupportCase[]>([]);
  const [casesTotal,   setCasesTotal]   = useState(0);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesErr,     setCasesErr]     = useState<string | null>(null);

  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [detail,        setDetail]        = useState<CaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr,     setDetailErr]     = useState<string | null>(null);

  // ── Cases laden ──────────────────────────────────────────────
  const loadCases = useCallback(async () => {
    setCasesLoading(true);
    setCasesErr(null);
    const qs: string[] = [];
    if (filter.status)    qs.push("status="    + encodeURIComponent(filter.status));
    if (filter.priority)  qs.push("priority="  + encodeURIComponent(filter.priority));
    if (filter.case_type) qs.push("case_type=" + encodeURIComponent(filter.case_type));
    try {
      const resp = await sccApi.get<CasesResponse>(
        `/support/cases${qs.length ? "?" + qs.join("&") : ""}`
      );
      setCases(resp.items ?? []);
      setCasesTotal(resp.total ?? 0);
    } catch (e: unknown) {
      setCasesErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCasesLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadCases(); }, [loadCases]);

  // ── Detail laden bei Auswahl ─────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    setDetailErr(null);
    sccApi.get<CaseDetail>(`/support/cases/${selectedId}`)
      .then((d) => setDetail(d))
      .catch((e: unknown) => setDetailErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // ── Snapshot-Ladestate ───────────────────────────────────────
  if (snapLoading) return <div className="scc-loading">Lade Support…</div>;
  if (snapError) return (
    <div className="scc-error-inline">
      Fehler: {snapError}
      <button className="scc-btn" onClick={reloadSnap} style={{ marginLeft: 8 }}>
        Retry
      </button>
    </div>
  );

  const kpi = snapshot?.kpi ?? { open_cases: 0, escalated_cases: 0, sla_breach_count: 0, critical_count: 0 };
  const imp = snapshot?.impersonation;
  const hasActiveFilter = !!(filter.status || filter.priority || filter.case_type);

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="scc-section__header">
        <h1 className="scc-section__title">Support</h1>
        <div className="scc-section__sub">
          Cases, Eskalationen, SLA-Status.
          {snapshot?.generated_at && (
            <span className="scc-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              Stand: {new Date(snapshot.generated_at).toLocaleTimeString("de-DE")}
            </span>
          )}
        </div>
      </div>

      {/* ── KPI-Karten ─────────────────────────────────────── */}
      <div className="scc-grid">
        <div className="scc-card">
          <div className="scc-card__eyebrow">Offene Cases</div>
          <div className="scc-card__value">{fmtNum(kpi.open_cases)}</div>
          <div className="scc-card__hint">Nicht gelöst · nicht geschlossen</div>
        </div>

        <div className={`scc-card${kpi.escalated_cases > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">Eskaliert</div>
          <div className="scc-card__value">{fmtNum(kpi.escalated_cases)}</div>
          <div className="scc-card__hint">Aktive Eskalationen</div>
        </div>

        <div className={`scc-card${kpi.sla_breach_count > 0 ? " scc-card--danger" : ""}`}>
          <div className="scc-card__eyebrow">SLA-Brüche</div>
          <div className="scc-card__value">{fmtNum(kpi.sla_breach_count)}</div>
          <div className="scc-card__hint">Resolution-Deadline überschritten</div>
        </div>

        <div className={`scc-card${kpi.critical_count > 0 ? " scc-card--danger" : ""}`}>
          <div className="scc-card__eyebrow">Kritisch offen</div>
          <div className="scc-card__value">{fmtNum(kpi.critical_count)}</div>
          <div className="scc-card__hint">Priority = critical · nicht geschlossen</div>
        </div>
      </div>

      {/* ── Impersonation-Policy-Banner ─────────────────────── */}
      <div className="scc-card" style={{ marginTop: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span
          className={`scc-status scc-status--${imp?.allowed ? "warn" : "ok"}`}
          style={{ fontSize: 13, padding: "4px 10px" }}
        >
          Impersonation: {imp?.allowed ? "ERLAUBT" : "DEAKTIVIERT"}
        </span>
        <span className="scc-muted" style={{ fontSize: 12 }}>{imp?.reason ?? "–"}</span>
      </div>

      {/* ── Offene Eskalationen (Snapshot) ─────────────────── */}
      {(snapshot?.escalations.length ?? 0) > 0 && (
        <>
          <div className="scc-section__header" style={{ marginTop: 0 }}>
            <h2 className="scc-section__title" style={{ fontSize: 14 }}>Offene Eskalationen</h2>
            <span className="scc-muted" style={{ fontSize: 12 }}>
              {snapshot!.escalations.length} ausstehend
            </span>
          </div>

          <table className="scc-table" style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>Case</th>
                <th>Org</th>
                <th>Ziel</th>
                <th>Priorität</th>
                <th>Status</th>
                <th>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {snapshot!.escalations.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className="scc-code" style={{ fontSize: 11 }}>{e.case_number}</span>
                    <div className="scc-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {e.case_subject}
                    </div>
                  </td>
                  <td className="scc-muted" style={{ fontSize: 12 }}>{e.org_name ?? "–"}</td>
                  <td>
                    <span className="scc-code" style={{ fontSize: 11 }}>{e.target}</span>
                  </td>
                  <td>
                    <span className={`scc-status scc-status--${PRIORITY_TONES[e.priority] ?? ""}`}>
                      {PRIORITY_LABELS[e.priority] ?? e.priority}
                    </span>
                  </td>
                  <td className="scc-muted" style={{ fontSize: 12 }}>{e.status}</td>
                  <td className="scc-muted" style={{ fontSize: 11 }}>{fmtDateShort(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ── Cases-Liste mit Filter ──────────────────────────── */}
      <div className="scc-section__header">
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Cases</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>{casesTotal} gesamt</span>
      </div>

      {/* Filterleiste */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={filter.priority}
          onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}
        >
          <option value="">Alle Prioritäten</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={filter.case_type}
          onChange={(e) => setFilter((f) => ({ ...f, case_type: e.target.value }))}
        >
          <option value="">Alle Typen</option>
          {Object.entries(CASE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {hasActiveFilter && (
          <button className="scc-btn" onClick={() => setFilter(EMPTY_FILTER)} style={{ fontSize: 12 }}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Split-Layout: Tabelle + Detail-Pane ─────────────────── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Cases-Tabelle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {casesLoading ? (
            <div className="scc-loading">Lade Cases…</div>
          ) : casesErr ? (
            <div className="scc-error-inline">
              Fehler: {casesErr}
              <button className="scc-btn" onClick={loadCases} style={{ marginLeft: 8 }}>Retry</button>
            </div>
          ) : cases.length === 0 ? (
            <div className="scc-empty-state">
              <div className="scc-empty-state__icon">✓</div>
              <div className="scc-empty-state__text">
                {hasActiveFilter
                  ? "Keine Cases für diesen Filter."
                  : "Keine Support-Cases vorhanden."}
              </div>
              {hasActiveFilter && (
                <button className="scc-btn" onClick={() => setFilter(EMPTY_FILTER)} style={{ marginTop: 8 }}>
                  Filter zurücksetzen
                </button>
              )}
            </div>
          ) : (
            <table className="scc-table">
              <thead>
                <tr>
                  <th>Case-Nr.</th>
                  <th>Betreff</th>
                  <th>Org</th>
                  <th>Priorität</th>
                  <th>Status</th>
                  <th>SLA</th>
                  <th>Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const slaBreached = isSlaBreached(c.sla_resolution_deadline);
                  const isSelected  = c.id === selectedId;
                  return (
                    <tr
                      key={c.id}
                      style={{
                        cursor:     "pointer",
                        background: isSelected ? "var(--scc-panel-2)" : undefined,
                      }}
                      onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    >
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="scc-code" style={{ fontSize: 11 }}>{c.case_number}</span>
                        {c.is_escalated && (
                          <span
                            className="scc-status scc-status--danger"
                            style={{ marginLeft: 4, fontSize: 10, padding: "1px 5px" }}
                          >
                            ESK
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.subject}
                      </td>
                      <td className="scc-muted" style={{ fontSize: 12 }}>{c.org_name ?? "–"}</td>
                      <td>
                        <span className={`scc-status scc-status--${PRIORITY_TONES[c.priority] ?? ""}`}>
                          {PRIORITY_LABELS[c.priority] ?? c.priority}
                        </span>
                      </td>
                      <td className="scc-muted" style={{ fontSize: 12 }}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </td>
                      <td style={{ fontSize: 12, color: slaBreached ? "var(--scc-danger)" : "inherit", whiteSpace: "nowrap" }}>
                        {fmtDeadline(c.sla_resolution_deadline)}
                      </td>
                      <td className="scc-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        {fmtDateShort(c.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail-Pane */}
        {selectedId && (
          <div style={{
            width: 340, flexShrink: 0,
            background: "var(--scc-panel)",
            border: "1px solid var(--scc-line)",
            borderRadius: 8,
            padding: 16,
            position: "sticky",
            top: 16,
          }}>
            {detailLoading ? (
              <div className="scc-loading">Lade Case-Detail…</div>
            ) : detailErr ? (
              <div className="scc-error-inline" style={{ fontSize: 12 }}>Fehler: {detailErr}</div>
            ) : detail ? (
              <CaseDetailPane detail={detail} onClose={() => setSelectedId(null)} />
            ) : null}
          </div>
        )}
      </div>

      {/* Backend-Warnungen */}
      {(snapshot?.errors?.length ?? 0) > 0 && (
        <div style={{
          marginTop: 20, padding: "8px 12px",
          background: "rgba(255,108,114,0.06)",
          borderRadius: 6,
          border: "1px solid var(--scc-danger)",
        }}>
          <div style={{ fontSize: 11, color: "var(--scc-danger)", marginBottom: 4 }}>
            Backend-Warnungen:
          </div>
          {snapshot!.errors!.map((e, i) => (
            <div key={i} className="scc-muted" style={{ fontSize: 11 }}>{e.area}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CaseDetailPane ─────────────────────────────────────────

function CaseDetailPane({ detail, onClose }: { detail: CaseDetail; onClose: () => void }) {
  const slaBreached = isSlaBreached(detail.sla_resolution_deadline);

  return (
    <div>
      {/* Kopfzeile */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <span className="scc-code" style={{ fontSize: 11 }}>{detail.case_number}</span>
          {detail.is_escalated && (
            <span className="scc-status scc-status--danger" style={{ marginLeft: 6, fontSize: 10 }}>
              ESKALIERT
            </span>
          )}
        </div>
        <button
          className="scc-btn"
          onClick={onClose}
          style={{ padding: "2px 8px", fontSize: 12 }}
          aria-label="Detail schließen"
        >
          ✕
        </button>
      </div>

      {/* Betreff */}
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, lineHeight: 1.4 }}>
        {detail.subject}
      </div>

      {/* Beschreibung */}
      {detail.description && (
        <div className="scc-muted" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          {detail.description}
        </div>
      )}

      {/* Metadaten */}
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12, marginBottom: 12 }}>
        <dt className="scc-muted">Status</dt>
        <dd>{STATUS_LABELS[detail.status] ?? detail.status}</dd>

        <dt className="scc-muted">Priorität</dt>
        <dd>
          <span className={`scc-status scc-status--${PRIORITY_TONES[detail.priority] ?? ""}`}>
            {PRIORITY_LABELS[detail.priority] ?? detail.priority}
          </span>
        </dd>

        <dt className="scc-muted">Typ</dt>
        <dd>{CASE_TYPE_LABELS[detail.case_type] ?? detail.case_type}</dd>

        {detail.org_name && (
          <><dt className="scc-muted">Org</dt><dd>{detail.org_name}</dd></>
        )}
        {detail.reporter_name && (
          <><dt className="scc-muted">Melder</dt><dd>{detail.reporter_name}</dd></>
        )}
        {detail.queue_name && (
          <><dt className="scc-muted">Queue</dt><dd>{detail.queue_name}</dd></>
        )}

        <dt className="scc-muted">SLA Deadline</dt>
        <dd style={{ color: slaBreached ? "var(--scc-danger)" : "inherit" }}>
          {detail.sla_resolution_deadline
            ? `${fmtDeadline(detail.sla_resolution_deadline)} (${fmtDateShort(detail.sla_resolution_deadline)})`
            : "–"}
        </dd>

        <dt className="scc-muted">Erstellt</dt>
        <dd>{fmtDateTime(detail.created_at)}</dd>

        {detail.closed_at && (
          <><dt className="scc-muted">Geschlossen</dt><dd>{fmtDateTime(detail.closed_at)}</dd></>
        )}
      </dl>

      {/* Eskalationen zu diesem Case */}
      {detail.escalations.length > 0 && (
        <>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
            Eskalationen ({detail.escalations.length})
          </div>
          {detail.escalations.map((e) => (
            <div
              key={e.id}
              style={{
                marginBottom: 6, padding: "6px 8px", borderRadius: 4,
                background: "rgba(255,108,114,0.06)",
                border:     "1px solid rgba(255,108,114,0.2)",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                <span className={`scc-status scc-status--${PRIORITY_TONES[e.priority] ?? ""}`} style={{ fontSize: 10 }}>
                  {PRIORITY_LABELS[e.priority] ?? e.priority}
                </span>
                <span className="scc-code" style={{ fontSize: 10 }}>{e.target}</span>
                <span className="scc-muted" style={{ fontSize: 10 }}>{e.status}</span>
              </div>
              <div className="scc-muted" style={{ lineHeight: 1.4 }}>{e.summary}</div>
              {e.resolution_note && (
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--scc-ok)" }}>
                  {e.resolution_note}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Notes-Timeline */}
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, marginTop: 14 }}>
        Notizen ({detail.notes.length})
      </div>

      {detail.notes.length === 0 ? (
        <div className="scc-muted" style={{ fontSize: 12 }}>Keine Notizen vorhanden.</div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {detail.notes.map((n) => (
            <div
              key={n.id}
              style={{
                marginBottom: 8, padding: "6px 8px", borderRadius: 4,
                background: NOTE_TYPE_COLORS[n.note_type] ?? "transparent",
                border:     `1px solid ${NOTE_TYPE_BORDERS[n.note_type] ?? "var(--scc-line)"}`,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, gap: 4 }}>
                <span style={{ fontSize: 11 }}>
                  {n.author_name ?? n.author_email ?? "System"}
                  {" · "}
                  <span className="scc-code" style={{ fontSize: 10 }}>{n.note_type}</span>
                </span>
                <span className="scc-muted" style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                  {fmtDateTime(n.created_at)}
                </span>
              </div>
              <div style={{ lineHeight: 1.5 }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
