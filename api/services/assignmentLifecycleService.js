/**
 * Assignment Lifecycle Service — canonical active/history separation.
 */

export const ASSIGNMENT_LIFECYCLE_STATES = Object.freeze([
  "active",
  "ends_today",
  "expired",
  "completed",
  "cancelled",
  "archived"
]);

export const ASSIGNMENT_LIFECYCLE_BUCKETS = Object.freeze(["active", "history"]);
export const ASSIGNMENT_LIFECYCLE_QUERY_BUCKETS = Object.freeze([
  ...ASSIGNMENT_LIFECYCLE_BUCKETS,
  "all"
]);

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeIsoDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const directMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function normalizeAssignmentStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeAssignmentLifecycleBucket(value, fallback = null) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ASSIGNMENT_LIFECYCLE_QUERY_BUCKETS.includes(normalized) ? normalized : fallback;
}

export function getAssignmentEffectiveEndDate(record) {
  if (!record) return null;
  const assignmentStatus = normalizeAssignmentStatus(record.assignment_status || record.status);
  const linkEndDate = normalizeIsoDateValue(record.end_date);
  const assignmentPlannedEndDate = normalizeIsoDateValue(
    record.asg_end || record.planned_end_date
  );
  const assignmentActualEndDate = normalizeIsoDateValue(
    record.asg_actual_end || record.actual_end_date
  );

  if (linkEndDate) return linkEndDate;
  if (assignmentStatus === "completed") {
    return assignmentActualEndDate || assignmentPlannedEndDate || null;
  }
  return assignmentPlannedEndDate || assignmentActualEndDate || null;
}

export function getAssignmentLifecycleState(record, referenceDate = todayIsoDate()) {
  if (!record) return "active";
  const assignmentStatus = normalizeAssignmentStatus(record.assignment_status || record.status);
  if (assignmentStatus === "cancelled") return "cancelled";
  if (assignmentStatus === "completed") return "completed";
  if (record.is_active === false) return "archived";

  const effectiveEndDate = getAssignmentEffectiveEndDate(record);
  const normalizedReferenceDate = normalizeIsoDateValue(referenceDate);
  if (effectiveEndDate && normalizedReferenceDate) {
    if (effectiveEndDate < normalizedReferenceDate) return "expired";
    if (effectiveEndDate === normalizedReferenceDate) return "ends_today";
  }

  return "active";
}

export function getAssignmentLifecycleBucket(record, referenceDate = todayIsoDate()) {
  const state = getAssignmentLifecycleState(record, referenceDate);
  return state === "active" || state === "ends_today" ? "active" : "history";
}

export function decorateAssignmentLifecycle(record, referenceDate = todayIsoDate()) {
  if (!record) return null;
  const effectiveEndDate = getAssignmentEffectiveEndDate(record);
  const lifecycleState = getAssignmentLifecycleState(record, referenceDate);
  const lifecycleBucket = getAssignmentLifecycleBucket(record, referenceDate);

  return {
    ...record,
    assignment_effective_end_date: effectiveEndDate,
    assignment_lifecycle_state: lifecycleState,
    assignment_lifecycle_bucket: lifecycleBucket,
    assignment_is_current: lifecycleBucket === "active",
    assignment_is_history: lifecycleBucket === "history",
    assignment_ends_today: lifecycleState === "ends_today",
    assignment_is_expired: lifecycleState === "expired"
  };
}

export function buildAssignmentEffectiveEndDateSql({ assignmentAlias = "a", linkAlias = null } = {}) {
  const assignmentEndSql = `CASE
    WHEN ${assignmentAlias}.status = 'completed'
      THEN COALESCE(${assignmentAlias}.actual_end_date, ${assignmentAlias}.planned_end_date)
    ELSE COALESCE(${assignmentAlias}.planned_end_date, ${assignmentAlias}.actual_end_date)
  END`;
  return linkAlias
    ? `COALESCE(${linkAlias}.end_date, ${assignmentEndSql})`
    : assignmentEndSql;
}

export function buildAssignmentLifecycleStateSql({
  assignmentAlias = "a",
  linkAlias = null,
  referenceDateSql = "CURRENT_DATE"
} = {}) {
  const effectiveEndDateSql = buildAssignmentEffectiveEndDateSql({ assignmentAlias, linkAlias });
  const archivedClause = linkAlias ? `WHEN ${linkAlias}.is_active = FALSE THEN 'archived'` : "";
  return `CASE
    WHEN ${assignmentAlias}.status = 'cancelled' THEN 'cancelled'
    WHEN ${assignmentAlias}.status = 'completed' THEN 'completed'
    ${archivedClause}
    WHEN ${effectiveEndDateSql} IS NOT NULL AND ${effectiveEndDateSql} < ${referenceDateSql} THEN 'expired'
    WHEN ${effectiveEndDateSql} IS NOT NULL AND ${effectiveEndDateSql} = ${referenceDateSql} THEN 'ends_today'
    ELSE 'active'
  END`;
}

export function buildAssignmentLifecycleBucketSql(options = {}) {
  const lifecycleStateSql = buildAssignmentLifecycleStateSql(options);
  return `CASE
    WHEN ${lifecycleStateSql} IN ('active','ends_today') THEN 'active'
    ELSE 'history'
  END`;
}

export function buildAssignmentActivePredicateSql(options = {}) {
  const lifecycleStateSql = buildAssignmentLifecycleStateSql(options);
  return `(${lifecycleStateSql} IN ('active','ends_today'))`;
}

export function buildAssignmentHistoryPredicateSql(options = {}) {
  const lifecycleStateSql = buildAssignmentLifecycleStateSql(options);
  return `(${lifecycleStateSql} NOT IN ('active','ends_today'))`;
}
