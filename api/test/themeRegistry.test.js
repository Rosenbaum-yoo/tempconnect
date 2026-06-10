/**
 * Phase J / Block 1 — Theme-Registry-Logik in frontend/public/js/theme.js.
 *
 * Prüft die schaltbare Theme-Registry (dark / light / ultra_premium / editorial):
 *   1. Plattform-Default ist "editorial" (LEX-Look) — ohne explizite Wahl.
 *   2. Alle vier Themes sind auswählbar (Registry + per set()).
 *   3. Unbekanntes / deaktiviertes Theme fällt auf den Default zurück.
 *   4. cycle() rotiert durch die aktivierten Themes ohne Navigation zu zerstören.
 *   5. Persistenz nur bei EXPLIZITER Wahl (tempconnect-theme + tempconnect-theme-explicit);
 *      Nicht-Wähler folgen immer dem Live-Default (Migrations-sicher).
 *   6. window.__TC_THEME_FLAGS__ gated Verfügbarkeit + Default (Env-Gating, Block 2);
 *      editorialEnabled:false stellt den alten dark-Default sauber wieder her (Rollback).
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

const STORAGE_KEY = "tempconnect-theme";
const CHOICE_KEY = "tempconnect-theme-explicit";

/**
 * Execute theme.js in an isolated vm-context. window === sandbox so the IIFE's
 * `window.TC = ...` / bare `TC` both resolve to the sandbox global.
 *
 * `stored` simulates a previously persisted theme. `explicit` (defaults to true when
 * `stored` is given) simulates whether that value came from a real user choice — a stale
 * auto-persisted value from the old controller has no explicit marker and must be ignored.
 */
function loadTheme({ stored = null, flags = null, explicit = stored != null } = {}) {
  const root = { attrs: {} };
  const store = Object.create(null);
  if (stored != null) store[STORAGE_KEY] = stored;
  if (explicit) store[CHOICE_KEY] = "1";

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
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
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
    stored: () => store[STORAGE_KEY],
    choiceFlag: () => store[CHOICE_KEY]
  };
}

// Array.from rehosts the vm-realm array into the host realm so deepEqual is realm-safe.
const ids = (list) => Array.from(list, (t) => t.id);
const suite = FRONTEND_AVAILABLE ? describe : describe.skip;

suite("theme.js — Theme-Registry (Phase J / Block 1)", () => {
  it("Plattform-Default: ohne Wahl ist 'editorial' gesetzt", () => {
    const t = loadTheme();
    assert.equal(t.theme.get(), "editorial");
    assert.equal(t.currentAttr(), "editorial");
    assert.equal(t.theme.DEFAULT, "editorial");
  });

  it("Registry enthält dark, light, ultra_premium und editorial", () => {
    const t = loadTheme();
    assert.deepEqual(ids(t.theme.list()), ["dark", "light", "ultra_premium", "editorial"]);
  });

  it("set('ultra_premium') aktiviert + persistiert das Premium-Theme", () => {
    const t = loadTheme();
    t.theme.set("ultra_premium");
    assert.equal(t.theme.get(), "ultra_premium");
    assert.equal(t.currentAttr(), "ultra_premium");
    assert.equal(t.stored(), "ultra_premium");
  });

  it("set() markiert die Wahl als explizit (überlebt einen Default-Wechsel)", () => {
    const t = loadTheme();
    t.theme.set("light");
    assert.equal(t.stored(), "light");
    assert.equal(t.choiceFlag(), "1");
  });

  it("Unbekanntes Theme fällt auf den Default (editorial) zurück", () => {
    const t = loadTheme();
    t.theme.set("bogus_theme");
    assert.equal(t.theme.get(), "editorial");
  });

  it("cycle() rotiert editorial -> dark -> light -> ultra_premium -> editorial", () => {
    const t = loadTheme();
    assert.equal(t.theme.get(), "editorial");
    t.theme.cycle();
    assert.equal(t.theme.get(), "dark");
    t.theme.cycle();
    assert.equal(t.theme.get(), "light");
    t.theme.cycle();
    assert.equal(t.theme.get(), "ultra_premium");
    t.theme.cycle();
    assert.equal(t.theme.get(), "editorial");
  });

  it("toggle() bleibt rückwärtskompatibel (binär dark <-> light)", () => {
    const t = loadTheme();
    t.theme.set("dark"); // expliziter Startpunkt, unabhängig vom Default
    t.theme.toggle();
    assert.equal(t.theme.get(), "light");
    t.theme.toggle();
    assert.equal(t.theme.get(), "dark");
  });

  it("Explizite Wahl wird beim Laden respektiert (kein Default-Override)", () => {
    const t = loadTheme({ stored: "dark", explicit: true });
    assert.equal(t.theme.get(), "dark");
  });

  it("Stale Storage ohne Explicit-Flag folgt dem Live-Default (Migrations-sicher)", () => {
    // Rückkehrer mit altem auto-persistiertem "dark", aber ohne explizite Wahl.
    const t = loadTheme({ stored: "dark", explicit: false });
    assert.equal(t.theme.get(), "editorial");
  });

  it("resetToDefault() löscht die Wahl und folgt wieder dem Default", () => {
    const t = loadTheme({ stored: "dark", explicit: true });
    assert.equal(t.theme.get(), "dark");
    t.theme.resetToDefault();
    assert.equal(t.theme.get(), "editorial");
    assert.equal(t.stored(), undefined);
    assert.equal(t.choiceFlag(), undefined);
  });

  it("defaultTheme-Flag setzt den Plattform-Default (Env-Gating)", () => {
    const t = loadTheme({ flags: { defaultTheme: "light" } });
    assert.equal(t.theme.get(), "light");
    assert.equal(t.theme.DEFAULT, "light");
  });

  it("Editorial deaktiviert: Default fällt sicher auf dark zurück (Rollback)", () => {
    const t = loadTheme({ flags: { editorialEnabled: false } });
    assert.equal(t.theme.get(), "dark");
    assert.equal(t.theme.DEFAULT, "dark");
    assert.deepEqual(ids(t.theme.list()), ["dark", "light", "ultra_premium"]);
  });

  it("ULTRA_PREMIUM deaktiviert: nicht in Registry, set() fällt auf Default zurück", () => {
    const t = loadTheme({ flags: { ultraPremiumEnabled: false } });
    assert.deepEqual(ids(t.theme.list()), ["dark", "light", "editorial"]);
    t.theme.set("ultra_premium");
    assert.equal(t.theme.get(), "editorial");
  });

  it("Gespeichertes ultra_premium wird ignoriert wenn Flag deaktiviert (Fallback Default)", () => {
    const t = loadTheme({ stored: "ultra_premium", explicit: true, flags: { ultraPremiumEnabled: false } });
    assert.equal(t.theme.get(), "editorial");
  });

  it("cycle() überspringt deaktiviertes Premium-Theme (editorial -> dark -> light -> editorial)", () => {
    const t = loadTheme({ flags: { ultraPremiumEnabled: false } });
    assert.equal(t.theme.get(), "editorial");
    t.theme.cycle();
    assert.equal(t.theme.get(), "dark");
    t.theme.cycle();
    assert.equal(t.theme.get(), "light");
    t.theme.cycle();
    assert.equal(t.theme.get(), "editorial");
  });
});
