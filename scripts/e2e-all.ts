// The whole functional e2e suite in one command, `npm run e2e:all` — no manual splitting.
// Builds once and serves the build (the shards reuse the server: Playwright's webServer would rebuild per process),
// then runs the functional suite as the groups below one after another, each its own Playwright process with its own
// time limit (default 300 s, so no single process can hang a terminal), the blob reports merged at the end into the
// list + html reports. Groups are by project (a plain --shard of all projects came out uneven), the two desktop
// projects halved by test (`fullyParallel` in
// playwright.config.ts). CI runs the same groups as parallel jobs (GROUPS is the one list; ci.yml mirrors it). The perf
// guard is separate (`npx playwright test --project=perf --no-deps`): it must run alone.
//   npm run e2e:all                 every group, 300 s each
//   npm run e2e:all -- 240          240 s each
//   npm run e2e:all -- 300 -g Slate     extra arguments go to Playwright

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { freePort } from './free-port';

const [limitArg, ...rest] = process.argv.slice(2);
const LIMIT_S = Number(limitArg ?? 300);
const GROUPS = [
  ['--project=desktop-xl', '--shard=1/2'],
  ['--project=desktop-xl', '--shard=2/2'],
  ['--project=desktop', '--shard=1/2'],
  ['--project=desktop', '--shard=2/2'],
];
const killTree = (pid?: number) => (process.platform === 'win32' && pid ? spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }) : undefined);
const BLOB = 'test-output/blob-report';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const t0 = Date.now();
const sec = (ms: number) => `${(ms / 1000).toFixed(0)} s`;

console.log('[e2e:all] building…');
if (spawnSync(npm, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' }).status !== 0) process.exit(1);
// node runs vite directly (no shell, no npx in between), so killing this one process stops the server: through a shell
// the tree kill could miss it and leave the port taken after the run. A free port (a fixed one collided
// with other sessions' leftover servers), and the server is stopped however this script ends (failure, Ctrl+C, error).
const PORT = await freePort();
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stopServer = () => {
  if (server.exitCode === null && !server.killed) server.kill();
};
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => (stopServer(), process.exit(130)));
process.on('uncaughtException', (e) => (console.error(e), stopServer(), process.exit(1)));
console.log(`[e2e:all] serving the build on port ${PORT}`);
const up = async () => {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/calendar/`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start');
};

let failed = false;
const times: string[] = [];
try {
  await up();
  rmSync(BLOB, { recursive: true, force: true });
  mkdirSync(BLOB, { recursive: true });
  for (const [n, group] of GROUPS.entries()) {
    const i = n + 1;
    const s = Date.now();
    const code = await new Promise<number | null>((resolve) => {
      const p = spawn(npx, ['playwright', 'test', ...group, '--reporter=line,blob', ...rest], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, E2E_PORT: String(PORT), E2E_SERVER_UP: '1', PLAYWRIGHT_BLOB_OUTPUT_DIR: BLOB, PLAYWRIGHT_BLOB_FILE_NAME: `shard-${i}.zip`, PLAYWRIGHT_BLOB_DO_NOT_REMOVE: '1' },
      });
      const kill = setTimeout(() => (console.error(`[e2e:all] ${group.join(' ')} over ${LIMIT_S} s — stopped`), killTree(p.pid) ?? p.kill()), LIMIT_S * 1000);
      p.on('exit', (c) => (clearTimeout(kill), resolve(c)));
    });
    times.push(`${group.join(' ').replaceAll('--project=', '')} ${sec(Date.now() - s)}${code === 0 ? '' : ` (exit ${code})`}`);
    if (code !== 0) failed = true;
  }
} finally {
  stopServer();
}
spawnSync(npx, ['playwright', 'merge-reports', '--reporter=list,html', BLOB], { stdio: 'inherit', shell: process.platform === 'win32' });
console.log(`[e2e:all] ${times.join(' · ')} · total ${sec(Date.now() - t0)} (build included)`);
process.exit(failed ? 1 : 0);
