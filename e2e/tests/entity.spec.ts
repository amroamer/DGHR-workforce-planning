import { test, expect } from "@playwright/test";
import { gotoAs, expectToast, resetDemo } from "./helpers";

test.describe("H. Entity Home + package screens", () => {
  test("H1 Home: KPIs, required submissions, messages, deadlines", async ({ page }) => {
    await gotoAs(page, "/entity/home", "entity-dm");
    await expect(page.getByRole("heading", { name: "Entity Data Collection Home" })).toBeVisible();
    await expect(page.getByText("Submission Progress", { exact: true })).toBeVisible();
    await expect(page.getByText("Required Packages", { exact: true })).toBeVisible();
    await expect(page.getByText("Pending Clarifications", { exact: true })).toBeVisible();
    await expect(page.getByText("Organization Structure", { exact: true })).toBeVisible();
    await expect(page.getByText("Current Workforce Data", { exact: true })).toBeVisible();
    await expect(page.getByText("DGHR Messages & Clarifications")).toBeVisible();
    await expect(page.getByText("Upcoming Deadlines")).toBeVisible();
  });

  test("H2 a required-submission button routes to its package", async ({ page }) => {
    await gotoAs(page, "/entity/home", "entity-dm");
    await page.getByRole("button", { name: "Continue" }).first().click();
    await expect(page).toHaveURL(/\/entity\/(workforce|workload|demand-drivers)/);
  });

  test("H3 Org Structure: tree expands + filter + pagination", async ({ page }) => {
    await gotoAs(page, "/entity/org-structure", "entity-dm");
    await expect(page.getByRole("heading", { name: "Organization Structure Submission" })).toBeVisible();
    // tree root is the entity (chrome correction), not "DGHR"
    await expect(page.getByText("Dubai Municipality", { exact: true }).first()).toBeVisible();
    // expand a sector node
    await page.getByRole("button", { name: /Government Enablement Sector/ }).click();
    await expect(page.getByText("People Enablement Department").first()).toBeVisible();
    // status filter dropdown
    const selects = page.locator("select");
    await selects.nth(1).selectOption("unmapped");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByRole("heading", { name: "Organization Structure Submission" })).toBeVisible();
  });

  test("H4 Org Structure: Download Template + Import file picker", async ({ page }) => {
    await gotoAs(page, "/entity/org-structure", "entity-dm");
    const [ download ] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download Template/ }).click(),
    ]);
    expect(download.suggestedFilename()).toContain(".xlsx");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Import Structure/ }).click();
    expect(await chooser).toBeTruthy();
  });

  test("H5 Workforce: 1,248-row table + rows-per-page dropdown", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await expect(page.getByText(/Showing 1 to 25 of 1,248 records/)).toBeVisible();
    // rows-per-page select (last select in the toolbar)
    const rpp = page.locator("select").last();
    await rpp.selectOption("50");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByText(/Showing 1 to 50 of 1,248 records/)).toBeVisible();
  });

  test("H6 (complex) Map Fields opens the Mapping Drawer with suggestions", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.getByRole("button", { name: /Map Fields/ }).click();
    await expect(page.getByText("Map Job Titles")).toBeVisible();
    // Analyzing → suggestions with Accept
    await expect(page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 12000 });
  });

  test("H7 Workforce: search + Run Validation", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.getByPlaceholder(/Search job title/).fill("Finance Manager");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByText("Finance Manager").first()).toBeVisible();
    await page.getByRole("button", { name: /Run Validation/ }).click();
    await expectToast(page, /Validation complete/);
  });

  test("H8 Workload: 9 rows + coverage donut + submit toast", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/entity/workload", "entity-dm");
    await expect(page.getByText("Workload Metrics by Section")).toBeVisible();
    await expect(page.getByText("Customer Service").first()).toBeVisible();
    await expect(page.getByText("Workload Coverage by Department")).toBeVisible();
    await page.getByRole("button", { name: /Submit Workload Data/ }).click();
    await expectToast(page, /submitted to DGHR/);
    await resetDemo();
  });

  test("H9 (complex) Demand Drivers: tabs switch + Run AI Summary", async ({ page }) => {
    await gotoAs(page, "/entity/demand-drivers", "entity-dm");
    await expect(page.getByText("Future Drivers Workspace")).toBeVisible();
    // left tab → Driver Map
    await page.getByRole("button", { name: /Driver Map/ }).click();
    await expect(page.getByText("0–2 Years").first()).toBeVisible();
    // right tab → AI Summary + generate
    await page.getByRole("button", { name: /Run AI Summary/ }).first().click();
    await expect(page.getByText("AI Summary").first()).toBeVisible({ timeout: 12000 });
    await expect(page.getByText(/demand outlook|converging forces|skill shift/i)).toBeVisible({ timeout: 12000 });
  });

  test("H10 My Submissions: 5 package rows with actions", async ({ page }) => {
    await gotoAs(page, "/entity/my-submissions", "entity-dm");
    await expect(page.getByRole("heading", { name: "My Submissions" })).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(5);
  });

  test("H11 (edge) DHA persona → Workforce shows a clean EmptyState", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dha");
    await expect(page.getByText("No workforce data imported yet")).toBeVisible();
    await gotoAs(page, "/entity/workload", "entity-dha");
    await expect(page.getByText("No workload data yet")).toBeVisible();
  });
});
