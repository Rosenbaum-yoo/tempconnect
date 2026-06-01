import { useEffect, useState, useCallback, useRef } from "react";
import { AppShell } from "@occ/components/shell/AppShell";
import { occApi } from "@occ/api/client";
import type {
  OccDataUserList,
  OccDataOrgList,
  OccDataSubscriptionList,
  OccIntegrityChecks,
} from "@occ/types";

// ── Formatierung ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("de-DE");
}

// ── Tab-Typen ──────────────────────────────────────────────────────────────────

type Tab = "users" | "orgs" | "subscriptions" | "integrity";

// ── Sucheingabe-Komponente ─────────────────────────────────────────────────────

function SearchBar({ value, onChange, onSearch, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  placeholder: string;
}) {
  const inputStyle = {
    padding: "6px 10px",
    background: "var(--occ-panel)",
    border: "1px solid var(--occ-line)",
    borderRadius: "5px",
    color: "var(--occ-text)",
    fontSize: "12px",
    flex: 1,
    outline: "none",
  };

  return (
    <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
        placeholder={placeholder}
        style={inputStyle}
      />
      <button
        onClick={onSearch}
        style={{
          padding: "6px 14px",
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
  );
}

// ── Paginierungszeile ──────────────────────────────────────────────────────────

function PaginationBar({ total, page, perPage, hasMore, onLoadMore }: {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "11px", color: "var(--occ-text-2)" }}>
      <span>{fmtNum(total)} Einträge gesamt — Seite {page} ({perPage}/Seite)</span>
      {hasMore && (
        <button
          onClick={onLoadMore}
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
  );
}

// ── Sub-State-Typ ──────────────────────────────────────────────────────────────

type TabState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T; search: string; page: number };

// ── Users-Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<TabState<OccDataUserList>>({ status: "idle" });

  const load = useCallback((q: string, page = 1) => {
    setState({ status: "loading" });
    const params = new URLSearchParams({ page: String(page), per_page: "30" });
    if (q.trim()) params.set("search", q.trim());
    occApi.get<OccDataUserList>(`/data-explorer/users?${params.toString()}`).then((res) => {
      if (res.success) setState({ status: "ready", data: res.data, search: q, page });
      else setState({ status: "error", message: res.error.message ?? `Fehler: ${res.error.code}` });
    }).catch(() => setState({ status: "error", message: "Netzwerkfehler." }));
  }, []);

  useEffect(() => { load(""); }, []);

  return (
    <>
      <SearchBar value={search} onChange={setSearch} onSearch={() => load(search)} placeholder="E-Mail / Firmenname…" />

      {state.status === "loading" && (
        <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade…</div>
      )}
      {state.status === "error" && (
        <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>
      )}
      {state.status === "ready" && (
        <>
          <div className="occ-panel" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                  {["E-Mail", "Firma", "Plan", "Status", "Orgs", "Letzter Login", "Registriert"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--occ-text-2)", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "var(--occ-text-2)", fontSize: "12px" }}>
                      Keine Nutzer gefunden
                    </td>
                  </tr>
                ) : state.data.items.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    <td style={{ padding: "9px 12px", fontSize: "12px", fontFamily: "monospace" }}>{u.email}</td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{u.company_name ?? "–"}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--occ-panel-2)", borderRadius: "3px", padding: "2px 6px", color: "var(--occ-accent)" }}>
                        {u.plan}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: u.status === "active" ? "var(--occ-ok)" : "var(--occ-warn)" }}>
                      {u.status}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)", textAlign: "center" }}>{u.org_count}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{fmtDate(u.last_login_at)}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{fmtDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            total={state.data.total}
            page={state.data.page}
            perPage={state.data.per_page}
            hasMore={state.data.has_more}
            onLoadMore={() => load(state.search, state.page + 1)}
          />
        </>
      )}
    </>
  );
}

// ── Orgs-Tab ──────────────────────────────────────────────────────────────────

