// @ts-check
import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Serial execution: shared DB state + shared login credentials make parallel workers flaky */
  workers: 1,

  /* Reporter */
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],

  use: {
    baseURL: BASE_URL,

    /* Collect trace & screenshot on first retry (CI debug) */
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    /* Reasonable navigation/action timeouts */
    actionTimeout: 10_000,
    navigationTimeout: 15_000,

    /* Default headers */
    extraHTTPHeaders: {
      "Accept-Language": "de-DE",
    },
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],

  /* Output directory for test artifacts */
  outputDir: "./test-results",
});
