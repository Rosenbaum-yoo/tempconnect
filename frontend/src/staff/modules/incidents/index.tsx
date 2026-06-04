/**
 * Incidents — SCC Operations (Phase 5)
 * Operativer Incident-Track: ein Operator eröffnet einen Betriebsvorfall, quittiert
 * ihn und schließt ihn mit Grund — und er überdauert (Datenquelle ops_incidents,
 * Mig 121). Schließt die bislang flüchtigen Signale (SLA, Staffing, Automation, Mail)
 * an einen handlungsführenden Ort an.
 *
 * Lesepfad read-only (Summen je Status/Schweregrad + Liste). Mutationen laufen über
 * den globalen Confirm+Reason-Modal und Step-Up (Re-Auth) wie alle SCC-Aktionen.
 * Statusmaschine: open → acknowledged → resolved (keine Rücksprünge).
 *
 * Endpunkte: GET /incidents · /incidents/meta · POST /incidents ·
 *            /incidents/:id/acknowledge · /incidents/:id/resolve (alle requireStaff).
 */

import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { fmtDate, fmtNum, riskTone } from "@scc/utils/format";

// ─── Types (Shapes = Backend staffIncidentService.js) ──

interface IncidentRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  signal_code: string | null;
  org_id: string | null;
  details: Record<string, unknown>;
  opened_by: string | null;
  opened_reason: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface IncidentTotals {
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  open: number;
  total: number;
}

interface IncidentScope {
  platform: boolean;
  status: string | null;
  severity: string | null;
  limit: number;
}

interface IncidentList {
  available: boolean;
  totals: IncidentTotals;
  incidents: IncidentRow[];
  scope: IncidentScope;
  generated_at: string;
}

interface IncidentMeta {
  severities: string[];
  statuses: string[];
  sources: string[];
}

// Offene Signale ohne Incident (read-only Feed, GET /incidents/signals)
interface SignalSuggested {
  title: string;
  severity: string;
  source: string;
  signal_code: string;
}

interface SignalItem {
  kind: string;
  ref_id: string;
  title: string;
  detail: string | null;
  occurred_at: string | null;
  count: number;
  suggested: SignalSuggested;
}

interface OpenSignals {
  available: boolean;
  signals: { warp_failed: SignalItem[]; mail_failed: SignalItem[] };
  totals: { warp_failed: number; mail_failed_events: number; mail_failed_total: number };
  scope: { platform: boolean; window_hours: number; limit: number };
  generated_at: string;
}

// Vorbefüllung der Eröffnung aus einem Signal (oder null = leeres Formular)
interface CreatePrefill {
  title: string;
  severity: string;
  source: string;
  signal_code?: string | null;
}

// ─── Labels & Tones ──────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open:         "Offen",
  acknowledged: "Quittiert",
  resolved:     "Gelöst",
};

const STATUS_TONE: Record<string, string> = {
  open:         "danger",
  acknowledged: "warn",
  resolved:     "ok",
};

const STATUS_ORDER = ["open", "acknowledged", "resolved"];

const SEVERITY_LABELS: Record<string, string> = {
  low:      "Niedrig",
  medium:   "Mittel",
  high:     "Hoch",
  critical: "Kritisch",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

const SOURCE_LABELS: Record<string, string> = {
  manual:     "Manuell",
  sla:        "SLA",
  staffing:   "Staffing",
  infra:      "Infrastruktur",
  automation: "Automation",
  email:      "E-Mail",
};

function statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }
function statusTone(s: string): string { return STATUS_TONE[s] ?? "warn"; }
function severityLabel(s: string): string { return SEVERITY_LABELS[s] ?? s; }
function sourceLabel(s: string): string { return SOURCE_LABELS[s] ?? s; }

// ─── Create-Modal (eigene Felder → nicht über den reason-only Confirm-Modal) ──

