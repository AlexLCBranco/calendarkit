// CI: waits until the live site serves this commit's build — /calendar/version.json at the gauntlet's
// address naming the commit — so the live check that follows tests what was just pushed. Polls every 30 s at most
// (Vercel requests are a budget, CLAUDE.md) and stops as soon as it matches; ~10 min at most, exits 1 then.
// Usage: npx tsx scripts/wait-live.ts <commit sha> [site]

import { pathToFileURL } from 'node:url';

/** Time between two checks of the live version.json: never under 30 s. */
export const POLL_MS = 30_000;
/** Checks before giving up: 20 × 30 s = 10 minutes. */
export const MAX_ATTEMPTS = 20;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [sha, site = 'https://gauntlet-home.vercel.app'] = process.argv.slice(2);
  if (!sha) throw new Error('usage: wait-live.ts <commit sha> [site]');
  const want = sha.slice(0, 7);
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    let live: string;
    try {
      const res = await fetch(`${site}/calendar/version.json?wait=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
      live = res.ok ? String(((await res.json()) as { commit?: string }).commit) : `HTTP ${res.status}`;
    } catch (e) {
      live = `error: ${(e as Error).message}`;
    }
    if (live === want) {
      console.log(`${site}/calendar/ serves ${want} (attempt ${i})`);
      process.exit(0);
    }
    console.log(`attempt ${i}/${MAX_ATTEMPTS}: live ${live}, waiting for ${want}`);
    if (i < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.error(`::error::${site}/calendar/ did not serve ${want} within ${(MAX_ATTEMPTS * POLL_MS) / 60_000} minutes`);
  process.exit(1);
}
