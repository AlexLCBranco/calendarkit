import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CALENDARKIT_BASE } from './src/data/address';

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

// Round 14 (item 4): /calendar/api/odds is a Vercel function (api/odds.ts). Locally: `vite` (dev) runs the real one
// (live ESPN odds while working on the page); `vite preview` — what the e2e tests run against — answers "no odds" (200,
// empty), so tests never depend on ESPN; the odds tests route the request to fixtures, the live CI job checks the real one.
const ODDS_PATH = `${CALENDARKIT_BASE}api/odds`;
const oddsDev: Plugin = {
  name: 'odds-api',
  configureServer(server) {
    server.middlewares.use(ODDS_PATH, async (req, res) => {
      const { GET } = await server.ssrLoadModule('/api/odds.ts');
      const r: Response = await GET(new Request(new URL(req.url ?? '', 'http://localhost' + ODDS_PATH)));
      res.statusCode = r.status;
      res.setHeader('content-type', 'application/json');
      res.end(await r.text());
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use(ODDS_PATH, (req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ date: new URL(req.url ?? '', 'http://localhost').searchParams.get('date'), games: {} }));
    });
  },
};

export default defineConfig({
  // round 10: served under the gauntlet's address, gauntlet-home.vercel.app/calendar/ (src/data/address.ts)
  base: CALENDARKIT_BASE,
  plugins: [react(), oddsDev, { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) }); } }],
  define: { __APP_VERSION__: JSON.stringify(BUILD.version), __APP_COMMIT__: JSON.stringify(BUILD.commit), __BUILT_AT__: JSON.stringify(BUILD.builtAt) },
  test: {
    setupFiles: ['tests/setup.ts'],
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts'], exclude: TZ_TESTS, env: { TZ: 'UTC' } } },
      ...TIME_ZONES.map((tz) => ({ extends: true, test: { name: `tz:${tz}`, include: TZ_TESTS, env: { TZ: tz } } })),
    ],
  },
});
