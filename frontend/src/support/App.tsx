import { useEffect, useState } from "react";
import { socApi, SocError } from "./api";
import type { Bootstrap } from "./api";
import { Spinner, CenterState } from "./ui";
import { CasesModule, LookupModule, EscalationsModule, KnowledgeModule, QualityModule, AuditModule } from "./modules";

type View = "dashboard" | "cases" | "escalations" | "lookup" | "knowledge" | "quality" | "audit";

const ROLE_LABEL: Record<string, string> = {
  internal_support_agent: "Interner Agent", internal_support_lead: "Interner Lead",
  external_support_agent: "Externer Agent", external_support_supervisor: "Externer Supervisor",
  support_auditor: "Auditor",
};

async function platformLogout() {
  try {
    const r = await fetch("/api/csrf", { credentials: "include" });
    const token = (await r.json()).token || "";
    await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { "x-csrf-token": token } });
  } catch { /* trotzdem weiterleiten */ }
  window.location.href = "/?auth=login";
}

function viewFromHash(): View {
  const h = window.location.hash.replace("#", "") as View;
  return (["dashboard", "cases", "escalations", "lookup", "knowledge", "quality", "audit"] as View[]).includes(h) ? h : "dashboard";
}

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauth" | "disabled" | "forbidden" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [view, setView] = useState<View>(viewFromHash());

  useEffect(() => {
    (async () => {
      try {
        setBoot(await socApi.get<Bootstrap>("/bootstrap"));
        setState("ready");
      } catch (e) {
        if (e instanceof SocError) {
          if (e.status === 401) setState("unauth");
          else if (e.status === 503) setState("disabled");
          else if (e.status === 403) setState("forbidden");
          else { setState("error"); setErrMsg(e.message || e.code); }
        } else { setState("error"); setErrMsg("Verbindungsfehler."); }
      }
    })();
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function go(v: View) { window.location.hash = v; setView(v); }

  if (state === "loading") return <div className="soc-center"><Spinner /></div>;
  if (state === "unauth") return (
    <CenterState title="Nicht angemeldet">
      <p style={{ color: "var(--soc-text-2)", maxWidth: 360 }}>Das Support Operations Center erfordert eine angemeldete Plattform-Session.</p>
      <a className="soc-btn soc-btn--primary" href="/?auth=login&return=%2Fsupport-ops%2F">Zum Login</a>
    </CenterState>
  );
  if (state === "disabled") return (
    <CenterState title="Support Ops deaktiviert">
      <p style={{ color: "var(--soc-text-2)", maxWidth: 380 }}>Das SOC ist derzeit nicht aktiviert (SUPPORT_OPS_ENABLED=false). Bitte wende dich an den Plattform-Betrieb.</p>
    </CenterState>
  );
  if (state === "forbidden") return (
    <CenterState title="Kein Support-Zugang">
      <p style={{ color: "var(--soc-text-2)", maxWidth: 380 }}>Dein Account ist kein aktiver Support-Agent. Zugang wird über die <code>support_agents</code>-Tabelle vergeben.</p>
      <a className="soc-btn" href="/public/enterprise.html">Zur Plattform</a>
    </CenterState>
  );
  if (state === "error" || !boot) return <CenterState title="Fehler"><p style={{ color: "var(--soc-text-2)" }}>{errMsg || "Unbekannter Fehler."}</p></CenterState>;

  const f = boot.features;
  const nav: { key: View; label: string; count?: number; tone?: string }[] = [
    { key: "dashboard", label: "Übersicht" },
    { key: "cases", label: "Fälle", count: boot.open_assigned_count },
    { key: "escalations", label: "Eskalationen", count: boot.escalations_pending, tone: boot.escalations_pending > 0 ? "warn" : undefined },
  ];
  if (f.user_lookup || f.org_lookup) nav.push({ key: "lookup", label: "Nachschlagen" });
  if (f.knowledge_base) nav.push({ key: "knowledge", label: "Wissen" });
  if (f.quality_metrics) nav.push({ key: "quality", label: "Qualität" });
  if (f.audit_view) nav.push({ key: "audit", label: "Audit" });

  return (
    <>
      {boot.identity.scope === "external" && <ExternalWatermark identity={boot.identity} />}
    <div className="soc-app">
      <aside className="soc-sidebar">
        <div className="soc-brand">
          <span className="soc-brand-dot" />
          <div><div className="soc-brand-name">TempConnect</div><div className="soc-brand-sub">Support Ops</div></div>
        </div>
        {nav.map((n) => (
          <button key={n.key} className={`soc-nav-item ${view === n.key ? "active" : ""}`} onClick={() => go(n.key)}>
            <span>{n.label}</span>
            {n.count != null && n.count > 0 && <span className={`soc-nav-count ${n.tone || ""}`}>{n.count}</span>}
          </button>
        ))}
      </aside>
      <div className="soc-main">
        <header className="soc-topbar">
          <span className="soc-topbar-title">Support Operations Center</span>
          <div className="soc-topbar-right">
            <div className="soc-identity">
              <div className="soc-identity-name">{boot.identity.display_name}</div>
              <div className="soc-identity-role">{ROLE_LABEL[boot.identity.role] || boot.identity.role}{boot.identity.vendor_name ? ` · ${boot.identity.vendor_name}` : ""}</div>
            </div>
            <button className="soc-btn soc-btn--sm" onClick={platformLogout}>Abmelden</button>
          </div>
        </header>
        <main className="soc-content">
          {view === "dashboard" && <Dashboard boot={boot} onOpenCases={() => go("cases")} />}
          {view === "cases" && <CasesModule />}
          {view === "escalations" && <EscalationsModule />}
          {view === "lookup" && <LookupModule bootstrap={boot} />}
          {view === "knowledge" && <KnowledgeModule />}
          {view === "quality" && <QualityModule />}
          {view === "audit" && <AuditModule />}
        </main>
      </div>
    </div>
    </>
  );
}

function ExternalWatermark({ identity }: { identity: Bootstrap["identity"] }) {
  // Diagonal gekacheltes Wasserzeichen mit Agenten-Identitaet -> Screenshots/Aufnahmen
  // eines externen Agenten sind rueckverfolgbar (Deterrent). Reines Overlay, pointer-events:none.
  const label = `${identity.display_name} · ${identity.user_id}`;
  const safe = label.replace(/[<>&]/g, " ");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'><text x='10' y='112' transform='rotate(-22 180 100)' fill='rgba(255,255,255,0.05)' font-family='sans-serif' font-size='13'>${safe}</text></svg>`;
  const bg = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return <div className="soc-watermark" aria-hidden="true" style={{ backgroundImage: bg }} />;
}

function Dashboard({ boot, onOpenCases }: { boot: Bootstrap; onOpenCases: () => void }) {
  const s = boot.sla_summary;
  return (
    <div>
      <h1 className="soc-section-title">Übersicht</h1>
      <p className="soc-section-sub">Dein Support-Arbeitsstand und Queue-Lage.</p>
      <div className="soc-kpi-grid">
        <div className="soc-kpi"><div className="soc-kpi-val">{s.open_assigned}</div><div className="soc-kpi-lbl">Offen (zugewiesen)</div></div>
        <div className={`soc-kpi ${s.sla_at_risk > 0 ? "warn" : ""}`}><div className="soc-kpi-val">{s.sla_at_risk}</div><div className="soc-kpi-lbl">SLA-Risiko</div></div>
        <div className={`soc-kpi ${s.sla_breached > 0 ? "danger" : ""}`}><div className="soc-kpi-val">{s.sla_breached}</div><div className="soc-kpi-lbl">SLA verletzt</div></div>
        <div className={`soc-kpi ${s.escalations_pending > 0 ? "warn" : ""}`}><div className="soc-kpi-val">{s.escalations_pending}</div><div className="soc-kpi-lbl">Eskalationen offen</div></div>
      </div>
      <div className="soc-card">
        <div className="soc-card-head"><span>Queues</span><button className="soc-btn soc-btn--sm" onClick={onOpenCases}>Zu den Fällen</button></div>
        {boot.queues.length === 0 ? <div className="soc-empty">Keine Queues zugewiesen.</div> : (
          <table className="soc-table"><thead><tr><th>Queue</th><th>Typ</th><th>Offen</th><th>SLA-Risiko</th></tr></thead>
            <tbody>{boot.queues.map((q) => (
              <tr key={q.id}><td>{q.name}</td><td className="soc-mono">{q.type}</td><td>{q.open_count}</td>
                <td>{q.sla_at_risk > 0 ? <span className="soc-badge soc-badge--warn">{q.sla_at_risk}</span> : "0"}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}
