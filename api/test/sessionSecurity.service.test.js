/**
 * Sitzungs-Haertung (P5.1) — Hoechstalter und Fernabmeldung.
 *
 * Die Luecke davor: die Plattform-Sitzung lief 14 Tage "rollend" OHNE absolute
 * Obergrenze. Wer alle 13 Tage einmal klickte, blieb unbegrenzt angemeldet — eine
 * entwendete Sitzung wurde nie von allein ungueltig. `express-session` kann das nicht:
 * `maxAge` + `rolling` ergibt eine Leerlauf-Frist, kein Hoechstalter.
 *
 * Owner-Entscheidung 2026-08-01: Leerlauf 8 Stunden, absolut 7 Tage.
 *
 * Run: node --test --test-force-exit test/sessionSecurity.service.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_TIMEOUT_MS, ABSOLUTE_LIFETIME_MS, stampSession,
  enforceAbsoluteLifetime, destroyAllUserSessions, countUserSessions
} from "../services/sessionSecurityService.js";

const USER = "11111111-1111-1111-1111-111111111111";

function mockRes() {
  const res = {
    _status: 200, _json: null, _cleared: null,
    status(c) { res._status = c; return res; },
    json(p) { res._json = p; return res; },
    clearCookie(name) { res._cleared = name; return res; }
  };
  return res;
}

/** Sitzung mit funktionierendem destroy(), wie express-session sie liefert. */
function mockSession(over = {}) {
  const s = {
    userId: USER,
    destroyed: false,
    destroy(cb) { s.destroyed = true; cb?.(null); },
    ...over
  };
  return s;
}

describe("Fristen", () => {
  it("haelt die vom Owner entschiedenen Werte fest", () => {
    // Absichtlich hart gepruefte Zahlen: eine stille Verlaengerung waere eine
    // Sicherheitsentscheidung, die niemand getroffen hat.
    assert.equal(IDLE_TIMEOUT_MS, 8 * 60 * 60 * 1000, "Leerlauf: 8 Stunden");
    assert.equal(ABSOLUTE_LIFETIME_MS, 7 * 24 * 60 * 60 * 1000, "Hoechstalter: 7 Tage");
  });

  it("stempelt eine Sitzung", () => {
    const s = {};
    stampSession(s);
    assert.ok(s.createdAt > 0);
  });

  it("stolpert nicht ueber eine fehlende Sitzung", () => {
    assert.doesNotThrow(() => stampSession(null));
  });
});

describe("Hoechstalter", () => {
  it("laesst eine frische Sitzung durch", () => {
    const guard = enforceAbsoluteLifetime();
    const req = { session: mockSession({ createdAt: Date.now() }) };
    let weiter = false;
    guard(req, mockRes(), () => { weiter = true; });
    assert.equal(weiter, true);
    assert.equal(req.session.destroyed, false);
  });

  it("verwirft eine Sitzung jenseits des Hoechstalters — auch wenn sie eben noch benutzt wurde", () => {
    // Der Kern: staendige Nutzung verlaengert die Leerlauf-Frist, aber nicht das Alter.
    const guard = enforceAbsoluteLifetime();
    const req = { session: mockSession({ createdAt: Date.now() - ABSOLUTE_LIFETIME_MS - 1000 }) };
    const res = mockRes();
    let weiter = false;
    guard(req, res, () => { weiter = true; });
    assert.equal(weiter, false, "Kein Durchlass nach Ablauf");
    assert.equal(req.session.destroyed, true);
    assert.equal(res._status, 401);
    assert.equal(res._json.error, "SESSION_EXPIRED");
    assert.equal(res._json.reason, "absolute_lifetime", "Die Oberflaeche soll 'abgelaufen' sagen koennen, nicht 'verweigert'");
    assert.equal(res._cleared, "tc.sid");
  });

  it("stempelt eine Bestandssitzung nach, statt sie hinauszuwerfen", () => {
    // Ein Deploy, der alle Angemeldeten aussperrt, ist ein Ausfall, kein Sicherheitsgewinn.
    const guard = enforceAbsoluteLifetime();
    const req = { session: mockSession() }; // ohne createdAt
    let weiter = false;
    guard(req, mockRes(), () => { weiter = true; });
    assert.equal(weiter, true);
    assert.ok(req.session.createdAt > 0, "Ab jetzt laeuft die Frist");
    assert.equal(req.session.destroyed, false);
  });

  it("laesst anonyme Anfragen unberuehrt", () => {
    const guard = enforceAbsoluteLifetime();
    let weiter = false;
    guard({ session: { } }, mockRes(), () => { weiter = true; });
    assert.equal(weiter, true);
  });

  it("stolpert nicht ueber eine fehlende Sitzung", () => {
    const guard = enforceAbsoluteLifetime();
    let weiter = false;
    guard({}, mockRes(), () => { weiter = true; });
    assert.equal(weiter, true);
  });

  it("laesst die Frist konfigurieren (Testbarkeit ohne Zeitreise)", () => {
    const guard = enforceAbsoluteLifetime({ lifetimeMs: 1000, now: () => 5000 });
    const req = { session: mockSession({ createdAt: 3000 }) };
    let weiter = false;
    guard(req, mockRes(), () => { weiter = true; });
    assert.equal(weiter, false, "2000ms alt bei 1000ms Frist");
  });
});

