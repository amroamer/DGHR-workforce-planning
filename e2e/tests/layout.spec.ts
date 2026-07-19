import { test, expect } from "@playwright/test";
import { gotoAs, assertNoHorizontalOverflow, assertElementsInBounds } from "./helpers";

const SCREENS: { path: string; persona: "dghr-admin" | "entity-dm" | "entity-dha"; heading: string }[] = [
  { path: "/dghr/government", persona: "dghr-admin", heading: "Government-Wide Position" },
  { path: "/dghr/alerts", persona: "dghr-admin", heading: "Alerts & Smart Flags" },
  { path: "/dghr/reports", persona: "dghr-admin", heading: "Reports" },
  { path: "/dghr/admin", persona: "dghr-admin", heading: "Cycle & Administration" },
  { path: "/dghr/method", persona: "dghr-admin", heading: "Method & Typeset Library" },
  { path: "/dghr/knowledge", persona: "dghr-admin", heading: "Knowledge Center" },
  { path: "/entity/departments", persona: "entity-dm", heading: "Departments" },
  { path: "/entity/submissions", persona: "entity-dm", heading: "My Submissions" },
  { path: "/entity/reports", persona: "entity-dm", heading: "Reports" },
  { path: "/entity/calendar", persona: "entity-dm", heading: "Programme & Wave Management" },
  { path: "/entity/help", persona: "entity-dm", heading: "Help & Support" },
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
    await gotoAs(page, "/dghr/government");
    await page.getByRole("button", { name: /DGHR Admin/ }).first().click();
    await expect(page.getByText("Switch persona")).toBeVisible();
    await assertNoHorizontalOverflow(page, "persona switcher open");
    await page.keyboard.press("Escape");

    // command palette overlay
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder(/Search screens and entities/i)).toBeVisible();
    await assertNoHorizontalOverflow(page, "command palette open");
  });
});
