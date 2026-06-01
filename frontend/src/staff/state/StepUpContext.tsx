/**
 * StepUpContext — SCC WAVE 04
 * Echte Re-Authentifizierung via Passwort-Eingabe-Modal.
 * Ersetzt window.confirm() aus WAVE 02-Planung vollstaendig.
 *
 * Flow:
 *   1) Modul ruft await ensureStepUp() auf
 *   2) Falls step_up_at frisch (< 5 Min): no-op
 *   3) Sonst: Step-Up-Modal wird geoeffnet
 *   4) User gibt Passwort ein → POST /staff/api/auth/step-up
 *   5) Bei Erfolg: step_up_at_ref aktualisiert, Promise resolved
 *   6) Bei Abbruch/Fehler: Promise rejected mit Error
 *
 * TTL: 5 Minuten (konservativster Wert aller risk-level).
 * Wenn der Server trotzdem 428 liefert (z.B. bei critical-Aktionen nach 5-10 Min),
 * faengt der ConfirmContext den Fehler ab und zeigt ihn inline.
 *
 * Accessibility: role="dialog", aria-modal, autofocus auf Passwort-Input, Escape-Abbruch.
 */

import {
  createContext, useContext, useCallback, useRef,
  useState, useEffect, type ReactNode,
} from "react";
import { sccApi, SccApiError } from "@scc/api/client";
import { useBootstrap } from "./BootstrapContext";

interface StepUpCtx {
  ensureStepUp: () => Promise<void>;
}

const Ctx = createContext<StepUpCtx>({ ensureStepUp: async () => undefined });

// Konservativste TTL (critical-Aktionen brauchen 5 Min — wir verwenden das als Client-Check)
const CONSERVATIVE_TTL_MS = 5 * 60 * 1000;

export function StepUpProvider({ children }: { children: ReactNode }) {
  const { data } = useBootstrap();

  const [open, setOpen]           = useState(false);
  const [password, setPassword]   = useState("");
  const [errMsg, setErrMsg]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  // step_up_at wird im Ref gehalten — kein Re-Render wenn sich nur der Timestamp aendert
  const stepUpAtRef = useRef<number | null>(null);

  // Promise-Resolver fuer den Await-Flow
  const resolveRef = useRef<(() => void) | null>(null);
  const rejectRef  = useRef<((e: Error) => void) | null>(null);

  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  // Initialisierung: step_up_at aus Bootstrap (erster Load)
  useEffect(() => {
    if (data?.staff?.step_up_at != null && stepUpAtRef.current == null) {
      stepUpAtRef.current = Number(data.staff.step_up_at);
    }
  }, [data?.staff?.step_up_at]);

  // Autofocus wenn Modal oeffnet
  useEffect(() => {
    if (open) {
      // Kurzes Delay damit das DOM gerenderert ist
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }, [open]);

  const cancel = useCallback(() => {
    setOpen(false);
    setPassword("");
    setErrMsg("");
    rejectRef.current?.(new Error("STEP_UP_CANCELLED"));
    resolveRef.current = null;
    rejectRef.current  = null;
  }, []);

  const submit = useCallback(async () => {
    if (!password.trim()) return;
    setSubmitting(true);
    setErrMsg("");
    try {
      const resp = await sccApi.post<{ step_up_at: number }>("/auth/step-up", {
        method: "password",
        password: password.trim(),
      });
      stepUpAtRef.current = resp.step_up_at;
      setOpen(false);
      setPassword("");
      resolveRef.current?.();
      resolveRef.current = null;
      rejectRef.current  = null;
    } catch (e: unknown) {
      if (e instanceof SccApiError && e.status === 401) {
        setErrMsg("Falsches Passwort. Bitte erneut versuchen.");
      } else {
        setErrMsg(e instanceof Error ? e.message : "Fehler bei Re-Authentifizierung.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [password]);

  // Escape-Taste schliesst modal
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter" && !submitting && password.trim()) {
      e.preventDefault();
      void submit();
    }
  }, [cancel, submit, submitting, password]);

  const ensureStepUp = useCallback(async (): Promise<void> => {
    const staff = data?.staff;
    if (!staff?.requires_step_up) return;

    const now = Date.now();
    if (stepUpAtRef.current && now - stepUpAtRef.current < CONSERVATIVE_TTL_MS) return;

    return new Promise<void>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current  = reject;
      setPassword("");
      setErrMsg("");
      setSubmitting(false);
      setOpen(true);
    });
  }, [data?.staff]);

  return (
    <Ctx.Provider value={{ ensureStepUp }}>
      {children}

      {open && (
        <div
          className="scc-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scc-stepup-title"
          onKeyDown={handleKeyDown}
          onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}
        >
          <div className="scc-modal__box scc-stepup__box">
            <div className="scc-modal__title" id="scc-stepup-title">
              Re-Authentifizierung erforderlich
            </div>
            <div className="scc-modal__hint">
              Diese Aktion erfordert eine erneute Passwort-Eingabe.
              Bitte bestätige deine Identität.
            </div>

            <div className="scc-label" style={{ marginBottom: 8 }}>
              <span>Passwort</span>
              <input
                ref={passwordInputRef}
                type="password"
                className="scc-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Dein TempConnect-Passwort"
                autoComplete="current-password"
                disabled={submitting}
                aria-label="Passwort für Re-Authentifizierung"
              />
            </div>

            {errMsg && <div className="scc-error-inline" role="alert">{errMsg}</div>}

            <div className="scc-modal__actions">
              <button className="scc-btn" onClick={cancel} disabled={submitting}>
                Abbrechen
              </button>
              <button
                className="scc-btn scc-btn--primary"
                onClick={() => { void submit(); }}
                disabled={submitting || !password.trim()}
              >
                {submitting ? "Prüfe…" : "Bestätigen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useStepUp(): () => Promise<void> {
  return useContext(Ctx).ensureStepUp;
}
