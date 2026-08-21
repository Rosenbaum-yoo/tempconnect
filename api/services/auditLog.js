/**
 * Append-only audit log. Do not update or delete rows.
 * Events: capacity create/update/deactivate, reservation active/expired/converted,
 * request status changes, accept/finalize actions, login/security events.
 *
 * action_type: CREATE | UPDATE | DELETE | STATUS_CHANGE | LOGIN | ROLE_CHANGE |
 *              PERMISSION_CHANGE | APPROVAL | SUBMISSION | SECURITY | CONFIG_CHANGE
 * status:      SUCCESS | DENIED | FAILED
 */

import { OrgBoundaryError } from "../utils/orgBoundary.js";

/** Sensitive Felder die niemals in Audit-Details landen duerfen (DSGVO) */
const SENSITIVE_KEYS = /password|passwd|token|secret|hash|credit_card|iban|ssn|session/i;

/**
 * Filtert sensible Felder aus Audit-Metadaten.
 * @param {Object|null} obj
 * @returns {Object|null}
 */
export function sanitizeMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = sanitizeMetadata(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Setzt `details.responsible_actor_user_id` — die Antwort auf „wer verantwortet das?".
 *
 * WARUM DAS HIER STEHT UND NICHT IN DEN AUFRUFSTELLEN (Audit-Backlog B-5/S-3):
 * CLAUDE.md fordert das Feld fuer **jede** mutierende Aktion. Tatsaechlich setzten es
 * 7 von 319 `res.locals.audit`-Markierungen, dazu kommen 98 direkte `writeAudit()`-Aufrufe,
 * die an der Middleware vorbeigehen. Eine Regel, die an 400 Stellen einzeln befolgt werden
 * muss, wird nicht befolgt — sie wird vergessen, sobald jemand eine neue Route schreibt.
 * `writeAudit` ist der eine Punkt, durch den alles laeuft; hier gilt die Regel per Bauart.
 *
 * Vorrang hat immer der Aufrufer: setzt eine Route das Feld selbst, bleibt ihr Wert stehen.
 * Das ist der Fall, in dem Handelnder und Verantwortlicher auseinanderfallen — etwa wenn
 * Support im Auftrag eines Kunden handelt.
 *
 * Der Schluessel wird **immer** geschrieben, auch als `null`. Ein fehlendes Feld waere
 * mehrdeutig ("Systemvorgang" oder "vergessen?"); ein ausdrueckliches `null` heisst
 * eindeutig: kein Mensch, sondern Cron, Webhook oder Systemlauf — passend zu `actor_id`,
 * das dann ebenfalls leer ist.
 *
 * @param {object|null} details bereits sanitisierte Detaildaten
 * @param {string|null} actorId der handelnde Nutzer
 * @returns {object} Details mit gesetztem Verantwortlichen
 */
export function withResponsibleActor(details, actorId) {
  // Nur echte Objekte werden ergaenzt. Ein Array oder ein blosser String als `details`
  // ist zwar nicht vorgesehen, wuerde beim Umwandeln in ein Objekt aber Daten verlieren —
  // dann lieber unveraendert durchreichen als still etwas wegwerfen.
  if (details != null && (typeof details !== "object" || Array.isArray(details))) return details;
  const base = details ?? {};
  if (base.responsible_actor_user_id !== undefined) return base;
  return { ...base, responsible_actor_user_id: actorId ?? null };
}

/**
 * Ermittelt den verantwortlichen Akteur eines Requests — Session ODER Maschine.
 *
 * Warum zentral: `actor_id: req.session?.userId` deckt nur den Browser-Fall ab. Ein
 * Request per API-Key oder M2M-JWT hat KEINE Session — er lief bisher als `null` durch
 * und war damit von einem Cron-/Systemlauf nicht zu unterscheiden (siehe die Semantik in
 * `withResponsibleActor`). Bei Maschinen-Auth gibt es aber sehr wohl einen
 * Verantwortlichen: den Menschen, der den Key angelegt hat (`org_api_keys.created_by`).
 *
 * Dies ist die EINE Stelle, die das entscheidet. Beide Audit-Wege benutzen sie
 * (Auto-Middleware `auditWrite` und `writeAuditEnhanced`), damit eine neue
 * Maschinen-Schnittstelle nichts mehr nachziehen muss.
 *
 * Der Session-Fall bleibt bewusst ohne `machine`-Kontext, damit bestehende Audit-Eintraege
 * unveraendert bleiben — Zusatzinfo entsteht nur dort, wo bisher Information FEHLTE.
 *
 * @param {object} req Express-Request
 * @returns {{ actor_id: string|null, machine: object|null }}
 */
export function resolveAuditActor(req) {
  const sessionUserId = req?.session?.userId ?? null;
  if (sessionUserId) return { actor_id: sessionUserId, machine: null };

  if (req?.isApiKeyAuth) {
    const ownerUserId = req.apiKeyOwnerUserId ?? null;
    return {
      actor_id: ownerUserId,
      machine: {
        actor_type: req.isM2mToken ? "m2m_token" : "api_key",
        api_key_id: req.apiKeyId ?? null,
        // Key-Ersteller nicht (mehr) ermittelbar — z.B. Nutzer geloescht
        // (`created_by ON DELETE SET NULL`). Ausdruecklich markieren, sonst waere der
        // Eintrag von einem echten Systemlauf nicht zu unterscheiden.
        ...(ownerUserId ? {} : { responsible_actor_unknown: true })
      }
    };
  }

  return { actor_id: null, machine: null }; // echter Systemvorgang (Cron/Webhook)
}

/**
 * Mischt den Maschinen-Kontext in die Detaildaten. Ohne Maschinen-Auth unveraendert.
 * @param {object|null} details
 * @param {object|null} machine
 * @returns {object|null}
 */
/**
 * Welche Organisation gehoert auf einen Audit-Eintrag?
 *
 * NICHT die des Anfragekontexts (8.1.1, gemessen 2026-08-21). `req.orgId` wird
 * aufgeloest, BEVOR die Route laeuft — bei `/auth/login` und `/auth/register`
 * also, bevor es den angemeldeten Nutzer ueberhaupt gibt. Was dort steht, stammt
 * aus der vorherigen Sitzung desselben Browsers. Gemessen: 139 Zeilen trugen
 * eine Organisation, in der der Handelnde nie Mitglied war (103
 * `notification.mark_read`, 16 `auth.register`, 13 `auth.login`, 4 `demo.login`,
 * 3 `subscription_request.apply_approved_change`).
 *
 * Die Regel ist dieselbe wie in Welle H2: **die Grenze gehoert an die Quelle der
 * Wahrheit, nicht an den Kontext des Aufrufers.**
 *
 *   1. Ein ausdruecklich uebergebenes `org_id` gewinnt — der Aufrufer kennt die
 *      Ressource (`requisitions.org_id`, `timesheets.org_id`, …).
 *   2. Sonst `req.orgId` — aber NUR, wenn der Kontext fuer denselben Handelnden
 *      aufgeloest wurde. `orgContext` vermerkt das in `req.orgIdGiltFuerNutzer`.
 *   2b. Maschinen-Auth (API-Key/M2M): die Org steht im Schluessel und ist damit
 *      belegt — ein Sitzungsnutzer, an den sie zu binden waere, existiert nicht.
 *   3. Sonst `null`. Ein Eintrag ohne Org ist richtig, wenn die Handlung keine
 *      hat — beim Anmelden gibt es noch keine Organisation. Falsch waere, eine
 *      zu raten.
 *
 * Punkt 3 ist kein Datenverlust: der Eintrag wird geschrieben, nur ohne
 * Mandantenstempel. Ein Audit-Eintrag, der verschwindet, waere schlimmer als
 * einer, der keine Org traegt.
 *
 * @param {import('express').Request} req
 * @param {string|null} actorId  der Handelnde, wie ihn `resolveAuditActor` bestimmt
 * @param {string|null|undefined} explizit  ausdruecklich uebergebenes `org_id`
 * @returns {string|null}
 */
export function bestimmeAuditOrg(req, actorId, explizit) {
  if (explizit) return explizit;
  if (!req?.orgId) return null;
  /* Maschinen-Auth: die Organisation steht im Schluessel selbst und ist damit
   * belegt — es gibt hier keinen Sitzungsnutzer, an den sie gebunden waere.
   * `middleware/apiKeyAuth.js` setzt `isApiKeyAuth`. */
  if (req.isApiKeyAuth) return req.orgId;
  /* Ohne Vermerk laesst sich nicht sagen, fuer wen der Kontext gilt — dann lieber
   * keine Org als die falsche. Faellt nur bei Aufrufern an, die an
   * `orgContext` vorbeigehen. */
  if (!req.orgIdGiltFuerNutzer) return null;
  return req.orgIdGiltFuerNutzer === actorId ? req.orgId : null;
}

export function withMachineActor(details, machine) {
  if (!machine) return details ?? null;
  // Nicht-Objekte (Array/String) bleiben unangetastet — gleiche Regel wie withResponsibleActor.
  if (details != null && (typeof details !== "object" || Array.isArray(details))) return details;
  return { ...(details ?? {}), ...machine };
}

/**
 * Leitet action_type aus dem action-String ab.
 * @param {string} action - z.B. 'timesheet.approve', 'auth.login'
 * @returns {string}
 */
export function deriveActionType(action) {
  if (!action) return 'UPDATE';
  const a = action.toLowerCase();
  if (a.includes('login') || a.includes('logout'))              return 'LOGIN';
  if (a.includes('register') || a.includes('create') || a.includes('add')) return 'CREATE';
  if (a.includes('delete') || a.includes('remove') || a.includes('deactivate')) return 'DELETE';
  if (a.includes('approve') || a.includes('reject'))            return 'APPROVAL';
  if (a.includes('submit'))                                     return 'SUBMISSION';
  if (a.includes('role'))                                       return 'ROLE_CHANGE';
  if (a.includes('permission'))                                 return 'PERMISSION_CHANGE';
  if (a.includes('password') || a.includes('forgot') || a.includes('reset') ||
      a.includes('verify') || a.includes('lock'))               return 'SECURITY';
  if (a.includes('setting') || a.includes('config'))            return 'CONFIG_CHANGE';
  if (a.includes('accept') || a.includes('cancel') || a.includes('close') ||
      a.includes('complete') || a.includes('finalize') || a.includes('status') ||
      a.includes('return_to'))                                  return 'STATUS_CHANGE';
  if (a.includes('update') || a.includes('edit') || a.includes('patch')) return 'UPDATE';
  return 'UPDATE';
}

/**
 * @param {import('pg').Pool} pool
 * @param {Object} params
 * @param {string} params.action - e.g. capacity.create, auth.login, timesheet.approve
 * @param {string} params.entity_type - capacity | user | timesheet | ...
 * @param {string} [params.entity_id]
 * @param {Object} [params.details]
 * @param {string} [params.action_type] - AUTO-derived if not set
 * @param {string} [params.status] - SUCCESS | DENIED | FAILED (default: SUCCESS)
 * @param {string} [params.request_id]
 * @param {string} [params.capacity_id]
 * @param {string} [params.reservation_id]
 * @param {string} [params.actor_id]
 * @param {string} [params.org_id]
 * @param {Object} [params.old_values]
 * @param {Object} [params.new_values]
 * @param {string} [params.ip_address]
 * @param {string} [params.user_agent]
 */
export async function writeAudit(pool, params) {
  const a = params.action;
  const et = params.entity_type;
  const eid = params.entity_id ?? null;
  const actorId = params.actor_id ?? null;
  const details = withResponsibleActor(sanitizeMetadata(params.details ?? null), actorId);
  const rid = params.request_id ?? null;
  const cid = params.capacity_id ?? null;
  const resid = params.reservation_id ?? null;
  const actor = actorId;
  const orgId = params.org_id ?? null;
  const actionType = params.action_type || deriveActionType(a);
  const status = params.status || 'SUCCESS';
  await pool.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details,
       request_id, capacity_id, reservation_id, org_id,
       old_values, new_values, ip_address, user_agent,
       action_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [actor, a, et, eid, details ? JSON.stringify(details) : null,
     rid, cid, resid, orgId,
     params.old_values ? JSON.stringify(sanitizeMetadata(params.old_values)) : null,
     params.new_values ? JSON.stringify(sanitizeMetadata(params.new_values)) : null,
     params.ip_address ?? null,
     params.user_agent ?? null,
     actionType, status]
  );
}

