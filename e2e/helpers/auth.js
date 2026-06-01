// @ts-check

/**
 * E2E Auth Helper — self-provisioning test users.
 *
 * Instead of relying on seed data (passwords may change), this helper
 * registers fresh test users via the API on first use, then caches the
 * credentials for subsequent logins in the same test run.
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";

const TEST_PASSWORD = "E2eTest2026!";

/** Pre-defined test user profiles (registered on first use) */
export const USERS = {
  company: {
    email: `e2e-company-${process.pid}@test.local`,
    password: TEST_PASSWORD,
    role: "company",
    org_role: "owner",
    company_name: "E2E Company GmbH",
    plan: "PLUS",
  },
  agency: {
    email: `e2e-agency-${process.pid}@test.local`,
    password: TEST_PASSWORD,
    role: "agency",
    org_role: "owner",
    company_name: "E2E Zeitarbeit GmbH",
    plan: "PLUS",
  },
  companyMember: {
    email: `e2e-company-member-${process.pid}@test.local`,
    password: TEST_PASSWORD,
    role: "company",
    org_role: "member",
    company_name: "E2E Company Member GmbH",
    plan: "PLUS",
  },
};

/** Track which users have already been registered in this process */
const _registered = new Set();

async function ensureOrigin(page) {
  if (!page.url() || page.url() === "about:blank") {
    await page.goto(BASE_URL);
  }
}

/**
 * Run an authenticated JSON request from inside the browser context.
 * This avoids Playwright's API client choking on malformed local response headers.
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string, string>, data?: any }} [options]
 */
async function browserJson(page, path, options = {}) {
  await ensureOrigin(page);
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "include",
      headers: options.headers || {},
      body: options.data ? JSON.stringify(options.data) : undefined,
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  }, { path, options });
}

/**
 * Fetch a fresh CSRF token.
 * @param {import("@playwright/test").Page} page
 */
async function fetchCsrf(page) {
  const res = await browserJson(page, "/api/csrf");
  return res.body?.token;
}

/**
 * Ensure a test user exists (register if needed), then login.
 *
 * @param {import("@playwright/test").Page} page
 * @param {typeof USERS.company} user
 */
export async function apiLogin(page, user = USERS.company) {
  const csrfToken = await fetchCsrf(page);

  // Register if not yet done in this process
  if (!_registered.has(user.email)) {
    const regRes = await browserJson(page, "/api/auth/register", {
      method: "POST",
      data: {
        role: user.role,
        org_role: user.org_role,
        email: user.email,
        password: user.password,
        company_name: user.company_name,
        plan: user.plan,
      },
      headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
    });

    if (regRes.ok) {
      _registered.add(user.email);
      // Registration auto-logs in and rotates the CSRF token.
      // Fetch a fresh token so callers don't get CSRF_INVALID on their first mutation.
      const freshCsrf = await fetchCsrf(page);
      return { csrfToken: freshCsrf };
    }

    // If EMAIL_EXISTS, the user already exists from a previous run → proceed to login
    const body = regRes.body || {};
    if (body.error !== "EMAIL_EXISTS") {
      throw new Error(`E2E user registration failed: ${JSON.stringify(body)}`);
    }
    _registered.add(user.email);
  }

  // Login (user already exists from previous run or was just registered in another context)
  const loginCsrf = await fetchCsrf(page);
  const loginRes = await browserJson(page, "/api/auth/login", {
    method: "POST",
    data: { email: user.email, password: user.password },
    headers: { "X-CSRF-Token": loginCsrf, "Content-Type": "application/json" },
  });
  if (!loginRes.ok) {
    throw new Error(`API login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }

  // Login rotates the CSRF token — fetch a fresh one before returning.
  const postLoginCsrf = await fetchCsrf(page);
  return { csrfToken: postLoginCsrf };
}

/**
 * Logout via API.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} csrfToken
 */
export async function apiLogout(page, csrfToken) {
  await browserJson(page, "/api/auth/logout", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
  });
}
