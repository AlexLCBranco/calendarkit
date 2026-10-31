// @vitest-environment jsdom
// Cup → Schedule (round 12): the Cup's nights by round, the League list (one night, round tabs, strip, ← / →, opening
// night), the Team list (Played / Remaining), back-to-backs from the whole schedule, non-Cup games left out, undecided
// knockout sides as "TBD", and the Standings | Schedule / League | Team switches (never remembered).

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import CupSchedule from '../src/components/CupSchedule';
import { cupGroupNumbers, cupLeagueTag, cupNightHeading, cupNights, cupOpeningNight, cupOpeningStop, cupStopHeading, cupStops, cupTeamTag, roundFirstNight, teamCupGames } from '../src/data/cupSchedule';
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

describe('Cup group play by round', () => {
  it('a team’s group games are numbered 1–4 in date order; Round N = every team’s Nth game, a split game in both rounds', () => {
    const n = cupGroupNumbers(data);
    expect(n.get(G.bosNyk.gameId)).toEqual({ away: 1, home: 1 });
    expect(n.get(G.miaBos.gameId)).toEqual({ away: 1, home: 2 }); // MIA's 1st, BOS's 2nd
    const stops = cupStops(data);
    expect(stops.map((x) => [x.key, x.round, x.games.map((g) => g.gameId)])).toEqual([
      ['r1', 'group', [G.bosNyk.gameId, G.lalDen.gameId, G.miaBos.gameId]],
      ['r2', 'group', [G.miaBos.gameId]],
      ['2026-12-04', 'qf', [G.qf1.gameId, G.qf2.gameId]],
      ['2026-12-08', 'sf', [G.sf.gameId]],
      ['2026-12-11', 'final', [G.final.gameId]],
    ]);
    expect(stops.map(cupStopHeading)).toEqual(['Group play · Round 1 · Nov 6 – 10', 'Group play · Round 2 · Nov 10', 'Quarterfinals · Fri, Dec 4', 'Semifinals · Tue, Dec 8', 'Final · Fri, Dec 11']);
    expect(cupLeagueTag(data)(G.miaBos)).toBe('East C · G1/G2');
    expect(cupLeagueTag(data)(G.lalDen)).toBe('West A');
    expect(cupTeamTag(data, TEAM.BOS)(G.miaBos)).toBe('Group round 2 · East C');
    expect(cupTeamTag(data, MIA)(G.miaBos)).toBe('Group round 1 · East C');
  });

  it('the real feed: 4 rounds, every team exactly once in each, all 60 group games; 16 split games in two rounds each', () => {
    const stops = cupStops(realData).filter((x) => x.group !== undefined);
    expect(stops.map((x) => x.group)).toEqual([1, 2, 3, 4]);
    for (const r of stops) {
      const teams = r.games.flatMap((g) => {
        const n = cupGroupNumbers(realData).get(g.gameId)!;
        return [...(n.away === r.group ? [g.awayTeam.teamId] : []), ...(n.home === r.group ? [g.homeTeam.teamId] : [])];
      });
      expect(new Set(teams).size).toBe(30);
      expect(teams).toHaveLength(30);
    }
    const all = stops.flatMap((x) => x.games.map((g) => g.gameId));
    expect(new Set(all).size).toBe(60);
    expect(all.length - 60).toBe(16);
  });
});

