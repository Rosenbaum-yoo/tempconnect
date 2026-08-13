/**
 * DSGVO Data Governance Service — Enterprise Compliance-Modul.
 *
 * Kategorien:
 *   A: Direkt personenbezogen (Export + Anonymisierung)
 *   B: Geschäftlich notwendig (Export, Anonymisierung von Personenreferenzen)
 *   C: Aufbewahrungspflichtig (Export, NICHT löschbar: Invoices, Billing, Audit)
 *   D: Technische Metadaten (Export, automatisch bereinigbar)
 */

/* ── Datenkategorien-Inventar ──────────────────────────────────────────── */

import { withTransaction } from "../utils/transaction.js";
import { logger } from "../config/index.js";

export const DATA_CATEGORIES = {
  A: {
    label: "Direkt personenbezogen",
    tables: ["users", "worker_profiles", "worker_invites", "company_profiles", "company_contacts", "offers", "requests"],
    action: "Export + Anonymisierung"
  },
  B: {
    label: "Geschäftlich notwendig",
    tables: ["org_memberships", "assignments", "requisitions", "requisition_candidates", "contracts", "vendor_pool", "capacity_posts", "demand_requests", "timesheets", "timesheet_entries", "worker_time_submissions", "worker_assignment_links", "matches"],
    action: "Export + Anonymisierung Personenreferenzen"
  },
  C: {
    label: "Aufbewahrungspflichtig (HGB §257)",
    tables: ["invoices", "invoice_items", "subscriptions", "billing_usage_metrics", "worker_billing_snapshots", "audit_log"],
    action: "Export, NICHT löschbar (6-10 Jahre)"
  },
  D: {
    label: "Technische Metadaten",
    tables: ["session", "idempotency_keys", "notifications"],
    action: "Automatisch bereinigbar (TTL)"
  }
};

export const RETENTION_POLICIES = {
  worker_invites: { days: 90, description: "Abgelaufene/widerrufene Worker-Einladungen (angenommene bleiben als Registriert-Signal erhalten)" },
  notifications: { days: 180, description: "Gelesene Benachrichtigungen" },
  session: { days: 14, description: "Abgelaufene Sessions (connect-pg-simple)" },
  idempotency_keys: { days: 7, description: "Idempotenz-Schlüssel" }
};

/* ── Export (Art. 15/20 DSGVO) ─────────────────────────────────────────── */

async function safeQuery(pool, sql, params = []) {
  try { const { rows } = await pool.query(sql, params); return rows; }
  catch (err) {
    // NIE wieder still: genau dieses Schlucken hat monatelang verdeckt, dass
    // die Retention auf nicht existierende Spalten zielte (org_id/created_by
    // statt supplier_org_id/invited_by) und faktisch nichts aufraeumte.
    logger.warn({ err: err.message, sql: String(sql).slice(0, 90) }, "dataGovernance safeQuery fehlgeschlagen (Schema-Drift?)");
    return [];
  }
}

/**
 * Vollständiger DSGVO-Export aller personenbezogenen Daten eines Users.
 */
