/**
 * P9 Spur A / Welle A2 — der Rabatt-Katalog wird schaltbar (Staff Control Center).
 *
 * WAS HIER ABGESICHERT WIRD
 * Ein Bounty an- und abzuschalten ist ein Preiseingriff: es endet Rabatt, den
 * zahlende Kunden heute bekommen. An dem Vorgang haengt eine Kette, die
 * vollstaendig halten muss — Staff-Zugang, Step-up, Bestaetigung mit Begruendung,
 * Audit, Entzug der laufenden Vergaben. Faellt ein Glied aus, merkt es niemand:
 * der Schalter sieht weiter aus, als haette er gewirkt.
 *
 * Drei Ebenen, bewusst getrennt:
 *   1. Fachwerte — die Pruefung liegt im Dienst und ist ohne HTTP testbar.
 *   2. Kette + Handler — die Wachen werden STRUKTURELL geprueft. Ein Test, der
 *      nur den letzten Handler aufruft, wuerde ein entferntes
 *      `requireConfirmAndReason` nicht bemerken; genau diese Blindstelle hat im
 *      Projekt schon einmal einen Webhook-Defekt durchgelassen.
 *   3. DB-gestuetzt (uebersprungen ohne Datenbank) — der Entzugs-Trigger aus
 *      Migration 168 wird wirklich ausgeloest. Ein Trigger laesst sich nicht
 *      mocken; eine Attrappe wuerde bestaetigen, was sie selbst erfindet.
 *
 * Run: node --test --test-force-exit test/staffBountyKatalog.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";
import * as bountyService from "../services/bountyService.js";

const hasDb = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));

/* ── Attrappen ─────────────────────────────────────────────────────────── */

