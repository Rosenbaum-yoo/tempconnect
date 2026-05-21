import { useSccQuery } from "@scc/hooks/useSccQuery";

interface Escalation {
  id: string;
  org_name?: string;
  subject: string;
  priority: string;
  created_at: string;
}

interface SupportData {
  escalations: Escalation[];
  impersonation: { allowed: boolean; reason: string };
}

function priorityTone(p: string) {
  if (p === "critical") return "danger";
  if (p === "high")     return "warn";
  return "ok";
}

export default function Support() {
  const { data, loading, error, reload } = useSccQuery<SupportData>("/support");

  if (loading) return <div className="scc-loading">Lade Support…</div>;
  if (error)   return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const imp        = data?.impersonation;
  const escalations = data?.escalations ?? [];

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Support</h1>
        <div className="scc-section__sub">Eskalationen und Impersonation-Policy.</div>
      </div>

      {/* Impersonation-Policy-Banner */}
      <div className="scc-card" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span
          className={`scc-status scc-status--${imp?.allowed ? "warn" : "ok"}`}
          style={{ fontSize: 13, padding: "4px 10px" }}
        >
          Impersonation: {imp?.allowed ? "ERLAUBT" : "DEAKTIVIERT"}
        </span>
        <span className="scc-muted" style={{ fontSize: 12 }}>
          {imp?.reason ?? "–"}
        </span>
      </div>

      {/* Eskalations-Tabelle */}
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Offene Eskalationen</h2>
      </div>

      {escalations.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">✓</div>
          <div className="scc-empty-state__text">Keine offenen Eskalationen</div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Org</th>
              <th>Betreff</th>
              <th>Priorität</th>
              <th>Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {escalations.map((e) => (
              <tr key={e.id}>
                <td className="scc-muted">{e.org_name ?? "–"}</td>
                <td>{e.subject}</td>
                <td>
                  <span className={`scc-status scc-status--${priorityTone(e.priority)}`}>
                    {e.priority}
                  </span>
                </td>
                <td className="scc-muted">{new Date(e.created_at).toLocaleDateString("de-DE")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
