import { test, expect } from "@playwright/test";
import { gotoAs, pageTitle } from "./helpers";

// Light/dark theme toggle (SPEC §4.2). Light is the default and must be untouched;
// dark swaps the CSS-variable palette via a `data-theme` attribute on <html>, persists
// the choice, and survives reload without a flash (the inline guard in index.html).

const themeOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const headerVar = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--header-bg").trim());
const bodyBg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("THEME · light/dark toggle", () => {
  test("defaults to light, toggles to dark, and persists across reload", async ({ page }) => {
    // A fresh Playwright context starts with empty localStorage → default light.
    await gotoAs(page, "/dghr/government", "dghr-admin");
    await expect(pageTitle(page)).toBeVisible();
    expect(await themeOf(page)).toBe("light");
    // light header now carries a subtle white→lavender gradient (§6.2 — never a plain bar)
    expect(await headerVar(page)).toContain("gradient");

    // toggle → dark
    await page.click('[aria-label="Switch to dark theme"]');
    expect(await themeOf(page)).toBe("dark");
    expect(await page.evaluate(() => localStorage.getItem("dghr.theme"))).toBe("dark");
    // dark header carries the purple→magenta gradient
    expect(await headerVar(page)).toContain("gradient");
    // dark page background is applied
    expect(await bodyBg(page)).toBe("rgb(10, 17, 34)");
    // the toggle now offers the way back to light
    await expect(page.locator('[aria-label="Switch to light theme"]')).toBeVisible();

    // reload → still dark, and set BEFORE React paints (FOUC guard)
    await page.reload({ waitUntil: "commit" });
    expect(await themeOf(page)).toBe("dark");
  });

  test("dark theme applies on the entity portal too", async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem("dghr.theme", "dark"); } catch {} });
    await gotoAs(page, "/entity/departments", "entity-dm");
    await expect(pageTitle(page)).toBeVisible();
    expect(await themeOf(page)).toBe("dark");
    expect(await bodyBg(page)).toBe("rgb(10, 17, 34)");
    expect(await headerVar(page)).toContain("gradient");
  });
});
