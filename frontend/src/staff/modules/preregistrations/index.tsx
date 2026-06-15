/**
 * Preregistrations — Pilot-Voranmeldungen kuratieren (Owner-Wunsch).
 * Master-Detail: Liste der Bewerbungen vom One-Pager → Klick öffnet Detailansicht mit voller
 * Info (Telefon prominent fürs Outreach, Opt-in-Status) + Status-Workflow.
 * Status: pending → confirmed (Double-Opt-in) → qualified → accepted/waitlist/rejected.
 * "Akzeptiert" je Seite zählt in den öffentlichen "X von 30"-Zähler.
 * Endpunkte: GET /preregistrations · POST /preregistrations/:id/status (requireStaff + Audit).
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { sccApi } from "@scc/api/client";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { fmtDate, fmtDateShort } from "@scc/utils/format";

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

function statusPill(status: string) {
  const tone = STATUS_TONE[status];
  return <span className={`scc-pill${tone ? ` scc-pill--${tone}` : ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export default function Preregistrations() {
  const toast = useToast();
  const [rows, setRows] = useState<PreregRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // selected wird aus rows abgeleitet → nach Statuswechsel automatisch frisch;
  // verlässt der Eintrag den aktiven Filter, fällt die Ansicht sauber zur Liste zurück.
  const selected = rows.find((r) => r.id === selectedId) || null;

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

  // ── Detailansicht ───────────────────────────────────────
  function PreregDetail({ p }: { p: PreregRow }) {
    const info: Array<[string, ReactNode]> = [
      ["Status", statusPill(p.status)],
      ["Seite", SIDE_LABEL[p.side] ?? p.side],
      ["Branche", p.sector ? (SECTOR_LABEL[p.sector] ?? p.sector) : "–"],
      ["Größe", p.company_size || "–"],
      ["Einsatzort Hamburg bestätigt", p.einsatzort_confirmed ? "Ja" : "Nein"],
      ["Opt-in bestätigt", p.consent_at ? `Ja · ${fmtDateShort(p.consent_at)}` : "Noch offen"],
      ["Eingegangen", fmtDate(p.created_at)],
      ["Quelle", p.source || "–"],
      ["Empfohlen von", p.referred_by || "–"],
    ];

    return (
      <div>
        <button className="scc-btn" onClick={() => setSelectedId(null)} style={{ marginBottom: 14 }}>← Zurück zur Liste</button>

        <div className="scc-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
                Voranmeldung · {p.id.slice(0, 8)}…
              </div>
              <h2 style={{ margin: "4px 0", fontSize: 18 }}>{p.org_name}</h2>
            </div>
            {statusPill(p.status)}
          </div>

          {/* Kontakt — prominent fuer Telefon-Outreach */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontSize: 14 }}>
            <div><span style={{ color: "var(--scc-muted)" }}>Kontakt:</span> {p.contact_name}</div>
            <div><a href={`mailto:${p.email}`}>{p.email}</a></div>
            {p.phone && <div><a href={`tel:${p.phone}`} style={{ fontWeight: 700 }}>{p.phone}</a> <span style={{ color: "var(--scc-muted)" }}>(anrufen)</span></div>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px 24px", marginTop: 14 }}>
            {info.map(([k, v]) => (
              <div key={k} style={{ fontSize: 13 }}>
                <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>{k}</div>
                <div style={{ marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {p.capacity_or_need && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>Bedarf / Kapazität</div>
              <div style={{ marginTop: 2, fontSize: 13, whiteSpace: "pre-wrap" }}>{p.capacity_or_need}</div>
            </div>
          )}
          {p.message && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>Nachricht</div>
              <div style={{ marginTop: 2, fontSize: 13, whiteSpace: "pre-wrap" }}>{p.message}</div>
            </div>
          )}
        </div>

        {/* ── Kuratierung ─────────────────────────────── */}
        <div className="scc-card">
          <div className="scc-card__eyebrow">Kuratierung</div>
          <div style={{ fontSize: 12, color: "var(--scc-muted)", margin: "4px 0 14px" }}>
            Status-Wechsel werden auditiert und sind reversibel. „Akzeptiert" belegt einen der 30 Plätze dieser Seite.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {NEXT_ACTIONS.filter((a) => a.key !== p.status).map((a) => (
              <button
                key={a.key}
                className={`scc-btn${a.key === "accepted" ? " scc-btn--primary" : ""}`}
                onClick={() => void setStatusFor(p, a.key)}
              >{a.label}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="scc-prereg-title">
      <PageHeader
        id="scc-prereg-title"
        title="Pilot-Voranmeldungen"
        subtitle="Bewerbungen vom One-Pager kuratieren — auf Passung, nicht auf Reihenfolge. Telefon für den Outreach sichtbar."
        actions={<button className="scc-btn" onClick={() => void load()}>Neu laden</button>}
      />

      {selected ? (
        <PreregDetail p={selected} />
      ) : (
        <>
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
                <tr><th>Organisation</th><th>Seite</th><th>Branche</th><th>Kontakt</th><th>Einsatzort</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)} style={{ cursor: "pointer" }}>
                    <td>
                      <div>{p.org_name}</div>
                      <div style={{ fontSize: 10, color: "var(--scc-muted)" }}>{p.company_size || ""} · {fmtDateShort(p.created_at)}</div>
                    </td>
                    <td>{SIDE_LABEL[p.side] ?? p.side}</td>
                    <td>{p.sector ? (SECTOR_LABEL[p.sector] ?? p.sector) : "–"}</td>
                    <td style={{ fontSize: 12 }}>
                      <div>{p.contact_name}</div>
                      {p.phone && <div style={{ fontWeight: 600 }}>{p.phone}</div>}
                    </td>
                    <td>{p.einsatzort_confirmed ? <span className="scc-pill scc-pill--live">Hamburg ✓</span> : <span className="scc-pill">offen</span>}</td>
                    <td>{statusPill(p.status)}</td>
                    <td><button className="scc-btn scc-btn--primary" onClick={(e) => { e.stopPropagation(); setSelectedId(p.id); }}>Öffnen →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
