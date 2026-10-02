/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DER OWNER-ZUGANG KANN ABLAUFEN — UND SPERRT DABEI NIEMANDEN AUS (Punkt 17)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER BEFUND: `tempconnect_staff` trägt `expires_at`, und die Middleware prüft es
 * seit 2026-08-22 wirklich — in beiden Toren, im `WHERE`. `occ_owner_access`
 * kannte nur `revoked_at`. Damit war die **privilegierteste** Fläche des Systems
 * die einzige, deren Zugänge nicht von selbst enden.
 *
 * Owner-Freigabe 2026-10-02: 90 Tage, auditierte Verlängerung — und eine
 * Stop-Regel gegen die eigene Härtung.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIE STOP-REGEL, UND WARUM SIE EIN SATZ IST UND NICHT ZWEI
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   Die Menge der wirksamen OCC-Zugänge enthält immer mindestens einen OHNE
 *   Ablaufdatum.
 *
 * Daraus folgt beides: der letzte unbefristete Zugang kann nicht widerrufen
 * werden, und dem einzigen Zugang kann kein Ablauf gegeben werden. Eine Regel
 * statt zweier — und sie lässt sich an einer Zeile prüfen.
 *
 * „Kein Enforce ohne Break-Glass" gilt hier gegen uns selbst: wer sich aus dem
 * Owner Control Center aussperrt, kann die Sperre nicht aufheben, denn das
 * Aufheben passiert dort. Vorbild ist `assertNotLastOwner` (rbacService).
 *
 * **Diese Regel hat sich beim Bauen sofort bewährt.** In der ersten Erprobung war
 * der Patch, der sie in `cmdRevoke` einsetzt, still gescheitert — und das
 * `revoke` nahm dem Eigentümer seinen Zugang. Wiederhergestellt, Patch gesetzt,
 * erneut erprobt: jetzt weist er ab. Die Probe unten hält genau das fest.
 *
 * Run: node --test --test-force-exit test/ownerZugangLaeuftAb.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hasDb, createPool } from "./integration/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel(relPfad) {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, relPfad))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel(path.join("sql", "migrations"));
const suite = ROOT ? describe : describe.skip;
const lies = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/** Code ohne Kommentare — die Begründungen zitieren, was sie verbieten. */
const nurCode = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

