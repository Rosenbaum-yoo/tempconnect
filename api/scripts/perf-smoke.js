#!/usr/bin/env node
/**
 * Local/manual performance smoke for commercial subscription endpoints.
 *
 * Default:
 *   BASE_URL=http://localhost:8080 npm run perf:smoke
 *
 * Authenticated endpoints are skipped unless TC_PERF_EMAIL and
 * TC_PERF_PASSWORD are provided. The script fails if p95 exceeds PERF_P95_MS.
 */

import autocannon from "autocannon";

const BASE_URL = (process.env.BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const DURATION = Number(process.env.PERF_DURATION_SECONDS || 10);
const CONNECTIONS = Number(process.env.PERF_CONNECTIONS || 10);
const P95_THRESHOLD_MS = Number(process.env.PERF_P95_MS || 500);
const PERF_EMAIL = process.env.TC_PERF_EMAIL || "";
const PERF_PASSWORD = process.env.TC_PERF_PASSWORD || "";

const endpoints = [
  { name: "public catalog", path: "/api/public/catalog", auth: false },
  { name: "entitlements", path: "/api/me/entitlements", auth: true },
  { name: "subscription requests mine", path: "/api/subscription-requests/mine", auth: true }
];

async function main() {
  const cookie = PERF_EMAIL && PERF_PASSWORD
    ? await loginAndGetCookie(PERF_EMAIL, PERF_PASSWORD)
    : "";

  if (!cookie) {
    console.warn("[perf-smoke] TC_PERF_EMAIL/TC_PERF_PASSWORD not configured; authenticated endpoints will be skipped.");
  }

  const results = [];
  for (const endpoint of endpoints) {
    if (endpoint.auth && !cookie) {
      results.push({ ...endpoint, skipped: true });
      continue;
    }
    const result = await runEndpoint(endpoint, cookie);
    results.push(result);
  }

  let failed = false;
  console.log("[perf-smoke] results");
  for (const result of results) {
    if (result.skipped) {
      console.log(`- ${result.name}: skipped (auth credentials missing)`);
      continue;
    }
    const p95 = Number(result.latency?.p95 || 0);
    const status = p95 <= P95_THRESHOLD_MS ? "ok" : "FAIL";
    console.log(`- ${result.name}: p95=${p95}ms, req/s=${result.requests?.average || 0}, status=${status}`);
    if (p95 > P95_THRESHOLD_MS) failed = true;
  }

  if (failed) {
    console.error(`[perf-smoke] p95 threshold exceeded (${P95_THRESHOLD_MS}ms)`);
    process.exit(1);
  }
}

async function runEndpoint(endpoint, cookie) {
  const url = `${BASE_URL}${endpoint.path}`;
  return await autocannon({
    url,
    method: "GET",
    duration: DURATION,
    connections: CONNECTIONS,
    headers: cookie ? { Cookie: cookie } : {}
  });
}

async function loginAndGetCookie(email, password) {
  const jar = new CookieJar();
  const csrfResponse = await fetchWithCookies("/api/csrf", { method: "GET" }, jar);
  if (!csrfResponse.ok) {
    throw new Error(`CSRF request failed: ${csrfResponse.status}`);
  }
  const csrf = await csrfResponse.json();
  const loginResponse = await fetchWithCookies("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf.token || csrf.csrfToken || ""
    },
    body: JSON.stringify({ email, password })
  }, jar);
  if (!loginResponse.ok) {
    const body = await loginResponse.text().catch(() => "");
    throw new Error(`Login failed: ${loginResponse.status} ${body.slice(0, 200)}`);
  }
  return jar.header();
}

async function fetchWithCookies(path, options, jar) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(jar.header() ? { Cookie: jar.header() } : {})
    }
  });
  jar.store(response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get("set-cookie"));
  return response;
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  store(value) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    for (const raw of values) {
      const cookie = String(raw || "").split(";")[0];
      const idx = cookie.indexOf("=");
      if (idx <= 0) continue;
      this.cookies.set(cookie.slice(0, idx), cookie.slice(idx + 1));
    }
  }

  header() {
    return Array.from(this.cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

main().catch((err) => {
  console.error(`[perf-smoke] ${err.message}`);
  process.exit(1);
});
