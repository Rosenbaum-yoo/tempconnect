import { useEffect, useRef, useState } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import { useToast } from "@occ/state/ToastContext";
import type { OccDecisionItem, OccDecisionsList } from "@occ/types";

// ── Konstanten ─────────────────────────────────────────────────────────────────

const VALID_ACTIONS = [
  { value: "approve",       label: "Genehmigen" },
  { value: "reject",        label: "Ablehnen" },
  { value: "defer",         label: "Zurückstellen" },
  { value: "request_reply", label: "Antwort anfordern" },
  { value: "assign",        label: "Zuweisen" },
  { value: "triage",        label: "Triage" },
  { value: "close",         label: "Schließen" },
] as const;

type DecisionAction = (typeof VALID_ACTIONS)[number]["value"];

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Farben ─────────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  critical: "var(--occ-critical)",
  high:     "var(--occ-danger)",
  medium:   "var(--occ-warn)",
  low:      "var(--occ-ok)",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--occ-critical)",
  high:   "var(--occ-danger)",
  normal: "var(--occ-text-2)",
  low:    "var(--occ-muted)",
};

// ── State ──────────────────────────────────────────────────────────────────────

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; list: OccDecisionsList };

// ── Decide-Formular ────────────────────────────────────────────────────────────

interface DecideFormProps {
  item: OccDecisionItem;
  onClose: () => void;
  onSuccess: () => void;
}

function DecideForm({ item, onClose, onSuccess }: DecideFormProps) {
  const toast = useToast();
  const [action, setAction] = useState<DecisionAction>("approve");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.warn("Begründung muss mindestens 10 Zeichen enthalten.");
      reasonRef.current?.focus();
      return;
    }

    setSubmitting(true);

    const res = await occApi.post<{ success: boolean }>("/decisions-requests/decide", {
      request_id: item.id,
      action,
      reason: trimmed,
      confirmed: true,
    });

    setSubmitting(false);

    if (res.success) {
      toast.success(`Entscheidung „${action}" für Request #${item.id.slice(0, 8)} gespeichert.`);
      onSuccess();
    } else {
      toast.error(res.error.message ?? `Fehler: ${res.error.code}`);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 500,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--occ-panel-2)",
          border: "1px solid var(--occ-line)",
          borderRadius: "8px",
          padding: "24px",
          width: "480px",
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <p className="occ-section-title" style={{ marginBottom: "16px" }}>
          Entscheidung treffen
        </p>

        {/* Request-Kontext */}
        <div
          style={{
            background: "var(--occ-panel)",
            border: "1px solid var(--occ-line)",
            borderRadius: "6px",
            padding: "12px",
            marginBottom: "20px",
            fontSize: "12px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "4px", color: "var(--occ-text)" }}>
            {item.title ?? `Request #${item.id.slice(0, 8)}`}
          </div>
          {item.summary && (
            <div style={{ color: "var(--occ-text-2)", marginBottom: "8px" }}>{item.summary}</div>
          )}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {item.org_name && (
              <span style={{ color: "var(--occ-text-2)" }}>Org: {item.org_name}</span>
            )}
            {item.risk_level && (
              <span style={{ color: RISK_COLORS[item.risk_level] ?? "var(--occ-text-2)" }}>
                Risiko: {item.risk_level}
              </span>
            )}
            {item.sla_deadline && (
              <span style={{ color: "var(--occ-text-2)" }}>SLA: {fmtDate(item.sla_deadline)}</span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Aktion */}
          <label
            style={{ display: "block", marginBottom: "16px" }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--occ-text-2)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: "6px",
              }}
            >
              Aktion *
            </div>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as DecisionAction)}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--occ-panel)",
                border: "1px solid var(--occ-line)",
                borderRadius: "6px",
                color: "var(--occ-text)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {VALID_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>

          {/* Begründung */}
          <label style={{ display: "block", marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--occ-text-2)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: "6px",
              }}
            >
              Begründung * (min. 10 Zeichen)
            </div>
            <textarea
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              rows={4}
              placeholder="Begründung für die Entscheidung…"
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--occ-panel)",
                border: "1px solid var(--occ-line)",
                borderRadius: "6px",
                color: "var(--occ-text)",
                fontSize: "13px",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </label>

          {/* Buttons */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid var(--occ-line)",
                borderRadius: "6px",
                color: "var(--occ-text-2)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 10}
              style={{
                padding: "8px 16px",
                background: "var(--occ-accent)",
                border: "none",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting || reason.trim().length < 10 ? 0.6 : 1,
              }}
            >
              {submitting ? "Speichert…" : "Entscheidung speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Decision-Zeile ─────────────────────────────────────────────────────────────

interface DecisionRowProps {
  item: OccDecisionItem;
  onDecide: (item: OccDecisionItem) => void;
}

function DecisionRow({ item, onDecide }: DecisionRowProps) {
  const riskColor  = RISK_COLORS[item.risk_level]    ?? "var(--occ-text-2)";
  const prioColor  = PRIORITY_COLORS[item.priority]  ?? "var(--occ-text-2)";

  return (
    <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
      <td style={{ padding: "12px" }}>
        <div style={{ fontWeight: 600, marginBottom: "2px", fontSize: "13px" }}>
          {item.title ?? `Request #${item.id.slice(0, 8)}`}
        </div>
        {item.summary && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--occ-text-2)",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              maxWidth: "320px",
            }}
          >
            {item.summary}
          </div>
        )}
        {item.org_name && (
          <div style={{ fontSize: "11px", color: "var(--occ-text-2)", marginTop: "2px" }}>
            {item.org_name}
          </div>
        )}
      </td>
      <td style={{ padding: "12px", color: riskColor, fontSize: "12px", fontWeight: 600 }}>
        {item.risk_level}
      </td>
      <td style={{ padding: "12px", color: prioColor, fontSize: "12px", fontWeight: 600 }}>
        {item.priority}
      </td>
      <td style={{ padding: "12px", color: "var(--occ-text-2)", fontSize: "12px" }}>
        {item.status ?? "–"}
      </td>
      <td style={{ padding: "12px", color: "var(--occ-text-2)", fontSize: "12px" }}>
        {fmtDate(item.created_at)}
      </td>
      <td style={{ padding: "12px" }}>
        {item.owner_decision_required ? (
          <button
            onClick={() => onDecide(item)}
            style={{
              padding: "5px 12px",
              background: "var(--occ-accent)",
              border: "none",
              borderRadius: "5px",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Entscheiden
          </button>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--occ-text-2)" }}>–</span>
        )}
      </td>
    </tr>
  );
}

