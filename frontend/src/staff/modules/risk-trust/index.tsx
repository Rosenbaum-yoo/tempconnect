import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtNum } from "@scc/utils/format";

interface RiskTrustData {
  dsgvo_requests_open: number;
  compliance_docs_expired: number;
  errors?: Array<{ area: string; error: string }>;
}

function kpiTone(n: number, warnAt = 1, dangerAt = 5) {
  if (n >= dangerAt) return "danger";
  if (n >= warnAt)   return "warn";
  return "ok";
}

export default function RiskTrust() {
  const { data, loading, error, reload } = useSccQuery<RiskTrustData>("/risk-trust");

  if (loading) return <div className="scc-loading">Lade Risk / Trust…</div>;
  if (error)   return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const dsgvo      = data?.dsgvo_requests_open ?? 0;
  const compliance = data?.compliance_docs_expired ?? 0;

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Risk / Trust</h1>
        <div className="scc-section__sub">DSGVO-Anfragen, abgelaufene Compliance-Dokumente.</div>
      </div>

      <div className="scc-grid">
        <div className={`scc-card scc-card--${kpiTone(dsgvo, 1, 5)}`}>
          <div className="scc-card__eyebrow">DSGVO-Anfragen offen</div>
          <div className="scc-card__value">{fmtNum(dsgvo)}</div>
          <div className="scc-card__hint">
            {dsgvo === 0
              ? "Keine offenen Anfragen – alles in Ordnung."
              : dsgvo < 5
              ? "Bitte zeitnah bearbeiten (DSGVO-Fristen beachten)."
              : "Kritisch: Fristen prüfen, ggf. eskalieren."}
          </div>
        </div>

        <div className={`scc-card scc-card--${kpiTone(compliance, 1, 3)}`}>
          <div className="scc-card__eyebrow">Compliance-Dokumente abgelaufen</div>
          <div className="scc-card__value">{fmtNum(compliance)}</div>
          <div className="scc-card__hint">
            {compliance === 0
              ? "Alle Dokumente gültig."
              : `${fmtNum(compliance)} Dokument${compliance !== 1 ? "e" : ""} erfordern Erneuerung.`}
          </div>
        </div>

        {/* Gesamtstatus */}
        <div className={`scc-card scc-card--${dsgvo === 0 && compliance === 0 ? "ok" : "warn"}`}>
          <div className="scc-card__eyebrow">Trust-Score</div>
          <div className="scc-card__value">
            {dsgvo === 0 && compliance === 0 ? "GRÜN" : "HANDLUNGSBEDARF"}
          </div>
          <div className="scc-card__hint">
            {dsgvo === 0 && compliance === 0
              ? "Keine offenen Risiko-Items."
              : `${dsgvo + compliance} offene Punkte insgesamt.`}
          </div>
        </div>
      </div>

      {/* Backend-Fehler */}
      {(data?.errors?.length ?? 0) > 0 && (
        <div style={{ marginTop: 20, padding: "10px 14px", background: "rgba(255,108,114,0.08)", borderRadius: 6, border: "1px solid var(--scc-danger)" }}>
          <div style={{ fontSize: 11, color: "var(--scc-danger)", marginBottom: 4 }}>Backend-Hinweise:</div>
          {data!.errors!.map((e, i) => (
            <div key={i} className="scc-muted" style={{ fontSize: 11 }}>{e.area}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
