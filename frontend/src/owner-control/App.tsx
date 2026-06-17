import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BootstrapProvider, useBootstrap } from "@occ/state/BootstrapContext";
import { ToastProvider } from "@occ/state/ToastContext";

// Module
import { ExecutiveModule } from "@occ/modules/executive";
import { DecisionsRequestsModule } from "@occ/modules/decisions-requests";
import { RevenueModule } from "@occ/modules/revenue";
import { PlatformModule } from "@occ/modules/platform";
import { OperationsModule } from "@occ/modules/operations";
import { SupportOversightModule } from "@occ/modules/support-oversight";
import { RiskModule } from "@occ/modules/risk";
import { AuditModule } from "@occ/modules/audit";
import { InfrastructureModule } from "@occ/modules/infrastructure";
import { DataExplorerModule } from "@occ/modules/data-explorer";
import { AutomationRunbooksModule } from "@occ/modules/automation-runbooks";

// ── Auth Guard States ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--occ-bg)",
        color: "var(--occ-text-2)",
        fontSize: "13px",
        gap: "12px",
      }}
    >
      <span
        style={{
          width: "18px",
          height: "18px",
          border: "2px solid var(--occ-line)",
          borderTopColor: "var(--occ-accent)",
          borderRadius: "50%",
          animation: "occ-spin 0.8s linear infinite",
          display: "inline-block",
        }}
      />
      Lade Owner Control Center…
    </div>
  );
}

function UnauthenticatedPage() {
  const returnUrl = encodeURIComponent(window.location.pathname);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--occ-bg)",
        color: "var(--occ-text)",
        gap: "16px",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <div style={{ fontSize: "11px", letterSpacing: ".1em", color: "var(--occ-text-2)", textTransform: "uppercase" }}>
        TempConnect
      </div>
      <h1 style={{ fontSize: "22px", fontWeight: 700 }}>Nicht eingeloggt</h1>
      <p style={{ fontSize: "13px", color: "var(--occ-text-2)", maxWidth: "340px", lineHeight: 1.6 }}>
        Das Owner Control Center erfordert eine gültige Plattform-Session.
      </p>
      <a
        href={`/?auth=login&return=${returnUrl}`}
        style={{
          padding: "10px 20px",
          background: "var(--occ-accent)",
          color: "#fff",
          borderRadius: "6px",
          textDecoration: "none",
          fontSize: "13px",
          fontWeight: 600,
        }}
      >
        Zum Login
      </a>
    </div>
  );
}

function ForbiddenPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--occ-bg)",
        color: "var(--occ-text)",
        gap: "16px",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <div style={{ fontSize: "11px", letterSpacing: ".1em", color: "var(--occ-text-2)", textTransform: "uppercase" }}>
        TempConnect
      </div>
      <h1 style={{ fontSize: "22px", fontWeight: 700 }}>Kein Zugriff</h1>
      <p style={{ fontSize: "13px", color: "var(--occ-text-2)", maxWidth: "360px", lineHeight: 1.6 }}>
        Dein Account ist nicht für das Owner Control Center freigeschaltet.
        Bitte wende dich an den Systemadministrator.
      </p>
      <a
        href="/public/enterprise.html"
        style={{
          padding: "8px 16px",
          border: "1px solid var(--occ-line)",
          color: "var(--occ-text-2)",
          borderRadius: "6px",
          textDecoration: "none",
          fontSize: "13px",
        }}
      >
        Zur Plattform
      </a>
    </div>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--occ-bg)",
        color: "var(--occ-text)",
        gap: "12px",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--occ-danger)" }}>Fehler</h1>
      <p style={{ fontSize: "13px", color: "var(--occ-text-2)", maxWidth: "340px" }}>{message}</p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "8px 16px",
          background: "var(--occ-panel-2)",
          border: "1px solid var(--occ-line)",
          color: "var(--occ-text)",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "13px",
        }}
        type="button"
      >
        Neu laden
      </button>
    </div>
  );
}

// ── Root Guard ─────────────────────────────────────────────────────────────────

function OccRoot() {
  const state = useBootstrap();

  if (state.status === "loading")         return <LoadingScreen />;
  if (state.status === "unauthenticated") return <UnauthenticatedPage />;
  if (state.status === "forbidden")       return <ForbiddenPage />;
  if (state.status === "error")           return <ErrorPage message={state.message} />;

  // status === "ready" — alle Module dürfen useBootstrapData() aufrufen
  return (
    <Routes>
      <Route path="/"                    element={<Navigate to="/executive" replace />} />
      <Route path="/executive"           element={<ExecutiveModule />} />
      <Route path="/decisions-requests"  element={<DecisionsRequestsModule />} />
      <Route path="/revenue"             element={<RevenueModule />} />
      <Route path="/platform"            element={<PlatformModule />} />
      <Route path="/operations"          element={<OperationsModule />} />
      <Route path="/support-oversight"   element={<SupportOversightModule />} />
      <Route path="/risk"                element={<RiskModule />} />
      <Route path="/audit"               element={<AuditModule />} />
      <Route path="/infrastructure"      element={<InfrastructureModule />} />
      <Route path="/data-explorer"       element={<DataExplorerModule />} />
      <Route path="/automation-runbooks" element={<AutomationRunbooksModule />} />
      <Route path="*"                    element={<Navigate to="/executive" replace />} />
    </Routes>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

export function App() {
  return (
    <BrowserRouter basename="/owner-control">
      <BootstrapProvider>
        <ToastProvider>
          <OccRoot />
        </ToastProvider>
      </BootstrapProvider>
    </BrowserRouter>
  );
}
