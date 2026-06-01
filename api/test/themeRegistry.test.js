/**
 * Phase J / Block 1 — Theme-Registry-Logik in frontend/public/js/theme.js.
 *
 * Prüft die schaltbare Theme-Registry (dark / light / ultra_premium):
 *   1. Default bleibt aktiv (kein Storage -> "dark").
 *   2. Ultra Premium ist auswählbar (in der Registry + per set()).
 *   3. Unbekanntes / deaktiviertes Theme fällt auf Default zurück.
 *   4. cycle() rotiert durch die aktivierten Themes ohne Navigation zu zerstören.
 *   5. window.__TC_THEME_FLAGS__ gated Verfügbarkeit (Vorbereitung für SCC-Env-Gating, Block 2).
 *
 * theme.js ist eine Browser-IIFE (kein module.exports). Wir führen sie in einem
 * vm-Context mit Minimal-Stubs (document/localStorage/window) aus und prüfen die
 * öffentliche TC.theme-API. Nur Primitive werden asserted -> keine Cross-Realm-Probleme.
 *
 * Run: node --test --test-force-exit api/test/themeRegistry.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const THEME_PATH = path.resolve(ROOT, "frontend/public/js/theme.js");
// Inside Docker the frontend directory may not be mounted — skip gracefully.
const FRONTEND_AVAILABLE = existsSync(THEME_PATH);
const SRC = FRONTEND_AVAILABLE ? readFileSync(THEME_PATH, "utf8") : "";

/**
 * Execute theme.js in an isolated vm-context. window === sandbox so the IIFE's
 * `window.TC = ...` / bare `TC` both resolve to the sandbox global.
 */
function loadTheme({ stored = null, flags = null } = {}) {
  const root = { attrs: {} };
  const store = Object.create(null);
  if (stored != null) store["tempconnect-theme"] = stored;

  const noopEl = {
    style: {},
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    querySelector() { return null; },
    remove() {}
  };

  const sandbox = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    document: {
      readyState: "complete",
      documentElement: {
        setAttribute: (k, v) => { root.attrs[k] = v; },
        getAttribute: (k) => (k in root.attrs ? root.attrs[k] : null)
      },
      addEventListener() {},
      dispatchEvent() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      createElement() { return Object.assign({}, noopEl); },
      head: { appendChild() {} },
      body: { appendChild() {} }
    },
    CustomEvent: function (name, opts) { this.type = name; this.detail = opts && opts.detail; },
    getComputedStyle: () => ({ display: "block" }),
    setTimeout: () => 0,
    addEventListener() {}
  };
  sandbox.window = sandbox;
  if (flags) sandbox.__TC_THEME_FLAGS__ = flags;

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "theme.js" });
  return {
    theme: sandbox.window.TC.theme,
    currentAttr: () => root.attrs["data-theme"],
    stored: () => store["tempconnect-theme"]
  };
}

// Array.from rehosts the vm-realm array into the host realm so deepEqual is realm-safe.
const ids = (list) => Array.from(list, (t) => t.id);
const suite = FRONTEND_AVAILABLE ? describe : describe.skip;

suite("theme.js — Theme-Registry (Phase J / Block 1)", () => {
  it("Default bleibt aktiv: ohne Storage ist 'dark' gesetzt", () => {
    const t = loadTheme();
    assert.equal(t.theme.get(), "dark");
    assert.equal(t.currentAttr(), "dark");
    assert.equal(t.theme.DEFAULT, "dark");
  });

  it("Registry enthält dark, light und ultra_premium (Ultra Premium auswählbar)", () => {
    const t = loadTheme();
    assert.deepEqual(ids(t.theme.list()), ["dark", "light", "ultra_premium"]);
  });

  it("set('ultra_premium') aktiviert + persistiert das Premium-Theme", () => {
    const t = loadTheme();
    t.theme.set("ultra_premium");
    assert.equal(t.theme.get(), "ultra_premium");
    assert.equal(t.currentAttr(), "ultra_premium");
    assert.equal(t.stored(), "ultra_premium");
  });

  it("Unbekanntes Theme fällt auf Default zurück", () => {
    const t = loadTheme();
    t.theme.set("bogus_theme");
    assert.equal(t.theme.get(), "dark");
  });

  it("cycle() rotiert dark -> light -> ultra_premium -> dark", () => {
    const t = loadTheme();
    assert.equal(t.theme.get(), "dark");
    t.theme.cycle();
    assert.equal(t.theme.get(), "light");
    t.theme.cycle();
    assert.equal(t.theme.get(), "ultra_premium");
    t.theme.cycle();
    assert.equal(t.theme.get(), "dark");
  });

  it("toggle() bleibt rückwärtskompatibel (dark <-> light)", () => {
    const t = loadTheme();
    t.theme.toggle();
    assert.equal(t.theme.get(), "light");
    t.theme.toggle();
    assert.equal(t.theme.get(), "dark");
  });

  it("ULTRA_PREMIUM deaktiviert: nicht in Registry, set() fällt auf Default zurück", () => {
    const t = loadTheme({ flags: { ultraPremiumEnabled: false } });
    assert.deepEqual(ids(t.theme.list()), ["dark", "light"]);
    t.theme.set("ultra_premium");
    assert.equal(t.theme.get(), "dark");
  });

  it("Gespeichertes ultra_premium wird ignoriert wenn Flag deaktiviert (Fallback Default)", () => {
    const t = loadTheme({ stored: "ultra_premium", flags: { ultraPremiumEnabled: false } });
    assert.equal(t.theme.get(), "dark");
  });

  it("cycle() überspringt deaktiviertes Premium-Theme (dark -> light -> dark)", () => {
    const t = loadTheme({ flags: { ultraPremiumEnabled: false } });
    t.theme.cycle();
    assert.equal(t.theme.get(), "light");
    t.theme.cycle();
    assert.equal(t.theme.get(), "dark");
  });
});
