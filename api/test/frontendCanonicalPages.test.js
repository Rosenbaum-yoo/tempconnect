import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip guard: frontend files not mounted in Docker
const ROOT = process.cwd();
const HAS_API_SUBDIR = fs.existsSync(path.join(ROOT, "api"));
const FRONTEND_AVAILABLE = HAS_API_SUBDIR && fs.existsSync(path.join(ROOT, "frontend/public/js/pageShell.js"));
const frontendSuite = FRONTEND_AVAILABLE ? describe : describe.skip;

function readProjectFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", "..", relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

frontendSuite("frontend canonical page aliases", () => {
  const redirects = [
    ["frontend/public/capacity_exchange.html", "/public/capacity_exchange_feed.html"],
    ["frontend/public/marketplace_capacity_create.html", "/public/capacity_exchange_form.html"],
    ["frontend/public/demand_create.html", "/public/marketplace_demand_create.html"],
    ["frontend/public/worker-timesheet.html", "/public/einsatzportal-stundenzettel.html"],
    ["frontend/public/worker-portal.html", "/public/einsatzportal-dashboard.html"],
    ["frontend/public/internal_control_center.html", "/public/admin_panel.html"],
    ["frontend/public/api_docs.html", "/public/api-docs.html"],
    ["frontend/public/app_notdienst.html", "/"],
    ["frontend/public/legal/meine-agb.html", "/public/legal/agb.html"]
  ];

  for (const [file, target] of redirects) {
    it(path.basename(file) + " redirects to " + target, () => {
      const html = readProjectFile(file);
      assert.match(
        html,
        new RegExp('<meta http-equiv="refresh" content="0;url=' + escapeRegex(target) + '"\\/>')
      );
      assert.match(
        html,
        new RegExp('<a href="' + escapeRegex(target) + '"')
      );
    });
  }

  it("worker-portal.html does not retain legacy UI markup below the redirect", () => {
    const html = readProjectFile("frontend/public/worker-portal.html");
    // Nach der Bereinigung darf der Stub kein `wk-layout`, keine Worker-KPIs
    // und keinen Fetch-Init-Block mehr enthalten. Das schuetzt vor erneuter
    // Halbmigration, bei der die Weiterleitung zwar funktioniert, aber der
    // alte UI-Code nicht ausgeliefert wird.
    assert.doesNotMatch(html, /wk-layout/);
    assert.doesNotMatch(html, /loadAssignments/);
    assert.doesNotMatch(html, /renderDashboard/);
    // Erwartet: kompakter Stub, keine 100+ Zeilen Dead-Code.
    const lines = html.split(/\r?\n/).filter((line) => line.trim().length > 0);
    assert.ok(lines.length < 25, "worker-portal.html sollte <25 Zeilen haben, hat " + lines.length);
  });
});

frontendSuite("footer and docs use canonical marketplace creation paths", () => {
  it("footer links Marktplatz to the canonical feed page", () => {
    const footer = readProjectFile("frontend/public/js/footer.js");
    assert.match(footer, /\/public\/capacity_exchange_feed\.html/);
    assert.doesNotMatch(footer, /\/public\/capacity_exchange\.html/);
  });

  it("feature summary documents the canonical capacity form page", () => {
    const summary = readProjectFile("docs/FEATURE-SUMMARY.md");
    assert.match(summary, /`capacity_exchange_form\.html` – Agency stellt Kapazitaet ein/);
    assert.doesNotMatch(summary, /`marketplace_capacity_create\.html` – Agency stellt Kapazitaet ein/);
  });
});

frontendSuite("intentionally distinct pages stay wired under canonical hubs", () => {
  it("page shell keeps the Help Center active on the sla_hilfe subpage", () => {
    const shell = readProjectFile("frontend/public/js/pageShell.js");
    assert.match(
      shell,
      /href: "\/public\/hilfe\.html", match: \["\/public\/hilfe\.html", "\/public\/sla_hilfe"\]/
    );
  });

  it("marketplace feed keeps the company demand list reachable as its own page", () => {
    const feed = readProjectFile("frontend/public/js/pages/marketplaceFeed.js");
    assert.match(feed, /\/public\/marketplace_demand_list\.html/);
  });

  it("breadcrumbs keep organization and sla_hilfe under their canonical parent hubs", () => {
    const breadcrumb = readProjectFile("frontend/public/js/breadcrumb.js");
    assert.match(
      breadcrumb,
      /organization:\s+\{ area: 'Mein Unternehmen', url: '\/public\/sla_profil\.html' \}/
    );
    assert.match(
      breadcrumb,
      /sla_hilfe:\s+\{ area: 'Help Center', url: '\/public\/hilfe\.html' \}/
    );
  });

  it("feature summary documents the retained marketplace demand list page", () => {
    const summary = readProjectFile("docs/FEATURE-SUMMARY.md");
    assert.match(
      summary,
      /`marketplace_demand_list\.html` – Company-Liste eigener Marketplace-Nachfragen/
    );
  });
});
