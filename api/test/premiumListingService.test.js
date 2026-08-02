import { test } from "node:test";
import assert from "node:assert/strict";
import { featureListing, lockPendingCharges, markChargesInvoiced } from "../services/premiumListingService.js";
import { PREMIUM_LISTING } from "../config/planCatalog.js";

function mockPool(responder) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responder(sql, params, calls.length);
    }
  };
}

test("featureListing: ohne org -> ORG_CONTEXT_REQUIRED, keine Query", async () => {
  const p = mockPool(() => ({ rows: [] }));
  const r = await featureListing(p, { listingType: "capacity", listingId: "l1", userId: "u1", orgId: null });
  assert.deepEqual(r, { ok: false, error: "ORG_CONTEXT_REQUIRED" });
  assert.equal(p.calls.length, 0);
});

test("featureListing capacity: ownership im UPDATE erzwungen + Charge mit Katalogpreis", async () => {
  const p = mockPool((sql, _params, n) =>
    n === 1
      ? { rows: [{ id: "l1", title: "10 Elektriker", featured_until: "2026-06-25" }] }
      : { rows: [{ id: "ch1", amount_cents: PREMIUM_LISTING.price_cents }] }
  );
  const r = await featureListing(p, { listingType: "capacity", listingId: "l1", userId: "u1", orgId: "o1" });
  assert.equal(r.ok, true);
  assert.equal(r.price_cents, PREMIUM_LISTING.price_cents);
  const upd = p.calls[0];
  assert.match(upd.sql, /UPDATE capacity_posts/);
  assert.match(upd.sql, /supplier_company_id = \$2/, "Ownership serverseitig");
  assert.match(upd.sql, /featured_until IS NULL OR featured_until < NOW\(\)/, "kein Doppel-Feature");
  assert.match(upd.sql, /placement_boost_level/, "Placement-Boost gesetzt");
  const charge = p.calls[1];
  assert.match(charge.sql, /INSERT INTO premium_listing_charges/);
  assert.equal(charge.params[5], PREMIUM_LISTING.price_cents);
});

test("Notdienst-Tier capacity: priority_level=notdienst -> 14,99 EUR + Notdienst in Beschreibung", async () => {
  const p = mockPool((sql, _params, n) =>
    n === 1
      ? { rows: [{ id: "l1", title: "Notfall-Pflege", featured_until: "2026-08-20", priority_level: "notdienst" }] }
      : { rows: [{ id: "ch1" }] }
  );
  const r = await featureListing(p, { listingType: "capacity", listingId: "l1", userId: "u1", orgId: "o1" });
  assert.equal(r.ok, true);
  assert.equal(r.price_cents, PREMIUM_LISTING.notdienst_price_cents);
  assert.equal(r.tier, "notdienst");
  const charge = p.calls[1];
  assert.equal(charge.params[5], PREMIUM_LISTING.notdienst_price_cents);
  assert.match(charge.params[4], /Notdienst/, "Rechnungsposten benennt den Tarif");
  assert.match(p.calls[0].sql, /RETURNING id, title, featured_until, priority_level/);
});

test("Notdienst-Tier demand: urgency=notdienst -> 14,99 EUR; Standard bleibt 9,99", async () => {
  const p = mockPool((sql, _params, n) =>
    n === 1
      ? { rows: [{ id: "d1", title: "T", featured_until: "2026-08-20", urgency: "notdienst" }] }
      : { rows: [{ id: "ch1" }] }
  );
  const r = await featureListing(p, { listingType: "demand", listingId: "d1", userId: "u1", orgId: "o1" });
  assert.equal(r.price_cents, PREMIUM_LISTING.notdienst_price_cents);
  assert.match(p.calls[0].sql, /RETURNING id, title, featured_until, urgency/);

  const p2 = mockPool((sql, _params, n) =>
    n === 1
      ? { rows: [{ id: "d2", title: "T", featured_until: "2026-08-20", urgency: "high" }] }
      : { rows: [{ id: "ch2" }] }
  );
  const r2 = await featureListing(p2, { listingType: "demand", listingId: "d2", userId: "u1", orgId: "o1" });
  assert.equal(r2.price_cents, PREMIUM_LISTING.price_cents);
  assert.equal(r2.tier, "standard");
  assert.doesNotMatch(p2.calls[1].params[4], /Notdienst/);
});

test("Katalog: Notdienst-Tier ist teurer als Standard (14,99 > 9,99)", () => {
  assert.equal(PREMIUM_LISTING.price_cents, 999);
  assert.equal(PREMIUM_LISTING.notdienst_price_cents, 1499);
  assert.ok(PREMIUM_LISTING.notdienst_price_cents > PREMIUM_LISTING.price_cents);
});

test("featureListing demand: requester-ownership + featured_until gesetzt", async () => {
  const p = mockPool((sql, _params, n) =>
    n === 1 ? { rows: [{ id: "d1", title: "T", featured_until: "2026-06-25" }] } : { rows: [{ id: "ch1" }] }
  );
  const r = await featureListing(p, { listingType: "demand", listingId: "d1", userId: "u1", orgId: "o1" });
  assert.equal(r.ok, true);
  assert.match(p.calls[0].sql, /UPDATE demand_requests/);
  assert.match(p.calls[0].sql, /requester_company_id = \$2/);
});

test("featureListing: bereits Premium -> ALREADY_FEATURED (409-Fall)", async () => {
  const p = mockPool((sql, _params, n) =>
    n === 1 ? { rows: [] } : { rows: [{ featured_until: "2027-01-01" }] }
  );
  const r = await featureListing(p, { listingType: "capacity", listingId: "l1", userId: "u1", orgId: "o1" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "ALREADY_FEATURED");
  assert.equal(r.featured_until, "2027-01-01");
});

test("featureListing: fremdes/unbekanntes Listing -> NOT_FOUND, KEINE Charge", async () => {
  const p = mockPool(() => ({ rows: [] }));
  const r = await featureListing(p, { listingType: "capacity", listingId: "l1", userId: "fremd", orgId: "o1" });
  assert.deepEqual(r, { ok: false, error: "NOT_FOUND" });
  assert.equal(p.calls.filter((c) => /INSERT INTO premium_listing_charges/.test(c.sql)).length, 0);
});

test("lockPendingCharges: schema-tolerant (Tabelle fehlt -> [])", async () => {
  const p = mockPool(() => ({ rows: [{ t: null }] }));
  const r = await lockPendingCharges(p, "o1");
  assert.deepEqual(r, []);
  assert.equal(p.calls.length, 1);
});

test("lockPendingCharges: FOR UPDATE + pending-Filter", async () => {
  const p = mockPool((sql, _params, n) =>
    n === 1 ? { rows: [{ t: "premium_listing_charges" }] } : { rows: [{ id: "c1", amount_cents: 4900 }] }
  );
  const r = await lockPendingCharges(p, "o1");
  assert.equal(r.length, 1);
  assert.match(p.calls[1].sql, /status = 'pending'/);
  assert.match(p.calls[1].sql, /FOR UPDATE/);
});

test("markChargesInvoiced: leere Liste -> 0 ohne Query; sonst set-based UPDATE", async () => {
  const p0 = mockPool(() => ({ rows: [] }));
  assert.equal(await markChargesInvoiced(p0, [], "inv1"), 0);
  assert.equal(p0.calls.length, 0);
  const p = mockPool(() => ({ rowCount: 2, rows: [] }));
  const n = await markChargesInvoiced(p, ["a", "b"], "inv1");
  assert.equal(n, 2);
  assert.match(p.calls[0].sql, /ANY\(\$1::uuid\[\]\)/);
});
