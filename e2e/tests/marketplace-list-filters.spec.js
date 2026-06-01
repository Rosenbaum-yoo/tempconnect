// @ts-check
import { test, expect } from "@playwright/test";
import { apiLogin, USERS } from "../helpers/auth.js";

test.describe("Marketplace list filters", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.company);
  });

  test("Capacity manage filters default to All and persist in session", async ({ page }) => {
    await page.goto("/public/capacity_exchange_manage.html");

    await expect(page.locator("#filter-status")).toHaveValue("");
    await expect(page.locator("#filter-role")).toHaveValue("");

    await page.locator("#filter-status").selectOption("active");
    await page.locator("#btn-filter").click();

    await page.reload();

    await expect(page.locator("#filter-status")).toHaveValue("active");
  });

  test("Marketplace demand list filters default to All and persist in session", async ({ page }) => {
    await page.goto("/public/marketplace_demand_list.html");

    await expect(page.locator("#filter-status")).toHaveValue("");
    await expect(page.locator("#filter-role")).toHaveValue("");

    await page.locator("#filter-status").selectOption("matched");
    await page.locator("#btn-filter").click();

    await page.reload();

    await expect(page.locator("#filter-status")).toHaveValue("matched");
  });
});
