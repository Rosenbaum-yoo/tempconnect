/**
 * Welle N2.10 — Loeschen raeumt die Einsatzplanung auf, und die Sperre greift.
 *
 * BEFUND 2026-09-15, zwei Owner-Entscheide:
 *
 *  1. "Vollstaendig aufraeumen." Keiner der drei Loeschpfade fasste die
 *     Einsatzplanung an; `anonymizeUser` (DELETE /me) liess die Kraft sogar
 *     AKTIV im Kandidatenpool. Das automatische Nachruecken konnte einen
 *     geloeschten Menschen einladen und benachrichtigen.
 *  2. "Beides sperren." Der Rechnungs-Riegel hat nie gegriffen (falsche Spalte,
 *     falscher Status, Fehler geschluckt), und die eingesetzte Kraft wurde nie
 *     gefragt — sie konnte ihr Konto mitten im Einsatz loeschen.
 *
 * Geprueft wird an der Wirkung: welche Zustaende geschrieben werden, woran
 * gebunden, INNERHALB welcher Transaktion — und dass eine scheiternde
 * Sperr-Abfrage die Loeschung verhindert statt sie freizugeben. Ob die Spalten
 * existieren, zeigt `integration/loeschenRaeumtAuf.flow.test.js` an der echten
 * Datenbank; ohne Datenbank `sqlSchemaWaechter.test.js`.
 *
 * Run: node --test --test-force-exit test/loeschenRaeumtAuf.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as staffing from "../services/assignmentStaffingService.js";
import * as dg from "../services/dataGovernanceService.js";
import * as profilGov from "../services/workerProfileGovernanceService.js";
import { createMeRouter } from "../routes/me.js";
import { todayDE } from "../utils/dateDE.js";

const KRAFT = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";

/* Schreibt jede Abfrage mit — auch BEGIN/COMMIT/ROLLBACK, damit sich zeigen
   laesst, dass etwas INNERHALB der Transaktion lief. */
function spurPool(antwort = () => null) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = String(sql);
    calls.push({ sql: text, params });
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    const out = antwort(text, params);
    return out || { rows: [], rowCount: 0 };
  };
  return {
    calls, query,
    connect: async () => ({ query, release() {} }),
    finde: (muster) => calls.filter((c) => muster.test(c.sql))
  };
}
const flach = (s) => s.replace(/\s+/g, " ").trim();
const zeilen = (arr) => ({ rows: arr, rowCount: arr.length });
const index = (pool, muster) => pool.calls.findIndex((c) => muster.test(c.sql));

