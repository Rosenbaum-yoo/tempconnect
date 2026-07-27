/**
 * Activity Center (P4.4) — Katalog, Emitter und Verdrahtungs-Nachweis.
 *
 * Die teuerste Falle in diesem Repo ist die stille: ein Event-Typ, der nirgends
 * registriert ist, verschwindet spurlos — das Feature "funktioniert", zeigt aber nie
 * etwas an. Dieser Test macht genau das unmoeglich:
 *
 *   1. Jeder im Code emittierte `event_type` MUSS im ACTIVITY_CATALOG stehen.
 *   2. Jeder Katalog-Eintrag hat Beschriftung und Symbol (sonst Rohname in der UI).
 *   3. `recordActivity` wirft nie — und verwirft unbekannte Typen sichtbar, statt sie
 *      in einen Promise-Abgrund zu schieben.
 *
 * Run: node --test --test-force-exit test/activityCatalog.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVITY_CATALOG,
  getActivityTypes,
  activityLinkFor,
  describeEvent,
  recordActivity,
  trackEvent
} from "../services/eventTrackingService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Pfad relativ zur Testdatei — nicht nur zu process.cwd() (CLAUDE.md §0.9).
const API_ROOT = path.resolve(__dirname, "..");

/** Alle im Code emittierten event_type-Literale einsammeln. */
function collectEmittedTypes() {
  const found = new Set();
  const rx = /event_type:\s*["']([a-z0-9_]+)["']/g;
  for (const dir of ["routes", "services"]) {
    const base = path.join(API_ROOT, dir);
    if (!fs.existsSync(base)) continue;
    for (const file of fs.readdirSync(base)) {
      if (!file.endsWith(".js")) continue;
      if (file === "eventTrackingService.js") continue; // der Katalog selbst
      const src = fs.readFileSync(path.join(base, file), "utf8");
      let m;
      while ((m = rx.exec(src)) !== null) found.add(m[1]);
    }
  }
  return [...found].sort();
}

function poolStub(onInsert) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      if (onInsert) return onInsert(String(sql), params || []);
      return { rows: [{ id: "ev-1" }], rowCount: 1 };
    }
  };
}

const tick = () => new Promise((r) => setImmediate(r));

// ═══════════════════════════════════════════════════════════════
// Katalog-Integritaet
// ═══════════════════════════════════════════════════════════════

describe("ACTIVITY_CATALOG — kein Typ ohne Zuhause", () => {
  it("kennt jeden Event-Typ, der irgendwo im Code emittiert wird", () => {
    const emitted = collectEmittedTypes();
    assert.ok(emitted.length > 5, "der Scan muss ueberhaupt Emissionen finden");
    const unknown = emitted.filter((t) => !ACTIVITY_CATALOG[t]);
    assert.deepEqual(
      unknown, [],
      `Diese Typen werden emittiert, stehen aber nicht im Katalog — sie verschwinden still: ${unknown.join(", ")}`
    );
  });

  it("gibt jedem Eintrag Beschriftung und Symbol", () => {
    for (const [key, meta] of Object.entries(ACTIVITY_CATALOG)) {
      assert.ok(meta.label && meta.label.length > 2, `Beschriftung fehlt: ${key}`);
      assert.ok(meta.icon && meta.icon.length > 0, `Symbol fehlt: ${key}`);
      assert.ok(meta.label !== key, `Beschriftung ist nur der Schluesselname: ${key}`);
    }
  });

  it("deckt die Ereignisse aus P1–P4 ab, die das Activity Center zeigen soll", () => {
    const required = [
      "worker_replacement_assigned", // P1.1 Ersatz
      "timesheet_customer_confirmed", // P2 Zettel freigegeben
      "worker_blocked",               // P3.3 Kraft gesperrt
      "complaint_filed",              // P3.2 Beschwerde gemeldet
      "complaint_resolved",           // P3.2 Beschwerde erledigt
      "match_found"                   // P4.1 Match gefunden
    ];
    for (const t of required) assert.ok(ACTIVITY_CATALOG[t], `Ereignis fehlt im Katalog: ${t}`);
  });

  it("liefert die Typliste als Kopie (Katalog bleibt unveraenderlich)", () => {
    const a = getActivityTypes();
    a.push("hack");
    assert.ok(!getActivityTypes().includes("hack"));
  });
});

