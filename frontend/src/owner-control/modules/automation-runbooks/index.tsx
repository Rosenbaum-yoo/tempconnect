import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import { useToast } from "@occ/state/ToastContext";
import type { OccAutomationJobs, OccAutomationHistory, OccAutomationSchedules, OccAutomationJob } from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "–";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// ── Farben ─────────────────────────────────────────────────────────────────────

function statusColor(s: string): string {
  switch (s?.toLowerCase()) {
    case "enabled":  return "var(--occ-ok)";
    case "success":  return "var(--occ-ok)";
    case "running":  return "var(--occ-ok)";
    case "started":  return "var(--occ-warn)";
    case "disabled": return "var(--occ-muted)";
    case "failed":   return "var(--occ-critical)";
    case "error":    return "var(--occ-critical)";
    default:         return "var(--occ-text-2)";
  }
}

function riskColor(r: string): string {
  switch (r?.toLowerCase()) {
    case "critical": return "var(--occ-critical)";
    case "high":     return "var(--occ-danger)";
    case "medium":   return "var(--occ-warn)";
    case "low":      return "var(--occ-ok)";
    default:         return "var(--occ-text-2)";
  }
}

// ── Trigger-Modal ──────────────────────────────────────────────────────────────

interface TriggerModalProps {
  job: OccAutomationJob;
  onClose: () => void;
  onSuccess: () => void;
}

