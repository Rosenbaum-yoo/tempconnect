import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { occApi } from "@occ/api/client";
import type { OccBootstrapData } from "@occ/types";

// ── State Shape ────────────────────────────────────────────────────────────────

export type BootstrapState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "ready"; data: OccBootstrapData };

// ── Context ────────────────────────────────────────────────────────────────────

const BootstrapContext = createContext<BootstrapState>({ status: "loading" });

// ── Provider ───────────────────────────────────────────────────────────────────

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootstrapState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    occApi
      .get<OccBootstrapData>("/bootstrap")
      .then((res) => {
        if (!active) return;

        if (res.success) {
          setState({ status: "ready", data: res.data });
          return;
        }

        const code = res.error.code;
        if (code === "NOT_AUTHENTICATED" || code === "401") {
          setState({ status: "unauthenticated" });
        } else if (code === "OCC_FORBIDDEN" || code === "403") {
          setState({ status: "forbidden" });
        } else {
          setState({
            status: "error",
            message: res.error.message ?? `Fehlercode: ${code}`,
          });
        }
      })
      .catch(() => {
        if (active) {
          setState({
            status: "error",
            message: "Verbindungsfehler. Bitte Seite neu laden.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <BootstrapContext.Provider value={state}>
      {children}
    </BootstrapContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

/** Gibt den rohen Bootstrap-State zurück (inkl. loading/error/etc.) */
export function useBootstrap(): BootstrapState {
  return useContext(BootstrapContext);
}

/**
 * Gibt Bootstrap-Data zurück — darf nur innerhalb von Komponenten gerufen werden,
 * die ausschliesslich im `status === "ready"` Zweig rendern (z. B. innerhalb AppShell).
 */
export function useBootstrapData(): OccBootstrapData {
  const state = useBootstrap();
  if (state.status !== "ready") {
    throw new Error("useBootstrapData darf nur bei status=ready verwendet werden");
  }
  return state.data;
}
