// @vitest-environment jsdom
// Team list season line: regular-season game number, the record and the win/loss streak going into each game
// (right side of the row),
// and the final score beside each tricode once a game is Final.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CalendarView, TeamListView } from '../src/components/CalendarView';
import { finalScore, teamGames, teamSeason } from '../src/data/model';
import { TEAMS } from '../src/data/teams';
import { data } from './feed';
import { dataOf, game, TEAM } from './synthetic';

afterEach(cleanup);

const NOW = Date.parse('2026-10-23T15:00:00Z');
const WIDE = { width: 1000, height: 800 };

describe('teamSeason (model)', () => {
  const d = dataOf([
    game({ date: '2026-11-01', utc: '2026-11-01T23:00:00Z', home: TEAM.BOS, away: TEAM.NYK, final: [100, 110] }), // BOS W
    game({ date: '2026-11-03', utc: '2026-11-03T23:00:00Z', home: TEAM.MIA, away: TEAM.BOS, final: [99, 120] }), // BOS L (away 99)
    game({ date: '2026-11-05', utc: '2026-11-05T23:00:00Z', home: TEAM.BOS, away: TEAM.DEN, final: [90, 95] }), // BOS W
    game({ date: '2026-11-07', utc: '2026-11-07T23:00:00Z', home: TEAM.BOS, away: TEAM.LAL, prefix: '006', final: [80, 70] }), // Cup Final: not counted
    game({ date: '2026-11-09', utc: '2026-11-09T23:00:00Z', home: TEAM.LAL, away: TEAM.BOS }), // next game
    game({ date: '2026-11-11', utc: '2026-11-11T23:00:00Z', home: TEAM.BOS, away: TEAM.MIA }), // later: record unknown
  ]);
  const s = [...teamSeason(d, TEAM.BOS).values()];

  it('game numbers count regular-season games only (the Cup Final has none)', () => {
    expect(s.map((x) => x.game)).toEqual([1, 2, 3, undefined, 4, 5]);
  });

  it('record going into each game from the final scores; known through the first game not yet final', () => {
    const rec = s.map((x) => x.record && `${x.record.wins}-${x.record.losses}`);
    expect(rec).toEqual(['0-0', '1-0', '1-1', undefined, '2-1', undefined]);
  });

  it('streak going into each game (W1, L1, …): none before the first result or once a result is missing', () => {
    expect(s.map((x) => x.streak && `${x.streak.kind}${x.streak.n}`)).toEqual([undefined, 'W1', 'L1', undefined, 'W1', undefined]);
    const run = dataOf(
      [[100, 110], [90, 120], [99, 101], [130, 100], [100, 90], null].map((f, i) =>
        game({ date: `2026-12-0${i + 1}`, utc: `2026-12-0${i + 1}T23:00:00Z`, home: TEAM.BOS, away: TEAM.NYK, final: (f ?? undefined) as [number, number] | undefined }),
      ),
    );
    // BOS at home: W W W L L, then the next game
    expect([...teamSeason(run, TEAM.BOS).values()].map((x) => x.streak && `${x.streak.kind}${x.streak.n}`)).toEqual([undefined, 'W1', 'W2', 'W3', 'L1', 'L2']);
    expect([...teamSeason(run, TEAM.NYK).values()].map((x) => x.streak && `${x.streak.kind}${x.streak.n}`)).toEqual([undefined, 'L1', 'L2', 'L3', 'W1', 'W2']);
  });

  it('finalScore from the team’s side; undefined before the game is final', () => {
    const games = teamGames(d, TEAM.BOS);
    expect(finalScore(games[0]!, TEAM.BOS)).toEqual({ score: 110, oppScore: 100, win: true });
    expect(finalScore(games[1]!, TEAM.BOS)).toEqual({ score: 99, oppScore: 120, win: false });
    expect(finalScore(games[0]!, TEAM.NYK)).toEqual({ score: 100, oppScore: 110, win: false });
    expect(finalScore(games[4]!, TEAM.BOS)).toBeUndefined();
  });

  it('real feed, all 30 teams: numbers 1…n over regular games; each known record = the feed’s own W-L after the previous game', () => {
    let checked = 0;
    for (const t of TEAMS) {
      const games = teamGames(data, t.id).filter((g) => g.gameType === 'regular');
      const season = teamSeason(data, t.id);
      expect(games.map((g) => season.get(g.gameId)!.game), t.tricode).toEqual(games.map((_, i) => i + 1));
      for (let i = 1; i < games.length; i++) {
        const prev = games[i - 1]!;
        const rec = season.get(games[i]!.gameId)!.record;
        if (prev.status !== 'final') {
          expect(rec, `${t.tricode} G${i + 1}`).toBeUndefined();
          continue;
        }
        // the feed's wins/losses on a final game are the team's record after it (independent of our count)
        const side = prev.homeTeam.teamId === t.id ? prev.homeTeam : prev.awayTeam;
        expect(rec, `${t.tricode} G${i + 1}`).toEqual({ wins: side.wins, losses: side.losses });
        // streak worked out here from the feed's scores: the run of equal results ending with the previous game
        const won = (g: (typeof games)[number]) => (g.homeTeam.teamId === t.id ? g.homeTeam.score > g.awayTeam.score : g.awayTeam.score > g.homeTeam.score);
        let n = 0;
        while (n < i && won(games[i - 1 - n]!) === won(prev)) n++;
        expect(season.get(games[i]!.gameId)!.streak, `${t.tricode} G${i + 1}`).toEqual({ kind: won(prev) ? 'W' : 'L', n });
        checked++;
      }
      expect(season.get(games[0]!.gameId)!.record).toEqual({ wins: 0, losses: 0 });
    }
    expect(checked).toBeGreaterThan(10); // the fixture has the first regular-season finals
  });
});

