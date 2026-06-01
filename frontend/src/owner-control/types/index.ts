// OCC TypeScript Interfaces — entsprechen den Backend-Responses aus routes/occ/*

export interface OccIdentity {
  user_id: string;
  email: string | null;
  display_name: string | null;
  occ_role: "owner" | "co-owner";
  last_login_at: string | null;
  step_up_required: boolean;
}

export interface OccModule {
  key: string;
  label: string;
  allowed: boolean;
}

export interface OccCriticalSignal {
  code: string;
  severity: "critical" | "warning";
  message: string;
}

export interface OccExecutiveSummary {
  active_users_30d: number;
  active_orgs: number;
  mrr_eur: number;
  open_decisions: number;
  open_support_escalations: number;
  critical_signals: number;
}

export interface OccCriticalSignalBreakdown {
  support_escalations_open: number;
  risk_signals_open: number;
  warp_failures_24h: number;
  infrastructure_critical_hosts: number;
}

export interface OccBootstrapData {
  identity: OccIdentity;
  allowed_modules: OccModule[];
  allowed_actions: string[];
  executive_summary: OccExecutiveSummary;
  critical_signal_breakdown: OccCriticalSignalBreakdown;
  critical_signals: OccCriticalSignal[];
  system_status: "healthy" | "degraded" | "critical";
  last_audit_at: string | null;
  open_decisions_count: number;
  open_requests_count: number;
}

// ── Revenue ────────────────────────────────────────────────────────────────────

export interface OccPlanBreakdownItem {
  plan: string;
  count: number;
  mrr_contribution: number;
}

export interface OccRevenueKpis {
  mrr_eur: number;
  arr_eur: number;
  active_subscriptions: number;
  completed_payments_30d_eur: number;
}

export interface OccRevenueSummary {
  kpis: OccRevenueKpis;
  plan_breakdown: OccPlanBreakdownItem[];
  offers_pending_approval: number;
  custom_offers_active: number;
}

// ── Operations ─────────────────────────────────────────────────────────────────

export interface OccServiceStatus {
  key: string;
  label: string;
  status: "ok" | "degraded" | "critical" | "unconfigured";
}

export interface OccQueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface OccDbPoolSize {
  total: number;
  idle: number;
  waiting: number;
}

export interface OccOperationsHealth {
  services: OccServiceStatus[];
  queues: OccQueueStats[];
  db_pool_size: OccDbPoolSize;
  memory_mb: number;
  uptime_seconds: number;
  system_status: "healthy" | "degraded" | "critical";
}

// ── Decisions & Requests ───────────────────────────────────────────────────────

export interface OccDecisionItem {
  id: string;
  type: string | null;
  subtype: string | null;
  status: string | null;
  priority: "urgent" | "high" | "normal" | "low";
  source: string;
  organization_id: string | null;
  org_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  title: string | null;
  summary: string | null;
  risk_level: "critical" | "high" | "medium" | "low";
  sla_state: string;
  sla_deadline: string | null;
  owner_decision_required: boolean;
  created_at: string | null;
  decision_outcome: string | null;
}

