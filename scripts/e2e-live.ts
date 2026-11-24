// Run the live check against a deployed site (cross-platform; no shell env prefix). CI's live job runs this too.
//   npm run e2e:live -- https://gauntlet-home.vercel.app              the live check: LIVE_TESTS (what CI runs)
//   npm run e2e:live -- https://gauntlet-home.vercel.app -g Rotations  extra arguments go to Playwright as given
//   npm run e2e:live -- https://gauntlet-home.vercel.app --all         the whole suite (most of it is written for a
//                                                                      local build and fails against the live site)
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The live check: the old address's redirect and notes hand-off, the gauntlet page's data and notes, smoke, version. */
export const LIVE_TESTS = ['--project=desktop-xl', 'e2e/move.spec.ts', 'e2e/smoke.spec.ts', 'e2e/version.spec.ts'];

/** Playwright's arguments: the live check when nothing is given; "--all" drops it for the whole suite. */
export const liveArgs = (extra: string[]): string[] => (extra.length === 0 ? LIVE_TESTS : extra.filter((a) => a !== '--all'));

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: npm run e2e:live -- <base url> [--all | playwright args]');
    process.exit(2);
  }
  const r = spawnSync('npx', ['playwright', 'test', ...liveArgs(process.argv.slice(3))], { stdio: 'inherit', shell: true, env: { ...process.env, E2E_BASE_URL: url, E2E_LIVE: '1' } });
  process.exit(r.status ?? 1);
}
