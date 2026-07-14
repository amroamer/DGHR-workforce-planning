import { test, expect } from "@playwright/test";
import { gotoAs, expectToast, assertAllButtonsUsable } from "./helpers";

const DGHR_SCREENS: [string, string][] = [
  ["/dghr/command-center", "DGHR Data Collection Command Center"],
  ["/dghr/data-collection", "DGHR Data Request Configuration"],
  ["/dghr/submissions", "DGHR Entity Submission Tracker"],
  ["/dghr/data-quality", "DGHR Data Quality & Validation"],
  ["/dghr/forecasting-readiness", "Forecasting Readiness"],
  ["/dghr/clarifications", "DGHR Clarifications & Resubmissions"],
];
const ENTITY_SCREENS: [string, string][] = [
  ["/entity/home", "Entity Data Collection Home"],
  ["/entity/my-submissions", "My Submissions"],
  ["/entity/org-structure", "Organization Structure Submission"],
  ["/entity/workforce", "Current Workforce Data"],
  ["/entity/workload", "Workload & Service Data"],
  ["/entity/demand-drivers", "Future Demand Drivers & Evidence"],
  ["/entity/clarifications", "Clarifications & Requests from DGHR"],
];

test.describe("SWEEP · every button is present, labeled + usable (both portals)", () => {
  for (const [path, heading] of DGHR_SCREENS) {
    test(`DGHR ${heading} — all buttons usable`, async ({ page }) => {
      await gotoAs(page, path, "dghr-admin");
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      const count = await assertAllButtonsUsable(page);
      expect(count).toBeGreaterThan(3);
    });
  }
  for (const [path, heading] of ENTITY_SCREENS) {
    test(`Entity ${heading} — all buttons usable`, async ({ page }) => {
      await gotoAs(page, path, "entity-dm");
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      const count = await assertAllButtonsUsable(page);
      expect(count).toBeGreaterThan(3);
    });
  }
});

test.describe("SWEEP · stub buttons actually respond", () => {
  test("DGHR stub buttons toast 'Available in the full release'", async ({ page }) => {
    // Tracker: More Filters
    await gotoAs(page, "/dghr/submissions");
    await page.getByRole("button", { name: /More Filters/ }).click();
    await expectToast(page, /Available in the full release/);

    // Data Collection: Manage → (section-type rail)
    await gotoAs(page, "/dghr/data-collection");
    await page.getByRole("button", { name: /^Manage/ }).click();
    await expectToast(page, /Available in the full release/);

    // Data Quality: View all rules →
    await gotoAs(page, "/dghr/data-quality");
    await page.getByRole("button", { name: /View all rules/ }).click();
    await expectToast(page, /Available in the full release/);

    // Command Center: View all alerts →
    await gotoAs(page, "/dghr/command-center");
    await page.getByRole("button", { name: /View all alerts/ }).click();
    await expectToast(page, /Available in the full release/);
  });

  test("Entity stub buttons respond", async ({ page }) => {
    // Home: View Guidance + Contact DGHR
    await gotoAs(page, "/entity/home", "entity-dm");
    await page.getByRole("button", { name: /View Guidance/ }).click();
    await expectToast(page, /Available in the full release/);

    // Org Structure: Add Section
    await gotoAs(page, "/entity/org-structure", "entity-dm");
    await page.getByRole("button", { name: /Add Section/ }).click();
    await expectToast(page, /Available in the full release/);

    // Workload: Add Metric
    await gotoAs(page, "/entity/workload", "entity-dm");
    await page.getByRole("button", { name: /Add Metric/ }).click();
    await expectToast(page, /Available in the full release/);
  });
});
