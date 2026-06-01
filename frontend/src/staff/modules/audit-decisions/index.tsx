/**
 * AuditDecisions — SCC WAVE 10
 *
 * Entscheidungsregister + Audit-Feed aus dem Staff-Namespace.
 *
 * Backend:
 *   GET  /audit-decisions          → { snapshot: { recent_audit[50], recent_decisions[50] }, audit[] }
 *   POST /audit-decisions          → Neue Entscheidung erfassen (Step-up + Confirm)
 *   PATCH /audit-decisions/:id/revert → Reversible Entscheidung zurücksetzen (Step-up + Confirm)
 *
 * Sections:
 *   KPI-Karten (Entscheidungen / reversibel offen / high-risk Aktionen / critical)
 *   Entscheidungsregister (Tabelle + Revert-Button bei reversiblen Einträgen)
 *   Neue Entscheidung erfassen (Inline-Formular, toggle)
 *   Audit-Feed (letzte 50, für tiefer Suche → Modul „Audit Report")
 */

import { useState } from "react";
import { useSccQuery }               from "@scc/hooks/useSccQuery";
import { sccApi }                    from "@scc/api/client";
import { useStepUp }                 from "@scc/state/StepUpContext";
import { useConfirm }                from "@scc/state/ConfirmContext";
import { useToast }                  from "@scc/state/ToastContext";
import { fmtDate, riskTone, shortId } from "@scc/utils/format";

// ─── Types ───────────────────────────────────────────────────────

interface AuditEntry {
  id:          string;
  created_at:  string;
  actor_id:    string | null;
  area:        string;
  action:      string;
  entity_type: string | null;
  entity_id:   string | null;
  status:      string;
  risk_level:  string;
  reason:      string | null;
}

interface DecisionEntry {
  id:           string;
  area:         string;
  title:        string;
  decision:     string;
  confirmed_at: string;
  reversible:   boolean;
  reverted_at:  string | null;
}

interface AuditDecisionsSnapshot {
  generated_at?:    string;
  recent_audit:     AuditEntry[];
  recent_decisions: DecisionEntry[];
  errors?:          Array<{ area: string; error: string }>;
}

