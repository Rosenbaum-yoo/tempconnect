/**
 * sla_abo.html + accountSubscription.js structural test (Welle 8 Schritt 7).
 *
 * Verifiziert:
 *   - sla_abo.html hat die neuen Account-Sektionen (Status/Limits/Actions/Features/Pending/Documents)
 *   - accountSubscription.js wird eingebunden NACH slaAbo.js
 *   - entitlements.js wird vor accountSubscription.js geladen
 *   - accountSubscription.js liest /api/me + /api/me/entitlements + /api/public/catalog
 *     + /api/subscription-requests/mine + /api/subscription-documents/mine
 *   - Quoten-UI zeigt Nutzer/Sites/Vendoren/Multi-Org/Listings/Requests mit Progress/Pills/Add-ons
 *   - Feature-Kacheln tragen data-feature-key und rufen TC.entitlements.applyDomLocks()
 *   - Pending-Logik blockt doppelte Anfragen (disabled-Buttons)
 *   - CTAs senden Upgrade/Downgrade/Cancellation direkt auf subscription-requests
 *   - Dokumentliste nutzt subscription_documents mit Downloadlink, keine Payment-History als Ersatz
 *   - Stripe Customer Portal wird nur bei echtem Feature-Flag gerendert
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Robust root resolution: the official runner starts node --test with cwd=api/
// (Docker: /app), so process.cwd() alone misses <repo>/frontend. Prefer the cwd
// branch (covers Docker /app where the volume is mounted), otherwise fall back
// via this file's location (api/test/../.. → repo root).
const _MARKER = "frontend/public/sla_abo.html";
const _ROOT_CWD   = process.cwd();
const _ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(_ROOT_CWD, _MARKER)) ? _ROOT_CWD : _ROOT_LOCAL;
// Inside Docker the frontend directory is not mounted — skip gracefully.
const HTML_PATH = path.join(ROOT, "frontend/public/sla_abo.html");
const JS_PATH   = path.join(ROOT, "frontend/public/js/pages/accountSubscription.js");
const AVAILABLE = fs.existsSync(HTML_PATH) && fs.existsSync(JS_PATH);
const HTML = AVAILABLE ? fs.readFileSync(HTML_PATH, "utf8") : "";
const JS   = AVAILABLE ? fs.readFileSync(JS_PATH,   "utf8") : "";
const suite = AVAILABLE ? describe : describe.skip;

suite("sla_abo.html: Account-Management-Sektionen", () => {
  it("hat accountStatusBlock", () => assert.match(HTML, /id="accountStatusBlock"/));
  it("hat accountLimitsBlock", () => assert.match(HTML, /id="accountLimitsBlock"/));
  it("hat accountActionsBlock", () => assert.match(HTML, /id="accountActionsBlock"/));
  it("hat accountFeaturesBlock", () => assert.match(HTML, /id="accountFeaturesBlock"/));
  it("hat accountPendingBlock", () => assert.match(HTML, /id="accountPendingBlock"/));
  it("hat accountDocumentsBlock", () => assert.match(HTML, /id="accountDocumentsBlock"/));
  it("bindet accountSubscription.js ein", () => {
    assert.match(HTML, /\/public\/js\/pages\/accountSubscription\.js/);
  });
  it("accountSubscription.js wird NACH slaAbo.js eingebunden", () => {
    const slaIdx = HTML.indexOf("/public/js/pages/slaAbo.js");
    const accIdx = HTML.indexOf("/public/js/pages/accountSubscription.js");
    assert.ok(slaIdx > 0 && accIdx > slaIdx, "accountSubscription.js muss nach slaAbo.js stehen");
  });
  it("entitlements.js wird vor accountSubscription.js geladen", () => {
    const entIdx = HTML.indexOf("/public/js/entitlements.js");
    const accIdx = HTML.indexOf("/public/js/pages/accountSubscription.js");
    assert.ok(entIdx > 0 && accIdx > entIdx, "entitlements.js muss vor accountSubscription.js stehen");
  });
});

suite("accountSubscription.js: Dokumente und Live-Refresh", () => {
  it("rendert echte Subscription-Dokumente mit Typ/Datum/Status/Betrag/Download", () => {
    assert.match(JS, /documentTypeLabel/);
    assert.match(JS, /issued_at/);
    assert.match(JS, /statusStyle/);
    assert.match(JS, /total_cents/);
    assert.match(JS, /\/api\/subscription-documents\/"\s*\+\s*encodeURIComponent\(r\.id\)\s*\+\s*"\/download/);
  });
  it("hat Live-Refresh nach Mutationen und fuer Dokumente", () => {
    assert.match(JS, /refreshAfterMutation/);
    assert.match(JS, /refreshDocuments/);
    assert.match(JS, /loadAll\(\)\.then/);
  });
  it("nutzt keinen kompletten Reload im Account-Renderer", () => {
    assert.doesNotMatch(JS, /location\.reload/);
  });
});

suite("accountSubscription.js: Stripe Customer Portal UX", () => {
  it("rendert Portal-Button nur bei explizitem Backend-Flag", () => {
    assert.match(JS, /stripe_customer_portal_enabled/);
    assert.match(JS, /stripe_customer_portal_endpoint/);
    assert.match(JS, /canUseCustomerPortal/);
  });
  it("oeffnet das Portal ueber POST und zeigt Fehler ohne tote UI", () => {
    assert.match(JS, /openCustomerPortal/);
    assert.match(JS, /Customer Portal konnte nicht geoeffnet werden/);
    assert.match(JS, /Zahlungsmethoden-Self-Service ist fuer diesen Account noch nicht verfuegbar/);
  });
});

suite("accountSubscription.js: Datenquellen", () => {
  it("liest /api/me", () => assert.match(JS, /\/api\/me\b/));
  it("liest /api/me/entitlements", () => assert.match(JS, /\/api\/me\/entitlements/));
  it("liest /api/public/catalog", () => assert.match(JS, /\/api\/public\/catalog/));
  it("liest /api/subscription-requests/mine", () => assert.match(JS, /\/api\/subscription-requests\/mine/));
  it("liest /api/subscription-documents/mine", () => assert.match(JS, /\/api\/subscription-documents\/mine/));
  it("liest /api/payment/config fuer Stripe-Portal-Detection", () => assert.match(JS, /\/api\/payment\/config/));
  it("verwendet Payment-History NICHT als Dokumentenquelle", () => {
    assert.doesNotMatch(JS, /\/api\/payment\/history/);
    assert.doesNotMatch(JS, /state\.payments/);
  });
});

suite("accountSubscription.js: Direct POST Aktionen", () => {
  it("Upgrade geht direkt auf /api/subscription-requests/upgrade", () => {
    assert.match(JS, /requestUpgrade/);
    assert.match(JS, /\/api\/subscription-requests\/upgrade/);
    assert.match(JS, /desired_plan/);
  });
  it("Downgrade geht direkt auf /api/subscription-requests/downgrade", () => {
    assert.match(JS, /requestDowngrade/);
    assert.match(JS, /\/api\/subscription-requests\/downgrade/);
    assert.match(JS, /acknowledge_impact:\s*true/);
  });
  it("Cancellation geht direkt auf /api/subscription-requests/cancellation", () => {
    assert.match(JS, /requestCancellation/);
    assert.match(JS, /\/api\/subscription-requests\/cancellation/);
    assert.match(JS, /cancellation_effective_at/);
  });
  it("nutzt CSRF + Idempotency-Key fuer Mutationen", () => {
    assert.match(JS, /\/api\/csrf/);
    assert.match(JS, /X-CSRF-Token/);
    assert.match(JS, /Idempotency-Key/);
  });
  it("keine enterprise_anfrage-Redirects im Account-Renderer", () => {
    assert.doesNotMatch(JS, /enterprise_anfrage\.html/);
    assert.doesNotMatch(JS, /window\.cancelSubscription/);
    assert.doesNotMatch(JS, /window\._setPlan/);
  });
});

suite("accountSubscription.js: Pending-Logik", () => {
  it("erkennt pendingByType (upgrade/downgrade/cancellation/pilot)", () => {
    assert.match(JS, /pendingByType\("upgrade"\)/);
    assert.match(JS, /pendingByType\("downgrade"\)/);
    assert.match(JS, /pendingByType\("cancellation"\)/);
    assert.match(JS, /hasOpenRequest\(\["upgrade", "new_individual", "pilot"\]\)/);
  });
  it("rendert Pending-Buttons als disabled mit Status-Hint", () => {
    assert.match(JS, /Upgrade-Anfrage offen/);
    assert.match(JS, /Downgrade-Anfrage offen/);
    assert.match(JS, /Kuendigung/);
  });
  it("rendert pending_requests in eigenem Block (pending-card)", () => {
    assert.match(JS, /pending-card/);
  });
});

suite("accountSubscription.js: Empty/Error-States", () => {
  it("zeigt 'Bitte einloggen' wenn ent fehlt", () => {
    assert.match(JS, /Bitte einloggen/);
  });
  it("zeigt account-error bei Fetch-Fehler", () => {
    assert.match(JS, /account-error/);
  });
  it("zeigt empty-block fuer keine Pending/Dokumente/Features", () => {
    assert.match(JS, /Aktuell keine offene Anfrage/);
    assert.match(JS, /Noch keine Tarif-\/Vertragsdokumente/);
  });
});

suite("accountSubscription.js: Pflicht-Verhalten", () => {
  it("liest pending-features aus desired_features fuer pending-Marker", () => {
    assert.match(JS, /desired_features/);
  });
  it("rendert active_addons separat", () => {
    assert.match(JS, /active_addons/);
    assert.match(JS, /Aktive Add-ons/);
    assert.match(JS, /addon-chip/);
  });
  it("rendert Limits inkl. seats, users, sites, suppliers, multi-org, listings und requests aus entitlements", () => {
    assert.match(JS, /seats_included/);
    assert.match(JS, /multi_org/);
    assert.match(JS, /plan_max_users/);
    assert.match(JS, /plan_max_sites/);
    assert.match(JS, /plan_max_suppliers/);
    assert.match(JS, /plan_max_multi_org_slots/);
    assert.match(JS, /multi_org_slots/);
    assert.match(JS, /requests_send/);
    assert.match(JS, /requests_receive/);
    assert.match(JS, /plan_max_listings/);
    assert.match(JS, /Nutzer/);
    assert.match(JS, /Standorte/);
    assert.match(JS, /Lieferanten \/ Vendoren/);
    assert.match(JS, /Multi-Org Slots/);
    assert.match(JS, /Aktive Listings/);
  });
  it("rendert Ampel-/Progress-UI und Upgrade-CTA fuer knappe Quoten", () => {
    assert.match(JS, /limit-row__bar/);
    assert.match(JS, /limit-row__pill/);
    assert.match(JS, /limit-row__pill--danger/);
    assert.match(JS, /quota-upgrade-card/);
    assert.match(JS, /Hard-Limit bei Downgrade/);
  });
  it("markiert Feature-Kacheln mit data-feature-key und ruft DOM-Locks", () => {
    assert.match(JS, /data-feature-key/);
    assert.match(JS, /applyAccountDomLocks/);
    assert.match(JS, /TC\.entitlements\.applyDomLocks/);
  });
});
