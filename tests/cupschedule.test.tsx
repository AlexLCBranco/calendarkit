// @vitest-environment jsdom
// Cup → Schedule (round 12): the Cup's nights by round, the League list (one night, round tabs, strip, ← / →, opening
// night), the Team list (Played / Remaining), back-to-backs from the whole schedule, non-Cup games left out, undecided
// knockout sides as "TBD", and the Standings | Schedule / League | Team switches (never remembered).

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import CupSchedule from '../src/components/CupSchedule';
import { cupNightHeading, cupNights, cupOpeningNight, roundFirstNight, teamCupGames } from '../src/data/cupSchedule';
import { cupTag } from '../src/data/model';
import { data as realData } from './feed';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-10-31T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const MIA = TEAM.MIA;
const at = (date: string, hour = 0) => `${date}T${String(hour).padStart(2, '0')}:00:00Z`;

// A small Cup season: two group nights, a quarterfinal night (one game assigned, one not, and a non-Cup game), a
// semifinal and the Final (undecided), non-Cup nights around them.
const G = {
  bosNyk: game({ date: '2026-11-06', utc: at('2026-11-07', 0), home: TEAM.BOS, away: TEAM.NYK, subtype: 'in-season', subLabel: 'East Group C', final: [100, 110] }),
  lalDen: game({ date: '2026-11-06', utc: at('2026-11-07', 3), home: TEAM.LAL, away: TEAM.DEN, subtype: 'in-season', subLabel: 'West Group A', final: [121, 117] }),
  denLal: game({ date: '2026-11-07', utc: at('2026-11-08', 2), home: TEAM.LAL, away: TEAM.DEN }), // not a Cup game
  bosAtNyk: game({ date: '2026-11-09', utc: at('2026-11-10', 0), home: TEAM.NYK, away: TEAM.BOS }), // not a Cup game: BOS's 1st night
  miaBos: game({ date: '2026-11-10', utc: at('2026-11-11', 0), home: TEAM.BOS, away: MIA, subtype: 'in-season', subLabel: 'East Group C' }),
  qf1: game({ date: '2026-12-04', utc: at('2026-12-05', 0), home: TEAM.BOS, away: TEAM.NYK, subtype: 'in-season-knockout', subLabel: 'Quarterfinal' }),
  qf2: game({ date: '2026-12-04', utc: null, home: 0, away: 0, subtype: 'in-season-knockout', subLabel: 'Quarterfinal' }),
  other: game({ date: '2026-12-04', utc: at('2026-12-05', 2), home: TEAM.DEN, away: TEAM.LAL }), // not a Cup game, on a QF night
  sf: game({ date: '2026-12-08', utc: null, home: 0, away: 0, subtype: 'in-season-knockout', subLabel: 'Semifinal' }),
  final: game({ date: '2026-12-11', utc: at('2026-12-12', 1), home: 0, away: 0, subtype: 'in-season-knockout', subLabel: 'Championship', prefix: '006' }),
};
const data = dataOf(Object.values(G));
const ids = (sel: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(`${sel} [data-game-id]`)].map((e) => e.dataset.gameId);
const row = (id: string) => document.querySelector<HTMLElement>(`[data-game-id="${id}"]`)!;
const league = (today: string, d = data) => render(<CupSchedule data={d} list="league" size={XL} now={NOW} today={today} timeZone="UTC" />);
const team = (teamId: number | undefined, d = data) => render(<CupSchedule data={d} list="team" teamId={teamId} size={XL} now={NOW} today="2026-10-31" timeZone="UTC" />);
const heading = () => document.querySelector('[data-testid="cup-night"] .ck-lday-head')!.textContent;

describe('Cup nights and rounds', () => {
  it('groups the Cup nights by round, in date order, Cup games only', () => {
    const nights = cupNights(data);
    expect(nights.map((n) => [n.date, n.round])).toEqual([
      ['2026-11-06', 'group'],
      ['2026-11-10', 'group'],
      ['2026-12-04', 'qf'],
      ['2026-12-08', 'sf'],
      ['2026-12-11', 'final'],
    ]);
    expect(nights.map((n) => n.games.map((g) => g.gameId))).toEqual([[G.bosNyk.gameId, G.lalDen.gameId], [G.miaBos.gameId], [G.qf1.gameId, G.qf2.gameId], [G.sf.gameId], [G.final.gameId]]);
    expect(roundFirstNight(nights, 'qf')).toBe('2026-12-04');
    expect(cupNightHeading(nights[0]!)).toBe('Group play · Fri, Nov 6');
    expect(cupNightHeading(nights[2]!)).toBe('Quarterfinals · Fri, Dec 4');
  });

  it('the real feed: 7 group nights (60 games), 2 quarterfinal nights, a semifinal night, the Final; nothing else', () => {
    const nights = cupNights(realData);
    const byRound = (r: string) => nights.filter((n) => n.round === r);
    expect(byRound('group')).toHaveLength(7);
    expect(byRound('group').flatMap((n) => n.games)).toHaveLength(60);
    expect(byRound('qf').map((n) => n.games.length)).toEqual([2, 2]);
    expect(byRound('sf').map((n) => n.games.length)).toEqual([2]);
    expect(byRound('final').map((n) => n.games.length)).toEqual([1]);
    expect(nights.flatMap((n) => n.games).every((g) => g.isCupGroupGame || g.isCupKnockout)).toBe(true);
  });

  it('tags: the group for group games ("West A"), the round for knockout games; with the round for the Team list', () => {
    expect([G.lalDen, G.qf1, G.sf, G.final].map((g) => cupTag(g))).toEqual(['West A', 'Quarterfinal', 'Semifinal', 'Final']);
    expect(cupTag(G.bosNyk, true)).toBe('Group play · East C');
    expect(cupTag(G.denLal)).toBeUndefined();
  });
});

