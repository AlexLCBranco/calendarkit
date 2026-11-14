// @vitest-environment jsdom
// A copied slate draws the game's info larger inside the same card width (the note box is under the team rows, so
// the info may take the card's width but for the space label's SLATE_COPY_HEAD), at most ×1.35; info-only cards stay ×1.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SlateCopy } from '../src/slate/SlateCard';
import { slateCopyCardWidth, slateCopyZoom, slateInfoWidth, SLATE_CARD_BORDER, SLATE_CARD_PAD, SLATE_COPY_HEAD, SLATE_COPY_ZOOM_MAX } from '../src/slate/layout';
import { data } from './feed';
import { createNotesStore } from '../src/slate/notes';
const memoryNotesStore = () => createNotesStore(undefined, undefined);

afterEach(cleanup);

/** The room left right of the zoomed info, for the space label. */
const headRoom = (card: number, cup: 0 | 1 | 3, z: number) => card - 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER) - slateInfoWidth(cup) * z;

describe('slateCopyZoom', () => {
  it('a regular night at 1920 (card ~914 px): the cap, ×1.35, the label keeps its corner', () => {
    expect(slateCopyZoom(914, 0)).toBe(SLATE_COPY_ZOOM_MAX);
    expect(headRoom(914, 0, SLATE_COPY_ZOOM_MAX)).toBeGreaterThanOrEqual(SLATE_COPY_HEAD);
  });
  it('a Cup night (wide info): as large as the card allows with the label room kept, never below ×1', () => {
    for (const cup of [1, 3] as const) {
      const z = slateCopyZoom(914, cup);
      expect(z).toBeGreaterThan(1);
      expect(z).toBeLessThanOrEqual(SLATE_COPY_ZOOM_MAX);
      expect(headRoom(914, cup, z)).toBeGreaterThanOrEqual(SLATE_COPY_HEAD);
      expect(headRoom(914, cup, z + 0.01)).toBeLessThan(SLATE_COPY_HEAD);
    }
    expect(slateCopyZoom(600, 3)).toBe(1);
  });
  it('notes hidden: ×1 (the card is exactly its content)', () => {
    expect(slateCopyZoom(944, 0, false)).toBe(1);
  });
});

describe('slateCopyCardWidth', () => {
  it('with notes: as wide as the info at ×1.35 plus the label room — narrower than the 914 px screen card on a regular night, still ×1.35', () => {
    const w = slateCopyCardWidth(914, 0);
    expect(w).toBeLessThan(914);
    expect(slateCopyZoom(w, 0)).toBe(SLATE_COPY_ZOOM_MAX);
    expect(headRoom(w, 0, SLATE_COPY_ZOOM_MAX)).toBeGreaterThanOrEqual(SLATE_COPY_HEAD);
    expect(headRoom(w, 0, SLATE_COPY_ZOOM_MAX)).toBeLessThan(SLATE_COPY_HEAD + 1);
  });
  it('never wider than on screen: a Cup stakes night keeps the screen width', () => {
    expect(slateCopyCardWidth(914, 3)).toBe(914);
    expect(slateCopyCardWidth(600, 0)).toBe(600);
  });
});

describe('SlateCopy', () => {
  const date = '2026-10-23';
  const games = data.byDate.get(date)!;
  it('with notes: the zoom on the copy root and the info column widened to match; without: none', () => {
    const { container } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" notes={memoryNotesStore()} />);
    const root = container.querySelector<HTMLElement>('.ck-slate-copy')!;
    expect(root.dataset.zoom).toBe(String(SLATE_COPY_ZOOM_MAX));
    expect(root.style.getPropertyValue('--ck-copy-zoom')).toBe(String(SLATE_COPY_ZOOM_MAX));
    expect(parseFloat(root.style.getPropertyValue('--ck-slate-info'))).toBeCloseTo(slateInfoWidth(0) * SLATE_COPY_ZOOM_MAX, 3);
    cleanup();
    const { container: bare } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" />);
    expect(bare.querySelector<HTMLElement>('.ck-slate-copy')!.dataset.zoom).toBe('1');
    expect(bare.querySelector<HTMLElement>('.ck-slate-copy')!.style.getPropertyValue('--ck-copy-zoom')).toBe('');
  });
  it('a game link: each card gets its ↗ (the gauntlet widget); without one, none (calendarkit\'s images)', () => {
    const link = (g: { gameId: string }) => `https://example.test/${g.gameId}`;
    const { container } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" gameLink={link} />);
    const icons = [...container.querySelectorAll<HTMLAnchorElement>('[data-testid="game-link"]')];
    expect(icons.map((a) => a.getAttribute('href'))).toEqual(games.map((g) => `https://example.test/${g.gameId}`));
    expect(icons.every((a) => a.target === '_blank')).toBe(true);
    cleanup();
    const { container: bare } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" />);
    expect(bare.querySelectorAll('[data-testid="game-link"]')).toHaveLength(0);
  });
});
