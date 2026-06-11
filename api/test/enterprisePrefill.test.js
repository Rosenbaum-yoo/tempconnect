import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip guard: frontend files not mounted in Docker.
// Resolve project root robustly: cwd first (covers Docker /app), else via this
// test file up two levels (api/test -> repo root). Both layouts covered.
const MARKER_REL = "frontend/public/js/pages/enterpriseAnfrage.js";
const _ROOT_CWD = process.cwd();
const _ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(_ROOT_CWD, MARKER_REL)) ? _ROOT_CWD : _ROOT_LOCAL;
const FRONTEND_AVAILABLE = fs.existsSync(path.join(ROOT, MARKER_REL));
const frontendSuite = FRONTEND_AVAILABLE ? describe : describe.skip;

function readScript() {
  // Loader nutzt ROOT (nicht __dirname/../..): im Docker ist frontend/public/js nach
  // /app/frontend/public/js gemountet, ein Repo-Root oberhalb von /app existiert nicht.
  return fs.readFileSync(path.join(ROOT, MARKER_REL), "utf8");
}

function makeElement(initial = {}) {
  return {
    value: initial.value || "",
    textContent: initial.textContent || "",
    innerHTML: initial.innerHTML || "",
    style: initial.style || {},
    dataset: initial.dataset || {},
    classList: (function () {
      const set = new Set(initial.classes || []);
      return {
        add(c) { set.add(c); },
        remove(c) { set.delete(c); },
        toggle(c) { if (set.has(c)) set.delete(c); else set.add(c); },
        contains(c) { return set.has(c); }
      };
    })(),
    appendChild(child) {
      this.children = this.children || [];
      this.children.push(child);
      child.parentNode = this;
    },
    insertBefore(child, ref) {
      this.children = this.children || [];
      const idx = this.children.indexOf(ref);
      if (idx >= 0) this.children.splice(idx, 0, child);
      else this.children.push(child);
      child.parentNode = this;
    },
    remove() {
      if (!this.parentNode || !Array.isArray(this.parentNode.children)) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    setAttribute(name, value) {
      this.attributes = this.attributes || {};
      this.attributes[name] = value;
    },
    ...initial
  };
}

function buildDom(prefill = {}) {
  const ids = [
    "addonGrid",
    "seatCount",
    "seatCostLabel",
    "invoiceAddons",
    "invoiceSeatLine",
    "invoiceSeatQty",
    "invoiceSeatAmount",
    "invoiceMonthly",
    "invoiceEinmaligRow",
    "invoiceEinmalig",
    "fCompany",
    "fContact",
    "fEmail",
    "fContactRole",
    "fPhone",
    "fStreet",
    "fCity",
    "fVat",
    "fStart",
    "fNotes",
    "fStrategicCollabInterest",
    "fStrategicCollabSiteCount",
    "fStrategicCollabRegionScope",
    "fStrategicCollabMessage",
    "contactCard",
    "successMsg",
    "submitError",
    "btnSubmit",
    "contextBanner",
    "contextBannerText",
    "contextBannerMeta",
    "successActions",
    "successReturnLink",
    "selfServiceCta",
    "btnSelfServiceCheckout",
    "selfServiceError",
    "anfrageSubmitSection"
  ];
  const elements = {};
  ids.forEach((id) => {
    elements[id] = makeElement();
  });
  elements.seatCount.value = "50";
  elements.fStrategicCollabInterest.checked = true;
  Object.keys(prefill).forEach((key) => {
    if (elements[key]) elements[key].value = prefill[key];
  });
  return elements;
}

function createFetch(responses, calls) {
  return async function fetch(url) {
    if (Array.isArray(calls)) calls.push(url);
    let data;
    if (Object.prototype.hasOwnProperty.call(responses, url)) {
      data = responses[url];
    } else if (url.startsWith("/api/organizations/")) {
      data = responses["/api/organizations/:id"];
    }
    const ok = data !== undefined;
    return {
      ok,
      json: async () => (ok ? data : {})
    };
  };
}

async function runScript({ responses, search = "", prefill = {} }) {
  const elements = buildDom(prefill);
  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return makeElement();
    },
    querySelector() {
      return null;
    }
  };
  const windowObj = {
    location: { search },
    scrollTo() {},
    print() {},
    console: { warn() {}, error() {}, log() {} }
  };
  const fetchedUrls = [];
  const sandbox = {
    window: windowObj,
    document,
    fetch: createFetch(responses, fetchedUrls),
    URLSearchParams,
    Promise,
    setTimeout,
    clearTimeout,
    alert() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(readScript(), sandbox, { filename: "frontend/public/js/pages/enterpriseAnfrage.js" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  elements.__window = windowObj;
  elements.__fetchedUrls = fetchedUrls;
  return elements;
}

frontendSuite("enterprise request prefill", () => {
  it("prefills billing contact from organization details", async () => {
    const elements = await runScript({
      responses: {
        "/api/me": { org_id: "org-1", plan: "PLUS", org_role: "admin", org_name: "Org Name" },
        "/api/company-profile": {
          data: {
            profile: { legal_name: "Profile GmbH" },
            user: { company_name: "User GmbH", contact_person: "User Contact", email: "user@x.dev" },
            contacts: [
              { name: "Primary Person", email: "primary@x.dev", role_title: "HR Manager", is_primary: true }
            ]
          }
        },
        "/api/organizations/:id": {
          legal_name: "Org Legal GmbH",
          name: "Org Display",
          billing_contact: "Billing Office",
          billing_email: "billing@org.dev"
        }
      }
    });
    assert.equal(elements.fCompany.value, "Org Legal GmbH");
    assert.equal(elements.fContact.value, "Billing Office");
    assert.equal(elements.fEmail.value, "billing@org.dev");
    assert.equal(elements.fContactRole.value, "HR Manager");
  });

  it("falls back to primary contact and keeps manual edits", async () => {
    const elements = await runScript({
      prefill: { fEmail: "manual@override.dev" },
      responses: {
        "/api/me": { org_id: "org-1", plan: "BASIS", org_role: "owner" },
        "/api/company-profile": {
          data: {
            profile: { legal_name: "Profile GmbH" },
            user: { company_name: "User GmbH", contact_person: "User Contact", email: "user@x.dev" },
            contacts: [
              { name: "Primary Billing", email: "primary@x.dev", phone: "+49 30 123", role_title: "Billing Manager", is_primary: true }
            ]
          }
        },
        "/api/organizations/:id": {}
      }
    });
    assert.equal(elements.fContact.value, "Primary Billing");
    assert.equal(elements.fPhone.value, "+49 30 123");
    assert.equal(elements.fContactRole.value, "Billing Manager");
    assert.equal(elements.fEmail.value, "manual@override.dev");
  });

  it("adds current plan context when no URL params are provided", async () => {
    const elements = await runScript({
      responses: {
        "/api/me": { org_id: "org-1", plan: "PLUS", org_role: "admin" },
        "/api/company-profile": { data: { profile: {}, user: {}, contacts: [] } },
        "/api/organizations/:id": {}
      }
    });
    assert.match(elements.fNotes.value, /Aktueller Plan: PLUS/);
  });

  it("shows generated cost-preview document ID and public download link after submit", async () => {
    const elements = await runScript({
      prefill: {
        fCompany: "ACME GmbH",
        fContact: "Max Mustermann",
        fEmail: "max@acme.test"
      },
      responses: {
        "/api/me": {},
        "/api/company-profile": { data: { profile: {}, user: {}, contacts: [] } },
        "/api/csrf": { csrfToken: "csrf-test" },
        "/api/enterprise-request": {
          success: true,
          data: {
            id: "req-1",
            cost_preview_document: {
              id: "doc-preview-1",
              document_number: "KV-2026-000001",
              download_url: "/api/subscription-documents/doc-preview-1/public-download"
            }
          }
        }
      }
    });
    elements.__window.submitRequest();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const previewBlock = (elements.successMsg.children || []).find((child) => child.id === "successPreviewDocument");
    assert.ok(previewBlock, "Preview-Download-Block muss gerendert werden");
    assert.match(previewBlock.innerHTML, /doc-preview-1/);
    assert.match(previewBlock.innerHTML, /KV-2026-000001/);
    assert.match(previewBlock.innerHTML, /Kostenvorschau herunterladen/);
    assert.match(previewBlock.innerHTML, /\/api\/subscription-documents\/doc-preview-1\/public-download/);
  });
});

frontendSuite("enterprise self-service checkout (Slice E)", () => {
  const ORG_USER = { org_id: "org-7", id: "user-7", plan: "PRO", org_role: "admin" };
  const EMPTY_PROFILE = { data: { profile: {}, user: {}, contacts: [] } };

  async function tick(n) {
    for (let i = 0; i < n; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  it("zeigt die Direktbuchungs-CTA nur fuer eingeloggte Org-Nutzer bei aktivem Stripe", async () => {
    const elements = await runScript({
      responses: {
        "/api/payment/config": { stripe_enabled: true, mode: "live" },
        "/api/me": ORG_USER,
        "/api/company-profile": EMPTY_PROFILE,
        "/api/organizations/:id": {}
      }
    });
    assert.equal(elements.selfServiceCta.classList.contains("visible"), true);
    assert.equal(elements.anfrageSubmitSection.style.display, "none");
  });

  it("bleibt im Demo-Modus dormant: keine CTA, klassische Anfrage sichtbar (kein toter Button)", async () => {
    const elements = await runScript({
      responses: {
        "/api/payment/config": { stripe_enabled: true, mode: "demo" },
        "/api/me": ORG_USER,
        "/api/company-profile": EMPTY_PROFILE,
        "/api/organizations/:id": {}
      }
    });
    assert.equal(elements.selfServiceCta.classList.contains("visible"), false);
    assert.equal(elements.anfrageSubmitSection.style.display, "");
  });

  it("bleibt fuer anonyme Besucher dormant, auch wenn Stripe live ist", async () => {
    const elements = await runScript({
      responses: {
        "/api/payment/config": { stripe_enabled: true, mode: "live" },
        "/api/me": {},
        "/api/company-profile": EMPTY_PROFILE
      }
    });
    assert.equal(elements.selfServiceCta.classList.contains("visible"), false);
    assert.equal(elements.anfrageSubmitSection.style.display, "");
  });

  it("bleibt dormant, wenn Stripe nicht aktiv ist (stripe_enabled:false), obwohl Org-Nutzer eingeloggt", async () => {
    const elements = await runScript({
      responses: {
        "/api/payment/config": { stripe_enabled: false, mode: "live" },
        "/api/me": ORG_USER,
        "/api/company-profile": EMPTY_PROFILE,
        "/api/organizations/:id": {}
      }
    });
    assert.equal(elements.selfServiceCta.classList.contains("visible"), false);
    assert.equal(elements.anfrageSubmitSection.style.display, "");
  });

  it("leitet bei reiner Self-Service-Auswahl zur Stripe-Checkout-Session weiter", async () => {
    const elements = await runScript({
      prefill: { fCompany: "ACME GmbH", fContact: "Max Mustermann", fEmail: "max@acme.test" },
      responses: {
        "/api/payment/config": { stripe_enabled: true, mode: "live" },
        "/api/me": {},
        "/api/company-profile": EMPTY_PROFILE,
        "/api/csrf": { csrfToken: "csrf-e2e" },
        "/api/payment/checkout/individuell": { ok: true, mode: "stripe", redirect_url: "https://pay.stripe.test/session-1" }
      }
    });
    elements.__window.submitSelfServiceCheckout();
    await tick(4);
    assert.equal(elements.__window.location.href, "https://pay.stripe.test/session-1");
    assert.ok(elements.__fetchedUrls.includes("/api/payment/checkout/individuell"));
  });

  it("zeigt bei freigabepflichtiger Auswahl (mode:inquiry) die Bestaetigung statt Geldfluss", async () => {
    const elements = await runScript({
      prefill: { fCompany: "ACME GmbH", fContact: "Max Mustermann", fEmail: "max@acme.test" },
      responses: {
        "/api/payment/config": { stripe_enabled: true, mode: "live" },
        "/api/me": {},
        "/api/company-profile": EMPTY_PROFILE,
        "/api/csrf": { csrfToken: "csrf-e2e" },
        "/api/payment/checkout/individuell": { ok: true, mode: "inquiry" }
      }
    });
    elements.__window.submitSelfServiceCheckout();
    await tick(4);
    assert.equal(elements.contactCard.style.display, "none");
    assert.equal(elements.successMsg.classList.contains("visible"), true);
    assert.equal(elements.__window.location.href, undefined);
  });

  it("zeigt bei ungueltiger Auswahl (ok:false) eine Fehlermeldung und loest KEINE Zahlung aus", async () => {
    const elements = await runScript({
      prefill: { fCompany: "ACME GmbH", fContact: "Max Mustermann", fEmail: "max@acme.test" },
      responses: {
        "/api/payment/config": { stripe_enabled: true, mode: "live" },
        "/api/me": {},
        "/api/company-profile": EMPTY_PROFILE,
        "/api/csrf": { csrfToken: "csrf-e2e" },
        "/api/payment/checkout/individuell": { ok: false, errors: [{ code: "INVALID_SEATS" }] }
      }
    });
    elements.__window.submitSelfServiceCheckout();
    await tick(4);
    assert.equal(elements.selfServiceError.style.display, "block");
    assert.match(elements.selfServiceError.textContent, /Nutzeranzahl/);
    assert.equal(elements.__window.location.href, undefined);
  });

  it("blockt den Checkout bei fehlenden Pflichtfeldern, bevor ein Request rausgeht", async () => {
    const elements = await runScript({
      responses: {
        "/api/payment/config": { stripe_enabled: true, mode: "live" },
        "/api/me": {},
        "/api/company-profile": EMPTY_PROFILE
      }
    });
    elements.__window.submitSelfServiceCheckout();
    await tick(2);
    assert.match(elements.selfServiceError.textContent, /Firma/);
    assert.equal(elements.__fetchedUrls.includes("/api/payment/checkout/individuell"), false);
  });
});