describe('Cup League list', () => {
  it('opening night: before the Cup the first night, on a Cup night that night, between nights the next, after the Final the Final', () => {
    const nights = cupNights(data);
    expect(cupOpeningNight(nights, '2026-10-01')).toBe('2026-11-06');
    expect(cupOpeningNight(nights, '2026-11-10')).toBe('2026-11-10');
    expect(cupOpeningNight(nights, '2026-11-07')).toBe('2026-11-10');
    expect(cupOpeningNight(nights, '2026-12-11')).toBe('2026-12-11');
    expect(cupOpeningNight(nights, '2027-02-01')).toBe('2026-12-11');
    for (const [today, shown] of [['2026-10-01', 'Group play · Fri, Nov 6'], ['2026-11-07', 'Group play · Tue, Nov 10'], ['2027-02-01', 'Final · Fri, Dec 11']]) {
      league(today!);
      expect(heading()).toBe(shown);
      cleanup();
    }
  });

  it('strip of the Cup nights only; round tabs jump to a round’s first night; ‹ › and ← / → step the nights', () => {
    league('2026-10-01');
    const strip = [...document.querySelectorAll<HTMLElement>('.ck-cup-strip .ck-strip-day')];
    expect(strip.map((d) => d.dataset.date)).toEqual(['2026-11-06', '2026-11-10', '2026-12-04', '2026-12-08', '2026-12-11']);
    expect(strip.map((d) => d.querySelector('.ck-strip-sub')!.textContent)).toEqual(['2', '1', '2', '1', '1']);
    const rounds = within(screen.getByRole('tablist', { name: 'Round' }));
    expect(rounds.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Group play', 'Quarterfinals', 'Semifinals', 'Final']);
    fireEvent.click(rounds.getByRole('tab', { name: 'Semifinals' }));
    expect(heading()).toBe('Semifinals · Tue, Dec 8');
    expect(rounds.getByRole('tab', { name: 'Semifinals' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Previous night' }));
    expect(heading()).toBe('Quarterfinals · Fri, Dec 4');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(heading()).toBe('Group play · Tue, Nov 10');
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true }); // a modifier: ignored
    expect(heading()).toBe('Group play · Tue, Nov 10');
    fireEvent.click(strip[4]!);
    expect(heading()).toBe('Final · Fri, Dec 11');
    expect(screen.getByRole('button', { name: 'Next night' })).toHaveProperty('disabled', true);
  });

  it('a knockout night shows only its Cup games (the other game that night is left out); undecided sides are "TBD"', () => {
    league('2026-12-04');
    expect(ids('[data-testid="cup-night"]')).toEqual([G.qf1.gameId, G.qf2.gameId]);
    expect(row(G.qf2.gameId).querySelector('.ck-teams')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('TBD @ TBD');
    expect(row(G.qf1.gameId).querySelector('.ck-tag.ck-cup')!.textContent).toBe('Quarterfinal');
    expect(row(G.qf2.gameId).querySelector('.ck-time')!.textContent).toBe('TBD');
    expect(row(G.qf2.gameId).querySelector('img')).toBeNull(); // no logo for an undecided team
  });

  it('group games carry their group; finished games their final score', () => {
    league('2026-11-06');
    expect(row(G.lalDen.gameId).querySelector('.ck-tag.ck-cup')!.textContent).toBe('West A');
    expect(row(G.bosNyk.gameId).querySelector('.ck-teams')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('NYK 100 @ 110 BOS');
  });

  it('back-to-back from the whole schedule: BOS played a non-Cup game the night before its Cup game → 2nd night', () => {
    league('2026-11-10');
    const fx = [...row(G.miaBos.gameId).querySelectorAll<HTMLElement>('[data-testid="fatigue"]')];
    const second = fx.filter((f) => f.dataset.night === '2');
    expect(second).toHaveLength(1);
    expect(second[0]!.dataset.tip).toContain('BOS');
    expect(fx.filter((f) => f.dataset.night === '1')).toHaveLength(0);
  });
});

describe('Cup Team list', () => {
  const section = (s: 'played' | 'remaining') => document.querySelector(`[data-testid="cup-${s}"]`);
  const heads = () => [...document.querySelectorAll('.ck-cup-sec-head')].map((h) => h.textContent);

  it('Played: finished games with scores; Remaining: the rest, in date order, a knockout game once the team is in it', () => {
    team(TEAM.BOS);
    expect(heads()).toEqual(['Played', 'Remaining']);
    expect(ids('[data-testid="cup-played"]')).toEqual([G.bosNyk.gameId]);
    expect(row(G.bosNyk.gameId).querySelector('.ck-teams')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('BOS 110 vs 100 NYK');
    expect(ids('[data-testid="cup-remaining"]')).toEqual([G.miaBos.gameId, G.qf1.gameId]); // never the non-Cup games
    expect(row(G.miaBos.gameId).querySelector('.ck-tag.ck-cup')!.textContent).toBe('Group play · East C');
    expect(row(G.qf1.gameId).querySelector('.ck-tag.ck-cup')!.textContent).toBe('Quarterfinal');
    expect(row(G.qf1.gameId).querySelector('.ck-date')!.textContent).toBe('Fri 04/12');
    // the next game is marked in Remaining, nothing in Played
    expect(section('played')!.querySelector('[data-next]')).toBeNull();
    expect(section('remaining')!.querySelector('[data-next]')?.getAttribute('data-game-id')).toBe(G.miaBos.gameId);
  });

  it('back-to-back from the whole schedule, own and the opponent’s: BOS on its 2nd night (non-Cup game the night before)', () => {
    team(TEAM.BOS);
    expect(row(G.miaBos.gameId).querySelector<HTMLElement>('[data-testid="fatigue-team"] [data-testid="fatigue"]')!.dataset.night).toBe('2');
    cleanup();
    team(MIA);
    expect(row(G.miaBos.gameId).querySelector<HTMLElement>('[data-testid="fatigue-opp"] [data-testid="fatigue"]')!.dataset.night).toBe('2');
    expect(row(G.miaBos.gameId).querySelector<HTMLElement>('[data-testid="fatigue-team"] [data-testid="fatigue"]')!.dataset.night).toBeUndefined();
  });

  it('nothing left: "No remaining Cup games"; an empty section has no heading', () => {
    team(TEAM.DEN);
    expect(heads()).toEqual(['Played']);
    expect(ids('[data-testid="cup-played"]')).toEqual([G.lalDen.gameId]);
    expect(section('remaining')!.textContent).toBe('No remaining Cup games');
    cleanup();
    team(MIA);
    expect(heads()).toEqual(['Remaining']);
    expect(section('played')).toBeNull();
  });

  it('no team picked: the prompt, no list', () => {
    team(undefined);
    expect(screen.getByTestId('cup-pick').textContent).toMatch(/Pick a team/);
    expect(document.querySelector('[data-game-id]')).toBeNull();
  });

  it('teamCupGames: a team in no knockout game has none (never predicted)', () => {
    expect(teamCupGames(data, TEAM.LAL).remaining).toEqual([]);
    expect(teamCupGames(data, TEAM.NYK).remaining.map((g) => g.gameId)).toEqual([G.qf1.gameId]);
  });
});

describe('Cup view switches', () => {
  const open = () => render(<CalendarView data={realData} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'cup' }} />);
  const tabs = (name: string) => within(screen.getByRole('tablist', { name }));

  it('opens on Standings; Schedule opens on League; Team shows the picker until a team is picked; nothing remembered', async () => {
    open();
    expect(await screen.findByTestId('cup')).toBeTruthy(); // the standings
    expect(tabs('Cup view').getByRole('tab', { name: 'Standings' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tablist', { name: 'Cup list' })).toBeNull();
    fireEvent.click(tabs('Cup view').getByRole('tab', { name: 'Schedule' }));
    expect(await screen.findByTestId('cup-league')).toBeTruthy();
    expect(tabs('Cup list').getByRole('tab', { name: 'League' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tabs('Cup list').getByRole('tab', { name: 'Team' }));
    expect(screen.getByTestId('team-picker').textContent).toMatch(/Pick a team/);
    expect(screen.getByTestId('cup-pick')).toBeTruthy();
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(document.querySelector(`[role="option"][data-team-id="${TEAM.BOS}"]`)!);
    expect(screen.getByTestId('cup-team')).toBeTruthy();
    expect(screen.getByTestId('team-picker').textContent).toMatch(/Boston Celtics/);
    // leaving the Cup view and coming back: Standings again, and the team forgotten
    fireEvent.click(tabs('View').getByRole('tab', { name: 'League' }));
    fireEvent.click(tabs('View').getByRole('tab', { name: 'Cup' }));
    expect(await screen.findByTestId('cup')).toBeTruthy();
    expect(tabs('Cup view').getByRole('tab', { name: 'Standings' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tabs('Cup view').getByRole('tab', { name: 'Schedule' }));
    await screen.findByTestId('cup-league');
    fireEvent.click(tabs('Cup list').getByRole('tab', { name: 'Team' }));
    expect(screen.getByTestId('team-picker').textContent).toMatch(/Pick a team/);
    // a reload (a new widget) opens on Standings too
    cleanup();
    open();
    expect(await screen.findByTestId('cup')).toBeTruthy();
    await act(async () => {});
    expect(tabs('Cup view').getByRole('tab', { name: 'Standings' }).getAttribute('aria-selected')).toBe('true');
  });
});
