// SOC-Module — alle an die echten /api/v1/support/* Endpunkte verdrahtet.
import { useCallback, useEffect, useState } from "react";
import { socApi, SocError } from "./api";
import type {
  Bootstrap, CaseRow, CaseDetail, Paged, Escalation, LookupUser, LookupOrg,
  KnowledgeArticle, QualityMetrics, AgentStat, AuditEntry,
} from "./api";
import {
  Spinner, EmptyState, ErrorBox, Pager, fmtDate, pct, hours,
  StatusBadge, PriorityBadge, SlaBadge, statusLabel,
} from "./ui";

const CASE_STATUSES = ["new", "open", "in_progress", "waiting_customer", "waiting_internal", "resolved", "closed", "reopened"];
const PRIORITIES = ["low", "normal", "high", "urgent", "critical"];
const ESC_TARGETS = ["decisions_requests", "commercial", "ops", "owner"];
const PER_PAGE = 25;

function msg(e: unknown): string {
  if (e instanceof SocError) return e.message || e.code;
  return e instanceof Error ? e.message : "Unbekannter Fehler";
}

/* ═══════════════ CASES ═══════════════ */

export function CasesModule() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, has_more: false });
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [atRisk, setAtRisk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (page: number) => {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
      if (status) qs.set("status", status);
      if (priority) qs.set("priority", priority);
      if (search.trim()) qs.set("search", search.trim());
      if (mineOnly) qs.set("assigned_to_me", "true");
      if (atRisk) qs.set("sla_at_risk", "true");
      const d = await socApi.get<Paged<CaseRow>>(`/cases?${qs.toString()}`);
      setRows(d.items); setMeta({ total: d.total, page: d.page, has_more: d.has_more });
    } catch (e) { setErr(msg(e)); setRows([]); }
    finally { setLoading(false); }
  }, [status, priority, search, mineOnly, atRisk]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div>
      <h1 className="soc-section-title">Fälle</h1>
      <p className="soc-section-sub">Support-Cases nach Scope, Queue und SLA. Klick öffnet den Fall.</p>
      <div className="soc-filters">
        <input className="soc-input" placeholder="Suche (Fallnummer / Betreff)…" value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(1); }} />
        <select className="soc-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {CASE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select className="soc-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Alle Prioritäten</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Nur meine
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={atRisk} onChange={(e) => setAtRisk(e.target.checked)} /> SLA-Risiko
        </label>
        <button className="soc-btn" onClick={() => load(1)}>Filtern</button>
      </div>

      {err && <ErrorBox message={err} />}
      <div className="soc-card">
        {loading ? <div className="soc-empty"><Spinner /></div> : rows.length === 0 ? <EmptyState text="Keine Fälle gefunden." /> : (
          <table className="soc-table">
            <thead><tr>
              <th>Fall</th><th>Betreff</th><th>Status</th><th>Priorität</th><th>SLA</th><th>Zugewiesen</th><th>Org</th><th>Aktualisiert</th>
            </tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)}>
                  <td className="soc-mono">{c.case_number}{c.is_escalated && <span className="soc-badge soc-badge--warn" style={{ marginLeft: 6 }}>esk.</span>}</td>
                  <td>{c.subject}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><PriorityBadge priority={c.priority} /></td>
                  <td><SlaBadge state={c.sla_state} hoursRemaining={c.sla_hours_remaining} /></td>
                  <td>{c.assigned_to_name || <span className="soc-mono">—</span>}</td>
                  <td>{c.org_name || "—"}</td>
                  <td className="soc-mono">{fmtDate(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!loading && rows.length > 0 && <Pager page={meta.page} perPage={PER_PAGE} total={meta.total} hasMore={meta.has_more} onPage={load} />}

      {openId && <CaseDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={() => load(meta.page)} />}
    </div>
  );
}

/* ═══════════════ CASE DRAWER ═══════════════ */

