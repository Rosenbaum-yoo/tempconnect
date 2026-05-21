import { useSccQuery } from "@scc/hooks/useSccQuery";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { sccApi } from "@scc/api/client";
import { riskTone } from "@scc/utils/format";

interface FeatureFlag {
  flag_key: string;
  description: string;
  risk_level: string;
  is_enabled: boolean;
}

interface PlatformData {
  feature_flags: FeatureFlag[];
}

export default function Platform() {
  const { data, loading, error, reload } = useSccQuery<PlatformData>("/platform");
  const confirm = useConfirm();
  const stepUp  = useStepUp();

  if (loading) return <div className="scc-loading">Lade Platform…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const flags = data?.feature_flags ?? [];

  const handleToggle = (flag: FeatureFlag) => {
    const next = !flag.is_enabled;
    confirm({
      title: "Feature-Flag toggle",
      hint:  `${flag.flag_key} → ${next ? "ON" : "OFF"}`,
      onConfirm: async (reason) => {
        await stepUp();
        await sccApi.post("/platform/feature-flags", {
          flag_key: flag.flag_key,
          enabled:  next,
          confirmed: true,
          reason,
        });
        reload();
      },
    });
  };

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Platform</h1>
        <div className="scc-section__sub">Globale Kill-Switches.</div>
      </div>

      <table className="scc-table">
        <thead>
          <tr>
            <th>Flag</th>
            <th>Beschreibung</th>
            <th>Risiko</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {flags.length === 0
            ? <tr><td colSpan={5} className="scc-muted">Keine Flags.</td></tr>
            : flags.map((f) => (
                <tr key={f.flag_key}>
                  <td><span className="scc-code">{f.flag_key}</span></td>
                  <td>{f.description}</td>
                  <td>
                    <span className={`scc-status scc-status--${riskTone(f.risk_level)}`}>
                      {f.risk_level}
                    </span>
                  </td>
                  <td>
                    {f.is_enabled
                      ? <span className="scc-status scc-status--danger">ON</span>
                      : <span className="scc-status scc-status--ok">OFF</span>}
                  </td>
                  <td>
                    <button
                      className="scc-btn scc-btn--danger"
                      onClick={() => handleToggle(f)}
                    >
                      Toggle
                    </button>
                  </td>
                </tr>
              ))
          }
        </tbody>
      </table>

      <div className="scc-danger-zone" style={{ marginTop: 24 }}>
        <div className="scc-danger-zone__title">Danger Zone</div>
        <div style={{ marginTop: 6 }}>
          Jede Änderung braucht Step-up, Confirm und Begründung.
        </div>
      </div>
    </div>
  );
}
