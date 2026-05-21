import { useState } from "react";
import { useSccQuery } from "@scc/hooks/useSccQuery";
import { sccApi } from "@scc/api/client";
import { fmtNum } from "@scc/utils/format";

interface ExplorerView {
  key: string;
  description: string;
}

interface ExplorerListData {
  views: ExplorerView[];
}

interface ExplorerResult {
  description: string;
  rowCount: number;
  rows: unknown[];
}

export default function DataExplorer() {
  const { data, loading, error, reload } = useSccQuery<ExplorerListData>("/data-explorer");
  const [result, setResult]   = useState<ExplorerResult | null>(null);
  const [runErr, setRunErr]   = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  if (loading) return <div className="scc-loading">Lade Data Explorer…</div>;
  if (error)   return <div className="scc-error-inline">Fehler: {error} <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button></div>;

  const views = data?.views ?? [];

  const runView = async (key: string) => {
    setRunning(key);
    setRunErr(null);
    setResult(null);
    try {
      const r = await sccApi.get(`/data-explorer/${encodeURIComponent(key)}`);
      setResult(r as ExplorerResult);
    } catch (e: unknown) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div>
      <div className="scc-section__header">
        <h1 className="scc-section__title">Data Explorer</h1>
        <div className="scc-section__sub">Vordefinierte Views. Kein freies SQL.</div>
      </div>

      <table className="scc-table">
        <thead>
          <tr><th>Key</th><th>Beschreibung</th><th /></tr>
        </thead>
        <tbody>
          {views.length === 0
            ? <tr><td colSpan={3} className="scc-muted">Keine Views verfügbar.</td></tr>
            : views.map((v) => (
                <tr key={v.key}>
                  <td><span className="scc-code">{v.key}</span></td>
                  <td>{v.description}</td>
                  <td>
                    <button
                      className="scc-btn"
                      disabled={running === v.key}
                      onClick={() => runView(v.key)}
                    >
                      {running === v.key ? "…" : "Ausführen"}
                    </button>
                  </td>
                </tr>
              ))
          }
        </tbody>
      </table>

      {runErr && (
        <div className="scc-error-inline" style={{ marginTop: 16 }}>{runErr}</div>
      )}

      {result && (
        <div style={{ marginTop: 18 }}>
          <div className="scc-muted">
            {result.description} ({fmtNum(result.rowCount ?? 0)} Zeilen)
          </div>
          <pre className="scc-code" style={{ display: "block", whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12 }}>
            {JSON.stringify(result.rows, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
