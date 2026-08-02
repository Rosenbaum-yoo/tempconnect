/**
 * scim.test.js — SCIM 2.0 User-Provisioning (Welle B2).
 * Pure-Mapper, Service (Transaktions-Mock-Pool), Route (flag OFF/ON, Auth/Scope, Provision).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toScimUser, parseUserNameFilter, extractActiveFromPatch, extractEnterpriseAttrs,
  listUsers, getUser, provisionUser, setMembershipActive, setMembershipHrAttributes,
  SCIM_USER_SCHEMA, SCIM_LIST_SCHEMA, SCIM_ENTERPRISE_SCHEMA
} from "../services/scimService.js";
import { createScimRouter } from "../routes/scim.js";

/* Mock-Pool: query + connect().query laufen über denselben handler(sql, params). */
function mkPool(handler) {
  const calls = [];
  const query = async (sql, params = []) => { calls.push({ sql: String(sql), params }); return (handler && handler(String(sql), params)) || { rows: [], rowCount: 0 }; };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

describe("scimService — Mapper/Parser", () => {
  it("toScimUser bildet users-Row korrekt ab", () => {
    const u = toScimUser({ id: "u1", email: "max@firma.de", company_name: "Max Mustermann", membership_active: true }, "https://x");
    assert.deepEqual(u.schemas, [SCIM_USER_SCHEMA]);
    assert.equal(u.userName, "max@firma.de");
    assert.equal(u.active, true);
    assert.equal(u.name.givenName, "Max");
    assert.equal(u.name.familyName, "Mustermann");
    assert.match(u.meta.location, /\/api\/scim\/v2\/Users\/u1$/);
    assert.equal(u.emails[0].value, "max@firma.de");
  });
  it("active=false bei inaktiver Mitgliedschaft", () => {
    assert.equal(toScimUser({ id: "u1", email: "a@b.de", membership_active: false }).active, false);
  });
  it("parseUserNameFilter", () => {
    assert.equal(parseUserNameFilter('userName eq "a@b.de"'), "a@b.de");
    assert.equal(parseUserNameFilter('userName EQ "X@Y.de"'), "X@Y.de");
    assert.equal(parseUserNameFilter("displayName eq \"x\""), null);
    assert.equal(parseUserNameFilter(null), null);
  });
  it("extractActiveFromPatch: Operations + simpler Body", () => {
    assert.equal(extractActiveFromPatch({ Operations: [{ op: "replace", path: "active", value: false }] }), false);
    assert.equal(extractActiveFromPatch({ Operations: [{ op: "replace", value: { active: true } }] }), true);
    assert.equal(extractActiveFromPatch({ active: false }), false);
    assert.equal(extractActiveFromPatch({ foo: 1 }), null);
  });
});

describe("scimService — DB-Operationen (Mock-Pool)", () => {
  it("listUsers liefert total + resources, mit userName-Filter", async () => {
    const pool = mkPool((sql) => {
      if (/COUNT\(\*\)/.test(sql)) return { rows: [{ n: 1 }] };
      if (/FROM org_memberships m JOIN users u/.test(sql)) return { rows: [{ id: "u1", email: "a@b.de", company_name: "A B", membership_active: true }] };
      return { rows: [] };
    });
    const { total, resources } = await listUsers(pool, "org-1", { filterEmail: "a@b.de" });
    assert.equal(total, 1);
    assert.equal(resources[0].email, "a@b.de");
    // Filter muss als LOWER(email)=$2 mit org_id=$1 laufen:
    const sel = pool.calls.find((c) => /JOIN users u/.test(c.sql) && /LOWER\(u\.email\)/.test(c.sql));
    assert.ok(sel, "gefilterte Query erwartet");
    assert.equal(sel.params[0], "org-1");
  });

  it("getUser null wenn nicht in Org", async () => {
    const pool = mkPool(() => ({ rows: [] }));
    assert.equal(await getUser(pool, "org-1", "u-x"), null);
  });

  it("provisionUser: neuer Nutzer → created=true, transaktional, org-gebunden", async () => {
    let inserted = false;
    const pool = mkPool((sql) => {
      if (/SELECT id FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: inserted ? [{ id: "u-new" }] : [] };
      if (/INSERT INTO users/.test(sql)) { inserted = true; return { rows: [{ id: "u-new" }] }; }
      if (/SELECT u\.id, u\.email/.test(sql)) return { rows: [{ id: "u-new", email: "neu@firma.de", company_name: "Neu", membership_active: true }] };
      return { rows: [], rowCount: 1 };
    });
    const { row, created } = await provisionUser(pool, "org-1", { userName: "Neu@Firma.de", displayName: "Neu" });
    assert.equal(created, true);
    assert.equal(row.email, "neu@firma.de");
    // Transaktion + Membership-Insert org-gebunden:
    assert.ok(pool.calls.some((c) => /BEGIN/.test(c.sql)) && pool.calls.some((c) => /COMMIT/.test(c.sql)));
    const mem = pool.calls.find((c) => /INSERT INTO org_memberships/.test(c.sql));
    assert.ok(mem && mem.params.includes("org-1"));
    // E-Mail wird klein geschrieben:
    const ins = pool.calls.find((c) => /INSERT INTO users/.test(c.sql));
    assert.equal(ins.params[0], "neu@firma.de");
  });

  it("provisionUser: bestehender Nutzer → created=false (kein User-INSERT)", async () => {
    const pool = mkPool((sql) => {
      if (/SELECT id FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: [{ id: "u-exist" }] };
      if (/SELECT u\.id, u\.email/.test(sql)) return { rows: [{ id: "u-exist", email: "da@firma.de", company_name: "Da", membership_active: true }] };
      return { rows: [], rowCount: 1 };
    });
    const { created } = await provisionUser(pool, "org-1", { userName: "da@firma.de" });
    assert.equal(created, false);
    assert.ok(!pool.calls.some((c) => /INSERT INTO users/.test(c.sql)), "kein User-INSERT bei Bestand");
  });

  it("provisionUser: ungültige E-Mail → INVALID_USERNAME", async () => {
    const pool = mkPool(() => ({ rows: [] }));
    await assert.rejects(() => provisionUser(pool, "org-1", { userName: "keine-email" }), /INVALID_USERNAME/);
  });

  it("setMembershipActive: null wenn keine Mitgliedschaft", async () => {
    const pool = mkPool(() => ({ rowCount: 0 }));
    assert.equal(await setMembershipActive(pool, "org-1", "u-x", false), null);
  });
});

describe("scimService — Enterprise-Extension (SAP/HR-Feldmapping)", () => {
  it("toScimUser hängt enterprise:2.0 an, wenn HRIS-Attribute gesetzt sind", () => {
    const u = toScimUser({ id: "u1", email: "a@b.de", company_name: "A B", membership_active: true,
      employee_number: "P-00042", cost_center: "KST-4711", hr_department: "Pflege Station 3", division: "Süd" });
    assert.deepEqual(u.schemas, [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_SCHEMA]);
    const ext = u[SCIM_ENTERPRISE_SCHEMA];
    assert.equal(ext.employeeNumber, "P-00042");
    assert.equal(ext.costCenter, "KST-4711");
    assert.equal(ext.department, "Pflege Station 3");
    assert.equal(ext.division, "Süd");
  });
  it("toScimUser ohne HRIS-Attribute → nur Core-Schema, keine Extension", () => {
    const u = toScimUser({ id: "u1", email: "a@b.de", membership_active: true });
    assert.deepEqual(u.schemas, [SCIM_USER_SCHEMA]);
    assert.equal(u[SCIM_ENTERPRISE_SCHEMA], undefined);
  });
  it("extractEnterpriseAttrs: direkter Body (POST/PUT) → Spalten-Mapping, fremde Felder ignoriert", () => {
    const got = extractEnterpriseAttrs({ [SCIM_ENTERPRISE_SCHEMA]: { employeeNumber: "P1", costCenter: "K1", department: "D1", division: "V1", manager: { value: "x" } } });
    assert.deepEqual(got, { employee_number: "P1", cost_center: "K1", hr_department: "D1", division: "V1" });
  });
  it("extractEnterpriseAttrs: PatchOp path-präfix UND value-Objekt", () => {
    const byPath = extractEnterpriseAttrs({ Operations: [{ op: "replace", path: SCIM_ENTERPRISE_SCHEMA + ":costCenter", value: "K9" }] });
    assert.deepEqual(byPath, { cost_center: "K9" });
    const byValue = extractEnterpriseAttrs({ Operations: [{ op: "replace", value: { [SCIM_ENTERPRISE_SCHEMA]: { department: "Notdienst" } } }] });
    assert.deepEqual(byValue, { hr_department: "Notdienst" });
  });
  it("extractEnterpriseAttrs: leerer/fremder Body → {}", () => {
    assert.deepEqual(extractEnterpriseAttrs(null), {});
    assert.deepEqual(extractEnterpriseAttrs({ active: false }), {});
  });
  it("provisionUser schreibt HRIS-Attribute in org_memberships (org-gebunden)", async () => {
    let inserted = false;
    const pool = mkPool((sql) => {
      if (/SELECT id FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: inserted ? [{ id: "u-new" }] : [] };
      if (/INSERT INTO users/.test(sql)) { inserted = true; return { rows: [{ id: "u-new" }] }; }
      if (/SELECT u\.id, u\.email/.test(sql)) return { rows: [{ id: "u-new", email: "neu@firma.de", company_name: "Neu", membership_active: true, cost_center: "KST-4711" }] };
      return { rows: [], rowCount: 1 };
    });
    const { row } = await provisionUser(pool, "org-1", { userName: "neu@firma.de", enterprise: { cost_center: "KST-4711", employee_number: "P-00042" } });
    assert.equal(row.cost_center, "KST-4711");
    const upd = pool.calls.find((c) => /UPDATE org_memberships SET/.test(c.sql) && /cost_center/.test(c.sql));
    assert.ok(upd, "HRIS-UPDATE erwartet");
    assert.ok(upd.params.includes("KST-4711") && upd.params.includes("org-1"), "org-gebunden + Wert gesetzt");
  });
  it("setMembershipHrAttributes: UPDATE gesetzter Felder, null wenn nicht in Org", async () => {
    const none = mkPool(() => ({ rowCount: 0 }));
    assert.equal(await setMembershipHrAttributes(none, "org-1", "u-x", { cost_center: "K1" }), null);
  });
  it("setMembershipHrAttributes: leeres enterprise → kein UPDATE, gibt Row zurück", async () => {
    const pool = mkPool((sql) => /SELECT u\.id, u\.email/.test(sql) ? { rows: [{ id: "u1", email: "a@b.de", membership_active: true }] } : { rows: [], rowCount: 0 });
    const row = await setMembershipHrAttributes(pool, "org-1", "u1", {});
    assert.ok(row && row.id === "u1");
    assert.ok(!pool.calls.some((c) => /UPDATE org_memberships SET/.test(c.sql)), "kein UPDATE bei leerem enterprise");
  });
});

describe("SCIM-Router — Gate/Auth/Scope", () => {
  const deps = (cfg, pool) => ({ pool: pool || mkPool(() => ({ rows: [] })), config: { BASE_URL: "https://x", ...cfg }, logger: { error() {}, info() {} } });
  function run(router, method, path, req) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    assert.ok(layer, `Route ${method} ${path}`);
    const stack = layer.route.stack;
    return new Promise((resolve) => {
      let status = 200, captured = null;
      const done = () => resolve({ status, body: captured == null ? null : (typeof captured === "string" ? (() => { try { return JSON.parse(captured); } catch { return captured; } })() : captured) });
      const res = {
        status(c) { status = c; return this; }, type() { return this; },
        send(b) { captured = b; done(); return this; },   // scim.js send() → JSON-String
        json(b) { captured = b; done(); return this; },    // requireScope → Objekt
        end() { done(); return this; }
      };
      let i = 0;
      const next = () => { const l = stack[i++]; if (l) return l.handle(req, res, next); };
      Promise.resolve(next()).catch(() => done());
    });
  }

  it("Flag AUS → 404 (Endpoint inert)", async () => {
    const r = createScimRouter(deps({ SCIM_ENABLED: false }));
    const out = await run(r, "get", "/scim/v2/Users", { isApiKeyAuth: true, orgId: "org-1", apiKeyScopes: ["admin:scim"], query: {}, headers: {} });
    assert.equal(out.status, 404);
  });

  it("Flag AN ohne API-Key-Auth → 401", async () => {
    const r = createScimRouter(deps({ SCIM_ENABLED: true }));
    const out = await run(r, "get", "/scim/v2/Users", { isApiKeyAuth: false, query: {}, headers: {} });
    assert.equal(out.status, 401);
  });

  it("Flag AN + Auth aber Scope fehlt → 403", async () => {
    const r = createScimRouter(deps({ SCIM_ENABLED: true }));
    const out = await run(r, "get", "/scim/v2/Users", { isApiKeyAuth: true, orgId: "org-1", apiKeyScopes: ["read:invoices"], query: {}, headers: {} });
    assert.equal(out.status, 403);
  });

  it("Flag AN + Auth + admin:scim → ListResponse", async () => {
    const pool = mkPool((sql) => {
      if (/COUNT/.test(sql)) return { rows: [{ n: 1 }] };
      if (/JOIN users u/.test(sql)) return { rows: [{ id: "u1", email: "a@b.de", company_name: "A B", membership_active: true }] };
      return { rows: [] };
    });
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const out = await run(r, "get", "/scim/v2/Users", { isApiKeyAuth: true, orgId: "org-1", apiKeyScopes: ["admin:scim"], query: {}, headers: {} });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body.schemas, [SCIM_LIST_SCHEMA]);
    assert.equal(out.body.totalResults, 1);
    assert.equal(out.body.Resources[0].userName, "a@b.de");
  });

  it("ServiceProviderConfig erreichbar bei Flag AN", async () => {
    const r = createScimRouter(deps({ SCIM_ENABLED: true }));
    const out = await run(r, "get", "/scim/v2/ServiceProviderConfig", { headers: {} });
    assert.equal(out.status, 200);
    assert.equal(out.body.filter.supported, true);
  });

  it("POST mit enterprise:2.0 → provisioniert + Extension in Antwort (201)", async () => {
    let inserted = false;
    const pool = mkPool((sql) => {
      if (/SELECT id FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: inserted ? [{ id: "u-new" }] : [] };
      if (/INSERT INTO users/.test(sql)) { inserted = true; return { rows: [{ id: "u-new" }] }; }
      if (/SELECT u\.id, u\.email/.test(sql)) return { rows: [{ id: "u-new", email: "neu@firma.de", company_name: "Neu", membership_active: true, cost_center: "KST-4711", employee_number: "P-1" }] };
      return { rows: [], rowCount: 1 };
    });
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const body = { userName: "neu@firma.de", [SCIM_ENTERPRISE_SCHEMA]: { costCenter: "KST-4711", employeeNumber: "P-1" } };
    // _body:true → express.json short-circuit (kein Stream-Read im Harness).
    const out = await run(r, "post", "/scim/v2/Users", { isApiKeyAuth: true, orgId: "org-1", apiKeyScopes: ["admin:scim"], body, _body: true, headers: { "content-type": "application/scim+json" } });
    assert.equal(out.status, 201);
    assert.equal(out.body[SCIM_ENTERPRISE_SCHEMA].costCenter, "KST-4711");
  });

  it("PATCH mit enterprise:2.0 → aktualisiert Kostenstelle (200)", async () => {
    const pool = mkPool((sql) => {
      if (/UPDATE org_memberships SET/.test(sql)) return { rowCount: 1 };
      if (/SELECT u\.id, u\.email/.test(sql)) return { rows: [{ id: "u1", email: "a@b.de", company_name: "A B", membership_active: true, cost_center: "KST-9" }] };
      return { rows: [], rowCount: 0 };
    });
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const body = { Operations: [{ op: "replace", path: SCIM_ENTERPRISE_SCHEMA + ":costCenter", value: "KST-9" }] };
    const out = await run(r, "patch", "/scim/v2/Users/:id", { isApiKeyAuth: true, orgId: "org-1", apiKeyScopes: ["admin:scim"], params: { id: "u1" }, body, _body: true, headers: { "content-type": "application/scim+json" } });
    assert.equal(out.status, 200);
    assert.equal(out.body[SCIM_ENTERPRISE_SCHEMA].costCenter, "KST-9");
  });
});

