import { pool } from "../db/pool.js";

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i++;
  }
  return parsed;
}

function usage() {
  return [
    "Owner-Control Access CLI",
    "",
    "Commands:",
    "  grant  --user-id <uuid>|--email <mail> [--occ-role owner|co-owner] [--performed-by <uuid|mail>] [--note <text>]",
    "  revoke --user-id <uuid>|--email <mail> [--performed-by <uuid|mail>] [--note <text>]",
    "  list   [--active-only] [--json] [--performed-by <uuid|mail>]",
    "",
    "Examples:",
    "  node scripts/owner-access-cli.js grant --email owner@example.com --occ-role owner --note \"go-live\"",
    "  node scripts/owner-access-cli.js revoke --user-id <uuid> --note \"offboarding\"",
    "  node scripts/owner-access-cli.js list --active-only --json"
  ].join("\n");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

async function resolveUserId({ userId, email }) {
  if (userId) {
    if (!isUuid(userId)) throw new Error("user-id ist keine gültige UUID.");
    const { rows } = await pool.query("SELECT id, email FROM users WHERE id = $1::uuid LIMIT 1", [userId]);
    if (!rows[0]) throw new Error("User für user-id nicht gefunden.");
    return rows[0];
  }
  if (!email) throw new Error("Bitte --user-id oder --email angeben.");
  const { rows } = await pool.query("SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]);
  if (!rows[0]) throw new Error("User für email nicht gefunden.");
  return rows[0];
}

async function resolveOptionalActor(value) {
  if (!value) return null;
  if (isUuid(value)) {
    const { rows } = await pool.query("SELECT id FROM users WHERE id = $1::uuid LIMIT 1", [value]);
    return rows[0]?.id || null;
  }
  const { rows } = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [value]);
  return rows[0]?.id || null;
}

async function writeAudit({ userId, action, performedBy, note, metadata }) {
  try {
    await pool.query(
      `INSERT INTO owner_control_access_audit (user_id, action, performed_by, note, metadata)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb)`,
      [userId || null, action, performedBy || null, note || null, JSON.stringify(metadata || {})]
    );
  } catch {
    // keep CLI functional even if audit table is unavailable
  }
}

async function cmdGrant(args) {
  const target = await resolveUserId({ userId: args["user-id"], email: args.email });
  const occRole = String(args["occ-role"] || "owner").trim().toLowerCase();
  if (![ "owner", "co-owner" ].includes(occRole)) {
    throw new Error("occ-role muss owner oder co-owner sein.");
  }
  const note = args.note ? String(args.note) : null;
  const performedBy = await resolveOptionalActor(args["performed-by"]);

  const { rows } = await pool.query(
    `INSERT INTO occ_owner_access (user_id, occ_role, granted_by, granted_at, revoked_at, notes)
     VALUES ($1::uuid, $2, $3::uuid, NOW(), NULL, $4)
     ON CONFLICT (user_id)
     DO UPDATE
       SET occ_role = EXCLUDED.occ_role,
           granted_by = EXCLUDED.granted_by,
           granted_at = NOW(),
           revoked_at = NULL,
           notes = EXCLUDED.notes
     RETURNING user_id, occ_role, granted_by, granted_at, revoked_at, notes`,
    [target.id, occRole, performedBy, note]
  );

  await writeAudit({
    userId: target.id,
    action: "grant",
    performedBy,
    note,
    metadata: { occ_role: occRole, source: "owner-access-cli" }
  });

  return { action: "grant", user_email: target.email, entry: rows[0] || null };
}

async function cmdRevoke(args) {
  const target = await resolveUserId({ userId: args["user-id"], email: args.email });
  const note = args.note ? String(args.note) : null;
  const performedBy = await resolveOptionalActor(args["performed-by"]);

  const { rows, rowCount } = await pool.query(
    `UPDATE occ_owner_access
        SET revoked_at = NOW(),
            notes = COALESCE($2, notes)
      WHERE user_id = $1::uuid
        AND revoked_at IS NULL
    RETURNING user_id, occ_role, granted_by, granted_at, revoked_at, notes`,
    [target.id, note]
  );

  await writeAudit({
    userId: target.id,
    action: "revoke",
    performedBy,
    note,
    metadata: { source: "owner-access-cli", active_row_updated: rowCount > 0 }
  });

  return { action: "revoke", user_email: target.email, updated: rowCount > 0, entry: rows[0] || null };
}

async function cmdList(args) {
  const activeOnly = args["active-only"] === true || String(args["active-only"] || "").toLowerCase() === "true";
  const performedBy = await resolveOptionalActor(args["performed-by"]);

  const whereClause = activeOnly ? "WHERE oa.revoked_at IS NULL" : "";
  const { rows } = await pool.query(
    `SELECT oa.user_id,
            u.email,
            oa.occ_role,
            oa.granted_by,
            granted_by_u.email AS granted_by_email,
            oa.granted_at,
            oa.revoked_at,
            oa.notes
       FROM occ_owner_access oa
       LEFT JOIN users u ON u.id = oa.user_id
       LEFT JOIN users granted_by_u ON granted_by_u.id = oa.granted_by
       ${whereClause}
      ORDER BY (oa.revoked_at IS NULL) DESC, oa.granted_at DESC`
  );

  await writeAudit({
    userId: null,
    action: "list",
    performedBy,
    note: null,
    metadata: { source: "owner-access-cli", active_only: activeOnly, returned_rows: rows.length }
  });

  return { action: "list", active_only: activeOnly, total: rows.length, items: rows };
}

try {
  const args = parseArgs(process.argv);
  const command = String(args._[0] || "").trim().toLowerCase();

  if (!command || [ "-h", "--help", "help" ].includes(command)) {
    console.log(usage());
    process.exit(0);
  }

  let result;
  if (command === "grant") {
    result = await cmdGrant(args);
  } else if (command === "revoke") {
    result = await cmdRevoke(args);
  } else if (command === "list") {
    result = await cmdList(args);
  } else {
    throw new Error(`Unbekannter Befehl: ${command}`);
  }

  if (args.json === true || command === "list") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.action} erfolgreich ausgeführt.`);
    console.log(JSON.stringify(result, null, 2));
  }
  await pool.end();
} catch (err) {
  console.error(`Fehler: ${err?.message || err}`);
  try { await pool.end(); } catch { /* ignore pool shutdown error */ }
  process.exit(1);
}

