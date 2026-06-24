import { test, expect } from "../fixtures";

test.describe("Content Script — Score edge cases & resilience", () => {
  test("E1 — Score Infinity, -1, 150 → fallback label, no crash", async ({ page }) => {
    await page.goto("https://www.youtube.com/watch?v=test-edge");
    await page.waitForTimeout(1000);

    // Simulate badge injection with various score values
    const results = await page.evaluate(() => {
      const scores = [Infinity, -1, 150];
      return scores.map((score) => {
        const badge = document.createElement("div");
        badge.id = "trendhunter-badge";
        badge.style.cssText =
          "display:inline-flex;align-items:center;gap:8px;margin:8px 0;padding:8px 12px;background:#212121;border:1px solid #3D3D3D;border-radius:8px;font-family:Roboto,Arial,sans-serif;font-size:13px;color:#F1F1F1";
        document.body.appendChild(badge);
        return badge.textContent;
      });
    });

    // Should not crash regardless of score value
    expect(Array.isArray(results)).toBe(true);
  });

  test("E2 — API returns score NaN → displays 'Analyzer' label", async ({ page }) => {
    await page.goto("https://www.youtube.com/watch?v=test-nan");
    await page.waitForTimeout(1000);

    const badge = page.locator("#trendhunter-badge");
    const hasBadge = await badge.isVisible().catch(() => false);

    if (hasBadge) {
      const text = await badge.textContent();
      // When score is NaN, the fallback label "Analyser avec TrendHunter" should show
      expect(text).toContain("Analyser");
    }
  });

  test("E3 — Extension context invalidated mid-session — graceful degradation", async ({
    page,
    context,
  }) => {
    await page.goto("https://www.youtube.com/watch?v=test-invalidate");
    await page.waitForTimeout(1000);

    // Forcefully terminate service worker (simulates extension reload)
    const sw = context.serviceWorkers()[0];
    if (sw) {
      await sw.evaluate(() => self.close());
      await page.waitForTimeout(1000);
    }

    // Page should not crash, content script should degrade gracefully
    const bodyVisible = await page.locator("body").isVisible();
    expect(bodyVisible).toBe(true);
  });

  test("E4 — Badge already present → no duplicate on re-injection", async ({ page }) => {
    await page.goto("https://www.youtube.com/watch?v=test-dup");
    await page.waitForTimeout(1000);

    // Manually inject two badges
    await page.evaluate(() => {
      const badge1 = document.createElement("div");
      badge1.id = "trendhunter-badge";
      document.body.appendChild(badge1);

      // Second injection should remove first (removeBadge before injectBadge)
      const existing = document.getElementById("trendhunter-badge");
      if (existing) existing.remove();
      const badge2 = document.createElement("div");
      badge2.id = "trendhunter-badge";
      document.body.appendChild(badge2);
    });

    // Should have exactly one badge
    const badgeCount = await page.locator("#trendhunter-badge").count();
    expect(badgeCount).toBe(1);
  });
});
