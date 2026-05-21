import { useSccQuery } from "@scc/hooks/useSccQuery";

interface SupportData {
  impersonation: { active: boolean; reason: string };
}

export default function Support() {
  const { data, loading, error, reload } = useSccQuery<SupportData>("/support");

  if (loading) return <div className="scc-loading">Lade Support…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const imp = data?.impersonation;

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Support</h1>
        <div className="scc-section__sub">Eskalations-Signale.</div>
      </div>

      <div className="scc-grid">
        <div className="scc-card">
          <div className="scc-card__eyebrow">Impersonation</div>
          <div className="scc-card__value">
            {imp?.active ? "AN" : "AUS"}
          </div>
          <div className="scc-card__hint">{imp?.reason ?? "–"}</div>
        </div>
      </div>
    </div>
  );
}
