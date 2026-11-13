// Road trips and homestands (data/runs.ts): runs of RUN_MIN_GAMES+ away or home games, counted over the whole schedule;
// a neutral site or the All-Star break ends one. The views' pieces: the Team List's row marks, the Team Calendar's bands.
import { describe, expect, it } from 'vitest';
import { RUN_BREAK_DAYS, RUN_MIN_GAMES, runLabel, runTip, runTipDays, teamRuns } from '../src/data/runs';
import { runSegments } from '../src/components/TeamMonthGrid';
import { rowRunMarks } from '../src/components/TeamListView';
import { addDays, monthCells, teamGames } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { dataOf, game, TEAM } from './synthetic';
import { data as feed } from './feed';

const { BOS, NYK, LAL, DEN, MIA } = TEAM;
/** A BOS game on `date`: at home (vs NYK) or away (at `host`). */
const home = (date: string, raw = {}) => game({ date, utc: `${date}T23:30:00Z`, home: BOS, away: NYK, raw });
const away = (date: string, host: number = LAL, raw = {}) => game({ date, utc: `${date}T23:30:00Z`, home: host, away: BOS, raw });
const kinds = (d: ReturnType<typeof dataOf>) => teamRuns(d, BOS).runs.map((r) => `${r.kind}:${r.games.length}:${r.from}..${r.to}`);

describe('teamRuns', () => {
  it('the threshold is one constant: 3', () => expect(RUN_MIN_GAMES).toBe(3));

  it('exactly 3 away games in a row are a road trip; 2 are not', () => {
    const d = dataOf([home('2026-11-01'), away('2026-11-03'), away('2026-11-05'), away('2026-11-07'), home('2026-11-09'), away('2026-11-11'), away('2026-11-13'), home('2026-11-15')]);
    expect(kinds(d)).toEqual(['road:3:2026-11-03..2026-11-07']);
  });

  it('exactly 3 home games in a row are a homestand', () => {
    const d = dataOf([away('2026-11-01'), home('2026-11-03'), home('2026-11-04'), home('2026-11-06'), away('2026-11-08')]);
    expect(kinds(d)).toEqual(['home:3:2026-11-03..2026-11-06']);
  });

  it('a run crossing a month keeps its full length (whole schedule, not the month)', () => {
    const d = dataOf([home('2026-11-25'), away('2026-11-28'), away('2026-11-30'), away('2026-12-02'), away('2026-12-04'), away('2026-12-06'), home('2026-12-08')]);
    const [run] = teamRuns(d, BOS).runs;
    expect(run!.games).toHaveLength(5);
    expect([run!.from, run!.to]).toEqual(['2026-11-28', '2026-12-06']);
    expect(runLabel(run!)).toBe('Road trip · 5 games');
    // December's calendar (Dec 1 is a Tuesday): the band starts square (the trip began in November) and labels the
    // 3rd game; the Sunday row takes the rest
    const dec = runSegments(monthCells('2026-12'), teamRuns(d, BOS).runs);
    expect(dec.map((x) => ({ open: x.open, close: x.close, index: x.index, span: x.span }))).toEqual([
      { open: true, close: true, index: 2, span: 5 },
      { open: true, close: false, index: 4, span: 1 },
    ]);
    expect(runTip(run!, dec[0]!.index).split('\n')[0]).toBe('Road trip · game 3 of 5');
  });

  it('a neutral-site game breaks a run (and is in none)', () => {
    const d = dataOf([away('2026-11-01'), away('2026-11-03'), away('2026-11-05', MIA, { isNeutral: true }), away('2026-11-07'), away('2026-11-09')]);
    expect(kinds(d)).toEqual([]);
    const d2 = dataOf([away('2026-11-01'), away('2026-11-03'), away('2026-11-04'), away('2026-11-05', MIA, { isNeutral: true }), away('2026-11-07'), away('2026-11-08'), away('2026-11-09')]);
    expect(kinds(d2)).toEqual(['road:3:2026-11-01..2026-11-04', 'road:3:2026-11-07..2026-11-09']);
  });

  it(`a break of ${RUN_BREAK_DAYS}+ days (the All-Star break) ends a run`, () => {
    const d = dataOf([away('2027-02-10'), away('2027-02-11'), away('2027-02-13', DEN), away(addDays('2027-02-13', RUN_BREAK_DAYS)), away('2027-02-21'), away('2027-02-23')]);
    expect(kinds(d)).toEqual(['road:3:2027-02-10..2027-02-13', 'road:3:2027-02-19..2027-02-23']);
  });

  it('the tooltip: game k of N, the dates, the cities in order; the day strip marks game k and the days off', () => {
    const d = dataOf([away('2026-11-03', LAL, { arenaCity: 'Inglewood' }), away('2026-11-05', DEN, { arenaCity: 'Denver' }), away('2026-11-06', MIA, { arenaCity: 'Miami' })]);
    const [run] = teamRuns(d, BOS).runs;
    const tip = runTip(run!, 1).split('\n');
    expect(tip[0]).toBe('Road trip · game 2 of 3');
    expect(tip[1]).toBe('Tue, Nov 3 – Fri, Nov 6');
    expect(tip[2]).toBe('Inglewood → Denver → Miami');
    expect(runTipDays(run!, 1)).toBe('2026-11-03:g 2026-11-04:r 2026-11-05:t 2026-11-06:g');
  });

  it('real season: every run is ≥ 3 same-side non-neutral games, consecutive in the team schedule, and maximal', () => {
    for (const t of TEAMS) {
      const all = teamGames(feed, t.id);
      const { runs, byGame } = teamRuns(feed, t.id);
      for (const r of runs) {
        expect(r.games.length).toBeGreaterThanOrEqual(RUN_MIN_GAMES);
        const i = all.indexOf(r.games[0]!);
        expect(all.slice(i, i + r.games.length)).toEqual(r.games);
        for (const g of r.games) {
          expect(g.isNeutral, g.gameId).toBe(false);
          expect(g.homeTeam.teamId === t.id ? 'home' : 'road').toBe(r.kind);
          expect(byGame.get(g.gameId)!.run).toBe(r);
        }
      }
      expect(runs.length, t.tricode).toBeGreaterThan(3);
    }
  });
});