function OrgsTab() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<TabState<OccDataOrgList>>({ status: "idle" });

  const load = useCallback((q: string, page = 1) => {
    setState({ status: "loading" });
    const params = new URLSearchParams({ page: String(page), per_page: "30" });
    if (q.trim()) params.set("search", q.trim());
    occApi.get<OccDataOrgList>(`/data-explorer/organizations?${params.toString()}`).then((res) => {
      if (res.success) setState({ status: "ready", data: res.data, search: q, page });
      else setState({ status: "error", message: res.error.message ?? `Fehler: ${res.error.code}` });
    }).catch(() => setState({ status: "error", message: "Netzwerkfehler." }));
  }, []);

  useEffect(() => { load(""); }, []);

  return (
    <>
      <SearchBar value={search} onChange={setSearch} onSearch={() => load(search)} placeholder="Name / Slug…" />

      {state.status === "loading" && <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade…</div>}
      {state.status === "error" && <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>}
      {state.status === "ready" && (
        <>
          <div className="occ-panel" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                  {["Name", "Slug", "Typ", "Plan", "Status", "Mitglieder", "Abo aktiv", "Erstellt"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--occ-text-2)", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "var(--occ-text-2)", fontSize: "12px" }}>
                      Keine Organisationen gefunden
                    </td>
                  </tr>
                ) : state.data.items.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: "13px" }}>{o.name}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", fontFamily: "monospace", color: "var(--occ-text-2)" }}>{o.slug ?? "–"}</td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{o.type ?? "–"}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--occ-panel-2)", borderRadius: "3px", padding: "2px 6px", color: "var(--occ-accent)" }}>
                        {o.plan ?? "–"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: o.is_active ? "var(--occ-ok)" : "var(--occ-text-2)" }}>
                      {o.is_active ? "aktiv" : "inaktiv"}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)", textAlign: "center" }}>{o.member_count}</td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)", textAlign: "center" }}>{o.active_subscriptions}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{fmtDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            total={state.data.total}
            page={state.data.page}
            perPage={state.data.per_page}
            hasMore={state.data.has_more}
            onLoadMore={() => load(state.search, state.page + 1)}
          />
        </>
      )}
    </>
  );
}

// ── Subscriptions-Tab ─────────────────────────────────────────────────────────

function SubscriptionsTab() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<TabState<OccDataSubscriptionList>>({ status: "idle" });

  const load = useCallback((q: string, page = 1) => {
    setState({ status: "loading" });
    const params = new URLSearchParams({ page: String(page), per_page: "30" });
    if (q.trim()) params.set("search", q.trim());
    occApi.get<OccDataSubscriptionList>(`/data-explorer/subscriptions?${params.toString()}`).then((res) => {
      if (res.success) setState({ status: "ready", data: res.data, search: q, page });
      else setState({ status: "error", message: res.error.message ?? `Fehler: ${res.error.code}` });
    }).catch(() => setState({ status: "error", message: "Netzwerkfehler." }));
  }, []);

  useEffect(() => { load(""); }, []);

  const STATUS_COLORS: Record<string, string> = {
    active: "var(--occ-ok)",
    trialing: "var(--occ-accent)",
    past_due: "var(--occ-warn)",
    canceled: "var(--occ-text-2)",
    incomplete: "var(--occ-warn)",
    unpaid: "var(--occ-critical)",
  };

  return (
    <>
      <SearchBar value={search} onChange={setSearch} onSearch={() => load(search)} placeholder="E-Mail / Org / Plan / Status…" />

      {state.status === "loading" && <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade…</div>}
      {state.status === "error" && <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>}
      {state.status === "ready" && (
        <>
          <div className="occ-panel" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                  {["Nutzer", "Organisation", "Plan", "Status", "Periode bis", "Erstellt"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--occ-text-2)", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "var(--occ-text-2)", fontSize: "12px" }}>
                      Keine Subscriptions gefunden
                    </td>
                  </tr>
                ) : state.data.items.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                    <td style={{ padding: "9px 12px", fontSize: "12px", fontFamily: "monospace" }}>{s.user_email || "–"}</td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: "var(--occ-text-2)" }}>{s.organization_name ?? "–"}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--occ-panel-2)", borderRadius: "3px", padding: "2px 6px", color: "var(--occ-accent)" }}>
                        {s.plan ?? "–"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: "12px", color: s.status ? (STATUS_COLORS[s.status] ?? "var(--occ-text-2)") : "var(--occ-text-2)" }}>
                      {s.status ?? "–"}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{fmtDate(s.current_period_end)}</td>
                    <td style={{ padding: "9px 12px", fontSize: "11px", color: "var(--occ-text-2)" }}>{fmtDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            total={state.data.total}
            page={state.data.page}
            perPage={state.data.per_page}
            hasMore={state.data.has_more}
            onLoadMore={() => load(state.search, state.page + 1)}
          />
        </>
      )}
    </>
  );
}

