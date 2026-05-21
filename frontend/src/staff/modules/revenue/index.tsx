import { useSccQuery } from "@scc/hooks/useSccQuery";

interface RevenueData {
  active_subscriptions: Array<{ plan: string; status: string; count: number }>;
}

export default function Revenue() {
  const { data, loading, error, reload } = useSccQuery<RevenueData>("/revenue");

  if (loading) return <div className="scc-loading">Lade Revenue…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const rows = data?.active_subscriptions ?? [];

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Revenue</h1>
        <div className="scc-section__sub">Aboverteilung.</div>
      </div>

      <table className="scc-table">
        <thead>
          <tr><th>Plan</th><th>Status</th><th>Anzahl</th></tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={3} className="scc-muted">Noch keine Abos.</td></tr>
            : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.plan}</td>
                  <td>{r.status}</td>
                  <td>{r.count.toLocaleString("de-DE")}</td>
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  );
}
