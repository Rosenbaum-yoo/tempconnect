import { sccApi } from "@scc/api/client";
import { useBootstrap } from "@scc/state/BootstrapContext";

export type AreaKey =
  | "commercial-inbox"
  | "customer-requests"
  | "customer-operations"
  | "subscription-requests"
  | "pilots"
  | "preregistrations"
  | "audit-report"
  | "executive"
  | "platform"
  | "revenue"
  | "billing"
  | "mail"
  | "support"
  | "operations"
  | "incidents"
  | "hetzner"
  | "risk-trust"
  | "audit-decisions"
  | "data-explorer"
  | "automation"
  | "staff-access"
  | "support-vendors"
  | "marketplace-visibility"
  | "search-moderation"
  | "data-governance"
  | "document-vault";

interface NavItem {
  key: AreaKey;
  label: string;
  group: string;
}

export const AREAS: NavItem[] = [
  { key: "commercial-inbox",      label: "Commercial Inbox",     group: "Arbeitsplatz" },
  { key: "customer-requests",     label: "Kundenanfragen",       group: "Arbeitsplatz" },
  { key: "customer-operations",   label: "Customer Operations",  group: "Arbeitsplatz" },
  { key: "subscription-requests", label: "Abo / Tarif-Anfragen", group: "Arbeitsplatz" },
  { key: "pilots",                label: "Pilot-Verwaltung",     group: "Arbeitsplatz" },
  { key: "preregistrations",      label: "Voranmeldungen",       group: "Arbeitsplatz" },
  { key: "audit-report",          label: "Audit Report",         group: "Governance" },
  { key: "executive",             label: "Executive",            group: "Strategie" },
  { key: "platform",              label: "Platform",             group: "Strategie" },
  { key: "revenue",               label: "Revenue",              group: "Strategie" },
  { key: "billing",               label: "Billing",              group: "Strategie" },
  { key: "support",               label: "Support",              group: "Operations" },
  { key: "mail",                  label: "Mail & Notifications", group: "Operations" },
  { key: "operations",            label: "Operations",           group: "Operations" },
  { key: "incidents",             label: "Incidents",            group: "Operations" },
  { key: "hetzner",               label: "Hetzner",              group: "Operations" },
  { key: "risk-trust",            label: "Risk / Trust",         group: "Governance" },
  { key: "audit-decisions",       label: "Audit / Decisions",    group: "Governance" },
  { key: "data-explorer",         label: "Data Explorer",        group: "Governance" },
  { key: "automation",            label: "Automation",           group: "Automation" },
  { key: "staff-access",          label: "Staff Access",         group: "Administration" },
  { key: "support-vendors",       label: "Support Vendors",      group: "Administration" },
  { key: "marketplace-visibility", label: "Marketplace Visibility", group: "Marketplace" },
  { key: "search-moderation",     label: "Suchmeldungen",          group: "Marketplace" },
  { key: "data-governance",       label: "DSGVO / Datenschutz",    group: "Governance" },
  { key: "document-vault",        label: "Dokumenten-Tresor",      group: "Governance" },
];

interface SidebarProps {
  active: AreaKey;
  onActivate: (key: AreaKey) => void;
}

export function Sidebar({ active, onActivate }: SidebarProps) {
  const { data, reload } = useBootstrap();
  const openCount = data?.executive_summary?.customer_requests?.open ?? 0;

  // Gruppen bauen
  const groups: Record<string, NavItem[]> = {};
  AREAS.forEach((a) => {
    groups[a.group] = groups[a.group] ?? [];
    groups[a.group].push(a);
  });

  const handleLogout = async () => {
    try { await sccApi.post("/auth/logout"); } catch { /* ignore */ }
    // Bootstrap neu laden → 401 → AppShell zeigt LoginForm (kein Seiten-Reload nötig)
    reload();
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