/**
 * Audit-Trail (Produktionspfeiler 5): JEDE mutierende SCIM-Aktion schreibt action,
 * entity_type, entity_id und details.responsible_actor_user_id.
 * SCIM laeuft maschinell (API-Key/M2M) — verantwortlicher Akteur ist der Mensch,
 * der den Key angelegt hat (org_api_keys.created_by → req.apiKeyOwnerUserId).
 */
describe("SCIM-Router — Audit-Trail", () => {
  const deps = (cfg, pool) => ({ pool: pool || mkPool(() => ({ rows: [] })), config: { BASE_URL: "https://x", ...cfg }, logger: { error() {}, info() {} } });

  function run(router, method, path, req) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    assert.ok(layer, `Route ${method} ${path}`);
    const stack = layer.route.stack;
    return new Promise((resolve) => {
      let status = 200, captured = null;
      const done = () => resolve({ status, body: captured });
      const res = {
        status(c) { status = c; return this; }, type() { return this; },
        send(b) { captured = b; done(); return this; },
        json(b) { captured = b; done(); return this; },
        end() { done(); return this; }
      };
      let i = 0;
      const next = () => { const l = stack[i++]; if (l) return l.handle(req, res, next); };
      Promise.resolve(next()).catch(() => done());
    });
  }

  /** Mutations-Pool: Membership-Update + Re-Read liefern eine Zeile zurueck. */
  const mutationPool = (onAudit) => mkPool((sql) => {
    if (/INSERT INTO audit_log/.test(sql) && onAudit) return onAudit();
    if (/UPDATE org_memberships SET/.test(sql)) return { rowCount: 1 };
    if (/SELECT u\.id, u\.email/.test(sql)) return { rows: [{ id: "u1", email: "a@b.de", company_name: "A B", membership_active: true, cost_center: "KST-9" }] };
    return { rows: [], rowCount: 0 };
  });

  const scimReq = (over = {}) => ({
    isApiKeyAuth: true, orgId: "org-1", apiKeyScopes: ["admin:scim"],
    apiKeyId: "key-1", apiKeyOwnerUserId: "owner-1",
    params: { id: "u1" }, _body: true, ip: "10.0.0.9",
    headers: { "content-type": "application/scim+json", "user-agent": "Okta-SCIM/2.0" },
    ...over
  });

  /** writeAudit-INSERT aus dem Mock-Pool holen → {action, entity_type, entity_id, details, …}. */
  function auditEntries(pool) {
    return pool.calls.filter((c) => /INSERT INTO audit_log/.test(c.sql)).map((c) => ({
      actor_id: c.params[0], action: c.params[1], entity_type: c.params[2], entity_id: c.params[3],
      details: c.params[4] ? JSON.parse(c.params[4]) : null, org_id: c.params[8],
      ip_address: c.params[11], user_agent: c.params[12]
    }));
  }

  it("PATCH active:false → Audit mit action/entity/responsible_actor_user_id", async () => {
    const pool = mutationPool();
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const out = await run(r, "patch", "/scim/v2/Users/:id", scimReq({
      method: "PATCH", body: { Operations: [{ op: "replace", path: "active", value: false }] }
    }));
    assert.equal(out.status, 200);

    const entries = auditEntries(pool);
    assert.equal(entries.length, 1, "genau ein Audit-Eintrag erwartet");
    const a = entries[0];
    assert.equal(a.action, "scim.user_deactivated");
    assert.equal(a.entity_type, "user");
    assert.equal(a.entity_id, "u1");
    // Produktionspfeiler 5 — der verantwortliche Mensch muss benennbar sein:
    assert.equal(a.details.responsible_actor_user_id, "owner-1");
    assert.equal(a.actor_id, "owner-1");
    // Org-Boundary: audit_log.org_id gefuellt, nicht nur in details versteckt
    assert.equal(a.org_id, "org-1");
    // Maschinen-Herkunft nachvollziehbar (zentral aus resolveAuditActor, nicht SCIM-lokal)
    assert.equal(a.details.api_key_id, "key-1");
    assert.equal(a.details.actor_type, "api_key");
    assert.equal(a.details.via, "PATCH");
  });

  it("PUT (Replace) schreibt denselben Audit wie PATCH — geteilter Handler", async () => {
    const pool = mutationPool();
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const out = await run(r, "put", "/scim/v2/Users/:id", scimReq({
      method: "PUT", body: { active: true }
    }));
    assert.equal(out.status, 200);

    const entries = auditEntries(pool);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "scim.user_activated");
    assert.equal(entries[0].entity_id, "u1");
    assert.equal(entries[0].details.responsible_actor_user_id, "owner-1");
    assert.equal(entries[0].details.via, "PUT");
  });

  it("HR-Attribut-Update schreibt scim.user_hr_updated mit Feldliste", async () => {
    const pool = mutationPool();
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const out = await run(r, "patch", "/scim/v2/Users/:id", scimReq({
      method: "PATCH",
      body: { Operations: [{ op: "replace", path: SCIM_ENTERPRISE_SCHEMA + ":costCenter", value: "KST-9" }] }
    }));
    assert.equal(out.status, 200);

    const a = auditEntries(pool).find((e) => e.action === "scim.user_hr_updated");
    assert.ok(a, "scim.user_hr_updated erwartet");
    assert.equal(a.details.responsible_actor_user_id, "owner-1");
    assert.ok(a.details.fields.includes("cost_center"), "geaenderte Felder protokolliert");
  });

  it("M2M-JWT wird als actor_type m2m_token protokolliert", async () => {
    const pool = mutationPool();
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    await run(r, "patch", "/scim/v2/Users/:id", scimReq({
      method: "PATCH", isM2mToken: true, body: { active: false }
    }));
    assert.equal(auditEntries(pool)[0].details.actor_type, "m2m_token");
  });

  it("Key-Ersteller geloescht → als Maschine markiert, NICHT als Systemlauf lesbar", async () => {
    // created_by ist ON DELETE SET NULL. Ohne ausdrueckliche Markierung waere der Eintrag
    // (actor_id null + responsible null) von einem Cron-/Systemlauf nicht zu unterscheiden.
    const pool = mutationPool();
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    await run(r, "patch", "/scim/v2/Users/:id", scimReq({
      method: "PATCH", apiKeyOwnerUserId: undefined, body: { active: false }
    }));
    const d = auditEntries(pool)[0].details;
    assert.ok("responsible_actor_user_id" in d, "Feld muss vorhanden sein");
    assert.equal(d.responsible_actor_user_id, null);
    assert.equal(d.actor_type, "api_key", "Maschinen-Herkunft bleibt erkennbar");
    assert.equal(d.responsible_actor_unknown, true, "Luecke ist ausgewiesen, nicht kaschiert");
  });

  it("DELETE deaktiviert und auditiert", async () => {
    const pool = mutationPool();
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const out = await run(r, "delete", "/scim/v2/Users/:id", scimReq({ method: "DELETE" }));
    assert.equal(out.status, 204);
    const a = auditEntries(pool)[0];
    assert.equal(a.action, "scim.user_deactivated");
    assert.equal(a.details.via, "DELETE");
    assert.equal(a.details.responsible_actor_user_id, "owner-1");
  });

  it("Audit-Fehler kippt die SCIM-Antwort nicht (best-effort)", async () => {
    const pool = mutationPool(() => { throw new Error("audit_log down"); });
    const r = createScimRouter(deps({ SCIM_ENABLED: true }, pool));
    const out = await run(r, "patch", "/scim/v2/Users/:id", scimReq({
      method: "PATCH", body: { active: false }
    }));
    assert.equal(out.status, 200, "Provisioning darf an einem Audit-Fehler nicht scheitern");
  });
});
