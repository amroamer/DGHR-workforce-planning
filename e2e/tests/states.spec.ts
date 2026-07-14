import { test, expect } from "@playwright/test";
import { gotoAs, delayApi, failApi } from "./helpers";

test.describe("STATES · empty / loading / error", () => {
  // ---------- EMPTY ----------
  test("empty: DHA entity screens show clean EmptyStates", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dha");
    await expect(page.getByText("No workforce data imported yet")).toBeVisible();
    await gotoAs(page, "/entity/workload", "entity-dha");
    await expect(page.getByText("No workload data yet")).toBeVisible();
    await gotoAs(page, "/entity/org-structure", "entity-dha");
    await expect(page.getByText("No organization structure yet")).toBeVisible();
    await gotoAs(page, "/entity/demand-drivers", "entity-dha");
    await expect(page.getByText("No demand drivers yet")).toBeVisible();
  });

  test("empty: search with no matches shows an empty table gracefully", async ({ page }) => {
    await gotoAs(page, "/entity/workforce", "entity-dm");
    await page.getByPlaceholder(/Search job title/).fill("zzz-no-such-title-zzz");
    await expect(page.getByText(/Showing 1 to 0 of 0 records|Showing 0 to 0 of 0 records/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Current Workforce Data" })).toBeVisible();
  });

  test("empty: clarifications search miss shows no cards, no crash", async ({ page }) => {
    await gotoAs(page, "/dghr/clarifications");
    await page.getByPlaceholder("Search cases…").fill("zzznomatch999");
    await page.waitForTimeout(400);
    await expect(page.getByRole("heading", { name: "DGHR Clarifications & Resubmissions" })).toBeVisible();
  });

  // ---------- LOADING ----------
  test("loading: KPI skeletons appear while data is in flight", async ({ page }) => {
    await delayApi(page, 1500);
    // raw goto (NOT gotoAs) so we don't wait for network-idle past the skeleton phase
    await page.goto("/dghr/command-center?persona=dghr-admin", { waitUntil: "commit" });
    // pulsing skeleton placeholders visible before data resolves
    await expect(page.locator(".animate-pulse").first()).toBeVisible({ timeout: 3000 });
    // then real data arrives
    await expect(page.getByText(/27 of 59 entities/)).toBeVisible({ timeout: 8000 });
  });

  // ---------- ERROR ----------
  test("error: command-center API 500 → app stays up (no white screen)", async ({ page }) => {
    await failApi(page, "/api/dghr/command-center");
    await gotoAs(page, "/dghr/command-center");
    // header + sidebar still render; app doesn't crash to a blank page
    await expect(page.getByRole("heading", { name: "DGHR Data Collection Command Center" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Data Quality", exact: true })).toBeVisible();
    // and it must NOT invent numbers — the "27 of 59" only shows with real data
    await expect(page.getByText(/27 of 59 entities/)).toHaveCount(0);
  });

  test("error: tracker API 500 → heading + shell survive", async ({ page }) => {
    await failApi(page, "/api/dghr/tracker");
    await gotoAs(page, "/dghr/submissions");
    await expect(page.getByRole("heading", { name: "DGHR Entity Submission Tracker" })).toBeVisible();
  });
});
