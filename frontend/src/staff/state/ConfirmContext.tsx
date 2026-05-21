/**
 * ConfirmContext — globaler Confirm + Reason Modal.
 * Alle mutierenden Aktionen im SCC gehen durch diesen Modal.
 * Pflichtfeld: reason (min. 10 Zeichen).
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ConfirmOpts {
  title: string;
  hint?: string;
  dangerLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
}

interface ConfirmCtx {
  confirm: (opts: ConfirmOpts) => void;
}

const Ctx = createContext<ConfirmCtx>({ confirm: () => {} });

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts]     = useState<ConfirmOpts | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr]       = useState("");
  const [busy, setBusy]     = useState(false);

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    setReason("");
    setErr("");
    setBusy(false);
  }, []);

  const close = () => { setOpts(null); setReason(""); setErr(""); };

  const submit = async () => {
    if (reason.trim().length < 10) {
      setErr("Begründung mit min. 10 Zeichen erforderlich.");
      return;
    }
    if (!opts) return;
    setBusy(true);
    setErr("");
    try {
      await opts.onConfirm(reason.trim());
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {opts && (
        <div className="scc-modal" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="scc-modal__box">
            <div className="scc-modal__title">{opts.title}</div>
            {opts.hint && <div className="scc-modal__hint">{opts.hint}</div>}
            <div className="scc-label" style={{ marginBottom: 8 }}>
              <span>Begründung (min. 10 Zeichen)</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Warum wird diese Aktion durchgeführt?"
                autoFocus
              />
            </div>
            {err && <div className="scc-error-inline">{err}</div>}
            <div className="scc-modal__actions">
              <button className="scc-btn" onClick={close} disabled={busy}>Abbrechen</button>
              <button
                className={`scc-btn ${opts.dangerLabel ? "scc-btn--danger" : "scc-btn--primary"}`}
                onClick={submit}
                disabled={busy || reason.trim().length < 10}
              >
                {busy ? "…" : (opts.dangerLabel ?? "Bestätigen")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm() { return useContext(Ctx).confirm; }
