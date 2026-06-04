/**
 * SCC Bootstrap Types
 * Daten die beim Start von /staff/api/bootstrap geladen werden.
 *
 * Aligned mit dem Haupt-Repo Backend (staffControlCenter.js → /bootstrap):
 *   { staff: {...}, hetzner_mode, executive_summary, platform_summary }
 * Auth läuft via tempconnect_staff-Allowlist (keine Rollen-Hierarchie).
 */

export interface StaffIdentity {
  user_id: string;
  email: string;
  display_name?: string | null;
  // role: nicht im Haupt-Repo-Backend — tempconnect_staff hat keine Rollen-Spalte
  role?: "admin" | "staff" | "operator";
  requires_step_up: boolean;
  step_up_at?: number | null;      // Unix-Timestamp der letzten Step-Up-Auth
  authorized_at?: number | null;   // Unix-Timestamp erster Session-Authorisierung
}

export interface ExecutiveSummary {
  generated_at?: string;
  plans: {
    total_active: number;
    items: Array<{ plan: string; active_count: number }>;
  };
  pilot: {
    active: number;
    converted: number;
    expired: number;
  };
  customer_requests: {
    open: number;
    total?: number;
    pipeline?: Array<{ status: string; count: number }>;
  };
  // "degraded" kommt vom Haupt-Repo-Backend wenn incidents_24h > 10
  platform_status: "ok" | "warning" | "degraded" | "error" | "critical" | "unknown";
  incidents_24h: number;
  errors?: Array<{ area: string; error: string }>;
}

export interface PlatformSummary {
  generated_at?: string;
  feature_flags: Array<{
    flag_key: string;
    is_enabled: boolean;
    description: string;
    risk_level: "low" | "medium" | "high" | "critical";
    updated_by?: string | null;
    updated_at?: string | null;
    reason?: string | null;
  }>;
  errors?: Array<{ area: string; error: string }>;
}

export interface StaffBootstrap {
  staff: StaffIdentity;
  executive_summary: ExecutiveSummary;
  platform_summary?: PlatformSummary;
  hetzner_mode: "live" | "stub";
  /** Theme-Verfügbarkeit (Phase J, Tier-2 Env-Kill-Switch; fehlt → beide an). */
  theme?: { switcher_enabled: boolean; ultra_premium_enabled: boolean };
  allowed_modules?: string[];
  feature_flags?: Record<string, boolean>;
}

export type BootstrapStatus = "loading" | "ready" | "unauthorized" | "error";