function TriggerModal({ job, onClose, onSuccess }: TriggerModalProps) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const valid = reason.trim().length >= 10;

  function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    occApi
      .post<{ execution_id: string; status: string; audit_id: string | null }>(
        "/automation/trigger",
        { job_id: job.id, reason: reason.trim(), confirmed: true }
      )
      .then((res) => {
        if (res.success) {
          toast.success(`Job gestartet — Execution-ID: ${res.data.execution_id}`);
          onSuccess();
        } else {
          toast.error(res.error.message ?? `Fehler: ${res.error.code}`);
          setSubmitting(false);
        }
      })
      .catch(() => {
        toast.error("Netzwerkfehler beim Starten des Jobs.");
        setSubmitting(false);
      });
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--occ-bg)",
          border: "1px solid var(--occ-line)",
          borderRadius: "8px",
          padding: "24px",
          width: "460px",
          maxWidth: "90vw",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>Job auslösen</div>
        <div style={{ fontSize: "12px", color: "var(--occ-text-2)", marginBottom: "16px" }}>
          <span style={{ fontFamily: "monospace", background: "var(--occ-panel)", padding: "2px 6px", borderRadius: "3px", color: "var(--occ-accent)" }}>
            {job.name}
          </span>
          {" · "}
          <span style={{ color: riskColor(job.risk_level) }}>Risk: {job.risk_level}</span>
        </div>

        {job.description && (
          <div style={{ fontSize: "12px", color: "var(--occ-text-2)", marginBottom: "14px", padding: "8px 10px", background: "var(--occ-panel)", borderRadius: "4px" }}>
            {job.description}
          </div>
        )}

        <label style={{ display: "block", fontSize: "12px", color: "var(--occ-text-2)", marginBottom: "6px" }}>
          Begründung <span style={{ color: "var(--occ-critical)" }}>*</span>
          <span style={{ marginLeft: "6px", color: reason.trim().length >= 10 ? "var(--occ-ok)" : "var(--occ-muted)" }}>
            ({reason.trim().length}/10 min.)
          </span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Warum wird dieser Job jetzt ausgelöst?"
          style={{
            width: "100%",
            padding: "8px 10px",
            background: "var(--occ-panel)",
            border: `1px solid ${valid ? "var(--occ-ok)" : "var(--occ-line)"}`,
            borderRadius: "5px",
            color: "var(--occ-text)",
            fontSize: "13px",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
            marginBottom: "16px",
          }}
        />

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              background: "transparent",
              border: "1px solid var(--occ-line)",
              borderRadius: "5px",
              color: "var(--occ-text-2)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid || submitting}
            style={{
              padding: "7px 16px",
              background: valid && !submitting ? "var(--occ-accent)" : "var(--occ-muted)",
              border: "none",
              borderRadius: "5px",
              color: "#fff",
              fontSize: "12px",
              cursor: valid && !submitting ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            {submitting ? "Starte…" : "Job starten"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── State ──────────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; jobs: OccAutomationJobs; history: OccAutomationHistory; schedules: OccAutomationSchedules };

// ── Hauptmodul ─────────────────────────────────────────────────────────────────

export function AutomationRunbooksModule() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [triggerJob, setTriggerJob] = useState<OccAutomationJob | null>(null);

  const load = useCallback(() => {
    setState({ status: "loading" });
    Promise.all([
      occApi.get<OccAutomationJobs>("/automation/jobs"),
      occApi.get<OccAutomationHistory>("/automation/history"),
      occApi.get<OccAutomationSchedules>("/automation/schedules"),
    ]).then(([jobsRes, histRes, schRes]) => {
      if (jobsRes.success && histRes.success && schRes.success) {
        setState({ status: "ready", jobs: jobsRes.data, history: histRes.data, schedules: schRes.data });
      } else {
        const err =
          !jobsRes.success ? jobsRes.error :
          !histRes.success ? histRes.error :
          !schRes.success ? schRes.error :
          { code: "UNKNOWN" };
        setState({ status: "error", message: err.message ?? `Fehler: ${err.code}` });
      }
    }).catch(() => setState({ status: "error", message: "Netzwerkfehler beim Laden der Automation-Daten." }));
  }, []);

  useEffect(() => { load(); }, []);

  if (state.status === "loading") {
    return <AppShell pageTitle="Automation &amp; Runbooks"><div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Automation-Daten…</div></AppShell>;
  }
  if (state.status === "error") {
    return <AppShell pageTitle="Automation &amp; Runbooks"><div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div></AppShell>;
  }

  const thStyle = {
    textAlign: "left" as const,
    padding: "8px 12px",
    color: "var(--occ-text-2)",
    fontWeight: 600,
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  };

  return (
    <AppShell pageTitle="Automation &amp; Runbooks">
      <div style={{ maxWidth: "1100px" }}>

        {/* ── Automation Jobs ── */}
        <p className="occ-section-title">Automation Jobs</p>

        {state.jobs.jobs.length === 0 ? (
          <div className="occ-panel" style={{ textAlign: "center", padding: "24px", marginBottom: "20px", color: "var(--occ-text-2)", fontSize: "12px" }}>
            Keine Automation-Jobs konfiguriert
          </div>
        ) : (
          <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                  {["Name", "Kategorie", "Trigger", "Status", "Risk", "Letzter Lauf", "Nächster Lauf", "Aktion"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.jobs.jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, fontSize: "13px" }}>{job.name}</div>
                      {job.description && (
                        <div style={{ fontSize: "11px", color: "var(--occ-text-2)", maxWidth: "220px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                          {job.description}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "11px", fontFamily: "monospace", color: "var(--occ-text-2)" }}>{job.category}</td>
                    <td style={{ padding: "10px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{job.trigger}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: statusColor(job.status), fontSize: "12px", fontWeight: 600 }}>{job.status}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ color: riskColor(job.risk_level), fontSize: "12px", fontWeight: 600 }}>{job.risk_level}</span>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>
                      {fmtDate(job.last_run_at)}
                      {job.last_run_status && (
                        <div style={{ color: statusColor(job.last_run_status), fontSize: "10px" }}>{job.last_run_status}</div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{fmtDate(job.next_run_at)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {job.status !== "disabled" && (
                        <button
                          onClick={() => setTriggerJob(job)}
                          style={{
                            padding: "4px 10px",
                            background: "transparent",
                            border: `1px solid ${riskColor(job.risk_level)}`,
                            borderRadius: "4px",
                            color: riskColor(job.risk_level),
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          ▶ Auslösen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Schedules ── */}
        {state.schedules.schedules.length > 0 && (
          <>
            <p className="occ-section-title">Zeitpläne</p>
            <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    {["Job", "Cron", "Nächster Lauf", "Aktiv", "Risk"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.schedules.schedules.map((s) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: "13px" }}>{s.name}</td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", fontFamily: "monospace", color: "var(--occ-accent)" }}>{s.cron}</td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{fmtDate(s.next_run)}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{ color: s.enabled ? "var(--occ-ok)" : "var(--occ-muted)", fontSize: "12px", fontWeight: 600 }}>
                          {s.enabled ? "Ja" : "Nein"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: "12px", color: riskColor(s.risk_level) }}>{s.risk_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── History ── */}
        <p className="occ-section-title">
          Ausführungshistorie
          <span style={{ marginLeft: "6px", fontSize: "12px", color: "var(--occ-text-2)", fontWeight: 400 }}>
            ({state.history.total} gesamt)
          </span>
        </p>

        {state.history.items.length === 0 ? (
          <div className="occ-panel" style={{ textAlign: "center", padding: "24px", marginBottom: "20px", color: "var(--occ-text-2)", fontSize: "12px" }}>
            Noch keine Ausführungen
          </div>
        ) : (
          <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                  {["Runbook", "Akteur", "Status", "Risk", "Gestartet", "Dauer", "Fehler"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.history.items.map((ex) => (
                  <tr key={ex.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: "13px" }}>{ex.runbook_name ?? "–"}</td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", fontFamily: "monospace", color: "var(--occ-text-2)" }}>
                      {ex.actor_email ?? (ex.actor_id?.slice(0, 8) ?? "–")}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ color: statusColor(ex.status), fontSize: "12px", fontWeight: 600 }}>{ex.status}</span>
                      {ex.dry_run && (
                        <span style={{ marginLeft: "6px", fontSize: "10px", color: "var(--occ-warn)", fontWeight: 600 }}>[dry-run]</span>
                      )}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: riskColor(ex.risk_level) }}>{ex.risk_level}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{fmtDate(ex.started_at)}</td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{fmtDuration(ex.duration_ms)}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "var(--occ-critical)", maxWidth: "180px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {ex.error ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.history.has_more && (
              <div style={{ padding: "8px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>
                Weitere Einträge vorhanden — Pagination in Kürze.
              </div>
            )}
          </div>
        )}

        {/* ── Trigger-Modal ── */}
        {triggerJob && (
          <TriggerModal
            job={triggerJob}
            onClose={() => setTriggerJob(null)}
            onSuccess={() => { setTriggerJob(null); load(); }}
          />
        )}
      </div>
    </AppShell>
  );
}
