/**
 * pricing.html + pricing.js structural test.
 *
 * Stellt sicher, dass die oeffentliche Tarifseite ab Welle 8 Schritt 6 keine
 * hartcodierten Preise/Featurelisten mehr im sichtbaren HTML-Body hat und die
 * dynamische Render-Pipeline (`pricing.js`) korrekt verdrahtet ist:
 *   - Container-IDs vorhanden (Plan-Grid, Tier-Grid, Comparison-Head/Body, Disclaimer)
 *   - pricing.js wird eingebunden
 *   - keine 150/499/799 EUR im sichtbaren HTML
 *   - pricing.js liest /api/public/catalog
 *   - pricing.js exportiert selectPlan / selectIndividuellTier / requestPilot
 *   - pricing.js fuehrt CTAs auf /public/enterprise_anfrage.html korrekt
 *
 * Run: node --test --test-force-exit api/test/pricingPage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Robuste Projekt-Root-Aufloesung: cwd-Zweig deckt Docker /app ab, sonst ueber
// die Testdatei (api/test/*) zwei Ebenen hoch zum Repo-Root. Vermeidet, dass der
// Runner (cwd=api) frontend/ nicht findet und die Suite still als skip laeuft.
const MARKER_REL = "frontend/public/pricing.html";
const _RD = process.cwd();
const _RL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(_RD, MARKER_REL)) ? _RD : _RL;
// Inside Docker the frontend directory is not mounted — skip gracefully.
const HTML_PATH = path.join(ROOT, "frontend/public/pricing.html");
const JS_PATH   = path.join(ROOT, "frontend/public/js/pages/pricing.js");
const AVAILABLE = fs.existsSync(HTML_PATH) && fs.existsSync(JS_PATH);
const HTML = AVAILABLE ? fs.readFileSync(HTML_PATH, "utf8") : "";
const JS   = AVAILABLE ? fs.readFileSync(JS_PATH,   "utf8") : "";
const suite = AVAILABLE ? describe : describe.skip;

function bodyOnly(html) {
  // sichtbarer Body ohne Style-Block; Style hat /* */-Kommentare und CSS-Werte,
  // die false-positives liefern wuerden.
  const start = html.indexOf("<body");
  const end = html.indexOf("</body>");
  if (start < 0 || end < 0) return html;
  let body = html.slice(start, end);
  // Auch hidden LEGACY-Blocks ausblenden, da sie historische Werte enthalten
  body = body.replace(/<div hidden>[\s\S]*?<\/div><!--\s*\/LEGACY[\s\S]*?-->/gi, "");
  return body;
}

suite("pricing.html: dynamische Render-Container", () => {
  it("hat Plan-Grid Container mit id pricingPlanGrid", () => {
    assert.match(HTML, /id="pricingPlanGrid"/);
  });
  it("hat Tier-Grid Container mit id pricingTierGrid", () => {
    assert.match(HTML, /id="pricingTierGrid"/);
  });
  it("hat Comparison-Head + Body Container", () => {
    assert.match(HTML, /id="pricingComparisonHead"/);
    assert.match(HTML, /id="pricingComparisonBody"/);
  });
  it("hat Disclaimer Container mit id pricingDisclaimer", () => {
    assert.match(HTML, /id="pricingDisclaimer"/);
  });
  it("bindet pricing.js ein", () => {
    assert.match(HTML, /\/public\/js\/pages\/pricing\.js/);
  });
  it("hat noscript-Fallback fuer Tarif-Listing", () => {
    assert.match(HTML, /<noscript>[\s\S]*pricing-error/);
  });
});

suite("pricing.html: keine hartcodierten Tarif-Preise im sichtbaren Body", () => {
  const visible = bodyOnly(HTML);
  it("keine '150 EUR' im sichtbaren Body", () => {
    assert.ok(!/150\s*EUR/.test(visible), "150 EUR darf nicht hart im Body stehen");
  });
  it("keine '499 EUR' im sichtbaren Body", () => {
    assert.ok(!/499\s*EUR/.test(visible), "499 EUR darf nicht hart im Body stehen");
  });
  it("keine '799 EUR' im sichtbaren Body", () => {
    assert.ok(!/799\s*EUR/.test(visible), "799 EUR darf nicht hart im Body stehen");
  });
  it("keine alten Tier-Preise '299 EUR' / '1.999 EUR' im sichtbaren Body", () => {
    assert.ok(!/299\s*[€E]/.test(visible));
    assert.ok(!/1\.999\s*[€E]/.test(visible));
  });
});

suite("pricing.js: Datenquelle + CTA-Globals", () => {
  it("liest /api/public/catalog", () => {
    assert.match(JS, /\/api\/public\/catalog/);
  });
  it("exportiert window.selectPlan", () => {
    assert.match(JS, /window\.selectPlan\s*=\s*function/);
  });
  it("exportiert window.selectIndividuellTier", () => {
    assert.match(JS, /window\.selectIndividuellTier\s*=\s*function/);
  });
  it("exportiert window.requestPilot", () => {
    assert.match(JS, /window\.requestPilot\s*=\s*function/);
  });
  it("CTA fuer Individuell zielt auf enterprise_anfrage.html", () => {
    assert.match(JS, /\/public\/enterprise_anfrage\.html/);
  });
  it("Pilot-CTA setzt intent=pilot in Query", () => {
    // requestPilot setzt 'intent' und 'pilot' in den Params
    assert.match(JS, /params\.set\("intent",\s*"pilot"\)/);
  });
  it("Tier-CTA setzt source=pricing + plan=INDIVIDUELL", () => {
    assert.match(JS, /params\.set\("source",\s*"pricing"\)/);
    assert.match(JS, /params\.set\("plan",\s*"INDIVIDUELL"\)/);
  });
  it("nutzt TC.authIntent.navigateForPlan wenn vorhanden", () => {
    assert.match(JS, /TC\.authIntent\.navigateForPlan/);
  });
  it("hat Empty/Error-State-Renderer (showError + reload-Button)", () => {
    assert.match(JS, /pricing-error/);
    assert.match(JS, /location\.reload/);
  });
});

suite("pricing.js: Tier-Schwellen 50/150/350 (kommen aus Katalog, nicht hartcodiert)", () => {
  it("rendert tierBoundsLabel ueber min_employees aus Katalog", () => {
    // pricing.js liest min_employees/max_employees aus dem Catalog,
    // hartcodierte Schwellen 30/250/999 oder 50/150/350 duerfen NICHT in der JS stehen
    assert.ok(!/[^0-9]30[^0-9].*Besch[ae]ftigt/.test(JS), "30 darf nicht hart stehen");
    assert.ok(!/[^0-9]250[^0-9].*Besch[ae]ftigt/.test(JS), "250 darf nicht hart stehen");
    assert.ok(!/[^0-9]999[^0-9].*Besch[ae]ftigt/.test(JS), "999 darf nicht hart stehen");
    // Erlaubt: 351 als reines Beschreibungs-Snippet (Sonderbedarf-Hinweis)
  });
});
