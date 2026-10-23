// @vitest-environment jsdom
// GameCard: matchup, markers, national TV badge, TBD, and the rotationkit action contract.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameCard } from '../src/components/GameCard';
import { openGameInRotationkit } from '../src/App';
import { rotationkitUrl } from '../src/rotationkit';
import { ROTATIONKIT_BASE_URL } from '../src/config';
import { game, TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-11-10T12:00:00Z');
const past = game({ id: '0022600100', date: '2026-11-05', utc: '2026-11-06T00:30:00Z', natl: ['ESPN'] });
const future = game({ id: '0022600200', date: '2026-11-20', utc: '2026-11-21T00:30:00Z' });

const card = (el: ReturnType<typeof render>) => el.container.querySelector('article')!;

describe('GameCard', () => {
  it('league view: AWAY @ HOME; team view: vs / @ relative to the selected team', () => {
    render(<GameCard game={future} now={NOW} timeZone="UTC" />);
    expect(screen.getByRole('article').textContent).toMatch(/NYK @ BOS/);
    cleanup();
    render(<GameCard game={future} teamId={TEAM.BOS} now={NOW} timeZone="UTC" />);
    expect(screen.getByRole('article').textContent).toMatch(/vs NYK/);
    cleanup();
    render(<GameCard game={future} teamId={TEAM.NYK} now={NOW} timeZone="UTC" />);
    expect(screen.getByRole('article').textContent).toMatch(/@ BOS/);
  });

  it('TBD time renders "TBD", never a guessed time; undecided teams show TBD', () => {
    const tbd = game({ date: '2026-12-04', utc: null, home: 0, away: 0, subtype: 'in-season-knockout', subLabel: 'Quarterfinal' });
    expect(tbd.timeTbd && tbd.teamsTbd).toBe(true);
    const el = render(<GameCard game={tbd} now={NOW} timeZone="UTC" />);
    expect(screen.getByTestId('tipoff').textContent).toBe('TBD');
    expect(card(el).textContent).toMatch(/TBD @ TBD/);
    expect(card(el).textContent).not.toMatch(/\d{2}:\d{2}/);
  });

  it('shows tip-off with a (+1) marker when it falls on the next local day', () => {
    // 22:30 ET on Nov 5 = 03:30Z Nov 6.
    const late = game({ date: '2026-11-05', utc: '2026-11-06T03:30:00Z' });
    render(<GameCard game={late} now={NOW} timeZone="America/Sao_Paulo" />);
    expect(screen.getByTestId('tipoff').textContent).toBe('00:30 (+1)');
    cleanup();
    render(<GameCard game={late} now={NOW} timeZone="America/Los_Angeles" />);
    expect(screen.getByTestId('tipoff').textContent).toBe('19:30');
  });

  it('markers: Cup group, Cup knockout round, Cup final labeled as the final, Play-In, Playoffs with round', () => {
    const cases: [ReturnType<typeof game>, RegExp][] = [
      [game({ date: '2026-11-14', utc: '2026-11-15T00:00:00Z', subtype: 'in-season', subLabel: 'East Group A', raw: { gameLabel: 'Emirates NBA Cup' } }), /NBA Cup · East Group A/],
      [game({ date: '2026-12-09', utc: '2026-12-10T00:00:00Z', subtype: 'in-season-knockout', subLabel: 'Semifinal' }), /NBA Cup Semifinal/],
      [game({ id: '0062600001', date: '2026-12-11', utc: '2026-12-12T01:00:00Z', subtype: 'in-season-knockout', subLabel: 'Championship' }), /NBA Cup Final/],
      [game({ id: '0052600101', date: '2027-04-14', utc: '2027-04-14T23:30:00Z' }), /Play-In Tournament/],
      [game({ id: '0042600101', date: '2027-04-18', utc: '2027-04-18T17:00:00Z' }), /Playoffs · First Round/],
      [game({ id: '0042600211', date: '2027-05-04', utc: '2027-05-04T23:00:00Z' }), /Playoffs · Conf\. Semifinals/],
      [game({ id: '0042600301', date: '2027-05-20', utc: '2027-05-21T00:30:00Z' }), /Playoffs · Conf\. Finals/],
      [game({ id: '0042600401', date: '2027-06-03', utc: '2027-06-04T00:30:00Z' }), /Playoffs · NBA Finals/],
    ];
    for (const [g, re] of cases) {
      const el = render(<GameCard game={g} now={NOW} timeZone="UTC" />);
      expect(card(el).textContent, g.gameId).toMatch(re);
      cleanup();
    }
    const plain = render(<GameCard game={future} now={NOW} timeZone="UTC" />);
    expect(plain.container.querySelectorAll('.ck-cup, .ck-cup-final, .ck-play-in, .ck-playoffs')).toHaveLength(0);
  });

  it('national TV badge lists the national broadcasters only (no local/regional networks)', () => {
    const g = game({ date: '2026-11-14', utc: '2026-11-15T00:00:00Z', natl: ['NBC', 'Peacock', 'NBC'] });
    g.broadcasters.homeTvBroadcasters = [{ ...g.broadcasters.nationalBroadcasters![0]!, broadcasterDisplay: 'NBC Sports Boston' }];
    render(<GameCard game={g} now={NOW} timeZone="UTC" />);
    expect(screen.getByTestId('tv-badge').textContent).toBe('NBC · Peacock');
    expect(screen.getByRole('article').textContent).not.toMatch(/Sports Boston|League Pass/);
    cleanup();
    render(<GameCard game={future} now={NOW} timeZone="UTC" />);
    expect(screen.queryByTestId('tv-badge')).toBeNull();
  });

  it('back-to-back marker per team', () => {
    const el = render(<GameCard game={future} backToBackTeamIds={[TEAM.NYK]} now={NOW} timeZone="UTC" />);
    expect(el.container.querySelectorAll('.ck-b2b')).toHaveLength(1);
    expect(el.container.querySelector('.ck-b2b')!.getAttribute('title')).toMatch(/NYK/);
  });
});

describe('rotationkit action (contract)', () => {
  it('past game (tip-off + 3 h in the past): action raises onOpenGame(gameId); card opens nothing itself', () => {
    const onOpenGame = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<GameCard game={past} now={NOW} timeZone="UTC" onOpenGame={onOpenGame} />);
    fireEvent.click(screen.getByTestId('open-game'));
    expect(onOpenGame).toHaveBeenCalledWith('0022600100');
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('article').querySelector('a')).toBeNull();
    open.mockRestore();
  });

  it('future game, or game still within tip-off + 3 h: no action', () => {
    render(<GameCard game={future} now={NOW} timeZone="UTC" onOpenGame={() => {}} />);
    expect(screen.queryByTestId('open-game')).toBeNull();
    cleanup();
    const tip = Date.parse(past.startTimeUtc!);
    render(<GameCard game={past} now={tip + 2.9 * 3600_000} timeZone="UTC" onOpenGame={() => {}} />);
    expect(screen.queryByTestId('open-game')).toBeNull();
    cleanup();
    render(<GameCard game={past} now={tip + 3.1 * 3600_000} timeZone="UTC" onOpenGame={() => {}} />);
    expect(screen.getByTestId('open-game')).toBeTruthy();
  });

  it('app shell opens ROTATIONKIT_BASE_URL + "/?game=" + gameId', () => {
    const opened: string[] = [];
    openGameInRotationkit('0022600100', (u) => opened.push(u));
    expect(opened).toEqual([`${ROTATIONKIT_BASE_URL}/?game=0022600100`]);
    expect(rotationkitUrl('0022600100', 'https://rk.example.app/')).toBe('https://rk.example.app/?game=0022600100');
    expect(rotationkitUrl('0022600100', 'https://rk.example.app')).toBe('https://rk.example.app/?game=0022600100');
  });
});
