import { withRetry, type RetryOptions } from './retry';

export async function postJson<T = any>(
  url: string,
  body: any,
  headers: Record<string, string> = {},
  timeoutMs = 30000,
  retry?: RetryOptions
): Promise<T> {
  const exec = async () => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal as any
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
      return txt ? JSON.parse(txt) : ({} as any);
    } finally {
      clearTimeout(to);
    }
  };
  return retry ? withRetry(retry, exec) : exec();
}
