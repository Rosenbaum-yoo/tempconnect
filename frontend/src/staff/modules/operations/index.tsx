import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtDate } from "@scc/utils/format";

interface RunbookRun {
  runbook_key: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

interface OperationsData {
  generated_at?: string;
  recent_runs: RunbookRun[];
  errors?: Array<{ area: string; error: string }>;
}

function runTone(status: string) {
  if (status === "success") return "ok";
  if (status === "running")  return "warn";
  return "danger";
}

function duration(start: string, end: string | null) {
  if (!end) return "läuft…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function Operations() {
  const { data, loading, error, reload } = useSccQuery<OperationsData>("/operations");

  if (loading) return <div className="scc-loading">Lade Operations…</div>;
  if (error)   return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const runs = data?.recent_runs ?? [];

  // Schnellstats aus den letzten Läufen
  const successCount = runs.filter((r) => r.status === "success").length;
  const failedCount  = runs.filter((r) => r.status === "failed" || r.status === "error").length;
  const runningCount = runs.filter((r) => r.status === "running").length;

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Operations</h1>
        <div className="scc-section__sub">
          Runbook-Läufe und Plattform-Operationen.
          <button
            className="scc-btn"
            onClick={reload}
            style={{ marginLeft: 12, fontSize: 11, padding: "2px 8px" }}
          >
            ↺ Aktualisieren
          </button>
        </div>
      </div>

      {/* KPI-Schnellübersicht */}
      {runs.length > 0 && (
        <div className="scc-grid" style={{ marginBottom: 20 }}>
          <div className={`scc-card scc-card--${successCount > 0 ? "ok" : ""}`}>
            <div className="scc-card__eyebrow">Erfolgreiche Läufe</div>
            <div className="scc-card__value">{successCount}</div>
          </div>
          <div className={`scc-card${failedCount > 0 ? " scc-card--danger" : ""}`}>
            <div className="scc-card__eyebrow">Fehlgeschlagen</div>
            <div className="scc-card__value">{failedCount}</div>
          </div>
          {runningCount > 0 && (
            <div className="scc-card scc-card--warn">
              <div className="scc-card__eyebrow">Laufen gerade</div>
              <div className="scc-card__value">{runningCount}</div>
            </div>
          )}
        </div>
      )}

      {/* Runbook-Log */}
      {runs.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">
            Noch keine Runbook-Läufe — starte einen über „Automation".
          </div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Runbook</th>
              <th>Status</th>
              <th>Gestartet</th>
              <th>Dauer</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i}>
                <td><span className="scc-code">{r.runbook_key}</span></td>
                <td>
                  <span className={`scc-status scc-status--${runTone(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="scc-muted">{fmtDate(r.started_at)}</td>
                <td className="scc-muted">{duration(r.started_at, r.finished_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Backend-Warnungen */}
      {(data?.errors?.length ?? 0) > 0 && (
        <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(255,108,114,0.08)", borderRadius: 6, border: "1px solid var(--scc-danger)" }}>
          {data!.errors!.map((e, i) => (
            <div key={i} className="scc-muted" style={{ fontSize: 11 }}>{e.area}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
