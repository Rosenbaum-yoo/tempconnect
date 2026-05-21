import { sccApi } from "@scc/api/client";
import { useBootstrap } from "@scc/state/BootstrapContext";

export type AreaKey =
  | "commercial-inbox"
  | "customer-requests"
  | "subscription-requests"
  | "audit-report"
  | "executive"
  | "platform"
  | "revenue"
  | "support"
  | "operations"
  | "hetzner"
  | "risk-trust"
  | "audit-decisions"
  | "data-explorer"
  | "automation";

interface NavItem {
  key: AreaKey;
  label: string;
  group: string;
}

export const AREAS: NavItem[] = [
  { key: "commercial-inbox",      label: "Commercial Inbox",     group: "Arbeitsplatz" },
  { key: "customer-requests",     label: "Kundenanfragen",       group: "Arbeitsplatz" },
  { key: "subscription-requests", label: "Abo / Tarif-Anfragen", group: "Arbeitsplatz" },
  { key: "audit-report",          label: "Audit Report",         group: "Governance" },
  { key: "executive",             label: "Executive",            group: "Strategie" },
  { key: "platform",              label: "Platform",             group: "Strategie" },
  { key: "revenue",               label: "Revenue",              group: "Strategie" },
  { key: "support",               label: "Support",              group: "Operations" },
  { key: "operations",            label: "Operations",           group: "Operations" },
  { key: "hetzner",               label: "Hetzner",              group: "Operations" },
  { key: "risk-trust",            label: "Risk / Trust",         group: "Governance" },
  { key: "audit-decisions",       label: "Audit / Decisions",    group: "Governance" },
  { key: "data-explorer",         label: "Data Explorer",        group: "Governance" },
  { key: "automation",            label: "Automation",           group: "Automation" },
];

interface SidebarProps {
  active: AreaKey;
  onActivate: (key: AreaKey) => void;
}

export function Sidebar({ active, onActivate }: SidebarProps) {
  const { data } = useBootstrap();
  const openCount = data?.executive_summary?.customer_requests?.open ?? 0;

  // Gruppen bauen
  const groups: Record<string, NavItem[]> = {};
  AREAS.forEach((a) => {
    groups[a.group] = groups[a.group] ?? [];
    groups[a.group].push(a);
  });

  const handleLogout = async () => {
    try { await sccApi.post("/auth/logout"); } catch { /* ignore */ }
    window.location.href = "/public/staff/login.html";
  };

  return (
    <nav className="scc-side">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="scc-side__group">{group}</div>
          {items.map((item) => (
            <button
              key={item.key}
              className={`scc-nav-item${active === item.key ? " is-active" : ""}`}
              onClick={() => onActivate(item.key)}
            >
              <span>{item.label}</span>
              {item.key === "customer-requests" && openCount > 0 && (
                <span className="scc-nav-badge">{openCount.toLocaleString("de-DE")}</span>
              )}
            </button>
          ))}
        </div>
      ))}

      <div className="scc-side__group" style={{ marginTop: 16 }}>Session</div>
      <button className="scc-nav-item" onClick={handleLogout}>
        Abmelden
      </button>
    </nav>
  );
}
