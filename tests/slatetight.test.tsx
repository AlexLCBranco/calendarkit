// @vitest-environment jsdom
// Round 14 (item 3): the Slate's tight cards — the strip beside the team rows, fixed row tracks, the short 3-in-4 chip,
// and as many info-only columns as fit when the notes are hidden.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SlateDay } from '../src/slate/SlateCard';
import { slateColumns, slateInfoColumns, SLATE_CARD_BORDER, SLATE_CARD_PAD, SLATE_CARD_WIDTH, SLATE_GRID_GAP, SLATE_INFO_WIDTH, SLATE_ROW_GAP, SLATE_ROW_TRACKS, SLATE_STRIP, SLATE_STRIP_GAP } from '../src/slate/layout';
import { leagueFatigue } from '../src/data/fatigue';
import { mergedLabel } from '../src/data/scheduleTags';
import { nationalTv } from '../src/data/model';
import { data } from './feed';

afterEach(cleanup);

const nights = [...data.byDate.keys()].sort();

describe('layout constants', () => {
  it('info = strip + gap + the row tracks and their gaps; card = info + padding + border', () => {
    const tracks = Object.values(SLATE_ROW_TRACKS);
    expect(SLATE_INFO_WIDTH).toBe(SLATE_STRIP + SLATE_STRIP_GAP + tracks.reduce((a, b) => a + b, 0) + (tracks.length - 1) * SLATE_ROW_GAP);
    expect(SLATE_CARD_WIDTH).toBe(SLATE_INFO_WIDTH + 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER));
    // the name track holds "Timberwolves" (109.7 px at 16 px semibold, measured in the app)
    expect(SLATE_ROW_TRACKS.name).toBeGreaterThanOrEqual(110);
  });

  it('notes hidden: the most columns whose cards and gaps fit the width', () => {
    for (const w of [600, 960, 1233, 1568, 1600, 1840, 1912, 2400, 3000]) {
      const n = slateInfoColumns(w);
      expect(n * SLATE_CARD_WIDTH + (n - 1) * SLATE_GRID_GAP, `${w}`).toBeLessThanOrEqual(Math.max(w, SLATE_CARD_WIDTH));
      expect((n + 1) * SLATE_CARD_WIDTH + n * SLATE_GRID_GAP, `${w}`).toBeGreaterThan(w);
    }
    expect(slateInfoColumns(100)).toBe(1);
  });

  it('notes shown: still two columns at 1840, one at 1233 (round 9 rule)', () => {
    expect(slateColumns(1840)).toBe(2);
    expect(slateColumns(1233)).toBe(1);
  });
});

describe('cards', () => {
  it('no head line: the strip holds the time, the link, the TV pill (networks in its tooltip) and the tags; rows hold the rest', () => {
    for (const date of nights.slice(0, 40)) {
      render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" gameLink={(g) => `https://x.test/${g.gameId}`} />);
      const grid = document.querySelector<HTMLElement>('.ck-slate-grid')!;
      // round 21 (item 1): a Cup night's cards are wider (the Cup track)
      expect(grid.dataset.cols).toBe(String(slateInfoColumns(1840, (data.byDate.get(date) ?? []).some((g) => g.isCupGroupGame))));
      for (const card of document.querySelectorAll<HTMLElement>('.ck-slate-card')) {
        const g = data.games.find((x) => x.gameId === card.dataset.gameId)!;
        expect(card.querySelector('.ck-slate-head')).toBeNull();
        const strip = card.querySelector('.ck-slate-strip')!;
        expect(strip.querySelector('[data-testid="tipoff"], [data-testid="slate-status"]')).toBeTruthy();
        expect(strip.querySelector('[data-testid="game-link"]')).toBeTruthy();
        const tv = nationalTv(g);
        const pill = strip.querySelector<HTMLElement>('[data-testid="tv-badge"]');
        if (tv.length) {
          expect(pill!.textContent).toBe('TV');
          expect(pill!.dataset.tip).toBe(tv.join(' · '));
        } else expect(pill).toBeNull();
        expect(card.querySelectorAll('.ck-slate-row')).toHaveLength(2);
      }
      cleanup();
    }
  });

  it('the Fatigue chip shows the stretch only ("7in11"), the full text stays in the tooltip', () => {
    const fx = leagueFatigue(data);
    // the nights with a 3-in-4 stretch on some team (every 3rd such night keeps the test quick), the 7in11 nights included
    const withChip = nights.filter((d) => data.byDate.get(d)!.some((g) => [...(fx.get(g.gameId)?.values() ?? [])].some((t) => t.tif)));
    const seven = withChip.filter((d) => data.byDate.get(d)!.some((g) => [...(fx.get(g.gameId)?.values() ?? [])].some((t) => t.tif && mergedLabel(t.tif.merged) === '7in11')));
    let chips = 0;
    for (const date of new Set([...withChip.filter((_, i) => i % 3 === 0), ...seven.slice(0, 2)])) {
      render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" />);
      for (const card of document.querySelectorAll<HTMLElement>('.ck-slate-card')) {
        const g = data.games.find((x) => x.gameId === card.dataset.gameId)!;
        for (const row of card.querySelectorAll<HTMLElement>('.ck-slate-row')) {
          const comp = row.querySelector<HTMLElement>('[data-testid="fatigue"]')!;
          expect(comp.classList.contains('ck-fx-short')).toBe(true);
          const tif = fx.get(g.gameId)?.get((row.dataset.side === 'home' ? g.homeTeam : g.awayTeam).teamId)?.tif;
          const chip = comp.querySelector('.ck-fx-chip');
          expect(!!chip).toBe(!!tif);
          if (!chip) continue;
          expect(chip.textContent).toBe(mergedLabel(tif!.merged));
          expect(comp.dataset.tip).toContain('tonight the');
          chips++;
        }
      }
      cleanup();
    }
    expect(seven.length).toBeGreaterThan(0);
    expect(chips).toBeGreaterThan(40);
  }, 15_000);
});