export async function exportUserDataFull(pool, userId) {
  const [user] = await safeQuery(pool, "SELECT id, email, company_name, role, phone, contact_person, street, postal_code, city, vat_id, plan, is_active, created_at FROM users WHERE id = $1", [userId]);
  if (!user) return null;

  // Kat A: Personenbezogen
  const workerProfiles = await safeQuery(pool, "SELECT * FROM worker_profiles WHERE user_id = $1", [userId]);
  const companyProfiles = await safeQuery(pool, "SELECT * FROM company_profiles WHERE user_id = $1", [userId]);
  const companyContacts = await safeQuery(pool, "SELECT cc.* FROM company_contacts cc JOIN company_profiles cp ON cp.id = cc.company_profile_id WHERE cp.user_id = $1", [userId]);

  // Kat B: Geschäftlich
  const orgMemberships = await safeQuery(pool, "SELECT om.*, o.name AS org_name FROM org_memberships om LEFT JOIN organizations o ON o.id = om.org_id WHERE om.user_id = $1", [userId]);
  const listings = await safeQuery(pool, "SELECT * FROM listings WHERE owner_id = $1", [userId]);
  const requestsSent = await safeQuery(pool, "SELECT * FROM requests WHERE sender_id = $1", [userId]);
  const requestsReceived = await safeQuery(pool, "SELECT * FROM requests WHERE receiver_id = $1", [userId]);
  const ratings = await safeQuery(pool, "SELECT * FROM ratings WHERE reviewer_id = $1 OR reviewee_id = $1", [userId]);
  const offers = await safeQuery(pool, "SELECT * FROM offers WHERE created_by = $1", [userId]);
  const capacityPosts = await safeQuery(pool, "SELECT * FROM capacity_posts WHERE created_by = $1", [userId]);
  const assignments = await safeQuery(pool, "SELECT * FROM assignments WHERE created_by = $1", [userId]);
  const timesheets = await safeQuery(pool, "SELECT * FROM timesheets WHERE submitted_by = $1 OR approved_by = $1", [userId]);
  const workerTimeSubmissions = await safeQuery(pool, "SELECT * FROM worker_time_submissions WHERE worker_user_id = $1", [userId]);

  // Kat C: Aufbewahrungspflichtig
  const subscriptions = await safeQuery(pool, "SELECT id, plan_name, status, created_at, expires_at FROM subscriptions WHERE user_id = $1", [userId]);
  const invoices = await safeQuery(pool, "SELECT id, invoice_number, status, total_cents, currency, created_at FROM invoices WHERE created_by = $1", [userId]);

  // Kat D: Technisch
  const notifications = await safeQuery(pool, "SELECT id, type, title, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200", [userId]);

  return {
    export_meta: {
      export_date: new Date().toISOString(),
      subject_id: userId,
      subject_type: "user",
      purpose: "DSGVO Art. 15/20 Datenauskunft/-portabilität",
      data_categories: ["A", "B", "C", "D"]
    },
    category_A: { user, worker_profiles: workerProfiles, company_profiles: companyProfiles, company_contacts: companyContacts },
    category_B: { org_memberships: orgMemberships, listings, requests_sent: requestsSent, requests_received: requestsReceived, ratings, offers, capacity_posts: capacityPosts, assignments, timesheets, worker_time_submissions: workerTimeSubmissions },
    category_C: { subscriptions, invoices, notice: "Aufbewahrungspflichtig nach HGB §257 (6-10 Jahre). Löschung nicht möglich." },
    category_D: { notifications }
  };
}

/**
 * Org-weiter Export für Org-Admins.
 */
export async function exportOrgDataFull(pool, orgId) {
  const [org] = await safeQuery(pool, "SELECT id, name, type, plan, is_active, created_at FROM organizations WHERE id = $1", [orgId]);
  if (!org) return null;

  const members = await safeQuery(pool, "SELECT om.user_id, om.role, u.email, u.company_name FROM org_memberships om JOIN users u ON u.id = om.user_id WHERE om.org_id = $1", [orgId]);
  const requisitions = await safeQuery(pool, "SELECT id, role, status, created_at FROM requisitions WHERE org_id = $1", [orgId]);
  const assignments = await safeQuery(pool, "SELECT id, status, hourly_rate_cents, start_date, created_at FROM assignments WHERE org_id = $1", [orgId]);
  const contracts = await safeQuery(pool, "SELECT id, title, status, created_at FROM contracts WHERE org_id = $1", [orgId]);
  const vendorPool = await safeQuery(pool, "SELECT vp.*, so.name AS supplier_name FROM vendor_pool vp LEFT JOIN organizations so ON so.id = vp.supplier_org_id WHERE vp.client_org_id = $1", [orgId]);
  const locations = await safeQuery(pool, "SELECT * FROM org_locations WHERE org_id = $1", [orgId]);
  const departments = await safeQuery(pool, "SELECT * FROM org_departments WHERE org_id = $1", [orgId]);

  return {
    export_meta: {
      export_date: new Date().toISOString(),
      subject_id: orgId,
      subject_type: "organization",
      purpose: "DSGVO Art. 15/20 Organisationsdaten-Export"
    },
    organization: org,
    members,
    requisitions,
    assignments,
    contracts,
    vendor_pool: vendorPool,
    locations,
    departments
  };
}

/* ── Anonymisierung (Art. 17 DSGVO) ───────────────────────────────────── */

/**
 * Prüft ob ein User anonymisiert werden kann.
 */
export async function canDeleteUser(pool, userId) {
  const blockers = [];

  const [activeAssignment] = await safeQuery(pool, "SELECT COUNT(*)::int AS c FROM assignments WHERE created_by = $1 AND status = 'active'", [userId]);
  if (activeAssignment?.c > 0) blockers.push({ reason: "ACTIVE_ASSIGNMENTS", count: activeAssignment.c });

  const [pendingTimesheets] = await safeQuery(pool, "SELECT COUNT(*)::int AS c FROM timesheets WHERE submitted_by = $1 AND status IN ('submitted','pending')", [userId]);
  if (pendingTimesheets?.c > 0) blockers.push({ reason: "PENDING_TIMESHEETS", count: pendingTimesheets.c });

  const [openInvoices] = await safeQuery(pool, "SELECT COUNT(*)::int AS c FROM invoices WHERE created_by = $1 AND status IN ('draft','sent','overdue')", [userId]);
  if (openInvoices?.c > 0) blockers.push({ reason: "OPEN_INVOICES", count: openInvoices.c });

  return { canDelete: blockers.length === 0, blockers };
}

