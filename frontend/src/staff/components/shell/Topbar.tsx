import { useState } from "react";
import { useBootstrap } from "@scc/state/BootstrapContext";

type Theme = "dark" | "light";

function getStoredTheme(): Theme {
  try {
    const t = localStorage.getItem("scc-theme");
    if (t === "light" || t === "dark") return t;
  } catch {/* ignore */}
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("scc-theme", theme); } catch {/* ignore */}
}

export function Topbar() {
  const { data } = useBootstrap();
  const staff = data?.staff;
  const mode  = data?.hetzner_mode ?? "stub";

  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  const isLight = theme === "light";

  return (
    <header className="scc-topbar">
      <div className="scc-topbar__brand">TempConnect · STAFF · INTERN</div>
      <div className="scc-topbar__right">
        <button
          type="button"
          className="scc-theme-toggle"
          onClick={toggleTheme}
          title={isLight ? "Dunkel-Modus" : "Hell-Modus"}
          aria-label="Theme wechseln"
        >
          <div className={`scc-theme-toggle__track${isLight ? " scc-theme-toggle__track--on" : ""}`}>
            <div className="scc-theme-toggle__thumb" />
          </div>
          <span className="scc-theme-toggle__label">{isLight ? "hell" : "dark"}</span>
        </button>
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
