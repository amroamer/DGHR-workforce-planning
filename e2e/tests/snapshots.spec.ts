import { test, expect } from "@playwright/test";
import { gotoAs, resetDemo } from "./helpers";

// Pixel-diff baseline of every screen + key overlays. First run writes the baselines;
// later runs FAIL if the rendered layout changes (spacing, clipping, overlap, colour…).
// Dynamic bits (the "Last updated: …" time) are masked to avoid false diffs.

const SCREENS: { path: string; persona: "dghr-admin" | "entity-dm" | "entity-dha"; name: string }[] = [
  { path: "/dghr/command-center", persona: "dghr-admin", name: "cc" },
  { path: "/dghr/data-collection", persona: "dghr-admin", name: "data-collection" },
  { path: "/dghr/submissions", persona: "dghr-admin", name: "tracker" },
  { path: "/dghr/data-quality", persona: "dghr-admin", name: "data-quality" },
  { path: "/dghr/forecasting-readiness", persona: "dghr-admin", name: "readiness" },
  { path: "/dghr/clarifications", persona: "dghr-admin", name: "clarifications-dghr" },
  { path: "/entity/home", persona: "entity-dm", name: "entity-home" },
  { path: "/entity/my-submissions", persona: "entity-dm", name: "my-submissions" },
  { path: "/entity/org-structure", persona: "entity-dm", name: "org-structure" },
  { path: "/entity/workforce", persona: "entity-dm", name: "workforce" },
  { path: "/entity/workload", persona: "entity-dm", name: "workload" },
  { path: "/entity/demand-drivers", persona: "entity-dm", name: "demand-drivers" },
  { path: "/entity/clarifications", persona: "entity-dm", name: "clarifications-entity" },
  { path: "/entity/workforce", persona: "entity-dha", name: "workforce-empty" },
];

test.describe("SNAPSHOTS · per-screen visual baseline", () => {
  test.beforeAll(async () => { await resetDemo(); });

  for (const s of SCREENS) {
    test(`${s.name}`, async ({ page }) => {
      await gotoAs(page, s.path, s.persona);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForTimeout(700); // charts/tables settle
      const mask = [page.getByText(/Last updated:/)];
      await expect(page).toHaveScreenshot(`${s.name}.png`, { fullPage: true, mask });
    });
  }
});
