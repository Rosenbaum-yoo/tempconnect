/**
 * TempConnect — Core Domain Type Definitions
 *
 * These types mirror the PostgreSQL database schema and serve as the
 * authoritative source of truth for TypeScript-aware tooling.
 *
 * Usage:
 *   - Import in .js files via JSDoc: @param {import('../types/domain.d.ts').User} user
 *   - Import in .ts files: import type { User } from '../types/domain.js'
 *
 * Migration status: Incrementally typed. As JS services are converted to TS,
 * these types will be used directly. Until then, JSDoc annotations reference them.
 */

// ─────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────

export type UUID = string;
export type ISODateString = string; // "2026-01-15T10:30:00Z"
export type DateString = string;    // "2026-01-15"
export type CurrencyCode = "EUR" | "USD" | "GBP";

// ─────────────────────────────────────────────
// User
// ─────────────────────────────────────────────

export type UserRole = "company" | "agency" | "worker";
export type PlanName = "FREE" | "BASIS" | "PLUS" | "PRO" | "ENTERPRISE";

export interface User {
  id: UUID;
  email: string;
  role: UserRole;
  company_name: string | null;
  phone: string | null;
  contact_person: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  street: string | null;
  lat: number | null;
  lng: number | null;
  vat_id: string | null;
  handelsregister: string | null;
  org_id: UUID | null;
  is_verified: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface UserWithPlan extends User {
  plan: PlanName;
  plan_status: "active" | "canceled" | "past_due";
  plan_expires_at: ISODateString | null;
}

// ─────────────────────────────────────────────
// Organization
// ─────────────────────────────────────────────

export type OrgType = "company" | "agency" | "platform";
export type OrgPlan = "FREE" | "BASIS" | "PLUS" | "PRO" | "ENTERPRISE";

export interface Organization {
  id: UUID;
  name: string;
  type: OrgType;
  plan: OrgPlan;
  owner_id: UUID | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal: string | null;
  address_country: string;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export type OrgRoleKey =
  | "owner"
  | "admin"
  | "program_manager"
  | "hiring_manager"
  | "supplier_manager"
  | "finance"
  | "recruiter"
  | "dispatcher"
  | "member"
  | "supplier_user"
  | "viewer"
  | "worker"
  | "platform_admin";

export interface OrgMembership {
  id: UUID;
  org_id: UUID;
  user_id: UUID;
  role_key: OrgRoleKey;
  location_id: UUID | null;
  department_id: UUID | null;
  is_active: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
  // Joined fields
  org_name?: string;
  org_type?: OrgType;
  org_plan?: OrgPlan;
}

// ─────────────────────────────────────────────
// Vendor Pool
// ─────────────────────────────────────────────

export type VendorTier = "PREFERRED" | "STANDARD" | "RESTRICTED" | "BLOCKED";

export interface VendorPoolEntry {
  id: UUID;
  org_id: UUID;           // Buying organization
  supplier_org_id: UUID;  // Supplying organization
  tier: VendorTier;
  notes: string | null;
  created_by: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─────────────────────────────────────────────
// Requisition
// ─────────────────────────────────────────────

export type RequisitionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "OPEN"
  | "IN_REVIEW"
  | "SHORTLISTED"
  | "FILLED"
  | "CLOSED"
  | "CANCELLED";

export type RequisitionUrgency = "normal" | "urgent" | "critical";

export interface Requisition {
  id: UUID;
  org_id: UUID;
  created_by: UUID;
  assigned_to: UUID | null;
  location_id: UUID | null;
  department_id: UUID | null;
  title: string;
  description: string | null;
  role: string;
  skill_tags: string[];
  headcount: number;
  start_date: DateString | null;
  end_date: DateString | null;
  location_city: string | null;
  location_postal: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_km: number;
  shift_requirements: Record<string, unknown> | null;
  qualifications: Record<string, unknown> | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  urgency: RequisitionUrgency;
  priority: number;
  status: RequisitionStatus;
  approval_required: boolean;
  approved_by: UUID | null;
  approved_at: ISODateString | null;
  filled_at: ISODateString | null;
  closed_at: ISODateString | null;
  cancelled_at: ISODateString | null;
  cancel_reason: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─────────────────────────────────────────────
// Offer (Capacity Exchange)
// ─────────────────────────────────────────────

export type CapacityPostStatus = "draft" | "active" | "paused" | "filled" | "expired" | "archived";

export interface CapacityPost {
  id: UUID;
  supplier_company_id: UUID;
  role: string;
  skill_tags: string[];
  headcount_available: number;
  availability_from: DateString | null;
  availability_to: DateString | null;
  location_city: string | null;
  location_postal: string | null;
  location_lat: number | null;
  location_lng: number | null;
  radius_km: number;
  hourly_rate_min_cents: number | null;
  hourly_rate_max_cents: number | null;
  description: string | null;
  status: CapacityPostStatus;
  is_active: boolean;
  notdienst: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─────────────────────────────────────────────
// Deal
// ─────────────────────────────────────────────

export type DealStatus =
  | "CREATED"
  | "OFFER_SENT"
  | "ACCEPTED"
  | "CONFIRMED"
  | "ASSIGNMENT_STARTED"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED";

export interface Deal {
  id: UUID;
  request_id: UUID | null;
  requisition_id: UUID | null;
  company_id: UUID;
  agency_id: UUID;
  status: DealStatus;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─────────────────────────────────────────────
// Timesheet
// ─────────────────────────────────────────────

export type TimesheetStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "archived";

export interface Timesheet {
  id: UUID;
  org_id: UUID;
  supplier_org_id: UUID | null;
  assignment_id: UUID | null;
  worker_user_id: UUID | null;
  period_start: DateString;
  period_end: DateString;
  total_hours: number;
  overtime_hours: number;
  status: TimesheetStatus;
  submitted_at: ISODateString | null;
  approved_at: ISODateString | null;
  approved_by: UUID | null;
  notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export type WorkerSubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_correction"
  | "accepted_into_timesheet"
  | "rejected"
  | "superseded";

export interface WorkerTimeSubmission {
  id: UUID;
  worker_user_id: UUID;
  worker_assignment_link_id: UUID | null;
  org_id: UUID;
  supplier_org_id: UUID;
  assignment_id: UUID | null;
  week_start: DateString;
  week_end: DateString;
  total_hours: number;
  overtime_hours: number;
  status: WorkerSubmissionStatus;
  worker_comment: string | null;
  reviewer_comment: string | null;
  correction_note: string | null;
  timesheet_id: UUID | null;
  submitted_at: ISODateString | null;
  reviewed_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─────────────────────────────────────────────
// Worker Profile
// ─────────────────────────────────────────────

export interface WorkerProfile {
  id: UUID;
  user_id: UUID;
  supplier_org_id: UUID;
  first_name: string;
  last_name: string;
  personnel_number: string | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  date_of_birth: DateString | null;
  iban_last4: string | null;
  is_active: boolean;
  preferred_locale: string;
  notes: string | null;
  created_by: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─────────────────────────────────────────────
// Invoice (new – from migration 030)
// ─────────────────────────────────────────────

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "void";

export interface Invoice {
  id: UUID;
  invoice_number: string;
  org_id: UUID | null;
  user_id: UUID | null;
  billing_period_start: DateString;
  billing_period_end: DateString;
  plan: PlanName;
  amount_cents: number;
  tax_rate_pct: number;
  tax_amount_cents: number;
  total_cents: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  payment_session_id: string | null;
  stripe_invoice_id: string | null;
  issued_at: ISODateString | null;
  due_at: ISODateString | null;
  paid_at: ISODateString | null;
  notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface InvoiceItem {
  id: UUID;
  invoice_id: UUID;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  total_cents: number;
  created_at: ISODateString;
}

// ─────────────────────────────────────────────
// SLA
// ─────────────────────────────────────────────

export type SlaStatus = "RUNNING" | "MET" | "BREACHED" | "OK";
export type SlaEventType =
  | "SLA_STARTED"
  | "MATCHING_ATTEMPT"
  | "NOTIFICATION_SENT"
  | "SLA_MET"
  | "SLA_BREACHED"
  | "escalated";

export interface SlaEvent {
  id: UUID;
  request_id: UUID;
  event_type: SlaEventType;
  metadata: Record<string, unknown> | null;
  created_at: ISODateString;
}

// ─────────────────────────────────────────────
// Compliance Document
// ─────────────────────────────────────────────

export type ComplianceDocType =
  | "AUG_ERLAUBNIS"         // AÜG-Erlaubnisschein
  | "SOZIALVERSICHERUNG"    // SV-Nachweis
  | "HAFTPFLICHT"           // Betriebshaftpflicht
  | "DATENSCHUTZ"           // DSE / DPA
  | "QUALIFIKATION"         // Qualifikationsnachweise
  | "STRAFREGISTER"         // Führungszeugnis
  | "ARBEITSVERTRAG"        // Muster-Arbeitsvertrag
  | "TARIVERTRAG"           // Tarifbindung-Nachweis
  | "JAHRESABSCHLUSS"       // Jahresabschluss / Bonität
  | "BANKAUSZUG"            // Bankauszug
  | "SONSTIGES";            // Sonstiges

export type ComplianceTrafficLight = "GREEN" | "YELLOW" | "RED" | "GRAY";

export interface ComplianceDocument {
  id: UUID;
  org_id: UUID;
  supplier_org_id: UUID;
  doc_type: ComplianceDocType;
  file_name: string | null;
  file_url: string | null;
  valid_from: DateString | null;
  valid_until: DateString | null;
  status: ComplianceTrafficLight;
  verified_by: UUID | null;
  verified_at: ISODateString | null;
  notes: string | null;
  created_by: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// ─────────────────────────────────────────────
// Matching Engine
// ─────────────────────────────────────────────

export interface MatchFactor {
  factor: "role" | "skills" | "location" | "availability" | "verified" | "vendorPool";
  points: number;
  max: number;
  detail: string;
}

export interface MatchResult {
  score: number;         // 0–100
  reasons: MatchFactor[];
}

// ─────────────────────────────────────────────
// API Response envelope
// ─────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  error: null;
}

export interface ApiError {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
