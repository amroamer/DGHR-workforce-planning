import { test, expect } from "@playwright/test";
import { gotoAs, expectToast, resetDemo } from "./helpers";

test.describe("E. Data Quality", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAs(page, "/dghr/data-quality");
    await expect(page.getByRole("heading", { name: "DGHR Data Quality & Validation" })).toBeVisible();
  });

  test("E1 six KPI cards render", async ({ page }) => {
    for (const l of ["Average Quality Score", "Entities with Issues", "Rules Passed",
      "Missing Mandatory Fields", "Duplicate Job Titles", "Ready for Review"]) {
      await expect(page.getByText(l, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/86\.5% of total rules/)).toBeVisible();
  });

  test("E2 issues queue + pagination", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Validation Issues Queue" })).toBeVisible();
    await expect(page.getByText("Missing Mandatory Field").first()).toBeVisible();
    await expect(page.getByText(/Showing 1 to 8 of 38 issues/)).toBeVisible();
    await page.getByRole("button", { name: "2", exact: true }).first().click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByRole("heading", { name: "DGHR Data Quality & Validation" })).toBeVisible();
  });

  test("E3 quality bars incl. Overall Average", async ({ page }) => {
    await expect(page.getByText("Quality Score by Entity")).toBeVisible();
    await expect(page.getByText("Overall Average")).toBeVisible();
    await expect(page.getByText("Rules Summary")).toBeVisible();
  });

  test("E4 anomaly drawer + Generate AI Narrative", async ({ page }) => {
    await expect(page.getByText("AI-Detected Anomalies")).toBeVisible();
    await page.getByText("Headcount spike of +35% detected in short time period").click();
    await expect(page.getByText("AI-Detected Anomaly")).toBeVisible();
    await page.getByRole("button", { name: /Generate AI Narrative/ }).click();
    // Analyzing → narrative
    await expect(page.getByText("AI Narrative")).toBeVisible({ timeout: 12000 });
    await expect(page.getByText(/Recommended checks/)).toBeVisible();
  });

  test("E5 anomaly drawer Open Clarification toasts", async ({ page }) => {
    await resetDemo();
    await page.reload();
    await page.getByText("Headcount spike of +35% detected in short time period").click();
    await page.getByRole("button", { name: /Open Clarification/ }).click();
    await expectToast(page, /Clarification .* sent to/);
    await resetDemo();
  });

  test("E6 evidence overview tiles + top gaps", async ({ page }) => {
    await expect(page.getByText("Evidence Quality Overview")).toBeVisible();
    await expect(page.getByText("Acceptable Evidence", { exact: true })).toBeVisible();
    await expect(page.getByText("Top Evidence Gaps")).toBeVisible();
    await expect(page.getByText("Role Justification Documents")).toBeVisible();
  });
});
