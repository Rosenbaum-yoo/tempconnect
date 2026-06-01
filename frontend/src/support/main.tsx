import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function SocPlaceholder() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      fontFamily: "system-ui, sans-serif",
      background: "#0a0a0f",
      color: "#e2e8f0",
      gap: "16px"
    }}>
      <div style={{ fontSize: "14px", color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        TempConnect
      </div>
      <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#f1f5f9", margin: 0 }}>
        Support Operations Center
      </h1>
      <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
        Build-Entry aktiv — SOC-Shell in Vorbereitung.
      </p>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <SocPlaceholder />
  </StrictMode>
);
