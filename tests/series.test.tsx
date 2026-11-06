// @vitest-environment jsdom
// Round 14 (item 5): the season series — which meeting a game is ("G2/4") and the series state, counted over
// regular-season games only (Cup group games and Cup quarter / semifinals included, the Cup Championship, play-in and
// playoffs not: NBA.com "NBA Cup 101"), and where it shows: the chip on Slate cards, League List and Team List rows; the
// tooltip in the week view and Team Calendar cells; the popup (squares, status, links, jump to the day).

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { gameLinkUrl } from '../src/config';
import { leagueSeries, seriesChip, seriesStatus } from '../src/data/series';
import { TEAM_BY_ID } from '../src/data/teams';
import { SlateDay } from '../src/slate/SlateCard';
import { useSeriesPopup } from '../src/slate/series';
import { hoopsjunkieLink } from '../src/slate/links';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import type { CalendarData } from '../src/data/model';
import { dataOf, game, TEAM } from './synthetic';
import { data, feed } from './feed';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const tri = (id: number) => TEAM_BY_ID.get(id)!.tricode;
const NOW = Date.parse('2026-11-15T15:00:00Z');

describe('the model', () => {
  it('real feed: every regular-season game is meeting n of N of its pair, counted independently from the raw feed', () => {
    const series = leagueSeries(data);
    // independent: the raw feed's regular-season games (gameId 002…), by unordered team pair, in date / tip-off order
    const raw = feed.games.filter((g) => g.gameId.startsWith('002') && g.homeTeam.teamId && g.awayTeam.teamId);
    const pairs = new Map<string, typeof raw>();
    for (const g of raw) {
      const k = [g.homeTeam.teamId, g.awayTeam.teamId].sort().join('-');
      pairs.set(k, [...(pairs.get(k) ?? []), g]);
    }
    let n = 0;
    for (const games of pairs.values()) {
      games.sort((a, b) => a.dateEt.localeCompare(b.dateEt) || (a.startTimeUtc ?? '').localeCompare(b.startTimeUtc ?? ''));
      games.forEach((g, i) => {
        const s = series.get(g.gameId)!;
        expect(s, g.gameId).toBeDefined();
        expect([s.n, s.series.games.length]).toEqual([i + 1, games.length]);
        n++;
      });
    }
    expect(series.size).toBe(n);
    // 2026-27: every pair meets 2, 3 or 4 times in the regular season (Cup knockout games, once placed, can add one)
    expect(new Set([...pairs.values()].map((g) => g.length))).toEqual(new Set([2, 3, 4]));
  });

  it('the Cup Championship, play-in and playoffs are no meetings; Cup group and knockout games are', () => {
    const d = dataOf([
      game({ date: '2026-11-01', utc: '2026-11-02T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK, final: [100, 110] }),
      game({ date: '2026-11-07', utc: '2026-11-08T00:00:00Z', home: TEAM.NYK, away: TEAM.BOS, subtype: 'in-season', subLabel: 'East Group A' }),
      game({ date: '2026-12-08', utc: '2026-12-09T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK, subtype: 'in-season-knockout', subLabel: 'Semifinal' }),
      game({ date: '2026-12-11', utc: '2026-12-12T01:00:00Z', home: TEAM.BOS, away: TEAM.NYK, prefix: '006' }),
      game({ date: '2027-04-15', utc: '2027-04-16T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK, prefix: '005' }),
      game({ date: '2027-04-20', utc: '2027-04-21T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK, prefix: '004' }),
    ]);
    const all = [...d.games];
    const s = leagueSeries(d);
    expect(all.filter((g) => s.has(g.gameId)).map((g) => g.dateEt)).toEqual(['2026-11-01', '2026-11-07', '2026-12-08']);
    expect(all.filter((g) => s.has(g.gameId)).map((g) => seriesChip(s.get(g.gameId)!))).toEqual(['G1/3', 'G2/3', 'G3/3']);
  });

  it('status: none played, a lead, tied, split, won', () => {
    const mk = (finals: ([number, number] | undefined)[]) => {
      const d = dataOf(finals.map((f, i) => game({ date: `2026-11-0${i + 1}`, utc: `2026-11-0${i + 1}T23:00:00Z`, home: TEAM.BOS, away: TEAM.NYK, final: f })));
      return seriesStatus(leagueSeries(d).values().next().value!.series, tri);
    };
    expect(mk([undefined, undefined])).toBe('No games played yet');
    expect(mk([undefined])).toBe('Only meeting');
    expect(mk([[100, 110], undefined, undefined])).toBe('BOS leads 1–0'); // away NYK 100, home BOS 110
    expect(mk([[100, 110], [120, 101], undefined])).toBe('Series tied 1–1');
    expect(mk([[100, 110], [120, 101]])).toBe('Series split 1–1');
    expect(mk([[100, 110], [99, 101], [90, 91]])).toBe('BOS won 3–0');
  });
});

const first = (d: CalendarData, pred: (g: ScheduleGame) => boolean) => d.games.find(pred)!;

describe('where it shows', () => {
  it('Slate cards: the chip in the strip on every regular-season card, none on the Cup Final', () => {
    const date = [...data.byDate.keys()].find((k) => data.byDate.get(k)!.length >= 8)!;
    render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" />);
    for (const card of document.querySelectorAll<HTMLElement>('.ck-slate-card')) {
      const s = leagueSeries(data).get(card.dataset.gameId!)!;
      expect(card.querySelector('.ck-slate-strip [data-testid="series-chip"]')!.textContent).toBe(seriesChip(s));
    }
    cleanup();
    const final = first(data, (g) => g.gameType === 'cup-final');
    render(<SlateDay data={data} date={final.dateEt} width={1840} timeZone="UTC" />);
    expect(document.querySelector(`[data-game-id="${final.gameId}"] [data-testid="series-chip"]`)).toBeNull();
  });

  it('League List and Team List rows: the chip first among the tags', () => {
    const g = first(data, (x) => x.gameType === 'regular' && x.dateEt === '2026-11-02');
    render(<CalendarView data={data} size={{ width: 1600, height: 900 }} now={NOW} timeZone="UTC" initial={{ mode: 'league', layout: 'list', date: g.dateEt }} />);
    for (const row of screen.getByTestId('league-list').querySelectorAll<HTMLElement>('article[data-game-id]')) {
      const chip = row.querySelector('.ck-tags > [data-testid="series-chip"]')!;
      expect(chip.textContent).toBe(seriesChip(leagueSeries(data).get(row.dataset.gameId!)!));
      expect(chip.parentElement!.firstElementChild).toBe(chip);
    }
    cleanup();
    render(<CalendarView data={data} size={{ width: 1600, height: 900 }} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />);
    const rows = screen.getByTestId('team-list').querySelectorAll<HTMLElement>('article[data-game-id]');
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) expect(row.querySelector('[data-testid="series-chip"]')!.textContent).toBe(seriesChip(leagueSeries(data).get(row.dataset.gameId!)!));
  });

  it('tight views: no chip; the week view line and the Team Calendar card carry the series as their tooltip', () => {
    render(<CalendarView data={data} size={{ width: 1840, height: 1000 }} now={NOW} timeZone="UTC" initial={{ mode: 'league', layout: 'calendar', date: '2026-11-15' }} />);
    const lines = document.querySelectorAll<HTMLElement>('.ck-month-game');
    expect(lines.length).toBeGreaterThan(20);
    expect(document.querySelector('.ck-month-game [data-testid="series-chip"]')).toBeNull();
    for (const l of lines) {
      const s = leagueSeries(data).get(l.dataset.gameId!);
      if (s) expect(l.dataset.tip).toBe(`Season series: ${seriesChip(s)} · ${seriesStatus(s.series, tri)}`);
    }
    cleanup();
    render(<CalendarView data={data} size={{ width: 1840, height: 1000 }} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.LAL }} />);
    const cards = document.querySelectorAll<HTMLElement>('.ck-team-grid .ck-card[data-game-id]');
    expect(cards.length).toBeGreaterThan(5);
    expect(document.querySelector('.ck-team-grid [data-testid="series-chip"]')).toBeNull();
    for (const c of cards) expect(c.dataset.tip).toMatch(/^Season series: G\d\/\d · /);
  });
});

function Host({ d }: { d: CalendarData }) {
  const p = useSeriesPopup(d, { gameLink: hoopsjunkieLink });
  const date = [...d.byDate.keys()].find((k) => d.byDate.get(k)!.some((g) => leagueSeries(d).has(g.gameId)))!;
  return (
    <div {...p.handlers}>
      <SlateDay data={d} date={date} width={1840} timeZone="UTC" />
      {p.node}
    </div>
  );
}

describe('the popup', () => {
  it('hover the chip: one square per meeting in order, played = winner + score + date, to come = date only, this game outlined, status on top; each square = its game page (round 22, item 12); leaving closes it', async () => {
    vi.useFakeTimers();
    const d = dataOf([
      game({ date: '2026-11-01', utc: '2026-11-02T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK, final: [100, 110] }),
      game({ date: '2026-12-01', utc: '2026-12-02T00:00:00Z', home: TEAM.NYK, away: TEAM.BOS }),
      game({ date: '2027-01-05', utc: '2027-01-06T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK }),
    ]);
    render(<Host d={d} />);
    const chip = screen.getByTestId('series-chip');
    expect(chip.textContent).toBe('G1/3');
    fireEvent.mouseOver(chip);
    const pop = screen.getByTestId('series-popup');
    expect(screen.getByTestId('series-status').textContent).toBe('BOS leads 1–0');
    const sq = [...pop.querySelectorAll<HTMLElement>('[data-testid="series-square"]')];
    expect(sq.map((s) => s.dataset.gameId)).toEqual(d.games.map((g) => g.gameId));
    expect(sq[0]!.classList.contains('ck-series-current')).toBe(true);
    expect(sq[0]!.querySelector('.ck-series-win')!.textContent).toBe('BOS');
    expect(sq[0]!.querySelector('.ck-series-score')!.textContent).toBe('110–100');
    expect(sq[0]!.querySelector('.ck-series-date')!.textContent).toBe('Nov 1');
    expect(sq[1]!.classList.contains('ck-series-next')).toBe(true);
    expect(sq[1]!.querySelector('.ck-series-win, .ck-series-score')).toBeNull();
    // round 22 (item 12): the whole square is the game's page (played or to come), no separate "↗", no button
    for (const [i, s] of sq.entries()) {
      const a = s.querySelector<HTMLAnchorElement>(':scope > a[data-testid="series-link"]')!;
      expect([a.getAttribute('href'), a.target], `square ${i}`).toEqual([gameLinkUrl(d.games[i]!), '_blank']);
      expect(a.querySelector('.ck-series-date')).not.toBeNull();
      expect(s.querySelector('button')).toBeNull();
    }
    // the pointer moves from the chip onto the popup: it stays
    fireEvent.mouseOver(document.body.querySelector('.ck-slate-name')!);
    fireEvent.mouseEnter(pop);
    fireEvent.mouseOver(pop);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('series-popup')).not.toBeNull();
    // leave: closes after a moment
    fireEvent.mouseOver(document.body.querySelector('.ck-slate-name')!);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('series-popup')).toBeNull();
  });

  it('in calendarkit: every square is its game\'s hoopsjunkie page; a click stays on this page', () => {
    const g = first(data, (x) => x.gameType === 'regular' && x.dateEt === '2026-11-02');
    const s = leagueSeries(data).get(g.gameId)!;
    render(<CalendarView data={data} size={{ width: 1600, height: 900 }} now={NOW} timeZone="UTC" gameLink={hoopsjunkieLink} initial={{ mode: 'league', layout: 'slate', date: g.dateEt }} />);
    fireEvent.mouseOver(document.querySelector(`[data-game-id="${g.gameId}"] [data-testid="series-chip"]`)!);
    const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-testid="series-popup"] [data-testid="series-square"] > a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(s.series.games.map((x) => gameLinkUrl(x)));
    expect(links.every((a) => a.target === '_blank')).toBe(true);
    expect(screen.getByTestId('slate')).toBeTruthy();
  });
});
