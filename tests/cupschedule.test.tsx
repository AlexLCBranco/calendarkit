// @vitest-environment jsdom
// Cup → Schedule: the Cup's nights, the League list By group / By date (the rounds are gone), the
// Team list (Played / Remaining), back-to-backs from the whole schedule, non-Cup games left out, undecided knockout sides
// as "TBD", and the Standings | Schedule / League | Team / By group | By date switches (never remembered).

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import CupSchedule from '../src/components/CupSchedule';
import { cupBoard, cupGroupNumbers, cupNightHeading, cupNights, cupOpeningNight, cupTeamTag, groupNumberLine, nightByGroup, teamCupGames } from '../src/data/cupSchedule';
import { cupTag, finalScore, tipoff } from '../src/data/model';
import type { ScheduleGame } from '../src/shared/nba-schedule/parse';
import { rowDate as rowDateOf } from '../src/components/TeamListView';
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
const league = (today: string, d = data, by: 'group' | 'date' = 'group') => render(<CupSchedule data={d} list="league" by={by} size={XL} now={NOW} today={today} timeZone="UTC" />);
const byDate = (today: string, d = data) => league(today, d, 'date');
const team = (teamId: number | undefined, d = data) => render(<CupSchedule data={d} list="team" teamId={teamId} size={XL} now={NOW} today="2026-10-31" timeZone="UTC" />);
const picked = () => document.querySelector<HTMLElement>('[data-testid="cup-night"][aria-current]')?.dataset.night;
const text = (e: Element | null) => e!.textContent!.replace(/\s+/g, ' ').trim();

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

describe('Cup group game numbers (tooltip and Team list tag)', () => {
  it('a team’s group games are numbered 1–4 in date order; the tooltip names a split game’s numbers', () => {
    const n = cupGroupNumbers(data);
    expect(n.get(G.bosNyk.gameId)).toEqual({ away: 1, home: 1 });
    expect(n.get(G.miaBos.gameId)).toEqual({ away: 1, home: 2 }); // MIA's 1st, BOS's 2nd
    expect(groupNumberLine(data, G.miaBos)).toBe("MIA's 1st group game, BOS's 2nd");
    expect(groupNumberLine(data, G.bosNyk)).toBe("Both teams' 1st group game");
    expect(groupNumberLine(data, G.qf1)).toBeUndefined();
    expect(cupTeamTag(data, TEAM.BOS)(G.miaBos)).toBe('Group round 2 · East C');
    expect(cupTeamTag(data, MIA)(G.miaBos)).toBe('Group round 1 · East C');
  });
});

/** What a row's result cell must say: the final score (away–home, OT after it) or the local tip-off. */
const expected = (g: ScheduleGame) => {
  const r = finalScore(g, g.awayTeam.teamId);
  return r ? `${r.score}–${r.oppScore}${/OT$/i.test(g.statusText) ? ` ${g.statusText.split('/')[1]}` : ''}` : tipoff(g, 'UTC').label;
};

