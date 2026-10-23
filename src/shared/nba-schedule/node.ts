// Optional Node helper: download + parse the schedule feed. Node-only (process.env, optional undici).
// Browser code should import ./parse instead.

import { parseSchedule, SCHEDULE_URL, type Schedule } from './parse';

export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface FetchScheduleOptions {
  url?: string;
  timeoutMs?: number;
  /** Delays between attempts; one retry per entry. Default 2s, 4s, 8s. */
  retryDelaysMs?: number[];
  headers?: Record<string, string>;
  /** Called before each retry (for logging). */
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
}

let proxyReady: Promise<void> | undefined;

/**
 * Node's built-in fetch ignores HTTPS_PROXY. When a proxy is configured, route fetch through it using
 * undici's EnvHttpProxyAgent if the `undici` package is installed. Otherwise run Node with
 * NODE_USE_ENV_PROXY=1 (Node ≥ 22.21 / 24.5), or without a proxy.
 */
function ensureProxy(): Promise<void> {
  proxyReady ??= (async () => {
    if (!(process.env.HTTPS_PROXY || process.env.https_proxy) || process.env.NODE_USE_ENV_PROXY) return;
    try {
      const undici = (await import('undici')) as { EnvHttpProxyAgent: new () => unknown; setGlobalDispatcher: (d: unknown) => void };
      undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent());
    } catch {
      console.warn('nba-schedule: HTTPS_PROXY is set but `undici` is not installed; set NODE_USE_ENV_PROXY=1 or install undici.');
    }
  })();
  return proxyReady;
}

export class ScheduleFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ScheduleFetchError';
  }
}

async function once(url: string, timeoutMs: number, headers: Record<string, string>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const err = e as Error & { cause?: Error };
    throw new ScheduleFetchError(err.name === 'TimeoutError' ? `timeout after ${timeoutMs / 1000}s` : `${err.message} ${err.cause?.message ?? ''}`.trim());
  }
  const text = await res.text();
  if (!res.ok) throw new ScheduleFetchError(`HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 120)}`.trim(), res.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new ScheduleFetchError(`non-JSON body: ${text.slice(0, 120)}`, res.status);
  }
}

/** Fetch the raw feed JSON with retries (403/404 are not retried). */
export async function fetchScheduleJson(opts: FetchScheduleOptions = {}): Promise<unknown> {
  await ensureProxy();
  const { url = SCHEDULE_URL, timeoutMs = 15_000, retryDelaysMs = [2_000, 4_000, 8_000], headers = DEFAULT_HEADERS } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(url, timeoutMs, headers);
    } catch (e) {
      const err = e as ScheduleFetchError;
      const delay = retryDelaysMs[attempt];
      if (err.status === 403 || err.status === 404 || delay === undefined) throw err;
      opts.onRetry?.(attempt + 1, delay, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** Fetch and parse the schedule. */
export async function fetchSchedule(opts: FetchScheduleOptions = {}): Promise<Schedule> {
  return parseSchedule(await fetchScheduleJson(opts));
}
