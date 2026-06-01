/**
 * CommercialInbox — SCC WAVE 05
 * Unified Queue mit Detail-Drawer, SLA-Zähler, Assignee-Anzeige und Preset-Filtern.
 * Ersetzt den Platzhalter im rechten Panel durch echte Item-Detaildaten.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { useNav } from "@scc/state/NavContext";
import { useBootstrap } from "@scc/state/BootstrapContext";
import { fmtDate, fmtCents, fmtNum } from "@scc/utils/format";

// ─── Types ──────────────────────────────────────────────

interface InboxItem {
  id: string;
  source_type: string;
  contact_email: string | null;
  contact_name: string | null;
  requester_company_name: string | null;
  original_status: string;
  summary_status: string;
  priority: string;
  plan: string | null;
  proposed_price_cents: number | null;
  monthly_estimate_cents: number | null;
  assigned_staff_id: string | null;
  updated_at: string | null;
  created_at: string;
}

interface AssigneeInfo {
  staff_id: string;
  email: string | null;
  display_name: string | null;
}

interface ThreadMessage {
  id: string;
  author_staff_id: string | null;
  author_email: string | null;
  author_name: string | null;
  is_internal: boolean;
  body: string;
  created_at: string;
}

interface InboxDetail extends InboxItem {
  org_name: string | null;
  org_type: string | null;
  request_type: string | null;
  current_plan: string | null;
  desired_plan: string | null;
  proposed_term_months: number | null;
  seats_requested: number | null;
  notes: string | null;
  age_days: number | null;
  assignee: AssigneeInfo | null;
  messages: ThreadMessage[];
  message_count: number;
  source_context: string | null;
}

interface StaffMember {
  user_id: string;
  email: string;
  display_name: string | null;
}

interface InboxResponse {
  items: InboxItem[];
  totals: { total: number; by_source: Record<string, number> };
}

// ─── Constants ──────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  enterprise_request:          "Enterprise Request",
  subscription_upgrade:        "Upgrade",
  subscription_downgrade:      "Downgrade",
  subscription_cancellation:   "Cancellation",
  subscription_pilot:          "Pilot",
  subscription_new_individual: "Neu (Individuell)",
};

const SOURCE_TONES: Record<string, string> = {
  enterprise_request:          "warn",
  subscription_upgrade:        "ok",
  subscription_downgrade:      "warn",
  subscription_cancellation:   "danger",
  subscription_pilot:          "",
  subscription_new_individual: "warn",
};

const SUMMARY_STATUSES = ["open", "needs_action", "closed"];

// ─── SLA helpers ────────────────────────────────────────

function ageMsFromCreated(createdAt: string): number {
  return Date.now() - new Date(createdAt).getTime();
}

function fmtSlaAge(createdAt: string): string {
  const ms = ageMsFromCreated(createdAt);
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function isSlaWarning(createdAt: string): boolean {
  return ageMsFromCreated(createdAt) > 48 * 3_600_000;
}

// ─── Preset filters ─────────────────────────────────────

interface FilterState {
  summaryStatus: string;
  sourceType: string | null;
  assignedToMe: boolean;
  olderThan48h: boolean;
  noAssignee: boolean;
}

const EMPTY_FILTER: FilterState = {
  summaryStatus: "open", sourceType: null,
  assignedToMe: false, olderThan48h: false, noAssignee: false,
};

type PresetKey = "my_open" | "enterprise" | "cancellations" | "overdue" | "unassigned";

const PRESETS: Array<{ key: PresetKey; label: string; filter: Partial<FilterState> }> = [
  { key: "my_open",       label: "Meine offenen",        filter: { summaryStatus: "open", assignedToMe: true } },
  { key: "enterprise",    label: "Enterprise / Ind.",     filter: { sourceType: "enterprise_request", summaryStatus: "open" } },
  { key: "cancellations", label: "Kündigungen",           filter: { sourceType: "subscription_cancellation", summaryStatus: "" } },
  { key: "overdue",       label: "Älter 48h",            filter: { olderThan48h: true, summaryStatus: "open" } },
  { key: "unassigned",    label: "Ohne Assignee",         filter: { noAssignee: true, summaryStatus: "open" } },
];

// ─── Saved filters (localStorage) ───────────────────────

const LS_KEY = "scc.savedFilters.v2";
function loadSaved(): Record<string, FilterState> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") ?? {}; }
  catch { return {}; }
}
function saveSaved(data: Record<string, FilterState>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

// ─── Component ──────────────────────────────────────────

export default function CommercialInbox() {
  const confirm      = useConfirm();
  const stepUp       = useStepUp();
  const toast        = useToast();
  const nav          = useNav();
  const { data: bsData } = useBootstrap();
  const myUserId     = bsData?.staff?.user_id ?? null;

  // ── Filter state ──────────────────────────────────────
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);

  // ── List state ────────────────────────────────────────
  const [items,   setItems]   = useState<InboxItem[]>([]);
  const [totals,  setTotals]  = useState<InboxResponse["totals"]>({ total: 0, by_source: {} });
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  // ── Detail pane state ─────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [detail,        setDetail]        = useState<InboxDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr,     setDetailErr]     = useState<string | null>(null);
  const [staffMembers,  setStaffMembers]  = useState<StaffMember[]>([]);

  // ── Bulk selection ────────────────────────────────────
  const selectionRef = useRef<Map<string, string>>(new Map());
  const [selCount, setSelCount] = useState(0);

  // ── Load list ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const qs: string[] = [];
    if (filter.sourceType)  qs.push("source_type="    + encodeURIComponent(filter.sourceType));
    if (filter.summaryStatus) qs.push("summary_status=" + encodeURIComponent(filter.summaryStatus));
    if (filter.assignedToMe && myUserId) qs.push("assigned_to_me=1");
    try {
      const resp = await sccApi.get<InboxResponse>(`/inbox${qs.length ? "?" + qs.join("&") : ""}`);
      let result = resp.items ?? [];

      // Client-side filters that need post-processing
      if (filter.olderThan48h) {
        result = result.filter((i) => isSlaWarning(i.created_at));
      }
      if (filter.noAssignee) {
        result = result.filter((i) => !i.assigned_staff_id);
      }

      setItems(result);
      setTotals(resp.totals ?? { total: 0, by_source: {} });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter, myUserId]);

  useEffect(() => {
    selectionRef.current.clear();
    setSelCount(0);
    void load();
  }, [load]);

  // ── Load staff members (once) ─────────────────────────
  useEffect(() => {
    sccApi.get<{ members: StaffMember[] }>("/staff-members")
      .then((r) => setStaffMembers(r.members ?? []))
      .catch(() => { /* non-critical */ });
  }, []);

  // ── Load detail on selection ──────────────────────────
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    setDetailErr(null);
    sccApi.get<InboxDetail>(`/inbox/${selectedId}`)
      .then((d) => setDetail(d))
      .catch((e: unknown) => setDetailErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // ── Helpers ───────────────────────────────────────────
  const applyPreset = (preset: typeof PRESETS[number]) => {
    setFilter({ ...EMPTY_FILTER, ...preset.filter });
  };

  const hasSaved = !!loadSaved()["commercial-inbox"];

  const saveFilter = () => {
    const all = loadSaved();
    all["commercial-inbox"] = filter;
    saveSaved(all);
    toast.success("Filter gespeichert.");
  };

  const loadFilter = () => {
    const s = loadSaved()["commercial-inbox"];
    if (s) setFilter(s);
  };

  const resetFilter = () => setFilter(EMPTY_FILTER);

  const toggleCheck = (id: string, src: string, checked: boolean) => {
    if (checked) selectionRef.current.set(id, src);
    else         selectionRef.current.delete(id);
    setSelCount(selectionRef.current.size);
  };

  const clearSelection = () => {
    selectionRef.current.clear();
    setSelCount(0);
  };

  const runBulk = (operation: string, title: string) => {
    confirm({
      title,
      hint: "Audit-Eintrag pro Item, Step-up + Reason verpflichtend. Aktivierungen sind hier NICHT erlaubt.",
      onConfirm: async (reason) => {
        await stepUp();
        const bulkItems = Array.from(selectionRef.current.entries())
          .map(([id, source_type]) => ({ id, source_type }));
        if (!bulkItems.length) throw new Error("Keine validen Items in Auswahl.");
        const resp = await sccApi.post<{ processed?: number; success?: unknown[]; failed?: unknown[] }>("/inbox/bulk", {
          confirmed: true, reason, operation, items: bulkItems,
        });
        const msg = `${resp.processed ?? bulkItems.length} verarbeitet, ${resp.success?.length ?? 0} ok, ${resp.failed?.length ?? 0} Fehler.`;
        const hasFailed = (resp.failed?.length ?? 0) > 0;
        if (hasFailed) toast.warn(msg); else toast.success(msg);
        selectionRef.current.clear();
        setSelCount(0);
        await load();
      },
    });
  };

  const handleItemClick = (item: InboxItem, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    setSelectedId((prev) => prev === item.id ? null : item.id);
  };

  const drilldown = (item: InboxItem | InboxDetail) => {
    const area = item.source_type === "enterprise_request"
      ? "customer-requests" as const
      : "subscription-requests" as const;
    nav.navigate(area, item.id);
  };

  const getStaffName = (id: string | null): string => {
    if (!id) return "–";
    const m = staffMembers.find((s) => s.user_id === id);
    return m?.display_name ?? m?.email ?? id.slice(0, 8) + "…";
  };

  // ── Render list item ──────────────────────────────────
  const renderItem = (r: InboxItem) => {
    const srcTone   = SOURCE_TONES[r.source_type] ?? "";
    const prioTone  = r.priority === "high" ? "danger" : r.priority === "low" ? "ok" : "warn";
    const company   = r.requester_company_name ?? r.contact_email ?? "(Public-Lead)";
    const slaWarn   = isSlaWarning(r.created_at);
    const isSelected = selectedId === r.id;

    return (
      <div
        key={r.id}
        className={`scc-inbox__item${isSelected ? " is-selected" : ""}`}
        onClick={(e) => handleItemClick(r, e)}
        role="button"
        tabIndex={0}
        aria-selected={isSelected}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleItemClick(r, e as unknown as React.MouseEvent); }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            defaultChecked={selectionRef.current.has(r.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => toggleCheck(r.id, r.source_type, e.target.checked)}
            aria-label={`${company} auswählen`}
          />
          <div style={{ flex: 1 }}>
            <div className="scc-inbox__item-title">{company}</div>
            <div className="scc-inbox__item-meta">
              <span className={`scc-status${srcTone ? ` scc-status--${srcTone}` : ""}`}>
                {SOURCE_LABELS[r.source_type] ?? r.source_type}
              </span>
              <span className="scc-status">{r.original_status}</span>
              <span className={`scc-status scc-status--${prioTone}`}>{r.priority}</span>
              {r.plan && <span className="scc-pill">{r.plan}</span>}
              {r.proposed_price_cents != null && (
                <span className="scc-pill">{fmtCents(r.proposed_price_cents)}</span>
              )}
              <span
                className={`scc-pill${slaWarn ? " scc-pill--warn" : ""}`}
                title={`Erstellt: ${fmtDate(r.created_at)}`}
              >
                {fmtSlaAge(r.created_at)}
              </span>
              {r.assigned_staff_id && (
                <span className="scc-pill" title={`Assignee: ${getStaffName(r.assigned_staff_id)}`}>
                  ↦ {getStaffName(r.assigned_staff_id)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Detail Pane ───────────────────────────────────────
  const renderDetail = () => {
    if (!selectedId) {
      return (
        <div className="scc-inbox__detail-empty">
          <div className="scc-muted">Wählen Sie ein Item links für Details.</div>
        </div>
      );
    }
    if (detailLoading) return <div className="scc-loading">Lade Details…</div>;
    if (detailErr)     return <div className="scc-error-inline" role="alert">{detailErr}</div>;
    if (!detail)       return null;

    const srcTone  = SOURCE_TONES[detail.source_type] ?? "";
    const prioTone = detail.priority === "high" ? "danger" : detail.priority === "low" ? "ok" : "warn";
    const slaWarn  = isSlaWarning(detail.created_at);

    return (
      <div className="scc-inbox__detail-content">
        {/* Header */}
        <div className="scc-inbox__detail-header">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <span className={`scc-status${srcTone ? ` scc-status--${srcTone}` : ""}`}>
              {SOURCE_LABELS[detail.source_type] ?? detail.source_type}
            </span>
            <span className="scc-status">{detail.original_status}</span>
            <span className={`scc-status scc-status--${prioTone}`}>{detail.priority}</span>
            {slaWarn && <span className="scc-pill scc-pill--warn" title="SLA-Warnung: älter als 48h">⚠ {fmtSlaAge(detail.created_at)} alt</span>}
            {!slaWarn && <span className="scc-pill">{fmtSlaAge(detail.created_at)} alt</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="scc-btn" onClick={() => drilldown(detail)}>
              Vollansicht →
            </button>
          </div>
        </div>

        {/* Contact + Org */}
        <div className="scc-detail-section">
          <div className="scc-detail-row">
            <span className="scc-detail-label">Kontakt</span>
            <span>{detail.contact_name ?? "–"} {detail.contact_email ? `(${detail.contact_email})` : ""}</span>
          </div>
          {detail.requester_company_name && (
            <div className="scc-detail-row">
              <span className="scc-detail-label">Unternehmen</span>
              <span>{detail.requester_company_name}</span>
            </div>
          )}
          {detail.org_name && (
            <div className="scc-detail-row">
              <span className="scc-detail-label">Organisation</span>
              <span>{detail.org_name} {detail.org_type ? `(${detail.org_type})` : ""}</span>
            </div>
          )}
        </div>

        {/* Plan / Subscription Details */}
        <div className="scc-detail-section">
          {detail.plan && (
            <div className="scc-detail-row">
              <span className="scc-detail-label">Plan</span>
              <span>
                {detail.current_plan && detail.desired_plan
                  ? `${detail.current_plan} → ${detail.desired_plan}`
                  : detail.plan}
              </span>
            </div>
          )}
          {detail.proposed_price_cents != null && (
            <div className="scc-detail-row">
              <span className="scc-detail-label">Angebotspreis</span>
              <span>{fmtCents(detail.proposed_price_cents)}{detail.proposed_term_months ? ` / ${detail.proposed_term_months} Mo` : ""}</span>
            </div>
          )}
          {detail.monthly_estimate_cents != null && (
            <div className="scc-detail-row">
              <span className="scc-detail-label">Monatlich (est.)</span>
              <span>{fmtCents(detail.monthly_estimate_cents)}</span>
            </div>
          )}
          {detail.seats_requested != null && (
            <div className="scc-detail-row">
              <span className="scc-detail-label">Sitze</span>
              <span>{fmtNum(detail.seats_requested)}</span>
            </div>
          )}
        </div>

        {/* Assignee */}
        <div className="scc-detail-section">
          <div className="scc-detail-row">
            <span className="scc-detail-label">Assignee</span>
            <span>
              {detail.assignee
                ? (detail.assignee.display_name ?? detail.assignee.email ?? detail.assignee.staff_id)
                : <em className="scc-muted">Nicht zugewiesen</em>
              }
            </span>
          </div>
          <div className="scc-detail-row">
            <span className="scc-detail-label">Erstellt</span>
            <span>{fmtDate(detail.created_at)}</span>
          </div>
          <div className="scc-detail-row">
            <span className="scc-detail-label">Aktualisiert</span>
            <span>{fmtDate(detail.updated_at ?? detail.created_at)}</span>
          </div>
        </div>

        {/* Notes */}
        {detail.notes && (
          <div className="scc-detail-section">
            <div className="scc-detail-label" style={{ marginBottom: 4 }}>Notizen</div>
            <div className="scc-detail-notes">{detail.notes}</div>
          </div>
        )}

        {/* Thread */}
        {detail.message_count > 0 && (
          <div className="scc-detail-section">
            <div className="scc-detail-label" style={{ marginBottom: 6 }}>
              Nachrichten ({detail.message_count})
            </div>
            <div className="scc-thread">
              {detail.messages.map((m) => (
                <div
                  key={m.id}
                  className={`scc-thread__msg${m.is_internal ? " scc-thread__msg--internal" : ""}`}
                >
                  <div className="scc-thread__meta">
                    <span>{m.author_name ?? m.author_email ?? m.author_staff_id ?? "System"}</span>
                    <span className="scc-muted">{fmtDate(m.created_at)}</span>
                    {m.is_internal && <span className="scc-pill" style={{ fontSize: 9 }}>intern</span>}
                  </div>
                  <div className="scc-thread__body">{m.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────
  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Commercial Inbox</h1>
          <div className="scc-section__sub">
            Vereinte Sicht: Enterprise Requests + Subscription-Anfragen. Prio-sortiert.
          </div>
        </div>
        <button className="scc-btn" onClick={() => void load()} aria-label="Reload">
          ↺ Reload
        </button>
      </div>

      {/* Preset Filters */}
      <div className="scc-inbox__presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className="scc-inbox__preset"
            onClick={() => applyPreset(p)}
            title={p.label}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="scc-inbox">
        {/* List pane */}
        <div className="scc-inbox__list">
          {/* Summary status filter */}
          <div className="scc-inbox__filters">
            {SUMMARY_STATUSES.map((s) => (
              <button
                key={s}
                className={`scc-inbox__filter${filter.summaryStatus === s ? " is-active" : ""}`}
                onClick={() => setFilter((f) => ({ ...f, summaryStatus: s }))}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Source type filter */}
          <div className="scc-inbox__filters" style={{ marginTop: 6 }}>
            <button
              className={`scc-inbox__filter${!filter.sourceType ? " is-active" : ""}`}
              onClick={() => setFilter((f) => ({ ...f, sourceType: null }))}
            >
              Alle Quellen
            </button>
            {Object.entries(SOURCE_LABELS).map(([k, label]) => (
              <button
                key={k}
                className={`scc-inbox__filter${filter.sourceType === k ? " is-active" : ""}`}
                onClick={() => setFilter((f) => ({ ...f, sourceType: k }))}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom saved filters */}
          <div className="scc-inbox__filters" style={{ marginTop: 6 }}>
            <button className="scc-inbox__filter" onClick={saveFilter}>Speichern</button>
            <button className="scc-inbox__filter" onClick={loadFilter}>
              Laden {hasSaved && <span className="scc-pill" style={{ marginLeft: 4 }}>✓</span>}
            </button>
            <button className="scc-inbox__filter" onClick={resetFilter}>Reset</button>
          </div>

          {/* Bulk toolbar */}
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
            {selCount === 0
              ? <span className="scc-muted">Checkboxen aktivieren für Bulk-Aktionen.</span>
              : <>
                  <span className="scc-pill">{selCount} ausgewählt</span>
                  <button className="scc-btn scc-btn--danger" onClick={() => runBulk("reject_with_reason", "Bulk: Ablehnen")}>Ablehnen</button>
                  <button className="scc-btn" onClick={() => runBulk("to_under_review", "Bulk: Under Review")}>Under Review</button>
                  <button className="scc-btn" onClick={clearSelection}>Auswahl leeren</button>
                </>
            }
          </div>

          {/* Items */}
          {loading && <div className="scc-loading">Lade…</div>}
          {err     && <div className="scc-error-inline" role="alert">{err}</div>}
          {!loading && !err && (
            <>
              {items.length > 0 && (
                <div className="scc-muted" style={{ padding: "6px 8px", fontSize: 11 }}>
                  {fmtNum(totals.total)} gesamt
                  {Object.entries(totals.by_source ?? {}).map(([k, v]) => (
                    <span key={k}> · {SOURCE_LABELS[k] ?? k}: {fmtNum(v)}</span>
                  ))}
                </div>
              )}
              {items.length === 0
                ? <div className="scc-muted" style={{ padding: 16 }}>Keine Items in diesem Filter.</div>
                : items.map(renderItem)
              }
            </>
          )}
        </div>

        {/* Detail pane */}
        <div className="scc-inbox__detail" aria-label="Detail-Ansicht">
          {renderDetail()}
        </div>
      </div>
    </div>
  );
}
