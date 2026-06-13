/**
 * company.config — Shape-Anker für die zentrale Firmen-Config (G.4).
 * Stellt sicher, dass alle Felder existieren, die invoicePdfService (§14 UStG) +
 * emailHtmlTemplates + die Impressum-Übergabe brauchen — sonst bricht die Rechnung
 * still, sobald jemand ein Feld entfernt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPANY } from "../config/company.js";

test("company.js: alle Rechnungsabsender-Felder vorhanden (von invoicePdfService genutzt)", () => {
  for (const key of ["name", "street", "city", "country", "vatId", "email", "web"]) {
    assert.equal(typeof COMPANY[key], "string", `Feld ${key} fehlt/falsch`);
    assert.ok(COMPANY[key].length > 0, `Feld ${key} ist leer`);
  }
});

test("company.js: G.4-Stammdatenfelder existieren (auch wenn noch leer = Platzhalter)", () => {
  for (const key of ["legalForm", "postalCode", "cityName", "taxNumber", "registerCourt", "registerNumber", "managingDirector", "supportEmail", "phone"]) {
    assert.ok(key in COMPANY, `G.4-Feld ${key} fehlt`);
    assert.equal(typeof COMPANY[key], "string");
  }
});

test("company.js: isPlaceholder ist ein Boolean (Marktstart-Gate kann darauf prüfen)", () => {
  assert.equal(typeof COMPANY.isPlaceholder, "boolean");
});

test("company.js: Objekt ist eingefroren (keine versehentliche Laufzeit-Mutation)", () => {
  assert.equal(Object.isFrozen(COMPANY), true);
});
