// Support-Access CLI — Onboarding/Verwaltung von externem Support (BPO, z.B. Indien).
// Vendor-Lebenszyklus (anlegen -> verifizieren -> ggf. suspendieren) + IP-Allowlist
// + externe/interne Agenten. Externe Agenten arbeiten erst, wenn ihr Vendor
// status='active' ist (siehe requireSupportAccess + Migration 140).
import { pool } from "../db/pool.js";

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) { parsed._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) { parsed[key] = true; continue; }
    parsed[key] = next; i++;
  }
  return parsed;
}

function usage() {
  return [
    "Support-Access CLI — externes/internes Support-Onboarding",
    "",
    "Vendor (externer Support-Dienstleister, z.B. BPO):",
    "  vendor-create   --name <name> [--contract-ref <ref>]",
    "  vendor-verify   --vendor <id|name> [--performed-by <uuid|mail>]   (status -> active)",
    "  vendor-suspend  --vendor <id|name>                                (Kill-Switch: alle Agenten sofort gesperrt)",
    "  vendor-set-ips  --vendor <id|name> --cidrs <a.b.c.d/24,...|->     ('-' loescht die Allowlist)",
    "  vendor-list     [--json]",
    "",
    "Agenten:",
    "  agent-add       --user-id <uuid>|--email <mail> --role <role> [--vendor <id|name>] [--data-scope <scope>]",
    "  agent-suspend   --user-id <uuid>|--email <mail>",
    "  agent-list      [--vendor <id|name>] [--json]",
    "",
    "Rollen: internal_support_agent | internal_support_lead | support_auditor (intern)",
    "        external_support_agent | external_support_supervisor (extern, Vendor erforderlich)",
    "data-scope: full_internal | assigned_only | vendor_scoped",
    "",
    "Beispiel — India-BPO onboarden:",
    "  node scripts/support-access-cli.js vendor-create --name \"India Support BPO\" --contract-ref MSA-2026-IN",
    "  node scripts/support-access-cli.js vendor-verify --vendor \"India Support BPO\" --performed-by owner@example.com",
    "  node scripts/support-access-cli.js vendor-set-ips --vendor \"India Support BPO\" --cidrs 203.0.113.0/24",
    "  node scripts/support-access-cli.js agent-add --email agent@bpo.example --role external_support_agent --vendor \"India Support BPO\""
  ].join("\n");
}

function isUuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim()); }

const INTERNAL_ROLES = ["internal_support_agent", "internal_support_lead", "support_auditor"];
const EXTERNAL_ROLES = ["external_support_agent", "external_support_supervisor"];
const VALID_DATA_SCOPES = ["full_internal", "assigned_only", "vendor_scoped"];
const DEFAULT_DATA_SCOPE = {
  internal_support_lead: "full_internal", internal_support_agent: "assigned_only", support_auditor: "full_internal",
  external_support_agent: "vendor_scoped", external_support_supervisor: "vendor_scoped",
};