export interface OccDecisionsList {
  items: OccDecisionItem[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
  pending_owner_decisions: number;
}

// ── Support Oversight ─────────────────────────────────────────────────────────

export interface OccSupportEscalationItem {
  id: string;
  ticket_id: string | null;
  title: string | null;
  org_name: string | null;
  contact_email: string | null;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  sla_state: string;
  owner_decision_required: boolean;
  created_at: string | null;
  sla_deadline: string | null;
  escalation_reason: string | null;
  affected_users: number | null;
}

export interface OccSupportEscalations {
  items: OccSupportEscalationItem[];
  total: number;
}

export interface OccSupportMetrics {
  open_escalations: number;
  sla_at_risk: number;
  sla_breached: number;
  avg_resolution_h: number;
  avg_first_response_h: number;
  reopen_rate_pct: number;
  owner_decision_pending: number;
}

// ── Audit ──────────────────────────────────────────────────────────────────────

export interface OccAuditItem {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string | null;
  details: Record<string, unknown> | null;
  actor_email: string | null;
}

export interface OccAuditFeed {
  items: OccAuditItem[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

// ── Platform ───────────────────────────────────────────────────────────────────

export interface OccPlatformSummary {
  total_users: number;
  total_orgs: number;
  total_listings: number;
  total_deals: number;
  active_users_7d: number;
  new_users_30d: number;
}

// ── Infrastructure ─────────────────────────────────────────────────────────────

export interface OccInfraHostResources {
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  load_1m: number | null;
  load_5m: number | null;
  load_15m: number | null;
}

export interface OccInfraHost {
  id: string;
  name: string;
  role: string;
  env: string;
  status: string;
  ip: string | null;
  region: string | null;
  risk_state: string;
  resources: OccInfraHostResources;
  last_checked_at: string | null;
  last_error: string | null;
  tags: string[];
}

export interface OccInfraBackup {
  target: string;
  status: string;
  last_successful_at: string | null;
  next_scheduled_at: string | null;
  restore_tested_at: string | null;
  restore_ready: boolean;
  risk_level: string;
}

export interface OccInfraDeployment {
  id: string;
  env: string;
  version: string | null;
  status: string;
  deployed_at: string | null;
  deployed_by: string | null;
  duration_ms: number | null;
  rollback_ready: boolean;
  post_checks: unknown[];
}

export interface OccInfraDocker {
  containers: unknown[];
  total: number;
  running: number;
  stopped: number;
  unhealthy: number;
  last_checked: string;
}

export interface OccInfraNetwork {
  proxy_status: string;
  last_checked: string;
}

export interface OccInfraHetzner {
  hosts: OccInfraHost[];
  docker: OccInfraDocker;
  network: OccInfraNetwork;
  disks: unknown[];
  backups: OccInfraBackup[];
  last_deployment: OccInfraDeployment | null;
}

export interface OccInfraDockerService {
  key: string;
  connected: boolean;
}

export interface OccInfraStatus {
  environment: string;
  db_connected: boolean;
  redis_connected: boolean | null;
  api_healthy: boolean;
  docker_services: OccInfraDockerService[];
  last_deployment_at: string | null;
  uptime_seconds: number;
  node_version: string;
  system_status: "healthy" | "degraded" | "critical";
}

// ── Risk ───────────────────────────────────────────────────────────────────────

export interface OccRiskSignalItem {
  id: string;
  area: string;
  level: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  source: string | null;
  recommended_action: string | null;
  drilldown_path: string | null;
  created_at: string | null;
}

export interface OccRiskSignals {
  items: OccRiskSignalItem[];
}

export interface OccRiskDriftItem {
  id: string;
  type: string;
  severity: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  expected: string;
  actual: string;
  detected_at: string;
}

export interface OccRiskDrift {
  items: OccRiskDriftItem[];
}

export interface OccRiskComplianceItem {
  id: string;
  area: string;
  severity: string;
  title: string;
  description: string;
  missing_check: string;
  last_verified: string | null;
}

export interface OccRiskCompliance {
  items: OccRiskComplianceItem[];
}

// ── Data Explorer ──────────────────────────────────────────────────────────────

export interface OccDataUser {
  id: string;
  email: string;
  company_name: string | null;
  created_at: string | null;
  last_login_at: string | null;
  status: string;
  plan: string;
  org_count: number;
}

export interface OccDataUserList {
  items: OccDataUser[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface OccDataOrg {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  plan: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  member_count: number;
  active_subscriptions: number;
}

export interface OccDataOrgList {
  items: OccDataOrg[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface OccDataSubscription {
  id: string;
  user_id: string | null;
  user_email: string;
  organization_id: string | null;
  organization_name: string | null;
  plan: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OccDataSubscriptionList {
  items: OccDataSubscription[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface OccIntegrityCheckItem {
  id: string;
  name: string;
  count: number;
}

export interface OccIntegrityChecks {
  items: OccIntegrityCheckItem[];
}

// ── Automation ─────────────────────────────────────────────────────────────────

export interface OccAutomationJob {
  id: string;
  name: string;
  description: string | null;
  category: string;
  trigger: string;
  schedule: string | null;
  status: string;
  risk_level: string;
  runbook_id: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  next_run_at: string | null;
  retry_on_failure: boolean;
  max_retries: number;
  requires_confirm: boolean;
}

export interface OccAutomationJobs {
  jobs: OccAutomationJob[];
}

export interface OccAutomationExecution {
  id: string;
  runbook_id: string | null;
  runbook_name: string | null;
  actor_id: string | null;
  actor_email: string | null;
  host_name: string | null;
  status: string;
  dry_run: boolean;
  reason: string | null;
  risk_level: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  step_results: unknown[];
  audit_id: string | null;
  error: string | null;
}

export interface OccAutomationHistory {
  items: OccAutomationExecution[];
  total: number;
  has_more: boolean;
}

export interface OccAutomationScheduleItem {
  id: string;
  name: string;
  cron: string;
  next_run: string | null;
  enabled: boolean;
  job_id: string;
  risk_level: string;
}

export interface OccAutomationSchedules {
  schedules: OccAutomationScheduleItem[];
}

// ── API Result ─────────────────────────────────────────────────────────────────

export interface ApiOk<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiError {
  success: false;
  data: null;
  error: { code: string; message?: string };
}

export type ApiResult<T> = ApiOk<T> | ApiError;
