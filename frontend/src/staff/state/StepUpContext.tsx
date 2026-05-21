/**
 * StepUpContext — Re-Authentifizierung wenn requires_step_up = true.
 * Step-Up ist 15 Minuten gültig.
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { sccApi } from "@scc/api/client";
import { useBootstrap } from "./BootstrapContext";

interface StepUpCtx {
  ensureStepUp: () => Promise<void>;
}

const Ctx = createContext<StepUpCtx>({ ensureStepUp: async () => {} });

export function StepUpProvider({ children }: { children: ReactNode }) {
  const { data } = useBootstrap();

  const ensureStepUp = useCallback(async () => {
    const staff = data?.staff;
    if (!staff?.requires_step_up) return;

    if (staff.step_up_at) {
      const age = Date.now() - Number(staff.step_up_at);
      if (age < 15 * 60 * 1000) return;  // 15 Min. gültig
    }

    const ok = window.confirm(
      "Re-Authentifizierung (Step-up) erforderlich. Fortfahren?"
    );
    if (!ok) throw new Error("STEP_UP_CANCELLED");

    const resp = await sccApi.post<{ step_up_at: number }>("/auth/step-up", { confirmed: true });
    // Update step_up_at in memory (Bootstrap wird nicht neu geladen)
    if (staff && resp.step_up_at) {
      staff.step_up_at = resp.step_up_at;
    }
  }, [data]);

  return <Ctx.Provider value={{ ensureStepUp }}>{children}</Ctx.Provider>;
}

export function useStepUp() { return useContext(Ctx).ensureStepUp; }
