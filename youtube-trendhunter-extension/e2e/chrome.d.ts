/* -------------------------------------------------------------------------- */
/*  Minimal type declarations for `chrome` API used in E2E tests              */
/*                                                                           */
/*  The helper functions in background.spec.ts call chrome.runtime.* and     */
/*  chrome.storage.* inside page.evaluate() callbacks. These run in the      */
/*  extension page context where `chrome` is available, but TypeScript       */
/*  needs a declaration at compile time.                                     */
/*                                                                           */
/*  We only declare the subset we actually use in tests.                     */
/* -------------------------------------------------------------------------- */

declare namespace ChromeStorage {
  interface StorageArea {
    get(
      keys: string | string[] | Record<string, unknown>,
      callback?: (items: Record<string, unknown>) => void,
    ): void;
    set(
      items: Record<string, unknown>,
      callback?: () => void,
    ): void;
    remove(
      keys: string | string[],
      callback?: () => void,
    ): void;
    clear(callback?: () => void): void;
  }
}

interface ChromeRuntime {
  sendMessage(
    message: unknown,
    callback?: (response: unknown) => void,
  ): void;
  getManifest(): Record<string, unknown>;
}

interface ChromeNamespace {
  runtime: ChromeRuntime;
  storage: {
    session: ChromeStorage.StorageArea;
    sync: ChromeStorage.StorageArea;
  };
}

declare var chrome: ChromeNamespace;
