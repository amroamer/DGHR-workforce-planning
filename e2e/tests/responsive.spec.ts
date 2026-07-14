import { test, expect } from "@playwright/test";
import { gotoAs, assertNoHorizontalOverflow, assertElementsInBounds } from "./helpers";

// SPEC targets laptop/projector 1440–1920px, minimum 1280px.
const WIDTHS = [1280, 1440, 1920];
const SCREENS: { path: string; persona: "dghr-admin" | "entity-dm"; heading: string }[] = [
  { path: "/dghr/command-center", persona: "dghr-admin", heading: "DGHR Data Collection Command Center" },
  { path: "/dghr/data-collection", persona: "dghr-admin", heading: "DGHR Data Request Configuration" },
  { path: "/dghr/submissions", persona: "dghr-admin", heading: "DGHR Entity Submission Tracker" },
  { path: "/dghr/data-quality", persona: "dghr-admin", heading: "DGHR Data Quality & Validation" },
  { path: "/dghr/forecasting-readiness", persona: "dghr-admin", heading: "Forecasting Readiness" },
  { path: "/dghr/clarifications", persona: "dghr-admin", heading: "DGHR Clarifications & Resubmissions" },
  { path: "/entity/home", persona: "entity-dm", heading: "Entity Data Collection Home" },
  { path: "/entity/org-structure", persona: "entity-dm", heading: "Organization Structure Submission" },
  { path: "/entity/workforce", persona: "entity-dm", heading: "Current Workforce Data" },
  { path: "/entity/workload", persona: "entity-dm", heading: "Workload & Service Data" },
  { path: "/entity/demand-drivers", persona: "entity-dm", heading: "Future Demand Drivers & Evidence" },
];

for (const width of WIDTHS) {
  test.describe(`RESPONSIVE · ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });
    for (const s of SCREENS) {
      test(`${s.path} @ ${width}`, async ({ page }) => {
        await gotoAs(page, s.path, s.persona);
        await expect(page.getByRole("heading", { name: s.heading }).first()).toBeVisible();
        await page.waitForTimeout(300);
        await assertNoHorizontalOverflow(page, `${s.path}@${width}`);
        await assertElementsInBounds(page, `${s.path}@${width}`);
      });
    }
  });
}
