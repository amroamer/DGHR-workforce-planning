import { test, expect, chromium } from "@playwright/test";
import { resetDemo } from "./helpers";

// The closed cross-portal loop (SPEC §11): two independent browser windows, one per persona.
test.describe("I. Cross-portal live loop", () => {
  test("I1 entity submit → DGHR sees a live toast", async () => {
    await resetDemo();
    const browser = await chromium.launch({ channel: "chrome" });
    const dghr = await browser.newContext();
    const entity = await browser.newContext();
    const dghrPage = await dghr.newPage();
    const entityPage = await entity.newPage();
    try {
      await dghrPage.goto("http://localhost:5183/dghr/command-center?persona=dghr-admin");
      await expect(dghrPage.getByRole("heading", { name: /Command Center/ })).toBeVisible();

      await entityPage.goto("http://localhost:5183/entity/workforce?persona=entity-dm");
      await entityPage.getByRole("button", { name: /Submit Workforce Data/ }).click();
      await expect(entityPage.locator("[data-sonner-toast]").filter({ hasText: /submitted to DGHR/ }).first()).toBeVisible();

      // DGHR window receives the cross-portal notification within a couple of poll cycles
      await expect(
        dghrPage.locator("[data-sonner-toast]").filter({ hasText: /Dubai Municipality submitted/ }).first()
      ).toBeVisible({ timeout: 12000 });
    } finally {
      await browser.close();
      await resetDemo();
    }
  });

  test("I2 DGHR clarification → entity badge count increases", async () => {
    await resetDemo();
    const browser = await chromium.launch({ channel: "chrome" });
    const dghr = await browser.newContext();
    const entity = await browser.newContext();
    const dghrPage = await dghr.newPage();
    const entityPage = await entity.newPage();
    try {
      await entityPage.goto("http://localhost:5183/entity/home?persona=entity-dm");
      // DM starts with 3 open cases (sidebar badge)
      const badge = entityPage.locator("aside").getByText("3", { exact: true }).first();
      await expect(badge).toBeVisible();

      // DGHR raises a clarification on DM via the Data Quality anomaly (DM headcount spike)
      await dghrPage.goto("http://localhost:5183/dghr/data-quality?persona=dghr-admin");
      await dghrPage.getByText("Headcount spike of +35% detected in short time period").click();
      await dghrPage.getByRole("button", { name: /Open Clarification/ }).click();
      await expect(dghrPage.locator("[data-sonner-toast]").first()).toBeVisible();

      // entity sidebar badge climbs to 4 within a couple of poll cycles
      await expect(entityPage.locator("aside").getByText("4", { exact: true }).first()).toBeVisible({ timeout: 12000 });
    } finally {
      await browser.close();
      await resetDemo();
    }
  });
});
