import { test, expect } from "@playwright/test";
import { gotoAs, expectFullyVisible } from "./helpers";

// Every pop-over / drawer / panel must open FULLY VISIBLE (not clipped or off-screen).
test.describe("SWEEP · overlays open fully-visible (visual)", () => {
  test("Persona switcher dropdown — all 3 options fully visible (regression: header clipping)", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    await page.getByRole("button", { name: /DGHR Admin/ }).click();
    const menu = page.getByText("Switch persona").locator("xpath=..");
    await expectFullyVisible(page, menu, "persona menu");
    // the LAST option must be fully visible (this is what was clipped before)
    await expectFullyVisible(page, page.getByRole("button", { name: /Dubai Health Authority/ }), "DHA option");
    await expectFullyVisible(page, page.getByRole("button", { name: /Dubai Municipality/ }), "DM option");
    await page.screenshot({ path: "test-results/persona-dropdown.png" });
  });

  test("Notification bell dropdown — fully visible", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    await page.getByRole("button", { name: "Notifications" }).click();
    const menu = page.getByText("Notifications").last().locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]");
    await expectFullyVisible(page, menu, "bell menu");
    await expectFullyVisible(page, page.getByRole("button", { name: /Mark all read/ }), "mark-all-read");
    await page.screenshot({ path: "test-results/bell-dropdown.png" });
  });

  test("Entity detail drawer — fully visible", async ({ page }) => {
    await gotoAs(page, "/dghr/submissions");
    await page.locator("table tbody tr").first().locator("button").last().click();
    await expectFullyVisible(page, page.getByText("Package progress"), "drawer body");
    await expectFullyVisible(page, page.getByRole("button", { name: "Approve", exact: true }), "drawer approve btn");
  });

  test("Data Quality anomaly drawer — fully visible", async ({ page }) => {
    await gotoAs(page, "/dghr/data-quality");
    await page.getByText("Headcount spike of +35% detected in short time period").click();
    await expectFullyVisible(page, page.getByRole("button", { name: /Generate AI Narrative/ }), "generate narrative btn");
    await expectFullyVisible(page, page.getByRole("button", { name: /Open Clarification/ }), "open clarification btn");
  });

  test("Workforce Mapping Drawer — fully visible", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.getByRole("button", { name: /Map Fields/ }).click();
    await expectFullyVisible(page, page.getByText("Map Job Titles"), "mapping drawer title");
    await expect(page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 12000 });
    await expectFullyVisible(page, page.getByRole("button", { name: "Accept" }).first(), "first Accept btn");
  });

  test("Demo Panel (Ctrl+Shift+D) — fully visible", async ({ page }) => {
    await gotoAs(page, "/dghr/command-center");
    await page.keyboard.press("Control+Shift+D");
    await expectFullyVisible(page, page.getByText("Demo Control Panel"), "demo panel");
    await expectFullyVisible(page, page.getByRole("button", { name: /Simulate 3 Submissions/ }), "simulate btn");
  });
});
