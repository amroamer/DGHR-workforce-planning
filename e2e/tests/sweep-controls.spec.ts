import { test, expect } from "@playwright/test";
import { gotoAs, expectToast, resetDemo } from "./helpers";

test.describe("SWEEP · toggles, checkboxes, tabs, segmented, sort, pagination", () => {
  test("Data Collection — ALL 8 package toggles flip + toast", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/dghr/data-collection");
    const toggles = page.locator("button.relative.h-5.w-9");
    await expect(toggles).toHaveCount(8);
    for (let i = 0; i < 8; i++) {
      await toggles.nth(i).click();
      await expectToast(page, /mandatory fields (enabled|disabled)/);
      await page.waitForTimeout(150);
    }
    await resetDemo();
  });

  test("Tracker — select-all + row checkboxes toggle", async ({ page }) => {
    await gotoAs(page, "/dghr/submissions");
    const boxes = page.locator('input[type="checkbox"]');
    const headerBox = boxes.first();
    await headerBox.check();
    // at least one row checkbox becomes checked
    expect(await page.locator('input[type="checkbox"]:checked').count()).toBeGreaterThan(1);
    await headerBox.uncheck();
    // a single row toggles independently
    await boxes.nth(1).check();
    await expect(boxes.nth(1)).toBeChecked();
  });

  test("Clarifications — all 4 tabs switch", async ({ page }) => {
    await gotoAs(page, "/dghr/clarifications");
    for (const tab of ["all", "open", "returned", "resolved"]) {
      await page.getByRole("button", { name: new RegExp(`^${tab}`, "i") }).click();
      await page.waitForTimeout(200);
      await expect(page.getByRole("heading", { name: "DGHR Clarifications & Resubmissions" })).toBeVisible();
    }
  });

  test("Demand Drivers — left tabs (Drivers/Map) + right tabs (Evidence/AI/Linked)", async ({ page }) => {
    await gotoAs(page, "/entity/demand-drivers", "entity-dm");
    await page.getByRole("button", { name: /Driver Map/ }).click();
    await expect(page.getByText("0–2 Years").first()).toBeVisible();
    await page.getByRole("button", { name: "Future Demand Drivers", exact: true }).click();
    await expect(page.getByText("Future Drivers Workspace")).toBeVisible();
    // right side
    await page.getByRole("button", { name: /Linked Sections/ }).click();
    await expect(page.getByText(/Map each driver/)).toBeVisible();
    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await expect(page.getByRole("button", { name: /Upload Evidence/ })).toBeVisible();
  });

  test("Forecasting Readiness — segmented All/Ready/Blocked", async ({ page }) => {
    await gotoAs(page, "/dghr/forecasting-readiness");
    for (const f of ["all", "ready", "blocked"]) {
      await page.getByRole("button", { name: f, exact: true }).click();
      await page.waitForTimeout(200);
      await expect(page.locator("table tbody tr").first()).toBeVisible();
    }
  });

  test("Tracker — both sortable headers reorder", async ({ page }) => {
    await gotoAs(page, "/dghr/submissions");
    const firstBefore = await page.locator("table tbody tr").first().textContent();
    await page.getByRole("button", { name: /Entity Name/ }).click();
    await expect(page.locator("table tbody tr").first()).not.toHaveText(firstBefore ?? "");
    const firstA = await page.locator("table tbody tr").first().textContent();
    await page.getByRole("button", { name: /Overall Completeness/ }).click();
    await expect(page.locator("table tbody tr").first()).not.toHaveText(firstA ?? "");
  });

  test("Pagination — Tracker / Data Quality / Org / Readiness / Workforce", async ({ page }) => {
    // Tracker
    await gotoAs(page, "/dghr/submissions");
    let first = await page.locator("table tbody tr").first().textContent();
    await page.getByRole("button", { name: "2", exact: true }).first().click();
    await expect(page.locator("table tbody tr").first()).not.toHaveText(first ?? "");

    // Data Quality issues
    await gotoAs(page, "/dghr/data-quality");
    await expect(page.getByText(/Showing 1 to 8 of 38 issues/)).toBeVisible();
    await page.getByRole("button", { name: "2", exact: true }).first().click();
    await page.waitForTimeout(300);
    await expect(page.getByRole("heading", { name: "DGHR Data Quality & Validation" })).toBeVisible();

    // Org
    await gotoAs(page, "/entity/org-structure", "entity-dm");
    first = await page.locator("table tbody tr").first().textContent();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(page.locator("table tbody tr").first()).not.toHaveText(first ?? "");

    // Readiness
    await gotoAs(page, "/dghr/forecasting-readiness");
    first = await page.locator("table tbody tr").first().textContent();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(page.locator("table tbody tr").first()).not.toHaveText(first ?? "");

    // Workforce (1,248 rows)
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(page.getByText(/Showing 26 to 50 of 1,248 records/)).toBeVisible();
  });
});
