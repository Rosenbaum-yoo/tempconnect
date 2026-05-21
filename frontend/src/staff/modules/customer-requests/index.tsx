import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useNav } from "@scc/state/NavContext";
import { fmtDate, fmtCents, fmtNum, statusTone, priorityFromStatus } from "@scc/utils/format";

// ─── Types ──────────────────────────────────────────────

interface CRItem {
  id: string;
  requester_email: string | null;
  status: string;
  request_type: string;
  source_context: string | null;
  plan_requested: string | null;
  assignee_staff_id: string | null;
  updated_at: string | null;
  created_at: string;
}

interface CRMessage {
  is_internal: boolean;
  body: string;
  created_at: string;
}

interface CRAddon {
  name?: string;
  id?: string;
  type?: string;
  price?: number;
}

interface CRDetail extends CRItem {
  org_id: string | null;
  messages: CRMessage[];
  selected_addons: string | CRAddon[] | null;
  plan_requested: string | null;
  monthly_estimate_cents: number | null;
  onetime_estimate_cents: number | null;
  seats_requested: number | null;
  seats_included: number | null;
  expected_start_date: string | null;
  vat_id: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  strategic_collaboration_interest: boolean | null;
  interest_strategic_cooperation: boolean | null;
  strategic_collaboration_message: string | null;
  region_scope: string | null;
  site_count: number | null;
  message: string | null;
  notes: string | null;
  individual_contract_note: string | null;
}

interface CRMeta {
  allowed_transitions: Record<string, string[]>;
}

// ─── Constants ──────────────────────────────────────────

const TYPE_FILTERS = [
  { key: "enterprise_config",      label: "Konfigurator (Default)" },
  { key: "strategic_collaboration", label: "Strategic" },
  { key: "all",                    label: "Alle Typen" },
];

const STATUS_FILTERS = [
  { key: "open",              label: "Offen" },
  { key: "eingegangen",       label: "Eingegangen" },
  { key: "rueckfrage_offen",  label: "Rückfrage" },
  { key: "angebot_erstellt",  label: "Angebot" },
  { key: "bestaetigt",        label: "Bestätigt" },
  { key: "aktiviert",         label: "Aktiviert" },
  { key: "abgeschlossen",     label: "Abgeschlossen" },
  { key: "abgelehnt",         label: "Abgelehnt" },
  { key: "all",               label: "Alle" },
];

