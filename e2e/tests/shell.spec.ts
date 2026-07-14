import { test, expect } from "@playwright/test";
import { gotoAs, pageTitle } from "./helpers";

const DGHR_NAV = ["Command Center", "Entities", "Data Collection", "Submissions", "Data Quality",
  "Forecasting Readiness", "Alerts & AI Flags", "Reports", "Admin", "Knowledge Center"];
const PLACEHOLDERS = ["Entities", "Alerts & AI Flags", "Reports", "Admin", "Knowledge Center"];

test.describe("A. Shell, nav, persona, notifications", () => {
  test("A1 DGHR shell loads with crest, wordmark, nav, user card", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    await expect(page.getByText("DUBAI GOVERNMENT", { exact: true })).toBeVisible();
    await expect(page.getByText("Workforce Planning Portal")).toBeVisible();
    await expect(page.getByText("DGHR Central Team")).toBeVisible();
    for (const item of DGHR_NAV) {
      await expect(page.getByRole("link", { name: item, exact: true })).toBeVisible();
    }
  });

  test("A2 every DGHR nav item navigates + becomes active", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    const built = ["Data Collection", "Submissions", "Data Quality", "Forecasting Readiness", "Command Center"];
    for (const item of built) {
      await page.getByRole("link", { name: item, exact: true }).click();
      await page.waitForLoadState("networkidle").catch(() => {});
      // active pill = solid primary background
      const link = page.getByRole("link", { name: item, exact: true });
      await expect(link).toHaveClass(/bg-primary/);
      await expect(pageTitle(page)).toBeVisible();
    }
  });

  test("A3 roadmap items show a designed placeholder with working Back (no dead links)", async ({ page }) => {
    for (const item of PLACEHOLDERS) {
      await gotoAs(page, "/dghr/command-center");
      await page.getByRole("link", { name: item, exact: true }).click();
      await expect(page.getByText("Coming with the full release")).toBeVisible();
      await page.getByRole("button", { name: /Back to Command Center/ }).click();
      await expect(pageTitle(page)).toContainText("Command Center");
    }
  });

  test("A4/A5 persona switcher opens and swaps the whole shell", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    await page.getByRole("button", { name: /DGHR Admin/ }).click();
    await expect(page.getByText("Switch persona")).toBeVisible();
    await page.getByRole("button", { name: /Dubai Municipality/ }).click();
    // entity shell now
    await expect(page).toHaveURL(/\/entity\/home/);
    await expect(page.getByRole("link", { name: "My Submissions", exact: true })).toBeVisible();
    await expect(page.getByText("Ahmed Al Mansoori")).toBeVisible();
    await expect(page.getByText("Government Entity")).toBeVisible();
  });

  test("A6 persona persists across reload", async ({ page }) => {
    await gotoAs(page, "/entity/home", "entity-dm");
    await expect(page.getByText("Ahmed Al Mansoori")).toBeVisible();
    await page.goto("/entity/home"); // no persona param this time
    await expect(page.getByText("Ahmed Al Mansoori")).toBeVisible();
  });

  test("A7 notification bell opens a dropdown and mark-all-read works", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    const bell = page.getByRole("button", { name: "Notifications" });
    await bell.click();
    await expect(page.getByText("Notifications").last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark all read/ })).toBeVisible();
    await page.getByRole("button", { name: /Mark all read/ }).click();
  });

  test("A8 header shows Last updated + refresh works", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    await expect(page.getByText(/Last updated:/)).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(pageTitle(page)).toBeVisible(); // no crash
  });

  test("A9 unknown route redirects to home", async ({ page }) => {
    await gotoAs(page, "/totally/unknown/route");
    await expect(page).toHaveURL(/\/dghr\/command-center/);
  });
});
