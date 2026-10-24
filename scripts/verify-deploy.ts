// After the daily snapshot commit: wait until the live site serves that snapshot. Polls the deployed
// /data/schedule.json (cache-busting query, no-cache) until its meta.time equals the committed file's, for up to
// ~10 minutes; exits 1 otherwise, so the workflow run fails and GitHub emails the repo owner.
// Usage: npx tsx scripts/verify-deploy.ts [url] [file]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LIVE_URL = 'https://calendarkit-brown.vercel.app/data/schedule.json';
export const TRIES = 20;
export const INTERVAL_MS = 30_000;

export interface VerifyOptions {
  expected: string;
  url?: string;
  tries?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

/** True once the live file's meta.time equals `expected`; false after `tries` attempts. */
export async function verifyDeploy({ expected, url = LIVE_URL, tries = TRIES, intervalMs = INTERVAL_MS, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log }: VerifyOptions): Promise<boolean> {
  for (let i = 1; i <= tries; i++) {
    let live = '';
    try {
      const res = await fetchImpl(`${url}?verify=${Date.now()}-${i}`, { headers: { 'cache-control': 'no-cache' } });
      live = res.ok ? String(((await res.json()) as { meta?: { time?: unknown } }).meta?.time ?? '(no meta.time)') : `HTTP ${res.status}`;
    } catch (e) {
      live = `error: ${(e as Error).message}`;
    }
    if (live === expected) {
      log(`live site serves the committed snapshot (meta.time ${expected}) after ${i} attempt(s)`);
      return true;
    }
    log(`attempt ${i}/${tries}: live meta.time ${live}, committed ${expected}`);
    if (i < tries) await sleep(intervalMs);
  }
  return false;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.argv[2] ?? LIVE_URL;
  const file = process.argv[3] ?? 'public/data/schedule.json';
  const expected = (JSON.parse(readFileSync(file, 'utf8')) as { meta: { time: string } }).meta.time;
  if (!(await verifyDeploy({ expected, url }))) {
    console.error(`::error::The live site did not publish the committed snapshot within ${(TRIES * INTERVAL_MS) / 60_000} minutes (expected meta.time ${expected} at ${url}). Check the Vercel deployment of the bot commit.`);
    process.exit(1);
  }
}
