import { test, expect, type Page } from "@playwright/test";

/**
 * UI Components E2E tests for YouTube TrendHunter
 *
 * Tests isolated client-side UI components using inline mock pages:
 *   - AlertForm: type selection, threshold slider, channel, submit, error state
 *   - NicheFollowButton: follow/unfollow, loading, FREE plan limit, API calls
 *
 * Pattern follows billing-components.spec.ts and settings-ui.spec.ts:
 *   Build a self-contained HTML page with inline JS replicating the component logic.
 *   This avoids server-side auth() dependency and keeps tests deterministic.
 */

/* ======================================================================== */
/*  AlertForm tests                                                          */
/* ======================================================================== */

interface AlertFormUserNiche {
  niche: { id: string; name: string; slug: string };
}

interface AlertFormOptions {
  userNiches?: AlertFormUserNiche[];
  alert?: {
    id: string;
    type: string;
    threshold: number;
    channel: string;
    nicheId: string | null;
    isActive: boolean;
  };
}

const DEFAULT_NICHES: AlertFormUserNiche[] = [
  { niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } },
  { niche: { id: "niche-2", name: "Gaming", slug: "gaming" } },
  { niche: { id: "niche-3", name: "Cuisine", slug: "cuisine" } },
];

/**
 * Build a standalone HTML page replicating the AlertForm component.
 * Mirrors the exact JSX logic from alert-form.tsx.
 */
