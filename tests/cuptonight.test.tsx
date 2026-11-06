// @vitest-environment jsdom
// Round 21 (item 12): "Tonight in the Cup" — on a night with Cup games, at the top of the Cup page: each game (a
// hoopsjunkie link), both teams (team links) with their Cup record and differential; nothing at all on other nights.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CupView from '../src/components/CupView';
import { cupStandingsOf } from '../src/data/cup';
import { data } from './feed';

afterEach(cleanup);
const link = (g: { gameId: string }) => `https://hj.test/${g.gameId}`;

describe('Tonight in the Cup', () => {
  it('a Cup night: every Cup game tonight, its link, both teams with their Cup record', () => {
    render(<CupView data={data} today="2026-11-06" gameLink={link} />);
    const strip = screen.getByTestId('cup-tonight');
    const want = (data.byDate.get('2026-11-06') ?? []).filter((g) => g.isCupGroupGame);
    const shown = screen.getAllByTestId('tonight-game');
    expect(shown.map((g) => g.dataset.gameId)).toEqual(want.map((g) => g.gameId));
    for (const [k, g] of want.entries()) {
      expect(shown[k]!.querySelector<HTMLAnchorElement>('a.ck-slate-link')!.href).toBe(link(g));
      const l = cupStandingsOf(data).byTeam.get(g.homeTeam.teamId)!;
      expect(shown[k]!.querySelector(`[data-team="${g.homeTeam.teamTricode}"] .ck-tonight-rec`)!.textContent).toMatch(new RegExp(`^${l.w}-${l.l} `));
    }
    expect(strip.dataset.captureExclude).toBe('true');
  });

  it('a night without Cup games: no strip and no room kept', () => {
    render(<CupView data={data} today="2026-11-07" gameLink={link} />);
    expect(screen.queryByTestId('cup-tonight')).toBeNull();
    expect(document.querySelector('.ck-cup-head')!.children).toHaveLength(3);
  });
});
