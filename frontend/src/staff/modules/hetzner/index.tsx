/**
 * Hetzner — SCC WAVE 08
 *
 * Zeigt Hetzner Cloud Infra-Übersicht (read-only) + Safe-Actions.
 * STUB vs LIVE Mode-Badge (klar sichtbar wenn kein Token).
 * Servers-Tabelle: Name / Typ / Status / IP / Aktionen (Snapshot + Reboot).
 * Load-Balancers-Tabelle: Name / Standort / IP.
 * Danger-Zone-Hinweis (kein SSH, kein Delete, kein Rescue).
 *
 * Mutation-Guard: Step-up + Confirm + Reason (über sccApi.post /hetzner/action)
 */

import { useSccQuery }  from "@scc/hooks/useSccQuery";
import { useConfirm }   from "@scc/state/ConfirmContext";
import { useStepUp }    from "@scc/state/StepUpContext";
import { useToast }     from "@scc/state/ToastContext";
import { sccApi }       from "@scc/api/client";

// ─── Types ───────────────────────────────────────────────────

interface HetznerServer {
  id:          number;
  name:        string;
  status:      string;
  datacenter?: { name: string } | null;
  server_type: { name: string } | null;
  public_net:  { ipv4: { ip: string } | null } | null;
}

interface HetznerLB {
  id:         number;
  name:       string;
  location?:  { name: string } | null;
  public_net?: { ipv4?: { ip: string } | null } | null;
}

interface HetznerData {
  mode:           "live" | "stub";
  generated_at?:  string;
  servers:        { servers: HetznerServer[] } | null;
  load_balancers: { load_balancers: HetznerLB[] } | null;
}

// ─── Helpers ─────────────────────────────────────────────────

function serverTone(status: string): string {
  if (status === "running")  return "ok";
  if (status === "starting" || status === "rebuilding") return "warn";
  return "danger";
}

// ─── Component ───────────────────────────────────────────────

export default function Hetzner() {
  const { data, loading, error, reload } = useSccQuery<HetznerData>("/hetzner");
  const confirm = useConfirm();
  const stepUp  = useStepUp();
  const toast   = useToast();

  if (loading) return <div className="scc-loading">Lade Hetzner…</div>;
  if (error) return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const servers = data?.servers?.servers ?? [];
  const lbs     = data?.load_balancers?.load_balancers ?? [];
  const mode    = data?.mode ?? "stub";

  const runAction = (actionKey: string, label: string, params: Record<string, unknown>) => {
    confirm({
      title:   `Hetzner: ${actionKey}`,
      hint:    label,
      onConfirm: async (reason) => {
        try {
          await stepUp();
          await sccApi.post("/hetzner/action", {
            action_key: actionKey,
            params,
            confirmed: true,
            reason,
          });
          toast.success(`${actionKey} ausgeführt.`);
          reload();
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
        }
      },
    });
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="scc-section__header">
        <h1 className="scc-section__title">Hetzner</h1>
        <div className="scc-section__sub" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>Read-only Infra · Safe-Actions</span>
          <span
            className={`scc-status scc-status--${mode === "live" ? "ok" : "warn"}`}
            style={{ fontSize: 11 }}
          >
            {mode === "live" ? "LIVE" : "STUB-MODE"}
          </span>
          {data?.generated_at && (
            <span className="scc-muted" style={{ fontSize: 11 }}>
              Stand: {new Date(data.generated_at).toLocaleTimeString("de-DE")}
            </span>
          )}
          <button
            className="scc-btn"
            onClick={reload}
            style={{ fontSize: 11, padding: "2px 8px" }}
          >
            ↺
          </button>
        </div>
      </div>

      {mode === "stub" && (
        <div style={{
          marginBottom: 16, padding: "8px 12px",
          background: "rgba(245,180,62,0.06)",
          border: "1px solid var(--scc-warn)",
          borderRadius: 6, fontSize: 12,
          color: "var(--scc-warn)",
        }}>
          Stub-Mode aktiv — kein HETZNER_CLOUD_TOKEN gesetzt.
          Alle Daten sind deterministisch simuliert. Safe-Actions werden nicht ausgeführt.
        </div>
      )}

      {/* ── Servers ─────────────────────────────────────────── */}
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Server</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>{servers.length}</span>
      </div>

      {servers.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 24 }}>
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Keine Server.</div>
        </div>
      ) : (
        <table className="scc-table" style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Status</th>
              <th>DC</th>
              <th>IP</th>
              <th>Safe-Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id}>
                <td>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span className="scc-muted" style={{ marginLeft: 6, fontSize: 11 }}>#{s.id}</span>
                </td>
                <td className="scc-muted" style={{ fontSize: 12 }}>
                  {s.server_type?.name ?? "–"}
                </td>
                <td>
                  <span className={`scc-status scc-status--${serverTone(s.status)}`}>
                    {s.status}
                  </span>
                </td>
                <td className="scc-muted" style={{ fontSize: 12 }}>
                  {s.datacenter?.name ?? "–"}
                </td>
                <td>
                  <span className="scc-code" style={{ fontSize: 11 }}>
                    {s.public_net?.ipv4?.ip ?? "–"}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="scc-btn"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => runAction(
                        "server.create_image",
                        `${s.name} · Snapshot erstellen`,
                        { serverId: s.id, description: `staff-scc-${Date.now()}`, type: "snapshot" }
                      )}
                    >
                      Snapshot
                    </button>
                    <button
                      className="scc-btn scc-btn--danger"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => runAction(
                        "server.reboot",
                        `${s.name} · Server neu starten`,
                        { serverId: s.id }
                      )}
                    >
                      Reboot
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Load Balancers ───────────────────────────────────── */}
      <div className="scc-section__header">
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Load Balancers</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>{lbs.length}</span>
      </div>

      {lbs.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 24 }}>
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Keine Load Balancers.</div>
        </div>
      ) : (
        <table className="scc-table" style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Standort</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {lbs.map((lb) => (
              <tr key={lb.id}>
                <td>
                  <span style={{ fontWeight: 500 }}>{lb.name}</span>
                  <span className="scc-muted" style={{ marginLeft: 6, fontSize: 11 }}>#{lb.id}</span>
                </td>
                <td className="scc-muted" style={{ fontSize: 12 }}>
                  {lb.location?.name ?? "–"}
                </td>
                <td>
                  <span className="scc-code" style={{ fontSize: 11 }}>
                    {lb.public_net?.ipv4?.ip ?? "–"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Danger Zone ─────────────────────────────────────── */}
      <div className="scc-danger-zone" style={{ marginTop: 8 }}>
        <div className="scc-danger-zone__title">Danger Zone</div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Kein SSH · kein Delete · kein Rescue · keine Firewall-Mutation.
          Jede Safe-Action benötigt Step-up + Begründung + Confirm.
        </div>
      </div>
    </div>
  );
}
