export type RetryOptions = {
  maxRetries?: number;   // default: 2
  delayMs?: number;      // default: 100
  backoffFactor?: number; // default: 2 (exponential backoff)
};

/**
 * Runs an async function with retry + backoff.
 */
export async function withRetry<T>(
  opts: RetryOptions = {},
  fn: () => Promise<T>
): Promise<T> {
  const max = opts.maxRetries ?? 2;
  const baseDelay = opts.delayMs ?? 100;
  const factor = opts.backoffFactor ?? 2;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt++ >= max) throw err;
      const delay = baseDelay * Math.pow(factor, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
