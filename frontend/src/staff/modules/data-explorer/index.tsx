/**
 * DataExplorer — SCC WAVE 11
 *
 * Vordefinierte Read-Only Views aus staffControlService.DATA_EXPLORER_VIEWS.
 * Kein Ad-hoc-SQL.
 *
 * Upgrades gegenüber Stub:
 *   View-Karten statt Tabelle (Beschreibung sichtbar, aktive View highlighted)
 *   Ergebnis als echte Tabelle (Spalten auto-detect aus rows[0])
 *   Zell-Rendering: ISO-Datum → de-DE-Locale, null → "–", langer String → truncate
 *   Zeilen-Count-Badge · "Schließen"-Button
 *   Zero-State für leere Ergebnisse + Backend-Fehler-Block
 *   Security-Notice (Read-Only / Audit-Log)
 *
 * Backend:
 *   GET /data-explorer       → { views: [{ key, description }] }
 *   GET /data-explorer/:key  → { key, description, rowCount, rows, error? }
 */

import { useState } from "react";
import { useSccQuery } from "@scc/hooks/useSccQuery";
import { sccApi }      from "@scc/api/client";
import { fmtNum }      from "@scc/utils/format";

// ─── Types ────────────────────────────────────────────────────────

interface ExplorerView {
  key:         string;
  description: string;
}

interface ExplorerListData {
  views: ExplorerView[];
}

interface ExplorerResult {
  key:         string;
  description: string;
  rowCount:    number;
  rows:        Record<string, unknown>[];
  error?:      string;
}

// ─── Cell renderer ────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;
const MAX_CELL_LEN = 80;

function renderCell(val: unknown): string {
  if (val === null || val === undefined) return "–";
  if (typeof val === "boolean")          return val ? "ja" : "nein";
  if (typeof val === "object")           return JSON.stringify(val);
  const s = String(val);
  if (ISO_DATE_RE.test(s)) {
    try { return new Date(s).toLocaleString("de-DE"); } catch { /* fall through */ }
  }
  return s.length > MAX_CELL_LEN ? s.slice(0, MAX_CELL_LEN) + "…" : s;
}

// ─── Component ────────────────────────────────────────────────────

export default function DataExplorer() {
  const { data, loading, error, reload } = useSccQuery<ExplorerListData>("/data-explorer");
  const [result,  setResult]  = useState<ExplorerResult | null>(null);
  const [runErr,  setRunErr]  = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  // ─── Loading / Error ─────────────────────────────────────────
  if (loading) return <div className="scc-loading">Lade Data Explorer…</div>;
  if (error)   return (
    <div className="scc-error-inline">
      Fehler: {error}
      <button className="scc-btn" onClick={reload} style={{ marginLeft: 8 }}>Retry</button>
    </div>
  );

  const views = data?.views ?? [];

  // ─── Run view ────────────────────────────────────────────────

  const runView = async (key: string) => {
    setRunning(key);
    setRunErr(null);
    setResult(null);
    try {
      const r = await sccApi.get<ExplorerResult>(`/data-explorer/${encodeURIComponent(key)}`);
      setResult(r);
    } catch (e: unknown) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  // Result table columns (auto-detect from first row)
  const resultRows = result?.rows ?? [];
  const columns    = resultRows.length > 0 ? Object.keys(resultRows[0]) : [];

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="scc-section__header">
        <h1 className="scc-section__title">Data Explorer</h1>
        <div className="scc-section__sub">
          Vordefinierte Read-Only Views. Kein freies SQL.
        </div>
      </div>

      {/* ── Security Notice ──────────────────────────────────────── */}
      <div style={{
        padding: "8px 14px", marginBottom: 20, borderRadius: 6,
        border: "1px solid var(--scc-warn)", fontSize: 12,
        color: "var(--scc-warn)",
      }}>
        Nur vordefinierte Views — kein Ad-hoc-SQL. Alle Abfragen sind serverseitig auf
        zugelassene Datensätze beschränkt und werden im Staff-Audit-Log erfasst.
      </div>

      {/* ── View-Karten ──────────────────────────────────────────── */}
      {views.length === 0 ? (
        <div className="scc-empty-state" style={{ marginBottom: 24 }}>
          <div className="scc-empty-state__icon">○</div>
          <div className="scc-empty-state__text">Keine Views verfügbar.</div>
        </div>
      ) : (
        <div
          className="scc-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", marginBottom: 24 }}
        >
          {views.map((v) => {
            const isActive  = result?.key === v.key;
            const isRunning = running === v.key;
            return (
              <div
                key={v.key}
                className={`scc-card${isActive ? " scc-card--ok" : ""}`}
              >
                <div style={{ marginBottom: 6 }}>
                  <span className="scc-code" style={{ fontSize: 11 }}>{v.key}</span>
                </div>
                <div className="scc-muted" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
                  {v.description}
                </div>
                <button
                  className={`scc-btn${isActive ? " scc-btn--primary" : ""}`}
                  style={{ fontSize: 12, width: "100%" }}
                  disabled={isRunning}
                  onClick={() => { void runView(v.key); }}
                >
                  {isRunning ? "Lädt…" : isActive ? "↺ Neu laden" : "Ausführen"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Run Error ────────────────────────────────────────────── */}
      {runErr && (
        <div className="scc-error-inline" style={{ marginBottom: 16 }}>{runErr}</div>
      )}

      {/* ── Result Panel ──────────────────────────────────────────── */}
      {result && (
        <div>

          {/* Result header */}
          <div className="scc-section__header" style={{ marginTop: 0 }}>
            <h2 className="scc-section__title" style={{ fontSize: 14 }}>
              Ergebnis:{" "}
              <span className="scc-code" style={{ fontSize: 12 }}>{result.key}</span>
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                className={`scc-status scc-status--${result.rowCount > 0 ? "ok" : "warn"}`}
                style={{ fontSize: 11 }}
              >
                {fmtNum(result.rowCount)} Zeilen
              </span>
              <button
                className="scc-btn"
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => { setResult(null); setRunErr(null); }}
              >
                × Schließen
              </button>
            </div>
          </div>

          <div className="scc-muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {result.description}
          </div>

          {/* Backend reported an error for this view */}
          {result.error ? (
            <div className="scc-error-inline">{result.error}</div>
          ) : resultRows.length === 0 ? (
            <div className="scc-empty-state">
              <div className="scc-empty-state__icon">○</div>
              <div className="scc-empty-state__text">
                Dieser View hat keine Ergebnisse zurückgegeben.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="scc-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col} style={{ whiteSpace: "nowrap" }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map((row, ri) => (
                    <tr key={ri}>
                      {columns.map((col) => (
                        <td
                          key={col}
                          style={{
                            fontSize: 11,
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={String(row[col] ?? "")}
                        >
                          {renderCell(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
