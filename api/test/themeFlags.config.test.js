import { describe, it } from "node:test";
import assert from "node:assert/strict";

// config/index.js liest die Theme-Flags (Phase J, Tier-2 Env-Kill-Switch) beim
// Import aus process.env. Per cache-bustendem Query-Import lässt sich der Default-
// (AN) und der Off-Pfad deterministisch prüfen — jeder Query = frische ESM-Instanz.
async function loadConfig(tag) {
  const mod = await import(`../config/index.js?theme_${tag}`);
  return mod.config;
}

describe("config — Theme Tier-2 Env-Kill-Switch (Phase J)", () => {
  it("Default: beide Flags AN, wenn ENV ungesetzt", async () => {
    delete process.env.THEME_SWITCHER_ENABLED;
    delete process.env.ULTRA_PREMIUM_THEME_ENABLED;
    const c = await loadConfig("default");
    assert.equal(c.THEME_SWITCHER_ENABLED, true);
    assert.equal(c.ULTRA_PREMIUM_THEME_ENABLED, true);
  });

  it("explizites 'false' schaltet beide ab", async () => {
    process.env.THEME_SWITCHER_ENABLED = "false";
    process.env.ULTRA_PREMIUM_THEME_ENABLED = "false";
    const c = await loadConfig("off");
    assert.equal(c.THEME_SWITCHER_ENABLED, false);
    assert.equal(c.ULTRA_PREMIUM_THEME_ENABLED, false);
    delete process.env.THEME_SWITCHER_ENABLED;
    delete process.env.ULTRA_PREMIUM_THEME_ENABLED;
  });

  it("'off'/'0'/'no' schalten ab; nicht-gelistete Werte ('1') bleiben AN", async () => {
    process.env.THEME_SWITCHER_ENABLED = "off";
    process.env.ULTRA_PREMIUM_THEME_ENABLED = "1";
    const c = await loadConfig("mixed");
    assert.equal(c.THEME_SWITCHER_ENABLED, false);
    assert.equal(c.ULTRA_PREMIUM_THEME_ENABLED, true);
    delete process.env.THEME_SWITCHER_ENABLED;
    delete process.env.ULTRA_PREMIUM_THEME_ENABLED;
  });

  it("Groß-/Kleinschreibung + Whitespace werden normalisiert ('  FALSE  ' → AN aus)", async () => {
    process.env.THEME_SWITCHER_ENABLED = "  FALSE  ";
    const c = await loadConfig("trim");
    assert.equal(c.THEME_SWITCHER_ENABLED, false);
    delete process.env.THEME_SWITCHER_ENABLED;
  });
});
