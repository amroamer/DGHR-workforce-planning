import { test, expect } from "@playwright/test";
import path from "path";
import { gotoAs, expectToast, resetDemo } from "./helpers";

const HR_XLSX = path.join(__dirname, "../../demo-assets/HR_Extract_Demo.xlsx");
const ORG_CSV = path.join(__dirname, "../fixtures/org.csv");
const WORKLOAD_CSV = path.join(__dirname, "../fixtures/workload.csv");
const EVIDENCE_PDF = path.join(__dirname, "../../demo-assets/evidence/AI Adoption Roadmap 2025.pdf");

// Real file uploads driven THROUGH the UI (setInputFiles on the actual dropzone inputs).
test.describe("SWEEP · every dropzone — real UI upload", () => {
  test("Workforce — drag/upload HR_Extract_Demo.xlsx → 95.1% auto-mapped", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.locator('input[type="file"]').setInputFiles(HR_XLSX);
    await expectToast(page, /Imported 1,248 records — 95\.1% auto-mapped/);
    // UI reflects the imported data
    await expect(page.getByText(/1,187 \(95\.1%\)/)).toBeVisible();
    await resetDemo();
  });

  test("Org Structure — upload org.csv → sections imported", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/entity/org-structure", "entity-dm");
    await page.locator('input[type="file"]').setInputFiles(ORG_CSV);
    await expectToast(page, /Imported \d+ sections/);
    await resetDemo();
  });

  test("Workload — upload workload.csv → volumes updated", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/entity/workload", "entity-dm");
    await page.locator('input[type="file"]').setInputFiles(WORKLOAD_CSV);
    await expectToast(page, /Updated \d+ section volumes/);
    await resetDemo();
  });

  test("Demand Drivers — upload an evidence PDF → stored", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/entity/demand-drivers", "entity-dm");
    // Evidence tab is the default; the file input lives there
    await page.locator('input[type="file"]').setInputFiles(EVIDENCE_PDF);
    await expectToast(page, /Uploaded AI Adoption Roadmap 2025\.pdf/);
    await resetDemo();
  });
});
