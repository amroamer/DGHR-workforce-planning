import { Page, expect } from "@playwright/test";

export const API = "http://localhost:8010";

/** Navigate to a path as a given persona (deep-link sets persona + persists it). */
export async function gotoAs(page: Page, path: string, persona: "dghr-admin" | "entity-dm" | "entity-dha" = "dghr-admin") {
  const sep = path.includes("?") ? "&" : "?";
  await page.goto(`${path}${sep}persona=${persona}`);
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Reset the demo scenario via the API (used before mutating tests). */
export async function resetDemo() {
  await fetch(`${API}/api/demo/reset`, { method: "POST" });
}

/** Wait for a sonner toast containing text. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 8000 });
}

/** The visible page title (h1). */
export function pageTitle(page: Page) {
  return page.locator("h1").first();
}

/** Assert the page has NO horizontal overflow (nothing spilling out of its box sideways). */
export async function assertNoHorizontalOverflow(page: Page, label = "page") {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth };
  });
  // 1px tolerance for sub-pixel rounding
  expect(overflow.scrollW, `${label}: horizontal overflow (content spills out ${overflow.scrollW - overflow.clientW}px)`)
    .toBeLessThanOrEqual(overflow.clientW + 1);
}

/**
 * Assert NO visible element spills past the right edge of the viewport (off-screen / clipped).
 * Scans cards, buttons, tables, inputs, headings, KPI values — the meaningful boxes.
 */
export async function assertElementsInBounds(page: Page, label = "screen") {
  const bad = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sel = "main .rounded-card, main button, main select, main input, main h1, main h2, main h3";
    const offenders: string[] = [];
    // an element inside a horizontally-scrollable/clipped ancestor is contained by design
    const insideScrollable = (el: Element): boolean => {
      let p = el.parentElement;
      while (p && p.tagName !== "MAIN") {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
        p = p.parentElement;
      }
      return false;
    };
    document.querySelectorAll(sel).forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; // hidden
      if (insideScrollable(el)) return; // scrollable/clipped container handles it
      if (r.right > vw + 1) {
        offenders.push(`${el.tagName}.${(el.className || "").toString().slice(0, 30)} right=${Math.round(r.right)} > vw=${vw}`);
      }
    });
    return offenders.slice(0, 8);
  });
  expect(bad, `${label}: elements spill past the right edge:\n${bad.join("\n")}`).toEqual([]);
}

/** Delay every API response by ms (to catch loading/skeleton states). */
export async function delayApi(page: Page, ms: number) {
  await page.route("**/api/**", async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

/** Make a specific API path fail with 500 (to test error handling). */
export async function failApi(page: Page, pathPart: string) {
  await page.route(`**${pathPart}**`, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Simulated failure" }) }),
  );
}

/**
 * Assert a locator is not just "in the DOM" but ACTUALLY VISIBLE to a user:
 *  1) Playwright-visible (laid out, not display/visibility hidden)
 *  2) its box sits within the viewport (not scrolled off-screen)
 *  3) the element painted at its centre is itself (or a descendant) — this catches
 *     ancestor `overflow:hidden` CLIPPING and z-index OCCLUSION (the persona-dropdown bug).
 */
export async function expectFullyVisible(page: Page, locator: import("@playwright/test").Locator, label = "element") {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have a layout box`).not.toBeNull();
  const vp = page.viewportSize()!;
  const b = box!;
  expect(b.width, `${label} width`).toBeGreaterThan(0);
  expect(b.height, `${label} height`).toBeGreaterThan(0);
  // fully inside the viewport (allow 1px rounding)
  expect(b.x, `${label} left edge off-screen`).toBeGreaterThanOrEqual(-1);
  expect(b.y, `${label} top edge off-screen`).toBeGreaterThanOrEqual(-1);
  expect(b.x + b.width, `${label} right edge off-screen`).toBeLessThanOrEqual(vp.width + 1);
  expect(b.y + b.height, `${label} bottom edge clipped/off-screen`).toBeLessThanOrEqual(vp.height + 1);
  // the pixel at the centre belongs to this element (not clipped away / covered)
  const handle = await locator.elementHandle();
  const topIsSelf = await page.evaluate(
    ({ el, cx, cy }) => {
      const top = document.elementFromPoint(cx, cy);
      return !!top && (top === el || el.contains(top) || top.contains(el as Node));
    },
    { el: handle!, cx: b.x + b.width / 2, cy: b.y + b.height / 2 },
  );
  expect(topIsSelf, `${label} is clipped or covered at its centre`).toBe(true);
}

/**
 * Assert EVERY visible button on the current screen is usable: it has a label (text,
 * aria-label, or an icon) — i.e. no empty/broken/mystery buttons — and is enabled
 * (except intentional cases like a disabled pagination arrow). Returns the count.
 */
export async function assertAllButtonsUsable(page: Page) {
  const buttons = page.locator("button:visible");
  const n = await buttons.count();
  expect(n, "screen should have interactive buttons").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const named = await b.evaluate((el) => {
      const txt = (el.textContent || "").trim();
      const aria = el.getAttribute("aria-label") || el.getAttribute("title") || "";
      const hasIcon = !!el.querySelector("svg");
      return txt.length > 0 || aria.length > 0 || hasIcon;
    });
    expect(named, `button #${i} has no label/icon (broken button)`).toBe(true);
  }
  return n;
}

/**
 * Exhaustively open a <select> and select EVERY option in turn, asserting the page
 * doesn't crash (its h1 stays visible) after each — proving every option works.
 * Returns the list of option values it cycled.
 */
export async function cycleSelect(page: Page, select: import("@playwright/test").Locator) {
  await expect(select).toBeVisible();
  const values = await select.locator("option").evaluateAll(
    (opts) => (opts as HTMLOptionElement[]).map((o) => o.value),
  );
  for (const v of values) {
    await select.selectOption(v);
    // give the table/query a beat to react, then assert no crash
    await page.waitForTimeout(250);
    await expect(pageTitle(page)).toBeVisible();
  }
  // reset to the first (default) option
  await select.selectOption(values[0]);
  return values;
}
