import { useNavigate } from "react-router-dom";
import { useBootstrapData } from "@occ/state/BootstrapContext";
import { useToast } from "@occ/state/ToastContext";
import { occApi } from "@occ/api/client";

function systemStatusLabel(s: "healthy" | "degraded" | "critical"): string {
  if (s === "healthy")  return "System OK";
  if (s === "degraded") return "Degraded";
  return "Critical";
}

export function Topbar({ pageTitle }: { pageTitle?: string }) {
  const data = useBootstrapData();
  const toast = useToast();
  const navigate = useNavigate();

  async function handleLogout() {
    await occApi.post("/auth/logout").catch(() => {});
    toast.info("Session beendet.");
    // Weiterleitung zur Plattform-Login-Seite
    window.location.href = "/public/login.html";
  }

  return (
    <header className="occ-topbar">
      <span className="occ-topbar-title">
        {pageTitle ?? "Owner Control Center"}
      </span>

      <span
        className={`occ-topbar-status occ-topbar-status--${data.system_status}`}
        title={`Systemstatus: ${systemStatusLabel(data.system_status)}`}
      >
        {systemStatusLabel(data.system_status)}
      </span>

      {data.critical_signals.length > 0 && (
        <span
          style={{
            fontSize: "11px",
            background: "rgba(239,68,68,.12)",
            color: "var(--occ-danger)",
            padding: "3px 8px",
            borderRadius: "4px",
            fontWeight: 600,
          }}
          title={`${data.critical_signals.length} offene Signal(e)`}
        >
          {data.critical_signals.length} Signal{data.critical_signals.length !== 1 ? "e" : ""}
        </span>
      )}

      <span className="occ-topbar-user">
        {data.identity.display_name ?? data.identity.email ?? "Owner"}
      </span>

      <button
        className="occ-topbar-btn"
        onClick={() => navigate("/executive")}
        type="button"
      >
        Dashboard
      </button>

      <button
        className="occ-topbar-btn"
        onClick={handleLogout}
        type="button"
      >
        Logout
      </button>
    </header>
  );
}
