/**
 * AppShell — SCC WAVE 04
 * Hash-basiertes Routing: jedes Modul ist per URL direkt ansteuerbar.
 *   /staff/#commercial-inbox   → Commercial Inbox
 *   /staff/#hetzner            → Hetzner
 *   usw.
 *
 * Zustandslogik:
 *   - Initialer hash → active module
 *   - Bei Modul-Wechsel → history.replaceState (kein pushState, da Sidebar kein Back-Stack braucht)
 *   - Sidebar-Klick → setActive → Hash-Update via replaceState
 *   - NavContext.navigate → active + optionale Pre-Selection
 */

import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useBootstrap } from "@scc/state/BootstrapContext";
import { NavProvider } from "@scc/state/NavContext";
import { LoginForm } from "./LoginForm";
import { Topbar } from "./Topbar";
import { Sidebar, AREAS, type AreaKey } from "./Sidebar";

// Lazy-load alle Module — Code-Splitting pro Bereich
const CommercialInbox      = lazy(() => import("@scc/modules/commercial-inbox"));
const CustomerRequests     = lazy(() => import("@scc/modules/customer-requests"));
const CustomerOperations   = lazy(() => import("@scc/modules/customer-operations"));
const SubscriptionRequests = lazy(() => import("@scc/modules/subscription-requests"));
const AuditReport          = lazy(() => import("@scc/modules/audit-report"));
const Executive            = lazy(() => import("@scc/modules/executive"));
const Platform             = lazy(() => import("@scc/modules/platform"));
const Revenue              = lazy(() => import("@scc/modules/revenue"));
const Billing              = lazy(() => import("@scc/modules/billing"));
const Mail                 = lazy(() => import("@scc/modules/mail"));
const Support              = lazy(() => import("@scc/modules/support"));
const Operations           = lazy(() => import("@scc/modules/operations"));
const Incidents            = lazy(() => import("@scc/modules/incidents"));
const Hetzner              = lazy(() => import("@scc/modules/hetzner"));
const RiskTrust            = lazy(() => import("@scc/modules/risk-trust"));
const AuditDecisions       = lazy(() => import("@scc/modules/audit-decisions"));
const DataExplorer         = lazy(() => import("@scc/modules/data-explorer"));
const Automation           = lazy(() => import("@scc/modules/automation"));
const StaffAccess          = lazy(() => import("@scc/modules/staff-access"));
const MarketplaceVisibility = lazy(() => import("@scc/modules/marketplace-visibility"));
const DataGovernance        = lazy(() => import("@scc/modules/data-governance"));

const VALID_AREAS = new Set<string>(AREAS.map((a) => a.key));
const DEFAULT_AREA: AreaKey = "commercial-inbox";

function getHashArea(): AreaKey {
  const hash = window.location.hash.slice(1);
  return VALID_AREAS.has(hash) ? (hash as AreaKey) : DEFAULT_AREA;
}

function ModuleLoader() {
  return <div className="scc-loading" aria-label="Modul wird geladen">Lade…</div>;
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="scc-bootstrap-error" role="alert">
      <h2>SCC konnte nicht geladen werden</h2>
      <pre>{message}</pre>
      <button className="scc-btn" onClick={onRetry} style={{ marginTop: 16 }}>
        Erneut versuchen
      </button>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="scc-shell" aria-busy="true" aria-label="SCC wird geladen">
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
      {active === "customer-operations"   && <CustomerOperations />}
      {active === "subscription-requests" && <SubscriptionRequests />}
      {active === "audit-report"          && <AuditReport />}
      {active === "executive"             && <Executive />}
      {active === "platform"              && <Platform />}
      {active === "revenue"               && <Revenue />}
      {active === "billing"               && <Billing />}
      {active === "mail"                  && <Mail />}
      {active === "support"               && <Support />}
      {active === "operations"            && <Operations />}
      {active === "incidents"             && <Incidents />}
      {active === "hetzner"               && <Hetzner />}
      {active === "risk-trust"            && <RiskTrust />}
      {active === "audit-decisions"       && <AuditDecisions />}
      {active === "data-explorer"         && <DataExplorer />}
      {active === "automation"            && <Automation />}
      {active === "staff-access"          && <StaffAccess />}
      {active === "marketplace-visibility" && <MarketplaceVisibility />}
      {active === "data-governance"        && <DataGovernance />}
    </Suspense>
  );
}

export function AppShell() {
  const { status, error, reload } = useBootstrap();

  // Initialer Zustand aus URL-Hash
  const [active, setActiveState] = useState<AreaKey>(getHashArea);

  // Hash-Update bei Modul-Wechsel (replaceState: kein Back-Stack fuer Sidebar-Navigation)
  const setActive = useCallback((area: AreaKey) => {
    setActiveState(area);
    const newHash = `#${area}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
  }, []);

  // popstate: Browser Back/Forward (fuer programmatische pushState-Navigation in NavContext)
  useEffect(() => {
    const onPopState = () => setActiveState(getHashArea());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (status === "loading")      return <LoadingShell />;
  if (status === "unauthorized") return <LoginForm onSuccess={reload} />;
  if (status === "error")        return <ErrorView message={error ?? "Unbekannter Fehler"} onRetry={reload} />;

  return (
    <NavProvider onActivate={setActive}>
      <div className="scc-shell">
        <Topbar />
        <Sidebar active={active} onActivate={setActive} />
        <main className="scc-main" id="scc-main-content">
          <ActiveModule active={active} />
        </main>
      </div>
    </NavProvider>
  );
}
