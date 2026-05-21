import { useSccQuery } from "@scc/hooks/useSccQuery";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { sccApi } from "@scc/api/client";

interface HetznerServer {
  id: number;
  name: string;
  status: string;
  server_type: { name: string } | null;
  public_net: { ipv4: { ip: string } | null } | null;
}

interface HetznerData {
  servers: { servers: HetznerServer[] };
}

export default function Hetzner() {
  const { data, loading, error, reload } = useSccQuery<HetznerData>("/hetzner");
  const confirm = useConfirm();
  const stepUp  = useStepUp();

  if (loading) return <div className="scc-loading">Lade Hetzner…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const servers = data?.servers?.servers ?? [];

  const runAction = (actionKey: string, server: HetznerServer) => {
    confirm({
      title: `Hetzner: ${actionKey}`,
      hint:  `Server ${server.name} (ID ${server.id})`,
      onConfirm: async (reason) => {
        await stepUp();
        const params: Record<string, unknown> = { serverId: server.id };
        if (actionKey === "server.create_image") {
          params.description = `staff-scc-${Date.now()}`;
          params.type = "snapshot";
        }
        await sccApi.post("/hetzner/action", {
          action_key: actionKey,
          params,
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
        <h1 className="scc-section__title">Hetzner</h1>
        <div className="scc-section__sub">Read-only Infra + Safe-Actions.</div>
      </div>

      <table className="scc-table">
        <thead>
          <tr>
            <th>Server</th>
            <th>Typ</th>
            <th>Status</th>
            <th>IP</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {servers.length === 0
            ? <tr><td colSpan={5} className="scc-muted">Keine Server.</td></tr>
            : servers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.server_type?.name ?? "–"}</td>
                  <td>
                    <span className={`scc-status scc-status--${s.status === "running" ? "ok" : "warn"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.public_net?.ipv4?.ip ?? "–"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button
                      className="scc-btn"
                      onClick={() => runAction("server.create_image", s)}
                    >
                      Snapshot
                    </button>
                    <button
                      className="scc-btn scc-btn--danger"
                      onClick={() => runAction("server.reboot", s)}
                    >
                      Reboot
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
          Keine Shell, kein Delete, kein Rescue. Jede Aktion braucht Step-up + Begründung.
        </div>
      </div>
    </div>
  );
}
