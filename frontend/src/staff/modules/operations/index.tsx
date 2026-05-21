import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtDate } from "@scc/utils/format";

interface RunbookRun {
  runbook_key: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

interface OperationsData {
  recent_runs: RunbookRun[];
}

function runTone(status: string) {
  if (status === "success") return "ok";
  if (status === "running")  return "warn";
  return "danger";
}

export default function Operations() {
  const { data, loading, error, reload } = useSccQuery<OperationsData>("/operations");

  if (loading) return <div className="scc-loading">Lade Operations…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const runs = data?.recent_runs ?? [];

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Operations</h1>
        <div className="scc-section__sub">Letzte Runbook-Läufe.</div>
      </div>

      <table className="scc-table">
        <thead>
          <tr>
            <th>Runbook</th>
            <th>Status</th>
            <th>Start</th>
            <th>Ende</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0
            ? <tr><td colSpan={4} className="scc-muted">Noch keine Läufe.</td></tr>
            : runs.map((r, i) => (
                <tr key={i}>
                  <td><span className="scc-code">{r.runbook_key}</span></td>
                  <td>
                    <span className={`scc-status scc-status--${runTone(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{fmtDate(r.started_at)}</td>
                  <td>{fmtDate(r.finished_at ?? "")}</td>
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  );
}
