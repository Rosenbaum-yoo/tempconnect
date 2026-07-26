/**
 * Instant-Matching-Chokepoint (P4.1) — Verhaltens-Spezifikation.
 *
 * Geprueft wird das Verhalten, das den Chokepoint ausmacht, nicht die Implementierung:
 *   - kanonischer, richtungsunabhaengiger Paar-Schluessel
 *   - Deep-Links auf das konkrete Gegenstueck (keine Uebersichtsseite)
 *   - beide Seiten werden alarmiert (Anbieter UND Nachfrager)
 *   - Dedup entscheidet die DB (ON CONFLICT -> rowCount 0 -> keine Benachrichtigung)
 *   - Empfaenger kommen aus der Rechte-Matrix, Fallback auf den Eigentuemer-Account
 *   - Selbstmatch (eigene Kapazitaet gegen eigenen Bedarf) alarmiert nie
 *   - nicht matchfaehige Quellen (Entwurf/geschlossen) loesen nichts aus
 *   - fire-and-forget kann den Erstellungsflow nicht scheitern lassen
 *
 * Kein DB-Zugriff — Tracking-Pool.
 * Run: node --test --test-force-exit test/matchTrigger.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPairKey,
  deepLinkFor,
  buildTriggerMessage,
  runMatchTrigger,
  scheduleMatchTrigger,
  TRIGGER_MAX_ALERTS
} from "../services/matchTriggerService.js";

const CAP = "00000000-0000-4000-8000-0000000000c1";
const DEM = "00000000-0000-4000-8000-0000000000d1";
const REQ = "00000000-0000-4000-8000-0000000000r1".replace("r", "a");
const SUPPLIER_USER = "00000000-0000-4000-8000-0000000000u1";
const BUYER_USER = "00000000-0000-4000-8000-0000000000u2";
const SUPPLIER_ORG = "00000000-0000-4000-8000-0000000000o1";

/** Tracking-Pool: erste passende Regel gewinnt, sonst leeres Ergebnis. */
function trackingPool(rules = []) {
  const calls = [];
  const query = async (sql, params) => {
    const s = String(sql);
    calls.push({ sql: s, params: params || [] });
    for (const r of rules) {
      if (r.match(s, params || [])) {
        return typeof r.respond === "function" ? r.respond(s, params || []) : r.respond;
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

const capacityRow = (over = {}) => ({
  id: CAP,
  supplier_company_id: SUPPLIER_USER,
  org_id: null,
  title: "3 Pflegekraefte Nachtschicht",
  role: "Pflegekraft",
  skill_tags: ["nachtschicht"],
  location_city: "Kiel",
  location_lat: null,
  location_lng: null,
  radius_km: 25,
  availability_from: "2026-08-01",
  availability_to: "2026-09-30",
  is_active: true,
  status: "active",
  ...over
});

const demandRow = (over = {}) => ({
  id: DEM,
  requester_company_id: BUYER_USER,
  title: "Pflegekraft Nachtdienst gesucht",
  role: "Pflegekraft",
  skill_tags: ["nachtschicht"],
  location_city: "Kiel",
  location_lat: null,
  location_lng: null,
  radius_km: 25,
  start_date: "2026-08-05",
  end_date: "2026-08-20",
  urgency: "normal",
  status: "open",
  ...over
});

/** Pool fuer die Richtung "Angebot angelegt -> passende Nachfrage finden". */
function capacitySourcePool({ demands = [demandRow()], alertInsert = { rows: [], rowCount: 1 }, orgMembers = [] } = {}) {
  return trackingPool([
    { match: (s) => s.includes("FROM capacity_posts") && s.includes("is_active = TRUE") && s.includes("id = $1"),
      respond: { rows: [capacityRow()], rowCount: 1 } },
    { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1"),
      respond: { rows: [capacityRow()], rowCount: 1 } },
    { match: (s) => s.includes("FROM demand_requests WHERE status = 'open'"),
      respond: { rows: demands, rowCount: demands.length } },
    { match: (s) => s.includes("FROM org_memberships"),
      respond: { rows: orgMembers.map((user_id) => ({ user_id })), rowCount: orgMembers.length } },
    { match: (s) => s.includes("INSERT INTO match_alerts"), respond: alertInsert }
  ]);
}

const alertInserts = (pool) => pool.calls.filter((c) => c.sql.includes("INSERT INTO match_alerts"));
const notificationInserts = (pool) => pool.calls.filter((c) => c.sql.includes("INSERT INTO notifications"));

// ═══════════════════════════════════════════════════════════════
// Paar-Schluessel
// ═══════════════════════════════════════════════════════════════

describe("buildPairKey — Dedup-Wahrheit, richtungsunabhaengig", () => {
  it("liefert denselben Schluessel, egal welche Seite zuerst kam", () => {
    assert.equal(
      buildPairKey("capacity_post", CAP, "demand_request", DEM),
      buildPairKey("demand_request", DEM, "capacity_post", CAP)
    );
  });

  it("trennt unterschiedliche Paare", () => {
    assert.notEqual(
      buildPairKey("capacity_post", CAP, "demand_request", DEM),
      buildPairKey("capacity_post", CAP, "requisition", REQ)
    );
  });

  it("enthaelt Typ und ID beider Seiten", () => {
    const key = buildPairKey("capacity_post", CAP, "demand_request", DEM);
    assert.ok(key.includes(`capacity_post:${CAP}`));
    assert.ok(key.includes(`demand_request:${DEM}`));
    assert.ok(key.includes("|"));
  });
});

// ═══════════════════════════════════════════════════════════════
// Deep-Links
// ═══════════════════════════════════════════════════════════════

describe("deepLinkFor — konkretes Ziel statt Uebersicht", () => {
  it("verlinkt ein Angebot auf seine Detailseite", () => {
    assert.equal(deepLinkFor("capacity_post", CAP), `/public/capacity_exchange_detail.html?id=${CAP}&type=supply`);
  });

  it("verlinkt eine Nachfrage auf ihre Detailansicht", () => {
    assert.equal(deepLinkFor("demand_request", DEM), `/public/capacity_exchange_detail.html?id=${DEM}&type=demand`);
  });

  it("verlinkt eine Requisition mit Fokus auf den konkreten Vorgang", () => {
    assert.equal(deepLinkFor("requisition", REQ), `/public/requisitions.html?focus_id=${REQ}`);
  });

  it("gibt fuer unbekannte Typen null zurueck statt eine falsche Seite", () => {
    assert.equal(deepLinkFor("etwas_anderes", "x"), null);
  });
});

describe("buildTriggerMessage", () => {
  it("nennt Art, Titel, Rolle, Ort und Score", () => {
    const msg = buildTriggerMessage(
      { type: "capacity_post", title: "3 Pflegekraefte", role: "Pflegekraft", city: "Kiel" }, 72.4
    );
    assert.match(msg, /Passendes Personalangebot/);
    assert.match(msg, /3 Pflegekraefte/);
    assert.match(msg, /Pflegekraft/);
    assert.match(msg, /Kiel/);
    assert.match(msg, /72%/);
  });

  it("kennzeichnet die Gegenrichtung als Auftrag", () => {
    const msg = buildTriggerMessage({ type: "demand_request", title: "Nachtdienst", role: "", city: "" }, 55);
    assert.match(msg, /Passender Auftrag/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Quellen-Gate
// ═══════════════════════════════════════════════════════════════

describe("runMatchTrigger — Quellen-Gate", () => {
  it("weist unbekannte Quelltypen ab, ohne die DB anzufassen", async () => {
    const pool = trackingPool();
    const out = await runMatchTrigger(pool, { sourceType: "haus", sourceId: CAP });
    assert.equal(out.skipped, "invalid_source");
    assert.equal(pool.calls.length, 0);
  });

  it("weist einen fehlenden Bezug ab", async () => {
    const pool = trackingPool();
    const out = await runMatchTrigger(pool, { sourceType: "capacity_post" });
    assert.equal(out.skipped, "invalid_source");
  });

  it("loest nichts aus, wenn die Quelle nicht matchfaehig ist (Entwurf/geschlossen)", async () => {
    const pool = trackingPool(); // Quelle liefert keine Zeile
    const out = await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });
    assert.equal(out.skipped, "not_matchable");
    assert.equal(out.alerts, 0);
    assert.equal(alertInserts(pool).length, 0);
  });

  it("laedt ein Kapazitaetsangebot nur im aktiven Zustand", async () => {
    const pool = trackingPool();
    await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });
    const load = pool.calls[0];
    assert.match(load.sql, /is_active = TRUE/);
    assert.match(load.sql, /status = 'active'/);
    assert.deepEqual(load.params, [CAP]);
  });

  it("laedt eine Nachfrage nur im Zustand open", async () => {
    const pool = trackingPool();
    await runMatchTrigger(pool, { sourceType: "demand_request", sourceId: DEM });
    assert.match(pool.calls[0].sql, /FROM demand_requests WHERE id = \$1 AND status = 'open'/);
  });

  it("laedt eine Requisition nur in offenen Status", async () => {
    const pool = trackingPool();
    await runMatchTrigger(pool, { sourceType: "requisition", sourceId: REQ });
    assert.match(pool.calls[0].sql, /FROM requisitions WHERE id = \$1 AND status IN \('OPEN','IN_REVIEW','SHORTLISTED'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Bidirektionalitaet
// ═══════════════════════════════════════════════════════════════

describe("runMatchTrigger — beide Seiten werden alarmiert", () => {
  it("schreibt je Paar einen Alarm fuer die Anbieter- UND die Nachfrage-Seite", async () => {
    const pool = capacitySourcePool();
    const out = await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });

    assert.equal(out.pairs, 1);
    assert.equal(out.alerts, 2, "Anbieter und Nachfrager muessen beide erfahren");

    const inserts = alertInserts(pool);
    assert.equal(inserts.length, 2);
    const recipients = inserts.map((c) => c.params[0]).sort();
    assert.deepEqual(recipients, [SUPPLIER_USER, BUYER_USER].sort());
  });

  it("verlinkt jede Seite auf das GEGENSTUECK, nicht auf das eigene Objekt", async () => {
    const pool = capacitySourcePool();
    await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });

    const notes = notificationInserts(pool);
    assert.equal(notes.length, 2);
    // link_path ist der letzte gebundene Parameter in dispatch()
    const links = notes.map((c) => c.params[c.params.length - 1]);
    const supplierLink = links.find((l) => String(l).includes(DEM));
    const buyerLink = links.find((l) => String(l).includes(CAP));
    assert.ok(supplierLink, "Anbieter bekommt den Link auf die Nachfrage");
    assert.ok(buyerLink, "Nachfrager bekommt den Link auf das Angebot");
    assert.ok(!links.some((l) => l == null), "kein Alarm ohne Ziel");
  });

  it("schreibt den kanonischen Paar-Schluessel in beide Alarme", async () => {
    const pool = capacitySourcePool();
    await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });

    const expected = buildPairKey("capacity_post", CAP, "demand_request", DEM);
    for (const call of alertInserts(pool)) {
      assert.equal(call.params[call.params.length - 1], expected);
    }
  });

  it("haelt die Auswertungsspur fest (outcome alerted)", async () => {
    const pool = capacitySourcePool();
    await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });
    const log = pool.calls.find((c) => c.sql.includes("INSERT INTO match_logs"));
    assert.ok(log, "Match wird protokolliert");
    assert.ok(log.params.includes("alerted"));
  });
});

// ═══════════════════════════════════════════════════════════════
// Dedup
// ═══════════════════════════════════════════════════════════════

describe("runMatchTrigger — Dedup entscheidet die Datenbank", () => {
  it("benachrichtigt nicht, wenn der Alarm-INSERT am UNIQUE-Index scheitert", async () => {
    const pool = capacitySourcePool({ alertInsert: { rows: [], rowCount: 0 } });
    const out = await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });

    assert.equal(out.alerts, 0);
    assert.equal(alertInserts(pool).length, 2, "beide Versuche laufen, beide prallen ab");
    assert.equal(notificationInserts(pool).length, 0, "kein zweiter Alarm fuer dasselbe Paar");
  });

  it("ueberlaesst die Entscheidung dem Index statt einer Zeitfenster-Abfrage", async () => {
    const pool = capacitySourcePool();
    await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });
    const insert = alertInserts(pool)[0];
    assert.match(insert.sql, /ON CONFLICT \(user_id, pair_key\) WHERE pair_key IS NOT NULL DO NOTHING/);
    assert.ok(
      !pool.calls.some((c) => c.sql.includes("FROM match_alerts") && c.sql.includes("INTERVAL")),
      "keine Applikations-Dedup ueber ein Zeitfenster mehr"
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Empfaenger
// ═══════════════════════════════════════════════════════════════

describe("runMatchTrigger — Empfaenger duerfen handeln", () => {
  it("faellt ohne Org auf den Eigentuemer-Account zurueck", async () => {
    const pool = capacitySourcePool();
    await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });
    const recipients = alertInserts(pool).map((c) => c.params[0]);
    assert.ok(recipients.includes(SUPPLIER_USER));
    assert.ok(recipients.includes(BUYER_USER));
  });

  it("leitet Empfaenger aus der Rechte-Matrix ab, wenn eine Org hinterlegt ist", async () => {
    const member = "00000000-0000-4000-8000-0000000000m1";
    const pool = trackingPool([
      { match: (s) => s.includes("FROM capacity_posts") && s.includes("is_active = TRUE") && s.includes("id = $1"),
        respond: { rows: [capacityRow({ org_id: SUPPLIER_ORG })], rowCount: 1 } },
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1"),
        respond: { rows: [capacityRow({ org_id: SUPPLIER_ORG })], rowCount: 1 } },
      { match: (s) => s.includes("FROM demand_requests WHERE status = 'open'"),
        respond: { rows: [demandRow()], rowCount: 1 } },
      { match: (s) => s.includes("FROM org_memberships"), respond: { rows: [{ user_id: member }], rowCount: 1 } },
      { match: (s) => s.includes("INSERT INTO match_alerts"), respond: { rows: [], rowCount: 1 } }
    ]);
    await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });

    const membership = pool.calls.find((c) => c.sql.includes("FROM org_memberships"));
    assert.deepEqual(membership.params[0], SUPPLIER_ORG);
    assert.ok(
      Array.isArray(membership.params[1]) && membership.params[1].length > 0,
      "Rollen kommen aus der Permission, nicht aus einer festen Liste"
    );
    const recipients = alertInserts(pool).map((c) => c.params[0]);
    assert.ok(recipients.includes(member), "der handlungsberechtigte Mitarbeiter wird alarmiert");
    assert.ok(!recipients.includes(SUPPLIER_USER), "nicht der Ersteller, sondern wer handeln darf");
  });
});

