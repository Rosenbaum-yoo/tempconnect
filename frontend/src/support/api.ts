// SOC API-Client + Typen — Support Operations Center
// Basis: /api/v1/support (Mount api/app.js). credentials:'include' (Plattform-Session tc.sid).
// Mutationen brauchen CSRF (lazy von /api/csrf). Fehler werden auf SocError gemappt.

const API_BASE = "/api/v1/support";

export class SocError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

let _csrf: string | null = null;
async function getCsrf(): Promise<string> {
  if (_csrf) return _csrf;
  const r = await fetch("/api/csrf", { credentials: "include" });
  if (!r.ok) throw new SocError("CSRF_FAILED", r.status);
  const d = await r.json();
  _csrf = d.token || d.csrfToken || "";
  return _csrf as string;
}

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const isMutation = method !== "GET";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isMutation) headers["x-csrf-token"] = await getCsrf();

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: "include",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new SocError("NETWORK_ERROR", 0, "Verbindungsfehler.");
  }

  // CSRF abgelaufen -> einmal neu holen + Retry
  if (res.status === 403 && isMutation) {
    let body: { error?: string } = {};
    try { body = await res.clone().json(); } catch { /* ignore */ }
    if (body && (body.error === "CSRF_INVALID" || body.error === "INVALID_CSRF")) {
      _csrf = null;
      headers["x-csrf-token"] = await getCsrf();
      res = await fetch(API_BASE + path, {
        method, credentials: "include", headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    }
  }

  let data: unknown = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.indexOf("application/json") >= 0) {
    try { data = await res.json(); } catch { data = null; }
  }

  if (!res.ok) {
    const d = (data || {}) as { error?: string; message?: string };
    throw new SocError(d.error || `HTTP_${res.status}`, res.status, d.message);
  }
  return data as T;
}

export const socApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ?? {} }),
};

/* ── Typen (Spiegel des Backend-Vertrags, api/routes/support.js) ───────────── */

export interface MaskingRules {
  mask_email: boolean; mask_phone: boolean; mask_payment: boolean; mask_full_name: boolean;
  show_org_name: boolean; show_plan: boolean; show_account_status: boolean;
}
export interface Identity {
  user_id: string; display_name: string; email_domain: string | null;
  role: string; scope: "internal" | "external";
  vendor_id: string | null; vendor_name: string | null;
  allowed_queues: string[]; allowed_case_types: string[]; allowed_actions: string[];
  data_scope: "assigned_only" | "vendor_scoped" | "full";
  masking_rules: MaskingRules;
}
export interface Queue { id: string; name: string; type: string; open_count: number; sla_at_risk: number; }
export interface SlaSummary { open_assigned: number; sla_at_risk: number; sla_breached: number; escalations_pending: number; }
export interface SocFeatures {
  user_lookup: boolean; org_lookup: boolean; knowledge_base: boolean;
  supervisor_view: boolean; audit_view: boolean; quality_metrics: boolean;
}
export interface Bootstrap {
  identity: Identity; queues: Queue[]; sla_summary: SlaSummary; features: SocFeatures;
  open_assigned_count: number; escalations_pending: number;
}

export interface CaseRow {
  id: string; case_number: string; subject: string; status: string; priority: string;
  case_type: string; sla_state: "ok" | "at_risk" | "breached"; sla_deadline: string | null;
  sla_hours_remaining: number | null; assigned_to_id: string | null; assigned_to_name: string | null;
  queue_id: string | null; queue_name: string | null; created_at: string; updated_at: string;
  org_name: string | null; contact_masked: string; is_escalated: boolean; escalation_target: string | null;
}
export interface CaseNote { id: string; case_id: string; author_name: string; note_type: string; body: string; created_at: string; }
export interface CaseEvent { id: string; case_id: string; event: string; actor: string; detail: string | null; created_at: string; }
export interface UserContext {
  user_id_masked: string; email_masked: string; display_name_masked: string | null;
  account_status: string; org_count: number; created_at: string; verification_state: string; last_login_masked: string | null;
}
export interface OrgContext {
  org_id_masked: string; org_name: string; plan: string | null; status: string; member_count: number; created_at: string;
}
export interface CaseDetail extends CaseRow {
  description: string | null; user_context: UserContext | null; org_context: OrgContext | null;
  notes: CaseNote[]; timeline: CaseEvent[]; allowed_actions: string[];
}
export interface Paged<T> { items: T[]; total: number; page: number; per_page: number; has_more: boolean; }

export interface Escalation {
  id: string; case_id: string; case_number: string; case_subject: string; target: string;
  reason: string; priority: string; summary: string; status: string;
  created_by_name: string; created_at: string; resolved_at: string | null; resolution_note: string | null;
}
export interface LookupUser extends UserContext { open_case_count: number; context: UserContext; }
export interface LookupOrg extends OrgContext { org_id_masked: string; open_case_count: number; context: OrgContext; recent_cases: CaseRow[]; }
export interface KnowledgeArticle { id: string; category: string; title: string; body: string; tags: string[]; allowed_roles: string[]; }
export interface QualityMetrics {
  period: string; total_cases: number; resolved_cases: number;
  avg_first_response_h: number | null; avg_resolution_h: number | null;
  sla_met_percent: number | null; escalation_rate_percent: number | null; reopen_rate_percent: number | null; csat_score: number | null;
}
export interface AgentStat {
  agent_id: string; display_name: string; role: string; open_cases: number; sla_at_risk: number;
  avg_first_response_h: number | null; avg_resolution_h: number | null; vendor_name: string | null;
}
export interface AuditEntry { id: string; action: string; actor_name: string; case_ref: string | null; detail: string | null; created_at: string; }