/**
 * Anonymisiert einen User (DSGVO Art. 17).
 * Kat A: Personenfelder überschrieben
 * Kat B: Personenreferenzen anonymisiert
 * Kat C: NICHT berührt
 * Kat D: Gelöscht
 */
export async function anonymizeUser(pool, userId, actorId) {
  const check = await canDeleteUser(pool, userId);
  if (!check.canDelete) {
    return { success: false, reason: "BLOCKERS", blockers: check.blockers };
  }

  const anonEmail = `deleted_${userId.slice(0, 8)}@anonymized.local`;
  const DELETED = "[Gelöscht]";
  const ANON = "[Anonymisiert]";

  const { tables: anonymized, originalEmail } = await withTransaction(pool, async (client) => {
    const tables = [];

    // Original-E-Mail VOR der Anonymisierung sichern: der Invite-Delete unten
    // braucht sie — eine Subquery NACH dem users-UPDATE laese nur noch die
    // anonymisierte Adresse und traefe nie (frueherer Reihenfolge-Bug).
    const { rows: [origUser] } = await client.query("SELECT email FROM users WHERE id = $1", [userId]);
    const originalEmail = origUser?.email || "";

    // Kat A: Users
    /* `is_active` stand hier jahrelang — die Spalte gibt es in `users` NICHT
    // (geprueft am 2026-08-13 an der laufenden Datenbank). Das Statement warf,
    // und weil alles in withTransaction laeuft, rollte die GESAMTE
    // Anonymisierung zurueck: Art. 17 DSGVO war nicht umgesetzt, sondern eine
    // Absichtserklaerung. Die Sperre entsteht ohnehin sauberer: ohne
    // password_hash ist keine Anmeldung mehr moeglich. */
    /* password_hash ist NOT NULL — `= NULL` warf und rollte alles zurueck.
    // Statt der Spalte ihre Pflicht zu nehmen (das beruehrte jeden Anmeldepfad),
    // steht hier ein Wert, den keine Pruefung je bestaetigen kann: bcrypt
    // vergleicht gegen einen ungueltigen Hash und liefert immer false. Die
    // Anmeldung ist damit dauerhaft zu, ohne dass das Schema weicher wird. */
    await client.query(`UPDATE users SET email = $2, password_hash = '!anonymisiert', company_name = $3, phone = NULL, contact_person = $3, street = NULL, postal_code = NULL, city = NULL, vat_id = NULL, updated_at = NOW() WHERE id = $1`, [userId, anonEmail, DELETED]);
    tables.push("users");

    // Kat A: Worker profiles
    const { rows: wpRes } = await client.query(`UPDATE worker_profiles SET first_name = $2, last_name = $2, phone = NULL, street = NULL, postal_code = NULL, city = NULL, date_of_birth = NULL, iban_last4 = NULL, updated_at = NOW() WHERE user_id = $1 RETURNING id`, [userId, DELETED]);
    if (wpRes.length) tables.push("worker_profiles");

    // Kat A: Worker invites — nur Einladungen AN diese Person (ihre E-Mail).
    // Frueher stand hier `created_by = $1` — die Spalte existiert nicht
    // (worker_invites hat invited_by), der Wurf rollte die GESAMTE
    // Anonymisierung zurueck. Von der Person VERSENDETE Einladungen bleiben
    // bewusst stehen: sie enthalten die Daten ANDERER (eingeladener) Personen,
    // und invited_by zeigt danach auf den bereits anonymisierten User.
    await client.query("DELETE FROM worker_invites WHERE LOWER(email) = LOWER($1)", [originalEmail]);
    tables.push("worker_invites");

    // Kat A: Company profiles / contacts
    const { rows: cpRes } = await client.query(`UPDATE company_profiles SET contact_email = NULL, contact_phone = NULL, linkedin_url = NULL WHERE user_id = $1 RETURNING id`, [userId]);
    if (cpRes.length) {
      tables.push("company_profiles");
      // company_contacts.company_profile_id gibt es nicht — die Tabelle haengt
      // direkt an user_id (geprueft 2026-08-13).
      await client.query(`UPDATE company_contacts SET name = $2, email = NULL, phone = NULL WHERE user_id = $1`, [userId, ANON]);
      tables.push("company_contacts");
    }

    // Kat B: Anonymisiere Personenreferenzen (FK bleibt, aber Name/Kontakt weg)
    // `created_by` gibt es in `offers` nicht — der Urheber ist supplier_company_id.
    await client.query(`UPDATE offers SET contact_name = $2, contact_phone = NULL WHERE supplier_company_id = $1`, [userId, ANON]);
    tables.push("offers");

    // `sender_id` gibt es in `requests` nicht — der Absender ist requester_id.
    await client.query(`UPDATE requests SET contact_email = NULL, contact_phone = NULL WHERE requester_id = $1`, [userId]);
    tables.push("requests");

    // Kat D: Sessions + Notifications löschen.
    // Praeziser JSON-Pfad statt LIKE ueber den serialisierten Blob (P5.1-Rest):
    // LIKE '%<userId>%' war ein Full-Scan mit False-Positive-Risiko (UUID als
    // Substring in fremden Session-Inhalten). express-session legt userId
    // top-level im sess-JSON ab.
    await client.query("DELETE FROM session WHERE sess->>'userId' = $1", [userId]);
    tables.push("session");

    await client.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
    tables.push("notifications");

    // Audit-Log Eintrag (Kat C — append-only, NICHT löschbar)
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, created_at)
       VALUES ($1, 'dsgvo.anonymize', 'user', $2, $3, NOW())`,
      [actorId, userId, JSON.stringify({ anonymized_tables: tables })]
    );

    return { tables, originalEmail };
  });

  // email = Original-Adresse VOR der Anonymisierung: Aufrufer (DELETE /me)
  // brauchen sie fuer die Abschieds-Mail — aus users ist sie danach nicht
  // mehr lesbar, dort steht bereits deleted_*@anonymized.local.
  return { success: true, anonymized_tables: anonymized, user_id: userId, email: originalEmail || null };
}

/**
 * Worker-spezifische Löschung (Supplier-Admin löscht Worker-Daten).
 */
export async function deleteWorkerData(pool, workerUserId, actorId) {
  const anonymized = await withTransaction(pool, async (client) => {
    const tables = [];

    await client.query(`UPDATE worker_profiles SET first_name = '[Gelöscht]', last_name = '[Gelöscht]', phone = NULL, street = NULL, postal_code = NULL, city = NULL, date_of_birth = NULL, iban_last4 = NULL, is_active = FALSE, updated_at = NOW() WHERE user_id = $1`, [workerUserId]);
    tables.push("worker_profiles");

    // Hier ist die Subquery korrekt: deleteWorkerData anonymisiert users NICHT,
    // die Original-E-Mail steht also noch. LOWER beidseitig fuer Robustheit.
    await client.query("DELETE FROM worker_invites WHERE LOWER(email) IN (SELECT LOWER(email) FROM users WHERE id = $1)", [workerUserId]);
    tables.push("worker_invites");

    await client.query("DELETE FROM notifications WHERE user_id = $1", [workerUserId]);
    tables.push("notifications");

    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, created_at)
       VALUES ($1, 'dsgvo.delete_worker', 'user', $2, $3, NOW())`,
      [actorId, workerUserId, JSON.stringify({ anonymized_tables: tables })]
    );

    return tables;
  });

  return { success: true, anonymized_tables: anonymized, worker_user_id: workerUserId };
}