/**
 * Enhanced audit write — auto-extracts IP, user-agent, org from Express request.
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req
 * @param {Object} params — same as writeAudit plus optional old_values/new_values
 */
export function writeAuditEnhanced(pool, req, params) {
  // Akteur zentral: deckt Session UND Maschinen-Auth (API-Key/M2M) ab. Ein ausdruecklich
  // uebergebener actor_id hat weiterhin Vorrang (Handelnder ≠ Verantwortlicher).
  const { actor_id, machine } = resolveAuditActor(req);
  const handelnder = params.actor_id ?? actor_id;
  return writeAudit(pool, {
    ...params,
    actor_id: handelnder,
    org_id: bestimmeAuditOrg(req, handelnder, params.org_id),
    details: withMachineActor(params.details ?? null, machine),
    ip_address: params.ip_address ?? req.ip ?? null,
    user_agent: params.user_agent ?? (req.headers?.['user-agent'] || '').slice(0, 500) ?? null
  });
}

/**
 * Compute diff between old and new objects (shallow, top-level keys only).
 * Returns { old_values, new_values } containing only changed fields.
 */
export function diffValues(oldObj, newObj) {
  if (!oldObj || !newObj) return { old_values: oldObj || null, new_values: newObj || null };
  const old_values = {};
  const new_values = {};
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const k of allKeys) {
    if (k === 'updated_at' || k === 'created_at') continue;
    const ov = oldObj[k], nv = newObj[k];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      old_values[k] = ov ?? null;
      new_values[k] = nv ?? null;
    }
  }
  return { old_values: Object.keys(old_values).length ? old_values : null,
           new_values: Object.keys(new_values).length ? new_values : null };
}