describe('team list row', () => {
  const bos = teamGames(data, TEAM.BOS);
  const row = (el: HTMLElement, id: string) => el.querySelector(`[data-game-id="${id}"]`)!;

  it('right side: "G1" and the record going in, then the streak; G2 after a loss: L1; later games: number only', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: TEAM.BOS }} />).container;
    const season = (id: string) => [...row(el, id).querySelectorAll('[data-testid="season"] > *')].map((e) => e.textContent);
    expect(bos[0]!.status).toBe('final');
    expect(season(bos[0]!.gameId)).toEqual(['G1', '0-0', '']);
    expect(season(bos[1]!.gameId)).toEqual(['G2', bos[0]!.awayTeam.teamId === TEAM.BOS ? `${bos[0]!.awayTeam.wins}-${bos[0]!.awayTeam.losses}` : `${bos[0]!.homeTeam.wins}-${bos[0]!.homeTeam.losses}`, 'L1']);
    expect(row(el, bos[1]!.gameId).querySelector('.ck-streak')!.classList).toContain('ck-streak-l');
    expect(row(el, bos[1]!.gameId).querySelector('[data-testid="season"]')!.getAttribute('data-tip')).toBe('Game 2, record 0-1 going in, on a 1-game losing streak');
    expect(season(bos[2]!.gameId)).toEqual(['G3', '', '']);
    expect(row(el, bos[0]!.gameId).querySelector('[data-testid="season"]')!.getAttribute('data-tip')).toBe('Game 1, record 0-0 going in');
    // the season block is the row's last part (right side) while the rotationkit action is hidden
    expect(row(el, bos[0]!.gameId).lastElementChild!.getAttribute('data-testid')).toBe('season');
  });

  it('final game: score beside each tricode, winner highlighted; upcoming games: no score', () => {
    const el = render(<TeamListView data={data} teamId={TEAM.BOS} tvOnly={false} size={WIDE} now={NOW} timeZone="UTC" />).container;
    const g = bos[0]!; // Oct 20: BOS 113 @ DET 121
    const r = row(el, g.gameId);
    expect(r.querySelector('.ck-matchup')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(`BOS ${g.awayTeam.score} @ DET ${g.homeTeam.score}`);
    expect([...r.querySelectorAll('.ck-score')].map((s) => [s.textContent, s.classList.contains('ck-score-win')])).toEqual([
      [String(g.awayTeam.score), g.awayTeam.score > g.homeTeam.score],
      [String(g.homeTeam.score), g.homeTeam.score > g.awayTeam.score],
    ]);
    expect(r.getAttribute('aria-label')).toMatch(/, lost 113–121, Game 1, record 0-0 going in$/);
    for (const x of bos.filter((x) => x.status !== 'final')) expect(row(el, x.gameId).querySelector('.ck-score'), x.dateEt).toBeNull();
  });

  it('only the team list has the season line (league list and team calendar: scores only, see scores.test.tsx)', () => {
    const el = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: TEAM.BOS }} />).container;
    expect(el.querySelector('[data-testid="season"]')).toBeNull();
    cleanup();
    const league = render(<CalendarView data={data} size={WIDE} now={NOW} timeZone="UTC" initial={{ date: '2026-10-20' }} />).container;
    expect(league.querySelector('[data-testid="season"]')).toBeNull();
  });
});
