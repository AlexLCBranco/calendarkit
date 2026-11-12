// Data freshness alarm. Fails (exit 1, a red run, GitHub emails the repo owner) when
//  - the live site's snapshot (meta.time of https://gauntlet-home.vercel.app/calendar/data/schedule.json) is more than
//    1 day behind the latest committed snapshot (public/data/schedule.json on main), or
//  - the latest committed snapshot itself is more than 2 days old (the daily job stopped: GitHub disables scheduled
//    workflows of a public repo after 60 days without activity, or the job keeps failing).
// Runs every 4 hours (.github/workflows/data-freshness.yml) and in CI's live job after every push to main.
// Usage: npx tsx scripts/check-live-data.ts [liveUrl] [file]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LIVE_URL } from './verify-deploy';

export const MAX_LIVE_LAG_MS = 24 * 3600_000;
export const MAX_SNAPSHOT_AGE_MS = 48 * 3600_000;

export interface FreshnessInput {
  /** meta.time served by the live site, or an error text. */
  live: string;
  /** meta.time of the latest committed snapshot. */
  latest: string;
  now: number;
}

/** Problems found (empty = fresh). */
export function freshnessProblems({ live, latest, now }: FreshnessInput): string[] {
  const out: string[] = [];
  // ISO times only: Date.parse reads "HTTP 404" as the year 404
  const iso = (t: string) => (/^\d{4}-\d\d-\d\dT/.test(t) ? Date.parse(t) : NaN);
  const l = iso(live);
  const c = iso(latest);
  const h = (ms: number) => `${(ms / 3600_000).toFixed(1)} h`;
  if (Number.isNaN(c)) return [`the committed snapshot has no readable meta.time (${latest})`];
  if (Number.isNaN(l)) out.push(`the live site's snapshot can't be read (${live})`);
  else if (c - l > MAX_LIVE_LAG_MS) out.push(`the live site serves data from ${live}, ${h(c - l)} behind the latest snapshot (${latest}): the snapshot commit didn't reach production`);
  if (now - c > MAX_SNAPSHOT_AGE_MS) out.push(`the latest snapshot (${latest}) is ${h(now - c)} old: the daily schedule update has stopped`);
  return out;
}

export async function liveMetaTime(url = LIVE_URL, fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const res = await fetchImpl(`${url}?fresh=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) return `HTTP ${res.status}`;
    return String(((await res.json()) as { meta?: { time?: unknown } }).meta?.time ?? '(no meta.time)');
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.argv[2] ?? LIVE_URL;
  const file = process.argv[3] ?? 'public/data/schedule.json';
  const latest = String((JSON.parse(readFileSync(file, 'utf8')) as { meta?: { time?: unknown } }).meta?.time);
  const live = await liveMetaTime(url);
  const problems = freshnessProblems({ live, latest, now: Date.now() });
  console.log(`live data ${live} · latest snapshot ${latest}`);
  for (const p of problems) console.error(`::error::Live data check: ${p}`);
  process.exitCode = problems.length ? 1 : 0; // not process.exit(): on Windows it can abort while fetch's handles close
}
