// @vitest-environment jsdom
// The Slate's Cup track — on a night with Cup group games every card gets it (Cup games: the team's
// 4 group games as squares, tonight's ringed, W/L + margin, the group record over the differential; other games: the
// track empty); other nights nothing; the layout maths (2 columns at 1920 with the note boxes ≥ SLATE_NOTE_MIN_CUP).
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SlateDay } from '../src/slate/SlateCard';
import { slateColumns, slateInfoWidth, slateNoteWidth, SLATE_CUP_TRACK, SLATE_INFO_WIDTH, SLATE_NOTE_MIN, SLATE_NOTE_MIN_CUP } from '../src/slate/layout';
import { cupStandingsOf } from '../src/data/cup';
import { data } from './feed';

afterEach(cleanup);

const cupNight = '2026-11-06';
const plainNight = '2026-11-07';

describe('Slate Cup track', () => {
  it('a Cup night: each Cup game\'s teams show their 4 squares (tonight ringed) and record; the track is in every card', () => {
    render(<SlateDay data={data} date={cupNight} timeZone="UTC" gameLink={(g) => `https://hj.test/${g.gameId}`} />);
    const cards = [...document.querySelectorAll<HTMLElement>('.ck-slate-card')];
    const cupGames = (data.byDate.get(cupNight) ?? []).filter((g) => g.isCupGroupGame);
    expect(cupGames.length).toBeGreaterThan(0);
    for (const c of cards) expect(c.querySelectorAll('[data-testid="slate-cup"]')).toHaveLength(2);
    const lines = cupStandingsOf(data).byTeam;
    for (const g of cupGames) {
      const card = cards.find((c) => c.dataset.gameId === g.gameId)!;
      for (const t of [g.awayTeam, g.homeTeam]) {
        const track = card.querySelector<HTMLElement>(`[data-testid="slate-cup"][data-team="${t.teamTricode}"]`)!;
        const line = lines.get(t.teamId)!;
        const squares = [...track.querySelectorAll<HTMLAnchorElement>('.ck-cup-slot')];
        expect(squares.map((s) => s.dataset.gameId)).toEqual(line.slots.map((s) => s.gameId));
        expect(squares.filter((s) => s.dataset.tonight).map((s) => s.dataset.gameId)).toEqual([g.gameId]);
        for (const s of squares) expect(s.href).toBe(`https://hj.test/${s.dataset.gameId}`);
        const diff = line.diff > 0 ? `+${line.diff}` : line.diff < 0 ? `−${-line.diff}` : '0';
        expect(track.querySelector('.ck-slate-cup-rec')!.textContent).toBe(`${line.w}-${line.l}${diff}`);
        // a played square: W / L and the margin
        for (const [k, s] of line.slots.entries()) if (s.played) expect(squares[k]!.querySelector('.ck-cup-slot-res')!.textContent).toMatch(/^[WL] ([+−]\d+|0)$/);
      }
    }
  });

  it('a night without Cup group games: no track', () => {
    render(<SlateDay data={data} date={plainNight} timeZone="UTC" />);
    expect(document.querySelectorAll('[data-testid="slate-cup"]')).toHaveLength(0);
    expect(document.querySelector('.ck-slate-grid')!.getAttribute('data-cup')).toBeNull();
  });

  it('layout: Cup nights widen the info block by the track; 2 columns at 1840 px with ≥ 200 px note boxes; other nights unchanged', () => {
    expect(slateInfoWidth(true) - slateInfoWidth(false)).toBe(SLATE_CUP_TRACK + 4);
    expect(slateInfoWidth(false)).toBe(SLATE_INFO_WIDTH);
    expect(slateColumns(1840, true)).toBe(2);
    expect(slateNoteWidth((1840 - 12) / 2, true)).toBeGreaterThanOrEqual(SLATE_NOTE_MIN_CUP);
    expect(slateColumns(1840, false)).toBe(2);
    expect(slateNoteWidth((1840 - 12) / 2, false)).toBeGreaterThanOrEqual(SLATE_NOTE_MIN);
  });
});
