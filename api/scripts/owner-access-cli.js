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
    "  grant  --user-id <uuid>|--email <mail> [--occ-role owner|co-owner] [--expires-in <tage>] [--no-expiry] [--performed-by <uuid|mail>] [--note <text>]",
    "  extend --user-id <uuid>|--email <mail> [--expires-in <tage>] [--no-expiry] [--performed-by <uuid|mail>] [--note <text>]",
    "  revoke --user-id <uuid>|--email <mail> [--performed-by <uuid|mail>] [--note <text>]",
    "  list   [--active-only] [--json] [--performed-by <uuid|mail>]",
    "",
    "Ablauf (Owner-Punkt 17): ein grant laeuft nach 90 Tagen ab, wenn nichts anderes",
    "gesagt wird. --expires-in setzt eine andere Zahl, --no-expiry vergibt",
    "unbefristet. `extend` verlaengert und schreibt altes und neues Datum ins Audit.",
    "",
    "STOP-REGEL: es muss immer mindestens EIN wirksamer Zugang ohne Ablaufdatum",
    "geben. Ein revoke oder ein Befristen, das den letzten unbefristeten nehmen",
    "wuerde, wird mit LETZTER_UNBEFRISTETER_ZUGANG abgewiesen. Sie schuetzt gegen",
    "das VERSEHEN, nicht gegen den Vorsatz — das eigentliche Risiko hier.",
    "",
    "BREAK-GLASS: der Rueckweg liegt NICHT in der Flaeche, sondern in diesem",
    "Befehl. Sind ALLE Zugaenge abgelaufen oder widerrufen, oeffnet",
    "",
    "  node scripts/owner-access-cli.js grant --email <adresse> --no-expiry",
    "",
    "die Flaeche wieder — er braucht Datenbankzugriff, nicht OCC-Zugang, und das",
    "ist die staerkere Berechtigung. BELEGT am 2026-10-02 auf einer",
    "Wegwerf-Datenbank aus dem ausgesperrten Zustand heraus: beide Zugaenge per",
    "direktem SQL abgelaufen (Tor-Abfrage 0 Zeilen), danach grant --no-expiry,",
    "Flaeche offen, Protokollspur vorhanden. Ein Rueckweg, den niemand je gegangen",
    "ist, ist keiner — deshalb steht hier das Datum und nicht nur die Behauptung.",
    "",
    "Examples:",
    "  node scripts/owner-access-cli.js grant --email owner@example.com --occ-role owner --no-expiry --note \"Eigentuemer\"",
    "  node scripts/owner-access-cli.js grant --email berater@example.com --occ-role co-owner --note \"Projekt X\"",
    "  node scripts/owner-access-cli.js extend --email berater@example.com --expires-in 30 --note \"Projekt X verlaengert\"",
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
  } catch (err) {
    /*
     * NICHT FATAL, ABER NICHT STILL (Owner-Punkt 17, 2026-10-02).
     *
     * Die Begruendung fuer das Abfangen bleibt gueltig: die CLI soll auch ohne
     * Protokolltabelle arbeiten. Still war sie zu viel. Gemessen: der neue Befehl
     * `extend` rief writeAudit korrekt auf, der CHECK auf `action` kannte den Wert
     * nicht, der Einfuegeversuch warf — und dieses `catch` verschluckte es. Der
     * Befehl meldete Erfolg, die Spur fehlte, und die Anforderung "auditierte
     * Verlaengerung" war damit UNERFUELLT, ohne dass irgendwo etwas rot wurde.
     * (Behoben in Migration 231.)
     *
     * Ein tolerantes `catch` erfindet keine Befunde — es verdeckt sie. Eine Zeile
     * auf stderr kostet nichts und macht den naechsten Fall sichtbar.
     */
    console.error(`WARNUNG: Protokolleintrag "${action}" nicht geschrieben: ${err?.message || err}`);
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
 * PUNKT 17 — DER OWNER-ZUGANG KANN ABLAUFEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Freigabe 2026-10-02: 90 Tage, auditierte Verlaengerung. Lang genug, dass
 * sich niemand taeglich selbst freischaltet, kurz genug, dass ein vergessener
 * Zugang von selbst endet.
 *
 * DIE STOP-REGEL GEGEN DIE EIGENE HAERTUNG, in einem Satz:
 *
 *   Die Menge der wirksamen OCC-Zugaenge enthaelt immer mindestens einen OHNE
 *   Ablaufdatum.
 *
 * Daraus folgt beides, ohne zwei Regeln zu brauchen: der letzte unbefristete
 * Zugang kann nicht widerrufen werden, und dem einzigen Zugang kann kein Ablauf
 * gegeben werden. Vorbild ist `assertNotLastOwner` (rbacService), das die
 * Herabstufung des letzten Owners mit 409 LAST_OWNER verweigert — "kein Enforce
 * ohne Break-Glass", hier gegen uns selbst gewendet: wer sich aus dem Owner
 * Control Center aussperrt, kann die Sperre nicht aufheben, denn das Aufheben
 * passiert dort.
 */
const STANDARD_TAGE = 90;

/** Wirksame Zugaenge ohne Ablauf — die Menge, die nie leer werden darf. */
async function unbefristeteZugaenge(ausserUserId = null) {
  const { rows } = await pool.query(
    `SELECT user_id FROM occ_owner_access
       WHERE revoked_at IS NULL AND expires_at IS NULL
         AND ($1::uuid IS NULL OR user_id <> $1::uuid)`,
    [ausserUserId]
  );
  return rows.map((r) => r.user_id);
}

/**
 * Verweigert eine Handlung, die den letzten unbefristeten Zugang nehmen wuerde.
 * `userId` ist der Zugang, der befristet oder widerrufen werden soll.
 */
async function assertNichtLetzterUnbefristeter(userId, handlung) {
  const { rows } = await pool.query(
    `SELECT 1 FROM occ_owner_access
       WHERE user_id = $1::uuid AND revoked_at IS NULL AND expires_at IS NULL`,
    [userId]
  );
  if (!rows.length) return;                 // Ziel ist nicht unbefristet -> unkritisch
  const andere = await unbefristeteZugaenge(userId);
  if (andere.length === 0) {
    /* ─────────────────────────────────────────────────────────────────────────
     * DIE MELDUNG WAR ZU ABSOLUT, UND DAS IST GEMESSEN (2026-10-02).
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Hier stand: "das Aufheben passiert im Owner Control Center, also nirgends".
     * Das ist falsch, und zwar nachweislich — dieser Befehl SELBST ist der
     * Rueckweg. Auf einer Wegwerf-Datenbank belegt: beide Zugaenge per direktem
     * SQL abgelaufen (`wirksam=2 unbefristet=0`, Tor-Abfrage 0 Zeilen, also
     * ausgesperrt), danach `grant --no-expiry` — und die Flaeche war wieder
     * offen, mit Protokollspur.
     *
     * Der Rueckweg liegt also AUSSERHALB der Flaeche und verlangt Datenbank-
     * zugriff. Das ist die STAERKERE Berechtigung, nicht die schwaechere, und
     * damit ist Break-Glass hier so gebaut, wie man es baut: nicht als Tuer, die
     * immer offen steht, sondern als Schluessel, der woanders liegt.
     *
     * WARUM DIE ABWEISUNG TROTZDEM BLEIBT. CLAUDE.md benennt das eigentliche
     * Risiko: "Das eigentliche Risiko ist das Versehen, nicht der Vorsatz."
     * Wer hier aus Versehen den letzten unbefristeten Zugang nimmt, braucht
     * danach Serverzugriff, um eine Flaeche zu reparieren, die er mit einem
     * Befehl zugemacht hat. Die Abweisung kostet einen zweiten Befehl; sie
     * ersetzt nicht den Rueckweg, sie macht ihn nur selten noetig.
     *
     * Die Meldung nennt deshalb BEIDES: den bequemen Weg (zweiten unbefristeten
     * Zugang vergeben) und den Rueckweg, falls es doch passiert. Eine Meldung,
     * die einen vorhandenen Ausweg verschweigt, schickt den Leser ins Leere.
     * ───────────────────────────────────────────────────────────────────────── */
    const fehler = new Error(
      `LETZTER_UNBEFRISTETER_ZUGANG: ${handlung} wuerde den einzigen Owner-Zugang ohne `
      + "Ablaufdatum nehmen. Danach endet jeder Zugang irgendwann von selbst, und "
      + "niemand kommt mehr ueber die Flaeche hinein.\n"
      + "  Gewollt? Dann erst einen zweiten unbefristeten Zugang vergeben:\n"
      + "    node scripts/owner-access-cli.js grant --email <adresse> --no-expiry\n"
      + "  Und falls es doch einmal passiert: der Rueckweg liegt NICHT in der Flaeche, "
      + "sondern hier — derselbe Befehl, mit Datenbankzugriff statt OCC-Zugang. "
      + "Belegt am 2026-10-02 aus dem ausgesperrten Zustand heraus."
    );
    fehler.code = "LETZTER_UNBEFRISTETER_ZUGANG";
    throw fehler;
  }
}

/** Liest `--expires-in` / `--no-expiry` und gibt Tage oder null zurueck. */
function ablaufAusArgumenten(args) {
  if (args["no-expiry"] === true) return null;
  const roh = args["expires-in"];
  if (roh === undefined) return STANDARD_TAGE;
  const tage = Number(roh);
  if (!Number.isInteger(tage) || tage < 1 || tage > 3650) {
    throw new Error("expires-in muss eine ganze Zahl zwischen 1 und 3650 (Tagen) sein.");
  }
  return tage;
}

async function cmdGrant(args) {
  const target = await resolveUserId({ userId: args["user-id"], email: args.email });
  const occRole = String(args["occ-role"] || "owner").trim().toLowerCase();
  if (![ "owner", "co-owner" ].includes(occRole)) {
    throw new Error("occ-role muss owner oder co-owner sein.");
  }
  const note = args.note ? String(args.note) : null;
  const performedBy = await resolveOptionalActor(args["performed-by"]);
  const tage = ablaufAusArgumenten(args);

  /* Ein `grant` auf einen bestehenden Zugang ist durch `ON CONFLICT` auch ein
   * UPDATE — es kann also einen unbefristeten Zugang BEFRISTEN. Damit greift die
   * Stop-Regel hier genauso wie beim Widerruf. */
  if (tage !== null) {
    await assertNichtLetzterUnbefristeter(target.id, "ein grant mit Ablaufdatum");
  }

  const { rows } = await pool.query(
    `INSERT INTO occ_owner_access (user_id, occ_role, granted_by, granted_at, revoked_at, notes, expires_at)
     VALUES ($1::uuid, $2, $3::uuid, NOW(), NULL, $4,
             CASE WHEN $5::int IS NULL THEN NULL
                  ELSE NOW() + ($5::int || ' days')::interval END)
     ON CONFLICT (user_id)
     DO UPDATE
       SET occ_role = EXCLUDED.occ_role,
           granted_by = EXCLUDED.granted_by,
           granted_at = NOW(),
           revoked_at = NULL,
           notes = EXCLUDED.notes,
           expires_at = EXCLUDED.expires_at
     RETURNING user_id, occ_role, granted_by, granted_at, revoked_at, notes, expires_at`,
    [target.id, occRole, performedBy, note, tage]
  );

  await writeAudit({
    userId: target.id,
    action: "grant",
    performedBy,
    note,
    metadata: { occ_role: occRole, source: "owner-access-cli", expires_in_days: tage }
  });

  return { action: "grant", user_email: target.email, expires_in_days: tage, entry: rows[0] || null };
}

async function cmdRevoke(args) {
  const target = await resolveUserId({ userId: args["user-id"], email: args.email });
  const note = args.note ? String(args.note) : null;
  const performedBy = await resolveOptionalActor(args["performed-by"]);

  /* DIE STOP-REGEL. Ohne sie kann der letzte unbefristete Zugang widerrufen
   * werden — danach endet jeder verbleibende irgendwann von selbst, und die
   * Flaeche schliesst sich lautlos. Gemessen am 2026-10-02: genau das ist in der
   * ersten Erprobung passiert, weil diese Zeile fehlte (der Patch war still
   * gescheitert). Der Zugang des Eigentuemers war danach widerrufen. */
  await assertNichtLetzterUnbefristeter(target.id, "ein revoke");

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


/**
 * Verlaengert einen befristeten Zugang. Auditiert, mit altem und neuem Datum —
 * eine Verlaengerung ohne Spur ist eine unbefristete Vergabe in Raten.
 */
async function cmdExtend(args) {
  const target = await resolveUserId({ userId: args["user-id"], email: args.email });
  const note = args.note ? String(args.note) : null;
  const performedBy = await resolveOptionalActor(args["performed-by"]);
  const tage = args["expires-in"] === undefined && args["no-expiry"] !== true
    ? STANDARD_TAGE
    : ablaufAusArgumenten(args);

  /* Entfristen ist erlaubt (es macht die Menge der Unbefristeten groesser, nie
     kleiner) — befristen dagegen faellt unter die Stop-Regel. */
  if (tage !== null) {
    await assertNichtLetzterUnbefristeter(target.id, "eine Verlaengerung mit Ablaufdatum");
  }

  const { rows, rowCount } = await pool.query(
    `UPDATE occ_owner_access
        SET expires_at = CASE WHEN $2::int IS NULL THEN NULL
                              ELSE NOW() + ($2::int || ' days')::interval END,
            notes = COALESCE($3, notes)
      WHERE user_id = $1::uuid
        AND revoked_at IS NULL
    RETURNING user_id, occ_role, granted_at, revoked_at, notes, expires_at`,
    [target.id, tage, note]
  );
  if (!rowCount) {
    throw new Error("Kein wirksamer Zugang fuer diesen Nutzer — nichts verlaengert.");
  }

  await writeAudit({
    userId: target.id,
    action: "extend",
    performedBy,
    note,
    metadata: {
      source: "owner-access-cli",
      expires_in_days: tage,
      neues_ablaufdatum: rows[0]?.expires_at || null
    }
  });

  return { action: "extend", user_email: target.email, expires_in_days: tage, entry: rows[0] || null };
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
            oa.expires_at,
            (oa.expires_at IS NOT NULL AND oa.expires_at <= NOW()) AS abgelaufen,
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
  } else if (command === "extend") {
    result = await cmdExtend(args);
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

