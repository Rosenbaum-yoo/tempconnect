import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// ── Theme init (synchronous, before first paint) ─────────────────────────────
// Reads saved preference and applies it so there is no flash of wrong theme.
;(function initTheme() {
  try {
    const saved = localStorage.getItem("scc-theme");
    const theme = (saved === "light" || saved === "ultra_premium") ? saved : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch { /* localStorage may be blocked in some contexts */ }
})();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
