import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { sccApi, SccApiError } from "@scc/api/client";
import type { StaffBootstrap, BootstrapStatus } from "@scc/types/bootstrap";

interface BootstrapCtx {
  status: BootstrapStatus;
  data: StaffBootstrap | null;
  error: string | null;
  reload: () => void;
}

const Ctx = createContext<BootstrapCtx>({
  status: "loading", data: null, error: null, reload: () => {},
});

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BootstrapStatus>("loading");
  const [data, setData]     = useState<StaffBootstrap | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const d = await sccApi.get<StaffBootstrap>("/bootstrap");
      setData(d);
      setStatus("ready");
    } catch (err) {
      if (err instanceof SccApiError && err.isUnauthorized) {
        setStatus("unauthorized");
      } else {
        setError(err instanceof Error ? err.message : "Bootstrap fehlgeschlagen");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Ctx.Provider value={{ status, data, error, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBootstrap() { return useContext(Ctx); }
export function useStaff()     { return useContext(Ctx).data?.staff ?? null; }