// ── Integrity-Tab ─────────────────────────────────────────────────────────────

function IntegrityTab() {
  const [state, setState] = useState<TabState<OccIntegrityChecks>>({ status: "idle" });

  useEffect(() => {
    setState({ status: "loading" });
    occApi.get<OccIntegrityChecks>("/data-explorer/integrity-checks").then((res) => {
      if (res.success) setState({ status: "ready", data: res.data, search: "", page: 1 });
      else setState({ status: "error", message: res.error.message ?? `Fehler: ${res.error.code}` });
    }).catch(() => setState({ status: "error", message: "Netzwerkfehler." }));
  }, []);

  return (
    <>
      {state.status === "loading" && <div className="occ-empty" style={{ color: "var(--occ-text-2)" }}>Lade Integritätschecks…</div>}
      {state.status === "error" && <div className="occ-empty" style={{ color: "var(--occ-danger)" }}>{state.message}</div>}
      {state.status === "ready" && (
        <div className="occ-panel" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--occ-line)" }}>
                {["Check", "Anzahl Abweichungen", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--occ-text-2)", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.data.items.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--occ-line)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "13px" }}>{item.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "15px",
                        color: item.count > 0 ? "var(--occ-critical)" : "var(--occ-ok)",
                      }}
                    >
                      {fmtNum(item.count)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {item.count === 0 ? (
                      <span style={{ color: "var(--occ-ok)", fontSize: "12px", fontWeight: 600 }}>✓ OK</span>
                    ) : (
                      <span style={{ color: "var(--occ-critical)", fontSize: "12px", fontWeight: 600 }}>✕ Abweichung</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Haupt-Modul ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: "users",         label: "Nutzer" },
  { key: "orgs",          label: "Organisationen" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "integrity",     label: "Integritäts-Checks" },
];

export function DataExplorerModule() {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  // Keep track of which tabs have been mounted to avoid re-fetching on tab switch
  const mounted = useRef<Set<Tab>>(new Set(["users"]));

  function handleTabChange(tab: Tab) {
    mounted.current.add(tab);
    setActiveTab(tab);
  }

  const tabBtnStyle = (tab: Tab) => ({
    padding: "7px 14px",
    background: activeTab === tab ? "var(--occ-accent)" : "transparent",
    border: activeTab === tab ? "none" : "1px solid var(--occ-line)",
    borderRadius: "5px",
    color: activeTab === tab ? "#fff" : "var(--occ-text-2)",
    fontSize: "12px",
    fontWeight: activeTab === tab ? 600 : 400,
    cursor: "pointer",
  });

  return (
    <AppShell pageTitle="Data Explorer">
      <div style={{ maxWidth: "1100px" }}>
        {/* Tab-Leiste */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => handleTabChange(t.key)} style={tabBtnStyle(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab-Inhalte — alle gemountet, aber per display gesteuert */}
        <div style={{ display: activeTab === "users" ? "block" : "none" }}>
          {mounted.current.has("users") && <UsersTab />}
        </div>
        <div style={{ display: activeTab === "orgs" ? "block" : "none" }}>
          {mounted.current.has("orgs") && <OrgsTab />}
        </div>
        <div style={{ display: activeTab === "subscriptions" ? "block" : "none" }}>
          {mounted.current.has("subscriptions") && <SubscriptionsTab />}
        </div>
        <div style={{ display: activeTab === "integrity" ? "block" : "none" }}>
          {mounted.current.has("integrity") && <IntegrityTab />}
        </div>
      </div>
    </AppShell>
  );
}
