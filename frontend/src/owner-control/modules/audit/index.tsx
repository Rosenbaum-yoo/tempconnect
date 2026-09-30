import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type { OccAuditFeed, OccAuditItem, OccAccessAudit } from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Filter-State ───────────────────────────────────────────────────────────────

type FilterArea = "" | "infrastructure" | "decisions" | "commercial" | "support" | "platform" | "warp" | "automation";
type FilterRiskLevel = "" | "critical" | "high" | "medium" | "low";

interface Filters {
  area: FilterArea;
  risk_level: FilterRiskLevel;
  decisions_only: boolean;
  search: string;
}

// ── Load State ─────────────────────────────────────────────────────────────────

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; feed: OccAuditFeed };

// ── Audit-Eintrag ──────────────────────────────────────────────────────────────

function AuditRow({ item }: { item: OccAuditItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = item.details && Object.keys(item.details).length > 0;

  return (
    <>
      <tr
        style={{ borderBottom: expanded ? "none" : "1px solid var(--occ-line)", cursor: hasDetails ? "pointer" : "default" }}
        onClick={() => { if (hasDetails) setExpanded((e) => !e); }}
      >
        <td style={{ padding: "10px 12px", color: "var(--occ-text-2)", fontSize: "11px", whiteSpace: "nowrap" }}>
          {fmtDate(item.created_at)}
        </td>
        <td style={{ padding: "10px 12px", fontSize: "12px" }}>
          <span
            style={{
              fontFamily: "monospace",
              background: "var(--occ-panel)",
              borderRadius: "3px",
              padding: "2px 6px",
              fontSize: "11px",
              color: "var(--occ-accent)",
            }}
          >
            {item.action}
          </span>
        </td>
        <td style={{ padding: "10px 12px", color: "var(--occ-text-2)", fontSize: "12px" }}>
          {item.entity_type ?? "–"}
          {item.entity_id && (
            <div style={{ fontSize: "10px", color: "var(--occ-muted)", fontFamily: "monospace" }}>
              {item.entity_id.slice(0, 12)}…
            </div>
          )}
        </td>
        <td style={{ padding: "10px 12px", color: "var(--occ-text-2)", fontSize: "12px" }}>
          {item.actor_email ?? item.actor_id?.slice(0, 8) ?? "–"}
        </td>
        <td style={{ padding: "10px 12px", color: "var(--occ-text-2)", fontSize: "12px" }}>
          {item.status ?? "–"}
        </td>
        <td style={{ padding: "10px 12px" }}>
          {hasDetails && (
            <span style={{ fontSize: "11px", color: "var(--occ-accent)" }}>
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
          <td colSpan={6} style={{ padding: "0 12px 12px 24px" }}>
            <pre
              style={{
                fontSize: "11px",
                color: "var(--occ-text-2)",
                background: "var(--occ-panel)",
                borderRadius: "4px",
                padding: "8px",
                overflowX: "auto",
                maxHeight: "200px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
              }}
            >
              {JSON.stringify(item.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Filter-Bar ─────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  onSearch: () => void;
}

function FilterBar({ filters, onChange, onSearch }: FilterBarProps) {
  const selectStyle = {
    padding: "6px 8px",
    background: "var(--occ-panel)",
    border: "1px solid var(--occ-line)",
    borderRadius: "5px",
    color: "var(--occ-text)",
    fontSize: "12px",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: "16px",
      }}
    >
      {/* Bereich-Filter */}
      <select
        value={filters.area}
        onChange={(e) => onChange({ ...filters, area: e.target.value as FilterArea })}
        style={selectStyle}
      >
        <option value="">Alle Bereiche</option>
        <option value="infrastructure">Infrastructure</option>
        <option value="decisions">Decisions</option>
        <option value="commercial">Commercial</option>
        <option value="support">Support</option>
        <option value="platform">Platform</option>
        <option value="warp">Warp</option>
        <option value="automation">Automation</option>
      </select>

      {/* Risiko-Filter */}
      <select
        value={filters.risk_level}
        onChange={(e) => onChange({ ...filters, risk_level: e.target.value as FilterRiskLevel })}
        style={selectStyle}
      >
        <option value="">Alle Risiko-Level</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {/* Decisions-Only */}
      <label
        style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={filters.decisions_only}
          onChange={(e) => onChange({ ...filters, decisions_only: e.target.checked })}
          style={{ accentColor: "var(--occ-accent)" }}
        />
        Nur Entscheidungen
      </label>

      {/* Suche */}
      <div style={{ display: "flex", gap: "6px", flex: "1", minWidth: "200px" }}>
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
          placeholder="Aktion / E-Mail suchen…"
          style={{
            ...selectStyle,
            flex: 1,
            outline: "none",
          }}
        />
        <button
          onClick={onSearch}
          style={{
            padding: "6px 12px",
            background: "var(--occ-accent)",
            border: "none",
            borderRadius: "5px",
            color: "#fff",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Suchen
        </button>
      </div>
    </div>
  );
}

// ── Haupt-Modul ────────────────────────────────────────────────────────────────

// ── Zugangs-Nachweis ───────────────────────────────────────────────────────────
//
// BEFUND 2026-08-26: `owner_control_access_audit` wurde beschrieben und von
// nirgends gelesen. In der laufenden Datenbank standen 25 Zeilen, darunter
// 23 abgewiesene Zugriffsversuche zwischen dem 20.05. und dem 21.07. — und
// niemand konnte sie sehen.
//
// Getrennt vom Feed daneben, weil beide verschiedene Fragen beantworten: der
// Feed sagt, WAS die Eigentuemer getan haben; diese Liste sagt, WER hereinkam
// oder abgewiesen wurde. Die Abweisungen stehen nur hier — dabei entsteht ja
// keine Sitzung, die etwas tun koennte.

const AKTION_TEXT: Record<string, string> = {
  access_denied: "abgewiesen",
  grant: "Zugang erteilt",
  revoke: "Zugang entzogen",
  list: "Liste eingesehen",
};

function ZugangsProtokoll() {
  const [zustand, setZustand] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; daten: OccAccessAudit }
  >({ status: "loading" });
  const [nurAbweisungen, setNurAbweisungen] = useState(false);

  const laden = useCallback((nurAbw: boolean) => {
    setZustand({ status: "loading" });
    const qs = nurAbw ? "?action=access_denied" : "";
    occApi.get<OccAccessAudit>(`/audit/access${qs}`).then((res) => {
      if (res.success) setZustand({ status: "ready", daten: res.data });
      else setZustand({ status: "error", message: res.error.message ?? `Fehler: ${res.error.code}` });
    }).catch(() => {
      setZustand({ status: "error", message: "Netzwerkfehler beim Laden des Zugangs-Nachweises." });
    });
  }, []);

  useEffect(() => { laden(nurAbweisungen); }, [nurAbweisungen, laden]);

  return (
    <div style={{ marginTop: "32px" }}>
      <p className="occ-section-title" style={{ marginBottom: "4px" }}>Zugang zum Owner Control Center</p>
      <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--ds-text-muted, #6b7280)" }}>
        Wer hereinkam — und wer abgewiesen wurde. Abweisungen erzeugen keine Sitzung
        und tauchen deshalb im Audit-Feed darueber nicht auf.
      </p>

      {zustand.status === "loading" && <p style={{ fontSize: "13px" }}>Wird geladen …</p>}

      {zustand.status === "error" && (
        <p style={{ fontSize: "13px", color: "var(--ds-danger, #b91c1c)" }}>{zustand.message}</p>
      )}

      {zustand.status === "ready" && (
        <>
          <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "13px",
                padding: "4px 10px",
                borderRadius: "999px",
                background: zustand.daten.abgewiesen > 0 ? "rgba(185,28,28,.08)" : "rgba(107,114,128,.08)",
                color: zustand.daten.abgewiesen > 0 ? "var(--ds-danger, #b91c1c)" : "inherit",
              }}
            >
              {zustand.daten.abgewiesen} Abweisung{zustand.daten.abgewiesen === 1 ? "" : "en"}
            </span>
            <span style={{ fontSize: "13px", color: "var(--ds-text-muted, #6b7280)" }}>
              {zustand.daten.total} Eintr{zustand.daten.total === 1 ? "ag" : "aege"} insgesamt
            </span>
            <label style={{ fontSize: "13px", display: "flex", gap: "6px", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={nurAbweisungen}
                onChange={(e) => setNurAbweisungen(e.target.checked)}
              />
              nur Abweisungen
            </label>
          </div>

          {zustand.daten.items.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--ds-text-muted, #6b7280)" }}>
              {nurAbweisungen
                ? "Keine abgewiesenen Zugriffsversuche."
                : "Noch keine Zugangs-Ereignisse aufgezeichnet."}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ds-border, #e5e7eb)" }}>
                  <th style={{ padding: "6px 8px" }}>Zeitpunkt</th>
                  <th style={{ padding: "6px 8px" }}>Vorgang</th>
                  <th style={{ padding: "6px 8px" }}>Betroffen</th>
                  <th style={{ padding: "6px 8px" }}>Ausgeloest von</th>
                  <th style={{ padding: "6px 8px" }}>Notiz</th>
                </tr>
              </thead>
              <tbody>
                {zustand.daten.items.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--ds-border, #f3f4f6)" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{fmtDate(e.created_at)}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ color: e.action === "access_denied" ? "var(--ds-danger, #b91c1c)" : "inherit" }}>
                        {AKTION_TEXT[e.action] ?? e.action}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{e.user_email ?? e.user_id ?? "–"}</td>
                    <td style={{ padding: "6px 8px" }}>{e.performed_by_email ?? e.performed_by ?? "–"}</td>
                    <td style={{ padding: "6px 8px" }}>{e.note ?? "–"}</td>
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

export function AuditModule() {
  const [filters, setFilters] = useState<Filters>({
    area: "",
    risk_level: "",
    decisions_only: false,
    search: "",
  });
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback((f: Filters) => {
    setState({ status: "loading" });

    const params = new URLSearchParams();
    if (f.area) params.set("area", f.area);
    if (f.risk_level) params.set("risk_level", f.risk_level);
    if (f.decisions_only) params.set("decisions_only", "true");
    if (f.search.trim()) params.set("search", f.search.trim());

    const qs = params.toString() ? `?${params.toString()}` : "";
    occApi.get<OccAuditFeed>(`/audit/feed${qs}`).then((res) => {
      if (res.success) {
        setState({ status: "ready", feed: res.data });
      } else {
        setState({ status: "error", message: res.error.message ?? `Fehler: ${res.error.code}` });
      }
    }).catch(() => {
      setState({ status: "error", message: "Netzwerkfehler beim Laden des Audit-Feeds." });
    });
  }, []);

  useEffect(() => { load(filters); }, []);

  return (
    <AppShell pageTitle="Audit &amp; Decisions">
      <div style={{ maxWidth: "1100px" }}>
        <p className="occ-section-title" style={{ marginBottom: "12px" }}>Audit-Feed</p>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          onSearch={() => load(filters)}
        />

        {state.status === "loading" && (
          <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Audit-Feed…</div>
        )}

        {state.status === "error" && (
          <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
        )}

        {state.status === "ready" && state.feed.items.length === 0 && (
          <div className="occ-panel" style={{ textAlign: "center", padding: "32px" }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Keine Audit-Einträge</div>
            <div style={{ fontSize: "12px", color: "var(--occ-text-2)" }}>
              Passen Sie die Filter an oder warten Sie auf neue OCC-Aktivitäten.
            </div>
          </div>
        )}

        {state.status === "ready" && state.feed.items.length > 0 && (
          <>
            <div className="occ-panel" style={{ overflowX: "auto", marginBottom: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    {["Zeitpunkt", "Aktion", "Entity", "Akteur", "Status", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          color: "var(--occ-text-2)",
                          fontWeight: 600,
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.feed.items.map((item) => (
                    <AuditRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination-Info */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
                color: "var(--occ-text-2)",
              }}
            >
              <span>
                {state.feed.total} Eintr{state.feed.total !== 1 ? "äge" : "ag"} gesamt
                {state.feed.has_more && " — weitere vorhanden"}
              </span>
              {state.feed.has_more && (
                <button
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (filters.area) params.set("area", filters.area);
                    if (filters.risk_level) params.set("risk_level", filters.risk_level);
                    if (filters.decisions_only) params.set("decisions_only", "true");
                    if (filters.search.trim()) params.set("search", filters.search.trim());
                    params.set("page", String(state.feed.page + 1));
                    params.set("per_page", String(state.feed.per_page));
                    // Einfache Lösung: Filter neu laden mit mehr Einträgen
                    occApi.get<OccAuditFeed>(`/audit/feed?${params.toString()}&per_page=${state.feed.per_page * 2}`).then((res) => {
                      if (res.success) setState({ status: "ready", feed: res.data });
                    });
                  }}
                  style={{
                    padding: "4px 10px",
                    background: "transparent",
                    border: "1px solid var(--occ-line)",
                    borderRadius: "4px",
                    color: "var(--occ-text-2)",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  Mehr laden
                </button>
              )}
            </div>
          </>
        )}

        {/* Der Zugangs-Nachweis. Unter dem Feed, weil er die seltenere Frage
            beantwortet — aber in derselben Flaeche, weil "wer war drin" und
            "was wurde getan" zusammen gelesen werden. */}
        <ZugangsProtokoll />
      </div>
    </AppShell>
  );
}
