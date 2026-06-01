/**
 * Staff Access Management — SCC WAVE 11
 *
 * Zeigt alle Staff-Mitglieder (aktiv + inaktiv) und erlaubt
 * authorisierten Staff-Usern, Zugänge mit Begründung zu deaktivieren.
 *
 * Sicherheitsregeln:
 * - Selbst-Deaktivierung wird frontend- und backend-seitig verhindert
 * - Deaktivierung erfordert Confirm + Reason (min. 10 Zeichen) via ConfirmContext
 * - Backend: requireStepUp + requireConfirmAndReason + writeStaffAudit (risk: high)
 * - Reaktivierung ist nur über direkten DB-Zugriff / Owner möglich (kein SCC-Button)
 */

import { useState, useCallback } from "react";
import { useSccQuery } from "@scc/hooks/useSccQuery";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useToast } from "@scc/state/ToastContext";
import { useBootstrap } from "@scc/state/BootstrapContext";
import { fmtDate } from "@scc/utils/format";

interface StaffMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface StaffAccessData {
  members: StaffMember[];
}

function roleTone(role: string) {
  if (role === "owner" || role === "admin") return "danger";
  if (role === "senior")                   return "warn";
  return "ok";
}

export default function StaffAccess() {
  const { data, loading, error, reload } = useSccQuery<StaffAccessData>("/staff-access");
  const { data: bootstrap } = useBootstrap();
  const confirm  = useConfirm();
  const toast    = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Eigene User-ID aus Bootstrap (verhindert Selbst-Deaktivierung im UI)
  const selfId = bootstrap?.staff?.user_id ?? null;

  const handleDeactivate = useCallback((member: StaffMember) => {
    confirm({
      title:       `Staff-Zugang deaktivieren: ${member.display_name ?? member.email}`,
      hint:        `Diese Aktion sperrt den SCC-Zugang von ${member.email} sofort. Eine Reaktivierung ist nur über den Owner möglich.`,
      dangerLabel: "Zugang deaktivieren",
      onConfirm:   async (reason) => {
        setBusy(member.user_id);
        try {
          await sccApi.patch(`/staff-access/${member.user_id}/deactivate`, {
            confirmed: true,
            reason,
          });
          toast.success(`Zugang von ${member.display_name ?? member.email} deaktiviert.`);
          reload();
        } finally {
          setBusy(null);
        }
      }
    });
  }, [confirm, toast, reload]);

  if (loading) return <div className="scc-loading">Lade Staff Access…</div>;
  if (error) return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const members  = data?.members ?? [];
  const active   = members.filter((m) => m.is_active);
  const inactive = members.filter((m) => !m.is_active);

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Staff Access Management</h1>
        <div className="scc-section__sub">
          Übersicht aller Staff-Zugänge. Deaktivierung erfordert Begründung und Audit-Eintrag.
          <button
            className="scc-btn"
            onClick={reload}
            style={{ marginLeft: 12, fontSize: 11, padding: "2px 8px" }}
          >
            ↺ Aktualisieren
          </button>
        </div>
      </div>

      {/* KPI-Zeile */}
      <div className="scc-grid" style={{ marginBottom: 20 }}>
        <div className="scc-card scc-card--ok">
          <div className="scc-card__eyebrow">Aktive Zugänge</div>
          <div className="scc-card__value">{active.length}</div>
        </div>
        {inactive.length > 0 && (
          <div className="scc-card">
            <div className="scc-card__eyebrow">Inaktiv / Gesperrt</div>
            <div className="scc-card__value scc-muted">{inactive.length}</div>
          </div>
        )}
      </div>

      {/* Aktive Staff */}
      <div className="scc-section__header" style={{ marginTop: 0 }}>
        <h2 className="scc-section__title" style={{ fontSize: 14 }}>Aktive Zugänge</h2>
      </div>

      {active.length === 0 ? (
        <div className="scc-empty-state">
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Keine aktiven Staff-Mitglieder.</div>
        </div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Name / E-Mail</th>
              <th>Rolle</th>
              <th>Seit</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {active.map((m) => {
              const isSelf = m.user_id === selfId;
              return (
                <tr key={m.user_id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {m.display_name ?? <span className="scc-muted">–</span>}
                      {isSelf && (
                        <span className="scc-status scc-status--ok" style={{ marginLeft: 8, fontSize: 10 }}>
                          Du
                        </span>
                      )}
                    </div>
                    <div className="scc-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>
                      {m.email}
                    </div>
                  </td>
                  <td>
                    <span className={`scc-status scc-status--${roleTone(m.role)}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="scc-muted">{fmtDate(m.created_at)}</td>
                  <td>
                    {isSelf ? (
                      <span className="scc-muted" style={{ fontSize: 11 }}>Eigener Zugang</span>
                    ) : (
                      <button
                        className="scc-btn scc-btn--danger"
                        style={{ fontSize: 11, padding: "3px 10px" }}
                        disabled={busy === m.user_id}
                        onClick={() => handleDeactivate(m)}
                        aria-label={`Zugang von ${m.display_name ?? m.email} deaktivieren`}
                      >
                        {busy === m.user_id ? "…" : "Deaktivieren"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Inaktive Staff */}
      {inactive.length > 0 && (
        <>
          <div className="scc-section__header" style={{ marginTop: 24 }}>
            <h2 className="scc-section__title" style={{ fontSize: 14 }}>
              Inaktive / Gesperrte Zugänge
            </h2>
            <div className="scc-section__sub" style={{ fontSize: 11 }}>
              Reaktivierung nur über den Owner (kein SCC-Button — Sicherheitsregel).
            </div>
          </div>
          <table className="scc-table">
            <thead>
              <tr>
                <th>Name / E-Mail</th>
                <th>Rolle</th>
                <th>Angelegt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inactive.map((m) => (
                <tr key={m.user_id} style={{ opacity: 0.6 }}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{m.display_name ?? <span className="scc-muted">–</span>}</div>
                    <div className="scc-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{m.email}</div>
                  </td>
                  <td>
                    <span className={`scc-status scc-status--${roleTone(m.role)}`}>{m.role}</span>
                  </td>
                  <td className="scc-muted">{fmtDate(m.created_at)}</td>
                  <td>
                    <span className="scc-status scc-status--danger">Inaktiv</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Governance-Hinweis */}
      <div style={{
        marginTop: 24,
        padding: "10px 14px",
        background: "rgba(99,102,241,0.06)",
        borderRadius: 6,
        border: "1px solid rgba(99,102,241,0.2)",
        fontSize: 11,
        color: "var(--scc-muted)"
      }}>
        Jede Deaktivierung erzeugt einen unveränderlichen Audit-Eintrag (Risk: high) in{" "}
        <span className="scc-code">staff_control_audit_log</span> mit Actor-ID, Target-User-ID und Begründung.
        Reaktivierungen sind nur über direkten DB-Zugriff durch den Owner möglich.
      </div>
    </div>
  );
}
