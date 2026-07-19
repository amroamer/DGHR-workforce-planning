import { test, expect, type Page } from "@playwright/test";
import { gotoAs, resetDemo, API } from "./helpers";

// Pixel-diff baseline of the CURRENT app's screens. First run (with --update-snapshots) writes the
// baselines; later runs FAIL if a screen's rendered layout changes (spacing, clipping, overlap,
// colour…). The "Last updated: …" clock is masked; small relative-date shifts are absorbed by the
// config's maxDiffPixelRatio tolerance. Rewritten from the retired Layer-A screen list.

const STATIC: { path: string; persona: "dghr-admin" | "entity-dm"; name: string }[] = [
  { path: "/dghr/hc-overview", persona: "dghr-admin", name: "hc-overview" },
  { path: "/dghr/demand-analysis", persona: "dghr-admin", name: "demand-analysis" },
  { path: "/dghr/supply-analysis", persona: "dghr-admin", name: "supply-analysis" },
  { path: "/dghr/government", persona: "dghr-admin", name: "government" },
  { path: "/dghr/method", persona: "dghr-admin", name: "method" },
  { path: "/dghr/alerts", persona: "dghr-admin", name: "alerts-smart-flags" },
  { path: "/dghr/reports", persona: "dghr-admin", name: "gov-reports" },
  { path: "/dghr/admin", persona: "dghr-admin", name: "cycle-admin" },
  { path: "/dghr/cycles", persona: "dghr-admin", name: "cycle-history" },
  { path: "/dghr/knowledge", persona: "dghr-admin", name: "knowledge" },
  { path: "/entity/departments", persona: "entity-dm", name: "departments" },
  { path: "/entity/submissions", persona: "entity-dm", name: "my-submissions" },
  { path: "/entity/reports", persona: "entity-dm", name: "entity-reports" },
  { path: "/entity/documents", persona: "entity-dm", name: "documents" },
  { path: "/entity/calendar", persona: "entity-dm", name: "programme-wave" },
  { path: "/entity/help", persona: "entity-dm", name: "help" },
];

async function shot(page: Page, name: string) {
  await expect(page.locator("main")).toBeVisible();
  await page.waitForTimeout(1300); // charts/tables settle + KPI count-up tween (≤900ms) finishes
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: [page.getByText(/Last updated:/)] });
}

test.describe("SNAPSHOTS · per-screen visual baseline (current app)", () => {
  test.beforeAll(async () => { await resetDemo(); });

  for (const s of STATIC) {
    test(s.name, async ({ page }) => {
      await gotoAs(page, s.path, s.persona);
      await shot(page, s.name);
    });
  }

  // Dynamic screens: resolve a stable id from the deterministic seed, snapshot under a fixed name.
  test("entity-drilldown", async ({ page }) => {
    const j = await (await fetch(`${API}/api/planning/dghr/entities`)).json();
    const id = (j.entities.find((e: { received: number }) => e.received > 0) ?? j.entities[0]).entity_id;
    await gotoAs(page, `/dghr/gov-entity/${id}`, "dghr-admin");
    await shot(page, "entity-drilldown");
  });

  test("submission-review", async ({ page }) => {
    const j = await (await fetch(`${API}/api/planning/dghr/alerts`)).json();
    await gotoAs(page, `/dghr/gov-submission/${j.alerts[0].submission_id}`, "dghr-admin");
    await shot(page, "submission-review");
  });

  test("submission-form", async ({ page }) => {
    const j = await (await fetch(`${API}/api/planning/entities/3/submissions`)).json();
    const row = j.rows.find((r: { status: string }) => r.status === "draft") ?? j.rows[0];
    await gotoAs(page, `/entity/departments/${row.department_id}`, "entity-dm");
    await shot(page, "submission-form");
  });
});
