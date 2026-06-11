/**
 * DocumentVault — Monitoring des Dokumenten-Tresors (org-uebergreifend, read-only).
 * Zeigt, dass die Auto-Ablage plattform-generierter Dokumente (Rechnungen, Vertraege,
 * Abo-Dokumente, Compliance, DSGVO) laeuft — "streng reguliert" sichtbar gemacht.
 */

import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtDate, fmtNum } from "@scc/utils/format";

interface VaultDoc {
  id: string;
  org_id: string | null;
  org_name: string | null;
  document_type: string;
  content_category: string;
  title: string;
  source: string;
  source_ref: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

interface VaultData {
  totals: { total: number; last_24h: number; last_7d: number; auto_ingested: number; total_bytes: number };
  counts_by_source: Record<string, number>;
  counts_by_type: Record<string, number>;
  recent: VaultDoc[];
}

const TYPE_LABELS: Record<string, string> = {
  invoice: "Rechnung", contract: "Vertrag", policy: "Richtlinie",
  certificate: "Zertifikat", report: "Bericht", correspondence: "Korrespondenz", other: "Sonstiges",
};

const SOURCE_LABELS: Record<string, string> = {
  upload: "Manueller Upload", invoice: "Rechnungslauf", system: "System (Auto-Ablage)",
};

function fmtBytes(b: number): string {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function DocumentVault() {
  const { data, loading, error, reload } = useSccQuery<VaultData>("/document-vault/overview");

  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">Dokumenten-Tresor</h1>
          <div className="scc-section__sub">
            Auto-Ablage aller plattform-generierten Dokumente — Rechnungen, Vertraege, Abo-Dokumente, Compliance, DSGVO. Org-uebergreifendes Monitoring.
          </div>
        </div>
        <button className="scc-btn" onClick={reload} aria-label="Reload">↺ Reload</button>
      </div>

      {loading && <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>}
      {error && <div className="scc-error-inline">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="scc-grid" style={{ marginBottom: 14 }}>
            {[
              ["Dokumente gesamt", fmtNum(data.totals.total)],
              ["Letzte 24h", fmtNum(data.totals.last_24h)],
              ["Letzte 7 Tage", fmtNum(data.totals.last_7d)],
              ["Auto-abgelegt", fmtNum(data.totals.auto_ingested)],
              ["Speicher", fmtBytes(data.totals.total_bytes)],
            ].map(([label, value]) => (
              <div className="scc-card" key={label}>
                <div className="scc-card__eyebrow">{label}</div>
                <div className="scc-card__value">{value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.entries(data.counts_by_source).map(([src, n]) => (
              <span key={src} className={`scc-pill${src !== "upload" ? " scc-pill--live" : ""}`}>
                {SOURCE_LABELS[src] ?? src}: {n}
              </span>
            ))}
            {Object.entries(data.counts_by_type).map(([t, n]) => (
              <span key={t} className="scc-pill">{TYPE_LABELS[t] ?? t}: {n}</span>
            ))}
          </div>

          {data.recent.length === 0 ? (
            <div className="scc-muted" style={{ padding: 10 }}>Noch keine Dokumente im Tresor.</div>
          ) : (
            <table className="scc-table">
              <thead>
                <tr><th>Org</th><th>Titel</th><th>Typ</th><th>Quelle</th><th>Groesse</th><th>Abgelegt</th></tr>
              </thead>
              <tbody>
                {data.recent.map((d) => (
                  <tr key={d.id}>
                    <td>{d.org_name ?? d.org_id ?? "–"}</td>
                    <td>{d.title}</td>
                    <td>{TYPE_LABELS[d.document_type] ?? d.document_type}</td>
                    <td>
                      <span className={`scc-pill${d.source !== "upload" ? " scc-pill--live" : ""}`}>
                        {SOURCE_LABELS[d.source] ?? d.source}
                      </span>
                    </td>
                    <td>{d.file_size_bytes ? fmtBytes(d.file_size_bytes) : "–"}</td>
                    <td>{fmtDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