describe('the views’ pieces', () => {
  it('Team List: one unbroken band (rest rows included), the label on the first shown game only', () => {
    const d = dataOf([home('2026-11-01'), away('2026-11-03'), away('2026-11-05'), away('2026-11-06'), home('2026-11-08')]);
    const g = teamGames(d, BOS);
    const rows = [g[0]!, '2026-11-02', g[1]!, '2026-11-04', g[2]!, g[3]!, '2026-11-07', g[4]!];
    const marks = rowRunMarks(rows, teamRuns(d, BOS).runs);
    expect(marks.has(g[0]!.gameId)).toBe(false);
    expect(marks.has('2026-11-02')).toBe(false);
    expect(marks.get(g[1]!.gameId)).toMatchObject({ kind: 'road', pos: 'first' });
    expect(marks.get(g[1]!.gameId)!.label!.text).toBe('Road trip · 3 games');
    expect(marks.get('2026-11-04')).toMatchObject({ kind: 'road', pos: 'mid' });
    expect(marks.get(g[2]!.gameId)).toMatchObject({ pos: 'mid' });
    expect(marks.get(g[3]!.gameId)).toMatchObject({ pos: 'last' });
    expect([marks.get(g[2]!.gameId)!.label, marks.get(g[3]!.gameId)!.label]).toEqual([undefined, undefined]);
    expect(marks.has('2026-11-07')).toBe(false);
  });

  it('Team Calendar: one band per week row, rest days inside, square where it goes on', () => {
    // Fri Nov 6 → Tue Nov 10: crosses the Saturday/Sunday row break
    const d = dataOf([away('2026-11-06'), away('2026-11-07'), away('2026-11-10')]);
    const segs = runSegments(monthCells('2026-11'), teamRuns(d, BOS).runs);
    const cells = monthCells('2026-11');
    expect(segs.map((s) => [cells[s.i], s.span, s.open, s.close, s.index])).toEqual([
      ['2026-11-06', 2, false, true, 0],
      ['2026-11-08', 3, true, false, 2],
    ]);
  });
});
