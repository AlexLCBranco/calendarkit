// CI: a commit that changes the app (anything that ends up on the site, except the daily data snapshot) must raise
// package.json's version (MAJOR.MINOR.PATCH), so the corner label on the live site always tells versions apart.
// Compares HEAD with its parent (CI checks out 2 commits). Exit 1 with the reason otherwise.

import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Files whose change doesn't need a new version: data snapshots, tests, docs, CI and tooling. */
const NO_BUMP = [/^public\/data\//, /^tests\//, /^e2e\//, /^scripts\//, /^\.github\//, /^\.claude\//, /^PROJECT\.md$/, /^CLAUDE\.md$/, /^\.gitignore$/, /^\.gitattributes$/, /^playwright\.config\.ts$/];

export const changesNeedBump = (files: string[]) => files.some((f) => !NO_BUMP.some((re) => re.test(f)));

export function isBumped(before: string, after: string): boolean {
  const a = before.split('.').map(Number);
  const b = after.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (b[i]! !== a[i]!) return b[i]! > a[i]!;
  return false;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
  const files = git('diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean);
  const version = (ref: string) => (JSON.parse(git(`show ${ref}:package.json`)) as { version: string }).version;
  const [before, after] = [version('HEAD~1'), version('HEAD')];
  if (!changesNeedBump(files)) console.log(`check-version: no app change (${files.length} files), version ${after}`);
  else if (isBumped(before, after)) console.log(`check-version: ${before} → ${after}`);
  else {
    console.error(`check-version: the app changed (${files.filter((f) => changesNeedBump([f])).join(', ')}) but package.json's version is still ${after} (was ${before}). Bump it: patch for fixes, minor for features, major for big changes.`);
    process.exit(1);
  }
}
