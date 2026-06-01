/**
 * Activity Feed Service — Governance-grade timeline over audit_log.
 *
 * Transforms raw audit_log rows into human-readable, icon-tagged feed items
 * for admin dashboards. Uses queryOrgAuditLog from auditLog.js — no parallel
 * logging system, just a presentation layer on top of existing audit data.
 */

import { queryOrgAuditLog, queryAuditLog } from "./auditLog.js";

/* ── Human-readable labels for audit actions ───────────────────────── */

const ACTION_LABELS = {
  // Auth & Security
  "auth.login":                "Anmeldung",
  "auth.logout":               "Abmeldung",
  "auth.register":             "Registrierung",
  "auth.forgot_password":      "Passwort-Reset angefordert",
  "auth.reset_password":       "Passwort zurückgesetzt",
  "auth.verify_email":         "E-Mail verifiziert",
  "auth.password_change":      "Passwort geändert",

  // Users / Roles
  "admin.user.update":         "Benutzer aktualisiert",
  "admin.user.deactivate":     "Benutzer deaktiviert",
  "user.update":               "Profil aktualisiert",
  "user.role_change":          "Rolle geändert",

  // Organizations
  "org.create":                "Organisation erstellt",
  "org.update":                "Organisation aktualisiert",
  "org.settings.update":       "Organisationseinstellungen geändert",
  "org.member.add":            "Mitglied hinzugefügt",
  "org.member.remove":         "Mitglied entfernt",
  "org.member.role_change":    "Mitgliedsrolle geändert",

  // Requisitions
  "requisition.create":        "Requisition erstellt",
  "requisition.update":        "Requisition aktualisiert",
  "requisition.submit":        "Requisition eingereicht",
  "requisition.approve":       "Requisition freigegeben",
  "requisition.reject":        "Requisition abgelehnt",
  "requisition.cancel":        "Requisition storniert",
  "requisition.distribute":    "Requisition verteilt",
  "requisition.fill":          "Requisition besetzt",

  // Offers
  "offer.create":              "Angebot erstellt",
  "offer.submit":              "Angebot eingereicht",
  "offer.accept":              "Angebot angenommen",
  "offer.reject":              "Angebot abgelehnt",
  "offer.withdraw":            "Angebot zurückgezogen",

  // Deals
  "deal.create":               "Deal erstellt",
  "deal.accept":               "Deal angenommen",
  "deal.finalize":             "Deal abgeschlossen",
  "deal.cancel":               "Deal storniert",
  "deal.complete":             "Deal abgeschlossen",
  "deal.status_change":        "Deal-Status geändert",

  // Contracts & Assignments
  "contract.create":           "Vertrag erstellt",
  "contract.activate":         "Vertrag aktiviert",
  "contract.terminate":        "Vertrag gekündigt",
  "assignment.create":         "Einsatz erstellt",
  "assignment.start":          "Einsatz gestartet",
  "assignment.complete":       "Einsatz abgeschlossen",

  // Timesheets
  "timesheet.create":          "Stundenzettel erstellt",
  "timesheet.submit":          "Stundenzettel eingereicht",
  "timesheet.approve":         "Stundenzettel genehmigt",
  "timesheet.reject":          "Stundenzettel abgelehnt",
  "timesheet.sign":            "Stundenzettel unterschrieben",

  // Invoices
  "invoice.create":            "Rechnung erstellt",
  "invoice.issue":             "Rechnung ausgestellt",
  "invoice.pay":               "Rechnung bezahlt",

  // Capacity Exchange
  "capacity.create":           "Personal eingestellt",
  "capacity.update":           "Personalangebot aktualisiert",
  "capacity.deactivate":       "Personalangebot deaktiviert",
  "capacity.request":          "Interesse an Personal",

  // Compliance
  "compliance.upload":         "Dokument hochgeladen",
  "compliance.verify":         "Dokument verifiziert",
  "compliance.reject":         "Dokument abgelehnt",

  // Vendor Pool
  "vendor_pool.invite":        "Lieferant eingeladen",
  "vendor_pool.approve":       "Lieferant freigeschaltet",
  "vendor_pool.block":         "Lieferant gesperrt",
  "vendor_pool.tier_change":   "Lieferanten-Tier geändert",

  // Integrations
  "integration.create":        "Integration erstellt",
  "integration.update":        "Integration aktualisiert",
  "integration.delete":        "Integration gelöscht",
  // Enterprise / Strategic Collaboration
  "enterprise.request_submit": "Enterprise-Anfrage eingereicht",
  "strategic_collaboration.interest_create": "Kooperationsanfrage eingereicht",
  "strategic_collaboration.interest_create_enterprise_config": "Individueller Tarif angefragt",
  "admin.strategic_collaboration.status_update": "Kooperationsanfrage Status geändert",
  "admin.strategic_collaboration.assign": "Kooperationsanfrage zugewiesen",
  "admin.strategic_collaboration.ops_notes_update": "Kooperationsanfrage Ops-Notiz aktualisiert",

  // Settings / Config
  "settings.update":           "Einstellungen geändert",

  // Workers
  "worker.create":             "Mitarbeiter angelegt",
  "worker.update":             "Mitarbeiter aktualisiert",
  "worker.invite":             "Mitarbeiter eingeladen",
  "worker.deactivate":         "Mitarbeiter deaktiviert"
};