/**
 * Query audit log with filters — for admin panel.
 * Supports pagination (offset), action_type, status filters.
 * @returns {{ items: Array, total: number }}
 */
export async function queryAuditLog(pool, filters = {}) {
  const where = []; const params = []; let idx = 1;
  if (filters.actor_id)    { where.push(`al.actor_id = $${idx}`);      params.push(filters.actor_id);    idx++; }
  if (filters.org_id)      { where.push(`al.org_id = $${idx}`);        params.push(filters.org_id);      idx++; }
  if (filters.actor_search) {
    where.push(`(u.email ILIKE $${idx} OR u.contact_person ILIKE $${idx} OR u.company_name ILIKE $${idx})`);
    params.push(`%${filters.actor_search}%`);
    idx++;
  }
  if (filters.org_search) {
    where.push(`(o.name ILIKE $${idx} OR CAST(al.org_id AS text) ILIKE $${idx})`);
    params.push(`%${filters.org_search}%`);
    idx++;
  }
  if (filters.entity_type) { where.push(`al.entity_type = $${idx}`);   params.push(filters.entity_type); idx++; }
  if (filters.action)      { where.push(`al.action ILIKE $${idx}`);    params.push(`%${filters.action}%`); idx++; }
  if (filters.action_type) { where.push(`al.action_type = $${idx}`);   params.push(filters.action_type); idx++; }
  if (filters.status)      { where.push(`al.status = $${idx}`);        params.push(filters.status);      idx++; }
  if (filters.from)        { where.push(`al.created_at >= $${idx}`);   params.push(filters.from);        idx++; }
  if (filters.to)          { where.push(`al.created_at <= $${idx}`);   params.push(filters.to);          idx++; }

  const limit  = Math.min(500, parseInt(filters.limit) || 100);
  const offset = Math.max(0, parseInt(filters.offset) || 0);
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const fromClause = `
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.actor_id
    LEFT JOIN organizations o ON o.id = al.org_id
  `;

  // Total-Count fuer Frontend-Pagination
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total ${fromClause} ${whereClause}`, params
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limit);  const limitIdx = idx; idx++;
  params.push(offset); const offsetIdx = idx;
  const { rows } = await pool.query(
    `SELECT al.*, u.email AS actor_email, u.company_name AS actor_company,
            o.name AS org_name,
            u.contact_person AS actor_name
     ${fromClause}
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`, params
  );
  return { items: rows, total };
}

/**
 * Org-scoped Audit Log Query — nur Events dieser Organisation.
 * @param {import('pg').Pool} pool
 * @param {string} orgId
 * @param {Object} filters
 * @returns {{ items: Array, total: number }}
 */
export function queryOrgAuditLog(pool, orgId, filters = {}) {
  return queryAuditLog(pool, { ...filters, org_id: orgId });
}

/**
 * Letzte Aenderungen an einer bestimmten Ressource — fuer UI-Transparenz.
 * Beispiel: "Timesheet genehmigt von Max Mueller am 14.03.2026"
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BEFUND E-5 (2026-08-19) — WARUM ES ZWEI FUNKTIONEN SIND UND NICHT EINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Diese Abfrage filterte nur nach entity_type/entity_id — ohne org_id. Ihr
 * org-gebundener Aufrufer (`GET /organizations/:id/audit-log/recent-changes`)
 * pruefte `req.params.id !== req.orgId`, also die Kennung, die der Nutzer
 * selbst auf die EIGENE Org setzt; der tatsaechliche Datenwaehler war
 * `req.query.entity_id` und lief ungebremst. Ergebnis: owner/admin einer
 * beliebigen Org las old_values/new_values und die Akteur-E-Mail fremder
 * Entitaeten.
 *
 * Ein optionaler `orgId`-Parameter waere der falsche Fix: ein vergessenes
 * Argument faellt dann still auf "plattformweit" zurueck — genau die
 * Fail-open-Klasse, die den Befund erst erzeugt hat. Die plattformweite
 * Variante heisst deshalb, wie sie ist, und kann nicht versehentlich
 * getroffen werden.
 *
 * @param {import('pg').Pool} pool
 * @param {string} entityType
 * @param {string} entityId
 * @param {string} orgId — Pflicht. Fail-closed.
 * @param {number} [limit=10]
 * @returns {Array}
 */
export async function getRecentChanges(pool, entityType, entityId, orgId, limit = 10) {
  if (!orgId) throw new OrgBoundaryError("Keine Organisation zugewiesen.");
  // Bewusst `await`: der Aufrufer soll eine abgelehnte Zusage bekommen, keinen
  // synchronen Wurf — die Route faengt ueber try/catch.
  return await ladeLetzteAenderungen(pool, entityType, entityId, orgId, limit);
}

/**
 * Dieselbe Abfrage OHNE Org-Bindung — ausschliesslich fuer das Plattform-Admin
 * Panel (`/admin/audit-log/recent-changes`, hinter `requireAdmin`), das
 * mandantenuebergreifend arbeiten MUSS. Der Name ist die Warnung.
 */
export async function getRecentChangesPlatformWide(pool, entityType, entityId, limit = 10) {
  return await ladeLetzteAenderungen(pool, entityType, entityId, null, limit);
}

/** Eine Abfrage, zwei Einstiege — damit die beiden Fassungen nicht driften. */
async function ladeLetzteAenderungen(pool, entityType, entityId, orgId, limit) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const params = [entityType, String(entityId)];
  let orgFilter = "";
  if (orgId) {
    params.push(orgId);
    orgFilter = ` AND al.org_id = $${params.length}`;
  }
  params.push(safeLimit);
  const { rows } = await pool.query(
    `SELECT al.id, al.action, al.action_type, al.status, al.created_at,
            al.details, al.old_values, al.new_values,
            u.email AS actor_email, u.contact_person AS actor_name,
            u.company_name AS actor_company
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.entity_type = $1 AND al.entity_id = $2${orgFilter}
     ORDER BY al.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}
