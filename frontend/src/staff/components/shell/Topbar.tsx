import { useBootstrap } from "@scc/state/BootstrapContext";

export function Topbar() {
  const { data } = useBootstrap();
  const staff = data?.staff;
  const mode  = data?.hetzner_mode ?? "stub";

  return (
    <header className="scc-topbar">
      <div className="scc-topbar__brand">TempConnect · STAFF · INTERN</div>
      <div className="scc-topbar__right">
        <span className="scc-pill scc-pill--danger">TEAM-ONLY</span>
        <span className={`scc-pill ${mode === "live" ? "scc-pill--live" : "scc-pill--stub"}`}>
          Hetzner: {mode}
        </span>
        {staff && (
          <span className="scc-topbar__owner">
            Staff: <strong>{staff.email || staff.user_id}</strong>
          </span>
        )}
      </div>
    </header>
  );
}
