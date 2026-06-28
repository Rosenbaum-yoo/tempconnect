/**
 * ssoService.test.js — SAML-Callback-Härtung (Audit S-1).
 * Kernsicherung: kein Legacy-Fallback auf "erste aktive Org" mehr — ohne eindeutige Org-Zuordnung
 * (RelayState → Config) wird abgebrochen, statt eine Assertion gegen eine fremde Org zu validieren
 * und dort einen Nutzer zu provisionieren.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleSAMLCallback, getSSOMode } from "../services/ssoService.js";

function mkPool(handler) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => { calls.push({ sql: String(sql), params }); return (handler && handler(String(sql), params)) || { rows: [] }; }
  };
}

describe("ssoService — Callback Org-Bindung (S-1 Härtung)", () => {
  it("unbekannter RelayState ohne Config → NO_ACTIVE_SSO_CONFIG (kein Legacy-Fallback-Query)", async () => {
    const pool = mkPool((sql) => {
      if (/WHERE org_id = \$1/.test(sql)) return { rows: [] };       // getSSOConfig: keine Config für diese Org
      return { rows: [{ org_id: "FREMD", is_active: true }] };       // der ALTE Fallback hätte das hier gezogen
    });
    const res = await handleSAMLCallback(pool, "<saml/>", "org-unbekannt", "https://x");
    assert.equal(res.error, "NO_ACTIVE_SSO_CONFIG");
    assert.ok(!pool.calls.some((c) => /is_active = TRUE LIMIT 1/.test(c.sql)), "der gefährliche 'erste aktive Org'-Fallback darf NICHT mehr laufen");
  });

  it("fehlender RelayState → NO_ACTIVE_SSO_CONFIG (kein willkürlicher Org-Pick)", async () => {
    const pool = mkPool(() => ({ rows: [{ org_id: "FREMD", is_active: true }] }));
    const res = await handleSAMLCallback(pool, "<saml/>", null, "https://x");
    assert.equal(res.error, "NO_ACTIVE_SSO_CONFIG");
    assert.ok(!pool.calls.some((c) => /is_active = TRUE LIMIT 1/.test(c.sql)));
  });

  it("Config via RelayState aufgelöst → Code läuft bis SAML-Validierung (Config-Auflösung intakt)", async () => {
    const pool = mkPool((sql) => /WHERE org_id = \$1/.test(sql)
      ? { rows: [{ org_id: "org-1", idp_sso_url: "https://idp", idp_entity_id: "idp-ent", idp_certificate: "cert", sp_entity_id: null, attribute_mapping: {} }] }
      : { rows: [] });
    const res = await handleSAMLCallback(pool, "<saml/>", "org-1", "https://x");
    // Ohne installierte @node-saml-Lib (Stub) endet es am SAML-Check → beweist, dass die Config korrekt
    // via RelayState aufgelöst wurde (sonst käme NO_ACTIVE_SSO_CONFIG davor).
    if (getSSOMode() === "stub") assert.equal(res.error, "SAML_NOT_AVAILABLE");
    else assert.ok(res.error === "SAML_VALIDATION_FAILED" || res.ok, "mit Lib greift die echte Validierung");
  });
});
