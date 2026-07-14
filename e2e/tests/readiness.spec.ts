import { test, expect } from "@playwright/test";
import { gotoAs } from "./helpers";

test.describe("F. Forecasting Readiness", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAs(page, "/dghr/forecasting-readiness");
    await expect(page.getByRole("heading", { name: "Forecasting Readiness" })).toBeVisible();
  });

  test("F1 Zone-1 KPIs render", async ({ page }) => {
    await expect(page.getByText("Ready for Forecasting", { exact: true })).toBeVisible();
    await expect(page.getByText("Blocked / Not Ready", { exact: true })).toBeVisible();
    await expect(page.getByText("Avg. Completeness", { exact: true })).toBeVisible();
    await expect(page.getByText("Avg. Quality Score", { exact: true })).toBeVisible();
    await expect(page.getByText("Readiness Progress", { exact: true })).toBeVisible();
    await expect(page.getByText("Entity Readiness")).toBeVisible();
  });

  test("F2 Ready/Blocked filter toggles the table", async ({ page }) => {
    const rows = page.locator("table tbody tr");
    // filter buttons render lowercase text ("blocked") with a capitalize CSS class
    await page.getByRole("button", { name: "blocked", exact: true }).click();
    await expect(rows.first().getByText(/< 80%|below threshold|incomplete|correction/i)).toBeVisible();
    await page.getByRole("button", { name: "ready", exact: true }).click();
    await expect(rows.first().getByText("Ready", { exact: true })).toBeVisible();
  });

  test("F3 (edge) every Zone-2 card carries the Illustrative badge", async ({ page }) => {
    await expect(page.getByText("What this unlocks — Workforce Insights")).toBeVisible();
    const badges = page.getByText("Layer B Preview · Illustrative");
    // 4 insight tiles + skills + scenario + AI insights = 7 vision cards
    expect(await badges.count()).toBeGreaterThanOrEqual(7);
  });

  test("F4 skills chart, scenario chart, insight quotes render", async ({ page }) => {
    await expect(page.getByText("Skills Gaps (Top 5)")).toBeVisible();
    await expect(page.getByText("Data analytics")).toBeVisible();
    await expect(page.getByText("Scenario Comparison")).toBeVisible();
    await expect(page.getByText("AI-Generated Insights")).toBeVisible();
    await expect(page.getByText(/22% increase in administrative roles/)).toBeVisible();
  });

  test("F5 factory-quote footer + Open Tracker navigates", async ({ page }) => {
    await expect(page.getByText(/not a template automation tool/)).toBeVisible();
    await expect(page.getByText(/workforce planning factory/)).toBeVisible();
    await page.getByRole("button", { name: "Open Tracker" }).click();
    await expect(page).toHaveURL(/\/dghr\/submissions/);
  });
});
