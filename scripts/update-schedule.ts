// Daily snapshot: download the schedule feed with the shared module's Node helper, check it parses, and save the
// raw JSON (unchanged, every field) to public/data/schedule.json, which the app reads. The browser cannot fetch
// cdn.nba.com directly (CORS allows only https://www.nba.com; see PROJECT.md "Probe").
// Plus `calendarkit.regulation` — regulation-time totals of finished Cup group games, from each game's
// boxscore, fetched once per game (games already in the previous snapshot are carried over; see src/data/regulation.ts).
// Usage: npx tsx scripts/update-schedule.ts [outFile]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fetchScheduleJson } from '../src/shared/nba-schedule/node';
import { parseSchedule } from '../src/shared/nba-schedule/parse';
import { collectRegulation, storedRegulation } from '../src/data/regulation';

const out = process.argv[2] ?? join(import.meta.dirname, '..', 'public', 'data', 'schedule.json');
const boxUrl = (id: string) => `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${id}.json`;

const json = (await fetchScheduleJson({ onRetry: (a, d, e) => console.warn(`retry ${a} in ${d}ms: ${e.message}`) })) as Record<string, unknown>;
const s = parseSchedule(json); // throws on an unexpected shape → nothing written
if (s.games.length < 100) throw new Error(`feed has only ${s.games.length} games; refusing to overwrite the snapshot`);

const before = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
let previous = {};
try {
  previous = before ? storedRegulation(JSON.parse(before)) : {};
} catch {
  console.warn('previous snapshot unreadable; fetching every Cup boxscore again');
}
const { regulation, fetched } = await collectRegulation(s.games, previous, (id) => fetchScheduleJson({ url: boxUrl(id), retryDelaysMs: [2000] }), (m) => console.warn(`::warning::${m}`));
console.log(`Cup regulation totals: ${Object.keys(regulation).length} games (${fetched.length} boxscore(s) fetched${fetched.length ? `: ${fetched.join(', ')}` : ''})`);

const text = JSON.stringify({ ...json, calendarkit: { regulation } });
if (before === text) {
  console.log(`unchanged: ${out}`);
} else {
  writeFileSync(out, text);
  console.log(`saved ${out}: season ${s.seasonYear}, ${s.games.length} games`);
}
