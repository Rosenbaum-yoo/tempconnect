/**
 * CustomerOperations — SCC Phase B / Slice 2 + Betreiber-Kill-Switch (Mig 127)
 * Konsolidierter Kundenroster über bestehende Wahrheiten
 * (organizations.customer_stage/plan + subscription_requests + org_memberships).
 *
 * Aggregations-/Ansichtsschicht. Tarif-Statuswechsel laufen weiterhin über das
 * Modul "Abo / Tarif-Anfragen" (Drilldown). AUSNAHME (owner-approved): der
 * Betreiber-Kill-Switch — Sperren/Freigeben des Org-Zugangs bei Nicht-Zahlung
 * o.ä. Das ist die EINZIGE Mutation hier und der bewusste Zweck dieses Moduls als
 * Operator-Steuerstelle. Sperre = Soft-Lock (Enforcement in entitlementService),
 * Login bleibt; Tarif-AKTIVIERUNG bleibt zahlungsgetrieben (Stripe), NICHT hier.
 * Jede Aktion: Step-up + Confirm + Reason (>=10) + serverseitiges Audit.
 *
 * Endpunkte: GET /customers · /customers-meta · /customers/:orgId ·
 *   POST /customers/:orgId/suspend · POST /customers/:orgId/reactivate (alle requireStaff).
 */

import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useNav } from "@scc/state/NavContext";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { fmtDate, fmtDateShort, fmtNum, subStatusTone } from "@scc/utils/format";

// ─── Types (Shapes = Backend staffCustomerOperationsService.js) ──

interface LastRequest {
  status: string;
  request_type: string | null;
  at: string | null;
}

interface CustomerRow {
  org_id: string;
  name: string;
  legal_name: string | null;
  plan: string | null;
  customer_stage: string | null;
  pilot_status: string | null;
  onboarded: boolean;
  onboarding_completed_at: string | null;
  created_at: string | null;
  members_active: number;
  open_requests: number;
  last_request: LastRequest | null;
  risk_level: string;
  suspended: boolean;
  suspended_at: string | null;
  suspended_kind: string | null;
}

interface ListScope {
  stage: string | null;
  plan: string | null;
  risk: string | null;
  search: string | null;
  suspended: boolean | null;
  limit: number;
  offset: number;
}

interface CustomerListResp {
  available: boolean;
  customers: CustomerRow[];
  total: number;
  scope: ListScope;
  generated_at: string;
}

interface CustomerDetailData {
  org_id: string;
  name: string;
  legal_name: string | null;
  plan: string | null;
  customer_stage: string | null;
  pilot_status: string | null;
  billing_contact: string | null;
  onboarded: boolean;
  onboarding_completed_at: string | null;
  created_at: string | null;
  members_active: number;
  risk_level: string;
  suspension: {
    suspended: boolean;
    suspended_at: string | null;
    reason: string | null;
    kind: string | null;
    suspended_by: string | null;
  };
}

interface DetailRequest {
  id: string;
  request_type: string;
  status: string;
  at: string | null;
}

interface CustomerDetailResp {
  available: boolean;
  customer: CustomerDetailData;
  subscription_requests: DetailRequest[];
  generated_at: string;
}

interface MetaResp {
  stages: string[];
  plans: string[];
  risk_levels: string[];
  open_request_statuses: string[];
  suspension_kinds: string[];
  min_reason_len: number;
}

// ─── Labels & Tones ──────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  demo:               "Demo",
  contract_requested: "Vertrag angefragt",
  pilot:              "Pilot",
  live:               "Live",
};

const RISK_LABELS: Record<string, string> = {
  none:     "OK",
  watch:    "Beobachten",
  elevated: "Erhöht",
};

const TYPE_LABELS: Record<string, string> = {
  new_individual: "Neu (Individuell)",
  pilot:          "Pilot",
  upgrade:        "Upgrade",
  downgrade:      "Downgrade",
  cancellation:   "Kündigung",
};

