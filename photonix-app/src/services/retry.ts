/**
 * Retry utility with exponential backoff.
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxAttempts) break;

      // Don't retry on non-retryable errors
      if (isNonRetryable(error)) break;

      opts.onRetry?.(attempt, error);

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

function isNonRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Don't retry auth errors or invalid requests
    if (msg.includes("401") || msg.includes("403") || msg.includes("invalid")) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