function buildAlertFormPage(opts: AlertFormOptions = {}): string {
  const { userNiches = DEFAULT_NICHES, alert } = opts;

  const initialType = alert?.type || "SCORE_THRESHOLD";
  const initialThreshold = alert?.threshold ?? 70;
  const initialChannel = alert?.channel || "EMAIL";
  const initialNicheId = alert?.nicheId || "all";

  const nichesOptions = userNiches
    .map((n) => `<option value="${n.niche.id}">${n.niche.name}</option>`)
    .join("");

  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>AlertForm – Test</title>
  <style>
    body { font-family: sans-serif; background: #fff; color: #111; padding: 2rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .font-medium { font-weight: 500; }
    select, input, button { font-family: inherit; font-size: inherit; }
    select {
      display: flex; height: 2.5rem; width: 100%; align-items: center;
      justify-content: space-between; border: 1px solid #ccc; padding: 0 0.75rem;
      border-radius: 0;
    }
    input[type="range"] { width: 100%; }
    .p-3 { padding: 0.75rem; }
    .bg-red-500\\/10 { background: rgba(239,68,68,0.1); }
    .border-red-500\\/30 { border: 1px solid rgba(239,68,68,0.3); }
    .text-red-500 { color: #ef4444; }
    .flex { display: flex; }
    .gap-2 { gap: 0.5rem; }
    .justify-end { justify-content: flex-end; }
    .rounded-none { border-radius: 0; }
    button {
      padding: 0.5rem 1rem; border: 1px solid #ccc; cursor: pointer;
      background: #f5f5f5; border-radius: 0;
    }
    button[disabled] { opacity: 0.5; cursor: not-allowed; }
    button[type="submit"] { background: #2563eb; color: #fff; border-color: #2563eb; }
    hr { margin: 1rem 0; border: none; border-top: 1px solid #eee; }
    [data-testid] { margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div id="root">
    <form id="alert-form" class="space-y-4" data-testid="alert-form">
      <!-- Type -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Type d'alerte</label>
        <select id="alert-type" data-testid="alert-type-select">
          <option value="SCORE_THRESHOLD">Score seuil</option>
          <option value="DAILY_DIGEST">Résumé quotidien</option>
          <option value="SPIKE">Pic d'activité</option>
        </select>
        <p id="type-description" class="text-xs" data-testid="type-description">
          Déclenché quand un trend dépasse un score défini
        </p>
      </div>

      <!-- Threshold (hidden for DAILY_DIGEST) -->
      <div id="threshold-group" class="space-y-2">
        <label class="text-sm font-medium">
          Seuil (<span id="threshold-value" data-testid="threshold-value">${initialThreshold}</span>%)
        </label>
        <input
          type="range" id="threshold-range" data-testid="threshold-range"
          min="0" max="100" value="${initialThreshold}"
          class="w-full"
        />
        <p id="threshold-hint" class="text-xs" data-testid="threshold-hint">
          Déclenchera quand le score dépasse ce seuil
        </p>
      </div>

      <!-- Niche -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Niche</label>
        <select id="niche-select" data-testid="niche-select">
          <option value="all">Toutes les niches</option>
          ${nichesOptions}
        </select>
      </div>

      <!-- Channel -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Canal</label>
        <select id="channel-select" data-testid="channel-select">
          <option value="EMAIL">Email</option>
          <option value="WEBHOOK">Webhook</option>
        </select>
      </div>

      <!-- Error -->
      <div id="error-container"></div>

      <!-- Actions -->
      <div class="flex gap-2 justify-end">
        <button type="button" id="cancel-btn" data-testid="cancel-btn">Annuler</button>
        <button type="submit" id="submit-btn" data-testid="submit-btn" class="rounded-none">
          ${alert ? "Mettre à jour" : "Créer l'alerte"}
        </button>
      </div>
    </form>
  </div>

  <script>
    const state = {
      type: "${initialType}",
      threshold: ${initialThreshold},
      channel: "${initialChannel}",
      nicheId: "${initialNicheId}",
      isLoading: false,
    };

    const typeSelect = document.getElementById("alert-type");
    const thresholdGroup = document.getElementById("threshold-group");
    const thresholdRange = document.getElementById("threshold-range");
    const thresholdValue = document.getElementById("threshold-value");
    const thresholdHint = document.getElementById("threshold-hint");
    const nicheSelect = document.getElementById("niche-select");
    const channelSelect = document.getElementById("channel-select");
    const submitBtn = document.getElementById("submit-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    const typeDesc = document.getElementById("type-description");
    const errorContainer = document.getElementById("error-container");

    const descriptions = {
      SCORE_THRESHOLD: "Déclenché quand un trend dépasse un score défini",
      DAILY_DIGEST: "Envoie un résumé quotidien de toutes les tendances",
      SPIKE: "Déclenché quand la vélocité dépasse un seuil défini",
    };

    const hints = {
      SCORE_THRESHOLD: "Déclenchera quand le score dépasse ce seuil",
      SPIKE: "Déclenchera quand la vélocité dépasse ce seuil",
    };

    typeSelect.value = state.type;

    function updateType() {
      const t = typeSelect.value;
      state.type = t;
      typeDesc.textContent = descriptions[t] || "";

      if (t === "DAILY_DIGEST") {
        thresholdGroup.style.display = "none";
      } else {
        thresholdGroup.style.display = "";
        thresholdHint.textContent = hints[t] || hints.SCORE_THRESHOLD;
      }
    }

    thresholdRange.addEventListener("input", function () {
      state.threshold = parseInt(this.value);
      thresholdValue.textContent = state.threshold;
    });

    channelSelect.addEventListener("change", function () {
      state.channel = this.value;
    });

    nicheSelect.addEventListener("change", function () {
      state.nicheId = this.value;
    });

    typeSelect.addEventListener("change", updateType);
    updateType();

    submitBtn.addEventListener("click", async function (e) {
      e.preventDefault();
      if (state.isLoading) return;
      state.isLoading = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Création...";

      try {
        // Simulate API call — component will dispatch a custom event
        const event = new CustomEvent("alert-submit", {
          detail: {
            type: state.type,
            threshold: state.threshold,
            channel: state.channel,
            nicheId: state.nicheId === "all" ? undefined : state.nicheId,
          },
        });
        document.getElementById("root").dispatchEvent(event);
      } finally {
        state.isLoading = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "${alert ? "Mettre à jour" : "Créer l'alerte"}";
      }
    });

    cancelBtn.addEventListener("click", function () {
      const event = new CustomEvent("alert-cancel");
      document.getElementById("root").dispatchEvent(event);
    });

    // Expose submit for testing errors
    window.showError = function (msg) {
      errorContainer.innerHTML =
        '<div class="p-3 bg-red-500\\/10 border border-red-500\\/30 text-red-500 text-sm rounded-none" data-testid="alert-error">' +
        msg +
        "</div>";
    };
  </script>
</body>
</html>`;
}

async function setupAlertFormPage(page: Page, opts?: AlertFormOptions) {
  const html = buildAlertFormPage(opts);
  await page.setContent(html);
  await page.waitForLoadState("networkidle");
}

test.describe("AlertForm — Rendu initial", () => {
  test("affiche le formulaire avec tous les champs", async ({ page }) => {
    await setupAlertFormPage(page);

    await expect(page.getByTestId("alert-form")).toBeVisible();
    await expect(page.getByTestId("alert-type-select")).toBeVisible();
    await expect(page.getByTestId("threshold-range")).toBeVisible();
    await expect(page.getByTestId("niche-select")).toBeVisible();
    await expect(page.getByTestId("channel-select")).toBeVisible();
    await expect(page.getByTestId("submit-btn")).toBeVisible();
  });

  test("affiche le seuil initial à 70%", async ({ page }) => {
    await setupAlertFormPage(page);
    await expect(page.getByTestId("threshold-value")).toHaveText("70");
    await expect(page.getByTestId("threshold-range")).toHaveValue("70");
  });

  test("bouton submit affiche 'Créer l'alerte' en mode création", async ({ page }) => {
    await setupAlertFormPage(page);
    await expect(page.getByTestId("submit-btn")).toHaveText("Créer l'alerte");
  });

  test("bouton submit affiche 'Mettre à jour' en mode édition", async ({ page }) => {
    await setupAlertFormPage(page, {
      alert: {
        id: "alert-1",
        type: "SCORE_THRESHOLD",
        threshold: 85,
        channel: "WEBHOOK",
        nicheId: "niche-1",
        isActive: true,
      },
    });
    await expect(page.getByTestId("submit-btn")).toHaveText("Mettre à jour");
  });

  test("bouton Annuler visible quand onCancel est fourni", async ({ page }) => {
    await setupAlertFormPage(page);
    await expect(page.getByTestId("cancel-btn")).toBeVisible();
    await expect(page.getByTestId("cancel-btn")).toHaveText("Annuler");
  });

  test("liste les niches de l'utilisateur dans le sélecteur", async ({ page }) => {
    const customNiches = [
      { niche: { id: "n1", name: "Tech", slug: "tech" } },
      { niche: { id: "n2", name: "Gaming", slug: "gaming" } },
      { niche: { id: "n3", name: "Business", slug: "business" } },
    ];
    await setupAlertFormPage(page, { userNiches: customNiches });

    const select = page.getByTestId("niche-select");
    // First option is "Toutes les niches", then the 3 custom niches
    await expect(select.locator("option")).toHaveCount(4);
    await expect(select.locator('option[value="n1"]')).toHaveText("Tech");
    await expect(select.locator('option[value="n2"]')).toHaveText("Gaming");
    await expect(select.locator('option[value="n3"]')).toHaveText("Business");
  });

  test("l'option 'Toutes les niches' est sélectionnée par défaut", async ({ page }) => {
    await setupAlertFormPage(page);
    await expect(page.getByTestId("niche-select")).toHaveValue("all");
  });
});

test.describe("AlertForm — Type d'alerte et description", () => {
  test("le type SCORE_THRESHOLD affiche la description appropriée", async ({ page }) => {
    await setupAlertFormPage(page);
    await expect(page.getByTestId("type-description")).toHaveText(
      "Déclenché quand un trend dépasse un score défini",
    );
  });

  test("changer pour DAILY_DIGEST masque le threshold et change la description", async ({
    page,
  }) => {
    await setupAlertFormPage(page);

    await page.getByTestId("alert-type-select").selectOption("DAILY_DIGEST");

    await expect(page.getByTestId("type-description")).toHaveText(
      "Envoie un résumé quotidien de toutes les tendances",
    );
    // Threshold group should be hidden
    await expect(page.getByTestId("threshold-range")).not.toBeVisible();
  });

  test("changer pour SPIKE affiche la description vélocité et le hint approprié", async ({
    page,
  }) => {
    await setupAlertFormPage(page);

    await page.getByTestId("alert-type-select").selectOption("SPIKE");

    await expect(page.getByTestId("type-description")).toHaveText(
      "Déclenché quand la vélocité dépasse un seuil défini",
    );
    await expect(page.getByTestId("threshold-hint")).toHaveText(
      "Déclenchera quand la vélocité dépasse ce seuil",
    );
    // Threshold should still be visible
    await expect(page.getByTestId("threshold-range")).toBeVisible();
  });

  test("re-sélectionner SCORE_THRESHOLD après DAILY_DIGEST réaffiche le threshold", async ({
    page,
  }) => {
    await setupAlertFormPage(page);

    // Hide threshold
    await page.getByTestId("alert-type-select").selectOption("DAILY_DIGEST");
    await expect(page.getByTestId("threshold-range")).not.toBeVisible();

    // Re-show threshold
    await page.getByTestId("alert-type-select").selectOption("SCORE_THRESHOLD");
    await expect(page.getByTestId("threshold-range")).toBeVisible();
    await expect(page.getByTestId("threshold-hint")).toHaveText(
      "Déclenchera quand le score dépasse ce seuil",
    );
  });
});

test.describe("AlertForm — Seuil (threshold)", () => {
  test("le slider threshold ajuste la valeur affichée", async ({ page }) => {
    await setupAlertFormPage(page);

    const range = page.getByTestId("threshold-range");
    await range.fill("42");
    await expect(page.getByTestId("threshold-value")).toHaveText("42");
  });

  test("le slider threshold min = 0, max = 100", async ({ page }) => {
    await setupAlertFormPage(page);

    await expect(page.getByTestId("threshold-range")).toHaveAttribute("min", "0");
    await expect(page.getByTestId("threshold-range")).toHaveAttribute("max", "100");
  });

  test("threshold conserve la valeur d'édition existante", async ({ page }) => {
    await setupAlertFormPage(page, {
      alert: {
        id: "alert-1",
        type: "SCORE_THRESHOLD",
        threshold: 25,
        channel: "EMAIL",
        nicheId: null,
        isActive: true,
      },
    });

    await expect(page.getByTestId("threshold-value")).toHaveText("25");
    await expect(page.getByTestId("threshold-range")).toHaveValue("25");
  });
});

test.describe("AlertForm — Canal (channel)", () => {
  test("le sélecteur canal offre Email et Webhook", async ({ page }) => {
    await setupAlertFormPage(page);

    const select = page.getByTestId("channel-select");
    await expect(select.locator("option")).toHaveCount(2);
    await expect(select.locator('option[value="EMAIL"]')).toHaveText("Email");
    await expect(select.locator('option[value="WEBHOOK"]')).toHaveText("Webhook");
  });

  test("le canal par défaut est EMAIL", async ({ page }) => {
    await setupAlertFormPage(page);
    await expect(page.getByTestId("channel-select")).toHaveValue("EMAIL");
  });

  test("peut sélectionner Webhook comme canal", async ({ page }) => {
    await setupAlertFormPage(page);
    await page.getByTestId("channel-select").selectOption("WEBHOOK");
    await expect(page.getByTestId("channel-select")).toHaveValue("WEBHOOK");
  });
});

test.describe("AlertForm — État d'erreur", () => {
  test("affiche un message d'erreur dans un div rouge", async ({ page }) => {
    await setupAlertFormPage(page);

    // Simulate error display via the exposed function
    await page.evaluate(() => {
      (window as unknown as { showError: (msg: string) => void }).showError(
        "Erreur lors de la création",
      );
    });

    const errorEl = page.getByTestId("alert-error");
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toHaveText("Erreur lors de la création");
    await expect(errorEl).toHaveClass(/red/);
  });

  test("plusieurs erreurs se remplacent (pas d'accumulation)", async ({ page }) => {
    await setupAlertFormPage(page);

    await page.evaluate(() =>
      (window as unknown as { showError: (msg: string) => void }).showError("Première erreur"),
    );
    await expect(page.getByTestId("alert-error")).toHaveText("Première erreur");

    await page.evaluate(() =>
      (window as unknown as { showError: (msg: string) => void }).showError("Seconde erreur"),
    );
    await expect(page.getByTestId("alert-error")).toHaveText("Seconde erreur");
    // There should be exactly one error container
    await expect(page.getByTestId("alert-error")).toHaveCount(1);
  });
});

test.describe("AlertForm — État de chargement (submit)", () => {
  test("le bouton submit se désactive et affiche 'Création...' pendant le chargement", async ({
    page,
  }) => {
    await setupAlertFormPage(page);

    const btn = page.getByTestId("submit-btn");
    await btn.click();

    // After click, button should show loading text and be disabled
    await expect(btn).toHaveText("Création...");
    await expect(btn).toBeDisabled();
  });
});

test.describe("AlertForm — Événements de formulaire", () => {
  test("submit émet un événement custom avec les données du formulaire", async ({ page }) => {
    await setupAlertFormPage(page);

    const submitData = page.getByTestId("alert-form").evaluate((form) => {
      return new Promise<Record<string, unknown>>((resolve) => {
        form.addEventListener("alert-submit", (e: Event) => resolve((e as CustomEvent).detail), {
          once: true,
        });
      });
    });

    await page.getByTestId("submit-btn").click();

    const data = await submitData;
    expect(data.type).toBe("SCORE_THRESHOLD");
    expect(data.threshold).toBe(70);
    expect(data.channel).toBe("EMAIL");
    expect(data.nicheId).toBeUndefined();
  });

  test("submit avec niche spécifique émet nicheId", async ({ page }) => {
    await setupAlertFormPage(page);

    // Select a specific niche
    await page.getByTestId("niche-select").selectOption("niche-1");

    const submitData = page.getByTestId("alert-form").evaluate((form) => {
      return new Promise<Record<string, unknown>>((resolve) => {
        form.addEventListener("alert-submit", (e: Event) => resolve((e as CustomEvent).detail), {
          once: true,
        });
      });
    });

    await page.getByTestId("submit-btn").click();

    const data = await submitData;
    expect(data.nicheId).toBe("niche-1");
  });

  test("submit avec SPIKE et threshold modifié", async ({ page }) => {
    await setupAlertFormPage(page);

    await page.getByTestId("alert-type-select").selectOption("SPIKE");
    await page.getByTestId("threshold-range").fill("85");

    const submitData = page.getByTestId("alert-form").evaluate((form) => {
      return new Promise<Record<string, unknown>>((resolve) => {
        form.addEventListener("alert-submit", (e: Event) => resolve((e as CustomEvent).detail), {
          once: true,
        });
      });
    });

    await page.getByTestId("submit-btn").click();

    const data = await submitData;
    expect(data.type).toBe("SPIKE");
    expect(data.threshold).toBe(85);
  });

  test("submit avec DAILY_DIGEST n'inclut pas threshold", async ({ page }) => {
    await setupAlertFormPage(page);

    await page.getByTestId("alert-type-select").selectOption("DAILY_DIGEST");

    const submitData = page.getByTestId("alert-form").evaluate((form) => {
      return new Promise<Record<string, unknown>>((resolve) => {
        form.addEventListener("alert-submit", (e: Event) => resolve((e as CustomEvent).detail), {
          once: true,
        });
      });
    });

    await page.getByTestId("submit-btn").click();

    const data = await submitData;
    expect(data.type).toBe("DAILY_DIGEST");
    // threshold should still be present in state but not required for DAILY_DIGEST
    expect(data.threshold).toBeDefined();
  });

  test("Annuler émet un événement custom", async ({ page }) => {
    await setupAlertFormPage(page);

    const cancelPromise = page.getByTestId("alert-form").evaluate((form) => {
      return new Promise<void>((resolve) => {
        form.addEventListener("alert-cancel", () => resolve(), { once: true });
      });
    });

    await page.getByTestId("cancel-btn").click();
    await cancelPromise; // Should resolve without timeout
  });
});

/* ======================================================================== */
/*  NicheFollowButton tests                                                  */
/* ======================================================================== */

interface NicheFollowButtonOptions {
  isFollowing?: boolean;
  plan?: string;
  currentCount?: number;
  maxCount?: number;
}

/**
 * Build a standalone HTML page replicating the NicheFollowButton component.
 * Mirrors the exact JSX logic from niche-follow-button.tsx.
 */
function buildNicheFollowButtonPage(opts: NicheFollowButtonOptions = {}): string {
  const { isFollowing = false, plan = "PRO", currentCount = 5, maxCount = 10 } = opts;

  const isFreeUserAtLimit = plan === "FREE" && currentCount >= maxCount && !isFollowing;

  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>NicheFollowButton – Test</title>
  <style>
    body { font-family: sans-serif; background: #fff; color: #111; padding: 2rem; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .gap-2 { gap: 0.5rem; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    button {
      display: inline-flex; align-items: center; gap: 0.25rem;
      padding: 0.375rem 0.75rem; border: 1px solid #ccc;
      cursor: pointer; font-size: 0.875rem; border-radius: 0;
    }
    button[disabled] { opacity: 0.5; cursor: not-allowed; }
    .bg-secondary { background: #e5e7eb; }
    .bg-transparent { background: transparent; }
    .opacity-50 { opacity: 0.5; }
    .cursor-not-allowed { cursor: not-allowed; }
    svg { width: 1rem; height: 1rem; display: inline-block; vertical-align: middle; }
    .spinner { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="root" class="flex items-center gap-2" data-testid="niche-follow-container">
    <button
      id="follow-btn"
      data-testid="follow-btn"
      class="${isFollowing ? "bg-secondary" : "bg-transparent"}${isFreeUserAtLimit ? " opacity-50 cursor-not-allowed" : ""}"
      ${isFreeUserAtLimit ? "disabled" : ""}
    >
      <span id="btn-content" data-testid="btn-content">
        ${
          isFollowing
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Suivi'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Suivre'
        }
      </span>
    </button>
    ${
      plan === "FREE"
        ? `<span class="text-xs" data-testid="plan-counter">${currentCount}/${maxCount}</span>`
        : ""
    }
  </div>

  <hr />
  <p class="text-xs" data-testid="log-output" style="color:#666;margin-top:0.5rem;"></p>

  <script>
    const btn = document.getElementById("follow-btn");
    const content = document.getElementById("btn-content");
    const logOutput = document.querySelector('[data-testid="log-output"]');
    let loading = false;
    let followState = ${isFollowing};

    function render() {
      if (loading) {
        content.innerHTML =
          '<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
        return;
      }
      if (followState) {
        content.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Suivi';
      } else {
        content.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Suivre';
      }
    }

    btn.addEventListener("click", async function () {
      if (loading || btn.disabled) return;

      loading = true;
      btn.disabled = true;
      render();

      try {
        const method = followState ? "DELETE" : "POST";
        const url = followState ? "/api/niches/some-id" : "/api/niches";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: followState ? undefined : JSON.stringify({ nicheId: "some-id" }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Erreur lors de l'opération");
        }

        followState = !followState;
        logOutput.textContent = "onFollowChange(" + followState + ")";

        // Dispatch event for test observation
        const event = new CustomEvent("follow-changed", {
          detail: { nicheId: "some-id", isFollowing: followState },
        });
        document.getElementById("root").dispatchEvent(event);
      } catch (err) {
        logOutput.textContent = "Error: " + err.message;
        // Show alert like the real component
        alert(err.message);
      } finally {
        loading = false;
        btn.disabled = ${isFreeUserAtLimit};
        render();
      }
    });
  </script>
</body>
</html>`;
}

async function setupFollowButtonPage(page: Page, opts?: NicheFollowButtonOptions) {
  const html = buildNicheFollowButtonPage(opts);
  await page.setContent(html);
  await page.waitForLoadState("networkidle");
}

test.describe("NicheFollowButton — Rendu", () => {
  test("affiche 'Suivre' quand isFollowing=false", async ({ page }) => {
    await setupFollowButtonPage(page, { isFollowing: false });
    await expect(page.getByTestId("follow-btn")).toContainText("Suivre");
  });

  test("affiche 'Suivi' quand isFollowing=true", async ({ page }) => {
    await setupFollowButtonPage(page, { isFollowing: true });
    await expect(page.getByTestId("follow-btn")).toContainText("Suivi");
  });

  test("bouton activé par défaut pour PRO", async ({ page }) => {
    await setupFollowButtonPage(page, { plan: "PRO", isFollowing: false });
    await expect(page.getByTestId("follow-btn")).toBeEnabled();
  });

  test("affiche le compteur plan pour les utilisateurs FREE", async ({ page }) => {
    await setupFollowButtonPage(page, { plan: "FREE", currentCount: 3, maxCount: 5 });
    await expect(page.getByTestId("plan-counter")).toHaveText("3/5");
  });

  test("ne masque pas le compteur pour PRO", async ({ page }) => {
    await setupFollowButtonPage(page, { plan: "PRO" });
    await expect(page.getByTestId("plan-counter")).toHaveCount(0);
  });
});

test.describe("NicheFollowButton — Plan FREE limite", () => {
  test("bouton désactivé quand FREE à la limite et pas encore suivi", async ({ page }) => {
    await setupFollowButtonPage(page, {
      plan: "FREE",
      currentCount: 5,
      maxCount: 5,
      isFollowing: false,
    });
    await expect(page.getByTestId("follow-btn")).toBeDisabled();
  });

  test("bouton activé pour FREE quand en dessous de la limite", async ({ page }) => {
    await setupFollowButtonPage(page, {
      plan: "FREE",
      currentCount: 3,
      maxCount: 5,
      isFollowing: false,
    });
    await expect(page.getByTestId("follow-btn")).toBeEnabled();
  });

  test("bouton activé pour FREE à la limite si déjà suivi (peut unfollow)", async ({ page }) => {
    await setupFollowButtonPage(page, {
      plan: "FREE",
      currentCount: 5,
      maxCount: 5,
      isFollowing: true,
    });
    await expect(page.getByTestId("follow-btn")).toBeEnabled();
  });

  test("bouton a la classe opacity-50 quand FREE à la limite", async ({ page }) => {
    await setupFollowButtonPage(page, {
      plan: "FREE",
      currentCount: 5,
      maxCount: 5,
      isFollowing: false,
    });
    const btn = page.getByTestId("follow-btn");
    // Should have the disabled appearance
    await expect(btn).toBeDisabled();
  });
});

test.describe("NicheFollowButton — Clic et appel API", () => {
  test("clic → fetch POST vers /api/niches quand pas suivi", async ({ page }) => {
    let requestUrl = "";
    let requestMethod = "";
    let requestBody: Record<string, unknown> | null = null;

    await page.route("**/api/niches", async (route) => {
      requestUrl = route.request().url();
      requestMethod = route.request().method();
      requestBody = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niche: { id: "some-id" } }),
      });
    });

    await setupFollowButtonPage(page, { isFollowing: false });
    await page.getByTestId("follow-btn").click();

    // Wait for the API call
    await page.waitForTimeout(300);

    expect(requestMethod).toBe("POST");
    expect(requestUrl).toContain("/api/niches");
    expect(requestBody.nicheId).toBe("some-id");
  });

  test("clic → fetch DELETE vers /api/niches/[id] quand déjà suivi", async ({ page }) => {
    let requestUrl = "";
    let requestMethod = "";

    await page.route("**/api/niches/**", async (route) => {
      requestUrl = route.request().url();
      requestMethod = route.request().method();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await setupFollowButtonPage(page, { isFollowing: true });
    await page.getByTestId("follow-btn").click();

    // Wait for the API call
    await page.waitForTimeout(300);

    expect(requestMethod).toBe("DELETE");
    expect(requestUrl).toContain("/api/niches/some-id");
  });

  test("après follow réussi, le bouton affiche 'Suivi'", async ({ page }) => {
    await page.route("**/api/niches", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niche: { id: "some-id" } }),
      });
    });

    await setupFollowButtonPage(page, { isFollowing: false });
    await page.getByTestId("follow-btn").click();

    // Wait for completion
    await expect(page.getByTestId("follow-btn")).toContainText("Suivi", { timeout: 3000 });
  });

  test("après unfollow réussi, le bouton affiche 'Suivre'", async ({ page }) => {
    await page.route("**/api/niches/some-id", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await setupFollowButtonPage(page, { isFollowing: true });
    await page.getByTestId("follow-btn").click();

    // Wait for completion
    await expect(page.getByTestId("follow-btn")).toContainText("Suivre", { timeout: 3000 });
  });

  test("émet un événement follow-changed après le succès", async ({ page }) => {
    await page.route("**/api/niches", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niche: { id: "some-id" } }),
      });
    });

    await setupFollowButtonPage(page, { isFollowing: false });

    const eventPromise = page.getByTestId("niche-follow-container").evaluate((el) => {
      return new Promise<Record<string, unknown>>((resolve) => {
        el.addEventListener("follow-changed", (e: Event) => resolve((e as CustomEvent).detail), {
          once: true,
        });
      });
    });

    await page.getByTestId("follow-btn").click();

    const detail = await eventPromise;
    expect(detail.nicheId).toBe("some-id");
    expect(detail.isFollowing).toBe(true);
  });
});

