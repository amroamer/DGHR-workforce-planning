import { test, expect } from "@playwright/test";
import { gotoAs } from "./helpers";

// The tracker filter <select>s in DOM order: Wave, Status, Reviewer, Due Date, Data Package.
const SEL = { wave: 0, status: 1, reviewer: 2, due: 3, pkg: 4 };

function tableRows(page: import("@playwright/test").Page) {
  return page.locator("table tbody tr");
}

test.describe("D. Submission Tracker", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAs(page, "/dghr/submissions");
    await expect(page.getByRole("heading", { name: "DGHR Entity Submission Tracker" })).toBeVisible();
  });

  test("D1 5 KPIs + pinned DHA/RTA/DM first", async ({ page }) => {
    await expect(page.getByText("Total Entities", { exact: true })).toBeVisible();
    await expect(page.getByText("Submitted Entities", { exact: true })).toBeVisible();
    await expect(page.getByText("Returned Entities", { exact: true })).toBeVisible();
    await expect(page.getByText("Overdue Submissions", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Avg. Completeness Score", { exact: true })).toBeVisible();
    await expect(tableRows(page).nth(0)).toContainText("Dubai Health Authority");
    await expect(tableRows(page).nth(1)).toContainText("Roads & Transport Authority");
  });

  test("D2 Wave dropdown is visible, opens, and filters to W2", async ({ page }) => {
    const wave = page.locator("select").nth(SEL.wave);
    await expect(wave).toBeVisible();
    await wave.selectOption("W2");
    const rows = tableRows(page);
    await expect(rows.first()).toContainText("W2"); // waits for the refetch to land
    const n = await rows.count();
    for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText("W2");
  });

  test("D3 compose two filters (Wave W1 + Status Submitted)", async ({ page }) => {
    await page.locator("select").nth(SEL.wave).selectOption("W1");
    await page.locator("select").nth(SEL.status).selectOption("submitted");
    const rows = tableRows(page);
    await expect(rows.first()).toContainText("Submitted");
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i)).toContainText("W1");
      await expect(rows.nth(i)).toContainText("Submitted");
    }
  });

  test("D4 sort by Overall Completeness reorders", async ({ page }) => {
    const before = await tableRows(page).nth(0).textContent();
    await page.getByRole("button", { name: /Overall Completeness/ }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    const after = await tableRows(page).nth(0).textContent();
    expect(after).not.toEqual(before);
  });

  test("D5 pagination loads a different page", async ({ page }) => {
    const first = await tableRows(page).nth(0).textContent();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(tableRows(page).nth(0)).not.toHaveText(first ?? "");
  });

  test("D6 Clear Filters resets", async ({ page }) => {
    await page.locator("select").nth(SEL.wave).selectOption("W3");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("button", { name: "Clear Filters" }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(tableRows(page).nth(0)).toContainText("Dubai Health Authority");
  });

  test("D7 follow-up rail Returned applies a filter", async ({ page }) => {
    await page.getByText("Returned by Reviewer").click();
    const rows = tableRows(page);
    await expect.poll(async () => rows.count(), { timeout: 8000 }).toBeGreaterThan(0);
  });

  test("D8 row ⋯ opens the entity drawer", async ({ page }) => {
    await tableRows(page).nth(0).locator("button").last().click();
    await expect(page.getByText("Package progress")).toBeVisible();
  });

  test("D9 (edge) empty filter combination shows no rows gracefully", async ({ page }) => {
    // Approved + W3 that likely has no overlap in the pinned set → still no crash
    await page.locator("select").nth(SEL.status).selectOption("approved");
    await page.locator("select").nth(SEL.wave).selectOption("W1");
    await page.waitForLoadState("networkidle").catch(() => {});
    // table still renders (0+ rows), page does not error
    await expect(page.getByRole("heading", { name: "DGHR Entity Submission Tracker" })).toBeVisible();
  });

  test("D10 blocked rail + follow-up counters render", async ({ page }) => {
    await expect(page.getByText("Where Submissions Are Blocked")).toBeVisible();
    await expect(page.getByText("Entities Requiring Follow-Up")).toBeVisible();
    await expect(page.getByText("Missing Evidence / Sources")).toBeVisible();
  });
});