const LS_KEY = "scc.savedFilters.v1";

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") ?? {}; }
  catch { return {}; }
}
function saveSaved(data: Record<string, unknown>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

// ─── ConfigTab ─────────────────────────────────────────

function ConfigTab({ d }: { d: CRDetail }) {
  let addons: CRAddon[] = [];
  try {
    const raw = typeof d.selected_addons === "string"
      ? JSON.parse(d.selected_addons) : d.selected_addons;
    if (Array.isArray(raw)) addons = raw;
  } catch { addons = []; }

  const address = [d.street, [d.postal_code, d.city].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ") || "–";
  const strategic = d.strategic_collaboration_interest || d.interest_strategic_cooperation;

  return (
    <div>
      <div className="scc-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
        {[
          ["Plan (gewünscht)", d.plan_requested ?? "–"],
          ["Quelle", d.source_context === "enterprise_config" ? "Konfigurator" : (d.source_context ?? "–")],
          ["Monatliche Schätzung", fmtCents(d.monthly_estimate_cents)],
          ["Einmal-Schätzung", fmtCents(d.onetime_estimate_cents)],
          ["Sitze gewünscht", d.seats_requested != null ? fmtNum(d.seats_requested) : "–"],
          ["Sitze enthalten", d.seats_included != null ? fmtNum(d.seats_included) : "–"],
          ["Erwarteter Start", d.expected_start_date ? String(d.expected_start_date).slice(0, 10) : "–"],
          ["USt-IdNr.", d.vat_id ?? "–"],
        ].map(([label, value]) => (
          <div className="scc-card" key={label}>
            <div className="scc-card__eyebrow">{label}</div>
            <div className="scc-card__value" style={{ fontSize: 18 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="scc-muted" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Adresse</div>
        <div>{address}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="scc-muted" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Add-ons</div>
        <table className="scc-table">
          <thead><tr><th>Add-on</th><th>Typ</th><th style={{ textAlign: "right" }}>Preis</th></tr></thead>
          <tbody>
            {addons.length === 0
              ? <tr><td colSpan={3} className="scc-muted">Keine Add-ons gewählt.</td></tr>
              : addons.map((a, i) => (
                  <tr key={i}>
                    <td>{a.name ?? a.id ?? "–"}</td>
                    <td>{a.type ?? "–"}</td>
                    <td style={{ textAlign: "right" }}>
                      {a.price != null ? Number(a.price).toLocaleString("de-DE") + " EUR" : "–"}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="scc-muted" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Strategische Kooperation</div>
        {strategic
          ? <>
              <div><strong>Strategisches Interesse:</strong> Ja</div>
              {d.strategic_collaboration_message && <div className="scc-muted">Hinweis: {d.strategic_collaboration_message}</div>}
              {d.region_scope && <div className="scc-muted">Region/Scope: {d.region_scope}</div>}
              {d.site_count && <div className="scc-muted">Standorte: {fmtNum(d.site_count)}</div>}
            </>
          : <div className="scc-muted">Kein strategisches Kooperations-Interesse markiert.</div>
        }
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="scc-muted" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Hinweise / Anmerkungen</div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {d.message ?? d.notes ?? d.individual_contract_note ?? "–"}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Pane ─────────────────────────────────────────

function DetailPane({
  id,
  onRefreshList,
}: {
  id: string;
  onRefreshList: () => void;
}) {
  const confirm = useConfirm();
  const stepUp  = useStepUp();

  const [detail, setDetail] = useState<CRDetail | null>(null);
  const [meta,   setMeta]   = useState<CRMeta | null>(null);
  const [tab,    setTab]    = useState<"thread" | "config">("thread");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [composeBody, setComposeBody]       = useState("");
  const [composeInternal, setComposeInternal] = useState(true);
  const [sending, setSending] = useState(false);
  const [nextStatus, setNextStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [m, d] = await Promise.all([
        sccApi.get("/customer-requests-meta/statuses") as Promise<CRMeta>,
        sccApi.get(`/customer-requests/${encodeURIComponent(id)}`) as Promise<CRDetail>,
      ]);
      setMeta(m); setDetail(d);
      setNextStatus(m.allowed_transitions[d.status]?.[0] ?? "");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="scc-muted">Lade Anfrage…</div>;
  if (err)     return <div className="scc-error-inline">{err}</div>;
  if (!detail) return null;

  const nextStatuses = meta?.allowed_transitions[detail.status] ?? [];

  const sendMessage = async () => {
    if (!composeBody.trim()) return;
    setSending(true);
    try {
      await stepUp();
      await sccApi.post(`/customer-requests/${encodeURIComponent(id)}/messages`, {
        body: composeBody,
        is_internal: composeInternal,
      });
      setComposeBody("");
      await load();
    } finally {
      setSending(false);
    }
  };

  const transition = () => {
    if (!nextStatus) return;
    confirm({
      title: `Status setzen: ${nextStatus}`,
      hint:  "Der Wechsel wird im Audit und im Thread protokolliert.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/customer-requests/${encodeURIComponent(id)}/transition`, {
          next_status: nextStatus, confirmed: true, reason,
        });
        await load();
        onRefreshList();
      },
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="scc-muted" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>
            Request {detail.id}
          </div>
          <h2 style={{ margin: "4px 0" }}>{detail.requester_email ?? "Kundenanfrage"}</h2>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className={`scc-status scc-status--${statusTone(detail.status)}`}>{detail.status}</span>
          {detail.assignee_staff_id && <span className="scc-muted">zugewiesen</span>}
        </div>
      </div>

      <div className="scc-muted" style={{ marginTop: 6 }}>
        Typ: {detail.request_type} · Org: {detail.org_id ?? "–"} · erstellt {fmtDate(detail.created_at)}
      </div>

      <div style={{ display: "flex", gap: 6, margin: "10px 0", borderBottom: "1px solid var(--scc-line)", paddingBottom: 4 }}>
        {(["thread", "config"] as const).map((t) => (
          <button
            key={t}
            className={`scc-inbox__filter${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "thread" ? "Nachrichten" : "Konfiguration"}
          </button>
        ))}
      </div>

      {tab === "thread" && (
        <>
          <div className="scc-thread">
            {detail.messages.length === 0
              ? <div className="scc-muted">Noch keine Nachrichten.</div>
              : detail.messages.map((m, i) => (
                  <div key={i} className={`scc-msg ${m.is_internal ? "scc-msg--internal" : "scc-msg--customer"}`}>
                    <div className="scc-msg__head">
                      <span>{m.is_internal ? "Intern" : "An Kunde"}</span>
                      <span>{fmtDate(m.created_at)}</span>
                    </div>
                    <div className="scc-msg__body">{m.body}</div>
                  </div>
                ))
            }
          </div>

          <div className="scc-compose">
            <textarea
              placeholder="Antwort oder interne Notiz…"
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
            />
            <div className="scc-compose__actions">
              <label className="scc-muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={composeInternal}
                  onChange={(e) => setComposeInternal(e.target.checked)}
                />
                Interne Notiz
              </label>
              <button className="scc-btn scc-btn--primary" onClick={sendMessage} disabled={sending}>
                {sending ? "Sende…" : "Senden"}
              </button>
              <span style={{ flex: 1 }} />
              {nextStatuses.length > 0 && (
                <>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                  >
                    {nextStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="scc-btn scc-btn--danger" onClick={transition}>
                    Status setzen
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "config" && <ConfigTab d={detail} />}
    </div>
  );
}

// ─── List ────────────────────────────────────────────────

interface ListProps {
  typeFilter: string;
  statusFilter: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function InboxList({ typeFilter, statusFilter, selectedId, onSelect }: ListProps) {
  const [items, setItems]     = useState<CRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs: string[] = [];
      if (statusFilter && statusFilter !== "all" && statusFilter !== "open") {
        qs.push("status=" + encodeURIComponent(statusFilter));
      }
      const resp = await sccApi.get(`/customer-requests${qs.length ? "?" + qs.join("&") : ""}`) as { items: CRItem[] };
      let data = resp.items ?? [];
      if (typeFilter === "enterprise_config") {
        data = data.filter((r) => r.request_type === "enterprise_config");
      } else if (typeFilter === "strategic_collaboration") {
        data = data.filter((r) => r.request_type !== "enterprise_config");
      }
      if (statusFilter === "open") {
        data = data.filter((r) => r.status !== "abgeschlossen" && r.status !== "abgelehnt");
      }
      setItems(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>;
  if (err)     return <div className="scc-error-inline">{err} <button className="scc-btn" onClick={load} style={{ marginLeft: 8 }}>Retry</button></div>;
  if (items.length === 0) return <div className="scc-muted" style={{ padding: 10 }}>Keine Anfragen im Filter.</div>;

  return (
    <>
      {items.map((r) => {
        const prio = priorityFromStatus(r.status);
        const sourceLabel = r.request_type === "enterprise_config"
          ? "Konfigurator"
          : r.source_context === "public_profile" ? "Profil"
          : (r.request_type ?? "strategic");
        return (
          <div
            key={r.id}
            className={`scc-inbox__item${selectedId === r.id ? " is-active" : ""}`}
            onClick={() => onSelect(r.id)}
          >
            <div className="scc-inbox__item-title">
              {r.requester_email ?? "(keine E-Mail)"}
            </div>
            <div className="scc-inbox__item-meta">
              <span className={`scc-status scc-status--${statusTone(r.status)}`}>{r.status}</span>
              <span className="scc-pill">Plan: {r.plan_requested ?? "–"}</span>
              <span className="scc-pill">{sourceLabel}</span>
              <span className={`scc-status scc-status--${prio === "high" ? "warn" : prio === "low" ? "ok" : ""}`}>
                prio:{prio}
              </span>
              <span>{fmtDate(r.updated_at ?? r.created_at)}</span>
              <span>{r.assignee_staff_id ? "zuges." : "offen"}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Module Root ─────────────────────────────────────────

export default function CustomerRequests() {
  const nav = useNav();
  const [typeFilter,   setTypeFilter]   = useState("enterprise_config");
  const [statusFilter, setStatusFilter] = useState("open");
  const [selectedId,   setSelectedId]   = useState<string | null>(() => nav.consumeInitialId("customer-requests"));
  const [listKey,      setListKey]      = useState(0); // bump to force list re-fetch

  const refreshList = () => setListKey((k) => k + 1);

  const saved = loadSaved();
  const hasSaved = !!saved["customer-requests"];

  const saveFilter = () => {
    const all = loadSaved();
    all["customer-requests"] = { typeFilter, statusFilter };
    saveSaved(all);
  };
  const loadFilter = () => {
    const s = loadSaved()["customer-requests"] as { typeFilter: string; statusFilter: string } | undefined;
    if (!s) return;
    setTypeFilter(s.typeFilter ?? "enterprise_config");
    setStatusFilter(s.statusFilter ?? "open");
  };
  const resetFilter = () => { setTypeFilter("enterprise_config"); setStatusFilter("open"); };

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Kundenanfragen</h1>
        <div className="scc-section__sub">Konfigurator-Anfragen + strategische Anfragen. Default-Filter: Konfigurator.</div>
      </div>

      <div className="scc-inbox">
        {/* List pane */}
        <div className="scc-inbox__list">
          <div className="scc-inbox__filters">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`scc-inbox__filter${typeFilter === f.key ? " is-active" : ""}`}
                onClick={() => setTypeFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="scc-inbox__filters" style={{ marginTop: 6 }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`scc-inbox__filter${statusFilter === f.key ? " is-active" : ""}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="scc-inbox__filters" style={{ marginTop: 6 }}>
            <button className="scc-inbox__filter" onClick={saveFilter}>Filter speichern</button>
            <button className="scc-inbox__filter" onClick={loadFilter}>
              Saved laden {hasSaved && <span className="scc-pill" style={{ marginLeft: 4 }}>✓</span>}
            </button>
            <button className="scc-inbox__filter" onClick={resetFilter}>Reset</button>
          </div>

          <InboxList
            key={`${typeFilter}-${statusFilter}-${listKey}`}
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Detail pane */}
        <div className="scc-inbox__detail">
          {selectedId
            ? <DetailPane key={selectedId} id={selectedId} onRefreshList={refreshList} />
            : <div className="scc-muted">Wählen Sie eine Anfrage aus der Liste links.</div>
          }
        </div>
      </div>
    </div>
  );
}