// Sperr-Kategorien — Reihenfolge/Schlüssel = Backend-Whitelist (SUSPENSION_KINDS,
// Mig 127). non_payment ist der Default-Anwendungsfall (Nicht-Zahlung).
const KIND_LABELS: Record<string, string> = {
  non_payment: "Nicht-Zahlung",
  manual:      "Manuell",
  compliance:  "Compliance",
  security:    "Sicherheit",
  other:       "Sonstiges",
};
const KIND_FALLBACK = ["non_payment", "manual", "compliance", "security", "other"];

function kindLabel(kind: string | null): string {
  if (!kind) return "–";
  return KIND_LABELS[kind] ?? kind;
}

// Plan-Tonalität konsistent zu Abo/Tarif-Modul: BASIS/PLUS grün, PRO gelb, INDIVIDUELL rot, DEMO neutral.
const PLAN_PILL: Record<string, string> = {
  DEMO:        "",
  BASIS:       "live",
  PLUS:        "live",
  PRO:         "warn",
  INDIVIDUELL: "danger",
};

function planPill(plan: string | null): string {
  if (!plan) return "";
  return PLAN_PILL[plan.toUpperCase()] ?? "";
}

function planLabel(plan: string | null): string {
  if (!plan) return "–";
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

function stageLabel(stage: string | null): string {
  if (!stage) return "–";
  return STAGE_LABELS[stage] ?? stage;
}

/** Risiko → scc-status-Tonalität (elevated=danger, watch=warn, none=ok). */
function riskTone(level: string): string {
  if (level === "elevated") return "danger";
  if (level === "watch")    return "warn";
  return "ok";
}

const PAGE_SIZE = 50;

// ─── Detail Pane ─────────────────────────────────────────

function CustomerDetailPane({ orgId, meta, onMutated }: {
  orgId: string;
  meta: MetaResp | null;
  onMutated: () => void;
}) {
  const nav = useNav();
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();
  const [kind, setKind] = useState("non_payment");
  const [detail,  setDetail]  = useState<CustomerDetailResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await sccApi.get<CustomerDetailResp>(`/customers/${encodeURIComponent(orgId)}`);
      setDetail(d);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="scc-muted">Lade Kunde…</div>;
  if (err)     return <div className="scc-error-inline">{err}</div>;
  if (!detail) return null;

  const c = detail.customer;
  const reqs = detail.subscription_requests;
  const sus = c.suspension;

  // ── Betreiber-Kill-Switch — die einzige Mutation hier (Step-up + Confirm + Reason + Audit) ──
  const doSuspend = () => {
    confirm({
      title: `Zugang sperren: ${c.name}`,
      hint: "Soft-Lock: Tarif/Features werden serverseitig deaktiviert. Login & Daten bleiben; "
          + "der Kunde sieht die Sperre + Grund. Aktivierung bleibt zahlungsgetrieben (Stripe). "
          + "Audit risk_level=high.",
      dangerLabel: "Zugang sperren",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/customers/${encodeURIComponent(orgId)}/suspend`, { confirmed: true, reason, kind });
        toast.success("Zugang gesperrt.");
        await load();
        onMutated();
      },
    });
  };

  const doReactivate = () => {
    confirm({
      title: `Zugang freigeben: ${c.name}`,
      hint: "Hebt die Betreiber-Sperre auf. Die Tarif-Aktivierung selbst bleibt zahlungsgetrieben. "
          + "Audit risk_level=medium.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/customers/${encodeURIComponent(orgId)}/reactivate`, { confirmed: true, reason });
        toast.success("Zugang freigegeben.");
        await load();
        onMutated();
      },
    });
  };

  const kpis: Array<[string, string]> = [
    ["Aktive Nutzer",   fmtNum(c.members_active)],
    ["Offene Anfragen", fmtNum(reqs.filter((r) => !["active", "rejected", "cancelled", "expired"].includes(r.status)).length)],
    ["Plan",            planLabel(c.plan)],
    ["Stage",           stageLabel(c.customer_stage)],
    ["Onboarding",      c.onboarded ? fmtDateShort(c.onboarding_completed_at) : "Offen"],
    ["Billing-Kontakt", c.billing_contact ?? "–"],
    ["Angelegt",        fmtDateShort(c.created_at)],
  ];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
            Kunde · {c.org_id.slice(0, 8)}…
          </div>
          <h2 style={{ margin: "4px 0", fontSize: 17 }}>{c.name}</h2>
          {c.legal_name && c.legal_name !== c.name && (
            <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>{c.legal_name}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {sus.suspended && (
            <span className="scc-pill scc-pill--danger" title={sus.reason ?? undefined}>Gesperrt</span>
          )}
          <span className={`scc-status scc-status--${riskTone(c.risk_level)}`}>
            {RISK_LABELS[c.risk_level] ?? c.risk_level}
          </span>
          {c.customer_stage && <span className="scc-pill">{stageLabel(c.customer_stage)}</span>}
          {c.plan && (() => {
            const suffix = planPill(c.plan);
            return <span className={`scc-pill${suffix ? ` scc-pill--${suffix}` : ""}`}>{planLabel(c.plan)}</span>;
          })()}
          {c.pilot_status && c.pilot_status !== "none" && (
            <span className="scc-pill scc-pill--stub" style={{ fontSize: 10 }}>Pilot: {c.pilot_status}</span>
          )}
          {!c.onboarded && (
            <span className="scc-pill scc-pill--warn" style={{ fontSize: 10 }}>Onboarding offen</span>
          )}
        </div>
      </div>

      {/* ── Betreiber-Kill-Switch (Mig 127) ────────────── */}
      {sus.suspended ? (
        <div className="scc-card" style={{ borderColor: "var(--scc-danger)", marginBottom: 14 }}>
          <div className="scc-card__eyebrow" style={{ color: "var(--scc-danger)" }}>● Zugang gesperrt</div>
          <div style={{ fontSize: 13, margin: "4px 0" }}>
            Seit {fmtDate(sus.suspended_at)} · Kategorie: {kindLabel(sus.kind)}
          </div>
          {sus.reason && (
            <div style={{ fontSize: 12, color: "var(--scc-muted)" }}>Grund: {sus.reason}</div>
          )}
          <div style={{ marginTop: 10 }}>
            <button className="scc-btn scc-btn--primary" onClick={doReactivate}>Zugang freigeben</button>
          </div>
        </div>
      ) : (
        <div className="scc-card" style={{ marginBottom: 14 }}>
          <div className="scc-card__eyebrow">Betreiber-Kill-Switch</div>
          <div style={{ fontSize: 12, color: "var(--scc-muted)", margin: "4px 0 8px" }}>
            Soft-Lock bei Nicht-Zahlung o.ä. — Login &amp; Daten bleiben, Tarif/Features werden serverseitig deaktiviert.
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Sperr-Kategorie">
              {(meta?.suspension_kinds ?? KIND_FALLBACK).map((k) => (
                <option key={k} value={k}>{kindLabel(k)}</option>
              ))}
            </select>
            <button className="scc-btn scc-btn--danger" onClick={doSuspend}>Zugang sperren</button>
          </div>
        </div>
      )}

      {/* ── KPI grid ───────────────────────────────────── */}
      <div className="scc-grid" style={{ marginBottom: 14 }}>
        {kpis.map(([label, value]) => (
          <div className="scc-card" key={label}>
            <div className="scc-card__eyebrow">{label}</div>
            <div className="scc-card__value" style={{ fontSize: 15 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Subscription requests (Drilldown ins Abo-Modul) ── */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
          Abo / Tarif-Anfragen ({reqs.length})
        </div>
        {reqs.length === 0 ? (
          <div className="scc-muted" style={{ fontSize: 12 }}>Keine Anfragen erfasst.</div>
        ) : (
          <table className="scc-table">
            <thead>
              <tr><th>Typ</th><th>Status</th><th>Datum</th><th /></tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <td>{TYPE_LABELS[r.request_type] ?? r.request_type}</td>
                  <td><span className={`scc-status scc-status--${subStatusTone(r.status)}`}>{r.status}</span></td>
                  <td>{fmtDateShort(r.at)}</td>
                  <td>
                    <button
                      className="scc-btn"
                      onClick={() => nav.navigate("subscription-requests", r.id)}
                      title="Im Abo/Tarif-Modul öffnen (dort sind Aktionen mit Audit verfügbar)"
                    >
                      Öffnen →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ fontSize: 10, color: "var(--scc-muted)", marginTop: 14, borderTop: "1px solid var(--scc-line)", paddingTop: 8 }}>
        Tarif-Statuswechsel laufen über „Abo / Tarif-Anfragen" (mit Audit). Hier mutiert nur der Betreiber-Kill-Switch.
        {" · "}Datenstand: {fmtDate(detail.generated_at)}
      </div>
    </div>
  );
}

// ─── Module Root ─────────────────────────────────────────

export default function CustomerOperations() {
  const [meta, setMeta] = useState<MetaResp | null>(null);

  // Filter-Zustand (angewandt)
  const [stage,  setStage]  = useState("");
  const [plan,   setPlan]   = useState("");
  const [risk,   setRisk]   = useState("");
  const [suspended, setSuspended] = useState(""); // "" | "true" | "false" (tri-state)
  const [search, setSearch] = useState("");     // angewandt
  const [searchInput, setSearchInput] = useState(""); // getippt
  const [offset, setOffset] = useState(0);

  const [resp,    setResp]    = useState<CustomerListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Meta einmalig laden (Dropdown-Optionen = kanonische Backend-Listen)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await sccApi.get<MetaResp>("/customers-meta");
        if (alive) setMeta(m);
      } catch { /* Dropdowns bleiben leer — Liste funktioniert trotzdem */ }
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (stage)  qs.set("stage", stage);
      if (plan)   qs.set("plan", plan);
      if (risk)   qs.set("risk", risk);
      if (suspended) qs.set("suspended", suspended);
      if (search) qs.set("search", search);
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(offset));
      const d = await sccApi.get<CustomerListResp>(`/customers?${qs.toString()}`);
      setResp(d);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [stage, plan, risk, suspended, search, offset]);

  useEffect(() => { void load(); }, [load]);

  // Filterwechsel setzt Pagination zurück
  const onFilter = (setter: (v: string) => void) => (v: string) => { setter(v); setOffset(0); };
  const applySearch = () => { setSearch(searchInput.trim()); setOffset(0); };
  const resetFilters = () => {
    setStage(""); setPlan(""); setRisk(""); setSuspended(""); setSearch(""); setSearchInput(""); setOffset(0);
  };

  const total   = resp?.total ?? 0;
  const items   = resp?.customers ?? [];
  const from    = total === 0 ? 0 : offset + 1;
  const to      = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;
  const hasFilter = !!(stage || plan || risk || suspended || search);

  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Customer Operations</h1>
          <div className="scc-section__sub">
            Konsolidierter Kundenroster — Stage, Plan, Risiko, Onboarding. Read-only Aggregat über bestehende Wahrheiten.
          </div>
        </div>
        <button className="scc-btn" onClick={() => void load()} aria-label="Reload">↺ Reload</button>
      </div>

      <div className="scc-inbox">
        {/* ── List pane ─────────────────────────────────── */}
        <div className="scc-inbox__list">
          {/* Filterzeile */}
          <div className="scc-inbox__filters" style={{ flexWrap: "wrap", gap: 6 }}>
            <select value={stage} onChange={(e) => onFilter(setStage)(e.target.value)} aria-label="Stage filtern">
              <option value="">Stage: alle</option>
              {(meta?.stages ?? []).map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
            </select>
            <select value={plan} onChange={(e) => onFilter(setPlan)(e.target.value)} aria-label="Plan filtern">
              <option value="">Plan: alle</option>
              {(meta?.plans ?? []).map((p) => <option key={p} value={p}>{planLabel(p)}</option>)}
            </select>
            <select value={risk} onChange={(e) => onFilter(setRisk)(e.target.value)} aria-label="Risiko filtern">
              <option value="">Risiko: alle</option>
              {(meta?.risk_levels ?? []).map((r) => <option key={r} value={r}>{RISK_LABELS[r] ?? r}</option>)}
            </select>
            <select value={suspended} onChange={(e) => onFilter(setSuspended)(e.target.value)} aria-label="Sperrstatus filtern">
              <option value="">Zugang: alle</option>
              <option value="true">Nur gesperrte</option>
              <option value="false">Nur aktive</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 0 8px", flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="Name / Firmenname…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
              aria-label="Kunde suchen"
              style={{ flex: 1, minWidth: 120 }}
            />
            <button className="scc-btn" onClick={applySearch}>Suchen</button>
            {hasFilter && <button className="scc-btn" onClick={resetFilters} title="Filter zurücksetzen">×</button>}
          </div>

          {/* Datenstand / Count */}
          {!loading && !err && (
            <div style={{ fontSize: 10, color: "var(--scc-muted)", padding: "0 0 6px" }}>
              {total === 0 ? "Keine Kunden" : `${from}–${to} von ${fmtNum(total)} Kunden`}
              {resp?.generated_at && <> · Stand {fmtDate(resp.generated_at)}</>}
            </div>
          )}

          {/* Liste */}
          {loading && <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>}
          {err     && <div className="scc-error-inline">{err}</div>}
          {!loading && !err && items.length === 0 && (
            <div className="scc-muted" style={{ padding: 10 }}>
              {hasFilter ? "Kein Kunde im Filter." : "Noch keine Kunden."}
            </div>
          )}
          {!loading && !err && items.map((c) => (
            <div
              key={c.org_id}
              className={`scc-inbox__item${selectedId === c.org_id ? " is-selected" : ""}`}
              onClick={() => setSelectedId(c.org_id)}
              role="button"
              tabIndex={0}
              aria-selected={selectedId === c.org_id}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(c.org_id); }}
            >
              <div className="scc-inbox__item-title">
                {(c.suspended || c.risk_level === "elevated") && <span style={{ color: "var(--scc-danger)", marginRight: 4 }}>●</span>}
                {c.name}
              </div>
              <div className="scc-inbox__item-meta">
                {c.suspended && <span className="scc-pill scc-pill--danger" title="Zugang gesperrt">Gesperrt</span>}
                <span className={`scc-status scc-status--${riskTone(c.risk_level)}`}>{RISK_LABELS[c.risk_level] ?? c.risk_level}</span>
                {c.customer_stage && <span className="scc-pill">{stageLabel(c.customer_stage)}</span>}
                {c.plan && (() => {
                  const suffix = planPill(c.plan);
                  return <span className={`scc-pill${suffix ? ` scc-pill--${suffix}` : ""}`}>{planLabel(c.plan)}</span>;
                })()}
                <span className="scc-pill" title="Aktive Nutzer">{fmtNum(c.members_active)} N</span>
                {c.open_requests > 0 && (
                  <span className="scc-pill scc-pill--warn" title="Offene Abo/Tarif-Anfragen">{c.open_requests} offen</span>
                )}
                {!c.onboarded && c.customer_stage === "live" && (
                  <span className="scc-pill scc-pill--danger" style={{ fontSize: 10 }}>Onb. fehlt</span>
                )}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {!loading && !err && total > PAGE_SIZE && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <button className="scc-btn" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>← Zurück</button>
              <span style={{ fontSize: 11, color: "var(--scc-muted)" }}>{from}–{to} / {fmtNum(total)}</span>
              <button className="scc-btn" disabled={!canNext} onClick={() => setOffset(offset + PAGE_SIZE)}>Weiter →</button>
            </div>
          )}
        </div>

        {/* ── Detail pane ───────────────────────────────── */}
        <div className="scc-inbox__detail" aria-label="Kunden-Detailansicht">
          {selectedId
            ? <CustomerDetailPane key={selectedId} orgId={selectedId} meta={meta} onMutated={() => void load()} />
            : (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: "100%", minHeight: 200, color: "var(--scc-muted)", fontSize: 12
              }}>
                Kunde links wählen.
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}