describe('Cup League list', () => {
  it('opening: before the Cup Round 1; a round still being played; between rounds the next; after the Final the Final', () => {
    const stops = cupStops(data);
    expect(cupOpeningStop(stops, '2026-10-01')).toBe('r1');
    expect(cupOpeningStop(stops, '2026-11-10')).toBe('r1'); // Round 1 ends Nov 10 (MIA's 1st)
    expect(cupOpeningStop(stops, '2026-11-11')).toBe('2026-12-04');
    expect(cupOpeningStop(stops, '2026-12-11')).toBe('2026-12-11');
    expect(cupOpeningStop(stops, '2027-02-01')).toBe('2026-12-11');
    expect(cupOpeningNight(cupNights(data), '2026-11-07')).toBe('2026-11-10'); // nights (selection images) unchanged
    for (const [today, shown] of [['2026-10-01', 'Group play · Round 1 · Nov 6 – 10'], ['2026-11-11', 'Quarterfinals · Fri, Dec 4'], ['2027-02-01', 'Final · Fri, Dec 11']]) {
      league(today!);
      expect(heading()).toBe(shown);
      cleanup();
    }
  });

  it('strip: Round 1–4 then the knockout nights; round tabs jump; ‹ › and ← / → step', () => {
    league('2026-10-01');
    const strip = [...document.querySelectorAll<HTMLElement>('.ck-cup-strip .ck-strip-day')];
    expect(strip.map((d) => d.dataset.date)).toEqual(['r1', 'r2', '2026-12-04', '2026-12-08', '2026-12-11']);
    expect(strip.slice(0, 2).map((d) => d.textContent)).toEqual(['Round13', 'Round21']);
    expect(strip.map((d) => d.querySelector('.ck-strip-sub')!.textContent)).toEqual(['3', '1', '2', '1', '1']);
    const rounds = within(screen.getByRole('tablist', { name: 'Round' }));
    expect(rounds.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Group play', 'Quarterfinals', 'Semifinals', 'Final']);
    fireEvent.click(rounds.getByRole('tab', { name: 'Semifinals' }));
    expect(heading()).toBe('Semifinals · Tue, Dec 8');
    expect(rounds.getByRole('tab', { name: 'Semifinals' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Previous stop' }));
    expect(heading()).toBe('Quarterfinals · Fri, Dec 4');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(heading()).toBe('Group play · Round 2 · Nov 10');
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true }); // a modifier: ignored
    expect(heading()).toBe('Group play · Round 2 · Nov 10');
    fireEvent.click(rounds.getByRole('tab', { name: 'Group play' }));
    expect(heading()).toBe('Group play · Round 1 · Nov 6 – 10');
    fireEvent.click(strip[4]!);
    expect(heading()).toBe('Final · Fri, Dec 11');
    expect(screen.getByRole('button', { name: 'Next stop' })).toHaveProperty('disabled', true);
  });

  it('a round: two columns, each row with its date and tag; a knockout night: one column, no date column', () => {
    league('2026-10-01');
    const list = document.querySelector<HTMLElement>('[data-testid="cup-night"] .ck-daylist')!;
    expect(list.classList.contains('ck-daylist-cols')).toBe(true);
    expect(list.style.getPropertyValue('--ck-cols')).toBe('2');
    expect([...list.querySelectorAll('.ck-card .ck-date')].map((d) => d.textContent)).toEqual(['Fri 06/11', 'Fri 06/11', 'Tue 10/11']);
    expect(row(G.miaBos.gameId).querySelector('.ck-tag.ck-cup')!.textContent).toBe('East C · G1/G2');
    fireEvent.click(screen.getByRole('button', { name: 'Next stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next stop' }));
    const ko = document.querySelector<HTMLElement>('[data-testid="cup-night"] .ck-daylist')!;
    expect(ko.classList.contains('ck-daylist-cols')).toBe(false);
    expect(ko.querySelector('.ck-date')).toBeNull();
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
    league('2026-10-01');
    expect(row(G.lalDen.gameId).querySelector('.ck-tag.ck-cup')!.textContent).toBe('West A');
    expect(row(G.bosNyk.gameId).querySelector('.ck-teams')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('NYK 100 @ 110 BOS');
  });

  it('back-to-back from the whole schedule: BOS played a non-Cup game the night before its Cup game → 2nd night', () => {
    // a round (two columns): the marks on the tricodes (yellow fill = 2nd night)
    league('2026-10-01');
    const marks = [...row(G.miaBos.gameId).querySelectorAll<HTMLElement>('.ck-fm')];
    expect(marks.filter((m) => m.classList.contains('ck-fm-n2')).map((m) => m.textContent)).toEqual(['BOS']);
    expect(marks.filter((m) => m.classList.contains('ck-fm-n1'))).toHaveLength(0);
    cleanup();
    // a knockout night (one column): the Fatigue components — BOS played a non-Cup game the night before its QF
    const d = dataOf([...Object.values(G), game({ date: '2026-12-03', utc: at('2026-12-04', 0), home: MIA, away: TEAM.BOS })]);
    league('2026-12-04', d);
    const fx = [...row(G.qf1.gameId).querySelectorAll<HTMLElement>('[data-testid="fatigue"]')];
    expect(fx.filter((f) => f.dataset.night === '2')).toHaveLength(1);
    expect(fx.filter((f) => f.dataset.night === '2')[0]!.dataset.tip).toContain('BOS');
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
    expect(row(G.miaBos.gameId).querySelector('.ck-tag.ck-cup')!.textContent).toBe('Group round 2 · East C');
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
