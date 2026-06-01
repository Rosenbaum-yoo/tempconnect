import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip guard: frontend files not mounted in Docker
const ROOT = process.cwd();
const HAS_API_SUBDIR = fs.existsSync(path.join(ROOT, "api"));
const FRONTEND_AVAILABLE = HAS_API_SUBDIR && fs.existsSync(path.join(ROOT, "frontend/public/js/pages/enterpriseAnfrage.js"));
const frontendSuite = FRONTEND_AVAILABLE ? describe : describe.skip;

function readScript() {
  return fs.readFileSync(
    path.resolve(__dirname, "..", "..", "frontend", "public", "js", "pages", "enterpriseAnfrage.js"),
    "utf8"
  );
}

function makeElement(initial = {}) {
  return {
    value: initial.value || "",
    textContent: initial.textContent || "",
    innerHTML: initial.innerHTML || "",
    style: initial.style || {},
    dataset: initial.dataset || {},
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
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
    "successReturnLink"
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

function createFetch(responses) {
  return async function fetch(url) {
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
    print() {}
  };
  const sandbox = {
    window: windowObj,
    document,
    fetch: createFetch(responses),
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
