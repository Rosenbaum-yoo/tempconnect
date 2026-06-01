import { NavLink } from "react-router-dom";
import { useBootstrapData } from "@occ/state/BootstrapContext";

const MODULE_ORDER = [
  "executive",
  "decisions-requests",
  "revenue",
  "platform",
  "operations",
  "support-oversight",
  "risk",
  "audit",
  "infrastructure",
  "data-explorer",
  "automation-runbooks",
];

// Sektions-Trennlinien: nach welchem Modul-Key beginnt eine neue Sektion?
const SECTION_AFTER = new Set(["revenue", "audit"]);

export function Sidebar() {
  const data = useBootstrapData();

  const orderedModules = MODULE_ORDER.flatMap((key) => {
    const mod = data.allowed_modules.find((m) => m.key === key);
    return mod ? [mod] : [];
  });

  return (
    <aside className="occ-sidebar">
      <div className="occ-sidebar-header">
        <div className="occ-sidebar-logo">TempConnect</div>
        <div className="occ-sidebar-title">Owner Control</div>
      </div>

      <nav aria-label="OCC Navigation">
        <ul className="occ-sidebar-nav">
          {orderedModules.map((mod) => (
            <li key={mod.key} className="occ-sidebar-nav-item">
              {SECTION_AFTER.has(mod.key) && (
                <div className="occ-sidebar-section">Ops</div>
              )}
              {mod.key === "operations" && (
                <div className="occ-sidebar-section">Platform</div>
              )}
              <NavLink
                to={`/${mod.key}`}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                {mod.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="occ-sidebar-footer">
        <div style={{ fontSize: "11px", color: "var(--occ-text-2)" }}>
          {data.identity.email ?? data.identity.display_name ?? "Owner"}
        </div>
        <div style={{ fontSize: "10px", color: "var(--occ-muted)", marginTop: "2px" }}>
          {data.identity.occ_role}
        </div>
      </div>
    </aside>
  );
}
