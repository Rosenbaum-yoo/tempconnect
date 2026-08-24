import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createStaffControlAccessMiddleware } from "../middleware/staffControlAccess.js";

/*
 * BEFRISTETE STAFF-ZUGAENGE LIEFEN NIE AB — und die Migration behauptete das
 * Gegenteil. Am 2026-08-22 gegen die laufende Datenbank belegt.
 *
 * Der Kommentar von Migration 118 nennt WOERTLICH die Funktion, die pruefen
 * soll:
 *
 *   COMMENT ON COLUMN tempconnect_staff.expires_at IS
 *     'Optionales Ablaufdatum — NULL = kein Ablauf.
 *      Pruefung in createStaffControlAccessMiddleware (WAVE 11)'
 *
 * Die Abfrage dieser Funktion holte die Spalte nicht einmal. Es gibt sogar
 * einen Teilindex dafuer (118:40-42) — jemand hat den Index fuer eine Pruefung
 * gebaut, die nie geschrieben wurde. Ein Access-Reviewer las die Zusage und
 * glaubte, ein Berater-Zugang laufe von selbst ab. Er lief nicht ab.
 *
 * `revoked_at` war noch schwaecher: die Deaktivierung schreibt nur
 * `is_active = FALSE` (staffControlCenter.js), niemand setzt `revoked_at`, und
 * niemand prueft es. Wer es von Hand setzte, weil die Spalte danach aussieht,
 * sperrte niemanden aus.
 *
 * WIRKUNG DER REPARATUR HEUTE: keine. Gemessen — eine Zeile, `expires_at IS
 * NULL`, `revoked_at IS NULL`. Es wird niemand ausgesperrt; es kann kuenftig
 * nur niemand mehr drinbleiben, der draussen sein soll.
 */

const STAFF = "5a5a5a5a-0000-0000-0000-000000000001";

/** Spion-Pool: erste Abfrage = das Tor, danach die Diagnose im Ablehnungsfall. */
function spion(torZeilen, diagZeile = null) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params: params || [] });
      if (/FROM tempconnect_staff WHERE user_id/.test(text)) {
        // die Diagnose-Abfrage im Ablehnungszweig
        return { rows: diagZeile ? [diagZeile] : [], rowCount: diagZeile ? 1 : 0 };
      }
      if (/INSERT INTO tempconnect_staff/.test(text)) {
        return { rows: [{ user_id: STAFF, is_active: true, requires_step_up: true }], rowCount: 1 };
      }
      return { rows: torZeilen, rowCount: torZeilen.length };
    },
  };
}

function laufe(pool, { protokoll = [] } = {}) {
  const wache = createStaffControlAccessMiddleware({
    pool,
    logger: {
      warn: (o, m) => protokoll.push({ stufe: "warn", ...o, m }),
      error: (o, m) => protokoll.push({ stufe: "error", ...o, m }),
      info: () => {},
    },
  });
  let status = null; let json = null; let weiter = false;
  const res = { status(c) { status = c; return this; }, json(j) { json = j; return this; } };
  return wache({ session: { staffUserId: STAFF }, path: "/bootstrap" }, res, () => { weiter = true; })
    .then(() => ({ status, json, weiter, protokoll }));
}