// ═══════════════════════════════════════════════════════════════
// Deep-Links
// ═══════════════════════════════════════════════════════════════

describe("activityLinkFor — Verlauf ohne Sackgassen", () => {
  it("verlinkt die Marktplatz-Objekte auf ihre Detailseite", () => {
    assert.equal(activityLinkFor("capacity_post", "CP1"), "/public/capacity_exchange_detail.html?id=CP1&type=supply");
    assert.equal(activityLinkFor("demand_request", "DR1"), "/public/capacity_exchange_detail.html?id=DR1&type=demand");
    assert.equal(activityLinkFor("requisition", "RQ1"), "/public/requisitions.html?focus_id=RQ1");
    assert.equal(activityLinkFor("offer", "OF1"), "/public/offer_detail.html?id=OF1");
  });

  it("faellt ohne ID auf die passende Liste zurueck statt auf null", () => {
    assert.equal(activityLinkFor("requisition", null), "/public/requisitions.html");
    assert.equal(activityLinkFor("capacity_post", null), "/public/capacity_exchange_manage.html");
  });

  it("escaped IDs in der URL", () => {
    assert.ok(activityLinkFor("requisition", "a b&c").includes("a%20b%26c"));
  });

  it("gibt null zurueck, wenn es kein sinnvolles Ziel gibt", () => {
    assert.equal(activityLinkFor(null, "x"), null);
    assert.equal(activityLinkFor("unbekannt", "x"), null);
  });
});

describe("describeEvent — Server liefert die Darstellung", () => {
  it("ergaenzt Beschriftung, Symbol und Ziel", () => {
    const out = describeEvent({ event_type: "match_found", entity_type: "capacity_post", entity_id: "CP1" });
    assert.equal(out.label, "Match gefunden");
    assert.ok(out.icon);
    assert.equal(out.link_path, "/public/capacity_exchange_detail.html?id=CP1&type=supply");
  });

  it("laesst die Rohdaten unangetastet", () => {
    const row = { event_type: "login", created_at: "2026-07-26T10:00:00Z", actor_name: "Muster GmbH" };
    const out = describeEvent(row);
    assert.equal(out.created_at, row.created_at);
    assert.equal(out.actor_name, "Muster GmbH");
  });

  it("bleibt bei unbekanntem Typ lesbar statt leer", () => {
    const out = describeEvent({ event_type: "gibts_nicht" });
    assert.equal(out.label, "gibts_nicht");
    assert.ok(out.icon);
  });
});

// ═══════════════════════════════════════════════════════════════
// Emitter
// ═══════════════════════════════════════════════════════════════

describe("recordActivity — darf den Geschaeftsvorgang nie stoeren", () => {
  it("schreibt ein gueltiges Ereignis", async () => {
    const pool = poolStub();
    recordActivity(pool, { event_type: "worker_blocked", actor_id: "u1", org_id: "o1", entity_type: "worker", entity_id: "w1" });
    await tick(); await tick();
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO platform_events"));
    assert.ok(insert, "Ereignis wird gespeichert");
    assert.equal(insert.params[0], "worker_blocked");
    assert.equal(insert.params[1], "u1");
    assert.equal(insert.params[2], "o1");
  });

  it("verwirft unbekannte Typen, ohne zu werfen und ohne zu schreiben", async () => {
    const pool = poolStub();
    assert.doesNotThrow(() => recordActivity(pool, { event_type: "erfunden" }));
    await tick(); await tick();
    assert.equal(pool.calls.length, 0, "kein Insert fuer einen unbekannten Typ");
  });

  it("uebersteht einen Datenbankausfall lautlos fuer den Aufrufer", async () => {
    const pool = { query: async () => { throw new Error("db down"); } };
    assert.doesNotThrow(() => recordActivity(pool, { event_type: "login", actor_id: "u1" }));
    await tick(); await tick();
  });

  it("blockiert den Aufrufer nicht", () => {
    let done = false;
    const slow = { query: async () => { await new Promise((r) => setTimeout(r, 20)); done = true; return { rows: [{}] }; } };
    recordActivity(slow, { event_type: "login", actor_id: "u1" });
    assert.equal(done, false);
  });

  it("trackEvent wirft weiterhin bei unbekanntem Typ (bewusster Unterschied)", async () => {
    await assert.rejects(() => trackEvent(poolStub(), { event_type: "erfunden" }), /Invalid event_type/);
  });
});
