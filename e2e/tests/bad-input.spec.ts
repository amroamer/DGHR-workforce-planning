import { test, expect } from "@playwright/test";
import path from "path";
import { gotoAs, expectToast, resetDemo } from "./helpers";

const BAD_TXT = path.join(__dirname, "../fixtures/not-a-spreadsheet.txt");
const WRONG_COLS = path.join(__dirname, "../fixtures/wrong-columns.csv");

test.describe("BAD INPUT · wrong files, empty & huge search handled gracefully", () => {
  test("upload a plain .txt to Workforce → friendly error, no crash", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.locator('input[type="file"]').setInputFiles(BAD_TXT);
    // an error toast appears (not a white screen), and the table still works
    await expectToast(page, /Could not read file|Missing required column|failed/i);
    await expect(page.getByRole("heading", { name: "Current Workforce Data" })).toBeVisible();
    await resetDemo();
  });

  test("upload a CSV with wrong columns → names the missing required columns", async ({ page }) => {
    await resetDemo();
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.locator('input[type="file"]').setInputFiles(WRONG_COLS);
    await expectToast(page, /Missing required column/i);
    await resetDemo();
  });

  test("very long search string → no crash, empty result", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.getByPlaceholder(/Search job title/).fill("x".repeat(500));
    await expect(page.getByText(/of 0 records/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Current Workforce Data" })).toBeVisible();
  });

  test("special characters in search → handled (no injection/crash)", async ({ page }) => {
    await gotoAs(page, "/dghr/clarifications");
    await page.getByPlaceholder("Search cases…").fill("' OR 1=1; <script>alert(1)</script>");
    await page.waitForTimeout(400);
    await expect(page.getByRole("heading", { name: "DGHR Clarifications & Resubmissions" })).toBeVisible();
  });
});
