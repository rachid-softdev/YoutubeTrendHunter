import posthog from "posthog-js";

export const analytics = {
  // User lifecycle
  signedUp: (method: "google") => posthog.capture("user_signed_up", { method }),
  loggedIn: (method: "google") => posthog.capture("user_logged_in", { method }),
  loggedOut: () => posthog.capture("user_logged_out"),
  upgraded: (from: string, to: string, trigger: string) =>
    posthog.capture("plan_upgraded", { from, to, trigger }),
  downgraded: (from: string, to: string) => posthog.capture("plan_downgraded", { from, to }),
  canceled: () => posthog.capture("subscription_canceled"),

  // Onboarding
  onboardingStarted: () => posthog.capture("onboarding_started"),
  onboardingStep: (step: string) => posthog.capture("onboarding_step_viewed", { step }),
  onboardingCompleted: (steps: number, minutes: number) =>
    posthog.capture("onboarding_completed", {
      steps_completed: steps,
      time_to_complete_minutes: minutes,
    }),

  // Product
  trendViewed: (id: string, niche: string, score: number, source: string) =>
    posthog.capture("trend_viewed", { trend_id: id, niche, score, source }),
  trendAlertCreated: (type: string, niche: string) =>
    posthog.capture("trend_alert_created", { type, niche }),
  dashboardVisited: (referrer: string, firstVisit: boolean) =>
    posthog.capture("dashboard_visited", { referrer, first_visit: firstVisit }),
  extensionInstalled: () => posthog.capture("extension_installed"),

  // Content
  blogViewed: (slug: string, category: string) =>
    posthog.capture("blog_article_viewed", { slug, category }),
  blogCompleted: (slug: string, progress: number) =>
    posthog.capture("blog_article_completed", { slug, read_progress_percent: progress }),
  pricingViewed: (referrer: string) => posthog.capture("pricing_page_viewed", { referrer }),

  // Retention
  nps: (score: number, comment: string) =>
    posthog.capture("nps_survey_submitted", { score, comment }),

  // API
  apiTokenCreated: (name: string) => posthog.capture("api_token_created", { name }),
  apiRateLimitHit: (endpoint: string) => posthog.capture("api_rate_limit_hit", { endpoint }),

  // Utility
  pageViewed: (path: string, props?: Record<string, unknown>) =>
    posthog.capture("page_viewed", { path, ...props }),
  ctaClicked: (cta: string, destination: string) =>
    posthog.capture("cta_clicked", { cta, destination }),
};

export function identifyUser(userId: string, traits: Record<string, unknown>) {
  posthog.identify(userId, { ...traits, $name: traits.name, $email: traits.email });
}

export function setUserProperties(props: Record<string, unknown>) {
  posthog.people.set(props);
}

export function resetUser() {
  posthog.reset();
}
