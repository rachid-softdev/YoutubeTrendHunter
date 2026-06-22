import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the TrendHunter Extension Options page.
 *
 * URL: chrome-extension://<extensionId>/options.html
 */
export class OptionsPage {
  readonly page: Page;
  readonly extensionId: string;

  constructor(page: Page, extensionId: string) {
    this.page = page;
    this.extensionId = extensionId;
  }

  /* ------------------------------------------------------------------------ */
  /*  Navigation                                                              */
  /* ------------------------------------------------------------------------ */

  /** Navigate to the options page URL. */
  async goto() {
    await this.page.goto(`chrome-extension://${this.extensionId}/options.html`);
  }

  /** Reload the options page. */
  async reload() {
    await this.page.reload();
  }

  /* ------------------------------------------------------------------------ */
  /*  Locators                                                                */
  /* ------------------------------------------------------------------------ */

  get title(): Locator {
    return this.page.locator("h1");
  }
  get sectionTitle(): Locator {
    return this.page.locator("h2");
  }
  get description(): Locator {
    return this.page.locator(".section-desc");
  }
  get urlInput(): Locator {
    return this.page.locator(".url-input");
  }
  get saveButton(): Locator {
    return this.page.locator(".btn-primary");
  }
  get resetButton(): Locator {
    return this.page.locator(".btn-ghost");
  }
  get successMessage(): Locator {
    return this.page.locator(".msg-success");
  }
  get errorMessage(): Locator {
    return this.page.locator(".msg-error");
  }

  /* ------------------------------------------------------------------------ */
  /*  Actions                                                                 */
  /* ------------------------------------------------------------------------ */

  /** Replace the full content of the URL input. */
  async fillUrl(value: string) {
    await this.urlInput.fill(value);
  }

  async clickSave() {
    await this.saveButton.click();
  }

  async clickReset() {
    await this.resetButton.click();
  }

  /** Press Enter while the URL input is focused. */
  async pressEnter() {
    await this.urlInput.press("Enter");
  }

  /* ------------------------------------------------------------------------ */
  /*  Storage helpers                                                         */
  /* ------------------------------------------------------------------------ */

  /** Read `apiBaseUrl` from chrome.storage.sync (returns "" when absent). */
  async readStorageUrl(): Promise<string> {
    return this.page.evaluate(() => {
      return new Promise<string>((resolve) => {
        chrome.storage.sync.get("apiBaseUrl", (result: { apiBaseUrl?: string }) => {
          resolve(result.apiBaseUrl ?? "");
        });
      });
    });
  }

  /** Persist a URL into chrome.storage.sync. */
  async writeStorageUrl(url: string): Promise<void> {
    await this.page.evaluate((u: string) => {
      return new Promise<void>((resolve) => {
        chrome.storage.sync.set({ apiBaseUrl: u }, resolve);
      });
    }, url);
  }

  /** Completely clear chrome.storage.sync. */
  async clearStorage(): Promise<void> {
    await this.page.evaluate(() => {
      return new Promise<void>((resolve) => {
        chrome.storage.sync.clear(resolve);
      });
    });
  }

  /* ------------------------------------------------------------------------ */
  /*  Failure simulation                                                      */
  /* ------------------------------------------------------------------------ */

  /** Enable simulated save failures for the next storage write. */
  async enableSaveFailureMode() {
    await this.page.evaluate(() => {
      (window as any).__storageFailMode = true;
    });
  }

  /** Enable simulated reset failures for the next storage removal. */
  async enableResetFailureMode() {
    await this.page.evaluate(() => {
      (window as any).__storageFailRemovalMode = true;
    });
  }

  /** Disable all failure simulations. */
  async disableFailureModes() {
    await this.page.evaluate(() => {
      (window as any).__storageFailMode = false;
      (window as any).__storageFailRemovalMode = false;
    });
  }
}
