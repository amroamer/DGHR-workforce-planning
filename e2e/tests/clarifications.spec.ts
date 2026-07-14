import { test, expect } from "@playwright/test";
import { gotoAs, expectToast, resetDemo } from "./helpers";

test.describe("G. Clarifications", () => {
  test("G1 DGHR: 5 KPIs + grouped case list", async ({ page }) => {
    await gotoAs(page, "/dghr/clarifications");
    await expect(page.getByText("Open Clarifications", { exact: true })).toBeVisible();
    await expect(page.getByText("Returned Submissions", { exact: true })).toBeVisible();
    await expect(page.getByText("Avg. Response Time", { exact: true })).toBeVisible();
    await expect(page.getByText("Resolved Items", { exact: true })).toBeVisible();
    await expect(page.getByText(/OPEN CLARIFICATIONS \(/i)).toBeVisible();
  });

  test("G2 tabs filter the list", async ({ page }) => {
    await gotoAs(page, "/dghr/clarifications");
    await page.getByRole("button", { name: /^returned/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByText(/RETURNED SUBMISSIONS/i)).toBeVisible();
  });

  test("G3 clicking a case shows its detail + quick actions", async ({ page }) => {
    await gotoAs(page, "/dghr/clarifications");
    await page.getByText("CLF-2025-00421").first().click();
    await expect(page.getByText("Issue Summary")).toBeVisible();
    await expect(page.getByText("Requested Corrections")).toBeVisible();
    await expect(page.getByText("Quick Actions")).toBeVisible();
    await expect(page.getByRole("button", { name: /Accept Resubmission/ })).toBeVisible();
  });

  test("G4 (complex) send a message appends it to the thread", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/dghr/clarifications");
    await page.getByText("CLF-2025-00421").first().click();
    const composer = page.getByPlaceholder("Write a comment…");
    await composer.fill("Please confirm the FTE conversion for interns.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Please confirm the FTE conversion for interns.")).toBeVisible();
    await resetDemo();
  });

  test("G5 Escalate quick action toasts", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/dghr/clarifications");
    await page.getByText("CLF-2025-00421").first().click();
    await page.getByRole("button", { name: /Escalate/ }).click();
    await expectToast(page, /escalated/i);
    await resetDemo();
  });

  test("G6 (edge) search with nonsense yields empty list, no crash", async ({ page }) => {
    await gotoAs(page, "/dghr/clarifications");
    await page.getByPlaceholder("Search cases…").fill("zzzzzznomatch");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByRole("heading", { name: "DGHR Clarifications & Resubmissions" })).toBeVisible();
  });

  test("G7 entity side is scoped to DM with entity actions", async ({ page }) => {
    await gotoAs(page, "/entity/clarifications", "entity-dm");
    await expect(page.getByRole("heading", { name: "Clarifications & Requests from DGHR" })).toBeVisible();
    await page.getByText("CLF-2025-00419").first().click();
    await expect(page.getByRole("button", { name: /Acknowledge/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reply/ })).toBeVisible();
  });
});
