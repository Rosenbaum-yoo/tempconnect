/**
 * ToastContext — SCC WAVE 04
 * Leichtgewichtiges Toast/Notification-System fuer das Staff Control Center.
 * Ersetzt alle alert()-Aufrufe im SCC.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success("Aktion erfolgreich");
 *   toast.error("Etwas ist schiefgelaufen");
 *   toast.warn("Achtung: ...");
 *   toast.info("Hinweis: ...");
 *
 * Design: Toasts erscheinen unten rechts, stacked, auto-close nach 5s.
 * Accessibility: role="alert" fuer error, role="status" fuer andere.
 */

import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";

export type ToastType = "success" | "error" | "warn" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  success: (message: string) => void;
  error:   (message: string) => void;
  warn:    (message: string) => void;
  info:    (message: string) => void;
}

const Ctx = createContext<ToastCtx>({
  success: () => undefined,
  error:   () => undefined,
  warn:    () => undefined,
  info:    () => undefined,
});

const AUTO_CLOSE_MS = 5_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer != null) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = setTimeout(() => dismiss(id), AUTO_CLOSE_MS);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  const api: ToastCtx = {
    success: (m) => push("success", m),
    error:   (m) => push("error",   m),
    warn:    (m) => push("warn",    m),
    info:    (m) => push("info",    m),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div
          className="scc-toasts"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`scc-toast scc-toast--${t.type}`}
              role={t.type === "error" ? "alert" : "status"}
            >
              <span className="scc-toast__msg">{t.message}</span>
              <button
                className="scc-toast__close"
                onClick={() => dismiss(t.id)}
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}
