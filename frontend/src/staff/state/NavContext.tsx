import { createContext, useContext, useState } from "react";
import type { AreaKey } from "@scc/components/shell/Sidebar";

interface NavState {
  /** Programmatically navigate to a module, optionally with a pre-selected item ID. */
  navigate: (area: AreaKey, id?: string) => void;
  /** Consume (read + clear) the pending initial selection for a given area. */
  consumeInitialId: (area: AreaKey) => string | null;
}

const NavContext = createContext<NavState>({
  navigate: () => undefined,
  consumeInitialId: () => null,
});

interface NavProviderProps {
  onActivate: (area: AreaKey) => void;
  children: React.ReactNode;
}

export function NavProvider({ onActivate, children }: NavProviderProps) {
  const [pending, setPending] = useState<Partial<Record<AreaKey, string>>>({});

  const navigate = (area: AreaKey, id?: string) => {
    if (id) setPending((prev) => ({ ...prev, [area]: id }));
    onActivate(area);
  };

  const consumeInitialId = (area: AreaKey): string | null => {
    const id = pending[area] ?? null;
    if (id) setPending((prev) => { const next = { ...prev }; delete next[area]; return next; });
    return id;
  };

  return (
    <NavContext.Provider value={{ navigate, consumeInitialId }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav(): NavState {
  return useContext(NavContext);
}
