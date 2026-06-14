/**
 * Pilots — plattformweite Pilot-Verwaltung (Owner-Wunsch 2026-06-14).
 * Master-Detail: Liste aller Piloten → Klick öffnet eine Detailansicht mit voller Info +
 * Verwaltung (verlängern / beenden / Ausnahme) mit Step-up + Confirm + Reason + Audit.
 * Bewusst KEIN "convert" — Konversion zu bezahlt bleibt zahlungsgetrieben (Payment-Flow).
 * Endpunkte: GET /pilots · POST /pilots/:orgId/{extend,end,exception} (alle requireStaff).
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { fmtDate, fmtDateShort } from "@scc/utils/format";

interface PilotRow {
  org_id: string;
  org_name: string;
  pilot_status: string;
  customer_stage: string | null;
  plan: string | null;
  billing_mode: string | null;
  has_used_pilot: boolean;
  pilot_exception_allowed: boolean | null;
  pilot_started_at: string | null;
  pilot_ended_at: string | null;
  converted_at: string | null;
  pilot_expires_at: string | null;
  remaining_days: number | string | null;
}
interface PilotListResp { items: PilotRow[]; total: number; }

const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv", ended: "Beendet", converted: "Konvertiert",
  blocked: "Gesperrt", exception: "Ausnahme", eligible: "Berechtigt",
};
const STATUS_TONE: Record<string, string> = {
  active: "live", converted: "live", blocked: "danger", exception: "warn",
};

function remainingDays(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function remainingTone(days: number | null): string {
  if (days === null) return "";
  if (days <= 7) return "danger";
  if (days <= 21) return "warn";
  return "live";
}
function statusPill(status: string) {
  const tone = STATUS_TONE[status];
  return <span className={`scc-pill${tone ? ` scc-pill--${tone}` : ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export default function Pilots() {
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();
  const [rows, setRows] = useState<PilotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);
  const [extendMonths, setExtendMonths] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await sccApi.get<PilotListResp>("/pilots");
      setRows(d.items ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // selected wird aus rows abgeleitet → nach jeder Aktion automatisch frisch.
  const selected = rows.find((r) => r.org_id === selectedId) || null;

  const doExtend = (p: PilotRow) => {
    confirm({
      title: `Pilot verlängern: ${p.org_name}`,
      hint: `Verschiebt das Pilot-Ende um ${extendMonths} Monat(e) nach hinten. Es wird KEINE Zahlung ausgelöst.`,
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post(`/pilots/${encodeURIComponent(p.org_id)}/extend`, { confirmed: true, reason, months: extendMonths });
        toast.success(`Pilot um ${extendMonths} Monat(e) verlängert.`);
        await load();
      },
    });
  };
  const doEnd = (p: PilotRow) => {
    confirm({
      title: `Pilot beenden: ${p.org_name}`,
      hint: "Beendet die Pilotphase → Kunde wird 'live'. KEINE Zahlung wird ausgelöst (Konversion bleibt zahlungsgetrieben).",
      dangerLabel: "Pilot beenden",
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post(`/pilots/${encodeURIComponent(p.org_id)}/end`, { confirmed: true, reason });
        toast.success("Pilot beendet.");
        await load();
      },
    });
  };
  const doException = (p: PilotRow, allowed: boolean) => {
    confirm({
      title: allowed ? `Erneuten Piloten erlauben: ${p.org_name}` : `Pilot sperren: ${p.org_name}`,
      hint: allowed
        ? "Erlaubt dieser Org eine erneute Pilotphase (Ausnahme von 'einmal pro Org')."
        : "Sperrt die Pilot-Aktivierung für diese Org-Familie.",
      dangerLabel: allowed ? undefined : "Sperren",
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post(`/pilots/${encodeURIComponent(p.org_id)}/exception`, { confirmed: true, reason, allowed });
        toast.success(allowed ? "Ausnahme gesetzt." : "Pilot gesperrt.");
        await load();
      },
    });
  };

  const activeCount = rows.filter((r) => r.pilot_status === "active").length;
  const visible = onlyActive ? rows.filter((r) => r.pilot_status === "active") : rows;

  // ── Detailansicht ───────────────────────────────────────
  function PilotDetail({ p }: { p: PilotRow }) {
    const days = remainingDays(p.remaining_days);
    const isActive = p.pilot_status === "active";
    const info: Array<[string, ReactNode]> = [
      ["Status", statusPill(p.pilot_status)],
      ["Tarif", p.plan ?? "–"],
      ["Kunden-Stufe", p.customer_stage ?? "–"],
      ["Abrechnungs-Modus", p.billing_mode ?? "–"],
      ["Pilot-Start", fmtDate(p.pilot_started_at)],
      ["Pilot-Ablauf", p.pilot_expires_at ? fmtDate(p.pilot_expires_at) : "–"],
      ["Restlaufzeit", isActive && days !== null
        ? <span className={`scc-pill${remainingTone(days) ? ` scc-pill--${remainingTone(days)}` : ""}`}>{days} Tage</span> : "–"],
      ["Pilot bereits genutzt", p.has_used_pilot ? "Ja" : "Nein"],
      ["Ausnahme erlaubt", p.pilot_exception_allowed ? "Ja" : "Nein"],
      ["Beendet am", p.pilot_ended_at ? fmtDate(p.pilot_ended_at) : "–"],
      ["Konvertiert am", p.converted_at ? fmtDate(p.converted_at) : "–"],
    ];

    return (
      <div>
        <button className="scc-btn" onClick={() => setSelectedId(null)} style={{ marginBottom: 14 }}>← Zurück zur Liste</button>

        <div className="scc-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
                Pilot · {p.org_id.slice(0, 8)}…
              </div>
              <h2 style={{ margin: "4px 0", fontSize: 18 }}>{p.org_name}</h2>
            </div>
            {statusPill(p.pilot_status)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px 24px", marginTop: 14 }}>
            {info.map(([k, v]) => (
              <div key={k} style={{ fontSize: 13 }}>
                <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>{k}</div>
                <div style={{ marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Verwaltung ───────────────────────────────── */}
        <div className="scc-card">
          <div className="scc-card__eyebrow">Verwaltung</div>
          <div style={{ fontSize: 12, color: "var(--scc-muted)", margin: "4px 0 14px" }}>
            Jede Aktion erfordert Step-up + Begründung und wird auditiert. „Beenden"/Ablauf lösen <strong>nie</strong> eine Zahlung aus —
            Konversion zu bezahlt passiert ausschließlich im Payment-Flow.
          </div>

          {isActive ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select
                  value={extendMonths}
                  onChange={(e) => setExtendMonths(Number(e.target.value))}
                  style={{ padding: "8px 10px", background: "var(--scc-panel)", color: "inherit", border: "1px solid var(--scc-line)", borderRadius: 4 }}
                >
                  {[1, 2, 3, 6].map((m) => <option key={m} value={m}>{m} Monat(e)</option>)}
                </select>
                <button className="scc-btn scc-btn--primary" onClick={() => doExtend(p)}>Verlängern</button>
              </div>
              <button className="scc-btn" onClick={() => doEnd(p)}>Pilot beenden</button>
              <button className="scc-btn" onClick={() => doException(p, false)}>Sperren</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {p.has_used_pilot && !p.pilot_exception_allowed
                ? <button className="scc-btn scc-btn--primary" onClick={() => doException(p, true)}>Erneuten Piloten erlauben</button>
                : <span className="scc-muted" style={{ fontSize: 13 }}>Keine Aktion verfügbar (Pilot nicht aktiv).</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="scc-pilots-title">
      <PageHeader
        id="scc-pilots-title"
        title="Pilot-Verwaltung"
        subtitle={`Plattformweit · ${activeCount} aktiv · 3 Monate frei · Auto-Ablauf & Beenden lösen nie eine Zahlung aus`}
        actions={<button className="scc-btn" onClick={() => void load()}>Neu laden</button>}
      />

      {selected ? (
        <PilotDetail p={selected} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button className={`scc-btn${onlyActive ? " scc-btn--primary" : ""}`} onClick={() => setOnlyActive(true)}>Aktive ({activeCount})</button>
            <button className={`scc-btn${!onlyActive ? " scc-btn--primary" : ""}`} onClick={() => setOnlyActive(false)}>Alle ({rows.length})</button>
          </div>

          {loading ? (
            <div className="scc-muted">Lade Piloten…</div>
          ) : err ? (
            <div className="scc-error-inline">{err}</div>
          ) : visible.length === 0 ? (
            <div className="scc-muted">Keine Piloten in dieser Ansicht.</div>
          ) : (
            <table className="scc-table">
              <thead>
                <tr><th>Organisation</th><th>Status</th><th>Plan</th><th>Start</th><th>Rest</th><th>Ablauf</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const days = remainingDays(p.remaining_days);
                  const isActive = p.pilot_status === "active";
                  return (
                    <tr key={p.org_id} onClick={() => setSelectedId(p.org_id)} style={{ cursor: "pointer" }}>
                      <td>
                        <div>{p.org_name}</div>
                        <div style={{ fontSize: 10, color: "var(--scc-muted)" }}>{p.org_id.slice(0, 8)}…</div>
                      </td>
                      <td>{statusPill(p.pilot_status)}</td>
                      <td>{p.plan ?? "–"}</td>
                      <td>{fmtDateShort(p.pilot_started_at)}</td>
                      <td>{isActive && days !== null
                        ? <span className={`scc-pill${remainingTone(days) ? ` scc-pill--${remainingTone(days)}` : ""}`}>{days} Tg.</span> : "–"}</td>
                      <td>{isActive ? fmtDate(p.pilot_expires_at) : (p.pilot_ended_at ? fmtDateShort(p.pilot_ended_at) : "–")}</td>
                      <td><button className="scc-btn scc-btn--primary" onClick={(e) => { e.stopPropagation(); setSelectedId(p.org_id); }}>Verwalten →</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
