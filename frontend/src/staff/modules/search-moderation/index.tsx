/**
 * Suchmeldungen — geflaggte Suchanfragen (Faekal-/Vulgaersprache).
 * Die Plattform-Suche sortiert solche Anfragen aus (blockt) und meldet sie hierher.
 * Master-Detail: Liste → Detail mit vollem Kontext (Begriff, Schwere, Verursacher, Häufigkeit)
 * + Kuratierung (dismiss = harmlos / action = bestätigt-eskaliert) mit Step-up + Begründung + Audit.
 * Endpunkte: GET /search-moderation/flagged · POST /search-moderation/flagged/:id/resolve.
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { sccApi } from "@scc/api/client";
import { useConfirm } from "@scc/state/ConfirmContext";
import { useStepUp } from "@scc/state/StepUpContext";
import { useToast } from "@scc/state/ToastContext";
import { PageHeader } from "@scc/components/ui/PageHeader";
import { fmtDate, fmtDateShort } from "@scc/utils/format";

interface FlaggedRow {
  id: string;
  user_id: string | null;
  org_id: string | null;
  raw_query: string;
  severity: string;
  matched_terms: string[] | null;
  hit_count: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  ip: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  user_email: string | null;
  org_name: string | null;
}
interface Resp { items: FlaggedRow[]; total: number; limit: number; offset: number; }

const SEVERITY_LABEL: Record<string, string> = { low: "Gering", medium: "Mittel", high: "Hoch", critical: "Kritisch" };
const SEVERITY_TONE: Record<string, string> = { medium: "warn", high: "danger", critical: "danger" };
const STATUS_LABEL: Record<string, string> = { open: "Offen", dismissed: "Verworfen", actioned: "Bestätigt" };
const STATUS_TONE: Record<string, string> = { open: "warn", actioned: "danger" };

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "open", label: "Offen" },
  { key: "dismissed", label: "Verworfen" },
  { key: "actioned", label: "Bestätigt" },
  { key: "", label: "Alle" },
];

function severityPill(sev: string) {
  const tone = SEVERITY_TONE[sev];
  return <span className={`scc-pill${tone ? ` scc-pill--${tone}` : ""}`}>{SEVERITY_LABEL[sev] ?? sev}</span>;
}
function statusPill(status: string) {
  const tone = STATUS_TONE[status];
  return <span className={`scc-pill${tone ? ` scc-pill--${tone}` : ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export default function SearchModeration() {
  const confirm = useConfirm();
  const stepUp = useStepUp();
  const toast = useToast();
  const [rows, setRows] = useState<FlaggedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const d = await sccApi.get<Resp>("/search-moderation/flagged" + qs);
      setRows(d.items ?? []); setTotal(d.total ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  // selected aus rows abgeleitet → nach jeder Aktion frisch; verlässt der Eintrag den Filter, fällt die Ansicht zur Liste.
  const selected = rows.find((r) => r.id === selectedId) || null;

  const doResolve = (r: FlaggedRow, action: "dismiss" | "action") => {
    const isAction = action === "action";
    confirm({
      title: isAction ? "Als bestätigt markieren" : "Als harmlos verwerfen",
      hint: isAction
        ? `Markiert die geflaggte Suche „${r.raw_query}" als bestätigten Verstoß (eskaliert). Wird auditiert.`
        : `Markiert die Meldung zu „${r.raw_query}" als harmlos/Fehlalarm. Wird auditiert.`,
      dangerLabel: isAction ? "Bestätigen" : undefined,
      onConfirm: async (reason: string) => {
        await stepUp();
        await sccApi.post(`/search-moderation/flagged/${encodeURIComponent(r.id)}/resolve`, { confirmed: true, reason, action });
        toast.success(isAction ? "Als bestätigt markiert." : "Als harmlos verworfen.");
        await load();
      },
    });
  };

  const openCount = rows.filter((r) => r.status === "open").length;

  // ── Detailansicht ───────────────────────────────────────
  function FlagDetail({ r }: { r: FlaggedRow }) {
    const isOpen = r.status === "open";
    const info: Array<[string, ReactNode]> = [
      ["Status", statusPill(r.status)],
      ["Schweregrad", severityPill(r.severity)],
      ["Häufigkeit", `${r.hit_count}×`],
      ["Verursacher", r.user_email || (r.user_id ? `${r.user_id.slice(0, 8)}…` : "–")],
      ["Organisation", r.org_name || "–"],
      ["Erstmals", fmtDate(r.first_seen_at)],
      ["Zuletzt", fmtDate(r.last_seen_at)],
      ["IP", r.ip || "–"],
      ["Geprüft am", r.reviewed_at ? fmtDate(r.reviewed_at) : "–"],
    ];
    const terms = r.matched_terms ?? [];

    return (
      <div>
        <button className="scc-btn" onClick={() => setSelectedId(null)} style={{ marginBottom: 14 }}>← Zurück zur Liste</button>

        <div className="scc-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--scc-muted)" }}>
                Geflaggte Suchanfrage · {r.id.slice(0, 8)}…
              </div>
              <h2 style={{ margin: "4px 0", fontSize: 18, wordBreak: "break-word" }}>„{r.raw_query}"</h2>
            </div>
            {severityPill(r.severity)}
          </div>

          {terms.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {terms.map((t, i) => (
                <span key={i} className="scc-pill scc-pill--danger" style={{ fontSize: 11 }}>{t}</span>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px 24px", marginTop: 14 }}>
            {info.map(([k, v]) => (
              <div key={k} style={{ fontSize: 13 }}>
                <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>{k}</div>
                <div style={{ marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {r.resolution_note && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: "var(--scc-muted)" }}>Begründung der Prüfung</div>
              <div style={{ marginTop: 2, fontSize: 13, whiteSpace: "pre-wrap" }}>{r.resolution_note}</div>
            </div>
          )}
        </div>

        {/* ── Kuratierung ─────────────────────────────── */}
        <div className="scc-card">
          <div className="scc-card__eyebrow">Kuratierung</div>
          <div style={{ fontSize: 12, color: "var(--scc-muted)", margin: "4px 0 14px" }}>
            Jede Aktion erfordert Step-up + Begründung und wird auditiert. Die Suche selbst hat die Anfrage
            bereits blockiert — hier wird nur der Moderations-Fall abgeschlossen.
          </div>
          {isOpen ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="scc-btn scc-btn--primary" onClick={() => doResolve(r, "action")}>Verstoß bestätigen</button>
              <button className="scc-btn" onClick={() => doResolve(r, "dismiss")}>Als harmlos verwerfen</button>
            </div>
          ) : (
            <span className="scc-muted" style={{ fontSize: 13 }}>Fall abgeschlossen ({STATUS_LABEL[r.status] ?? r.status}).</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="scc-searchmod-title">
      <PageHeader
        id="scc-searchmod-title"
        title="Suchmeldungen"
        subtitle={`Aussortierte Suchanfragen (Fäkal-/Vulgärsprache) · ${openCount} offen in dieser Ansicht · ${total} gesamt`}
        actions={<button className="scc-btn" onClick={() => void load()}>Neu laden</button>}
      />

      {selected ? (
        <FlagDetail r={selected} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`scc-btn${status === f.key ? " scc-btn--primary" : ""}`}
                onClick={() => setStatus(f.key)}
              >{f.label}</button>
            ))}
          </div>

          {loading ? (
            <div className="scc-muted">Lade Meldungen…</div>
          ) : err ? (
            <div className="scc-error-inline">{err}</div>
          ) : rows.length === 0 ? (
            <div className="scc-muted">Keine Meldungen in dieser Ansicht.</div>
          ) : (
            <table className="scc-table">
              <thead>
                <tr><th>Begriff</th><th>Schwere</th><th>Treffer</th><th>Verursacher</th><th>Organisation</th><th>Zuletzt</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ cursor: "pointer" }}>
                    <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>„{r.raw_query}"</td>
                    <td>{severityPill(r.severity)}</td>
                    <td>{r.hit_count}×</td>
                    <td>{r.user_email || (r.user_id ? `${r.user_id.slice(0, 8)}…` : "–")}</td>
                    <td>{r.org_name || "–"}</td>
                    <td>{fmtDateShort(r.last_seen_at)}</td>
                    <td>{statusPill(r.status)}</td>
                    <td><button className="scc-btn scc-btn--primary" onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}>Prüfen →</button></td>
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
