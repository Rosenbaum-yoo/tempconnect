/**
 * Geo Service Tests — Geocoding mit gemocktem fetch.
 *
 * Testet: geocode, geocodeQuery.
 * Run: node --test test/geoService.test.js
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

/* ── fetch-Mock Setup ────────────────────────────────── */

let originalFetch;
let mockFetchResponse;

function setupFetchMock(response) {
  mockFetchResponse = response;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, _opts) => ({
    json: async () => mockFetchResponse,
    _url: url
  });
}

function restoreFetch() {
  if (originalFetch) globalThis.fetch = originalFetch;
}

/* ── geocode ─────────────────────────────────────────── */

describe("geocode", () => {
  afterEach(() => restoreFetch());

  it("gibt Koordinaten zurueck bei PLZ + Stadt", async () => {
    setupFetchMock([{ lat: "52.520008", lon: "13.404954" }]);
    const { geocode } = await import("../services/geoService.js");
    const result = await geocode("10115", "Berlin");
    assert.ok(result);
    assert.ok(Math.abs(result.lat - 52.52) < 0.01);
    assert.ok(Math.abs(result.lng - 13.40) < 0.01);
  });

  it("gibt Koordinaten zurueck bei nur PLZ", async () => {
    setupFetchMock([{ lat: "48.137154", lon: "11.576124" }]);
    const { geocode } = await import("../services/geoService.js");
    const result = await geocode("80331", null);
    assert.ok(result);
    assert.ok(result.lat > 48);
  });

  it("gibt Koordinaten zurueck bei nur Stadt", async () => {
    setupFetchMock([{ lat: "53.551086", lon: "9.993682" }]);
    const { geocode } = await import("../services/geoService.js");
    const result = await geocode(null, "Hamburg");
    assert.ok(result);
    assert.ok(result.lat > 53);
  });

  it("gibt null zurueck ohne PLZ und Stadt", async () => {
    const { geocode } = await import("../services/geoService.js");
    const result = await geocode(null, null);
    assert.equal(result, null);
  });

  it("gibt null zurueck bei leerem API-Ergebnis", async () => {
    setupFetchMock([]);
    const { geocode } = await import("../services/geoService.js");
    const result = await geocode("99999", "Nirgendwo");
    assert.equal(result, null);
  });

  it("gibt null zurueck bei Fetch-Fehler", async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Network error"); };
    const { geocode } = await import("../services/geoService.js");
    const result = await geocode("10115", "Berlin");
    assert.equal(result, null);
    restoreFetch();
  });

  it("gibt null zurueck wenn lat/lon keine Strings sind", async () => {
    setupFetchMock([{ lat: 52.52, lon: 13.40 }]); // Numbers statt Strings
    const { geocode } = await import("../services/geoService.js");
    const result = await geocode("10115", "Berlin");
    assert.equal(result, null);
  });
});

/* ── geocodeQuery ────────────────────────────────────── */

describe("geocodeQuery", () => {
  afterEach(() => restoreFetch());

  it("gibt null zurueck bei leerem Query", async () => {
    const { geocodeQuery } = await import("../services/geoService.js");
    assert.equal(await geocodeQuery(null), null);
    assert.equal(await geocodeQuery(""), null);
    assert.equal(await geocodeQuery("   "), null);
  });

  it("gibt Koordinaten zurueck bei gueltigem Query", async () => {
    setupFetchMock([{ lat: "50.937531", lon: "6.960279" }]);
    const { geocodeQuery } = await import("../services/geoService.js");
    const result = await geocodeQuery("Koeln Neumarkt");
    assert.ok(result);
    assert.ok(result.lat > 50);
  });

  it("gibt null zurueck bei Fetch-Fehler", async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Timeout"); };
    const { geocodeQuery } = await import("../services/geoService.js");
    const result = await geocodeQuery("Berlin");
    assert.equal(result, null);
    restoreFetch();
  });
});
