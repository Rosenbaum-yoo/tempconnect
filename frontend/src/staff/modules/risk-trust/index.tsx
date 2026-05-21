import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtNum } from "@scc/utils/format";

interface RiskTrustData {
  dsgvo_requests_open: number;
  compliance_docs_expired: number;
}

export default function RiskTrust() {
  const { data, loading, error, reload } = useSccQuery<RiskTrustData>("/risk-trust");

  if (loading) return <div className="scc-loading">Lade Risk / Trust…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Risk / Trust</h1>
        <div className="scc-section__sub">DSGVO + Compliance Signale.</div>
      </div>

      <div className="scc-grid">
        <div className="scc-card">
          <div className="scc-card__eyebrow">DSGVO offen</div>
          <div className="scc-card__value">{fmtNum(data?.dsgvo_requests_open ?? 0)}</div>
        </div>
        <div className="scc-card">
          <div className="scc-card__eyebrow">Compliance abgelaufen</div>
          <div className="scc-card__value">{fmtNum(data?.compliance_docs_expired ?? 0)}</div>
        </div>
      </div>
    </div>
  );
}
