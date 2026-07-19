import { test, expect } from "@playwright/test";
import { gotoAs, assertNoHorizontalOverflow, assertElementsInBounds } from "./helpers";

// SPEC targets laptop/projector 1440–1920px, minimum 1280px.
const WIDTHS = [1280, 1440, 1920];
const SCREENS: { path: string; persona: "dghr-admin" | "entity-dm"; heading: string }[] = [
  { path: "/dghr/government", persona: "dghr-admin", heading: "Government-Wide Position" },
  { path: "/dghr/alerts", persona: "dghr-admin", heading: "Alerts & Smart Flags" },
  { path: "/dghr/reports", persona: "dghr-admin", heading: "Reports" },
  { path: "/dghr/admin", persona: "dghr-admin", heading: "Cycle & Administration" },
  { path: "/dghr/method", persona: "dghr-admin", heading: "Method & Typeset Library" },
  { path: "/entity/departments", persona: "entity-dm", heading: "Departments" },
  { path: "/entity/submissions", persona: "entity-dm", heading: "My Submissions" },
  { path: "/entity/reports", persona: "entity-dm", heading: "Reports" },
  { path: "/entity/calendar", persona: "entity-dm", heading: "Programme & Wave Management" },
  { path: "/entity/help", persona: "entity-dm", heading: "Help & Support" },
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