describe("Fernabmeldung", () => {
  function poolStub(rowCount = 3) {
    const calls = [];
    return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rowCount, rows: [{ anzahl: rowCount }] }; } };
  }

  it("filtert ueber das userId-FELD, nicht ueber den Text der Sitzung", async () => {
    // Der naheliegende Weg `sess::text LIKE '%<id>%'` trifft auch Sitzungen, in denen die
    // Kennung nur ERWAEHNT wird (etwa waehrend einer Staff-Stellvertretung) — und meldet
    // damit Unbeteiligte ab. Genau dieses Muster steckt noch in dataGovernanceService.
    const pool = poolStub();
    await destroyAllUserSessions(pool, USER);
    const sql = pool.calls[0].sql;
    assert.match(sql, /sess->>'userId' = \$1/);
    assert.ok(!/LIKE/i.test(sql), "Kein Teilstring-Vergleich auf der ganzen Sitzung");
    assert.deepEqual(pool.calls[0].params, [USER]);
  });

  it("verschont die aktuelle Sitzung, wenn gewuenscht", async () => {
    // Der Normalfall ist ein verlorenes Geraet: wer sich selbst aussperrt, kann nicht
    // nachsehen, ob es geklappt hat.
    const pool = poolStub();
    await destroyAllUserSessions(pool, USER, { exceptSid: "sid-aktuell" });
    assert.match(pool.calls[0].sql, /sid <> \$2/);
    assert.deepEqual(pool.calls[0].params, [USER, "sid-aktuell"]);
  });

  it("beendet auf Wunsch auch die aktuelle", async () => {
    const pool = poolStub();
    await destroyAllUserSessions(pool, USER, { exceptSid: null });
    assert.ok(!/sid <> /.test(pool.calls[0].sql));
  });

  it("meldet die Anzahl beendeter Sitzungen", async () => {
    assert.deepEqual(await destroyAllUserSessions(poolStub(4), USER), { beendet: 4 });
  });

  it("tut ohne Nutzer nichts — kein Rundumschlag", async () => {
    const pool = poolStub();
    assert.deepEqual(await destroyAllUserSessions(pool, null), { beendet: 0 });
    assert.equal(pool.calls.length, 0, "Ohne Kennung darf gar keine Abfrage laufen");
  });

  it("zaehlt nur unverfallene Sitzungen", async () => {
    const pool = poolStub(2);
    assert.equal(await countUserSessions(pool, USER), 2);
    assert.match(pool.calls[0].sql, /expire > NOW\(\)/);
    assert.match(pool.calls[0].sql, /sess->>'userId' = \$1/);
  });
});
