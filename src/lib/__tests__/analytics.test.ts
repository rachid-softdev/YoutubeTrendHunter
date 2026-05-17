import { describe, it, expect, vi, beforeEach } from "vitest"
import { analytics, identifyUser, setUserProperties, resetUser } from "@/lib/analytics"

// Mock posthog-js
vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
    people: {
      set: vi.fn(),
    },
    reset: vi.fn(),
  },
}))

describe("analytics", () => {
  let posthog: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const module = await import("posthog-js")
    posthog = module.default
  })

  describe("user lifecycle", () => {
    it("tracks signup with method", () => {
      analytics.signedUp("google")
      expect(posthog.capture).toHaveBeenCalledWith("user_signed_up", { method: "google" })
    })

    it("tracks login with method", () => {
      analytics.loggedIn("google")
      expect(posthog.capture).toHaveBeenCalledWith("user_logged_in", { method: "google" })
    })

    it("tracks logout", () => {
      analytics.loggedOut()
      expect(posthog.capture).toHaveBeenCalledWith("user_logged_out")
    })

    it("tracks plan upgrade", () => {
      analytics.upgraded("FREE", "PRO", "homepage_cta")
      expect(posthog.capture).toHaveBeenCalledWith("plan_upgraded", {
        from: "FREE",
        to: "PRO",
        trigger: "homepage_cta",
      })
    })

    it("tracks plan downgrade", () => {
      analytics.downgraded("PRO", "FREE")
      expect(posthog.capture).toHaveBeenCalledWith("plan_downgraded", {
        from: "PRO",
        to: "FREE",
      })
    })

    it("tracks subscription cancellation", () => {
      analytics.canceled()
      expect(posthog.capture).toHaveBeenCalledWith("subscription_canceled")
    })
  })

  describe("onboarding", () => {
    it("tracks onboarding started", () => {
      analytics.onboardingStarted()
      expect(posthog.capture).toHaveBeenCalledWith("onboarding_started")
    })

    it("tracks onboarding step viewed", () => {
      analytics.onboardingStep("step_1")
      expect(posthog.capture).toHaveBeenCalledWith("onboarding_step_viewed", { step: "step_1" })
    })

    it("tracks onboarding completed with metrics", () => {
      analytics.onboardingCompleted(4, 5)
      expect(posthog.capture).toHaveBeenCalledWith("onboarding_completed", {
        steps_completed: 4,
        time_to_complete_minutes: 5,
      })
    })
  })

  describe("product events", () => {
    it("tracks trend viewed", () => {
      analytics.trendViewed("trend_123", "tech-ia", 85, "dashboard")
      expect(posthog.capture).toHaveBeenCalledWith("trend_viewed", {
        trend_id: "trend_123",
        niche: "tech-ia",
        score: 85,
        source: "dashboard",
      })
    })

    it("tracks trend alert created", () => {
      analytics.trendAlertCreated("SCORE_THRESHOLD", "tech-ia")
      expect(posthog.capture).toHaveBeenCalledWith("trend_alert_created", {
        type: "SCORE_THRESHOLD",
        niche: "tech-ia",
      })
    })

    it("tracks dashboard visited", () => {
      analytics.dashboardVisited("google", false)
      expect(posthog.capture).toHaveBeenCalledWith("dashboard_visited", {
        referrer: "google",
        first_visit: false,
      })
    })

    it("tracks extension installed", () => {
      analytics.extensionInstalled()
      expect(posthog.capture).toHaveBeenCalledWith("extension_installed")
    })
  })

  describe("content events", () => {
    it("tracks blog viewed", () => {
      analytics.blogViewed("how-to-trend-hunt", "tutorials")
      expect(posthog.capture).toHaveBeenCalledWith("blog_article_viewed", {
        slug: "how-to-trend-hunt",
        category: "tutorials",
      })
    })

    it("tracks blog completed", () => {
      analytics.blogCompleted("how-to-trend-hunt", 100)
      expect(posthog.capture).toHaveBeenCalledWith("blog_article_completed", {
        slug: "how-to-trend-hunt",
        read_progress_percent: 100,
      })
    })

    it("tracks pricing page viewed", () => {
      analytics.pricingViewed("homepage")
      expect(posthog.capture).toHaveBeenCalledWith("pricing_page_viewed", {
        referrer: "homepage",
      })
    })
  })

  describe("retention events", () => {
    it("tracks NPS survey submitted", () => {
      analytics.nps(9, "Great product!")
      expect(posthog.capture).toHaveBeenCalledWith("nps_survey_submitted", {
        score: 9,
        comment: "Great product!",
      })
    })
  })

  describe("API events", () => {
    it("tracks API token created", () => {
      analytics.apiTokenCreated("My API Key")
      expect(posthog.capture).toHaveBeenCalledWith("api_token_created", { name: "My API Key" })
    })

    it("tracks API rate limit hit", () => {
      analytics.apiRateLimitHit("/api/trends")
      expect(posthog.capture).toHaveBeenCalledWith("api_rate_limit_hit", {
        endpoint: "/api/trends",
      })
    })
  })

  describe("utility events", () => {
    it("tracks page viewed", () => {
      analytics.pageViewed("/dashboard")
      expect(posthog.capture).toHaveBeenCalledWith("page_viewed", { path: "/dashboard" })
    })

    it("tracks page viewed with props", () => {
      analytics.pageViewed("/dashboard", { tab: "trends" })
      expect(posthog.capture).toHaveBeenCalledWith("page_viewed", {
        path: "/dashboard",
        tab: "trends",
      })
    })

    it("tracks CTA clicked", () => {
      analytics.ctaClicked("upgrade_button", "/billing")
      expect(posthog.capture).toHaveBeenCalledWith("cta_clicked", {
        cta: "upgrade_button",
        destination: "/billing",
      })
    })
  })
})

describe("identifyUser", () => {
  it("identifies user with traits", async () => {
    const module = await import("posthog-js")
    const posthog = module.default
    identifyUser("user_123", { name: "John", email: "john@example.com" })
    expect(posthog.identify).toHaveBeenCalledWith("user_123", {
      name: "John",
      email: "john@example.com",
      $name: "John",
      $email: "john@example.com",
    })
  })
})

describe("setUserProperties", () => {
  it("sets user properties", async () => {
    const module = await import("posthog-js")
    const posthog = module.default
    setUserProperties({ plan: "PRO" })
    expect(posthog.people.set).toHaveBeenCalledWith({ plan: "PRO" })
  })
})

describe("resetUser", () => {
  it("resets user data", async () => {
    const module = await import("posthog-js")
    const posthog = module.default
    resetUser()
    expect(posthog.reset).toHaveBeenCalled()
  })
})