describe("Staff-Zugang — Ablauf und Widerruf stehen im WHERE, nicht in einer Nachpruefung", () => {
  const quelle = fs.readFileSync(new URL("../middleware/staffControlAccess.js", import.meta.url), "utf8");

  it("die Abfrage des Tors traegt beide Bedingungen", async () => {
    const pool = spion([{ user_id: STAFF, is_active: true, requires_step_up: false, expires_at: null, role: "staff_member" }]);
    await laufe(pool);
    const tor = pool.calls[0];
    assert.match(tor.sql, /revoked_at IS NULL/,
      "ein widerrufener Zugang muss schon in der Abfrage scheitern");
    assert.match(tor.sql, /expires_at IS NULL OR expires_at > NOW\(\)/,
      "der Ablauf gehoert ins WHERE — eine Bedingung, die erst nach dem Laden greift, " +
      "fehlt beim naechsten Aufrufer dieser Abfrage");
  });

  it("die Bedingungen stehen NICHT nur als JS-Nachpruefung da", () => {
    /* Der Unterschied ist der eigentliche Gehalt: `if (staff.expires_at < now)`
     * waere eine Zeile, die man beim naechsten Umbau der Abfrage verliert. */
    assert.ok(!/staff\.expires_at\s*[<>]/.test(quelle),
      "der Ablauf darf nicht in JS geprueft werden, sondern in der Abfrage");
  });

  it("ein gueltiger Zugang kommt durch", async () => {
    const pool = spion([{ user_id: STAFF, is_active: true, requires_step_up: false, expires_at: null, role: "staff_member" }]);
    const r = await laufe(pool);
    assert.equal(r.weiter, true, "sonst sperrt die Reparatur die aus, die drinbleiben sollen");
    assert.equal(r.status, null);
  });

  it("ein abgelaufener Zugang wird abgewiesen — die Abfrage liefert dann keine Zeile", async () => {
    const pool = spion([], { is_active: true, widerrufen: false, abgelaufen: true });
    const r = await laufe(pool);
    assert.equal(r.weiter, false);
    assert.equal(r.status, 403);
    assert.equal(r.json?.error?.code, "SCC_NOT_AUTHORIZED");
  });

  it("ein widerrufener Zugang wird abgewiesen", async () => {
    const pool = spion([], { is_active: true, widerrufen: true, abgelaufen: false });
    const r = await laufe(pool);
    assert.equal(r.status, 403);
  });

  it("S: die Probe wuerde ein Zuruecknehmen der Bedingungen bemerken", () => {
    /* Rueckmutation — ohne sie belegt die Gruppe nur, dass die aktuelle Fassung
     * passt, nicht dass sie den Rueckfall SIEHT. */
    const alt = "SELECT user_id, email FROM tempconnect_staff WHERE user_id = $1";
    assert.ok(!/revoked_at IS NULL/.test(alt), "die Probe wuerde die alte Abfrage durchlassen");
    assert.ok(!/expires_at/.test(alt));
  });
});

describe("Staff-Zugang — die Ablehnung ist fuer alle Gruende gleich, das Protokoll nicht", () => {
  /*
   * Fail-closed, aber nicht still. Die ANTWORT darf nicht verraten, warum —
   * sonst ist sie ein Orakel. Das PROTOKOLL muss es sagen, sonst bekommt ein
   * abgelaufener Berater dieselbe ratlose Fehlersuche wie ein Fremder.
   */

  const faelle = [
    ["expired", { is_active: true, widerrufen: false, abgelaufen: true }],
    ["revoked", { is_active: true, widerrufen: true, abgelaufen: false }],
    ["inactive", { is_active: false, widerrufen: false, abgelaufen: false }],
    ["not_in_tempconnect_staff", null],
  ];

  it("jeder Grund landet im Protokoll", async () => {
    for (const [erwartet, diag] of faelle) {
      const r = await laufe(spion([], diag));
      const zeile = r.protokoll.find((p) => p.grund);
      assert.ok(zeile, `kein Protokolleintrag fuer ${erwartet}`);
      assert.equal(zeile.grund, erwartet);
    }
  });

  it("die ANTWORT ist bei jedem Grund dieselbe", async () => {
    const antworten = [];
    for (const [, diag] of faelle) {
      const r = await laufe(spion([], diag));
      antworten.push(JSON.stringify({ status: r.status, json: r.json }));
    }
    assert.equal(new Set(antworten).size, 1,
      "unterschiedliche Antworten waeren ein Orakel: wer probiert, koennte ablesen, " +
      "ob eine Kennung ueberhaupt Staff ist");
  });

  it("die Diagnose laeuft NUR im Ablehnungsfall", async () => {
    const gut = spion([{ user_id: STAFF, is_active: true, requires_step_up: false, expires_at: null, role: "staff_member" }]);
    await laufe(gut);
    assert.ok(!gut.calls.some((c) => /widerrufen/.test(c.sql)),
      "auf dem heissen Pfad darf keine zusaetzliche Abfrage laufen");
  });
});