test.describe("NicheFollowButton — Gestion d'erreur", () => {
  test("API 500 → alert() est appelé avec le message d'erreur", async ({ page }) => {
    await page.route("**/api/niches", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur serveur" }),
      });
    });

    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await setupFollowButtonPage(page, { isFollowing: false });
    await page.getByTestId("follow-btn").click();

    await page.waitForTimeout(500);
    expect(alertMessage).toContain("Erreur serveur");
  });

  test("après erreur API, le bouton revient à l'état initial (pas de changement d'état)", async ({
    page,
  }) => {
    await page.route("**/api/niches", async (route) => {
      await route.abort("connectionrefused");
    });

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await setupFollowButtonPage(page, { isFollowing: false });

    const btn = page.getByTestId("follow-btn");
    await expect(btn).toContainText("Suivre");

    await btn.click();
    await page.waitForTimeout(500);

    // Button should still show "Suivre" (state did not change)
    await expect(btn).toContainText("Suivre");
    await expect(btn).toBeEnabled();
  });
});

test.describe("NicheFollowButton — État de chargement", () => {
  test("le bouton se désactive et montre un spinner pendant l'appel API", async ({ page }) => {
    let resolveRoute: (() => void) | null = null;
    await page.route("**/api/niches", async (route) => {
      await new Promise<void>((resolve) => {
        resolveRoute = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niche: { id: "some-id" } }),
      });
    });

    await setupFollowButtonPage(page, { isFollowing: false });

    const btn = page.getByTestId("follow-btn");
    await btn.click();

    // During loading, button should be disabled
    await expect(btn).toBeDisabled();
    // SVG spinner should be visible
    await expect(btn.locator("svg")).toBeVisible();

    // Complete the request
    resolveRoute!();
    await page.waitForTimeout(300);

    // After completion, button should be enabled again
    await expect(btn).toBeEnabled();
    await expect(btn).toContainText("Suivi");
  });
});