// ── Haupt-Modul ────────────────────────────────────────────────────────────────

export function DecisionsRequestsModule() {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [activeItem, setActiveItem] = useState<OccDecisionItem | null>(null);

  function load() {
    setState({ status: "loading" });

    occApi.get<OccDecisionsList>("/decisions-requests").then((res) => {
      if (res.success) {
        setState({ status: "ready", list: res.data });
      } else {
        setState({
          status: "error",
          message: res.error.message ?? `Fehler: ${res.error.code}`,
        });
      }
    }).catch(() => {
      setState({ status: "error", message: "Netzwerkfehler beim Laden der Decisions." });
    });
  }

  useEffect(() => { load(); }, []);

  return (
    <AppShell pageTitle="Decisions &amp; Requests">
      <div style={{ maxWidth: "1000px" }}>
        {/* Header-Zeile */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <p className="occ-section-title" style={{ margin: 0 }}>Offene Decisions &amp; Requests</p>
          {state.status === "ready" && state.list.pending_owner_decisions > 0 && (
            <span
              style={{
                padding: "3px 10px",
                background: "var(--occ-danger)",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {state.list.pending_owner_decisions} Owner-Entscheidung{state.list.pending_owner_decisions !== 1 ? "en" : ""} ausstehend
            </span>
          )}
        </div>

        {state.status === "loading" && (
          <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Decisions…</div>
        )}

        {state.status === "error" && (
          <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
        )}

        {state.status === "ready" && state.list.items.length === 0 && (
          <div className="occ-panel" style={{ textAlign: "center", padding: "32px" }}>
            <div style={{ color: "var(--occ-ok)", fontWeight: 600, marginBottom: "4px" }}>
              Keine offenen Requests
            </div>
            <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
              Alle Decisions wurden bearbeitet.
            </div>
          </div>
        )}

        {state.status === "ready" && state.list.items.length > 0 && (
          <>
            <div className="occ-panel" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    {["Request", "Risiko", "Priorität", "Status", "Erstellt", "Aktion"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          color: "var(--occ-text-2)",
                          fontWeight: 600,
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.list.items.map((item) => (
                    <DecisionRow key={item.id} item={item} onDecide={setActiveItem} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination-Hinweis */}
            <div style={{ fontSize: "11px", color: "var(--occ-text-2)", marginTop: "12px" }}>
              {state.list.total} Request{state.list.total !== 1 ? "s" : ""} gesamt
              {state.list.has_more && " — weitere vorhanden (Pagination folgt)"}
            </div>
          </>
        )}
      </div>

      {/* Decide-Dialog */}
      {activeItem && (
        <DecideForm
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onSuccess={() => {
            setActiveItem(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}