describe("N2.10 — raeumeEinsatzplanungAuf", () => {
  it("ohne Person keine einzige Abfrage", async () => {
    const pool = spurPool();
    const e = await staffing.raeumeEinsatzplanungAuf(pool, null);
    assert.equal(pool.calls.length, 0);
    assert.deepEqual(staffing.aufgeraeumteTabellen(e), []);
  });

  it("jeder Schritt schreibt den richtigen Zustand, gebunden an DIESE Person", async () => {
    const pool = spurPool();
    await staffing.raeumeEinsatzplanungAuf(pool, KRAFT);
    const erwartet = [
      [/UPDATE assignment_staffing_reservations/, ["SET status = 'released'", "release_reason = 'person_geloescht'", "WHERE worker_user_id = $1 AND status = 'reserved'", "RETURNING id, assignment_id, invite_id"]],
      [/UPDATE assignment_staffing_invites/, ["SET status = 'cancelled'", "remind_after = NULL", "WHERE worker_user_id = $1", "status IN ('sent', 'viewed', 'interested')", "(status = 'accepted' AND id = ANY($2::uuid[]))"]],
      [/UPDATE assignment_staffing_choice_sets/, ["SET status = 'cancelled'", "WHERE worker_user_id = $1", "status IN ('options_presented', 'preference_submitted', 'preference_ranked')"]],
      [/UPDATE worker_assignment_links/, ["worker_confirmation_status = 'worker_declined'", "worker_declined_reason = $2", "is_active = FALSE", "WHERE worker_user_id = $1 AND is_active = TRUE AND worker_confirmation_status = 'pending_confirmation'"]],
      [/DELETE FROM assignment_staffing_waitlist/, ["WHERE worker_user_id = $1"]],
      [/UPDATE capacity_posts cp/, ["SET status = 'archived', is_active = FALSE", "cp.status IN ('draft', 'active', 'paused')", "cp.worker_profile_id IN (SELECT wp.id FROM worker_profiles wp WHERE wp.user_id = $1)"]]
    ];
    for (const [muster, teile] of erwartet) {
      const q = pool.finde(muster);
      assert.equal(q.length, 1, `${muster} lief ${q.length}x`);
      const sql = flach(q[0].sql);
      for (const t of teile) assert.ok(sql.includes(t), `${muster}: fehlt "${t}"`);
      assert.equal(q[0].params[0], KRAFT, `${muster}: nicht an die Person gebunden`);
    }
    assert.equal(pool.finde(/UPDATE worker_assignment_links/)[0].params[1], staffing.GRUND_PERSON_GELOESCHT);
    // Unbeantwortete Anfragen werden abgelehnt, bestaetigte NICHT angefasst.
    assert.equal(/auto_confirmed|worker_confirmed/.test(pool.finde(/UPDATE worker_assignment_links/)[0].sql), false);
    // Die Vormerkungen werden GELOESCHT, nicht nur als entfernt markiert (Owner-Entscheid).
    assert.equal(pool.finde(/UPDATE assignment_staffing_waitlist/).length, 0);
  });

  it("die Einladung einer eben freigegebenen Reservierung wird mit zurueckgezogen", async () => {
    const pool = spurPool((sql) => (/UPDATE assignment_staffing_reservations/.test(sql)
      ? zeilen([{ id: "r1", assignment_id: "a1", invite_id: "inv-angenommen" }, { id: "r2", assignment_id: "a1", invite_id: null }])
      : null));
    await staffing.raeumeEinsatzplanungAuf(pool, KRAFT);
    assert.deepEqual(pool.finde(/UPDATE assignment_staffing_invites/)[0].params, [KRAFT, ["inv-angenommen"]]);
  });

  it("jeder betroffene Einsatz wird genau EINMAL neu berechnet — keiner, der nicht betroffen ist", async () => {
    const pool = spurPool((sql) => {
      if (/UPDATE assignment_staffing_reservations/.test(sql)) return zeilen([{ id: "r1", assignment_id: "a1", invite_id: null }]);
      if (/UPDATE assignment_staffing_invites/.test(sql)) return zeilen([{ id: "i1", assignment_id: "a1" }, { id: "i2", assignment_id: "a2" }]);
      if (/UPDATE worker_assignment_links/.test(sql)) return zeilen([{ id: "l1", assignment_id: "a3" }]);
      if (/DELETE FROM assignment_staffing_waitlist/.test(sql)) return zeilen([{ assignment_id: "a2" }, { assignment_id: "a4" }]);
      if (/UPDATE assignment_staffing_choice_sets/.test(sql)) return zeilen([{ id: "cs1" }]);
      if (/UPDATE capacity_posts cp/.test(sql)) return zeilen([{ id: "cp1" }]);
      return null;
    });
    const e = await staffing.raeumeEinsatzplanungAuf(pool, KRAFT);
    const neu = pool.finde(/LEFT JOIN organizations buyer/).map((c) => c.params[0]).sort();
    assert.deepEqual(neu, ["a1", "a2", "a3", "a4"]);
    assert.deepEqual(e, { reservierungen: 1, einladungen: 2, auswahl: 1, anfragen: 1, vormerkungen: 2, marktangebote: 1, einsaetze_neu_berechnet: 4 });
    assert.deepEqual(staffing.aufgeraeumteTabellen(e), [
      "assignment_staffing_reservations", "assignment_staffing_invites", "assignment_staffing_choice_sets",
      "worker_assignment_links", "assignment_staffing_waitlist", "capacity_posts"
    ]);
  });
});

describe("N2.10 — DELETE /me raeumt auf", () => {
  const mitNutzer = (sql) => (/SELECT email FROM users WHERE id = \$1/.test(sql) ? zeilen([{ email: "kraft@example.com" }]) : null);

  it("Profil inaktiv, Koordinaten weg, Einsatzplanung aufgeraeumt — alles in DERSELBEN Transaktion", async () => {
    const pool = spurPool(mitNutzer);
    const r = await dg.anonymizeUser(pool, KRAFT, KRAFT);
    assert.equal(r.success, true);

    const users = flach(pool.finde(/^UPDATE users SET email/)[0].sql);
    assert.ok(users.includes("latitude = NULL, longitude = NULL"), "die Koordinaten des Wohnorts bleiben stehen");
    const profil = flach(pool.finde(/^UPDATE worker_profiles SET first_name/)[0].sql);
    assert.ok(profil.includes("is_active = FALSE"), "die Kraft bleibt AKTIV im Kandidatenpool");
    assert.ok(profil.includes("notes = NULL"));

    const begin = index(pool, /^BEGIN$/);
    const commit = index(pool, /^COMMIT$/);
    for (const muster of [/UPDATE assignment_staffing_reservations/, /UPDATE assignment_staffing_invites/, /DELETE FROM assignment_staffing_waitlist/, /UPDATE capacity_posts cp/]) {
      const i = index(pool, muster);
      assert.ok(i > begin && i < commit, `${muster} laeuft nicht in der Loesch-Transaktion (Index ${i}, BEGIN ${begin}, COMMIT ${commit})`);
    }
    const audit = pool.finde(/INSERT INTO audit_log/)[0];
    const details = JSON.parse(audit.params[2]);
    assert.deepEqual(Object.keys(details.einsatzplanung).sort(), ["anfragen", "auswahl", "einladungen", "einsaetze_neu_berechnet", "marktangebote", "reservierungen", "vormerkungen"]);
    assert.equal(details.responsible_actor_user_id, KRAFT);
  });

  it("scheitert das Aufraeumen, faellt die ganze Loeschung — kein halb geloeschter Mensch", async () => {
    const pool = spurPool((sql) => {
      if (/DELETE FROM assignment_staffing_waitlist/.test(sql)) throw new Error("db weg");
      return mitNutzer(sql);
    });
    await assert.rejects(dg.anonymizeUser(pool, KRAFT, KRAFT), /db weg/);
    assert.ok(index(pool, /^ROLLBACK$/) > index(pool, /UPDATE users SET email/), "kein ROLLBACK nach dem users-UPDATE");
    assert.equal(index(pool, /^COMMIT$/), -1);
  });
});

