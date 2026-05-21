import { useState, useRef } from "react";
import { sccApi } from "@scc/api/client";
import { fmtDate, riskTone } from "@scc/utils/format";

interface AuditRow {
  created_at: string;
  area: string;
  action: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  risk_level: string;
  status: string;
  reason: string | null;
}

interface AuditResponse {
  items: AuditRow[];
}

function statusTone(s: string) {
  if (s === "ok")      return "ok";
  if (s === "partial") return "warn";
  return "danger";
}

export default function AuditReport() {
  const [area,   setArea]   = useState("");
  const [action, setAction] = useState("");
  const [actor,  setActor]  = useState("");
  const [entity, setEntity] = useState("");
  const [risk,   setRisk]   = useState("");
  const [since,  setSince]  = useState("");
  const [until,  setUntil]  = useState("");

  const [rows,    setRows]    = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const apply = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr(null);

    const qs: string[] = ["limit=200"];
    if (area)   qs.push("area="       + encodeURIComponent(area));
    if (action) qs.push("action="     + encodeURIComponent(action));
    if (actor)  qs.push("actor_id="   + encodeURIComponent(actor));
    if (entity) qs.push("entity_id="  + encodeURIComponent(entity));
    if (risk)   qs.push("risk_level=" + encodeURIComponent(risk));
    if (since)  qs.push("since="      + encodeURIComponent(since));
    if (until)  qs.push("until="      + encodeURIComponent(until));

    try {
      const resp = await sccApi.get(`/audit?${qs.join("&")}`) as AuditResponse;
      if (!ctrl.signal.aborted) {
        setRows(resp.items ?? []);
        setApplied(true);
      }
    } catch (e: unknown) {
      if (!ctrl.signal.aborted) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const reset = () => {
    setArea(""); setAction(""); setActor(""); setEntity("");
    setRisk(""); setSince(""); setUntil("");
    setRows([]); setApplied(false); setErr(null);
  };

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Audit Report</h1>
        <div className="scc-section__sub">Filterbarer Audit über staff_control_audit_log.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, margin: "10px 0" }}>
        <input
          placeholder="Bereich (z.B. customer_requests)"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
        <input
          placeholder="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <input
          placeholder="Actor-User-ID"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        />
        <input
          placeholder="Entity-ID (Request)"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        />
        <select value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="">alle Risk-Levels</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        <button className="scc-btn" onClick={apply} disabled={loading}>
          {loading ? "Lädt…" : "Filter anwenden"}
        </button>
        <button className="scc-btn" onClick={reset}>Reset</button>
      </div>

      {err && <div className="scc-error-inline">{err}</div>}

      {!applied && !loading && (
        <div className="scc-muted">Bitte Filter setzen und anwenden.</div>
      )}

      {applied && rows.length === 0 && !loading && (
        <div className="scc-muted">Keine Einträge im Filter.</div>
      )}

      {rows.length > 0 && (
        <table className="scc-table">
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Bereich</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Entity</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.created_at)}</td>
                <td>{r.area}</td>
                <td><span className="scc-code">{r.action}</span></td>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>
                  {r.actor_id ? r.actor_id.slice(0, 8) : "–"}
                </td>
                <td>
                  {r.entity_type
                    ? `${r.entity_type}:${r.entity_id ?? ""}`
                    : "–"}
                </td>
                <td>
                  <span className={`scc-status scc-status--${riskTone(r.risk_level)}`}>
                    {r.risk_level}
                  </span>
                </td>
                <td>
                  <span className={`scc-status scc-status--${statusTone(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td
                  style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={r.reason ?? ""}
                >
                  {r.reason ?? "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
