// ============================================
// Retry utility — exponential backoff with jitter, timeout, and configurable retry conditions
// ============================================

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  retryOn?: (error: Error) => boolean;
}

/**
 * Default transient-error classifier.
 * Returns true for network errors, rate limits (429), 5xx server errors, and timeouts.
 */
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("too many requests") ||
    message.includes("internal server error") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

/**
 * Wraps an async operation with retry logic:
 * - Exponential backoff with random jitter: `delay = min(baseDelay * 2^attempt + random(0, 1000), maxDelay)`
 * - Timeout guard: if `fn` takes longer than `timeoutMs`, rejects with `TimeoutError`
 * - Only retries on transient errors (configurable via `retryOn`)
 * - Logs retry attempts via `console.warn`
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    timeoutMs = 30000,
    retryOn = isTransientError,
  } = options ?? {};

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(fn(), timeoutMs);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries && retryOn(lastError)) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelayMs,
        );
        console.warn(
          `[Retry] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}. ` +
            `Retrying in ${Math.round(delay)}ms...`,
        );
        await sleep(delay);
      } else {
        throw lastError;
      }
    }
  }

  // This line is unreachable because the loop always either returns or throws,
  // but TypeScript needs it for strict reachability analysis.
  throw lastError!;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new TimeoutError(`Operation timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
