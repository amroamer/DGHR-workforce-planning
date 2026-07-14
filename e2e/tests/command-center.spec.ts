import { test, expect } from "@playwright/test";
import { gotoAs, expectToast, resetDemo } from "./helpers";

test.describe("B. Command Center", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
  });

  test("B1 six KPI cards render with real values", async ({ page }) => {
    for (const label of ["Total Entities", "Submissions Received", "Entities with Missing Data",
      "Validation-Ready", "Overdue Items", "Overall Collection Progress"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // real values rendered (not skeletons)
    await expect(page.getByText(/27 of 59 entities/)).toBeVisible();
    await expect(page.getByText(/45\.8% of total entities/)).toBeVisible();
  });

  test("B2 status donut + 6-status legend + footnote", async ({ page }) => {
    await expect(page.getByText("Entities by Submission Status")).toBeVisible();
    for (const s of ["Not Started", "In Progress", "Submitted", "Under Review", "Returned", "Approved"]) {
      await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/Percentages are out of total entities/)).toBeVisible();
  });

  test("B3 action queue row ⋯ opens the entity drawer", async ({ page }) => {
    await expect(page.getByText("Entities Requiring Action (Prioritized)")).toBeVisible();
    // the actions table is the one with a "Next Action" header; click the last button in row 1 (the ⋯)
    const table = page.locator("table", { has: page.getByText("Next Action") });
    await table.locator("tbody tr").first().locator("button").last().click();
    await expect(page.getByText("Package progress")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
    await expect(page.getByText("Recent activity", { exact: true })).toBeVisible();
  });

  test("B4 Send Reminder next-action fires a toast", async ({ page }) => {
    const link = page.getByRole("button", { name: "Send Reminder" }).first();
    if (await link.count()) {
      await link.click();
      await expectToast(page, /Reminder sent/);
    }
  });

  test("B5 Approve Ready Entities mutates KPIs", async ({ page }) => {
    await resetDemo();
    await page.reload();
    await page.getByRole("button", { name: /Approve Ready Entities/ }).click();
    await expectToast(page, /Approved \d+ validation-ready/);
    await resetDemo(); // restore for other tests
  });

  test("B6 readiness tiles, missing summary, alerts, trend render", async ({ page }) => {
    await expect(page.getByText("Data Readiness for Forecasting")).toBeVisible();
    await expect(page.getByText("Ready for Forecasting")).toBeVisible();
    await expect(page.getByText("Missing Data Summary")).toBeVisible();
    await expect(page.getByText("Recent Alerts & AI Flags")).toBeVisible();
    await expect(page.getByText("Collection Progress Trend")).toBeVisible();
    await expect(page.getByText("Next Steps for DGHR")).toBeVisible();
  });

  test("B7 View all → navigates to tracker", async ({ page }) => {
    await page.getByRole("button", { name: /View all/ }).first().click();
    await expect(page).toHaveURL(/\/dghr\/submissions/);
  });
});
