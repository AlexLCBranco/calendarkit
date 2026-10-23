// Run the Playwright smoke test against a deployed site (cross-platform; no shell env prefix).
// Usage: npm run e2e:live -- https://calendarkit.vercel.app
import { spawnSync } from 'node:child_process';

const url = process.argv[2];
if (!url) {
  console.error('usage: npm run e2e:live -- <base url>');
  process.exit(2);
}
const r = spawnSync('npx', ['playwright', 'test'], { stdio: 'inherit', shell: true, env: { ...process.env, E2E_BASE_URL: url } });
process.exit(r.status ?? 1);
