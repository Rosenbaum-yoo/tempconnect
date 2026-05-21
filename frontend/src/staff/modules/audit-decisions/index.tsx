import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtDate, riskTone } from "@scc/utils/format";

interface AuditEntry {
  created_at: string;
  action: string;
  status: string;
  risk_level: string;
}

interface AuditDecisionsData {
  audit: AuditEntry[];
}

export default function AuditDecisions() {
  const { data, loading, error, reload } = useSccQuery<AuditDecisionsData>("/audit-decisions");

  if (loading) return <div className="scc-loading">Lade Audit / Decisions…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const rows = data?.audit ?? [];

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Audit / Decisions</h1>
        <div className="scc-section__sub">Staff-Namespace (staff_control_audit_log).</div>
      </div>

      <table className="scc-table">
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Action</th>
            <th>Status</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={4} className="scc-muted">Noch keine Einträge.</td></tr>
            : rows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td><span className="scc-code">{r.action}</span></td>
                  <td>
                    <span className={`scc-status scc-status--${r.status === "ok" ? "ok" : "danger"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <span className={`scc-status scc-status--${riskTone(r.risk_level)}`}>
                      {r.risk_level}
                    </span>
                  </td>
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  );
}