function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    for (const r of routes) {
      const hit = r.match instanceof RegExp ? r.match.test(sql) : sql.includes(r.match);
      if (hit) {
        const rows = typeof r.rows === "function" ? r.rows({ sql, params }) : (r.rows || []);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const findCall = (calls, needle) => calls.find((c) => c.sql.includes(needle));

function baueRouter(pool) {
  return createStaffControlCenterRouter({ pool, logger: { error() {}, warn() {} }, sendMail: async () => {} });
}

function schichtFuer(router, methode, pfad) {
  const schicht = router.stack.find(
    (s) => s.route && s.route.path === pfad && s.route.methods[methode]
  );
  assert.ok(schicht, `Route ${methode.toUpperCase()} ${pfad} ist nicht montiert`);
  return schicht;
}

function handlerFuer(router, methode, pfad) {
  const stack = schichtFuer(router, methode, pfad).route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res = { _status: 200, _json: null };
  res.status = (code) => { res._status = code; return res; };
  res.json = (body) => { res._json = body; return res; };
  return res;
}

const ZEILE = {
  id: "b-top", key: "top_supplier", name_de: "Top-Supplier-Status",
  description_de: "12 Monate im Top 10%", category: "performance", icon: "\u{1F947}",
  discount_pct: "5.0", threshold_type: "top_percentile_12m", threshold_value: { percentile: 10 },
  is_recurring: true, is_active: true, inactive_reason: null,
  available_from: null, available_until: null, sort_order: 3,
  updated_at: "2026-08-08T10:00:00.000Z", aktive_vergaben: 4, vergaben_gesamt: 7
};

/* ── 1. Fachwerte ──────────────────────────────────────────────────────── */

describe("P9/A2 · Was der Dienst als Aenderung annimmt", () => {
  const p = (body, bestand) => bountyService.pruefeKatalogAenderung(body, bestand);

  it("ohne Schluessel gibt es nichts zu schalten", () => {
    const r = p({ is_active: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, "BOUNTY_KEY_REQUIRED");
  });

  it("ohne aenderbares Feld ist der Aufruf sinnlos", () => {
    const r = p({ bounty_key: "top_supplier" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "NO_CHANGES", "sonst entsteht ein Audit-Eintrag ohne Aenderung");
  });

  it("is_active muss ein echter Wahrheitswert sein", () => {
    const r = p({ bounty_key: "top_supplier", is_active: "nein" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "IS_ACTIVE_INVALID");
  });

  it("ein Ende vor dem Beginn ist ein Tippfehler, kein 500", () => {
    const r = p({ bounty_key: "x", available_from: "2026-10-01", available_until: "2026-09-01" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "DATE_RANGE_INVALID");
  });

  it("ein Datum in deutscher Schreibweise wird abgewiesen", () => {
    const r = p({ bounty_key: "x", available_until: "01.09.2026" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "DATE_INVALID");
  });

  it("leeres Datum heisst \"keine Grenze\"", () => {
    const r = p({ bounty_key: "x", available_until: "" });
    assert.equal(r.ok, true);
    assert.equal(r.aenderungen.available_until, null);
  });

  it("ein Rabatt ueber der Datenbankgrenze wird abgewiesen", () => {
    const r = p({ bounty_key: "x", discount_pct: 25 });
    assert.equal(r.ok, false);
    assert.equal(r.code, "DISCOUNT_OUT_OF_RANGE", "die CHECK-Bedingung erlaubt hoechstens 20");
  });

  it("ein negativer Rabatt ebenfalls", () => {
    const r = p({ bounty_key: "x", discount_pct: -1 });
    assert.equal(r.ok, false);
    assert.equal(r.code, "DISCOUNT_OUT_OF_RANGE");
  });

  it("gueltige Abschaltung geht durch", () => {
    const r = p({ bounty_key: "top_supplier", is_active: false });
    assert.equal(r.ok, true);
    assert.equal(r.key, "top_supplier");
    assert.equal(r.aenderungen.is_active, false);
  });

  /* Nachgereicht nach der adversarischen Pruefung — jeder Fall stand als
     bestaetigter Befund im Bericht. */

  it("ein Datum, das es im Kalender nicht gibt, wird abgewiesen", () => {
    for (const wert of ["2026-13-01", "2026-02-30", "2026-00-10", "2026-04-31"]) {
      const r = p({ bounty_key: "x", available_until: wert });
      assert.equal(r.ok, false, `${wert} haette abgewiesen werden muessen`);
      assert.equal(r.code, "DATE_INVALID",
        "sonst wird der Wert beim Schreiben zu Invalid Date und landet als NULL — "
        + "und NULL heisst 'unbefristet', aus dem Tippfehler wird eine Kampagne ohne Ende");
    }
  });

  it("ein Schaltjahr-Datum bleibt gueltig", () => {
    assert.equal(p({ bounty_key: "x", available_until: "2028-02-29" }).ok, true);
    assert.equal(p({ bounty_key: "x", available_until: "2027-02-29" }).ok, false);
  });

  it("ein Teil-Update wird gegen den Bestand geprueft, nicht nur gegen den Request", () => {
    // In der Datenbank steht bereits ein Ende; verschoben wird nur der Beginn.
    const r = p({ bounty_key: "x", available_from: "2026-12-01" },
      { available_from: null, available_until: "2026-10-31" });
    assert.equal(r.ok, false,
      "ohne den Bestand liefe das am CHECK der Datenbank auf — als 500 statt als Hinweis");
    assert.equal(r.code, "DATE_RANGE_INVALID");
  });

  it("dasselbe Teil-Update ist in Ordnung, wenn der Bestand passt", () => {
    const r = p({ bounty_key: "x", available_from: "2026-09-01" },
      { available_from: null, available_until: "2026-10-31" });
    assert.equal(r.ok, true);
  });

  it("discount_pct akzeptiert keine Nicht-Zahlen", () => {
    for (const wert of [null, true, false, [], {}, " ", "abc", "0x10"]) {
      const r = p({ bounty_key: "x", discount_pct: wert });
      assert.equal(r.ok, false, `${JSON.stringify(wert)} haette abgewiesen werden muessen`);
      assert.equal(r.code, "DISCOUNT_OUT_OF_RANGE",
        "Number(null) ist 0 — und null bedeutet bei den Datumsfeldern ausdruecklich "
        + "'Feld leeren'. Dieselbe Schreibweise haette hier still 0 % Rabatt gesetzt");
    }
  });

  it("discount_pct akzeptiert Zahl und Zahl-als-Text", () => {
    assert.equal(p({ bounty_key: "x", discount_pct: 7.5 }).aenderungen.discount_pct, 7.5);
    assert.equal(p({ bounty_key: "x", discount_pct: "7.5" }).aenderungen.discount_pct, 7.5);
    assert.equal(p({ bounty_key: "x", discount_pct: 0 }).aenderungen.discount_pct, 0);
  });
});

/* ── 2. Kette und Handler ──────────────────────────────────────────────── */

describe("P9/A2 · Die Wachen haengen vor dem Handler", () => {
  it("Schreiben verlangt Staff, Step-up und Bestaetigung mit Begruendung", () => {
    const router = baueRouter(trackingPool());
    const stack = schichtFuer(router, "post", "/bounty-catalog/update").route.stack;

    assert.ok(stack.length >= 5,
      `nur ${stack.length} Glieder in der Kette — es fehlt eine Wache vor dem Handler`);
    const namen = stack.map((s) => s.handle.name);
    assert.ok(namen.includes("requireConfirmAndReason"),
      "ohne diese Wache kaeme ein Preiseingriff ohne Begruendung durch, und der Handler "
      + "wuerde es nicht bemerken — er liest req.sccReason einfach als undefined");
  });

  it("Lesen verlangt Staff, aber keinen Step-up", () => {
    const router = baueRouter(trackingPool());
    const stack = schichtFuer(router, "get", "/bounty-catalog").route.stack;
    assert.equal(stack.length, 2, "Staff-Wache plus Handler — mehr braucht eine Liste nicht");
  });
});

describe("P9/A2 · Der Schaltvorgang", () => {
  it("die Verwaltungssicht zeigt auch abgeschaltete Eintraege samt Vergabe-Zahlen", async () => {
    const pool = trackingPool([
      { match: "FROM bounties b", rows: [ZEILE, { ...ZEILE, id: "b-x", key: "aus", is_active: false, aktive_vergaben: 0 }] }
    ]);
    const res = mockRes();
    await handlerFuer(baueRouter(pool), "get", "/bounty-catalog")({}, res);

    assert.equal(res._json.success, true);
    assert.equal(res._json.data.items.length, 2);
    assert.equal(res._json.data.aktiv, 1);

    const sql = findCall(pool.calls, "FROM bounties b").sql;
    assert.ok(!/WHERE\s+is_active/.test(sql),
      "eine Verwaltungssicht, die das Abgeschaltete ausblendet, kann es nie wieder einschalten");
    assert.match(sql, /LEFT JOIN user_bounties/,
      "ohne die Vergabe-Zahlen ist \"abschalten\" eine Blindentscheidung");
  });

  it("ein unbekannter Schluessel ist 404 und schreibt nichts", async () => {
    const pool = trackingPool([{ match: "FROM bounties b", rows: [ZEILE] }]);
    const res = mockRes();
    await handlerFuer(baueRouter(pool), "post", "/bounty-catalog/update")(
      { body: { bounty_key: "gibtesnicht", is_active: false }, sccReason: "eine ausreichende Begruendung", sccActorId: "staff-1" },
      res
    );
    assert.equal(res._status, 404);
    assert.equal(res._json.error.code, "BOUNTY_NOT_FOUND");
    assert.equal(findCall(pool.calls, "UPDATE bounties"), undefined);
  });

  it("Abschalten: aendert, auditiert mit Tragweite und meldet die entzogenen Vergaben", async () => {
    const pool = trackingPool([
      { match: "FROM bounties b", rows: [ZEILE] },
      { match: "UPDATE bounties", rows: [{ ...ZEILE, is_active: false }] }
    ]);
    const res = mockRes();
    await handlerFuer(baueRouter(pool), "post", "/bounty-catalog/update")(
      {
        body: { bounty_key: "top_supplier", is_active: false },
        sccReason: "Quelle wird nie berechnet", sccActorId: "staff-1",
        headers: {}, ip: "127.0.0.1"
      },
      res
    );

    assert.equal(res._json.success, true);
    assert.equal(res._json.data.entzogene_vergaben, 4,
      "die Zahl der betroffenen Kunden muss zurueckkommen, sonst bleibt die Tragweite unsichtbar");

    const upd = findCall(pool.calls, "UPDATE bounties");
    assert.ok(upd, "es wurde gar nicht geschrieben");
    assert.match(upd.sql, /updated_at = NOW\(\)/);
    assert.ok(!/user_bounties/.test(upd.sql),
      "der Entzug gehoert in den Trigger (Mig 168), nicht in die Route — sonst greift er bei Hand-SQL nicht");

    const audit = findCall(pool.calls, "staff_audit") || findCall(pool.calls, "INSERT INTO");
    assert.ok(audit, "ein Preiseingriff ohne Audit-Eintrag ist nicht zulaessig");
    const alsText = JSON.stringify(audit.params);
    assert.match(alsText, /staff\.bounty_catalog\.disabled/,
      "die Aktion muss benennen, was passiert ist, nicht nur dass etwas passiert ist");
    assert.match(alsText, /entzogene_vergaben/);
  });

  it("eine reine Rabattaenderung an einem aktiven Bounty heisst 'updated', nicht 'enabled'", async () => {
    const pool = trackingPool([
      { match: "FROM bounties b", rows: [ZEILE] },
      { match: "UPDATE bounties", rows: [{ ...ZEILE, discount_pct: "6.0" }] }
    ]);
    const res = mockRes();
    // Die Oberflaeche schickt inzwischen nur geaenderte Felder — hier zusaetzlich
    // der Fall, dass jemand is_active unveraendert mitsendet.
    await handlerFuer(baueRouter(pool), "post", "/bounty-catalog/update")(
      { body: { bounty_key: "top_supplier", is_active: true, discount_pct: 6 },
        sccReason: "Rabattsatz angepasst", sccActorId: "staff-1", headers: {} },
      res
    );
    assert.equal(res._json.success, true);
    const alsText = JSON.stringify(findCall(pool.calls, "staff_audit")?.params
      || findCall(pool.calls, "INSERT INTO").params);
    assert.match(alsText, /staff\.bounty_catalog\.updated/,
      "aus dem blossen Vorhandensein von is_active die Aktion abzuleiten macht jede "
      + "Aenderung an einem aktiven Bounty zu 'eingeschaltet' — dann ist 'geaendert' "
      + "im Protokoll unauffindbar");
    assert.equal(res._json.data.entzogene_vergaben, 0);
  });

  it("bei einem bereits abgeschalteten Bounty bleibt der urspruengliche Abschaltgrund stehen", async () => {
    const aus = { ...ZEILE, is_active: false, inactive_reason: "Quelle wird nie berechnet", aktive_vergaben: 0 };
    const pool = trackingPool([
      { match: "FROM bounties b", rows: [aus] },
      { match: "UPDATE bounties", rows: [{ ...aus, discount_pct: "6.0" }] }
    ]);
    const res = mockRes();
    await handlerFuer(baueRouter(pool), "post", "/bounty-catalog/update")(
      { body: { bounty_key: "top_supplier", is_active: false, discount_pct: 6 },
        sccReason: "Rabattsatz fuer spaeteren Neustart angepasst", sccActorId: "staff-1", headers: {} },
      res
    );
    const upd = findCall(pool.calls, "UPDATE bounties");
    assert.ok(!upd.params.includes("Rabattsatz fuer spaeteren Neustart angepasst"),
      "der Abschaltgrund erklaert dem Nutzer die Kachel — ihn bei einer spaeteren "
      + "Rabattaenderung zu ueberschreiben loescht diese Erklaerung");
  });

  it("nach dem Abschalten wird die Stufe der Betroffenen nachgezogen", async () => {
    const pool = trackingPool([
      { match: "FROM bounties b", rows: [ZEILE] },
      { match: "SELECT ub.user_id FROM user_bounties", rows: [{ user_id: "u1" }, { user_id: "u2" }] },
      { match: "UPDATE bounties", rows: [{ ...ZEILE, is_active: false }] }
    ]);
    const res = mockRes();
    await handlerFuer(baueRouter(pool), "post", "/bounty-catalog/update")(
      { body: { bounty_key: "top_supplier", is_active: false },
        sccReason: "Aktion beendet, Budget erschoepft", sccActorId: "staff-1", headers: {} },
      res
    );
    assert.equal(res._json.data.stufen_nachgezogen, 2,
      "der Trigger entzieht die Vergabe, aber die daraus abgeleitete Stufe steht "
      + "materialisiert in user_bounty_tiers — ohne Nachziehen behaelt der Kunde die "
      + "zu hohe Rabatt-Obergrenze, bis er zufaellig seine Bounty-Seite oeffnet");
    const halter = findCall(pool.calls, "SELECT ub.user_id FROM user_bounties");
    assert.ok(halter, "die Halter muessen VOR dem Schreiben gelesen werden — der Trigger loescht die Information");
    assert.ok(pool.calls.indexOf(halter) < pool.calls.indexOf(findCall(pool.calls, "UPDATE bounties")),
      "nach dem UPDATE ist niemand mehr als Halter auffindbar");
  });

  it("beim Abschalten ohne interne Notiz uebernimmt die Begruendung deren Platz", async () => {
    const pool = trackingPool([
      { match: "FROM bounties b", rows: [ZEILE] },
      { match: "UPDATE bounties", rows: [{ ...ZEILE, is_active: false }] }
    ]);
    const res = mockRes();
    await handlerFuer(baueRouter(pool), "post", "/bounty-catalog/update")(
      { body: { bounty_key: "top_supplier", is_active: false }, sccReason: "Aktion laeuft aus, Budget erschoepft", sccActorId: "staff-1", headers: {} },
      res
    );
    const upd = findCall(pool.calls, "UPDATE bounties");
    assert.ok(upd.params.includes("Aktion laeuft aus, Budget erschoepft"),
      "ein leeres inactive_reason waere in sechs Monaten wertlos");
  });
});

/* ── 3. Kampagnenzeitraum im Dienst ────────────────────────────────────── */

describe("P9/A2 · Zeitraum steuert das Verdienen, nicht das Behalten", () => {
  const b = (von, bis) => ({ available_from: von, available_until: bis });

  it("ohne Grenzen ist immer verdienbar", () => {
    assert.equal(bountyService.istVerfuegbar(b(null, null), "2026-08-08"), true);
  });

  it("vor dem Beginn nicht", () => {
    assert.equal(bountyService.istVerfuegbar(b("2026-09-01", null), "2026-08-08"), false);
    assert.match(bountyService.verfuegbarkeitsHinweis(b("2026-09-01", null), "2026-08-08"), /01\.09\.2026/);
  });

  it("nach dem Ende nicht", () => {
    assert.equal(bountyService.istVerfuegbar(b(null, "2026-08-07"), "2026-08-08"), false);
    assert.match(bountyService.verfuegbarkeitsHinweis(b(null, "2026-08-07"), "2026-08-08"), /ausgelaufen/);
  });

  it("die Grenzen selbst zaehlen dazu", () => {
    assert.equal(bountyService.istVerfuegbar(b("2026-08-08", "2026-08-08"), "2026-08-08"), true,
      "ein eintaegiges Fenster muss an seinem Tag gelten");
  });

  it("ausserhalb des Fensters wird weder vergeben noch entzogen", async () => {
    const katalog = [{
      id: "b-kampagne", key: "sommer", sort_order: 1, threshold_type: "completed_deals",
      threshold_value: { min_deals: 1 }, is_recurring: true, discount_pct: 2,
      available_from: null, available_until: "2000-01-01"
    }];
    const pool = trackingPool([
      { match: "SELECT * FROM bounties", rows: katalog },
      { match: "emergency_completed", rows: [{ completed: 99 }] }
    ]);

    const ergebnis = await bountyService.evaluateBounties(pool, "u1");

    assert.equal(ergebnis[0].earned, false, "die Bedingung waere erfuellt — das Fenster ist zu");
    assert.match(ergebnis[0].note, /ausgelaufen/);
    assert.equal(findCall(pool.calls, "user_bounties"), undefined,
      "kein Schreibzugriff: ein abgelaufenes Fenster darf einem Kunden nichts wegnehmen, "
      + "was er im Fenster verdient hat");
  });
});

/* ── 4. Am echten Trigger nachgemessen ─────────────────────────────────── */

describe("P9/A2 · Der Entzug haengt an der Datenbank, nicht am Dienst",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("Abschalten entzieht laufende Vergaben, Wiedereinschalten gibt sie nicht zurueck", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: [b] } = await client.query(
        `INSERT INTO bounties (key, name_de, description_de, category, discount_pct, threshold_type, is_active)
         VALUES ('a2_probe', 'A2 Probe', 'Nur fuer den Test', 'loyalty', 1.0, 'completed_deals', TRUE)
         RETURNING id`
      );
      const { rows: [u] } = await client.query("SELECT id FROM users LIMIT 1");
      if (!u) { await client.query("ROLLBACK"); return; }

      await client.query(
        "INSERT INTO user_bounties (user_id, bounty_id, is_active, progress) VALUES ($1,$2,TRUE,100)",
        [u.id, b.id]
      );

      const zaehle = async () => Number((await client.query(
        "SELECT COUNT(*)::int AS n FROM user_bounties WHERE bounty_id = $1 AND is_active", [b.id]
      )).rows[0].n);

      assert.equal(await zaehle(), 1);

      await client.query("UPDATE bounties SET is_active = FALSE WHERE id = $1", [b.id]);
      assert.equal(await zaehle(), 0, "der Trigger aus Migration 168 hat nicht gegriffen");

      await client.query("UPDATE bounties SET is_active = TRUE WHERE id = $1", [b.id]);
      assert.equal(await zaehle(), 0,
        "Wiedereinschalten darf nichts zurueckgeben — ob der Nutzer es heute noch verdient, "
        + "entscheidet die Bedingung, nicht ein alter Datenbankzustand");

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });
});
