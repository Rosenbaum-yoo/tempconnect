import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@occ/styles/occ.css";
import { App } from "./App";

// Spinner-Keyframe (globale Animation für LoadingScreen)
const style = document.createElement("style");
style.textContent = "@keyframes occ-spin { to { transform: rotate(360deg); } }";
document.head.appendChild(style);

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root nicht gefunden");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