interface AuditDecisionsResponse {
  snapshot: AuditDecisionsSnapshot;
  audit:    AuditEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────

function auditStatusTone(s: string): string {
  if (s === "ok")      return "ok";
  if (s === "partial") return "warn";
  return "danger";
}

function decisionStatusLabel(d: DecisionEntry): string {
  if (d.reverted_at) return "zurückgesetzt";
  if (d.reversible)  return "reversibel";
  return "fest";
}

function decisionStatusTone(d: DecisionEntry): string {
  if (d.reverted_at) return "danger";
  if (d.reversible)  return "ok";
  return "";
}

// ─── Component ───────────────────────────────────────────────────

export default function AuditDecisions() {
  const { data, loading, error, reload } = useSccQuery<AuditDecisionsResponse>("/audit-decisions");
  const ensureStepUp = useStepUp();
  const confirm      = useConfirm();
  const toast        = useToast();

  // ── New-Decision form state ───────────────────────────────────
  const [formOpen,       setFormOpen]       = useState(false);
  const [formArea,       setFormArea]       = useState("");
  const [formTitle,      setFormTitle]      = useState("");
  const [formDecision,   setFormDecision]   = useState("");
  const [formReversible, setFormReversible] = useState(false);

  // ─── Loading / Error ─────────────────────────────────────────
  if (loading) return <div className="scc-loading">Lade Audit / Decisions…</div>;
  if (error)   return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const snapshot  = data?.snapshot ?? { recent_audit: [], recent_decisions: [] };
  const decisions = snapshot.recent_decisions ?? [];
  const auditFeed = snapshot.recent_audit     ?? [];

  // KPI
  const reversibleOpen = decisions.filter((d) => d.reversible && !d.reverted_at).length;
  const highRiskCount  = auditFeed.filter((a) => a.risk_level === "high" || a.risk_level === "critical").length;
  const criticalCount  = auditFeed.filter((a) => a.risk_level === "critical").length;

  // ── Revert handler ───────────────────────────────────────────

  const handleRevert = async (dec: DecisionEntry) => {
    try { await ensureStepUp(); } catch { return; }
    confirm({
      title:       "Entscheidung zurücksetzen",
      hint:        `"${dec.title}" · Bereich: ${dec.area}`,
      dangerLabel: "Zurücksetzen",
      onConfirm:   async (reason) => {
        await sccApi.patch(`/audit-decisions/${dec.id}/revert`, { reason, confirmed: true });
        toast.success(`"${dec.title}" zurückgesetzt.`);
        reload();
      },
    });
  };

  // ── New-Decision handler ─────────────────────────────────────

  const handleNewDecision = async () => {
    const area     = formArea.trim();
    const title    = formTitle.trim();
    const decision = formDecision.trim();
    if (!area || !title || !decision) {
      toast.warn("Bereich, Titel und Entscheidungstext sind Pflichtfelder.");
      return;
    }
    try { await ensureStepUp(); } catch { return; }
    confirm({
      title:     "Neue Entscheidung erfassen",
      hint:      `Bereich: ${area} | ${title}`,
      onConfirm: async (reason) => {
        await sccApi.post("/audit-decisions", {
          area, title, decision, reversible: formReversible, reason, confirmed: true,
        });
        toast.success("Entscheidung erfasst.");
        setFormArea(""); setFormTitle(""); setFormDecision(""); setFormReversible(false);
        setFormOpen(false);
        reload();
      },
    });
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="scc-section__header">
        <h1 className="scc-section__title">Audit / Decisions</h1>
        <div className="scc-section__sub">
          Staff-Namespace:{" "}
          <span className="scc-code">staff_control_audit_log</span>
          {" + "}
          <span className="scc-code">staff_control_decisions</span>.
          {snapshot.generated_at && (
            <span className="scc-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              Stand: {new Date(snapshot.generated_at).toLocaleTimeString("de-DE")}
            </span>
          )}
          <button
            className="scc-btn"
            onClick={reload}
            style={{ marginLeft: 12, fontSize: 11, padding: "2px 8px" }}
          >
            ↺ Aktualisieren
          </button>
        </div>
      </div>

      {/* ── KPI ─────────────────────────────────────────────────── */}
      <div className="scc-grid" style={{ marginBottom: 24 }}>
        <div className="scc-card">
          <div className="scc-card__eyebrow">Erfasste Entscheidungen</div>
          <div className="scc-card__value">{decisions.length}</div>
          <div className="scc-muted" style={{ fontSize: 11 }}>letzte 50</div>
        </div>
        <div className={`scc-card${reversibleOpen > 0 ? " scc-card--ok" : ""}`}>
          <div className="scc-card__eyebrow">Reversibel &amp; offen</div>
          <div className="scc-card__value">{reversibleOpen}</div>
          <div className="scc-muted" style={{ fontSize: 11 }}>noch nicht zurückgesetzt</div>
        </div>
        <div className={`scc-card${highRiskCount > 0 ? " scc-card--warn" : ""}`}>
          <div className="scc-card__eyebrow">High/Critical Aktionen</div>
          <div className="scc-card__value">{highRiskCount}</div>
          <div className="scc-muted" style={{ fontSize: 11 }}>letzte 50 Einträge</div>
        </div>
        <div className={`scc-card${criticalCount > 0 ? " scc-card--danger" : ""}`}>
          <div className="scc-card__eyebrow">Kritisch (critical)</div>
          <div className="scc-card__value">{criticalCount}</div>
          <div className="scc-muted" style={{ fontSize: 11 }}>höchste Risikoklasse</div>
        </div>
      </div>

      {/* ── Entscheidungsregister ──────────────────────────────── */}
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Entscheidungsregister</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>letzte 50 Einträge</span>
      </div>

      {decisions.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 24 }}>
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Noch keine Entscheidungen erfasst.</div>
        </div>
      ) : (
        <table className="scc-table" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Bereich</th>
              <th>Titel</th>
              <th>Entscheidung</th>
              <th>Bestätigt am</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="scc-code" style={{ fontSize: 11 }}>{d.area}</span>
                </td>
                <td style={{ fontWeight: 500 }}>{d.title}</td>
                <td
                  className="scc-muted"
                  style={{
                    maxWidth: 260, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12,
                  }}
                  title={d.decision}
                >
                  {d.decision}
                </td>
                <td className="scc-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {fmtDate(d.confirmed_at)}
                </td>
                <td>
                  {decisionStatusTone(d) ? (
                    <span className={`scc-status scc-status--${decisionStatusTone(d)}`}>
                      {decisionStatusLabel(d)}
                    </span>
                  ) : (
                    <span className="scc-muted" style={{ fontSize: 11 }}>fest</span>
                  )}
                </td>
                <td>
                  {d.reversible && !d.reverted_at && (
                    <button
                      className="scc-btn scc-btn--danger"
                      style={{ fontSize: 11, padding: "2px 8px" }}
                      onClick={() => { void handleRevert(d); }}
                    >
                      Revertieren
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Neue Entscheidung ─────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <button
          className="scc-btn scc-btn--primary"
          style={{ fontSize: 12 }}
          onClick={() => setFormOpen((v) => !v)}
        >
          {formOpen ? "Formular schließen" : "+ Neue Entscheidung erfassen"}
        </button>

        {formOpen && (
          <div style={{
            marginTop: 12, padding: "16px 20px",
            background: "var(--scc-panel-2)", borderRadius: 8,
            border: "1px solid var(--scc-line)",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div className="scc-muted" style={{ fontSize: 11, marginBottom: 4 }}>Bereich *</div>
                <input
                  value={formArea}
                  onChange={(e) => setFormArea(e.target.value)}
                  placeholder="z.B. platform, compliance"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <div className="scc-muted" style={{ fontSize: 11, marginBottom: 4 }}>Titel *</div>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Kurztitel der Entscheidung"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div className="scc-muted" style={{ fontSize: 11, marginBottom: 4 }}>Entscheidungstext *</div>
              <textarea
                rows={3}
                value={formDecision}
                onChange={(e) => setFormDecision(e.target.value)}
                placeholder="Was wurde entschieden und warum?"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 12, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={formReversible}
                  onChange={(e) => setFormReversible(e.target.checked)}
                />
                Reversibel (kann zurückgesetzt werden)
              </label>
              <button
                className="scc-btn scc-btn--primary"
                style={{ fontSize: 12 }}
                onClick={() => { void handleNewDecision(); }}
              >
                Erfassen (Step-up + Begründung)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Audit-Feed ────────────────────────────────────────── */}
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Audit-Feed</h2>
        <span className="scc-muted" style={{ fontSize: 12 }}>
          {auditFeed.length > 0
            ? `${auditFeed.length} Einträge (letzte 50)`
            : "Leer"
          }
          {" — "}
          <span style={{ fontSize: 11 }}>
            Für gefilterte Suche → Modul „Audit Report" verwenden
          </span>
        </span>
      </div>

      {auditFeed.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">
            Noch keine Staff-Aktionen protokolliert.
          </div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Bereich</th>
              <th>Aktion</th>
              <th>Actor</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Begründung</th>
            </tr>
          </thead>
          <tbody>
            {auditFeed.map((a) => (
              <tr key={a.id}>
                <td className="scc-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {fmtDate(a.created_at)}
                </td>
                <td>
                  <span className="scc-code" style={{ fontSize: 11 }}>{a.area}</span>
                </td>
                <td>
                  <span className="scc-code" style={{ fontSize: 11 }}>{a.action}</span>
                </td>
                <td className="scc-muted" style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {shortId(a.actor_id)}
                </td>
                <td>
                  <span className={`scc-status scc-status--${riskTone(a.risk_level)}`}>
                    {a.risk_level}
                  </span>
                </td>
                <td>
                  <span className={`scc-status scc-status--${auditStatusTone(a.status)}`}>
                    {a.status}
                  </span>
                </td>
                <td
                  className="scc-muted"
                  style={{
                    maxWidth: 200, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11,
                  }}
                  title={a.reason ?? ""}
                >
                  {a.reason ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Backend-Warnungen ─────────────────────────────────── */}
      {(snapshot.errors?.length ?? 0) > 0 && (
        <div style={{
          marginTop: 16, padding: "8px 12px",
          background: "rgba(255,108,114,0.06)", borderRadius: 6,
          border: "1px solid var(--scc-danger)",
        }}>
          <div style={{ fontSize: 11, color: "var(--scc-danger)", marginBottom: 4 }}>
            Backend-Warnungen:
          </div>
          {snapshot.errors!.map((e, i) => (
            <div key={i} className="scc-muted" style={{ fontSize: 11 }}>
              {e.area}: {e.error}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
