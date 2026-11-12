// Local test servers take a free port and are always stopped; the odds live check runs only in CI's live job.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { freePort } from '../scripts/free-port';

const listen = (port: number) =>
  new Promise<void>((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(port, () => s.close(() => resolve()));
  });

describe('freePort', () => {
  it('gives a port nothing listens on (it can be bound), different while the first is taken', async () => {
    const a = await freePort();
    expect(a).toBeGreaterThan(1024);
    await expect(listen(a)).resolves.toBeUndefined();
    const busy = createServer();
    await new Promise<void>((r) => busy.listen(a, () => r()));
    try {
      expect(await freePort()).not.toBe(a);
    } finally {
      busy.close();
    }
  });
});

describe('wiring', () => {
  const config = readFileSync('playwright.config.ts', 'utf8');
  const all = readFileSync('scripts/e2e-all.ts', 'utf8');
  it('Playwright serves the build on a free port of its own and never reuses another server', () => {
    expect(config).toMatch(/process\.env\.E2E_PORT \?\?= String\(await freePort\(\)\)/);
    expect(config).toMatch(/reuseExistingServer: false/);
    expect(config).not.toMatch(/4180|4190/);
  });
  it('npm run e2e:all serves on a free port and stops its server on exit, signals and errors', () => {
    expect(all).toMatch(/const PORT = await freePort\(\)/);
    expect(all).not.toMatch(/'4180'|:4180/);
    for (const hook of [/process\.on\('exit', stopServer\)/, /'SIGINT', 'SIGTERM'/, /process\.on\('uncaughtException'/, /finally \{\s*stopServer\(\);/]) expect(all).toMatch(hook);
    expect(all).toMatch(/E2E_PORT: String\(PORT\), E2E_SERVER_UP: '1'/);
  });
  it('the odds live check runs only with E2E_LIVE=1, which CI\'s live job and e2e:live set', () => {
    expect(readFileSync('e2e/smoke.spec.ts', 'utf8')).toMatch(/test\.skip\(process\.env\.E2E_LIVE !== '1', 'live only: runs only in the CI live job/);
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toMatch(/E2E_BASE_URL: https:\/\/gauntlet-home\.vercel\.app\s*\n\s*E2E_LIVE: '1'/);
    expect(readFileSync('scripts/e2e-live.ts', 'utf8')).toMatch(/E2E_LIVE: '1'/);
  });
});
