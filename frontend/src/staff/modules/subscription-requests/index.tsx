import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useNav } from "@scc/state/NavContext";
import { fmtDate, fmtCents, fmtNum, subStatusTone } from "@scc/utils/format";

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

interface SubDetail extends SubItem {
  org_id: string | null;
  org_current_plan: string | null;
  org_pilot_status: string | null;
  org_current_individual_tier: string | null;
  current_subscription: { plan: string; status: string } | null;
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
}

interface SubDocument {
  id: string;
  document_number: string;
  document_type: string;
  status: string;
  created_at: string;
}

// ─── Quick Filters ──────────────────────────────────────

const QUICK_FILTERS = [
  { key: "open",         label: "Offen" },
  { key: "mine",         label: "Meine" },
  { key: "pilot",        label: "Pilot" },
  { key: "individuell",  label: "Individuell" },
  { key: "enterprise",   label: "Enterprise" },
  { key: "upgrade",      label: "Upgrade" },
  { key: "downgrade",    label: "Downgrade" },
  { key: "cancellation", label: "Kündigung" },
  { key: "all",          label: "Alle" },
];

const DOC_TYPES = [
  { value: "cost_preview",           label: "Kostenvorschau (KV)" },
  { value: "offer",                  label: "Angebot (ANG)" },
  { value: "order_confirmation",     label: "Auftragsbestätigung (AB)" },
  { value: "change_confirmation",    label: "Änderungsbestätigung (AE)" },
  { value: "cancellation_confirmation", label: "Kündigungsbestätigung (KB)" },
];

// ─── Documents Block ─────────────────────────────────────