function CreateIncidentModal({
  meta, prefill, onClose, onCreated,
}: {
  meta: IncidentMeta | null;
  prefill: CreatePrefill | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const stepUp = useStepUp();
  const [title, setTitle]       = useState(prefill?.title ?? "");
  const [severity, setSeverity] = useState(prefill?.severity ?? "medium");
  const [source, setSource]     = useState(prefill?.source ?? "manual");
  const [reason, setReason]     = useState("");
  const [err, setErr]           = useState("");
  const [busy, setBusy]         = useState(false);

  const severities = meta?.severities ?? ["low", "medium", "high", "critical"];
  const sources    = meta?.sources ?? ["manual", "sla", "staffing", "infra", "automation", "email"];

  const submit = async () => {
    if (!title.trim()) { setErr("Titel ist erforderlich."); return; }
    if (reason.trim().length < 10) { setErr("Begründung mit min. 10 Zeichen erforderlich."); return; }
    setBusy(true);
    setErr("");
    try {
      await stepUp();
      await sccApi.post("/incidents", {
        title: title.trim(),
        severity,
        source,
        signal_code: prefill?.signal_code ?? null,
        confirmed: true,
        reason: reason.trim(),
      });
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="scc-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scc-incident-create-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="scc-modal__box">
        <div className="scc-modal__title" id="scc-incident-create-title">Neuen Incident eröffnen</div>
        <div className="scc-modal__hint">
          Der Vorfall wird mit Status „Offen" angelegt und auditiert. Anschließend kann er
          quittiert und mit Grund geschlossen werden.
        </div>
        {prefill?.signal_code && (
          <div className="scc-modal__hint" style={{ marginTop: -2 }}>
            Aus Signal <code>{prefill.signal_code}</code> vorbefüllt — Titel/Schweregrad
            anpassbar, Begründung bitte ergänzen.
          </div>
        )}

        <div className="scc-label" style={{ marginBottom: 8 }}>
          <span>Titel</span>
          <input
            className="scc-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kurzbeschreibung des Vorfalls"
            autoFocus
            aria-label="Incident-Titel"
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <div className="scc-label" style={{ flex: 1, minWidth: 140 }}>
            <span>Schweregrad</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Schweregrad">
              {severities.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
            </select>
          </div>
          <div className="scc-label" style={{ flex: 1, minWidth: 140 }}>
            <span>Quelle</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Quelle">
              {sources.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
            </select>
          </div>
        </div>

        <div className="scc-label" style={{ marginBottom: 8 }}>
          <span>Begründung (min. 10 Zeichen)</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Warum wird dieser Incident eröffnet?"
            aria-label="Begründung für die Eröffnung"
          />
        </div>

        {err && <div className="scc-error-inline" role="alert">{err}</div>}

        <div className="scc-modal__actions">
          <button className="scc-btn" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button
            className="scc-btn scc-btn--primary"
            onClick={() => void submit()}
            disabled={busy || !title.trim() || reason.trim().length < 10}
          >
            {busy ? "…" : "Eröffnen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Module Root ─────────────────────────────────────────

export default function Incidents() {
  const confirm = useConfirm();
  const stepUp  = useStepUp();

  const [meta,     setMeta]     = useState<IncidentMeta | null>(null);
  const [status,   setStatus]   = useState("");
  const [severity, setSeverity] = useState("");
  const [resp,     setResp]     = useState<IncidentList | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [signals,  setSignals]  = useState<OpenSignals | null>(null);
  const [createPrefill, setCreatePrefill] = useState<CreatePrefill | null>(null);

  // Meta einmalig (Filter-/Formular-Optionen)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await sccApi.get<IncidentMeta>("/incidents/meta");
        if (alive) setMeta(m);
      } catch { /* Dropdowns bleiben auf Defaults — Übersicht funktioniert trotzdem */ }
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (status)   qs.set("status", status);
      if (severity) qs.set("severity", severity);
      const path = qs.toString() ? `/incidents?${qs.toString()}` : "/incidents";
      // Liste + Signal-Feed parallel; ein Signal-Fehler darf die Liste nicht kippen.
      const [listRes, sigRes] = await Promise.allSettled([
        sccApi.get<IncidentList>(path),
        sccApi.get<OpenSignals>("/incidents/signals"),
      ]);
      if (listRes.status === "fulfilled") setResp(listRes.value);
      else throw listRes.reason;
      setSignals(sigRes.status === "fulfilled" ? sigRes.value : null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status, severity]);

  useEffect(() => { void load(); }, [load]);

  const handleAcknowledge = (inc: IncidentRow) => {
    confirm({
      title: `Incident quittieren: ${inc.title}`,
      hint: "Quittieren bestätigt, dass der Vorfall in Bearbeitung ist (Offen → Quittiert).",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/incidents/${inc.id}/acknowledge`, { confirmed: true, reason });
        await load();
      },
    });
  };

  const handleResolve = (inc: IncidentRow) => {
    confirm({
      title: `Incident schließen: ${inc.title}`,
      hint: "Schließen beendet den Vorfall (Quittiert → Gelöst). Die Begründung wird als Lösungsvermerk gespeichert.",
      dangerLabel: "Schließen",
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post(`/incidents/${inc.id}/resolve`, {
          confirmed: true,
          reason,
          resolution_note: reason,
        });
        await load();
      },
    });
  };

  const openCreate = (prefill: CreatePrefill | null) => {
    setCreatePrefill(prefill);
    setShowCreate(true);
  };

  const openFromSignal = (sig: SignalItem) => openCreate({
    title: sig.suggested.title,
    severity: sig.suggested.severity,
    source: sig.suggested.source,
    signal_code: sig.suggested.signal_code,
  });

  const totals    = resp?.totals;
  const incidents = resp?.incidents ?? [];
  const signalRows = signals
    ? [...signals.signals.warp_failed, ...signals.signals.mail_failed]
    : [];

  const kpis: Array<[string, string, string]> = totals
    ? [
        ["Offen",    fmtNum(totals.by_status.open ?? 0),         "danger"],
        ["Quittiert", fmtNum(totals.by_status.acknowledged ?? 0), "warn"],
        ["Gelöst",   fmtNum(totals.by_status.resolved ?? 0),     "ok"],
        ["Gesamt",   fmtNum(totals.total ?? 0),                  "neutral"],
      ]
    : [];

  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Incidents</h1>
          <div className="scc-section__sub">
            Operativer Incident-Track: Vorfälle eröffnen, quittieren und mit Grund schließen.
            Jede Aktion ist auditiert (Step-Up + Begründungspflicht).
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="scc-btn scc-btn--primary" onClick={() => openCreate(null)}>+ Neuer Incident</button>
          <button className="scc-btn" onClick={() => void load()} aria-label="Reload">↺ Reload</button>
        </div>
      </div>

      {loading && <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>}
      {err     && <div className="scc-error-inline">{err}</div>}

      {!loading && !err && resp && (
        <>
          {/* ── Totals KPI-Grid ──────────────────────────── */}
          <div className="scc-grid" style={{ marginBottom: 16 }}>
            {kpis.map(([label, value, tone]) => (
              <div className="scc-card" key={label}>
                <div className="scc-card__eyebrow">{label}</div>
                <div
                  className="scc-card__value"
                  style={{ fontSize: 18, color: tone === "neutral" ? undefined : `var(--scc-${tone}, inherit)` }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Schweregrad-Verteilung ───────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--scc-muted)", marginBottom: 6 }}>
              Nach Schweregrad
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SEVERITY_ORDER.map((s) => (
                <span key={s} className={`scc-status scc-status--${riskTone(s)}`}>
                  {severityLabel(s)}: {fmtNum(totals?.by_severity?.[s] ?? 0)}
                </span>
              ))}
            </div>
          </div>

          {/* ── Offene Signale ohne Incident ─────────────── */}
          {signalRows.length > 0 && (
            <div className="scc-card" style={{ marginBottom: 16, borderColor: "var(--scc-warn, var(--scc-line))" }}>
              <div className="scc-card__eyebrow" style={{ marginBottom: 8 }}>
                Offene Signale ohne Incident
                {" · "}{fmtNum(signals?.totals.warp_failed ?? 0)} Warp
                {" · "}{fmtNum(signals?.totals.mail_failed_events ?? 0)} Mail-Gruppen
              </div>
              <table className="scc-table">
                <thead>
                  <tr>
                    <th>Quelle</th><th>Signal</th><th>Vorkommen</th><th>Zuletzt</th><th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {signalRows.map((sig) => (
                    <tr key={`${sig.kind}:${sig.ref_id}`}>
                      <td>
                        <span className={`scc-status scc-status--${riskTone(sig.suggested.severity)}`}>
                          {sourceLabel(sig.suggested.source)}
                        </span>
                      </td>
                      <td title={sig.detail ?? undefined}>{sig.title}</td>
                      <td>{fmtNum(sig.count)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(sig.occurred_at)}</td>
                      <td>
                        <button className="scc-btn" onClick={() => openFromSignal(sig)}>→ Incident</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: "var(--scc-muted)", marginTop: 8 }}>
                Fehlgeschlagene Warp-Ausführungen + Mail-Zustellfehler der letzten{" "}
                {fmtNum(signals?.scope.window_hours ?? 0)} h ohne zugeordneten Incident.
                {" "}„→ Incident" eröffnet vorbefüllt (Begründung bleibt Pflicht).
              </div>
            </div>
          )}

          {/* ── Filter ───────────────────────────────────── */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Nach Status filtern">
              <option value="">Status: alle</option>
              {(meta?.statuses ?? STATUS_ORDER).map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Nach Schweregrad filtern">
              <option value="">Schweregrad: alle</option>
              {(meta?.severities ?? SEVERITY_ORDER).map((s) => (
                <option key={s} value={s}>{severityLabel(s)}</option>
              ))}
            </select>
          </div>

          {/* ── Incident-Liste ───────────────────────────── */}
          {incidents.length === 0 ? (
            <div className="scc-muted" style={{ fontSize: 12, padding: 10 }}>
              {status || severity ? "Keine Incidents für diesen Filter." : "Noch keine Incidents. Operativ ruhig."}
            </div>
          ) : (
            <table className="scc-table">
              <thead>
                <tr>
                  <th>Zeit</th><th>Titel</th><th>Schweregrad</th><th>Status</th>
                  <th>Quelle</th><th>Signal</th><th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => (
                  <tr key={inc.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(inc.created_at)}</td>
                    <td title={inc.opened_reason ?? undefined}>{inc.title}</td>
                    <td>
                      <span className={`scc-status scc-status--${riskTone(inc.severity)}`}>
                        {severityLabel(inc.severity)}
                      </span>
                    </td>
                    <td>
                      <span className={`scc-status scc-status--${statusTone(inc.status)}`}>
                        {statusLabel(inc.status)}
                      </span>
                    </td>
                    <td>{sourceLabel(inc.source)}</td>
                    <td style={{ fontFamily: "var(--scc-mono, monospace)", fontSize: 11 }}>
                      {inc.signal_code ?? "–"}
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      {inc.status === "open" && (
                        <button className="scc-btn" onClick={() => handleAcknowledge(inc)}>Quittieren</button>
                      )}
                      {inc.status === "acknowledged" && (
                        <button className="scc-btn scc-btn--danger" onClick={() => handleResolve(inc)}>Schließen</button>
                      )}
                      {inc.status === "resolved" && (
                        <span className="scc-muted" style={{ fontSize: 11 }}>
                          {inc.resolved_at ? `Gelöst ${fmtDate(inc.resolved_at)}` : "Gelöst"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Footer ───────────────────────────────────── */}
          <div style={{ fontSize: 10, color: "var(--scc-muted)", marginTop: 16, borderTop: "1px solid var(--scc-line)", paddingTop: 8 }}>
            Plattformweiter Operator-Track. Statusmaschine: Offen → Quittiert → Gelöst.
            {" · "}Limit {fmtNum(resp.scope.limit)}
            {" · "}Datenstand: {fmtDate(resp.generated_at)}
          </div>
        </>
      )}

      {showCreate && (
        <CreateIncidentModal
          meta={meta}
          prefill={createPrefill}
          onClose={() => { setShowCreate(false); setCreatePrefill(null); }}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}
