import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Site version: package.json's "version" (MAJOR.MINOR.PATCH, bumped with every app change; scripts/check-version.ts
// enforces it in CI), shown in the page's bottom-right corner, plus the commit it was built from (Vercel and GitHub
// Actions pass it; locally git, "+" when the working tree has uncommitted changes). Both are in /version.json.
const git = (cmd: string) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git('rev-parse HEAD')).slice(0, 7);
const dirty = !process.env.VERCEL_GIT_COMMIT_SHA && !process.env.GITHUB_SHA && git('status --porcelain') !== '';
const BUILD = { version: (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version, commit: sha ? `${sha}${dirty ? '+' : ''}` : 'dev', builtAt: new Date().toISOString() };

// Time-zone-sensitive tests run once per zone. The zone is set here (process.env.TZ in the test workers), not by
// a shell prefix, so `npm test` behaves the same on Windows, Linux and CI.
const TIME_ZONES = ['America/New_York', 'America/Sao_Paulo'];
const TZ_TESTS = ['tests/**/*.tz.test.ts', 'tests/**/*.tz.test.tsx'];

export default defineConfig({
  plugins: [react(), { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) }); } }],
  define: { __APP_VERSION__: JSON.stringify(BUILD.version), __APP_COMMIT__: JSON.stringify(BUILD.commit), __BUILT_AT__: JSON.stringify(BUILD.builtAt) },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'], exclude: TZ_TESTS, env: { TZ: 'UTC' } } },
      ...TIME_ZONES.map((tz) => ({ extends: true, test: { name: `tz:${tz}`, include: TZ_TESTS, env: { TZ: tz } } })),
    ],
  },
});
