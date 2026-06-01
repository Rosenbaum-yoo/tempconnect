/**
 * SubscriptionRequests — SCC WAVE 06
 * Tarif-, Upgrade-, Kündigungs- und individuelle Angebotsprozesse.
 * Plan-Modell: DEMO → BASIS → PLUS → PRO → INDIVIDUELL.
 * Aktivierung nur nach status=accepted; Kündigungsdatum dokumentierbar.
 */

import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { useNav } from "@scc/state/NavContext";
import { fmtDate, fmtDateShort, fmtCents, fmtNum, subStatusTone } from "@scc/utils/format";

// ─── Types ──────────────────────────────────────────────

interface SubItem {
  id: string;
  contact_email: string | null;
  org_name: string | null;
  requester_company_name: string | null;
  status: string;
  request_type: string;
  desired_plan: string | null;
  current_plan: string | null;
  status_updated_at: string | null;
  created_at: string;
  assigned_staff_id: string | null;
}

interface SubHistoryEntry {
  from_status: string | null;
  to_status: string;
  created_at: string;
  reason: string | null;
}

interface SourceLead {
  id: string;
  status: string;
  request_type: string;
  contact_email: string | null;
  plan_requested: string | null;
}

interface SubDetail extends SubItem {
  org_id: string | null;
  org_current_plan: string | null;
  org_pilot_status: string | null;
  org_current_individual_tier: string | null;
  org_account_type: string | null;
  org_feature_bundle: string | null;
  org_employee_count: number | null;
  current_subscription: { plan: string; status: string; cancel_at?: string | null } | null;
  can_bypass_staff: boolean;
  allowed_next: string[];
  history: SubHistoryEntry[];
  staff_notes: string | null;
  proposed_price_cents: number | null;
  proposed_term_months: number | null;
  expected_start_date: string | null;
  employee_count: number | null;
  user_count: number | null;
  site_count: number | null;
  region_scope: string | null;
  desired_individual_tier: string | null;
  billing_mode: string | null;
  cancellation_effective_at: string | null;
  source_lead: SourceLead | null;
}

interface SubDocument {
  id: string;
  document_number: string;
  document_type: string;
  status: string;
  created_at: string;
}

// ─── Plan model ──────────────────────────────────────────

const PLAN_TONES: Record<string, string> = {
  DEMO:        "muted",     // grau
  BASIS:       "ok",        // grün
  PLUS:        "ok",        // grün
  PRO:         "warn",      // gelb
  INDIVIDUELL: "danger",    // orange-rot — höchste Prio für Staff
};

function planTone(plan: string | null): string {
  if (!plan) return "";
  return PLAN_TONES[plan.toUpperCase()] ?? "";
}

/** Maps a semantic color tone to the correct scc-pill modifier class suffix */
function pillSuffix(tone: string): string {
  if (tone === "ok")     return "live";
  if (tone === "warn")   return "warn";
  if (tone === "danger") return "danger";
  return "";
}

function planLabel(plan: string | null): string {
  if (!plan) return "–";
  return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
}

// ─── Billing mode ────────────────────────────────────────

const BILLING_MODE_LABELS: Record<string, string> = {
  standard_catalog:   "Standard-Katalog (Stripe)",
  individual_contract: "Individuell (Rechnung/Vertrag)",
};

// ─── Request type ────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  new_individual:  "Neu (Individuell)",
  pilot:           "Pilot",
  upgrade:         "Upgrade",
  downgrade:       "Downgrade",
  cancellation:    "Kündigung",
};

// ─── Document process pipeline ───────────────────────────
/**
 * Logische Reihenfolge der Dokumente je nach request_type.
 * KB und AE sind alternativer Abschluss (entweder Kündigung oder Änderung).
 */
const DOC_PIPELINE_MAP: Record<string, string[]> = {
  new_individual:  ["cost_preview", "offer", "order_confirmation"],
  pilot:           ["cost_preview", "offer", "order_confirmation"],
  upgrade:         ["cost_preview", "offer", "change_confirmation"],
  downgrade:       ["cost_preview", "offer", "change_confirmation"],
  cancellation:    ["cancellation_confirmation"],
};

const DOC_PIPELINE_LABELS: Record<string, string> = {
  cost_preview:              "KV",
  offer:                     "ANG",
  order_confirmation:        "AB",
  change_confirmation:       "AE",
  cancellation_confirmation: "KB",
};