// ═══════════════════════════════════════════════════════════════
// Selbstmatch + Obergrenze
// ═══════════════════════════════════════════════════════════════

describe("runMatchTrigger — kein Selbstmatch, begrenzte Menge", () => {
  it("alarmiert nicht, wenn Angebot und Bedarf demselben Account gehoeren", async () => {
    const pool = capacitySourcePool({ demands: [demandRow({ requester_company_id: SUPPLIER_USER })] });
    const out = await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });
    assert.equal(out.pairs, 0);
    assert.equal(out.alerts, 0);
    assert.equal(alertInserts(pool).length, 0);
  });

  it("alarmiert nicht innerhalb derselben Organisation", async () => {
    const pool = trackingPool([
      { match: (s) => s.includes("FROM capacity_posts") && s.includes("is_active = TRUE") && s.includes("id = $1"),
        respond: { rows: [capacityRow({ org_id: SUPPLIER_ORG })], rowCount: 1 } },
      { match: (s) => s.includes("SELECT * FROM capacity_posts WHERE id = $1"),
        respond: { rows: [capacityRow({ org_id: SUPPLIER_ORG })], rowCount: 1 } },
      { match: (s) => s.includes("FROM requisitions WHERE status IN"),
        respond: { rows: [{ id: REQ, org_id: SUPPLIER_ORG, created_by: BUYER_USER, role: "Pflegekraft",
          skill_tags: ["nachtschicht"], location_city: "Kiel", radius_km: 25,
          start_date: "2026-08-05", end_date: "2026-08-20", title: "Intern" }], rowCount: 1 } },
      { match: (s) => s.includes("INSERT INTO match_alerts"), respond: { rows: [], rowCount: 1 } }
    ]);
    const out = await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP });
    assert.equal(out.pairs, 0);
    assert.equal(alertInserts(pool).length, 0);
  });

  it("deckelt die Zahl der Benachrichtigungen pro Lauf", async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      demandRow({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, requester_company_id: `u-${i}` })
    );
    const pool = capacitySourcePool({ demands: many });
    // topN hochgesetzt, damit wirklich die Alarm-Obergrenze greift und nicht schon
    // die Kandidatengrenze — sonst prueft der Test etwas anderes als er behauptet.
    const out = await runMatchTrigger(pool, { sourceType: "capacity_post", sourceId: CAP, topN: many.length });
    assert.ok(out.pairs < many.length, "der Lauf bricht ab, statt alle Kandidaten abzuarbeiten");
    assert.equal(out.alerts, TRIGGER_MAX_ALERTS, "die Grenze wird exakt eingehalten, nicht ueberschritten");
  });
});

// ═══════════════════════════════════════════════════════════════
// Fire-and-forget
// ═══════════════════════════════════════════════════════════════

describe("scheduleMatchTrigger — darf den Erstellungsflow nie scheitern lassen", () => {
  it("wirft nicht, wenn die Datenbank ausfaellt", async () => {
    const brokenPool = { query: async () => { throw new Error("db down"); } };
    assert.doesNotThrow(() => scheduleMatchTrigger(brokenPool, { sourceType: "capacity_post", sourceId: CAP }));
    await new Promise((r) => setImmediate(r));
  });

  it("gibt synchron zurueck, ohne auf das Matching zu warten", () => {
    let resolved = false;
    const slowPool = {
      query: async () => { await new Promise((r) => setTimeout(r, 20)); resolved = true; return { rows: [], rowCount: 0 }; }
    };
    scheduleMatchTrigger(slowPool, { sourceType: "capacity_post", sourceId: CAP });
    assert.equal(resolved, false, "der Aufrufer wartet nicht");
  });
});
