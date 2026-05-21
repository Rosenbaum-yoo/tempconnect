import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readProjectFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", "..", relativePath), "utf8");
}

describe("enterprise form reuse and context wiring", () => {
  it("routes INDIVIDUELL CTA on SLA Abo to the enterprise form with context params", () => {
    const js = readProjectFile("frontend/public/js/pages/slaAbo.js");
    assert.match(js, /enterprise_anfrage\.html/);
    assert.match(js, /params\.set\("source", "sla_abo"\)/);
    assert.match(js, /params\.set\("return_to", "\/public\/sla_abo\.html"\)/);
  });

  it("enterprise form exposes context and return hooks", () => {
    const html = readProjectFile("frontend/public/enterprise_anfrage.html");
    assert.match(html, /id="contextBanner"/);
    assert.match(html, /id="contextBannerText"/);
    assert.match(html, /id="successReturnLink"/);
  });

  it("enterprise form script applies context prefill", () => {
    const js = readProjectFile("frontend/public/js/pages/enterpriseAnfrage.js");
    assert.match(js, /parseContextParams/);
    assert.match(js, /applyContextPrefill/);
    assert.match(js, /current_plan/);
  });
});
