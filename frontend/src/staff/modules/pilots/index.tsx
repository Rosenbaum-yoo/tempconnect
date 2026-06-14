/**
 * Pilots — plattformweite Pilot-Verwaltung (Owner-Wunsch 2026-06-14).
 * Zeigt ALLE Piloten aller Orgs + manuelle Controls (verlaengern / beenden / Ausnahme) mit
 * Step-up + Confirm + Reason + serverseitigem Audit. Bewusst KEIN "convert" hier — die
 * Konversion zu bezahlt bleibt zahlungsgetrieben (Payment-Flow), wird nie hier ausgeloest.
 * Endpunkte: GET /pilots · POST /pilots/:orgId/{extend,end,exception} (alle requireStaff).
 */
import { useState, useEffect, useCallback } from "react";
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

export default function Pilots() {
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();
  const [rows, setRows] = useState<PilotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);
  const [extendMonths, setExtendMonths] = useState(1);

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

  return (
    <section aria-labelledby="scc-pilots-title">
      <PageHeader
        id="scc-pilots-title"
        title="Pilot-Verwaltung"
        subtitle={`Plattformweit · ${activeCount} aktiv · 3 Monate frei · Auto-Ablauf & Beenden lösen nie eine Zahlung aus`}
        actions={<button className="scc-btn" onClick={() => void load()}>Neu laden</button>}
      />

      <div className="scc-card" style={{ marginBottom: 14, fontSize: 12, color: "var(--scc-muted)" }}>
        Sicherheits-Hinweis: Konversion zu einem bezahlten Tarif passiert ausschließlich im Payment-Flow
        (echte Zahlung). Beenden/Ablauf setzen den Kunden nur auf <strong>live</strong> — hier wird niemals abgebucht.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`scc-btn${onlyActive ? " scc-btn--primary" : ""}`} onClick={() => setOnlyActive(true)}>Aktive ({activeCount})</button>
          <button className={`scc-btn${!onlyActive ? " scc-btn--primary" : ""}`} onClick={() => setOnlyActive(false)}>Alle ({rows.length})</button>
        </div>
        <label style={{ fontSize: 12, color: "var(--scc-muted)", display: "flex", gap: 6, alignItems: "center" }}>
          Verlängerung um:
          <select
            value={extendMonths}
            onChange={(e) => setExtendMonths(Number(e.target.value))}
            style={{ padding: "4px 8px", background: "var(--scc-panel)", color: "inherit", border: "1px solid var(--scc-line)", borderRadius: 4 }}
          >
            {[1, 2, 3, 6].map((m) => <option key={m} value={m}>{m} Monat(e)</option>)}
          </select>
        </label>
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
            <tr>
              <th>Organisation</th><th>Status</th><th>Plan</th><th>Start</th>
              <th>Rest</th><th>Ablauf</th><th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const days = remainingDays(p.remaining_days);
              const isActive = p.pilot_status === "active";
              return (
                <tr key={p.org_id}>
                  <td>
                    <div>{p.org_name}</div>
                    <div style={{ fontSize: 10, color: "var(--scc-muted)" }}>{p.org_id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    <span className={`scc-pill${STATUS_TONE[p.pilot_status] ? ` scc-pill--${STATUS_TONE[p.pilot_status]}` : ""}`}>
                      {STATUS_LABEL[p.pilot_status] ?? p.pilot_status}
                    </span>
                  </td>
                  <td>{p.plan ?? "–"}</td>
                  <td>{fmtDateShort(p.pilot_started_at)}</td>
                  <td>
                    {isActive && days !== null
                      ? <span className={`scc-pill${remainingTone(days) ? ` scc-pill--${remainingTone(days)}` : ""}`}>{days} Tg.</span>
                      : "–"}
                  </td>
                  <td>{isActive ? fmtDate(p.pilot_expires_at) : (p.pilot_ended_at ? fmtDateShort(p.pilot_ended_at) : "–")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {isActive && <button className="scc-btn" onClick={() => doExtend(p)}>Verlängern</button>}
                      {isActive && <button className="scc-btn" onClick={() => doEnd(p)}>Beenden</button>}
                      {isActive && <button className="scc-btn" onClick={() => doException(p, false)}>Sperren</button>}
                      {!isActive && p.has_used_pilot && !p.pilot_exception_allowed && (
                        <button className="scc-btn" onClick={() => doException(p, true)}>Erneut erlauben</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
