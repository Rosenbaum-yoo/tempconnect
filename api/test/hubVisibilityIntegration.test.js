import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust path resolution: Docker container has cwd=/app; volume mount places
// frontend/public/js/ under /app/frontend/public/js/. Locally, two __dirname
// levels up reaches the project root (tempconnect_docker/).
const _DOCKER_ROOT = process.cwd();  // /app in Docker API container
const _LOCAL_ROOT  = path.resolve(__dirname, "..", "..");  // tempconnect_docker/ locally

function resolveProjectPath(relativePath) {
  const dockerPath = path.join(_DOCKER_ROOT, relativePath);
  if (fs.existsSync(dockerPath)) return dockerPath;
  return path.join(_LOCAL_ROOT, relativePath);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(resolveProjectPath(relativePath), "utf8");
}

function projectFileExists(relativePath) {
  return fs.existsSync(resolveProjectPath(relativePath));
}

const HUB_JS_AVAILABLE = projectFileExists("frontend/public/js/hubVisibility.js");
const ENTERPRISE_HTML_AVAILABLE = projectFileExists("frontend/public/enterprise.html");
const PAGE_SHELL_AVAILABLE = projectFileExists("frontend/public/js/pageShell.js");
const ENTERPRISE_HUB_AVAILABLE = projectFileExists("frontend/public/js/pages/enterpriseHub.js");

function loadHubVisibility() {
  const src = readProjectFile("frontend/public/js/hubVisibility.js");
  const windowObj = { TC: {} };
  const sandbox = { window: windowObj };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "frontend/public/js/hubVisibility.js" });
  return {
    api: sandbox.window.TC.hubVisibility,
    surfaceKeys: Object.keys(sandbox.window.TC.hubVisibility._surfaces),
    navKeys: Object.keys(sandbox.window.TC.hubVisibility._navRules)
  };
}

