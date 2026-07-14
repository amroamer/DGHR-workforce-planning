import { test, expect } from "@playwright/test";
import { gotoAs, expectToast, resetDemo } from "./helpers";

test.describe("C. Data Request Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAs(page, "/dghr/data-collection");
  });

  test("C1 cycle bar + 4 KPI cards render", async ({ page }) => {
    await expect(page.getByText("Current Collection Cycle")).toBeVisible();
    await expect(page.getByText("Workforce Planning Cycle 2025").first()).toBeVisible();
    await expect(page.getByText("● Active")).toBeVisible();
    await expect(page.getByText("Data Packages", { exact: true })).toBeVisible();
    await expect(page.getByText("Total Fields", { exact: true })).toBeVisible();
    await expect(page.getByText(/212 Mandatory · 174 Optional/)).toBeVisible();
    await expect(page.getByText("Section-Type Templates", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Submission Deadline")).toBeVisible();
  });

  test("C2 eight package rows render with status", async ({ page }) => {
    for (const p of ["1. Organization Structure", "2. Current Workforce", "8. Evidence & Documents"]) {
      await expect(page.getByText(p, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Configured").first()).toBeVisible();
  });

  test("C3 mandatory toggle flips and toasts", async ({ page }) => {
    await resetDemo();
    await page.reload();
    // toggles are the small pill buttons in the Mand/Opt column
    const toggle = page.locator("button.relative.h-5.w-9").first();
    await toggle.click();
    await expectToast(page, /mandatory fields/);
    await resetDemo();
  });

  test("C4 Expand All reveals field-group chips", async ({ page }) => {
    await page.getByRole("button", { name: /Expand All/ }).click();
    await expect(page.getByText(/Legal entity ·/)).toBeVisible();
  });

  test("C5 Preview Entity View switches to entity Home", async ({ page }) => {
    await page.getByRole("button", { name: /Preview Entity View/ }).click();
    await expect(page).toHaveURL(/\/entity\/home/);
    await expect(page.getByRole("heading", { name: "Entity Data Collection Home" })).toBeVisible();
  });

  test("C6 Publish Request Package toasts", async ({ page }) => {
    await page.getByRole("button", { name: /Publish Request Package/ }).click();
    await expectToast(page, /published/);
    await resetDemo();
  });

  test("C7 Section-Type Templates rail lists 7 active templates", async ({ page }) => {
    for (const t of ["Customer Service", "Inspection", "HR", "Finance", "IT", "Strategy", "Data & Digital"]) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Active").first()).toBeVisible();
  });
});
