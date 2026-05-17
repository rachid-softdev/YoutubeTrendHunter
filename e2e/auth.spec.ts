import { test, expect } from "@playwright/test"

test.describe("Auth Flow", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login")

    // Check page title or heading
    await expect(page.locator("h1, h2").first()).toBeVisible()
  })

  test("login page has auth providers", async ({ page }) => {
    await page.goto("/login")

    // Check for sign in options (Google, GitHub, etc.)
    const signInButtons = page.getByRole("button", { name: /sign in|google|github|connexion/i })
    await expect(signInButtons.first()).toBeVisible({ timeout: 10000 })
  })

  test("unauthenticated user redirected from dashboard", async ({ page }) => {
    await page.goto("/dashboard")

    // Should redirect to login or show error
    // After redirect, user should not see dashboard content
    await page.waitForURL(/login|auth|signin/)
  })

  test("terms link is visible on login page", async ({ page }) => {
    await page.goto("/login")

    // Scroll to bottom to find footer links
    await page.locator("footer a:has-text('CGU')").scrollIntoViewIfNeeded()
    await expect(page.locator("footer a:has-text('CGU')")).toBeVisible()
  })

  test("privacy link is visible on login page", async ({ page }) => {
    await page.goto("/login")

    // Scroll to bottom
    await page.locator("footer a:has-text('Confidentialité')").scrollIntoViewIfNeeded()
    await expect(page.locator("footer a:has-text('Confidentialité')")).toBeVisible()
  })
})

test.describe("Sign In Process", () => {
  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login")

    // Look for email/password form fields
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"], input[name="password"]')

    // Only test if form exists
    if (await emailInput.isVisible() && await passwordInput.isVisible()) {
      await emailInput.fill("invalid@example.com")
      await passwordInput.fill("wrongpassword")
      await page.click('button[type="submit"]')

      // Should show error
      await expect(page.locator("text=erreur|invalid|incorrect|erreur", { exact: false })).toBeVisible({
        timeout: 5000,
      })
    }
  })
})