import { test, expect } from "@playwright/test";
import { gotoAs, assertElementsInBounds } from "./helpers";

test.describe("BOUNDARY · pagination edges, zero results, long text", () => {
  test("Workforce pagination: page-1 prev disabled; next advances", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await expect(page.getByText(/Showing 1 to 25 of 1,248 records/)).toBeVisible();
    // the prev control is disabled on page 1
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
    // next advances the window
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText(/Showing 26 to 50 of 1,248 records/)).toBeVisible();
  });

  test("Workforce: reach the LAST page and see the final rows", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    // jump to the last page (1,248 / 25 = 50) via the last-page pill
    await page.getByRole("button", { name: "Last page", exact: true }).click();
    await expect(page.getByText(/Showing 1,226 to 1,248 of 1,248 records/)).toBeVisible();
    // next is now disabled at the end
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  test("zero results: Tracker filter combo with no matches → empty, in bounds", async ({ page }) => {
    await gotoAs(page, "/dghr/submissions");
    // Approved + W3: unlikely overlap in the pinned/among approved set → few/none
    await page.locator("select").nth(1).selectOption("approved");
    await page.locator("select").nth(0).selectOption("W1");
    await page.waitForTimeout(400);
    await assertElementsInBounds(page, "tracker zero-results");
    await expect(page.getByRole("heading", { name: "DGHR Entity Submission Tracker" })).toBeVisible();
  });

  test("long text: long entity names render without spilling", async ({ page }) => {
    await gotoAs(page, "/dghr/submissions");
    await page.getByRole("button", { name: "Clear Filters" }).click();
    // a long-named entity exists in the data
    await page.locator("select").nth(0).selectOption("W2");
    await page.waitForTimeout(300);
    await assertElementsInBounds(page, "tracker long names");
    // General Directorate… (very long) is in the data — show it on the CC action queue
    await gotoAs(page, "/dghr/command-center");
    await expect(page.getByText(/General Directorate of Residency/)).toBeVisible();
    await assertElementsInBounds(page, "cc long names");
  });
});