suite("Punkt 17 — der Owner-Zugang läuft ab, ohne die Eigentümer auszusperren", () => {

  it("das TOR prüft den Ablauf im WHERE, nicht in einer JS-Nachprüfung", () => {
    /* Dieselbe Form wie im Staff-Tor, und aus demselben Grund: eine Bedingung,
     * die erst nach dem Laden greift, fehlt beim nächsten Aufrufer derselben
     * Abfrage. Zwei Tore mit verschiedenen Bedingungen sind auf Dauer ein Tor,
     * und zwar das schwächere. */
    const tor = nurCode(lies("api/middleware/requireOwnerControlAccess.js"));
    assert.match(tor, /AND \(expires_at IS NULL OR expires_at > NOW\(\)\)/,
      "das OCC-Tor prüft den Ablauf nicht im WHERE — dann kommt ein abgelaufener "
      + "Zugang weiter durch");
    assert.match(tor, /AND revoked_at IS NULL/,
      "das OCC-Tor prüft den Widerruf nicht mehr");
    /* Und der Grund im Protokoll: ohne ihn bekommt ein Eigentümer für
     * „abgelaufen" und „nie vorhanden" dieselbe ratlose Fehlersuche. Die ANTWORT
     * bleibt gleich — sonst wäre sie ein Orakel. */
    assert.match(tor, /abgelaufen/,
      "die Ablehnung unterscheidet nicht zwischen abgelaufen und nie vorhanden");
  });

  it("die CLI vergibt 90 Tage, wenn nichts anderes gesagt wird", () => {
    const cli = lies("api/scripts/owner-access-cli.js");
    assert.match(nurCode(cli), /const STANDARD_TAGE = 90;/,
      "die Vorgabe von 90 Tagen ist weg oder geändert — das war die Owner-Entscheidung");
    assert.match(nurCode(cli), /ablaufAusArgumenten/,
      "die Auswertung von --expires-in / --no-expiry fehlt");
    /* `--no-expiry` MUSS es geben: ohne einen ausdrücklichen Weg zu einem
     * unbefristeten Zugang ist die Stop-Regel nicht erfüllbar — man käme nie an
     * den zweiten unbefristeten, den sie verlangt. */
    assert.match(cli, /--no-expiry/,
      "es gibt keinen Weg zu einem unbefristeten Zugang — dann ist die Stop-Regel "
      + "unerfüllbar, weil der verlangte zweite unbefristete nie entstehen kann");
    assert.match(cli, /extend/, "der Befehl extend fehlt");
  });

  it("die STOP-REGEL steht an ALLEN drei Stellen, die sie brauchen", () => {
    /* grant ist durch ON CONFLICT auch ein UPDATE und kann befristen; extend
     * sowieso; revoke nimmt den Zugang ganz. Fehlt sie an EINER Stelle, ist sie
     * wirkungslos — und genau das war in der ersten Erprobung der Fall: der Patch
     * für `cmdRevoke` war still gescheitert, und das revoke nahm dem Eigentümer
     * seinen Zugang. */
    const cli = nurCode(lies("api/scripts/owner-access-cli.js"));
    assert.match(cli, /async function assertNichtLetzterUnbefristeter/,
      "die Stop-Regel ist nicht als benannte Funktion da");
    const aufrufe = (cli.match(/await assertNichtLetzterUnbefristeter\(/g) || []).length;
    assert.ok(aufrufe >= 3,
      `die Stop-Regel wird nur ${aufrufe}-mal gerufen, erwartet mindestens 3 `
      + "(grant mit Ablauf, extend mit Ablauf, revoke). Fehlt sie an einer Stelle, "
      + "ist sie wirkungslos — gemessen am 2026-10-02 nahm genau das dem Eigentuemer "
      + "seinen Zugang.");
    /* Je Befehl einzeln, damit nicht drei Aufrufe in einem Befehl die Zahl
     * erfuellen. Der Gegenstand wird herausgeschnitten, nicht im Ganzen gesucht. */
    for (const [name, bis] of [["cmdGrant", "async function cmdRevoke"],
      ["cmdRevoke", "async function cmdExtend"], ["cmdExtend", "async function cmdList"]]) {
      const ab = cli.indexOf(`async function ${name}`);
      assert.ok(ab > 0, `${name} gibt es nicht`);
      const ende = cli.indexOf(bis, ab);
      const rumpf = ende > 0 ? cli.slice(ab, ende) : cli.slice(ab);
      assert.match(rumpf, /assertNichtLetzterUnbefristeter/,
        `${name} ruft die Stop-Regel nicht — dann kann dieser Befehl den letzten `
        + "unbefristeten Zugang nehmen");
    }
  });

  it("entfristen bleibt erlaubt — die Regel darf sich nicht selbst blockieren", () => {
    /* Eine Stop-Regel, die auch das ENTFRISTEN verweigert, macht die Erfüllung
     * unmöglich: man käme nie an den zweiten unbefristeten Zugang. Geprüft wird
     * die Bedingung, die das offenlässt. */
    const cli = nurCode(lies("api/scripts/owner-access-cli.js"));
    assert.match(cli, /if \(tage !== null\) \{\s*await assertNichtLetzterUnbefristeter/,
      "die Stop-Regel greift auch bei --no-expiry (tage === null) — damit wäre sie "
      + "unerfüllbar, denn der verlangte zweite unbefristete Zugang kann nie entstehen");
  });

  it("die Migration setzt KEINEN Ablauf auf bestehende Zugänge", () => {
    /* Ein pauschales „ab jetzt 90 Tage" hätte die Fläche in 90 Tagen geschlossen,
     * ohne dass jemand es entschieden hat — genau der Fall, den die Stop-Regel
     * verbietet. */
    const mig = lies("sql/migrations/230_owner_zugang_kann_ablaufen.sql");
    const code = mig.replace(/--[^\n]*/g, " ");
    assert.match(code, /ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ/,
      "Migration 230 legt die Spalte nicht an");
    assert.ok(!/UPDATE occ_owner_access[\s\S]{0,200}SET expires_at = NOW\(\)/i.test(code),
      "Migration 230 setzt einen Ablauf auf bestehende Zugänge — damit schließt sich "
      + "die Fläche von selbst, ohne Entscheidung");
    assert.match(code, /expires_at IS NOT NULL/,
      "die Notbremse prüft nicht, dass kein Ablauf gesetzt wurde");
    assert.match(mig, /DROP COLUMN IF EXISTS expires_at/,
      "Migration 230 nennt keinen Rollback-Weg");
  });

  it("das Protokoll kennt die Verlängerung — und bleibt wählerisch", () => {
    /* Der Befund, der beim Bauen entstand: `extend` verstieß gegen den CHECK, das
     * Einfügen warf, und `writeAudit` verschluckte es in einem leeren `catch`.
     * Der Befehl meldete Erfolg, die Spur fehlte — die Anforderung „auditiert"
     * war still unerfüllt. */
    const mig = lies("sql/migrations/231_verlaengerung_darf_ins_protokoll.sql");
    const code = mig.replace(/--[^\n]*/g, " ");
    assert.match(code, /CHECK \(action IN \('grant', 'revoke', 'extend', 'list', 'access_denied'\)\)/,
      "der CHECK kennt 'extend' nicht oder lässt zu viel zu");
    assert.match(code, /erfundene_handlung/,
      "die Migration prüft nicht, dass der CHECK weiter wählerisch ist — ein "
      + "Protokoll, das jeden Text annimmt, unterscheidet eine Handlung nicht von "
      + "einem Tippfehler");

    /* Und das `catch` darf nicht mehr stumm sein. Nicht fatal — die Begründung
     * (CLI ohne Protokolltabelle nutzbar) bleibt gültig — aber sichtbar. */
    const cli = lies("api/scripts/owner-access-cli.js");
    const i = cli.indexOf("async function writeAudit");
    const rumpf = cli.slice(i, cli.indexOf("\n}", i));
    assert.ok(!/\}\s*catch\s*\{\s*(\/\/[^\n]*\n\s*)*\}/.test(rumpf),
      "writeAudit verschluckt Fehler wieder stumm. Ein tolerantes catch erfindet "
      + "keine Befunde — es verdeckt sie: so blieb die auditierte Verlängerung "
      + "unerfüllt, ohne dass irgendwo etwas rot wurde.");
    assert.match(rumpf, /console\.error/,
      "writeAudit meldet einen fehlgeschlagenen Protokolleintrag nicht");
  });
});

/**
 * Die Invariante am BESTAND. Eine Textprobe sieht nicht, ob die Menge der
 * unbefristeten Zugänge leer ist — und genau darauf kommt es an.
 */
describe("Punkt 17 am Bestand — mindestens ein Zugang ohne Ablauf",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("die Spalte ist da und nullbar", async () => {
    const pool = createPool();
    try {
      const { rows } = await pool.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'occ_owner_access' AND column_name = 'expires_at'`);
      assert.equal(rows.length, 1, "occ_owner_access.expires_at gibt es nicht");
      assert.equal(rows[0].is_nullable, "YES",
        "expires_at ist NOT NULL — dann MUSS jeder Zugang ablaufen, und die "
        + "Stop-Regel ist unerfüllbar");
    } finally { await pool.end(); }
  });

  it("gibt es Zugänge, ist mindestens einer ohne Ablauf", async (t) => {
    /* ─────────────────────────────────────────────────────────────────────────
     * KORRIGIERT am 2026-10-02. Hier stand `assert.ok(wirksam >= 1)` — und das
     * war derselbe Denkfehler, der in Migration 230 die Migrationskette eines
     * FRISCHINSTALLS abreißen ließ: auf einer frischen Datenbank ist
     * occ_owner_access leer, und das ist kein Mangel.
     *
     * Die Stop-Regel schützt den LETZTEN Zugang, nicht die Existenz eines
     * ersten. Bei leerer Menge ist sie erfüllt, nicht verletzt.
     *
     * Was dabei NICHT passieren darf: dass die Probe auf einer leeren Datenbank
     * still grün wird und dadurch behauptet, sie hätte etwas geprüft. Deshalb
     * sagt sie es (`t.diagnostic`) — ein leeres Grün, das sich als solches
     * ausweist, ist ehrlich; ein leeres Grün, das wie ein Nachweis aussieht,
     * ist der schlimmere Fehler.
     * ───────────────────────────────────────────────────────────────────────── */
    const pool = createPool();
    try {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS unbefristet,
                (SELECT count(*)::int FROM occ_owner_access WHERE revoked_at IS NULL) AS wirksam
           FROM occ_owner_access
          WHERE revoked_at IS NULL AND expires_at IS NULL`);
      const { wirksam, unbefristet } = rows[0];
      if (wirksam === 0) {
        t.diagnostic("occ_owner_access ist leer (Frischinstall) — die Stop-Regel ist leer "
          + "erfüllt, diese Probe hat NICHTS nachgewiesen. Der erste `grant` legt einen "
          + "unbefristeten Zugang an, ab da greift die Regel in der CLI.");
        return;
      }
      assert.ok(unbefristet >= 1,
        `${wirksam} wirksame Zugänge, davon ${unbefristet} ohne Ablauf. `
        + "Läuft jeder irgendwann ab, schließt sich die Fläche von selbst — und das "
        + "Aufheben passiert in genau dieser Fläche.");
    } finally { await pool.end(); }
  });

  it("ein abgelaufener Zugang kommt nicht durch die Tor-Abfrage", async () => {
    /* Die Probe, die das Verhalten nachstellt statt die Form zu lesen: ein
     * Zugang mit Ablauf in der Vergangenheit, in einer zurückgerollten
     * Transaktion. */
    const pool = createPool();
    try {
      await pool.query("BEGIN");
      const { rows: wen } = await pool.query(
        "SELECT user_id FROM occ_owner_access WHERE revoked_at IS NULL LIMIT 1");
      if (!wen.length) { await pool.query("ROLLBACK"); return; }
      await pool.query(
        "UPDATE occ_owner_access SET expires_at = NOW() - interval '1 day' WHERE user_id = $1",
        [wen[0].user_id]);
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM occ_owner_access
          WHERE user_id = $1 AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())`, [wen[0].user_id]);
      assert.equal(rows[0].n, 0,
        "ein abgelaufener Zugang erfüllt die Bedingung des Tores weiterhin — dann "
        + "ist der Ablauf dekorativ");
    } finally {
      await pool.query("ROLLBACK").catch(() => {});
      await pool.end();
    }
  });
});