async function resolveUser({ userId, email }) {
  if (userId) {
    if (!isUuid(userId)) throw new Error("user-id ist keine gueltige UUID.");
    const { rows } = await pool.query("SELECT id, email FROM users WHERE id = $1::uuid LIMIT 1", [userId]);
    if (!rows[0]) throw new Error("User fuer user-id nicht gefunden.");
    return rows[0];
  }
  if (!email) throw new Error("Bitte --user-id oder --email angeben.");
  const { rows } = await pool.query("SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]);
  if (!rows[0]) throw new Error("User fuer email nicht gefunden.");
  return rows[0];
}

async function resolveActor(value) {
  if (!value) return null;
  const col = isUuid(value) ? "id = $1::uuid" : "LOWER(email) = LOWER($1)";
  const { rows } = await pool.query(`SELECT id FROM users WHERE ${col} LIMIT 1`, [value]);
  return rows[0]?.id || null;
}

async function resolveVendor(value) {
  if (!value || value === true) throw new Error("Bitte --vendor <id|name> angeben.");
  const byId = isUuid(value);
  const { rows } = await pool.query(
    byId
      ? "SELECT id, name, status FROM support_vendors WHERE id = $1::uuid LIMIT 1"
      : "SELECT id, name, status FROM support_vendors WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [value]
  );
  if (!rows[0]) throw new Error(`Vendor nicht gefunden: ${value}`);
  return rows[0];
}

async function cmdVendorCreate(args) {
  const name = args.name && args.name !== true ? String(args.name).trim() : "";
  if (!name) throw new Error("Bitte --name angeben.");
  const contractRef = args["contract-ref"] && args["contract-ref"] !== true ? String(args["contract-ref"]) : null;
  const { rows } = await pool.query(
    `INSERT INTO support_vendors (name, contract_ref, is_active, status)
     VALUES ($1, $2, FALSE, 'pending') RETURNING id, name, contract_ref, status, is_active`,
    [name, contractRef]
  );
  return { action: "vendor-create", vendor: rows[0], hint: "Naechster Schritt: vendor-verify, um den Vendor freizugeben." };
}

async function cmdVendorVerify(args) {
  const vendor = await resolveVendor(args.vendor);
  const performedBy = await resolveActor(args["performed-by"]);
  const { rows } = await pool.query(
    `UPDATE support_vendors
        SET status = 'active', is_active = TRUE, verified_at = NOW(), verified_by = $2::uuid, updated_at = NOW()
      WHERE id = $1::uuid
    RETURNING id, name, status, is_active, verified_at, verified_by`,
    [vendor.id, performedBy]
  );
  return { action: "vendor-verify", vendor: rows[0] };
}

async function cmdVendorSuspend(args) {
  const vendor = await resolveVendor(args.vendor);
  const { rows } = await pool.query(
    `UPDATE support_vendors SET status = 'suspended', is_active = FALSE, updated_at = NOW()
      WHERE id = $1::uuid RETURNING id, name, status, is_active`,
    [vendor.id]
  );
  return { action: "vendor-suspend", vendor: rows[0], note: "Kill-Switch aktiv: alle externen Agenten dieses Vendors sind sofort gesperrt." };
}

async function cmdVendorSetIps(args) {
  const vendor = await resolveVendor(args.vendor);
  const raw = args.cidrs && args.cidrs !== true ? String(args.cidrs) : "";
  const cidrs = raw === "-" ? [] : raw.split(",").map((s) => s.trim()).filter(Boolean);
  // Einfache CIDR-Plausibilitaet (IPv4 + optionale /Maske).
  for (const c of cidrs) {
    if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(c)) throw new Error(`Ungueltiges CIDR: ${c}`);
  }
  const { rows } = await pool.query(
    `UPDATE support_vendors SET allowed_ip_cidrs = $2::text[], updated_at = NOW()
      WHERE id = $1::uuid RETURNING id, name, allowed_ip_cidrs`,
    [vendor.id, cidrs]
  );
  return { action: "vendor-set-ips", vendor: rows[0], note: cidrs.length === 0 ? "Allowlist geleert (keine IP-Beschraenkung)." : `Zugriff nur aus ${cidrs.length} Netz(en).` };
}

async function cmdVendorList(_args) {
  const { rows } = await pool.query(
    `SELECT v.id, v.name, v.contract_ref, v.status, v.is_active, v.allowed_ip_cidrs, v.verified_at,
            (SELECT COUNT(*) FROM support_agents a WHERE a.vendor_id = v.id AND a.is_active = TRUE)::int AS active_agents
       FROM support_vendors v ORDER BY v.created_at DESC`
  );
  return { action: "vendor-list", total: rows.length, items: rows };
}

