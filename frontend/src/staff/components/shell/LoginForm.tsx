/**
 * LoginForm — React-native Staff Login.
 * Ersetzt die alte vanilla-JS login.html.
 * POST /staff/api/auth/login → { email, password }
 * Haupt-Repo-Backend: JOIN auf tempconnect_staff (Allowlist).
 */

import { useState, type FormEvent } from "react";
import { sccApi, SccApiError } from "@scc/api/client";

interface Props {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: Props) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sccApi.post("/auth/login", { email: email.trim(), password });
      onSuccess();
    } catch (err) {
      if (err instanceof SccApiError) {
        const code = err.code;
        if (code === "SCC_LOGIN_FAILED" || err.status === 401) {
          setError("E-Mail oder Passwort falsch, oder kein Staff-Zugang vorhanden.");
        } else if (code === "MISSING_CREDENTIALS") {
          setError("Bitte E-Mail und Passwort eingeben.");
        } else {
          setError(`Login-Fehler: ${err.message}`);
        }
      } else {
        setError("Verbindungsfehler – bitte erneut versuchen.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scc-login-overlay">
      <form className="scc-login__box" onSubmit={handleSubmit} noValidate>
        <div className="scc-login__brand">⬡ TempConnect</div>
        <h1 className="scc-login__title">Staff Control Center</h1>
        <p className="scc-login__hint">
          Interner Bereich · Nur für das TempConnect-Team
        </p>

        {error && (
          <div className="scc-login__error" role="alert">
            {error}
          </div>
        )}

        <div className="scc-login__field">
          <label className="scc-login__label" htmlFor="scc-email">
            E-Mail
          </label>
          <input
            id="scc-email"
            className="scc-input"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@tempconnect.de"
          />
        </div>

        <div className="scc-login__field">
          <label className="scc-login__label" htmlFor="scc-password">
            Passwort
          </label>
          <input
            id="scc-password"
            className="scc-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button
          className="scc-btn scc-btn--primary"
          type="submit"
          disabled={loading || !email || !password}
          style={{ width: "100%", marginTop: 8 }}
        >
          {loading ? "Anmelden…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}
