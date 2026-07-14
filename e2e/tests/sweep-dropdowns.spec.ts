import { test, expect } from "@playwright/test";
import { gotoAs, cycleSelect } from "./helpers";

// Exhaustive per-instance sweep of EVERY <select> dropdown, cycling ALL of its options.
test.describe("SWEEP · every dropdown instance × every option", () => {
  test("Tracker — all 5 filter dropdowns, every option", async ({ page }) => {
    await gotoAs(page, "/dghr/submissions");
    await expect(page.getByRole("heading", { name: "DGHR Entity Submission Tracker" })).toBeVisible();
    const selects = page.locator("select");
    await expect(selects).toHaveCount(5); // Wave, Status, Reviewer, Due Date, Data Package
    for (let i = 0; i < 5; i++) {
      const vals = await cycleSelect(page, selects.nth(i));
      expect(vals.length).toBeGreaterThan(1);
    }
    // spot-check correctness after cycling: default view leads with the pinned entity
    await expect(page.locator("table tbody tr").first()).toContainText("Dubai Health Authority");
  });

  test("Workforce — all 4 dropdowns (Section, Employment Type, Status, Rows-per-page)", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await expect(page.getByText(/Showing 1 to 25 of 1,248 records/)).toBeVisible();
    const selects = page.locator("select");
    await expect(selects).toHaveCount(4);
    for (let i = 0; i < 4; i++) await cycleSelect(page, selects.nth(i));
    // rows-per-page (last select) genuinely changes the page size
    await selects.last().selectOption("100");
    await expect(page.getByText(/Showing 1 to 100 of 1,248 records/)).toBeVisible();
  });

  test("Org Structure — both dropdowns (Sector, Status), every option", async ({ page }) => {
    await gotoAs(page, "/entity/org-structure", "entity-dm");
    await expect(page.getByRole("heading", { name: "Organization Structure Submission" })).toBeVisible();
    const selects = page.locator("select");
    await expect(selects).toHaveCount(2);
    await cycleSelect(page, selects.nth(0)); // Sector
    await cycleSelect(page, selects.nth(1)); // Status
    // selecting unmapped shows the unmapped pinned section
    await selects.nth(1).selectOption("unmapped");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });
});
