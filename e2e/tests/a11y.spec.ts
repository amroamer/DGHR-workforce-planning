import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoAs, resetDemo } from "./helpers";

// Track-B category 13 — screen-reader labels: every control must have an accessible name.
// (color-contrast is now gated in contrast.spec.ts — the muted-text token was darkened to
//  pass AA; only the mockup semantic status palette remains, pinned by that spec's allow-list.)
const NAME_RULES = ["button-name", "select-name", "label", "link-name", "aria-required-attr", "aria-valid-attr-value", "aria-allowed-attr"];

const SCREENS: [string, "dghr-admin" | "entity-dm"][] = [
  ["/dghr/government", "dghr-admin"],
  ["/dghr/alerts", "dghr-admin"],
  ["/dghr/reports", "dghr-admin"],
  ["/dghr/admin", "dghr-admin"],
  ["/dghr/method", "dghr-admin"],
  ["/dghr/knowledge", "dghr-admin"],
  ["/entity/departments", "entity-dm"],
  ["/entity/submissions", "entity-dm"],
  ["/entity/reports", "entity-dm"],
  ["/entity/calendar", "entity-dm"],
  ["/entity/help", "entity-dm"],
];

test.describe("A11Y · every control has an accessible name", () => {
  test.beforeAll(async () => { await resetDemo(); });
  for (const [path, persona] of SCREENS) {
    test(`labels: ${path}`, async ({ page }) => {
      await gotoAs(page, path, persona);
      await page.waitForTimeout(700);
      const r = await new AxeBuilder({ page }).withRules(NAME_RULES).analyze();
      const detail = r.violations.map((v) => `${v.id} × ${v.nodes.length}`).join("; ");
      expect(r.violations, `${path} unnamed controls: ${detail}`).toEqual([]);
    });
  }
});