function CaseDrawer({ caseId, onClose, onChanged }: { caseId: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState<"timeline" | "notes" | "context">("timeline");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true); setErr("");
    try { setD(await socApi.get<CaseDetail>(`/cases/${caseId}`)); }
    catch (e) { setErr(msg(e)); }
    finally { setLoading(false); }
  }, [caseId]);
  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="soc-drawer-overlay" onClick={onClose}>
      <div className="soc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="soc-drawer-head">
          <div>
            <div className="soc-mono">{d?.case_number || "…"}</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 18 }}>{d?.subject || (loading ? "Lädt…" : "Fall")}</h2>
          </div>
          <button className="soc-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        {err && <ErrorBox message={err} />}
        {loading && !d ? <div className="soc-empty"><Spinner /></div> : d && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              <StatusBadge status={d.status} /><PriorityBadge priority={d.priority} />
              <SlaBadge state={d.sla_state} hoursRemaining={d.sla_hours_remaining} />
              <span className="soc-badge soc-badge--neutral">{d.case_type}</span>
            </div>
            <dl className="soc-kv">
              <dt>Zugewiesen</dt><dd>{d.assigned_to_name || "—"}</dd>
              <dt>Queue</dt><dd>{d.queue_name || "—"}</dd>
              <dt>Kontakt</dt><dd>{d.contact_masked}</dd>
              <dt>Org</dt><dd>{d.org_name || "—"}</dd>
              <dt>SLA-Frist</dt><dd className="soc-mono">{fmtDate(d.sla_deadline)}</dd>
              <dt>Erstellt</dt><dd className="soc-mono">{fmtDate(d.created_at)}</dd>
            </dl>
            {d.description && <div className="soc-note">{d.description}</div>}

            <ActionPanel detail={d} onDone={() => { reload(); onChanged(); }} />

            <div className="soc-sub-tabs">
              <button className={`soc-sub-tab ${tab === "timeline" ? "active" : ""}`} onClick={() => setTab("timeline")}>Verlauf ({d.timeline.length})</button>
              <button className={`soc-sub-tab ${tab === "notes" ? "active" : ""}`} onClick={() => setTab("notes")}>Notizen ({d.notes.length})</button>
              <button className={`soc-sub-tab ${tab === "context" ? "active" : ""}`} onClick={() => setTab("context")}>Kontext</button>
            </div>

            {tab === "timeline" && (d.timeline.length === 0 ? <EmptyState text="Kein Verlauf." /> : (
              <ul className="soc-timeline">
                {d.timeline.map((t) => (
                  <li key={t.id}><strong>{t.event}</strong> {t.detail ? `· ${t.detail}` : ""}<div className="t-meta">{t.actor} · {fmtDate(t.created_at)}</div></li>
                ))}
              </ul>
            ))}
            {tab === "notes" && (d.notes.length === 0 ? <EmptyState text="Keine Notizen." /> : d.notes.map((n) => (
              <div className="soc-note" key={n.id}>
                <div className="n-meta"><span>{n.author_name}</span><span className="soc-badge soc-badge--neutral">{n.note_type}</span><span>{fmtDate(n.created_at)}</span></div>
                {n.body}
              </div>
            )))}
            {tab === "context" && (
              <div>
                {d.user_context ? (
                  <dl className="soc-kv">
                    <dt>Nutzer</dt><dd className="soc-mono">{d.user_context.user_id_masked}</dd>
                    <dt>E-Mail</dt><dd>{d.user_context.email_masked}</dd>
                    <dt>Status</dt><dd>{d.user_context.account_status} · {d.user_context.verification_state}</dd>
                    <dt>Orgs</dt><dd>{d.user_context.org_count}</dd>
                  </dl>
                ) : <EmptyState text="Kein Nutzer-Kontext." />}
                {d.org_context && (
                  <dl className="soc-kv">
                    <dt>Org</dt><dd>{d.org_context.org_name}</dd>
                    <dt>Plan</dt><dd>{d.org_context.plan || "—"}</dd>
                    <dt>Mitglieder</dt><dd>{d.org_context.member_count}</dd>
                  </dl>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ ACTION PANEL ═══════════════ */

function ActionPanel({ detail, onDone }: { detail: CaseDetail; onDone: () => void }) {
  const actions = detail.allowed_actions || [];
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Felder
  const [newStatus, setNewStatus] = useState("in_progress");
  const [newPriority, setNewPriority] = useState("normal");
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("internal");
  const [target, setTarget] = useState(ESC_TARGETS[0]);
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState("");

  if (actions.length === 0) return null;

  async function submit() {
    setBusy(true); setErr("");
    try {
      const body: Record<string, unknown> = { action, case_id: detail.id };
      if (action === "change_status") body.new_status = newStatus;
      if (action === "change_priority") body.new_priority = newPriority;
      if (action === "add_note") { body.note = note; body.note_type = noteType; }
      if (action === "assign") { body.assignee_id = assignee.trim(); if (reason.trim()) body.reason = reason.trim(); }
      if (action === "escalate") body.escalation = { target, reason: reason.trim(), summary: detail.subject };
      if (action === "close") body.reason = reason.trim();
      if ((action === "resend_verification" || action === "resend_invite")) body.reason = reason.trim();
      await socApi.post(`/cases/${detail.id}/action`, body);
      setAction(""); setNote(""); setReason(""); setAssignee("");
      onDone();
    } catch (e) { setErr(msg(e)); }
    finally { setBusy(false); }
  }

  const needsReason = action === "escalate" || action === "close" || action === "assign" || action === "resend_verification" || action === "resend_invite";
  const reasonMin = action === "escalate" ? 20 : 10;
  const canSubmit = !!action && !busy
    && (action !== "add_note" || note.trim().length > 0)
    && (action !== "assign" || assignee.trim().length > 0)
    && (!needsReason || reason.trim().length >= reasonMin);

  return (
    <div style={{ borderTop: "1px solid var(--soc-line)", paddingTop: 14, marginTop: 10 }}>
      <div className="soc-actions-row">
        <select className="soc-select" value={action} onChange={(e) => { setAction(e.target.value); setErr(""); }}>
          <option value="">Aktion wählen…</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {action === "change_status" && (
          <select className="soc-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            {CASE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        )}
        {action === "change_priority" && (
          <select className="soc-select" value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {action === "escalate" && (
          <select className="soc-select" value={target} onChange={(e) => setTarget(e.target.value)}>
            {ESC_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {action === "assign" && (
          <input className="soc-input" placeholder="Agent-ID (UUID)" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
        )}
      </div>
      {action === "add_note" && (
        <div style={{ marginBottom: 8 }}>
          <textarea className="soc-textarea" placeholder="Notiz…" value={note} onChange={(e) => setNote(e.target.value)} />
          <select className="soc-select" style={{ marginTop: 6 }} value={noteType} onChange={(e) => setNoteType(e.target.value)}>
            <option value="internal">intern</option><option value="external">extern (Kunde)</option>
          </select>
        </div>
      )}
      {needsReason && (
        <textarea className="soc-textarea" placeholder={`Begründung (min. ${reasonMin} Zeichen)…`} value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
      {err && <ErrorBox message={err} />}
      {action && (
        <button className="soc-btn soc-btn--primary" style={{ marginTop: 10 }} disabled={!canSubmit} onClick={submit}>
          {busy ? "Wird ausgeführt…" : "Aktion ausführen"}
        </button>
      )}
    </div>
  );
}

/* ═══════════════ LOOKUP ═══════════════ */

export function LookupModule({ bootstrap }: { bootstrap: Bootstrap }) {
  const canUsers = bootstrap.features.user_lookup;
  const [tab, setTab] = useState<"users" | "orgs">(canUsers ? "users" : "orgs");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<LookupUser[]>([]);
  const [orgs, setOrgs] = useState<LookupOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    const min = tab === "users" ? 3 : 2;
    if (q.trim().length < min) { setErr(`Mindestens ${min} Zeichen.`); return; }
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({ search: q.trim(), per_page: String(PER_PAGE) });
      if (tab === "users") setUsers((await socApi.get<Paged<LookupUser>>(`/lookup/users?${qs}`)).items);
      else setOrgs((await socApi.get<Paged<LookupOrg>>(`/lookup/orgs?${qs}`)).items);
    } catch (e) { setErr(msg(e)); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="soc-section-title">Nachschlagen</h1>
      <p className="soc-section-sub">Datenschutz-gemastertes Lookup (Maskierung nach Rolle). Jede Abfrage wird auditiert.</p>
      <div className="soc-sub-tabs">
        {canUsers && <button className={`soc-sub-tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Nutzer</button>}
        {bootstrap.features.org_lookup && <button className={`soc-sub-tab ${tab === "orgs" ? "active" : ""}`} onClick={() => setTab("orgs")}>Organisationen</button>}
      </div>
      <div className="soc-filters">
        <input className="soc-input" placeholder={tab === "users" ? "E-Mail / Name / Firma…" : "Organisationsname…"} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
        <button className="soc-btn soc-btn--primary" onClick={run}>Suchen</button>
      </div>
      {err && <ErrorBox message={err} />}
      <div className="soc-card">
        {loading ? <div className="soc-empty"><Spinner /></div> : tab === "users" ? (
          users.length === 0 ? <EmptyState text="Keine Treffer." /> : (
            <table className="soc-table"><thead><tr><th>Nutzer-ID</th><th>E-Mail</th><th>Status</th><th>Orgs</th><th>Offene Fälle</th><th>Erstellt</th></tr></thead>
              <tbody>{users.map((u, i) => (
                <tr key={i}><td className="soc-mono">{u.user_id_masked}</td><td>{u.email_masked}</td>
                  <td>{u.account_status} · {u.verification_state}</td><td>{u.org_count}</td><td>{u.open_case_count}</td><td className="soc-mono">{fmtDate(u.created_at)}</td></tr>
              ))}</tbody></table>
          )
        ) : (
          orgs.length === 0 ? <EmptyState text="Keine Treffer." /> : (
            <table className="soc-table"><thead><tr><th>Organisation</th><th>Plan</th><th>Status</th><th>Mitglieder</th><th>Offene Fälle</th><th>Erstellt</th></tr></thead>
              <tbody>{orgs.map((o, i) => (
                <tr key={i}><td>{o.org_name}</td><td>{o.plan || "—"}</td><td>{o.status}</td><td>{o.member_count}</td><td>{o.open_case_count}</td><td className="soc-mono">{fmtDate(o.created_at)}</td></tr>
              ))}</tbody></table>
          )
        )}
      </div>
    </div>
  );
}

/* ═══════════════ ESCALATIONS ═══════════════ */

export function EscalationsModule() {
  const [rows, setRows] = useState<Escalation[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, has_more: false });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async (page: number) => {
    setLoading(true); setErr("");
    try {
      const d = await socApi.get<Paged<Escalation>>(`/escalations?page=${page}&per_page=${PER_PAGE}`);
      setRows(d.items); setMeta({ total: d.total, page: d.page, has_more: d.has_more });
    } catch (e) { setErr(msg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(1); }, [load]);

  return (
    <div>
      <h1 className="soc-section-title">Eskalationen</h1>
      <p className="soc-section-sub">Fälle, die an Decisions / Commercial / Ops / Owner eskaliert wurden.</p>
      {err && <ErrorBox message={err} />}
      <div className="soc-card">
        {loading ? <div className="soc-empty"><Spinner /></div> : rows.length === 0 ? <EmptyState text="Keine Eskalationen." /> : (
          <table className="soc-table"><thead><tr><th>Fall</th><th>Ziel</th><th>Priorität</th><th>Status</th><th>Von</th><th>Erstellt</th></tr></thead>
            <tbody>{rows.map((e) => (
              <tr key={e.id}><td className="soc-mono">{e.case_number}</td><td><span className="soc-badge soc-badge--warn">{e.target}</span></td>
                <td><PriorityBadge priority={e.priority} /></td><td>{e.status}</td><td>{e.created_by_name}</td><td className="soc-mono">{fmtDate(e.created_at)}</td></tr>
            ))}</tbody></table>
        )}
      </div>
      {!loading && rows.length > 0 && <Pager page={meta.page} perPage={PER_PAGE} total={meta.total} hasMore={meta.has_more} onPage={load} />}
    </div>
  );
}

/* ═══════════════ KNOWLEDGE ═══════════════ */

export function KnowledgeModule() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
      setArticles(await socApi.get<KnowledgeArticle[]>(`/knowledge${qs}`));
    } catch (e) { setErr(msg(e)); } finally { setLoading(false); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="soc-section-title">Wissensdatenbank</h1>
      <p className="soc-section-sub">Interne Support-Artikel, gefiltert nach deiner Rolle.</p>
      <div className="soc-filters">
        <input className="soc-input" placeholder="Suche…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        <button className="soc-btn" onClick={load}>Suchen</button>
      </div>
      {err && <ErrorBox message={err} />}
      {loading ? <div className="soc-empty"><Spinner /></div> : articles.length === 0 ? <EmptyState text="Keine Artikel." /> : (
        <div style={{ display: "grid", gap: 10 }}>
          {articles.map((a, i) => (
            <div className="soc-card" key={a.id}>
              <div className="soc-card-head" style={{ cursor: "pointer" }} onClick={() => setOpenIdx(openIdx === i ? null : i)}>
                <span>{a.title}</span><span className="soc-badge soc-badge--neutral">{a.category}</span>
              </div>
              {openIdx === i && <div style={{ padding: "14px 16px", fontSize: 13, lineHeight: 1.6, color: "var(--soc-text-2)" }} dangerouslySetInnerHTML={{ __html: a.body }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════ QUALITY ═══════════════ */

export function QualityModule() {
  const [m, setM] = useState<QualityMetrics | null>(null);
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true); setErr("");
      try {
        const [metrics, ag] = await Promise.all([
          socApi.get<QualityMetrics>("/quality/metrics"),
          socApi.get<AgentStat[]>("/quality/agents").catch(() => [] as AgentStat[]),
        ]);
        setM(metrics); setAgents(ag);
      } catch (e) { setErr(msg(e)); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="soc-empty"><Spinner /></div>;
  return (
    <div>
      <h1 className="soc-section-title">Qualität</h1>
      <p className="soc-section-sub">Kennzahlen der letzten 30 Tage.</p>
      {err && <ErrorBox message={err} />}
      {m && (
        <div className="soc-kpi-grid">
          <div className="soc-kpi"><div className="soc-kpi-val">{m.total_cases}</div><div className="soc-kpi-lbl">Fälle gesamt</div></div>
          <div className="soc-kpi"><div className="soc-kpi-val">{m.resolved_cases}</div><div className="soc-kpi-lbl">Gelöst</div></div>
          <div className="soc-kpi"><div className="soc-kpi-val">{hours(m.avg_first_response_h)}</div><div className="soc-kpi-lbl">Ø Erstreaktion</div></div>
          <div className="soc-kpi"><div className="soc-kpi-val">{hours(m.avg_resolution_h)}</div><div className="soc-kpi-lbl">Ø Lösungszeit</div></div>
          <div className="soc-kpi"><div className="soc-kpi-val">{pct(m.sla_met_percent)}</div><div className="soc-kpi-lbl">SLA erfüllt</div></div>
          <div className="soc-kpi warn"><div className="soc-kpi-val">{pct(m.escalation_rate_percent)}</div><div className="soc-kpi-lbl">Eskalationsrate</div></div>
          <div className="soc-kpi warn"><div className="soc-kpi-val">{pct(m.reopen_rate_percent)}</div><div className="soc-kpi-lbl">Wiedereröffnungsrate</div></div>
        </div>
      )}
      <div className="soc-card">
        <div className="soc-card-head">Agenten</div>
        {agents.length === 0 ? <EmptyState text="Keine Agent-Daten (oder keine Berechtigung)." /> : (
          <table className="soc-table"><thead><tr><th>Agent</th><th>Rolle</th><th>Offen</th><th>SLA-Risiko</th><th>Ø Erstreaktion</th><th>Ø Lösung</th></tr></thead>
            <tbody>{agents.map((a) => (
              <tr key={a.agent_id}><td>{a.display_name}</td><td className="soc-mono">{a.role}</td><td>{a.open_cases}</td><td>{a.sla_at_risk}</td><td>{hours(a.avg_first_response_h)}</td><td>{hours(a.avg_resolution_h)}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ AUDIT ═══════════════ */

export function AuditModule() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, has_more: false });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async (page: number) => {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({ page: String(page), per_page: "50" });
      if (q.trim()) qs.set("search", q.trim());
      const d = await socApi.get<Paged<AuditEntry>>(`/audit?${qs}`);
      setRows(d.items); setMeta({ total: d.total, page: d.page, has_more: d.has_more });
    } catch (e) { setErr(msg(e)); } finally { setLoading(false); }
  }, [q]);
  useEffect(() => { load(1); }, [load]);

  return (
    <div>
      <h1 className="soc-section-title">Audit-Log</h1>
      <p className="soc-section-sub">Nachvollziehbarkeit aller Support-Aktionen.</p>
      <div className="soc-filters">
        <input className="soc-input" placeholder="Suche (Fall / Akteur)…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(1); }} />
        <button className="soc-btn" onClick={() => load(1)}>Filtern</button>
      </div>
      {err && <ErrorBox message={err} />}
      <div className="soc-card">
        {loading ? <div className="soc-empty"><Spinner /></div> : rows.length === 0 ? <EmptyState text="Keine Einträge." /> : (
          <table className="soc-table"><thead><tr><th>Aktion</th><th>Akteur</th><th>Fall</th><th>Detail</th><th>Zeit</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}><td className="soc-mono">{a.action}</td><td>{a.actor_name}</td><td className="soc-mono">{a.case_ref || "—"}</td><td>{a.detail || "—"}</td><td className="soc-mono">{fmtDate(a.created_at)}</td></tr>
            ))}</tbody></table>
        )}
      </div>
      {!loading && rows.length > 0 && <Pager page={meta.page} perPage={50} total={meta.total} hasMore={meta.has_more} onPage={load} />}
    </div>
  );
}