/* ── Icons per action category ─────────────────────────────────────── */

const CATEGORY_ICONS = {
  auth:          "🔐",
  admin:         "⚙️",
  user:          "👤",
  org:           "🏢",
  requisition:   "📄",
  offer:         "📨",
  deal:          "🎯",
  contract:      "📝",
  assignment:    "📋",
  timesheet:     "⏱️",
  invoice:       "💰",
  capacity:      "🔄",
  compliance:    "🛡️",
  vendor_pool:   "🤝",
  integration:   "🔗",
  enterprise:    "💼",
  strategic_collaboration: "🤝",
  settings:      "⚙️",
  worker:        "👷"
};

/* ── Severity per action_type ──────────────────────────────────────── */

const ACTION_TYPE_SEVERITY = {
  CREATE:            "info",
  UPDATE:            "info",
  DELETE:            "danger",
  STATUS_CHANGE:     "info",
  LOGIN:             "muted",
  ROLE_CHANGE:       "warning",
  PERMISSION_CHANGE: "warning",
  APPROVAL:          "success",
  SUBMISSION:        "info",
  SECURITY:          "warning",
  CONFIG_CHANGE:     "warning"
};

/* ── Helpers ───────────────────────────────────────────────────────── */

/**
 * Derive icon from the action string.
 * @param {string} action - e.g. 'timesheet.approve'
 * @returns {string} emoji
 */
function getIcon(action) {
  if (!action) return "📌";
  const category = action.split(".")[0];
  return CATEGORY_ICONS[category] || "📌";
}

/**
 * Derive human-readable label from the action string.
 * Falls back to a cleaned-up version of the action key.
 * @param {string} action
 * @returns {string}
 */
function getLabel(action) {
  if (!action) return "Unbekannte Aktion";
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];

  // Fallback: transform 'some.action_name' → 'Some Action Name'
  return action
    .replace(/[_.]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Derive severity from the action_type.
 * @param {string} actionType
 * @param {string} status - SUCCESS | DENIED | FAILED
 * @returns {string}
 */
function getSeverity(actionType, status) {
  if (status === "DENIED") return "danger";
  if (status === "FAILED") return "warning";
  return ACTION_TYPE_SEVERITY[actionType] || "info";
}

/**
 * Format a resource descriptor from entity fields.
 * @param {string} entityType
 * @param {string} entityId
 * @returns {string}
 */
function formatResource(entityType, entityId) {
  if (!entityType) return "";
  const typeLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  if (!entityId) return typeLabel;
  const shortId = String(entityId).length > 12
    ? String(entityId).slice(0, 8) + "…"
    : String(entityId);
  return `${typeLabel} #${shortId}`;
}

/* ── Public API ────────────────────────────────────────────────────── */

/**
 * Transform a raw audit_log row into a clean feed item.
 * Pure function — no I/O, fully testable.
 * @param {Object} row - from queryAuditLog/queryOrgAuditLog
 * @returns {Object}
 */
export function formatFeedItem(row) {
  return {
    id:           row.id,
    timestamp:    row.created_at,
    action:       row.action,
    action_label: getLabel(row.action),
    action_type:  row.action_type,
    icon:         getIcon(row.action),
    severity:     getSeverity(row.action_type, row.status),
    status:       row.status,
    user:         row.actor_name || row.actor_email || null,
    user_email:   row.actor_email || null,
    resource:     formatResource(row.entity_type, row.entity_id),
    entity_type:  row.entity_type || null,
    entity_id:    row.entity_id || null,
    ip_address:   row.ip_address || null
  };
}

/**
 * Query activity feed for an organization — wraps queryOrgAuditLog.
 * @param {import('pg').Pool} pool
 * @param {string|null} orgId — null = platform-wide (for platform_admin)
 * @param {Object} [filters]
 * @param {string} [filters.action_type]
 * @param {string} [filters.from]
 * @param {string} [filters.to]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @returns {Promise<{ items: Array, total: number }>}
 */
export async function queryActivityFeed(pool, orgId, filters = {}) {
  const limit  = Math.min(200, parseInt(filters.limit) || 50);
  const offset = Math.max(0, parseInt(filters.offset) || 0);

  const queryFilters = {
    action_type: filters.action_type || null,
    from:        filters.from || null,
    to:          filters.to || null,
    limit,
    offset
  };

  const result = orgId
    ? await queryOrgAuditLog(pool, orgId, queryFilters)
    : await queryAuditLog(pool, queryFilters);

  return {
    items: result.items.map(formatFeedItem),
    total: result.total
  };
}

/**
 * Get supported action labels — for filter dropdowns.
 * @returns {Object} label map
 */
export function getActionLabels() {
  return { ...ACTION_LABELS };
}

/**
 * Get supported action types — for filter dropdowns.
 * @returns {string[]}
 */
export function getActionTypes() {
  return Object.keys(ACTION_TYPE_SEVERITY);
}
