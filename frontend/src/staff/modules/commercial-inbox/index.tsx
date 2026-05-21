import { useState, useEffect, useCallback, useRef } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useNav } from "@scc/state/NavContext";
import { fmtDate, fmtCents, fmtNum } from "@scc/utils/format";

// ─── Types ──────────────────────────────────────────────

interface InboxItem {
  id: string;
  source_type: string;
  contact_email: string | null;
  requester_company_name: string | null;
  original_status: string;
  priority: string;
  plan: string | null;
  proposed_price_cents: number | null;
  monthly_estimate_cents: number | null;
  updated_at: string | null;
  created_at: string;
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

const LS_KEY = "scc.savedFilters.v1";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") ?? {}; }
  catch { return {}; }
}
function saveSaved(data: Record<string, unknown>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

// ─── Component ──────────────────────────────────────────

export default function CommercialInbox() {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const nav     = useNav();

  const [summaryStatus, setSummaryStatus] = useState("open");
  const [sourceType,    setSourceType]    = useState<string | null>(null);

  const [items,   setItems]   = useState<InboxItem[]>([]);
  const [totals,  setTotals]  = useState<InboxResponse["totals"]>({ total: 0, by_source: {} });
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  // Bulk selection: id → source_type
  const selectionRef = useRef<Map<string, string>>(new Map());
  const [selCount, setSelCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const qs: string[] = [];
    if (sourceType)    qs.push("source_type="   + encodeURIComponent(sourceType));
    if (summaryStatus) qs.push("summary_status=" + encodeURIComponent(summaryStatus));
    try {
      const resp = await sccApi.get(`/inbox${qs.length ? "?" + qs.join("&") : ""}`) as InboxResponse;
      setItems(resp.items ?? []);
      setTotals(resp.totals ?? { total: 0, by_source: {} });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [summaryStatus, sourceType]);

  useEffect(() => {
    selectionRef.current.clear();
    setSelCount(0);
    load();
  }, [load]);

  const hasSaved = !!loadSaved()["commercial-inbox"];

  const saveFilter = () => {
    const all = loadSaved();
    all["commercial-inbox"] = { summaryStatus, sourceType };
    saveSaved(all);
  };

  const loadFilter = () => {
    const s = loadSaved()["commercial-inbox"] as { summaryStatus: string; sourceType: string | null } | undefined;
    if (!s) return;
    setSummaryStatus(s.summaryStatus ?? "open");
    setSourceType(s.sourceType ?? null);
  };

  const resetFilter = () => { setSummaryStatus("open"); setSourceType(null); };

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
        const resp = await sccApi.post("/inbox/bulk", {
          confirmed: true, reason, operation, items: bulkItems,
        }) as { processed?: number; success?: unknown[]; failed?: unknown[] };
        const msg = `${resp.processed ?? bulkItems.length} verarbeitet, ${resp.success?.length ?? 0} ok, ${resp.failed?.length ?? 0} Fehler.`;
        alert(msg);
        selectionRef.current.clear();
        setSelCount(0);
        await load();
      },
    });
  };

  const drilldown = (item: InboxItem) => {
    const area = item.source_type === "enterprise_request"
      ? "customer-requests" as const
      : "subscription-requests" as const;
    nav.navigate(area, item.id);
  };

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Commercial Inbox</h1>
        <div className="scc-section__sub">
          Vereinte Sicht: Public Enterprise Requests + alle Subscription-Anfragen. Quelle als Pill, sortiert nach Priorität.
        </div>
      </div>

      <div className="scc-inbox">
        {/* List pane */}
        <div className="scc-inbox__list">
          {/* Summary status filter */}
          <div className="scc-inbox__filters">
            {SUMMARY_STATUSES.map((s) => (
              <button
                key={s}
                className={`scc-inbox__filter${summaryStatus === s ? " is-active" : ""}`}
                onClick={() => setSummaryStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Source type filter */}
          <div className="scc-inbox__filters" style={{ marginTop: 6 }}>
            <button
              className={`scc-inbox__filter${!sourceType ? " is-active" : ""}`}
              onClick={() => setSourceType(null)}
            >
              Alle Quellen
            </button>
            {Object.entries(SOURCE_LABELS).map(([k, label]) => (
              <button
                key={k}
                className={`scc-inbox__filter${sourceType === k ? " is-active" : ""}`}
                onClick={() => setSourceType(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Saved filters */}
          <div className="scc-inbox__filters" style={{ marginTop: 6 }}>
            <button className="scc-inbox__filter" onClick={saveFilter}>Filter speichern</button>
            <button className="scc-inbox__filter" onClick={loadFilter}>
              Saved laden {hasSaved && <span className="scc-pill" style={{ marginLeft: 4 }}>✓</span>}
            </button>
            <button className="scc-inbox__filter" onClick={resetFilter}>Reset</button>
          </div>

          {/* Bulk toolbar */}
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
            {selCount === 0
              ? <span className="scc-muted">Keine Auswahl. Checkboxen aktivieren für Bulk-Aktionen.</span>
              : <>
                  <span className="scc-pill">{selCount} ausgewählt</span>
                  <button className="scc-btn scc-btn--danger" onClick={() => runBulk("reject_with_reason", "Bulk: Ablehnen mit Begründung")}>Ablehnen</button>
                  <button className="scc-btn" onClick={() => runBulk("to_under_review", "Bulk: Auf under_review setzen")}>Auf under_review</button>
                  <button className="scc-btn" onClick={clearSelection}>Auswahl leeren</button>
                </>
            }
          </div>

          {/* Items */}
          {loading && <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>}
          {err     && <div className="scc-error-inline">{err}</div>}
          {!loading && !err && (
            <>
              {items.length > 0 && (
                <div className="scc-muted" style={{ padding: "6px 0", fontSize: 12 }}>
                  Total: {fmtNum(totals.total)}
                  {Object.entries(totals.by_source ?? {}).map(([k, v]) => (
                    <span key={k}> · {SOURCE_LABELS[k] ?? k}:{fmtNum(v)}</span>
                  ))}
                </div>
              )}

              {items.length === 0
                ? <div className="scc-muted" style={{ padding: 10 }}>Keine Items im Filter.</div>
                : items.map((r) => {
                    const srcTone  = SOURCE_TONES[r.source_type] ?? "";
                    const prioTone = r.priority === "high" ? "danger" : r.priority === "low" ? "ok" : "warn";
                    const company  = r.requester_company_name ?? r.contact_email ?? "(Public-Lead)";
                    const isChecked = selectionRef.current.has(r.id);

                    return (
                      <div
                        key={r.id}
                        className="scc-inbox__item"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).tagName === "INPUT") return;
                          drilldown(r);
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <input
                            type="checkbox"
                            defaultChecked={isChecked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => toggleCheck(r.id, r.source_type, e.target.checked)}
                          />
                          <div style={{ flex: 1 }}>
                            <div className="scc-inbox__item-title">
                              {company} — {r.contact_email ?? "–"}
                            </div>
                            <div className="scc-inbox__item-meta">
                              <span className={`scc-status${srcTone ? ` scc-status--${srcTone}` : ""}`}>
                                {SOURCE_LABELS[r.source_type] ?? r.source_type}
                              </span>
                              <span className="scc-status">{r.original_status}</span>
                              <span className={`scc-status scc-status--${prioTone}`}>prio:{r.priority}</span>
                              {r.plan && <span className="scc-pill">Plan: {r.plan}</span>}
                              {r.proposed_price_cents != null && (
                                <span className="scc-pill">{fmtCents(r.proposed_price_cents)}</span>
                              )}
                              {r.monthly_estimate_cents != null && (
                                <span className="scc-pill">~{fmtCents(r.monthly_estimate_cents)}/Mo</span>
                              )}
                              <span>{fmtDate(r.updated_at ?? r.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
              }
            </>
          )}
        </div>

        {/* Detail pane: drilldown hint */}
        <div className="scc-inbox__detail">
          <div className="scc-muted">
            Wählen Sie ein Item links. Klick → Drilldown auf Detail-Seite.
          </div>
        </div>
      </div>
    </div>
  );
}
