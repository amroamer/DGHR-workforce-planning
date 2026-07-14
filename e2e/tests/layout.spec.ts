import { test, expect } from "@playwright/test";
import { gotoAs, assertNoHorizontalOverflow, assertElementsInBounds } from "./helpers";

const SCREENS: { path: string; persona: "dghr-admin" | "entity-dm" | "entity-dha"; heading: string }[] = [
  { path: "/dghr/command-center", persona: "dghr-admin", heading: "DGHR Data Collection Command Center" },
  { path: "/dghr/data-collection", persona: "dghr-admin", heading: "DGHR Data Request Configuration" },
  { path: "/dghr/submissions", persona: "dghr-admin", heading: "DGHR Entity Submission Tracker" },
  { path: "/dghr/data-quality", persona: "dghr-admin", heading: "DGHR Data Quality & Validation" },
  { path: "/dghr/forecasting-readiness", persona: "dghr-admin", heading: "Forecasting Readiness" },
  { path: "/dghr/clarifications", persona: "dghr-admin", heading: "DGHR Clarifications & Resubmissions" },
  { path: "/dghr/reports", persona: "dghr-admin", heading: "Reports" },
  { path: "/entity/home", persona: "entity-dm", heading: "Entity Data Collection Home" },
  { path: "/entity/my-submissions", persona: "entity-dm", heading: "My Submissions" },
  { path: "/entity/org-structure", persona: "entity-dm", heading: "Organization Structure Submission" },
  { path: "/entity/workforce", persona: "entity-dm", heading: "Current Workforce Data" },
  { path: "/entity/workload", persona: "entity-dm", heading: "Workload & Service Data" },
  { path: "/entity/demand-drivers", persona: "entity-dm", heading: "Future Demand Drivers & Evidence" },
  { path: "/entity/clarifications", persona: "entity-dm", heading: "Clarifications & Requests from DGHR" },
  { path: "/entity/workforce", persona: "entity-dha", heading: "Current Workforce Data" }, // empty-state layout
];

test.describe("LAYOUT · no overflow / nothing spilling out — every screen", () => {
  for (const s of SCREENS) {
    test(`${s.persona} ${s.path} — in bounds`, async ({ page }) => {
      await gotoAs(page, s.path, s.persona);
      await expect(page.getByRole("heading", { name: s.heading }).first()).toBeVisible();
      await page.waitForTimeout(400); // let charts/tables settle
      await assertNoHorizontalOverflow(page, s.path);
      await assertElementsInBounds(page, s.path);
    });
  }

  test("overlays open — no overflow while open", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    await page.getByRole("button", { name: /DGHR Admin/ }).first().click();
    await expect(page.getByText("Switch persona")).toBeVisible();
    await assertNoHorizontalOverflow(page, "persona open");

    // fresh navigation clears the open dropdown
    await gotoAs(page, "/dghr/submissions");
    await page.locator("table tbody tr").first().locator("button").last().click();
    await expect(page.getByText("Package progress")).toBeVisible();
    await assertNoHorizontalOverflow(page, "entity drawer open");
  });
});