describe('Cup League list · By group', () => {
  it('cupBoard: each group’s games in date order (West A … East C), the knockout games by round', () => {
    const b = cupBoard(data);
    expect(b.groups.map((x) => [x.label, x.games.map((g) => g.gameId)])).toEqual([
      ['West Group A', [G.lalDen.gameId]],
      ['East Group C', [G.bosNyk.gameId, G.miaBos.gameId]],
    ]);
    expect([b.qf, b.sf, b.final].map((r) => r.map((g) => g.gameId))).toEqual([[G.qf1.gameId, G.qf2.gameId], [G.sf.gameId], [G.final.gameId]]);
  });

  it('the real feed: 6 panels of exactly 10 games, in date order, every group game once, scores / times right', () => {
    league('2026-11-05', realData);
    const panels = [...document.querySelectorAll<HTMLElement>('[data-testid="cup-group"]')];
    expect(panels.map((p) => p.querySelector('.ck-cg-head')!.textContent)).toEqual(['West A', 'West B', 'West C', 'East A', 'East B', 'East C']);
    const seen = new Set<string>();
    for (const p of panels) {
      const want = realData.games.filter((g) => g.isCupGroupGame && g.gameSubLabel === p.dataset.group);
      expect(want).toHaveLength(10);
      const rows = [...p.querySelectorAll<HTMLElement>('.ck-cg')];
      expect(rows.map((r) => r.dataset.gameId)).toEqual(want.map((g) => g.gameId)); // data order = date and tip-off order
      const dates = want.map((g) => g.startTimeUtc ?? g.dateEt);
      expect([...dates].sort()).toEqual(dates);
      for (const [k, r] of rows.entries()) {
        const g = want[k]!;
        expect(text(r.querySelector('.ck-cg-date'))).toBe(rowDateOf(g.dateEt));
        expect(text(r.querySelector('.ck-cg-match'))).toBe(`${g.awayTeam.teamTricode} @ ${g.homeTeam.teamTricode}`);
        expect(text(r.querySelector('[data-testid="cup-result"]'))).toBe(expected(g));
        seen.add(g.gameId);
      }
    }
    expect(seen.size).toBe(60);
    // the knockout column: 4 quarterfinals, 2 semifinals, the Final
    expect(['cup-qf', 'cup-sf', 'cup-final'].map((t) => screen.getByTestId(t).querySelectorAll('.ck-cg').length)).toEqual([4, 2, 1]);
  });

  it('knockout games: undecided sides "TBD", no logo, time TBD; the panel heading has the round and its dates', () => {
    league('2026-10-01');
    expect(text(screen.getByTestId('cup-qf').querySelector('.ck-cg-head'))).toBe('Quarterfinals · Dec 4');
    expect(text(row(G.qf2.gameId).querySelector('.ck-cg-match'))).toBe('TBD @ TBD');
    expect(text(row(G.qf2.gameId).querySelector('[data-testid="cup-result"]'))).toBe('TBD');
    expect(row(G.qf2.gameId).querySelector('img')).toBeNull();
    expect(text(row(G.bosNyk.gameId).querySelector('[data-testid="cup-result"]'))).toBe('100–110');
    expect(text(row(G.miaBos.gameId).querySelector('[data-testid="cup-result"]'))).toBe('00:00 (+1)');
  });

  it('the row’s tooltip: date, matchup, group, tip-off, each team’s group game number, the season series', () => {
    league('2026-10-01');
    const tip = row(G.miaBos.gameId).dataset.tip!;
    expect(tip.split('\n')).toEqual(['Tue, Nov 10 · MIA @ BOS · Group play · East C', 'Tip-off: 00:00 (+1)', "MIA's 1st group game, BOS's 2nd", expect.stringMatching(/^Season series: G1\//)]);
    expect(row(G.bosNyk.gameId).dataset.tip!.split('\n')[1]).toBe('Final: NYK 100, BOS 110');
    // no "G2/G1" chip, no series chip on the row itself
    expect(row(G.miaBos.gameId).querySelector('.ck-series, .ck-tag')).toBeNull();
  });
});

describe('Cup League list · By date', () => {
  it('the strip: exactly the Cup nights and the knockout nights, all as dates (no rounds), the count under each', () => {
    byDate('2026-10-01');
    const strip = [...document.querySelectorAll<HTMLElement>('.ck-cup-strip .ck-strip-day')];
    expect(strip.map((d) => d.dataset.date)).toEqual(cupNights(data).map((n) => n.date));
    expect(strip.map((d) => d.dataset.date)).toEqual(['2026-11-06', '2026-11-10', '2026-12-04', '2026-12-08', '2026-12-11']);
    expect(strip.map((d) => d.textContent)).toEqual(['Fri Nov62', 'Tue Nov101', 'Fri Dec42', 'Tue Dec81', 'Fri Dec111']);
    expect(document.body.textContent).not.toMatch(/Round \d/);
  });

  it('every night shown, each night’s games grouped by group (West A … East C, then the knockout), no game twice', () => {
    byDate('2026-10-01', realData);
    const nights = [...document.querySelectorAll<HTMLElement>('[data-testid="cup-night"]')];
    expect(nights.map((n) => n.dataset.night)).toEqual(cupNights(realData).map((n) => n.date));
    const all: string[] = [];
    const order = ['West A', 'West B', 'West C', 'East A', 'East B', 'East C'];
    for (const n of nights) {
      const want = cupNights(realData).find((x) => x.date === n.dataset.night)!;
      const rows = [...n.querySelectorAll<HTMLElement>('.ck-cg')];
      expect(rows.map((r) => r.dataset.gameId).sort()).toEqual(want.games.map((g) => g.gameId).sort());
      const pills = rows.map((r) => r.querySelector('.ck-cg-pill')?.textContent ?? 'none');
      expect(pills.map((x) => order.indexOf(x))).toEqual(pills.map((x) => order.indexOf(x)).sort((a, b) => a - b)); // grouped, in order
      for (const r of rows) {
        const g = realData.games.find((x) => x.gameId === r.dataset.gameId)!;
        expect(r.querySelector('.ck-cg-pill')?.textContent).toBe(g.isCupGroupGame ? cupTag(g) : undefined); // knockout: no pill (the heading names the round)
        expect(text(r.querySelector('[data-testid="cup-result"]'))).toBe(expected(g));
      }
      all.push(...rows.map((r) => r.dataset.gameId!));
    }
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(67);
    expect(nightByGroup(cupNights(realData)[0]!).map((g) => g.gameId)).toEqual(all.slice(0, 10));
  });

  it('opens on today’s Cup night or the next; ‹ › and ← / → step the night; a click on the strip picks one', () => {
    for (const [today, night] of [['2026-10-01', '2026-11-06'], ['2026-11-07', '2026-11-10'], ['2027-02-01', '2026-12-11']]) {
      byDate(today!);
      expect(picked()).toBe(night);
      cleanup();
    }
    expect(cupOpeningNight(cupNights(data), '2026-12-04')).toBe('2026-12-04');
    byDate('2026-10-01');
    fireEvent.click(screen.getByRole('button', { name: 'Next night' }));
    expect(picked()).toBe('2026-11-10');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(picked()).toBe('2026-12-04');
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true }); // a modifier: ignored
    expect(picked()).toBe('2026-12-04');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(picked()).toBe('2026-11-10');
    fireEvent.click(document.querySelector('.ck-cup-strip .ck-strip-day[data-date="2026-12-11"]')!);
    expect(picked()).toBe('2026-12-11');
    expect(screen.getByRole('button', { name: 'Next night' })).toHaveProperty('disabled', true);
  });

  it('a knockout night shows only its Cup games (the other game that night is left out)', () => {
    byDate('2026-12-04');
    expect(ids('[data-testid="cup-night"][data-night="2026-12-04"]')).toEqual([G.qf1.gameId, G.qf2.gameId]);
    expect(document.querySelector(`[data-game-id="${G.other.gameId}"]`)).toBeNull();
  });
});

describe('Cup League list · fatigue', () => {
  it('back-to-back from the whole schedule: BOS played a non-Cup game the night before its Cup game → 2nd night, both views', () => {
    for (const by of ['group', 'date'] as const) {
      league('2026-10-01', data, by);
      const marks = [...row(G.miaBos.gameId).querySelectorAll<HTMLElement>('.ck-fm')];
      expect(marks.filter((m) => m.classList.contains('ck-fm-n2')).map((m) => m.textContent)).toEqual(['BOS']);
      expect(marks.filter((m) => m.classList.contains('ck-fm-n1'))).toHaveLength(0);
      // one legend line explains the marks
      expect(screen.getAllByTestId('fatigue-legend')).toHaveLength(1);
      expect(screen.getByTestId('fatigue-legend').textContent).toMatch(/2nd night.*1st night.*changed cities.*3-in-4/);
      cleanup();
    }
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

  it('opens on Groups; Schedule opens on League By group; Team shows the picker until a team is picked; nothing remembered', async () => {
    open();
    expect(await screen.findByTestId('cup')).toBeTruthy(); // the standings
    expect(tabs('Cup view').getByRole('tab', { name: 'Groups' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tablist', { name: 'Cup list' })).toBeNull();
    fireEvent.click(tabs('Cup view').getByRole('tab', { name: 'Schedule' }));
    expect(await screen.findByTestId('cup-league')).toBeTruthy();
    expect(tabs('Cup list').getByRole('tab', { name: 'League' }).getAttribute('aria-selected')).toBe('true');
    // By group first; the toggle switches; By date is not remembered either
    const by = () => screen.getByTestId('cup-league').dataset.by;
    expect(tabs('Cup layout').getByRole('tab', { name: 'By group' }).getAttribute('aria-selected')).toBe('true');
    expect(by()).toBe('group');
    fireEvent.click(tabs('Cup layout').getByRole('tab', { name: 'By date' }));
    expect(by()).toBe('date');
    expect(screen.queryByTestId('cup-board')).toBeNull();
    fireEvent.click(tabs('Cup layout').getByRole('tab', { name: 'By group' }));
    expect(by()).toBe('group');
    expect(screen.getByTestId('cup-board')).toBeTruthy();
    fireEvent.click(tabs('Cup layout').getByRole('tab', { name: 'By date' }));
    fireEvent.click(tabs('Cup list').getByRole('tab', { name: 'Team' }));
    expect(screen.queryByRole('tablist', { name: 'Cup layout' })).toBeNull(); // Team: no layout toggle
    expect(screen.getByTestId('team-picker').textContent).toMatch(/Pick a team/);
    expect(screen.getByTestId('cup-pick')).toBeTruthy();
    fireEvent.click(screen.getByTestId('team-picker'));
    fireEvent.click(document.querySelector(`[role="option"][data-team-id="${TEAM.BOS}"]`)!);
    expect(screen.getByTestId('cup-team')).toBeTruthy();
    expect(screen.getByTestId('team-picker').textContent).toMatch(/Boston Celtics/);
    // leaving the Cup view and coming back: Standings again, and the team forgotten
    fireEvent.click(tabs('Destination').getByRole('tab', { name: 'Schedule' }));
    fireEvent.click(tabs('Destination').getByRole('tab', { name: 'Cup' }));
    expect(await screen.findByTestId('cup')).toBeTruthy();
    expect(tabs('Cup view').getByRole('tab', { name: 'Groups' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(tabs('Cup view').getByRole('tab', { name: 'Schedule' }));
    await screen.findByTestId('cup-league');
    expect(by()).toBe('group');
    fireEvent.click(tabs('Cup list').getByRole('tab', { name: 'Team' }));
    expect(screen.getByTestId('team-picker').textContent).toMatch(/Pick a team/);
    // a reload (a new widget) opens on Standings too
    cleanup();
    open();
    expect(await screen.findByTestId('cup')).toBeTruthy();
    await act(async () => {});
    expect(tabs('Cup view').getByRole('tab', { name: 'Groups' }).getAttribute('aria-selected')).toBe('true');
  });
});
