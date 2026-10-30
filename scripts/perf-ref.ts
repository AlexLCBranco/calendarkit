// The perf guard's reference build (round 6): the app at a fixed earlier commit, built once into
// test-output/perf-ref/<commit>/ and measured in the same run as the current build, interleaved (e2e/perf.spec.ts).
// Builds from a temporary git worktree inside test-output (so Node finds this checkout's node_modules by walking up),
// with Vite only (no typecheck). CI checks out 2 commits, so the reference commit is fetched when it's missing.
// `npx tsx scripts/perf-ref.ts [commit]` builds it by hand.

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const git = (...args: string[]) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

export const perfRefDir = (commit: string) => resolve('test-output', 'perf-ref', commit);

/** The reference build's folder, built first if it isn't there yet. */
export function buildPerfRef(commit: string): string {
  const out = perfRefDir(commit);
  if (existsSync(join(out, 'index.html'))) return out;
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
  } catch {
    git('fetch', '--depth=1', 'origin', commit);
  }
  const src = resolve('test-output', 'perf-ref', `src-${commit}`);
  rmSync(src, { recursive: true, force: true });
  git('worktree', 'prune');
  git('worktree', 'add', '--detach', src, commit);
  try {
    execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], { cwd: src, stdio: 'inherit' });
  } finally {
    git('worktree', 'remove', '--force', src);
  }
  return out;
}

if (process.argv[1]?.endsWith('perf-ref.ts')) console.log(buildPerfRef(process.argv[2] ?? 'HEAD'));