function DocumentsBlock({ id }: { id: string }) {
  const confirm = useConfirm();
  const stepUp  = useStepUp();
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

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const createDoc = () => {
    confirm({
      title: `Dokument erzeugen: ${docType}`,
      hint:  "Generiert ein versioniertes Dokument am Request. Audit-Eintrag risk_level=medium.",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/documents`, {
          confirmed: true, reason, document_type: docType,
        });
        await loadDocs();
      },
    });
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div className="scc-muted" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Dokumente</div>

      {loading && <div className="scc-muted">Lade Dokumente…</div>}
      {err && <div className="scc-error-inline">{err}</div>}
      {!loading && !err && (
        docs.length === 0
          ? <div className="scc-muted" style={{ fontSize: 13 }}>Noch keine Dokumente.</div>
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

      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
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

  const [detail,  setDetail]  = useState<SubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  // Offer inputs
  const [staffNotes, setStaffNotes] = useState("");
  const [price,      setPrice]      = useState("");
  const [term,       setTerm]       = useState("");
  const [startDate,  setStartDate]  = useState("");
  const [nextStatus, setNextStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await sccApi.get(`/subscription-requests/${encodeURIComponent(id)}`) as SubDetail;
      setDetail(d);
      setStaffNotes(d.staff_notes ?? "");
      setPrice(d.proposed_price_cents != null ? String(Number(d.proposed_price_cents) / 100) : "");
      setTerm(d.proposed_term_months != null ? String(d.proposed_term_months) : "");
      setStartDate(d.expected_start_date ? String(d.expected_start_date).slice(0, 10) : "");
      setNextStatus(d.allowed_next?.[0] ?? "");
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
        await load(); onRefreshList();
      },
    });
  };

  const doApprove = () => confirm({
    title: "Anfrage annehmen",
    hint:  "Setzt approved_by + status=accepted.",
    onConfirm: async (reason) => {
      await stepUp();
      await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/approve`, { confirmed: true, reason });
      await load(); onRefreshList();
    },
  });

  const doReject = () => confirm({
    title: "Anfrage ablehnen",
    hint:  "Begründung wird gespeichert.",
    onConfirm: async (reason) => {
      await stepUp();
      await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/reject`, { confirmed: true, reason });
      await load(); onRefreshList();
    },
  });

  const doActivate = () => confirm({
    title: "Aktivieren",
    hint:  "Setzt status=active. Voraussetzung: subscriptions.plan wurde bereits umgestellt.",
    onConfirm: async (reason) => {
      await stepUp();
      await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/activate`, { confirmed: true, reason });
      await load(); onRefreshList();
    },
  });

  const doSaveOffer = () => confirm({
    title: "Angebots-Eckdaten speichern",
    hint:  "Schreibt staff_notes, Preis, Laufzeit und Start.",
    onConfirm: async (reason) => {
      await stepUp();
      const priceCents = price ? Math.round(parseFloat(price) * 100) : null;
      const termMonths = term  ? Math.round(parseInt(term, 10)) : null;
      await sccApi.post(`/subscription-requests/${encodeURIComponent(id)}/offer`, {
        confirmed: true, reason,
        staff_notes: staffNotes || null,
        proposed_price_cents: priceCents && isFinite(priceCents) && priceCents > 0 ? priceCents : null,
        proposed_term_months: termMonths && isFinite(termMonths) && termMonths > 0 ? termMonths : null,
        expected_start_date: startDate || null,
      });
      await load();
    },
  });

  const canBypass = detail.can_bypass_staff;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="scc-muted" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>
            Anfrage {detail.id}
          </div>
          <h2 style={{ margin: "4px 0" }}>
            {detail.requester_company_name ?? detail.contact_email ?? "Subscription-Anfrage"}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className={`scc-status scc-status--${subStatusTone(detail.status)}`}>{detail.status}</span>
          <span className="scc-status">{detail.request_type}</span>
          {canBypass
            ? <span className="scc-status scc-status--ok">Self-Service erlaubt</span>
            : <span className="scc-status scc-status--warn">Staff-Freigabe Pflicht</span>
          }
        </div>
      </div>

      <div className="scc-muted" style={{ marginTop: 6 }}>
        Org: {detail.org_name ?? detail.org_id ?? "(Public-Lead)"}
        {" · "}Aktueller Plan: {detail.org_current_plan ?? detail.current_plan ?? "–"}
        {" · "}Pilot: {detail.org_pilot_status ?? "–"}
      </div>
      {detail.current_subscription && (
        <div className="scc-muted">
          Live-Subscription: {detail.current_subscription.plan} ({detail.current_subscription.status})
        </div>
      )}

      <div className="scc-grid" style={{ marginTop: 12 }}>
        {[
          ["Aktueller Plan",  detail.current_plan ?? detail.org_current_plan ?? "–"],
          ["Wunsch-Plan",     detail.desired_plan ?? "–"],
          ["Tier",            detail.desired_individual_tier ?? detail.org_current_individual_tier ?? "–"],
          ["Mitarbeiter",     detail.employee_count != null ? fmtNum(detail.employee_count) : "–"],
          ["Nutzer",          detail.user_count != null ? fmtNum(detail.user_count) : "–"],
          ["Standorte",       detail.site_count != null ? fmtNum(detail.site_count) : "–"],
          ["Region",          detail.region_scope ?? "–"],
          ["Start",           detail.expected_start_date ?? "–"],
          ["Vorschlag",       fmtCents(detail.proposed_price_cents)],
          ["Laufzeit",        detail.proposed_term_months ? `${detail.proposed_term_months} Mo` : "–"],
        ].map(([label, value]) => (
          <div className="scc-card" key={label}>
            <div className="scc-card__eyebrow">{label}</div>
            <div className="scc-card__value" style={{ fontSize: 18 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Offer form */}
      <div style={{ marginTop: 12 }}>
        <label className="scc-muted" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Interne Notiz / Angebotsnotiz
        </label>
        <textarea
          rows={4}
          style={{ width: "100%" }}
          value={staffNotes}
          onChange={(e) => setStaffNotes(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <input
            type="number"
            min={0}
            placeholder="Preis (EUR)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <input
            type="number"
            min={1}
            placeholder="Laufzeit (Monate)"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <button className="scc-btn" onClick={doSaveOffer}>Angebot speichern</button>
        </div>
      </div>

      {/* History */}
      <div className="scc-thread" style={{ marginTop: 12 }}>
        {detail.history.length === 0
          ? <div className="scc-muted">Noch keine Historie.</div>
          : detail.history.map((h, i) => (
              <div key={i} className="scc-msg scc-msg--internal">
                <div className="scc-msg__head">
                  <span>{(h.from_status ?? "-")} → {h.to_status}</span>
                  <span>{fmtDate(h.created_at)}</span>
                </div>
                <div className="scc-msg__body">{h.reason ?? ""}</div>
              </div>
            ))
        }
      </div>

      {/* Actions */}
      <div className="scc-compose" style={{ marginTop: 6 }}>
        <div className="scc-compose__actions">
          {detail.allowed_next.length > 0 && (
            <>
              <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                {detail.allowed_next.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="scc-btn scc-btn--danger" onClick={doTransition}>Status setzen</button>
            </>
          )}
          <button className="scc-btn scc-btn--primary" onClick={doApprove}>Annehmen</button>
          <button className="scc-btn scc-btn--danger"  onClick={doReject}>Ablehnen</button>
          <button className="scc-btn"                   onClick={doActivate}>Aktivieren</button>
        </div>
      </div>

      <DocumentsBlock id={id} />
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

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>;
  if (err)     return <div className="scc-error-inline">{err}</div>;
  if (items.length === 0) return <div className="scc-muted" style={{ padding: 10 }}>Keine Anfragen im Filter.</div>;

  return (
    <>
      {items.map((r) => {
        const planBadge = r.desired_plan ?? r.current_plan ?? "–";
        const orgLabel  = r.org_name ?? r.requester_company_name ?? "(Public-Lead)";
        return (
          <div
            key={r.id}
            className={`scc-inbox__item${selectedId === r.id ? " is-active" : ""}`}
            onClick={() => onSelect(r.id)}
          >
            <div className="scc-inbox__item-title">{orgLabel} — {r.contact_email ?? "–"}</div>
            <div className="scc-inbox__item-meta">
              <span className={`scc-status scc-status--${subStatusTone(r.status)}`}>{r.status}</span>
              <span>{r.request_type}</span>
              <span>{planBadge}</span>
              <span>{fmtDate(r.status_updated_at ?? r.created_at)}</span>
              <span>{r.assigned_staff_id ? "zuges." : "offen"}</span>
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
        <h1 className="scc-section__title">Abo / Tarif-Anfragen</h1>
        <div className="scc-section__sub">
          Pilot, Individuell, Upgrade, Downgrade, Kündigung. Staff-Freigabepflicht je nach Plan.
        </div>
      </div>

      <div className="scc-inbox">
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

        <div className="scc-inbox__detail">
          {selectedId
            ? <SubDetailPane key={selectedId} id={selectedId} onRefreshList={refreshList} />
            : <div className="scc-muted">Anfrage links wählen.</div>
          }
        </div>
      </div>
    </div>
  );
}