describe("N2.10 — die Sperre greift", () => {
  it("Rechnungen: user_id und die Status, die es gibt", async () => {
    const pool = spurPool();
    await dg.canDeleteUser(pool, KRAFT);
    const q = pool.finde(/FROM invoices/)[0];
    assert.match(flach(q.sql), /WHERE user_id = \$1 AND status IN \('draft','issued','overdue'\)$/);
    assert.deepEqual(q.params, [KRAFT]);
  });

  it("offene Rechnung sperrt", async () => {
    const pool = spurPool((sql) => (/FROM invoices/.test(sql) ? zeilen([{ c: 1 }]) : null));
    assert.deepEqual((await dg.canDeleteUser(pool, KRAFT)).blockers, [{ reason: "OPEN_INVOICES", count: 1 }]);
  });

  it("eigene laufende Einsaetze der Kraft: bestaetigt, heute noch nicht beendet, gebunden an Person und HEUTE (Berlin)", async () => {
    const pool = spurPool((sql) => (/FROM worker_assignment_links/.test(sql) ? zeilen([{ c: 2 }]) : null));
    const r = await dg.canDeleteUser(pool, KRAFT);
    assert.deepEqual(r.blockers, [{ reason: "ACTIVE_DEPLOYMENTS", count: 2 }]);
    assert.equal(r.canDelete, false);
    const q = pool.finde(/FROM worker_assignment_links/)[0];
    const sql = flach(q.sql);
    assert.deepEqual(q.params, [KRAFT, todayDE()]);
    assert.ok(sql.includes("worker_user_id = $1"));
    assert.ok(sql.includes("is_active = TRUE"));
    assert.ok(sql.includes("worker_confirmation_status IN ('auto_confirmed','worker_confirmed','worker_unavailable')"));
    assert.ok(sql.includes("(end_date IS NULL OR end_date >= $2::date)"));
    // Eine unbeantwortete Anfrage sperrt NICHT — die zieht die Loeschung zurueck.
    assert.equal(sql.includes("pending_confirmation"), false);
  });

  it("FAIL-CLOSED: scheitert eine Sperr-Abfrage, wird NICHT geloescht", async () => {
    for (const tabelle of ["assignments", "timesheets", "invoices", "worker_assignment_links"]) {
      const pool = spurPool((sql) => {
        if (new RegExp(`COUNT\\(\\*\\)::int AS c FROM ${tabelle}\\b`).test(sql)) throw new Error(`Sperre ${tabelle} kaputt`);
        return /SELECT email FROM users/.test(sql) ? zeilen([{ email: "k@example.com" }]) : null;
      });
      await assert.rejects(dg.anonymizeUser(pool, KRAFT, KRAFT), new RegExp(`Sperre ${tabelle} kaputt`), `${tabelle}: Fehler wurde geschluckt`);
      assert.equal(pool.finde(/UPDATE users SET email/).length, 0, `${tabelle}: trotz kaputter Sperre anonymisiert`);
    }
  });

  it("die Route antwortet 409 mit ACTIVE_DEPLOYMENTS — und 500 statt 200, wenn die Sperre nicht pruefbar ist", async () => {
    const routeFuer = (pool) => {
      const router = createMeRouter({
        pool, logger: { info() {}, warn() {}, error() {}, debug() {} }, requireAuth: (_q, _s, n) => n(),
        sendMail: async () => true, getUserAndPlan: async () => ({ id: KRAFT })
      });
      const layer = router.stack.find((l) => l.route?.path === "/me" && l.route.methods.delete);
      return layer.route.stack[layer.route.stack.length - 1].handle;
    };
    const antwort = () => {
      const res = { _status: 200, _json: null, locals: {}, status(c) { this._status = c; return this; }, json(p) { this._json = p; return this; } };
      return res;
    };

    const gesperrt = spurPool((sql) => (/FROM worker_assignment_links/.test(sql) ? zeilen([{ c: 1 }]) : null));
    const res1 = antwort();
    await routeFuer(gesperrt)({ session: { userId: KRAFT, destroy() {} } }, res1);
    assert.equal(res1._status, 409);
    assert.deepEqual(res1._json.blockers, [{ reason: "ACTIVE_DEPLOYMENTS", count: 1 }]);
    assert.match(res1._json.message, /laufende oder zugesagte Einsätze/);

    const kaputt = spurPool((sql) => { if (/FROM invoices/.test(sql)) throw new Error("x"); return null; });
    const res2 = antwort();
    await routeFuer(kaputt)({ session: { userId: KRAFT, destroy() {} } }, res2);
    assert.equal(res2._status, 500);
    assert.equal(kaputt.finde(/UPDATE users SET email/).length, 0);
  });
});