const DOC_TYPES = [
  { value: "cost_preview",              label: "Kostenvorschau (KV)" },
  { value: "offer",                     label: "Angebot (ANG)" },
  { value: "order_confirmation",        label: "Auftragsbestätigung (AB)" },
  { value: "change_confirmation",       label: "Änderungsbestätigung (AE)" },
  { value: "cancellation_confirmation", label: "Kündigungsbestätigung (KB)" },
];

// ─── SLA helpers ─────────────────────────────────────────

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

// ─── Quick Filters ──────────────────────────────────────

const QUICK_FILTERS = [
  { key: "open",         label: "Offen" },
  { key: "mine",         label: "Meine" },
  { key: "pilot",        label: "Pilot" },
  { key: "individuell",  label: "Individuell ★" },
  { key: "enterprise",   label: "Enterprise" },
  { key: "upgrade",      label: "Upgrade" },
  { key: "downgrade",    label: "Downgrade" },
  { key: "cancellation", label: "Kündigung" },
  { key: "all",          label: "Alle" },
];

// ─── Documents Block (with pipeline visualization) ───────

function DocumentsBlock({ id, requestType }: { id: string; requestType: string }) {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();
  const [docs, setDocs]       = useState<SubDocument[]>([]);
  const [docType, setDocType] = useState("cost_preview");
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const resp = await sccApi.get(`/subscription-requests/${encodeURIComponent(id)}/documents`) as { items: SubDocument[] };
      setDocs(resp.items ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  const createDoc = () => {
    confirm({
      title: `Dokument erzeugen: ${docType}`,
      hint:  "Generiert ein versioniertes Dokument am Request. Audit-Eintrag risk_level=medium.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/documents`, {
          confirmed: true, reason, document_type: docType,
        });
        toast.success("Dokument erzeugt.");
        await loadDocs();
      },
    });
  };

  // Pipeline: which doc types are already created?
  const existingTypes = new Set(docs.map((d) => d.document_type));
  const pipeline = DOC_PIPELINE_MAP[requestType] ?? ["cost_preview", "offer", "order_confirmation"];

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
        Dokument-Pipeline
      </div>

      {/* Visual pipeline */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {pipeline.map((dtype, i) => {
          const done = existingTypes.has(dtype);
          return (
            <span key={dtype} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span style={{ color: "var(--scc-muted)" }}>→</span>}
              <span
                className={done ? "scc-pill scc-pill--live" : "scc-pill"}
                title={done ? "Erzeugt" : "Noch nicht erzeugt"}
              >
                {DOC_PIPELINE_LABELS[dtype] ?? dtype} {done ? "✓" : ""}
              </span>
            </span>
          );
        })}
      </div>

      {loading && <div className="scc-muted">Lade Dokumente…</div>}
      {err     && <div className="scc-error-inline">{err}</div>}
      {!loading && !err && (
        docs.length === 0
          ? <div className="scc-muted" style={{ fontSize: 12 }}>Noch keine Dokumente.</div>
          : (
            <table className="scc-table">
              <thead>
                <tr><th>Nummer</th><th>Typ</th><th>Status</th><th>Erstellt</th><th /></tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>{d.document_number}</td>
                    <td>{d.document_type}</td>
                    <td>{d.status}</td>
                    <td>{fmtDate(d.created_at)}</td>
                    <td>
                      <button
                        className="scc-btn"
                        onClick={() => window.open(
                          `/staff/api/subscription-documents/${encodeURIComponent(d.id)}/download`,
                          "_blank",
                          "noopener"
                        )}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>
          {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className="scc-btn" onClick={createDoc}>Dokument erzeugen</button>
      </div>
    </div>
  );
}

// ─── Detail Pane ─────────────────────────────────────────

function SubDetailPane({ id, onRefreshList }: { id: string; onRefreshList: () => void }) {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();

  const [detail,   setDetail]   = useState<SubDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);

  // Offer / plan fields
  const [staffNotes,     setStaffNotes]     = useState("");
  const [price,          setPrice]          = useState("");
  const [term,           setTerm]           = useState("");
  const [startDate,      setStartDate]      = useState("");
  const [nextStatus,     setNextStatus]     = useState("");
  // Cancellation-specific
  const [cancelDate,     setCancelDate]     = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await sccApi.get<SubDetail>(`/subscription-requests/${encodeURIComponent(id)}`);
      setDetail(d);
      setStaffNotes(d.staff_notes ?? "");
      setPrice(d.proposed_price_cents != null ? String(Number(d.proposed_price_cents) / 100) : "");
      setTerm(d.proposed_term_months != null ? String(d.proposed_term_months) : "");
      setStartDate(d.expected_start_date ? String(d.expected_start_date).slice(0, 10) : "");
      setCancelDate(d.cancellation_effective_at ? String(d.cancellation_effective_at).slice(0, 10) : "");
      setNextStatus(d.allowed_next?.[0] ?? "");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="scc-muted">Lade Anfrage…</div>;
  if (err)     return <div className="scc-error-inline">{err}</div>;
  if (!detail) return null;

  const isCancellation = detail.request_type === "cancellation";
  const canActivate    = detail.status === "accepted";
  const isTerminal     = ["active", "rejected", "cancelled", "expired"].includes(detail.status);
  const canBypass      = detail.can_bypass_staff;

  // Plan arrows (current → desired)
  const fromPlan = detail.current_plan ?? detail.org_current_plan ?? null;
  const toPlan   = detail.desired_plan ?? null;

  const doTransition = () => {
    if (!nextStatus) return;
    confirm({
      title: `Status setzen → ${nextStatus}`,
      hint:  "Statuswechsel mit Audit.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/transition`, {
          confirmed: true, reason, next_status: nextStatus,
        });
        toast.success(`Status → ${nextStatus}`);
        await load(); onRefreshList();
      },
    });
  };

  const doApprove = () => confirm({
    title: "Anfrage annehmen (→ accepted)",
    hint:  "Setzt approved_by + status=accepted. Voraussetzung für Aktivierung.",
    onConfirm: async (reason) => {
      await stepUp();
      await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/approve`, { confirmed: true, reason });
      toast.success("Angenommen. Status: accepted.");
      await load(); onRefreshList();
    },
  });

  const doReject = () => confirm({
    title: "Anfrage ablehnen",
    hint:  "Begründung wird gespeichert und auditiert.",
    onConfirm: async (reason) => {
      await stepUp();
      await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/reject`, { confirmed: true, reason });
      toast.warn("Anfrage abgelehnt.");
      await load(); onRefreshList();
    },
  });

  const doActivate = () => {
    if (!canActivate) return; // guard enforced in UI
    confirm({
      title: isCancellation ? "Kündigung aktivieren" : "Planwechsel aktivieren",
      hint:  isCancellation
        ? `Aktiviert die Kündigung${cancelDate ? ` zum ${cancelDate}` : ""}. KB-Dokument wird erzeugt. Nicht reversibel.`
        : "Setzt status=active. Schreibt org.plan + Subscription. Nicht reversibel.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/activate`, { confirmed: true, reason });
        toast.success("Aktiviert.");
        await load(); onRefreshList();
      },
    });
  };

  const doSaveOffer = () => confirm({
    title: "Angebots-Eckdaten speichern",
    hint:  "Schreibt staff_notes, Preis, Laufzeit und Start. Erzeugt Angebot-Snapshot.",
    onConfirm: async (reason) => {
      await stepUp();
      const priceCents = price  ? Math.round(parseFloat(price) * 100) : null;
      const termMonths = term   ? Math.round(parseInt(term, 10)) : null;
      await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/offer`, {
        confirmed: true, reason,
        staff_notes: staffNotes || null,
        proposed_price_cents: priceCents && isFinite(priceCents) && priceCents > 0 ? priceCents : null,
        proposed_term_months: termMonths && isFinite(termMonths) && termMonths > 0 ? termMonths : null,
        expected_start_date: startDate || null,
        cancellation_effective_at: isCancellation ? (cancelDate || null) : undefined,
      });
      toast.success("Angebot gespeichert.");
      await load();
    },
  });

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
            {TYPE_LABELS[detail.request_type] ?? detail.request_type} · {detail.id.slice(0, 8)}…
          </div>
          <h2 style={{ margin: "4px 0", fontSize: 17 }}>
            {detail.requester_company_name ?? detail.org_name ?? detail.contact_email ?? "Subscription-Anfrage"}
          </h2>
          {detail.contact_email && detail.requester_company_name && (
            <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>{detail.contact_email}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`scc-status scc-status--${subStatusTone(detail.status)}`}>{detail.status}</span>
          {canBypass
            ? <span className="scc-pill scc-pill--live" style={{ fontSize: 10 }}>Self-Service erlaubt</span>
            : <span className="scc-pill scc-pill--stub" style={{ fontSize: 10 }}>Staff-Freigabe Pflicht</span>
          }
          {isSlaWarning(detail.created_at) && (
            <span className="scc-pill scc-pill--warn" style={{ fontSize: 10 }}>
              ⚠ {fmtSlaAge(detail.created_at)} alt
            </span>
          )}
        </div>
      </div>

      {/* ── Plan change arrow ─────────────────────────────── */}
      {(fromPlan || toPlan) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: "var(--scc-muted)", textTransform: "uppercase", letterSpacing: ".1em" }}>Plan</span>
          {fromPlan && (
            <span className={`scc-status${planTone(fromPlan) ? ` scc-status--${planTone(fromPlan)}` : ""}`}>
              {planLabel(fromPlan)}
            </span>
          )}
          {fromPlan && toPlan && <span style={{ color: "var(--scc-muted)" }}>→</span>}
          {toPlan && (
            <span className={`scc-status${planTone(toPlan) ? ` scc-status--${planTone(toPlan)}` : ""}`}>
              {planLabel(toPlan)}
            </span>
          )}
          {detail.desired_individual_tier && (
            <span className="scc-pill">Tier: {detail.desired_individual_tier}</span>
          )}
        </div>
      )}

      {/* ── Org info ──────────────────────────────────────── */}
      <div style={{ marginBottom: 12, fontSize: 12, color: "var(--scc-muted)" }}>
        Org: <strong style={{ color: "var(--scc-text)" }}>{detail.org_name ?? detail.org_id ?? "(Public-Lead)"}</strong>
        {detail.org_account_type && <span> · {detail.org_account_type}</span>}
        {detail.org_feature_bundle && <span> · Bundle: {detail.org_feature_bundle}</span>}
        {detail.org_pilot_status && detail.org_pilot_status !== "none" && (
          <span className="scc-pill scc-pill--stub" style={{ marginLeft: 8, fontSize: 10 }}>
            Pilot: {detail.org_pilot_status}
          </span>
        )}
        {detail.current_subscription && (
          <span>
            {" · "}Live-Abo: {detail.current_subscription.plan} ({detail.current_subscription.status})
            {detail.current_subscription.cancel_at && (
              <span style={{ color: "var(--scc-warn)" }}> · Kündigung geplant: {fmtDateShort(detail.current_subscription.cancel_at)}</span>
            )}
          </span>
        )}
      </div>

      {/* ── Source lead context ───────────────────────────── */}
      {detail.source_lead && (
        <div style={{
          background: "var(--scc-panel-2)", border: "1px solid var(--scc-line)",
          padding: "8px 12px", borderRadius: 2, marginBottom: 12, fontSize: 12
        }}>
          <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
            Quelle: Enterprise-Anfrage
          </span>
          <div style={{ marginTop: 4 }}>
            ID: {detail.source_lead.id.slice(0, 8)}…
            {" · "}Status: <strong>{detail.source_lead.status}</strong>
            {detail.source_lead.plan_requested && <span> · Plan: {detail.source_lead.plan_requested}</span>}
          </div>
        </div>
      )}

      {/* ── KPI grid ──────────────────────────────────────── */}
      <div className="scc-grid" style={{ marginBottom: 12 }}>
        {[
          ["Mitarbeiter",  detail.employee_count != null ? fmtNum(detail.employee_count) : (detail.org_employee_count != null ? fmtNum(detail.org_employee_count) : "–")],
          ["Nutzer",       detail.user_count != null ? fmtNum(detail.user_count) : "–"],
          ["Standorte",    detail.site_count != null ? fmtNum(detail.site_count) : "–"],
          ["Region",       detail.region_scope ?? "–"],
          ["Start",        detail.expected_start_date ?? "–"],
          ["Angebotspreis", fmtCents(detail.proposed_price_cents)],
          ["Laufzeit",     detail.proposed_term_months ? `${detail.proposed_term_months} Mo` : "–"],
          ["Billing",      detail.billing_mode ? (BILLING_MODE_LABELS[detail.billing_mode] ?? detail.billing_mode) : "–"],
        ].filter(([,v]) => v !== "–").map(([label, value]) => (
          <div className="scc-card" key={label}>
            <div className="scc-card__eyebrow">{label}</div>
            <div className="scc-card__value" style={{ fontSize: 16 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Cancellation section ──────────────────────────── */}
      {isCancellation && (
        <div style={{
          border: "1px solid var(--scc-warn)", padding: "10px 12px",
          background: "rgba(245,180,62,0.04)", borderRadius: 2, marginBottom: 12
        }}>
          <div style={{ fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--scc-warn)", marginBottom: 6 }}>
            Kündigung
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "var(--scc-muted)" }}>
              Wirksamkeitsdatum:
            </label>
            <input
              type="date"
              value={cancelDate}
              onChange={(e) => setCancelDate(e.target.value)}
              style={{ maxWidth: 160 }}
              aria-label="Kündigungswirksamkeitsdatum"
            />
            {detail.cancellation_effective_at && !cancelDate && (
              <span style={{ fontSize: 11, color: "var(--scc-muted)" }}>
                Gespeichert: {fmtDateShort(detail.cancellation_effective_at)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--scc-muted)", marginTop: 4 }}>
            KB-Dokument wird bei Aktivierung automatisch erzeugt.
            {cancelDate && ` Datum: ${cancelDate}.`}
          </div>
        </div>
      )}

      {/* ── Offer form ────────────────────────────────────── */}
      {!isTerminal && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
            Interne Notiz / Angebotsnotiz
          </label>
          <textarea
            rows={3}
            style={{ width: "100%", marginTop: 4 }}
            value={staffNotes}
            onChange={(e) => setStaffNotes(e.target.value)}
            aria-label="Interne Notiz"
          />
          {!isCancellation && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input
                type="number" min={0} placeholder="Preis (EUR)"
                value={price} onChange={(e) => setPrice(e.target.value)}
                aria-label="Angebotspreis in EUR"
                style={{ maxWidth: 140 }}
              />
              <input
                type="number" min={1} placeholder="Laufzeit (Monate)"
                value={term} onChange={(e) => setTerm(e.target.value)}
                aria-label="Laufzeit in Monaten"
                style={{ maxWidth: 160 }}
              />
              <input
                type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                aria-label="Erwarteter Starttermin"
                style={{ maxWidth: 160 }}
              />
            </div>
          )}
          <button className="scc-btn" style={{ marginTop: 6 }} onClick={doSaveOffer}>
            Angebot speichern
          </button>
        </div>
      )}

      {/* ── Status history ────────────────────────────────── */}
      {detail.history.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
            Verlauf ({detail.history.length})
          </div>
          <div className="scc-thread">
            {detail.history.map((h, i) => (
              <div key={i} className="scc-thread__msg scc-thread__msg--internal">
                <div className="scc-thread__meta">
                  <span>{(h.from_status ?? "–")} → {h.to_status}</span>
                  <span className="scc-muted">{fmtDate(h.created_at)}</span>
                </div>
                <div className="scc-thread__body">{h.reason ?? ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
        padding: "10px 0", borderTop: "1px solid var(--scc-line)", marginTop: 4
      }}>
        {!isTerminal && detail.allowed_next.length > 0 && (
          <>
            <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
              {detail.allowed_next.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="scc-btn" onClick={doTransition}>Status setzen</button>
          </>
        )}
        {!isTerminal && (
          <>
            <button className="scc-btn scc-btn--primary" onClick={doApprove}
              title="Setzt status=accepted — Voraussetzung für Aktivierung">
              Annehmen →
            </button>
            <button className="scc-btn scc-btn--danger" onClick={doReject}>Ablehnen</button>
          </>
        )}

        {/* Pre-activation guard */}
        {!canActivate && !isTerminal && (
          <span style={{ fontSize: 11, color: "var(--scc-muted)" }}>
            ⚠ Aktivierung nur nach status=accepted möglich
          </span>
        )}
        {canActivate && (
          <button
            className="scc-btn scc-btn--danger"
            onClick={doActivate}
            title={isCancellation ? "Kündigung abschließen" : "Planwechsel live setzen"}
          >
            {isCancellation ? "Kündigung aktivieren" : "Aktivieren"}
          </button>
        )}
      </div>

      {/* ── Documents ─────────────────────────────────────── */}
      <DocumentsBlock id={id} requestType={detail.request_type} />
    </div>
  );
}

// ─── List ────────────────────────────────────────────────

function SubList({
  quickFilter,
  selectedId,
  onSelect,
}: {
  quickFilter: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [items,   setItems]   = useState<SubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const resp = await sccApi.get(
        `/subscription-requests?quick_filter=${encodeURIComponent(quickFilter)}`
      ) as { items: SubItem[] };
      setItems(resp.items ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [quickFilter]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>;
  if (err)     return <div className="scc-error-inline">{err}</div>;
  if (items.length === 0) return <div className="scc-muted" style={{ padding: 10 }}>Keine Anfragen im Filter.</div>;

  return (
    <>
      {items.map((r) => {
        const orgLabel  = r.org_name ?? r.requester_company_name ?? "(Public-Lead)";
        const toPlan    = r.desired_plan ?? r.current_plan ?? null;
        const slaWarn   = isSlaWarning(r.created_at);
        const isIndiv   = toPlan?.toUpperCase() === "INDIVIDUELL" || r.request_type === "new_individual";
        const isCancel  = r.request_type === "cancellation";

        return (
          <div
            key={r.id}
            className={`scc-inbox__item${selectedId === r.id ? " is-selected" : ""}`}
            onClick={() => onSelect(r.id)}
            role="button"
            tabIndex={0}
            aria-selected={selectedId === r.id}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(r.id); }}
          >
            <div className="scc-inbox__item-title">
              {isIndiv  && <span style={{ color: "var(--scc-danger)", marginRight: 4 }}>★</span>}
              {isCancel && <span style={{ color: "var(--scc-warn)",   marginRight: 4 }}>⊗</span>}
              {orgLabel}
            </div>
            <div className="scc-inbox__item-meta">
              <span className={`scc-status scc-status--${subStatusTone(r.status)}`}>{r.status}</span>
              <span className="scc-pill">{TYPE_LABELS[r.request_type] ?? r.request_type}</span>
              {toPlan && (() => {
                const suffix = pillSuffix(planTone(toPlan));
                return (
                  <span className={`scc-pill${suffix ? ` scc-pill--${suffix}` : ""}`}>
                    {planLabel(toPlan)}
                  </span>
                );
              })()}
              <span
                className={`scc-pill${slaWarn ? " scc-pill--warn" : ""}`}
                title={`Erstellt: ${fmtDate(r.created_at)}`}
              >
                {fmtSlaAge(r.created_at)}
              </span>
              <span>{r.assigned_staff_id ? "zuges." : <em className="scc-muted">offen</em>}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Module Root ─────────────────────────────────────────

export default function SubscriptionRequests() {
  const nav = useNav();
  const [quickFilter, setQuickFilter] = useState("open");
  const [selectedId,  setSelectedId]  = useState<string | null>(() => nav.consumeInitialId("subscription-requests"));
  const [listKey,     setListKey]     = useState(0);

  const refreshList = () => setListKey((k) => k + 1);

  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Abo / Tarif-Anfragen</h1>
          <div className="scc-section__sub">
            Plan-Modell: DEMO → BASIS → PLUS → PRO → INDIVIDUELL ★
            {" · "}Pilot, Upgrade, Downgrade, Kündigung, Neu (Individuell)
          </div>
        </div>
        <button className="scc-btn" onClick={refreshList} aria-label="Reload">
          ↺ Reload
        </button>
      </div>

      <div className="scc-inbox">
        {/* List pane */}
        <div className="scc-inbox__list">
          <div className="scc-inbox__filters">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`scc-inbox__filter${quickFilter === f.key ? " is-active" : ""}`}
                onClick={() => setQuickFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <SubList
            key={`${quickFilter}-${listKey}`}
            quickFilter={quickFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Detail pane */}
        <div className="scc-inbox__detail" aria-label="Anfrage-Detailansicht">
          {selectedId
            ? <SubDetailPane key={selectedId} id={selectedId} onRefreshList={refreshList} />
            : (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                height: "100%", minHeight: 200, color: "var(--scc-muted)", fontSize: 12
              }}>
                Anfrage links wählen.
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}