describe("Staff-Zugang — die Notoeffnung oeffnet absichtlich, nicht nebenbei", () => {
  const quelle = fs.readFileSync(new URL("../middleware/staffControlAccess.js", import.meta.url), "utf8");

  it("der Bootstrap setzt Ablauf UND Widerruf zurueck", () => {
    /*
     * Sonst haette die Reparatur ein Loch gerissen statt eines geschlossen: bei
     * abgelaufenem Zugang liefert das Tor keine Zeile, der Bootstrap laeuft an,
     * und ein ON CONFLICT ohne `expires_at = NULL` haette den abgelaufenen
     * Zugang wieder aufleben lassen, ohne dass jemand ihn verlaengert hat.
     */
    assert.match(quelle, /ON CONFLICT \(user_id\) DO UPDATE\s*\n?\s*SET is_active = TRUE, revoked_at = NULL, expires_at = NULL/,
      "Die Notoeffnung muss BEIDE Sperren ausdruecklich loesen — sonst tut sie es " +
      "halb und unbeabsichtigt.");
  });

  it("sie wird laut protokolliert", () => {
    assert.match(quelle, /bootstrap-staff via STAFF_USER_IDS env[^"]*Ablauf und Widerruf/,
      "eine Notoeffnung, die man im Protokoll nicht von einem normalen Zugang " +
      "unterscheiden kann, ist keine Notoeffnung, sondern eine Hintertuer");
  });
});

describe("Staff-Zugang — beide Tore tragen dieselbe Bedingung", () => {
  /*
   * Zwei Tore mit verschiedenen Bedingungen sind auf Dauer EIN Tor — und zwar
   * das schwaechere. Der Login vergibt `req.session.staffUserId` und damit den
   * Schluessel fuer alles darunter; er darf nicht laxer sein als die Wache.
   */
  const scc = fs.readFileSync(new URL("../routes/staffControlCenter.js", import.meta.url), "utf8");

  it("der Login prueft Ablauf und Widerruf", () => {
    const loginAbfrage = scc.match(/FROM users u JOIN tempconnect_staff s[\s\S]{0,400}?\[email\]/);
    assert.ok(loginAbfrage, "die Login-Abfrage wurde nicht gefunden — greift das Muster noch?");
    assert.match(loginAbfrage[0], /s\.revoked_at IS NULL/);
    assert.match(loginAbfrage[0], /s\.expires_at IS NULL OR s\.expires_at > NOW\(\)/);
  });

  it("die Zugangsuebersicht zeigt, was jetzt wirklich greift", () => {
    const uebersicht = scc.match(/router\.get\("\/staff-access"[\s\S]{0,900}?ORDER BY/);
    assert.ok(uebersicht, "die Zugangsuebersicht wurde nicht gefunden");
    assert.match(uebersicht[0], /expires_at/,
      "sie IST die Access-Review — ein Reviewer muss einen befristeten Zugang von " +
      "einem unbefristeten unterscheiden koennen");
    assert.match(uebersicht[0], /revoked_at/);
  });
});

describe("Staff-Zugang — die Zusage der Migration und der Code stimmen ueberein", () => {
  /*
   * DER EIGENTLICHE RIEGEL. Der Fehler bestand nicht darin, dass eine Pruefung
   * fehlte — sondern darin, dass eine DOKUMENTIERTE Zusage ins Leere zeigte.
   * Ein Kommentar, der eine Funktion beim Namen nennt, ist eine Behauptung
   * ueber Code; diese Probe haelt beide gegeneinander.
   */
  const migration = fs.readFileSync(
    new URL("../../sql/migrations/118_staff_identity_hardening.sql", import.meta.url), "utf8");
  const quelle = fs.readFileSync(new URL("../middleware/staffControlAccess.js", import.meta.url), "utf8");

  it("die Migration nennt weiterhin diese Funktion — sonst prueft der Riegel nichts", () => {
    assert.match(migration, /COMMENT ON COLUMN tempconnect_staff\.expires_at[\s\S]{0,200}createStaffControlAccessMiddleware/,
      "Wenn der Kommentar umgeschrieben wurde, gehoert diese Probe angepasst — " +
      "nicht geloescht: die Frage 'haelt die Zusage?' bleibt.");
  });

  it("und die genannte Funktion prueft die Spalte wirklich", () => {
    const funktion = quelle.match(/export function createStaffControlAccessMiddleware[\s\S]*/);
    assert.ok(funktion, "die genannte Funktion existiert nicht mehr");
    assert.match(funktion[0], /expires_at IS NULL OR expires_at > NOW\(\)/,
      "Migration 118 sagt einem Access-Reviewer, die Pruefung stehe HIER. Steht sie " +
      "nicht hier, laeuft ein befristeter Zugang nie ab und die Zusage ist eine Luege.");
  });

  it("der Index, den die Migration dafuer anlegt, hat jetzt einen Nutzer", () => {
    /* 118:40-42 legt einen Teilindex auf `expires_at WHERE expires_at IS NOT NULL`
     * an. Ein Index ohne Abfrage ist reine Schreiblast — er war der deutlichste
     * Hinweis darauf, dass die Pruefung gemeint, aber nie gebaut war. */
    assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_tempconnect_staff_expires_at/);
    assert.match(quelle, /expires_at > NOW\(\)/,
      "solange niemand nach expires_at fragt, ist der Index nur Kosten");
  });
});
