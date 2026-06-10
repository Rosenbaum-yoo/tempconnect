/**
 * Phase 2, Slice A — individuellPricingService (deterministische Preis-Engine).
 *
 * Verifiziert die EINE Owner-gesperrte Wahrheit: der INDIVIDUELL-Preis ergibt
 * sich deterministisch aus der Konfigurator-Auswahl (gleiche Eingabe => gleicher
 * Preis), wird IMMER server-seitig aus planCatalog gerechnet und liefert das
 * Self-Service-vs-Anfrage-Signal (requires_staff_approval). Pure Funktion, kein
 * DB/IO — daher reiner Logik-Test gegen die Katalog-Wahrheit.
 *
 * Run: node --test --test-force-exit api/test/individuellPricingService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeIndividuellQuote,
  describeIndividuellConfigurator,
  PRICING_ERRORS
} from "../services/individuellPricingService.js";
import { INDIVIDUELL_BASELINE, CATALOG_VERSION, CATALOG_CURRENCY } from "../config/planCatalog.js";

const BASE = INDIVIDUELL_BASELINE.base_monthly_cents;     // 249900
const INCL = INDIVIDUELL_BASELINE.seats_included;         // 50
const EXTRA = INDIVIDUELL_BASELINE.extra_seat_cents_per_month; // 2900

describe("individuellPricingService.computeIndividuellQuote", () => {
  it("Basis-Sockel: genau enthaltene Seats => nur Grundpreis, keine Overage", () => {
    const q = computeIndividuellQuote({ seats: INCL });
    assert.equal(q.ok, true);
    assert.deepEqual(q.errors, []);
    assert.equal(q.seats.billable_extra, 0);
    assert.equal(q.total_monthly_cents, BASE);
    assert.equal(q.total_onetime_cents, 0);
    assert.equal(q.currency, CATALOG_CURRENCY);
    assert.equal(q.catalog_version, CATALOG_VERSION);
  });

  it("Seats unter dem Sockel => keine negative Overage", () => {
    const q = computeIndividuellQuote({ seats: 10 });
    assert.equal(q.ok, true);
    assert.equal(q.seats.billable_extra, 0);
    assert.equal(q.total_monthly_cents, BASE);
  });

  it("Seat-Overage wird deterministisch eingepreist (75 Seats = 25 extra)", () => {
    const q = computeIndividuellQuote({ seats: 75 });
    assert.equal(q.ok, true);
    assert.equal(q.seats.billable_extra, 25);
    assert.equal(q.seats.extra_unit_cents, EXTRA);
    assert.equal(q.seats.extra_total_cents, 25 * EXTRA);
    assert.equal(q.total_monthly_cents, BASE + 25 * EXTRA);
  });

  it("Monatliches Add-on (API) wird zum Monatspreis addiert", () => {
    const q = computeIndividuellQuote({ seats: INCL, addons: ["api"] });
    assert.equal(q.ok, true);
    assert.equal(q.addons.length, 1);
    assert.equal(q.addons_monthly_cents, 39900);
    assert.equal(q.addons_onetime_cents, 0);
    assert.equal(q.total_monthly_cents, BASE + 39900);
    assert.equal(q.requires_staff_approval, false);
  });

  it("Einmal-Add-on (Onboarding) zaehlt auf den Einmalpreis, nicht monatlich — und braucht Staff", () => {
    const q = computeIndividuellQuote({ seats: INCL, addons: ["onboarding"] });
    assert.equal(q.ok, true);
    assert.equal(q.addons_onetime_cents, 249900);
    assert.equal(q.addons_monthly_cents, 0);
    assert.equal(q.total_monthly_cents, BASE);          // monatlich unveraendert
    assert.equal(q.total_onetime_cents, 249900);
    assert.equal(q.requires_staff_approval, true);      // Onboarding ist freigabepflichtig
  });

  it("Freigabepflichtiges Add-on (SLA 99,9 %) => Preis berechnet, aber requires_staff_approval=true (Anfrage statt Checkout)", () => {
    const q = computeIndividuellQuote({ seats: INCL, addons: ["sla99"] });
    assert.equal(q.ok, true);                            // valide & bepreisbar
    assert.equal(q.total_monthly_cents, BASE + 44900);
    assert.equal(q.requires_staff_approval, true);       // aber NICHT reines Self-Service
  });

  it("Reine Self-Service-Add-ons => requires_staff_approval=false, Summe korrekt", () => {
    const q = computeIndividuellQuote({ seats: INCL, addons: ["api", "spend", "ratecards"] });
    assert.equal(q.ok, true);
    assert.equal(q.requires_staff_approval, false);
    assert.equal(q.total_monthly_cents, BASE + 39900 + 34900 + 29900);
  });

  it("Determinismus: gleiche Eingabe => identisches Ergebnis", () => {
    const sel = { seats: 123, addons: ["api", "spend"] };
    assert.deepEqual(computeIndividuellQuote(sel), computeIndividuellQuote(sel));
  });

  it("Doppelte Add-on-Keys werden dedupliziert (einmal eingepreist)", () => {
    const q = computeIndividuellQuote({ seats: INCL, addons: ["api", "api"] });
    assert.equal(q.addons.length, 1);
    assert.equal(q.total_monthly_cents, BASE + 39900);
  });

  it("Unbekanntes Add-on => ok=false, UNKNOWN_ADDON, KEIN buchbarer Preis", () => {
    const q = computeIndividuellQuote({ seats: INCL, addons: ["bogus"] });
    assert.equal(q.ok, false);
    assert.equal(q.total_monthly_cents, null);
    assert.equal(q.total_onetime_cents, null);
    const e = q.errors.find((x) => x.code === PRICING_ERRORS.UNKNOWN_ADDON);
    assert.ok(e, "UNKNOWN_ADDON-Fehler vorhanden");
    assert.equal(e.addon_key, "bogus");
  });

  it("Coming-Soon-Add-on (SSO) => ok=false, ADDON_COMING_SOON", () => {
    const q = computeIndividuellQuote({ seats: INCL, addons: ["sso"] });
    assert.equal(q.ok, false);
    assert.ok(q.errors.some((x) => x.code === PRICING_ERRORS.ADDON_COMING_SOON));
  });

  it("Ungueltige Seats (0 / negativ / nicht-ganzzahlig / fehlend) => INVALID_SEATS, kein Preis", () => {
    for (const seats of [0, -5, 2.5, undefined, null, "viele"]) {
      const q = computeIndividuellQuote({ seats });
      assert.equal(q.ok, false, `seats=${JSON.stringify(seats)} muss ungueltig sein`);
      assert.ok(q.errors.some((x) => x.code === PRICING_ERRORS.INVALID_SEATS));
      assert.equal(q.total_monthly_cents, null);
    }
  });

  it("Tier wird zur Anzeige abgeleitet (160 Seats => Klasse L), ist aber kein Preistreiber", () => {
    const a = computeIndividuellQuote({ seats: 160 });
    assert.equal(a.tier, "individuell_l");
    // gleicher Seat-Wert, gleicher Preis — Tier aendert die Summe nicht
    assert.equal(a.total_monthly_cents, BASE + (160 - INCL) * EXTRA);
  });
});

describe("individuellPricingService.describeIndividuellConfigurator", () => {
  it("liefert Baseline, Tiers, Currency/Version und trennt buchbar vs. Anfrage", () => {
    const d = describeIndividuellConfigurator();
    assert.equal(d.currency, CATALOG_CURRENCY);
    assert.equal(d.catalog_version, CATALOG_VERSION);
    assert.equal(d.baseline.base_monthly_cents, BASE);
    assert.ok(Array.isArray(d.tiers) && d.tiers.length >= 1);

    // Jede buchbare Option ist self-service-faehig …
    for (const a of d.bookable_addons) {
      assert.equal(a.requires_staff_approval, false);
      assert.equal(a.coming_soon, false);
    }
    // … jede Anfrage-Option braucht Staff ODER ist noch nicht verfuegbar.
    for (const a of d.inquiry_addons) {
      assert.ok(a.requires_staff_approval === true || a.coming_soon === true);
    }
    // konkrete Einordnung
    assert.ok(d.bookable_addons.some((a) => a.key === "api"), "API ist self-service buchbar");
    assert.ok(d.inquiry_addons.some((a) => a.key === "sso"), "SSO (coming_soon) ist Anfrage");
    assert.ok(d.inquiry_addons.some((a) => a.key === "sla99"), "SLA99 (Staff) ist Anfrage");
  });
});
