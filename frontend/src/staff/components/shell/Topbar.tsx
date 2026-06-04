import { useEffect, useState } from "react";
import { useBootstrap } from "@scc/state/BootstrapContext";

type Theme = "dark" | "light" | "ultra_premium";

const THEME_LABELS: Record<Theme, string> = {
  dark: "dark",
  light: "hell",
  ultra_premium: "premium"
};

function getStoredTheme(): Theme {
  try {
    const t = localStorage.getItem("scc-theme");
    if (t === "light" || t === "dark" || t === "ultra_premium") return t;
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

  // Tier-2 Env-Kill-Switch aus dem Bootstrap (fehlt → beide an = Default-Semantik).
  const switcherEnabled     = data?.theme?.switcher_enabled !== false;
  const ultraPremiumEnabled = data?.theme?.ultra_premium_enabled !== false;
  const themeOrder: Theme[] = ultraPremiumEnabled
    ? ["dark", "light", "ultra_premium"]
    : ["dark", "light"];

  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  // Wurde ein gespeichertes Theme serverseitig deaktiviert → auf Default zurück.
  useEffect(() => {
    const allowed: Theme[] = ultraPremiumEnabled
      ? ["dark", "light", "ultra_premium"]
      : ["dark", "light"];
    if (!allowed.includes(theme)) {
      setTheme("dark");
      applyTheme("dark");
    }
  }, [ultraPremiumEnabled, theme]);

  function cycleTheme() {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
    applyTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <header className="scc-topbar">
      <div className="scc-topbar__brand">TempConnect · STAFF · INTERN</div>
      <div className="scc-topbar__right">
        {switcherEnabled && (
          <button
            type="button"
            className="scc-theme-toggle"
            onClick={cycleTheme}
            title={`Theme: ${THEME_LABELS[theme]} — klicken zum Wechseln`}
            aria-label="Theme wechseln"
          >
            <div className={`scc-theme-toggle__track${isDark ? "" : " scc-theme-toggle__track--on"}`}>
              <div className="scc-theme-toggle__thumb" />
            </div>
            <span className="scc-theme-toggle__label">{THEME_LABELS[theme]}</span>
          </button>
        )}
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
