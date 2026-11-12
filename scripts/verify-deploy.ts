// After the daily snapshot commit: wait until the live site serves that snapshot. Polls the deployed
// /data/schedule.json (cache-busting query, no-cache) until its meta.time equals the committed file's, for up to
// ~30 minutes; exits 1 otherwise, so the workflow run fails and GitHub emails the repo owner.
// Was ~10 minutes. On 2026-11-05 Vercel built the bot's commit 20 min after the push (Vercel received the push
// 7 min late, then the build queued 12 min — Hobby builds one deployment at a time) and the check failed although the
// deploy then went live. After 10 minutes without the new snapshot it also calls the Vercel Deploy Hook in the secret
// VERCEL_DEPLOY_HOOK_URL once, when set (optional: Vercel deploys the bot's commits from Git on its own).
// Usage: npx tsx scripts/verify-deploy.ts [url] [file]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Calendarkit lives under the gauntlet's address (the old one only redirects browsers)
export const LIVE_URL = 'https://gauntlet-home.vercel.app/calendar/data/schedule.json';
export const TRIES = 60;
/** Tries before the deploy hook is called (10 minutes). */
export const HOOK_AFTER = 20;
export const INTERVAL_MS = 30_000;

export interface VerifyOptions {
  expected: string;
  url?: string;
  tries?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  /** Called once after `hookAfter` tries without the new snapshot (the deploy hook). */
  onSlow?: () => Promise<void>;
  hookAfter?: number;
}

/** True once the live file's meta.time equals `expected`; false after `tries` attempts. */
export async function verifyDeploy({ expected, url = LIVE_URL, tries = TRIES, intervalMs = INTERVAL_MS, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log, onSlow, hookAfter = HOOK_AFTER }: VerifyOptions): Promise<boolean> {
  for (let i = 1; i <= tries; i++) {
    let live: string;
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
    if (i === hookAfter && onSlow) {
      try {
        await onSlow();
      } catch (e) {
        log(`deploy hook failed: ${(e as Error).message}`);
      }
    }
    if (i < tries) await sleep(intervalMs);
  }
  return false;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.argv[2] ?? LIVE_URL;
  const file = process.argv[3] ?? 'public/data/schedule.json';
  const expected = (JSON.parse(readFileSync(file, 'utf8')) as { meta: { time: string } }).meta.time;
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  const onSlow = hook
    ? async () => {
        const res = await fetch(hook, { method: 'POST' });
        console.log(`::warning::No new snapshot live after ${(HOOK_AFTER * INTERVAL_MS) / 60_000} min; called the Vercel deploy hook (HTTP ${res.status}).`);
      }
    : undefined;
  if (!(await verifyDeploy({ expected, url, onSlow }))) {
    console.error(`::error::The live site did not publish the committed snapshot within ${(TRIES * INTERVAL_MS) / 60_000} minutes (expected meta.time ${expected} at ${url}). Check the Vercel deployment of the bot commit.`);
    process.exit(1);
  }
}
