/**
 * DataGovernance — DSGVO im Staff-Center.
 * Org-uebergreifende Read-Only-Sicht auf alle data_governance_requests (Auskunft,
 * Loeschung, Anonymisierung) + CSV-Download ("alle DSGVO-Sachen runterziehen").
 * Staff laeuft in eigenem Auth-Kontext (/staff/api) — daher eigene Endpoints.
 */

import { useSccQuery } from "@scc/hooks/useSccQuery";
import { fmtDate } from "@scc/utils/format";

interface DgRequest {
  id: string;
  org_id: string | null;
  request_type: string;
  subject_type: string;
  subject_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  org_name: string | null;
  requester_email: string | null;
}

interface DgData {
  requests: DgRequest[];
  total: number;
  counts: Record<string, number>;
}

const TYPE_LABELS: Record<string, string> = {
  export: "Auskunft/Export (Art. 15/20)",
  deletion: "Loeschung (Art. 17)",
  anonymization: "Anonymisierung",
  retention_review: "Aufbewahrungs-Review",
  inquiry: "Anfrage",
};

const STATUS_PILL: Record<string, string> = {
  pending: "warn",
  in_progress: "warn",
  completed: "live",
  rejected: "danger",
  cancelled: "stub",
};

const STATUS_CARDS = ["pending", "in_progress", "completed", "rejected", "cancelled"] as const;

export default function DataGovernance() {
  const { data, loading, error, reload } = useSccQuery<DgData>("/data-governance/requests");

  return (
    <div>
      <div className="scc-section__header">
        <div>
          <h1 className="scc-section__title">DSGVO Data Governance</h1>
          <div className="scc-section__sub">
            Alle DSGVO-Anfragen org-uebergreifend — Auskunft, Loeschung, Anonymisierung. Read-only Staff-Sicht.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="scc-btn" onClick={reload} aria-label="Reload">↺ Reload</button>
          <button
            className="scc-btn scc-btn--primary"
            onClick={() => window.open("/staff/api/data-governance/requests.csv", "_blank", "noopener")}
          >
            CSV herunterladen
          </button>
        </div>
      </div>

      {loading && <div className="scc-muted" style={{ padding: 10 }}>Lade…</div>}
      {error && <div className="scc-error-inline">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="scc-grid" style={{ marginBottom: 14 }}>
            {STATUS_CARDS.map((s) => (
              <div className="scc-card" key={s}>
                <div className="scc-card__eyebrow">{s}</div>
                <div className="scc-card__value">{data.counts?.[s] ?? 0}</div>
              </div>
            ))}
          </div>

          {data.requests.length === 0 ? (
            <div className="scc-muted" style={{ padding: 10 }}>Keine DSGVO-Anfragen vorhanden.</div>
          ) : (
            <table className="scc-table">
              <thead>
                <tr>
                  <th>Org</th><th>Typ</th><th>Subjekt</th><th>Status</th>
                  <th>Anforderer</th><th>Erstellt</th><th>Abgeschlossen</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.map((r) => {
                  const pill = STATUS_PILL[r.status];
                  return (
                    <tr key={r.id}>
                      <td>{r.org_name ?? r.org_id ?? "–"}</td>
                      <td>{TYPE_LABELS[r.request_type] ?? r.request_type}</td>
                      <td>{r.subject_type}</td>
                      <td>
                        <span className={`scc-pill${pill ? ` scc-pill--${pill}` : ""}`}>{r.status}</span>
                      </td>
                      <td>{r.requester_email ?? "–"}</td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>{r.completed_at ? fmtDate(r.completed_at) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
