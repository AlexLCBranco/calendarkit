// One-time download of the 30 NBA team logos to public/logos/<tricode>.svg. The app only uses these local files
// (never the NBA CDN at runtime). NBA team logos are trademarks of the NBA and its teams; stored locally for this
// personal project. Usage: npm run fetch-logos  (re-run only if a team changes its logo)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEAMS } from '../src/data/teams';

export const logoSourceUrl = (teamId: number) => `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;

const dir = join(import.meta.dirname, '..', 'public', 'logos');
mkdirSync(dir, { recursive: true });

let failed = 0;
for (const t of TEAMS) {
  const url = logoSourceUrl(t.id);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  // Files start with an XML declaration and/or a generator comment before <svg>.
  if (!res.ok || !/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/.test(body)) {
    console.error(`FAIL ${t.tricode} ${url}: HTTP ${res.status} ${res.headers.get('content-type')}`);
    failed++;
    continue;
  }
  writeFileSync(join(dir, `${t.tricode}.svg`), body);
  console.log(`ok   ${t.tricode} ${body.length} B`);
}
if (failed) {
  console.error(`${failed} logo(s) failed; nothing else to do — see above.`);
  process.exit(1);
}