/* ── Retention ─────────────────────────────────────────────────────────── */

export function getRetentionPolicies() {
  return RETENTION_POLICIES;
}

export async function getRetentionStatus(pool, orgId) {
  const status = {};

  // supplier_org_id, nicht org_id — die falsche Spalte lief monatelang still
  // ins Leere (safeQuery schluckte den Fehler), Status zeigte immer 0.
  // Kriterium identisch mit executeRetentionCleanup (Dry-Run-Wahrheit):
  // nur tote Invites (expired/revoked/pending mit abgelaufenem Token).
  const [invites] = await safeQuery(pool, "SELECT COUNT(*)::int AS c FROM worker_invites WHERE supplier_org_id = $1 AND created_at < NOW() - INTERVAL '90 days' AND (status IN ('expired','revoked') OR (status = 'pending' AND expires_at < NOW()))", [orgId]);
  status.expired_invites = invites?.c || 0;

  const [notifs] = await safeQuery(pool, "SELECT COUNT(*)::int AS c FROM notifications WHERE user_id IN (SELECT user_id FROM org_memberships WHERE org_id = $1) AND is_read = TRUE AND created_at < NOW() - INTERVAL '180 days'", [orgId]);
  status.old_read_notifications = notifs?.c || 0;

  const [sessions] = await safeQuery(pool, "SELECT COUNT(*)::int AS c FROM session WHERE expire < NOW()", []);
  status.expired_sessions = sessions?.c || 0;

  const [idKeys] = await safeQuery(pool, "SELECT COUNT(*)::int AS c FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '7 days'", []);
  status.expired_idempotency_keys = idKeys?.c || 0;

  return status;
}

