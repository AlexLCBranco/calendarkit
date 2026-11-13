// @vitest-environment jsdom
// A copied slate draws the game's info larger inside the same card width (the note box gives the
// room, down to SLATE_COPY_NOTE_MIN), at most ×1.35; info-only cards (notes hidden) stay ×1.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SlateCopy } from '../src/slate/SlateCard';
import { slateCopyZoom, slateInfoWidth, SLATE_CARD_BORDER, SLATE_CARD_PAD, SLATE_COPY_NOTE_MIN, SLATE_COPY_ZOOM_MAX, SLATE_NOTE_GAP } from '../src/slate/layout';
import { data } from './feed';
import { createNotesStore } from '../src/slate/notes';
const memoryNotesStore = () => createNotesStore(undefined, undefined);

afterEach(cleanup);

const noteOf = (card: number, cup: 0 | 1 | 3, z: number) => card - 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER) - SLATE_NOTE_GAP - slateInfoWidth(cup) * z;

describe('slateCopyZoom', () => {
  it('a regular night at 1920 (card ~944 px): the cap, ×1.35, the note box keeps ≥ 160 px', () => {
    expect(slateCopyZoom(944, 0)).toBe(SLATE_COPY_ZOOM_MAX);
    expect(noteOf(944, 0, SLATE_COPY_ZOOM_MAX)).toBeGreaterThanOrEqual(SLATE_COPY_NOTE_MIN);
  });
  it('a Cup night (wide info): only what the note box can give, never below ×1', () => {
    const z = slateCopyZoom(914, 3);
    expect(z).toBeGreaterThanOrEqual(1);
    expect(z).toBeLessThan(1.1);
    // a stakes night already leaves the box under 160 px on screen: nothing to give
    expect(noteOf(914, 3, 1)).toBeLessThan(SLATE_COPY_NOTE_MIN);
    expect(z).toBe(1);
    // the Cup track alone (cup 1): some room, the box kept at ≥ 160
    const z1 = slateCopyZoom(944, 1);
    expect(z1).toBeGreaterThan(1);
    expect(noteOf(944, 1, z1)).toBeGreaterThanOrEqual(SLATE_COPY_NOTE_MIN - 1);
    expect(slateCopyZoom(600, 3)).toBe(1);
  });
  it('notes hidden: ×1 (the card is exactly its content)', () => {
    expect(slateCopyZoom(944, 0, false)).toBe(1);
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