describe("N2.10 — die anderen beiden Loeschpfade", () => {
  it("deleteWorkerData raeumt die Einsatzplanung auf und nimmt die Koordinaten", async () => {
    const pool = spurPool();
    await dg.deleteWorkerData(pool, KRAFT, "zaf-admin");
    assert.equal(pool.finde(/DELETE FROM assignment_staffing_waitlist/)[0]?.params[0], KRAFT);
    const users = pool.finde(/UPDATE users SET latitude = NULL, longitude = NULL/);
    assert.equal(users.length, 1);
    assert.deepEqual(users[0].params, [KRAFT]);
  });

  it("anonymizeWorkerProfile raeumt bei einem Konto auf — ohne Konto gibt es nichts aufzuraeumen", async () => {
    const PROFIL = "5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e";
    for (const [userId, erwartet] of [[KRAFT, 1], [null, 0]]) {
      const pool = spurPool((sql) => (/SELECT wp\.\* FROM worker_profiles wp WHERE wp\.id = \$2 AND wp\.supplier_org_id = \$1/.test(sql)
        ? zeilen([{ id: PROFIL, user_id: userId, first_name: "Eva", last_name: "Muster" }])
        : null));
      const r = await profilGov.anonymizeWorkerProfile(pool, "org-zaf", PROFIL, { actorId: "admin", reason: "Austritt auf eigenen Wunsch" });
      assert.equal(r.success, true);
      const vormerkung = pool.finde(/DELETE FROM assignment_staffing_waitlist/);
      assert.equal(vormerkung.length, erwartet, `user_id=${userId}: Aufraeumen lief ${vormerkung.length}x`);
      if (erwartet) assert.equal(vormerkung[0].params[0], KRAFT);
    }
  });

  it("die Profil-Auskunft nennt Einladungen und Vormerkungen aus DENSELBEN Abfragen", async () => {
    const PROFIL = "6e6e6e6e-6e6e-4e6e-8e6e-6e6e6e6e6e6e";
    const pool = spurPool((sql) => {
      if (/SELECT wp\.\* FROM worker_profiles wp WHERE wp\.id = \$2/.test(sql)) return zeilen([{ id: PROFIL, user_id: KRAFT }]);
      if (sql === staffing.AUSKUNFT_VORMERKUNGEN_SQL) return zeilen([{ id: "wl-1", queue_rank: 4 }]);
      if (sql === staffing.AUSKUNFT_EINLADUNGEN_SQL) return zeilen([{ id: "inv-1" }]);
      return null;
    });
    const r = await profilGov.exportWorkerProfileData(pool, "org-zaf", PROFIL);
    assert.deepEqual(r.einsatzplanung.vormerkungen, [{ id: "wl-1", queue_rank: 4 }]);
    assert.deepEqual(r.einsatzplanung.einladungen, [{ id: "inv-1" }]);
    assert.equal(r.einsatzplanung.hinweis, staffing.EINSATZPLANUNG_HINWEIS);
    assert.deepEqual(pool.calls.find((c) => c.sql === staffing.AUSKUNFT_VORMERKUNGEN_SQL).params, [KRAFT]);
    // Und die Konto-Auskunft nutzt dieselben Texte.
    const pool2 = spurPool((sql) => (/FROM users WHERE id = \$1/.test(sql) ? zeilen([{ id: KRAFT }]) : null));
    await dg.exportUserDataFull(pool2, KRAFT);
    assert.ok(pool2.calls.some((c) => c.sql === staffing.AUSKUNFT_VORMERKUNGEN_SQL));
    assert.ok(pool2.calls.some((c) => c.sql === staffing.AUSKUNFT_EINLADUNGEN_SQL));
  });
});
