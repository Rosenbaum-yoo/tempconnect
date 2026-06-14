/**
 * Preregistrations — Pilot-Voranmeldungen kuratieren (Owner-Wunsch).
 * Owner reviewt Bewerbungen vom One-Pager (Telefon sichtbar fuer Outreach) + waehlt die 30+30
 * passenden Paare: Status pending -> confirmed -> qualified -> accepted/waitlist/rejected.
 * "Akzeptiert" je Seite zaehlt in den oeffentlichen "X von 30"-Zaehler.
 * Endpunkte: GET /preregistrations · POST /preregistrations/:id/status (requireStaff + Audit).
 */
import { useState, useEffect, useCallback } from "react";
import { sccApi } from "@scc/api/client";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { fmtDateShort } from "@scc/utils/format";

interface PreregRow {
  id: string; side: string; sector: string | null; org_name: string; contact_name: string;
  email: string; phone: string | null; company_size: string | null; einsatzort_confirmed: boolean;
  capacity_or_need: string | null; message: string | null; referred_by: string | null;
  source: string | null; status: string; consent_at: string | null; created_at: string | null;
}
interface SideCount { accepted: number; remaining: number; }
interface Counts { slots_per_side: number; company: SideCount; agency: SideCount; }
interface Resp { items: PreregRow[]; total: number; counts: Counts | null; }

const SIDE_LABEL: Record<string, string> = { company: "Einsatzunternehmen", agency: "Dienstleister" };
const SECTOR_LABEL: Record<string, string> = { logistik: "Logistik", pflege: "Pflege", industrie: "Industrie", andere: "Andere" };
const STATUS_LABEL: Record<string, string> = { pending: "Offen", confirmed: "Bestätigt", qualified: "Qualifiziert", accepted: "Akzeptiert", waitlist: "Warteliste", rejected: "Abgelehnt" };
const STATUS_TONE: Record<string, string> = { qualified: "warn", accepted: "live", rejected: "danger" };
const NEXT_ACTIONS: Array<{ key: string; label: string }> = [
  { key: "qualified", label: "Qualifizieren" },
  { key: "accepted", label: "Akzeptieren" },
  { key: "waitlist", label: "Warteliste" },
  { key: "rejected", label: "Ablehnen" },
];

export default function Preregistrations() {
  const toast = useToast();
  const [rows, setRows] = useState<PreregRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (side) qs.set("side", side);
      if (status) qs.set("status", status);
      const q = qs.toString();
      const d = await sccApi.get<Resp>("/preregistrations" + (q ? "?" + q : ""));
      setRows(d.items ?? []); setCounts(d.counts ?? null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [side, status]);
  useEffect(() => { void load(); }, [load]);

  const setStatusFor = async (p: PreregRow, newStatus: string) => {
    try {
      await sccApi.post(`/preregistrations/${encodeURIComponent(p.id)}/status`, { status: newStatus });
      toast.success(`${p.org_name}: ${STATUS_LABEL[newStatus] ?? newStatus}.`);
      await load();
    } catch (e: unknown) {
      toast.warn(e instanceof Error ? e.message : "Statuswechsel fehlgeschlagen.");
    }
  };

  const sel = { padding: "6px 10px", background: "var(--scc-panel)", color: "inherit", border: "1px solid var(--scc-line)", borderRadius: 4, fontSize: 13 };

  return (
    <section aria-labelledby="scc-prereg-title">
      <PageHeader
        id="scc-prereg-title"
        title="Pilot-Voranmeldungen"
        subtitle="Bewerbungen vom One-Pager kuratieren — auf Passung, nicht auf Reihenfolge. Telefon für den Outreach sichtbar."
        actions={<button className="scc-btn" onClick={() => void load()}>Neu laden</button>}
      />

      {counts && (
        <div className="scc-card" style={{ marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
          <div><strong>Einsatzunternehmen:</strong> {counts.company.accepted} / {counts.slots_per_side} akzeptiert · {counts.company.remaining} frei</div>
          <div><strong>Dienstleister:</strong> {counts.agency.accepted} / {counts.slots_per_side} akzeptiert · {counts.agency.remaining} frei</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 12, color: "var(--scc-muted)" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Seite:
          <select value={side} onChange={(e) => setSide(e.target.value)} style={sel}>
            <option value="">Alle</option><option value="company">Einsatzunternehmen</option><option value="agency">Dienstleister</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Status:
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={sel}>
            <option value="">Alle</option>
            {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="scc-muted">Lade Voranmeldungen…</div>
      ) : err ? (
        <div className="scc-error-inline">{err}</div>
      ) : rows.length === 0 ? (
        <div className="scc-muted">Keine Voranmeldungen in dieser Ansicht.</div>
      ) : (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Organisation</th><th>Seite</th><th>Branche</th><th>Kontakt</th><th>Einsatzort</th>
              <th>Bedarf / Kapazität</th><th>Status</th><th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <div>{p.org_name}</div>
                  <div style={{ fontSize: 10, color: "var(--scc-muted)" }}>{p.company_size || ""} · {fmtDateShort(p.created_at)}</div>
                </td>
                <td>{SIDE_LABEL[p.side] ?? p.side}</td>
                <td>{p.sector ? (SECTOR_LABEL[p.sector] ?? p.sector) : "–"}</td>
                <td style={{ fontSize: 12 }}>
                  <div>{p.contact_name}</div>
                  <div><a href={`mailto:${p.email}`}>{p.email}</a></div>
                  {p.phone && <div><a href={`tel:${p.phone}`} style={{ fontWeight: 600 }}>{p.phone}</a></div>}
                  {p.referred_by && <div style={{ color: "var(--scc-muted)" }}>Empf.: {p.referred_by}</div>}
                </td>
                <td>{p.einsatzort_confirmed ? <span className="scc-pill scc-pill--live">Hamburg ✓</span> : <span className="scc-pill">offen</span>}</td>
                <td style={{ fontSize: 12, maxWidth: 240 }}>{p.capacity_or_need || "–"}</td>
                <td><span className={`scc-pill${STATUS_TONE[p.status] ? ` scc-pill--${STATUS_TONE[p.status]}` : ""}`}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {NEXT_ACTIONS.filter((a) => a.key !== p.status).map((a) => (
                      <button key={a.key} className="scc-btn" onClick={() => void setStatusFor(p, a.key)}>{a.label}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
