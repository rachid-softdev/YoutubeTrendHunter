import { test, expect } from "@playwright/test"

test.describe("Navigation Flow", () => {
  test("homepage loads correctly", async ({ page }) => {
    await page.goto("/")

    // Check main heading
    await expect(page.locator("h1")).toContainText("l'Algorithme")

    // Check navigation
    await expect(page.locator("text=TrendHunter")).toBeVisible()

    // Check CTA buttons
    await expect(page.getByRole("link", { name: /démarrer|essayer/i })).toBeVisible()
  })

  test("can navigate from homepage to features", async ({ page }) => {
    await page.goto("/")

    // Click on Fonctionnalités link in nav
    await page.click('nav a:has-text("Fonctionnalités")')

    // Should navigate to features page
    await expect(page).toHaveURL(/features/)
    await expect(page.locator("h1")).toContainText("créateur")
  })

  test("can navigate from homepage to pricing", async ({ page }) => {
    await page.goto("/")

    // Click on Tarifs link in nav
    await page.click('nav a:has-text("Tarifs")')

    // Should navigate to pricing page
    await expect(page).toHaveURL(/pricing/)
    await expect(page.locator("h1")).toContainText("Investissez")
  })

  test("full navigation flow: homepage -> features -> pricing", async ({ page }) => {
    await page.goto("/")

    // Homepage
    await expect(page.locator("h1")).toContainText("l'Algorithme")

    // Navigate to Features
    await page.click('nav a:has-text("Fonctionnalités")')
    await expect(page).toHaveURL(/features/)
    await expect(page.locator("h1")).toContainText("créateur")

    // Navigate to Pricing
    await page.click('nav a:has-text("Tarifs")')
    await expect(page).toHaveURL(/pricing/)
    await expect(page.locator("h1")).toContainText("Investissez")
  })

  test("footer links work", async ({ page }) => {
    await page.goto("/")

    // Scroll to footer
    await page.locator("footer").scrollIntoViewIfNeeded()

    // Check footer links
    await expect(page.locator('footer a:has-text("Tarifs")')).toBeVisible()
    await expect(page.locator('footer a:has-text("Confidentialité")')).toBeVisible()
    await expect(page.locator('footer a:has-text("CGU")')).toBeVisible()
  })

  test("click on CTA leads to login", async ({ page }) => {
    await page.goto("/")

    // Click the main CTA button
    await page.getByRole("link", { name: /démarrer l'analyse/i }).click()

    // Should redirect to login
    await expect(page).toHaveURL(/login/)
  })
})

test.describe("Pricing Page", () => {
  test("pricing page displays all three plans", async ({ page }) => {
    await page.goto("/pricing")

    // Check all three plan cards
    await expect(page.locator("text=Free")).toBeVisible()
    await expect(page.locator("text=Pro")).toBeVisible()
    await expect(page.locator("text=Team")).toBeVisible()
  })

  test("pricing page displays prices", async ({ page }) => {
    await page.goto("/pricing")

    // Check prices are displayed
    await expect(page.locator("text=0€")).toBeVisible()
    await expect(page.locator("text=15€")).toBeVisible()
    await expect(page.locator("text=39€")).toBeVisible()
  })

  test("popular plan is highlighted", async ({ page }) => {
    await page.goto("/pricing")

    // Pro plan should be marked as POPULAIRE
    await expect(page.locator("text=POPULAIRE")).toBeVisible()
  })

  test("clicking plan CTA goes to login", async ({ page }) => {
    await page.goto("/pricing")

    // Click on Passer Pro button
    await page.getByRole("link", { name: /passer pro/i }).click()

    // Should redirect to login with plan parameter
    await expect(page).toHaveURL(/login/)
  })
})

test.describe("Features Page", () => {
  test("features page shows feature grid", async ({ page }) => {
    await page.goto("/features")

    // Check features section exists
    await expect(page.locator("#features")).toBeVisible()

    // Check that features are displayed
    await expect(page.locator("text=Détection de Tendances")).toBeVisible()
    await expect(page.locator("text=Extension Chrome")).toBeVisible()
  })

  test("features page shows comparison table", async ({ page }) => {
    await page.goto("/features")

    // Check comparison table
    await expect(page.locator("table")).toBeVisible()
    await expect(page.locator("th:has-text('TrendHunter')")).toBeVisible()
  })

  test("start free button leads to login", async ({ page }) => {
    await page.goto("/features")

    // Click Start Free button
    await page.getByRole("link", { name: /commencer gratuit/i }).click()

    // Should redirect to login
    await expect(page).toHaveURL(/login/)
  })
})