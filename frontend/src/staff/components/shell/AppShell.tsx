import { useState, Suspense, lazy } from "react";
import { useBootstrap } from "@scc/state/BootstrapContext";
import { NavProvider } from "@scc/state/NavContext";
import { LoginForm } from "./LoginForm";
import { Topbar } from "./Topbar";
import { Sidebar, type AreaKey } from "./Sidebar";

// Lazy-load alle Module
const CommercialInbox      = lazy(() => import("@scc/modules/commercial-inbox"));
const CustomerRequests     = lazy(() => import("@scc/modules/customer-requests"));
const SubscriptionRequests = lazy(() => import("@scc/modules/subscription-requests"));
const AuditReport          = lazy(() => import("@scc/modules/audit-report"));
const Executive            = lazy(() => import("@scc/modules/executive"));
const Platform             = lazy(() => import("@scc/modules/platform"));
const Revenue              = lazy(() => import("@scc/modules/revenue"));
const Support              = lazy(() => import("@scc/modules/support"));
const Operations           = lazy(() => import("@scc/modules/operations"));
const Hetzner              = lazy(() => import("@scc/modules/hetzner"));
const RiskTrust            = lazy(() => import("@scc/modules/risk-trust"));
const AuditDecisions       = lazy(() => import("@scc/modules/audit-decisions"));
const DataExplorer         = lazy(() => import("@scc/modules/data-explorer"));
const Automation           = lazy(() => import("@scc/modules/automation"));

function ModuleLoader() {
  return <div className="scc-loading">Lade…</div>;
}

// Unauthorized = nicht eingeloggt oder Session abgelaufen → Login-Form zeigen

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: 40 }}>
      <h2 style={{ color: "var(--scc-danger)" }}>SCC konnte nicht geladen werden</h2>
      <pre style={{ color: "var(--scc-muted)", fontSize: 12 }}>{message}</pre>
      <button className="scc-btn" onClick={onRetry} style={{ marginTop: 16 }}>
        Erneut versuchen
      </button>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="scc-shell">
      <div style={{ gridColumn: "1/3", background: "#05070b", borderBottom: "1px solid var(--scc-line)" }} />
      <div style={{ background: "var(--scc-panel)", borderRight: "1px solid var(--scc-line)" }} />
      <div style={{ padding: 32, color: "var(--scc-muted)" }}>Authentifiziere…</div>
    </div>
  );
}

function ActiveModule({ active }: { active: AreaKey }) {
  return (
    <Suspense fallback={<ModuleLoader />}>
      {active === "commercial-inbox"      && <CommercialInbox />}
      {active === "customer-requests"     && <CustomerRequests />}
      {active === "subscription-requests" && <SubscriptionRequests />}
      {active === "audit-report"          && <AuditReport />}
      {active === "executive"             && <Executive />}
      {active === "platform"              && <Platform />}
      {active === "revenue"               && <Revenue />}
      {active === "support"               && <Support />}
      {active === "operations"            && <Operations />}
      {active === "hetzner"               && <Hetzner />}
      {active === "risk-trust"            && <RiskTrust />}
      {active === "audit-decisions"       && <AuditDecisions />}
      {active === "data-explorer"         && <DataExplorer />}
      {active === "automation"            && <Automation />}
    </Suspense>
  );
}

export function AppShell() {
  const { status, error, reload } = useBootstrap();
  const [active, setActive] = useState<AreaKey>("commercial-inbox");

  if (status === "loading")      return <LoadingShell />;
  if (status === "unauthorized") return <LoginForm onSuccess={reload} />;
  if (status === "error")        return <ErrorView message={error ?? "Unbekannter Fehler"} onRetry={reload} />;

  return (
    <NavProvider onActivate={setActive}>
      <div className="scc-shell">
        <Topbar />
        <Sidebar active={active} onActivate={setActive} />
        <main className="scc-main">
          <ActiveModule active={active} />
        </main>
      </div>
    </NavProvider>
  );
}