export async function executeRetentionCleanup(pool, orgId, dryRun = true) {
  const results = {};

  if (dryRun) {
    return { dry_run: true, would_delete: await getRetentionStatus(pool, orgId) };
  }

  // supplier_org_id (Mig 029) — mit org_id loeschte die 90-Tage-Retention
  // faktisch nie etwas. accepted bleibt IMMER stehen: der Bulk-Invite-Dedup
  // (bulkCreateWorkerInvites) prueft "schon registriert" bewusst NUR gegen
  // invite.status='accepted' — nicht gegen users.is_verified, das durch
  // CSV-Import-Konten nicht belastbar ist. Ohne die accepted-Zeile wuerde ein
  // CSV-Re-Upload laengst registrierte Worker erneut einladen (und deren
  // Accept ueberschriebe per ON CONFLICT das bestehende Passwort). DSGVO
  // kostet das nichts: dieselben Daten liegen in users/worker_profiles;
  // Loesch-Flows (anonymizeUser/deleteWorkerData) raeumen Invites separat.
  // Geloescht wird nur, was tot ist: expired/revoked sowie pending mit
  // abgelaufenem Token (Mig-159-Teilindex betrifft nur pending — kollisionsfrei).
  const r1 = await safeQuery(pool, "DELETE FROM worker_invites WHERE supplier_org_id = $1 AND created_at < NOW() - INTERVAL '90 days' AND (status IN ('expired','revoked') OR (status = 'pending' AND expires_at < NOW())) RETURNING id", [orgId]);
  results.deleted_invites = r1.length;

  const r2 = await safeQuery(pool, "DELETE FROM notifications WHERE user_id IN (SELECT user_id FROM org_memberships WHERE org_id = $1) AND is_read = TRUE AND created_at < NOW() - INTERVAL '180 days' RETURNING id", [orgId]);
  results.deleted_notifications = r2.length;

  const r3 = await safeQuery(pool, "DELETE FROM session WHERE expire < NOW() RETURNING sid", []);
  results.deleted_sessions = r3.length;

  // RETURNING key — die Tabelle hat kein id (PK ist key); mit RETURNING id
  // schlug auch diese Bereinigung still fehl (vom DB-Smoke-Test gefunden).
  const r4 = await safeQuery(pool, "DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '7 days' RETURNING key", []);
  results.deleted_idempotency_keys = r4.length;

  return { dry_run: false, deleted: results };
}

/* ── DSGVO-Anfragen-Tracking ──────────────────────────────────────────── */

export async function createDataRequest(pool, { orgId, requestType, subjectType, subjectId, requestedBy, notes }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO data_governance_requests (org_id, request_type, subject_type, subject_id, requested_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, requestType, subjectType, subjectId || null, requestedBy, notes || null]
  );
  return row;
}

export async function listDataRequests(pool, orgId, filters = {}) {
  const params = [orgId];
  const where = ["dgr.org_id = $1"];
  let idx = 2;

  if (filters.status) { where.push(`dgr.status = $${idx}`); params.push(filters.status); idx++; }
  if (filters.requestType) { where.push(`dgr.request_type = $${idx}`); params.push(filters.requestType); idx++; }

  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT dgr.*, u.email AS requested_by_email, cu.email AS completed_by_email
     FROM data_governance_requests dgr
     LEFT JOIN users u ON u.id = dgr.requested_by
     LEFT JOIN users cu ON cu.id = dgr.completed_by
     WHERE ${where.join(" AND ")}
     ORDER BY dgr.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  const { rows: [countRow] } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM data_governance_requests dgr WHERE ${where.join(" AND ")}`,
    params.slice(0, idx - 1)
  );

  return { items: rows, total: countRow?.total || 0 };
}

export async function completeDataRequest(pool, requestId, actorId, resultSummary = null) {
  const { rows: [row] } = await pool.query(
    `UPDATE data_governance_requests
     SET status = 'completed', completed_by = $2, completed_at = NOW(), result_summary = $3
     WHERE id = $1 AND status IN ('pending', 'in_progress')
     RETURNING *`,
    [requestId, actorId, resultSummary ? JSON.stringify(resultSummary) : null]
  );
  return row || null;
}
