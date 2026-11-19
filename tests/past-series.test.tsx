// @vitest-environment jsdom
// CK-17: the season-series popup's earlier seasons — picking a season's meetings, and the ◀ season ▶ switch.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPastSeasons, pastMeetings, pastStatus, seasonBefore, type PastSeasons } from '../src/data/pastSeries';
import { useSeriesPopup } from '../src/slate/series';
import { SlateDay } from '../src/slate/SlateCard';
import { leagueSeries } from '../src/data/series';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const file = JSON.parse(readFileSync('public/data/past-seasons.json', 'utf8')) as PastSeasons;

describe('the file', () => {
  it('the two seasons before this one, 1230 games each (the Cup Championship left out)', () => {
    expect(Object.keys(file.seasons).sort()).toEqual([seasonBefore(data.seasonYear, 2), seasonBefore(data.seasonYear, 1)]);
    for (const games of Object.values(file.seasons)) expect(games).toHaveLength(1230);
  });
});

describe('picking a season\'s meetings', () => {
  const f: PastSeasons = {
    seasons: {
      '2025-26': [
        ['2025-11-01', 'BOS', 'DEN', 110, 100],
        ['2025-11-02', 'BOS', 'NYK', 99, 98],
        ['2026-01-03', 'DEN', 'BOS', 120, 118, 'OT'],
      ],
    },
  };
  it('both orders, date order, only that pair', () => {
    expect(pastMeetings(f, '2025-26', 'DEN', 'BOS').map((g) => g[0])).toEqual(['2025-11-01', '2026-01-03']);
    expect(pastMeetings(f, '2024-25', 'DEN', 'BOS')).toEqual([]);
  });
  it('the finished series in words', () => {
    expect(pastStatus(pastMeetings(f, '2025-26', 'BOS', 'DEN'), 'BOS', 'DEN')).toBe('Series split 1–1');
    expect(pastStatus([['2025-11-01', 'BOS', 'DEN', 110, 100]], 'BOS', 'DEN')).toBe('BOS won 1–0');
    expect(pastStatus([], 'BOS', 'DEN')).toBe('No meetings');
  });
  it('seasons back', () => {
    expect(seasonBefore('2026-27', 1)).toBe('2025-26');
    expect(seasonBefore('2026-27', 2)).toBe('2024-25');
  });
});

function Host() {
  const pop = useSeriesPopup(data);
  return (
    <div {...pop.handlers}>
      <SlateDay data={data} date="2026-11-16" width={1840} timeZone="UTC" />
      {pop.node}
    </div>
  );
}

describe('the switch', () => {
  it('◀ shows last season\'s meetings and their count; ▶ comes back; ◀ stops two seasons back', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(file)));
    await loadPastSeasons(); // the page's one load, from the stub
    render(<Host />);
    const chip = screen.getAllByTestId('series-chip')[0]!;
    fireEvent.mouseOver(chip);
    const s = leagueSeries(data).get(chip.getAttribute('data-series-game')!)!;
    const count = () => screen.getByTestId('series-count').textContent;
    expect(screen.getByTestId('series-season').textContent).toBe(data.seasonYear);
    expect(count()).toBe(` · ${s.series.games.length} meeting${s.series.games.length === 1 ? '' : 's'}`);
    await act(async () => fireEvent.click(screen.getByTestId('series-prev-season')));
    expect(screen.getByTestId('series-season').textContent).toBe(seasonBefore(data.seasonYear, 1));
    const tris = screen.getByTestId('series-popup').querySelector('.ck-series-title')!.textContent!.slice(0, 9).split(' – ');
    const want = pastMeetings(file, seasonBefore(data.seasonYear, 1), tris[0]!, tris[1]!);
    expect(want.length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('series-square')).toHaveLength(want.length);
    expect(count()).toBe(` · ${want.length} meeting${want.length === 1 ? '' : 's'}`);
    await act(async () => fireEvent.click(screen.getByTestId('series-prev-season')));
    expect(screen.getByTestId('series-season').textContent).toBe(seasonBefore(data.seasonYear, 2));
    expect((screen.getByTestId('series-prev-season') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.click(screen.getByTestId('series-next-season')));
    await act(async () => fireEvent.click(screen.getByTestId('series-next-season')));
    expect(screen.getByTestId('series-season').textContent).toBe(data.seasonYear);
    expect(screen.getAllByTestId('series-square')).toHaveLength(s.series.games.length);
  });
});
