// gauntlet GT-5: the Slate kit (src/slate/kit.ts), loaded by the gauntlet's whiteboard at run time from
// /calendar/slatekit/. These are the names the gauntlet's Slate widget uses (its src/slate/kit.ts): removing or
// changing one needs SLATEKIT_API bumped, so an older gauntlet keeps its own pinned copy instead of breaking.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as kit from '../src/slate/kit';

const USED = [
  'calendarDataFromRaw', 'claimPopup', 'createNotesStore', 'createOddsStore', 'hoopsjunkieLink', 'liveOddsStore', 'loadCalendarData', 'localNotesStore', 'refreshCalendarData', 'releasePopup',
  'SCHEDULE_CHECK_MS', 'SlateCopy', 'slateCardWidth', 'slateCopyCardWidth', 'slateCopyCup', 'slateGames', 'SLATE_GRID_GAP',
  'teamCalendarUrl', 'teamLinkTarget', 'TeamLinkContext', 'useSeriesPopup', 'useStreakPopup', 'useTooltip', 'withFinals',
];

describe('the Slate kit', () => {
  it('has every name the gauntlet uses, and an API version', () => {
    for (const name of USED) expect(kit, name).toHaveProperty(name);
    expect(kit.SLATEKIT_API).toBe(1);
  });

  it('is built with the app, with a manifest, React from the page, and no cache on the manifest', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.build).toContain('vite build --config vite.slatekit.config.ts');
    const config = readFileSync('vite.slatekit.config.ts', 'utf8');
    expect(config).toContain('globalThis.__calendarkitHost');
    expect(config).toContain("'react/jsx-runtime'");
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { value: string }[] }[] };
    expect(vercel.headers.find((h) => h.source === '/calendar/slatekit/manifest.json')?.headers[0]?.value).toBe('no-cache');
  });
});
