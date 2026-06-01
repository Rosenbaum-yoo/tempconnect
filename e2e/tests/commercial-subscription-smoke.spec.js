// @ts-check
import { test, expect } from "@playwright/test";

const TEST_PASSWORD = "CommercialE2e2026!";

test.describe("Commercial subscription smoke @commercial-smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("pricing -> enterprise_anfrage -> submit -> optional SCC approval -> sla_abo", async ({ page }) => {
    test.slow();

    await page.goto("/public/pricing.html");
    await expect(page).toHaveTitle(/Tarife|TempConnect/);
    await expect(page.locator("#pricingPlanGrid")).toBeVisible({ timeout: 15_000 });

    await page.goto("/public/enterprise_anfrage.html?source=pricing&plan=INDIVIDUELL&intent=request&return_to=/public/sla_abo.html");
    await expect(page.locator("#addonGrid")).toBeVisible({ timeout: 15_000 });

    const leadEmail = `e2e-enterprise-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
    await page.locator("#fCompany").fill("E2E Commercial Smoke GmbH");
    await page.locator("#fContact").fill("Erika Smoke");
    await page.locator("#fEmail").fill(leadEmail);
    await page.locator("#fPhone").fill("+49 30 123456");
    await page.locator("#fNotes").fill("Playwright Smoke: Pricing zu Enterprise-Anfrage mit Kostenvorschau.");
    await page.locator("#btnSubmit").click();

    await expect(page.locator("#successMsg")).toHaveClass(/visible/, { timeout: 15_000 });
    await expect(page.locator("#successPreviewDocument")).toBeVisible({ timeout: 15_000 });
    const previewHref = await page.locator("#successPreviewDocument a").getAttribute("href");
    expect(previewHref).toMatch(/^\/api\/subscription-documents\/[^/]+\/public-download$/);

    const company = await registerCompany(page);
    const upgradeRequest = await createUpgradeRequest(page, company.csrfToken);
    expect(upgradeRequest.status).toBe(201);
    expect(upgradeRequest.body?.data?.request_type).toBe("upgrade");

    if (process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_PASSWORD) {
      const approved = await approveViaScc(page, upgradeRequest.body.data.id);
      expect(approved.approve.status).toBe(200);
      expect(approved.approve.body?.data?.status).toBe("accepted");
      if (approved.activate.status === 200) {
        expect(approved.activate.body?.data?.status).toBe("active");
      }
    } else {
      test.info().annotations.push({
        type: "manual-gate",
        description: "SCC approval/activation skipped because E2E_STAFF_EMAIL/E2E_STAFF_PASSWORD are not configured."
      });
    }

    await page.goto("/public/sla_abo.html");
    await expect(page.locator("#accountStatusBlock")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#accountPendingBlock")).toBeVisible();
    await expect(page.locator("#accountInvoicesBlock")).toBeVisible();
    await expect(page.locator("#accountDocumentsBlock")).toBeVisible();
  });
});

async function registerCompany(page) {
  await ensureOrigin(page);
  const csrf = await fetchCsrf(page);
  const email = `e2e-commercial-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const res = await browserJson(page, "/api/auth/register", {
    method: "POST",
    headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
    data: {
      role: "company",
      org_role: "owner",
      email,
      password: TEST_PASSWORD,
      company_name: "E2E Commercial Subscription GmbH",
      plan: "PLUS"
    }
  });
  if (!res.ok) {
    throw new Error(`E2E company registration failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { email, password: TEST_PASSWORD, csrfToken: await fetchCsrf(page) };
}

async function createUpgradeRequest(page, csrfToken) {
  return browserJson(page, "/api/subscription-requests/upgrade", {
    method: "POST",
    headers: {
      "X-CSRF-Token": csrfToken,
      "Content-Type": "application/json",
      "Idempotency-Key": `e2e-upgrade-${Date.now()}`
    },
    data: {
      desired_plan: "PRO",
      message: "Playwright Smoke Upgrade auf PRO"
    }
  });
}

async function approveViaScc(page, requestId) {
  const login = await browserJson(page, "/staff/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: {
      email: process.env.E2E_STAFF_EMAIL,
      password: process.env.E2E_STAFF_PASSWORD
    }
  });
  if (!login.ok) {
    throw new Error(`SCC login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }

  const stepUp = await browserJson(page, "/staff/api/auth/step-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: { confirmed: true }
  });
  if (!stepUp.ok) {
    throw new Error(`SCC step-up failed (${stepUp.status}): ${JSON.stringify(stepUp.body)}`);
  }

  const approve = await browserJson(page, `/staff/api/subscription-requests/${requestId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: {
      confirmed: true,
      reason: "Playwright Smoke Approval"
    }
  });

  const activate = await browserJson(page, `/staff/api/subscription-requests/${requestId}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: {
      confirmed: true,
      reason: "Playwright Smoke Aktivierung"
    }
  });

  return { approve, activate };
}

async function ensureOrigin(page) {
  if (!page.url() || page.url() === "about:blank") {
    await page.goto("/");
  }
}

async function fetchCsrf(page) {
  const res = await browserJson(page, "/api/csrf");
  if (!res.ok || !res.body?.token) {
    throw new Error(`CSRF fetch failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function browserJson(page, path, options = {}) {
  await ensureOrigin(page);
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "include",
      headers: options.headers || {},
      body: options.data ? JSON.stringify(options.data) : undefined
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  }, { path, options });
}
