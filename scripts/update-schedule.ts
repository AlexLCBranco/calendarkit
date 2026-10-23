// Daily snapshot: download the schedule feed with the shared module's Node helper, check it parses, and save the
// raw JSON (unchanged, every field) to public/data/schedule.json, which the app reads. The browser cannot fetch
// cdn.nba.com directly (CORS allows only https://www.nba.com; see PROJECT.md "Probe").
// Usage: npx tsx scripts/update-schedule.ts [outFile]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fetchScheduleJson } from '../src/shared/nba-schedule/node';
import { parseSchedule } from '../src/shared/nba-schedule/parse';

const out = process.argv[2] ?? join(import.meta.dirname, '..', 'public', 'data', 'schedule.json');

const json = await fetchScheduleJson({ onRetry: (a, d, e) => console.warn(`retry ${a} in ${d}ms: ${e.message}`) });
const s = parseSchedule(json); // throws on an unexpected shape → nothing written
if (s.games.length < 100) throw new Error(`feed has only ${s.games.length} games; refusing to overwrite the snapshot`);

const text = JSON.stringify(json);
if (existsSync(out) && readFileSync(out, 'utf8') === text) {
  console.log(`unchanged: ${out}`);
} else {
  writeFileSync(out, text);
  console.log(`saved ${out}: season ${s.seasonYear}, ${s.games.length} games`);
}