function extractDataSurfaceKeys(html) {
  const keys = new Set();
  const re = /data-surface="([a-z_]+)"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

function extractNavLinkKeys(pageShellSrc) {
  const keys = [];
  // NAV_LINKS eintraege haben die Form { label: "...", key: "...", href: "..." }
  const re = /\{\s*label:\s*"[^"]+",\s*key:\s*"([a-z_]+)"/g;
  let match;
  while ((match = re.exec(pageShellSrc)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

describe("hub visibility wiring — enterprise.html <-> hubVisibility.js",
  { skip: !(HUB_JS_AVAILABLE && ENTERPRISE_HTML_AVAILABLE) ? "hubVisibility.js oder enterprise.html nicht erreichbar" : false },
  () => {
  const { surfaceKeys } = loadHubVisibility();
  const html = readProjectFile("frontend/public/enterprise.html");
  const htmlSurfaces = extractDataSurfaceKeys(html);

  it("every data-surface marker has a matching HUB_SURFACES entry", () => {
    for (const key of htmlSurfaces) {
      assert.ok(
        surfaceKeys.includes(key),
        `enterprise.html card uses data-surface="${key}" but hubVisibility.js does not define it`
      );
    }
  });

  it("every HUB_SURFACES entry is represented by at least one card", () => {
    for (const key of surfaceKeys) {
      assert.ok(
        htmlSurfaces.has(key),
        `hubVisibility.js defines surface "${key}" but no card in enterprise.html uses it (orphan rule)`
      );
    }
  });

  it("no hub card is missing the data-surface attribute", () => {
    // Jede ds-hub-card im #hub-grid muss markiert sein — sonst kann applyHubVisibility sie nicht filtern.
    const hubGridMatch = html.match(/<div class="ds-hub-grid" id="hub-grid">([\s\S]*?)<\/div>\s*<\/div>\s*<!-- \u2550/);
    // Fallback: just grab the whole hub-grid block
    const hubGridBlock = hubGridMatch ? hubGridMatch[1] : html;
    const cardMatches = hubGridBlock.match(/<a[^>]*class="[^"]*ds-hub-card[^"]*"[^>]*>/g) || [];
    for (const card of cardMatches) {
      assert.match(
        card,
        /data-surface="[a-z_]+"/,
        `Hub-Card ohne data-surface-Marker gefunden: ${card.slice(0, 200)}`
      );
    }
    assert.ok(cardMatches.length >= 5, `Erwartet mindestens 5 Hub-Cards, gefunden: ${cardMatches.length}`);
  });
});

describe("topbar NAV wiring — pageShell.js <-> hubVisibility.js NAV_RULES",
  { skip: !(HUB_JS_AVAILABLE && PAGE_SHELL_AVAILABLE) ? "hubVisibility.js oder pageShell.js nicht erreichbar" : false },
  () => {
  const { navKeys } = loadHubVisibility();
  const pageShellSrc = readProjectFile("frontend/public/js/pageShell.js");
  const navLinkKeys = extractNavLinkKeys(pageShellSrc);

  it("every NAV_LINK in pageShell.js carries a key", () => {
    // Zaehle top-level NAV_LINKS-eintraege und vergleiche mit keys-Treffern.
    // NAV_LINKS hat genau 6 Eintraege (Uebersicht, Marktplatz, Bedarfe, Deals & Einsaetze, Steuerung, Help-Icon).
    assert.equal(
      navLinkKeys.length,
      6,
      `Erwartet 6 NAV_LINKS mit key, gefunden: ${navLinkKeys.length} (${navLinkKeys.join(", ")})`
    );
  });

  it("every NAV_LINK key has a matching entry in NAV_RULES", () => {
    for (const key of navLinkKeys) {
      assert.ok(
        navKeys.includes(key),
        `pageShell.js verwendet NAV-Key "${key}" aber hubVisibility.js hat keine NAV_RULE dafuer`
      );
    }
  });

  it("every NAV_RULE is reachable from a NAV_LINK (no orphan rules)", () => {
    for (const key of navKeys) {
      assert.ok(
        navLinkKeys.includes(key),
        `NAV_RULE "${key}" ist definiert, aber kein NAV_LINK in pageShell.js benutzt sie`
      );
    }
  });

  it("pageShell.js lazy-loads hubVisibility.js defensiv", () => {
    // Schutz vor Regression: der Lazy-Loader muss vorhanden bleiben, sonst bricht
    // die NAV-Filterung auf Seiten ohne expliziten <script>-Tag.
    assert.match(pageShellSrc, /ensureHubVisibilityLoaded/);
    assert.match(pageShellSrc, /data-tc-module="hub-visibility"/);
    assert.match(pageShellSrc, /hubVisibility\.js/);
  });
});

describe("worker-portal redirect hardening",
  { skip: !ENTERPRISE_HTML_AVAILABLE ? "Frontend HTML nicht erreichbar" : false },
  () => {
  it("worker-portal.html stub points at the canonical einsatzportal dashboard", () => {
    const html = readProjectFile("frontend/public/worker-portal.html");
    assert.match(html, /<meta http-equiv="refresh" content="0;url=\/public\/einsatzportal-dashboard\.html"\/>/);
  });

  it("worker-portal.html is NOT imported as a canonical link anywhere in the frontend (only breadcrumb alias and redirect tests are allowed)", () => {
    // Sucht nach href|src Referenzen auf worker-portal.html in frontend/public.
    // Erlaubt: die Datei selbst (redirect stub), breadcrumb.js (kennt Alias),
    // sowie der Canonical-Test.
    const frontendRoot = path.resolve(__dirname, "..", "..", "frontend", "public");
    const offenders = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(html|js)$/i.test(entry.name)) continue;
        if (entry.name === "worker-portal.html") continue; // the stub itself
        if (entry.name === "breadcrumb.js") continue;       // intentional alias mapping
        const content = fs.readFileSync(full, "utf8");
        // Kritisch: echte href="worker-portal" ODER location.href = "worker-portal" etc.
        const hrefHits = content.match(/(?:href|src|location\.(?:href|replace))\s*=?\s*["']([^"']*worker-portal\.html[^"']*)["']/g);
        if (hrefHits && hrefHits.length > 0) {
          offenders.push({ file: path.relative(frontendRoot, full), hits: hrefHits });
        }
      }
    }
    walk(frontendRoot);
    assert.equal(
      offenders.length,
      0,
      "Lebende Frontend-Referenzen auf worker-portal.html gefunden: " + JSON.stringify(offenders, null, 2)
    );
  });
});

describe("canonical stub shape — worker-portal, api_docs, app_notdienst, capacity_exchange stubs bleiben minimal",
  { skip: !ENTERPRISE_HTML_AVAILABLE ? "Frontend HTML nicht erreichbar" : false },
  () => {
  const stubs = [
    "frontend/public/capacity_exchange.html",
    "frontend/public/marketplace_capacity_create.html",
    "frontend/public/demand_create.html",
    "frontend/public/worker-timesheet.html",
    "frontend/public/worker-portal.html",
    "frontend/public/internal_control_center.html",
    "frontend/public/api_docs.html",
    "frontend/public/app_notdienst.html",
    "frontend/public/legal/meine-agb.html"
  ];

  for (const stub of stubs) {
    it(path.basename(stub) + " bleibt ein kompakter Redirect-Stub (<25 non-empty lines)", () => {
      const html = readProjectFile(stub);
      const lines = html.split(/\r?\n/).filter((line) => line.trim().length > 0);
      assert.ok(
        lines.length < 25,
        `${path.basename(stub)} sollte <25 nicht-leere Zeilen haben, hat ${lines.length}`
      );
      assert.match(html, /<meta http-equiv="refresh"/);
    });
  }
});

describe("pageShell location-context wiring",
  { skip: !PAGE_SHELL_AVAILABLE ? "pageShell.js nicht erreichbar" : false },
  () => {
  const pageShellSrc = readProjectFile("frontend/public/js/pageShell.js");

  it("leert activeLocationId bei Org-Wechsel (clearActiveLocationId oder setActiveLocationId(null))", () => {
    assert.ok(
      /clearActiveLocationId|setActiveLocationId\s*\(\s*null\s*\)/.test(pageShellSrc),
      "pageShell.js muss TC.api.clearActiveLocationId() oder setActiveLocationId(null) beim Org-Wechsel aufrufen"
    );
  });

  it("Location-Switcher bietet 'Alle Standorte' als erste Option an", () => {
    assert.match(
      pageShellSrc,
      /Alle Standorte/,
      "pageShell.js muss eine 'Alle Standorte' Option im Location-Switcher haben"
    );
  });

  it("unterscheidet Badge-Pfad fuer location-bound Nutzer (locs.length === 1)", () => {
    assert.match(
      pageShellSrc,
      /locs\.length\s*===\s*1/,
      "pageShell.js muss einen Badge-Pfad fuer Nutzer mit exakt einem erlaubten Standort haben"
    );
  });

  it("speichert Standortname unter tc.activeLocationName in sessionStorage", () => {
    assert.match(
      pageShellSrc,
      /tc\.activeLocationName/,
      "pageShell.js muss tc.activeLocationName in sessionStorage schreiben"
    );
  });

  it("ruft POST /me/active-location mit location_id auf beim Standort-Wechsel", () => {
    assert.match(pageShellSrc, /\/me\/active-location/, "pageShell.js muss POST /me/active-location aufrufen");
    assert.match(pageShellSrc, /location_id/, "pageShell.js muss location_id im Request-Body senden");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   Neue Tests: CTA Write-Lock Wiring (data-cta-write + applyCTAVisibility)
   ═══════════════════════════════════════════════════════════════════ */

describe("CTA write-lock — data-cta-write attribute wiring",
  { skip: !ENTERPRISE_HTML_AVAILABLE ? "enterprise.html nicht erreichbar" : false },
  () => {
  const html = readProjectFile("frontend/public/enterprise.html");

  it("enterprise.html hat mindestens 2 Schreib-CTAs mit data-cta-write='true'", () => {
    const matches = html.match(/data-cta-write="true"/g) || [];
    assert.ok(
      matches.length >= 2,
      `Erwartet mindestens 2 data-cta-write="true" Attribute, gefunden: ${matches.length}`
    );
  });

  it("ce-nudge-cta-1 (Kapazitaet anbieten) hat data-cta-write", () => {
    // Findet den spezifischen CTA-Link und prueft das Attribut
    const ctaBlock = html.match(/id="ce-nudge-cta-1"[^>]*/);
    assert.ok(ctaBlock, "ce-nudge-cta-1 nicht gefunden");
    assert.ok(
      ctaBlock[0].includes('data-cta-write="true"'),
      `ce-nudge-cta-1 hat kein data-cta-write: ${ctaBlock[0]}`
    );
  });

  it("ce-nudge-cta-2 (Bedarf erfassen) hat data-cta-write", () => {
    const ctaBlock = html.match(/id="ce-nudge-cta-2"[^>]*/);
    assert.ok(ctaBlock, "ce-nudge-cta-2 nicht gefunden");
    assert.ok(
      ctaBlock[0].includes('data-cta-write="true"'),
      `ce-nudge-cta-2 hat kein data-cta-write: ${ctaBlock[0]}`
    );
  });
});

describe("enterpriseHub.js — applyCTAVisibility strukturelle Pruefung",
  { skip: !ENTERPRISE_HUB_AVAILABLE ? "enterpriseHub.js nicht erreichbar" : false },
  () => {
  const src = readProjectFile("frontend/public/js/pages/enterpriseHub.js");

  it("applyCTAVisibility-Funktion ist definiert", () => {
    assert.match(src, /function applyCTAVisibility/);
  });

  it("applyCTAVisibility referenziert 'viewer' und 'finance' als gesperrte Rollen", () => {
    assert.match(src, /"viewer"/, 'applyCTAVisibility muss "viewer" referenzieren');
    assert.match(src, /"finance"/, 'applyCTAVisibility muss "finance" referenzieren');
  });

  it("applyCTAVisibility selektiert data-cta-write Elemente", () => {
    assert.match(src, /data-cta-write/, 'applyCTAVisibility muss [data-cta-write] selektieren');
  });

  it("applyCTAVisibility wird im Boot-Pfad aufgerufen", () => {
    assert.match(src, /applyCTAVisibility\(me\)/, "Boot muss applyCTAVisibility(me) aufrufen");
  });

  it("applyHubVisibility behandelt read_only Zustand (Card bleibt sichtbar)", () => {
    assert.match(src, /read_only/, "applyHubVisibility muss den read_only-Zustand behandeln");
    assert.match(src, /ds-hub-card--read-only/, "read_only-State muss CSS-Klasse setzen");
  });
});