async function cmdAgentAdd(args) {
  const role = String(args.role || "").trim();
  if (![...INTERNAL_ROLES, ...EXTERNAL_ROLES].includes(role)) {
    throw new Error(`Ungueltige Rolle. Erlaubt: ${[...INTERNAL_ROLES, ...EXTERNAL_ROLES].join(", ")}`);
  }
  const isExternal = EXTERNAL_ROLES.includes(role);
  const scope = isExternal ? "external" : "internal";
  let vendorId = null;
  if (isExternal) {
    const vendor = await resolveVendor(args.vendor);
    vendorId = vendor.id;
  }
  const dataScope = args["data-scope"] && args["data-scope"] !== true ? String(args["data-scope"]) : DEFAULT_DATA_SCOPE[role];
  if (!VALID_DATA_SCOPES.includes(dataScope)) throw new Error(`Ungueltiger data-scope. Erlaubt: ${VALID_DATA_SCOPES.join(", ")}`);

  const user = await resolveUser({ userId: args["user-id"], email: args.email });
  const existing = await pool.query("SELECT id FROM support_agents WHERE user_id = $1::uuid LIMIT 1", [user.id]);
  let rows;
  if (existing.rows[0]) {
    ({ rows } = await pool.query(
      `UPDATE support_agents SET role = $2, scope = $3, vendor_id = $4::uuid, data_scope = $5, is_active = TRUE, updated_at = NOW()
        WHERE user_id = $1::uuid RETURNING id, user_id, role, scope, vendor_id, data_scope, is_active`,
      [user.id, role, scope, vendorId, dataScope]
    ));
  } else {
    ({ rows } = await pool.query(
      `INSERT INTO support_agents (user_id, role, scope, vendor_id, data_scope, is_active)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, TRUE)
       RETURNING id, user_id, role, scope, vendor_id, data_scope, is_active`,
      [user.id, role, scope, vendorId, dataScope]
    ));
  }
  return { action: "agent-add", user_email: user.email, agent: rows[0] };
}

async function cmdAgentSuspend(args) {
  const user = await resolveUser({ userId: args["user-id"], email: args.email });
  const { rows, rowCount } = await pool.query(
    `UPDATE support_agents SET is_active = FALSE, updated_at = NOW()
      WHERE user_id = $1::uuid RETURNING id, user_id, role, is_active`,
    [user.id]
  );
  return { action: "agent-suspend", user_email: user.email, updated: rowCount > 0, agent: rows[0] || null };
}

async function cmdAgentList(args) {
  let vendorId = null;
  if (args.vendor && args.vendor !== true) vendorId = (await resolveVendor(args.vendor)).id;
  const { rows } = await pool.query(
    `SELECT a.id, u.email, a.role, a.scope, a.data_scope, a.is_active, v.name AS vendor_name
       FROM support_agents a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN support_vendors v ON v.id = a.vendor_id
      ${vendorId ? "WHERE a.vendor_id = $1::uuid" : ""}
      ORDER BY a.is_active DESC, a.created_at DESC`,
    vendorId ? [vendorId] : []
  );
  return { action: "agent-list", total: rows.length, items: rows };
}

const COMMANDS = {
  "vendor-create": cmdVendorCreate, "vendor-verify": cmdVendorVerify, "vendor-suspend": cmdVendorSuspend,
  "vendor-set-ips": cmdVendorSetIps, "vendor-list": cmdVendorList,
  "agent-add": cmdAgentAdd, "agent-suspend": cmdAgentSuspend, "agent-list": cmdAgentList,
};

try {
  const args = parseArgs(process.argv);
  const command = String(args._[0] || "").trim().toLowerCase();
  if (!command || ["-h", "--help", "help"].includes(command)) {
    console.log(usage());
    process.exit(0);
  }
  const handler = COMMANDS[command];
  if (!handler) throw new Error(`Unbekannter Befehl: ${command}`);
  const result = await handler(args);
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
} catch (err) {
  console.error(`Fehler: ${err?.message || err}`);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
}
