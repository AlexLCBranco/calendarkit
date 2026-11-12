import { defineConfig, devices } from '@playwright/test';
import { freePort } from './scripts/free-port';

// Runs against the production build served by `vite preview` (same files Vercel serves).
// Set E2E_BASE_URL to run the same tests against a deployed site.
// The local server takes a free port (a fixed port with reuseExistingServer could test — or collide with — another
// session's leftover server). Chosen once in the runner and handed to the workers through
// E2E_PORT; `npm run e2e:all` starts the server itself and sets E2E_PORT + E2E_SERVER_UP. Playwright stops the server
// it started when the run ends, also after failures.
process.env.E2E_PORT ??= String(await freePort());
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT}`;
const ownServer = !process.env.E2E_BASE_URL && !process.env.E2E_SERVER_UP;
// Phone and tablet are parked, not abandoned (desktop-only use for now): their projects exist only with E2E_NARROW=1,
// so a plain run, npm run e2e:all and CI skip them; the narrow-layout code and specs stay.
const narrow = process.env.E2E_NARROW === '1';
const desktopXl = { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // a run can never hang indefinitely (a perf run piped into grep once never returned); a full local run takes
  // ~5 min, CI's slower runners more — 20 min is the ceiling
  globalTimeout: 20 * 60_000,
  workers: 2,
  // tests (not files) are the unit of parallelism and of sharding, so shards (npm run e2e:all, CI)
  // come out even; a file whose tests share a server keeps its own order (slate-same.spec.ts), the perf guard runs alone
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'off', timezoneId: 'America/Sao_Paulo' },
  webServer: ownServer
    ? { command: `npm run build && node node_modules/vite/bin/vite.js preview --port ${process.env.E2E_PORT} --strictPort`, url: `${baseURL}/calendar/`, reuseExistingServer: false, timeout: 120_000 }
    : undefined,
  projects: [
    { name: 'desktop', testIgnore: 'perf.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'desktop-xl', testIgnore: 'perf.spec.ts', use: desktopXl },
    ...(narrow
      ? [
          { name: 'tablet', testIgnore: 'perf.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
          { name: 'phone', testIgnore: 'perf.spec.ts', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
        ]
      : []),
    // Performance guard: after every other project, so its timings aren't skewed by tests running alongside.
    // Finite per-test timeout (the longest perf test sets 180 s itself; this caps the rest).
    { name: 'perf', testMatch: 'perf.spec.ts', fullyParallel: false, dependencies: ['desktop', 'desktop-xl', ...(narrow ? ['tablet', 'phone'] : [])], timeout: 180_000, use: desktopXl },
  ],
});
