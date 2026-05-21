import { useState } from "react";
import { useSccQuery } from "@scc/hooks/useSccQuery";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { sccApi } from "@scc/api/client";
import { riskTone } from "@scc/utils/format";

interface Runbook {
  key: string;
  name: string;
  risk_level: string;
}

interface AutomationData {
  runbooks: Runbook[];
}

interface RunResult {
  status: string;
  steps: unknown[];
}

export default function Automation() {
  const { data, loading, error, reload } = useSccQuery<AutomationData>("/automation");
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  if (loading) return <div className="scc-loading">Lade Automation…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const runbooks = data?.runbooks ?? [];

  const handleRun = (rb: Runbook, dry: boolean) => {
    confirm({
      title: `${dry ? "Dry-Run" : "Run"}: ${rb.key}`,
      hint:  dry ? "Schritte werden nur simuliert." : "Schritte werden ausgeführt.",
      onConfirm: async (reason) => {
        await stepUp();
        const result = await sccApi.post("/automation/run", {
          runbook_key: rb.key,
          dry_run: dry,
          confirmed: true,
          reason,
        }) as RunResult;
        setLastResult(result);
      },
    });
  };

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Automation / Runbooks</h1>
        <div className="scc-section__sub">Deklarative Runbooks.</div>
      </div>

      <table className="scc-table">
        <thead>
          <tr><th>Key</th><th>Name</th><th>Risk</th><th /></tr>
        </thead>
        <tbody>
          {runbooks.length === 0
            ? <tr><td colSpan={4} className="scc-muted">Keine Runbooks.</td></tr>
            : runbooks.map((rb) => (
                <tr key={rb.key}>
                  <td><span className="scc-code">{rb.key}</span></td>
                  <td>{rb.name}</td>
                  <td>
                    <span className={`scc-status scc-status--${riskTone(rb.risk_level)}`}>
                      {rb.risk_level}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="scc-btn" onClick={() => handleRun(rb, true)}>
                      Dry-Run
                    </button>
                    <button className="scc-btn scc-btn--danger" onClick={() => handleRun(rb, false)}>
                      Run
                    </button>
                  </td>
                </tr>
              ))
          }
        </tbody>
      </table>

      {lastResult && (
        <div className="scc-card" style={{ marginTop: 16 }}>
          <div className="scc-card__eyebrow">Letztes Ergebnis</div>
          <div className="scc-card__value">{lastResult.status}</div>
          <div className="scc-card__hint">{lastResult.steps.length} Schritte</div>
        </div>
      )}
    </div>
  );
}
