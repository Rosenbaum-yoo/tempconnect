import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ToastSeverity = "success" | "error" | "warn" | "info";

interface Toast {
  id: number;
  severity: ToastSeverity;
  message: string;
}

interface ToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warn: (msg: string) => void;
  info: (msg: string) => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
});

// ── Provider ───────────────────────────────────────────────────────────────────

const TOAST_COLORS: Record<ToastSeverity, string> = {
  success: "var(--occ-ok)",
  error:   "var(--occ-danger)",
  warn:    "var(--occ-warn)",
  info:    "var(--occ-accent)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((severity: ToastSeverity, message: string) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, severity, message }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      severity === "error" ? 6000 : 4000
    );
  }, []);

  const value: ToastContextValue = {
    success: (m) => push("success", m),
    error:   (m) => push("error", m),
    warn:    (m) => push("warn", m),
    info:    (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            pointerEvents: "none",
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                background: "var(--occ-panel-2)",
                border: `1px solid ${TOAST_COLORS[t.severity]}`,
                borderLeft: `4px solid ${TOAST_COLORS[t.severity]}`,
                borderRadius: "6px",
                padding: "10px 16px",
                color: "var(--occ-text)",
                fontSize: "13px",
                maxWidth: "360px",
                boxShadow: "0 4px 16px rgba(0,0,0,.5)",
                pointerEvents: "auto",
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
