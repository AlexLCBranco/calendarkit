// Slate copy layout (round 7): the column count of the copied image follows the page's shape, not the screen's two
// columns; the pixel ratio keeps it sharp at 2× its fitted size.
import { describe, expect, it } from 'vitest';
import { fitScale, slateCopyColumns, slateImageSize, slatePixelRatio, SLATE_COPY_GAP, SLATE_PAGE } from '../src/components/slate';

const CARD = { width: 474, height: 120 };

describe('slate copy layout', () => {
  it('one constant gap: between the cards and half of it around them', () => {
    expect(slateImageSize(4, 2, CARD)).toEqual({ width: 2 * CARD.width + 2 * SLATE_COPY_GAP, height: 2 * CARD.height + 2 * SLATE_COPY_GAP, rows: 2 });
    expect(slateImageSize(5, 2, CARD).rows).toBe(3);
  });

  it('picks the column count whose image, fitted to the page, shows the cards largest (checked against every count)', () => {
    for (let n = 1; n <= 16; n++) {
      const cols = slateCopyColumns(n, CARD, SLATE_PAGE);
      const best = Math.max(...Array.from({ length: n }, (_, i) => fitScale(slateImageSize(n, i + 1, CARD), SLATE_PAGE)));
      expect(fitScale(slateImageSize(n, cols, CARD), SLATE_PAGE), `${n} games`).toBe(best);
    }
  });

  it('round 7 cards (474 × 120, 120 px apart) came out wide on a wide page: 12 games not 2 × 6, 3 games 2 + 1', () => {
    expect(slateCopyColumns(12, CARD, SLATE_PAGE, 120)).toBeGreaterThanOrEqual(3);
    expect(slateCopyColumns(3, CARD, SLATE_PAGE, 120)).toBe(2);
  });

  it('round 9 cards with their note boxes (914 × 117 at 1920), SLATE_COPY_GAP apart: the column table, names ≥ 12 px fitted', () => {
    const wide = { width: 914, height: 117 };
    const table = [1, 3, 5, 12, 15].map((n) => [n, slateCopyColumns(n, wide)]);
    expect(table).toEqual([[1, 1], [3, 1], [5, 1], [12, 2], [15, 2]]);
    // team names are 16 px on the card: fitted to the page, at least 12 px up to the season's busiest night (15 games)
    for (const n of [1, 5, 12, 15]) expect(16 * fitScale(slateImageSize(n, slateCopyColumns(n, wide), wide), SLATE_PAGE), `${n} games`).toBeGreaterThanOrEqual(12);
    // with round 7's 120 px gap they would not be
    expect(16 * fitScale(slateImageSize(15, slateCopyColumns(15, wide, SLATE_PAGE, 120), wide, 120), SLATE_PAGE)).toBeLessThan(12);
  });

  it('a tall page gets fewer columns', () => {
    expect(slateCopyColumns(12, CARD, { width: 911, height: 1920 })).toBeLessThan(slateCopyColumns(12, CARD));
  });

  it('pixel ratio: 4, or enough for 2× the fitted size', () => {
    const one = slateImageSize(1, 1, CARD);
    const r = slatePixelRatio(one);
    expect(r).toBeGreaterThanOrEqual(2 * fitScale(one, SLATE_PAGE));
    const many = slateImageSize(15, slateCopyColumns(15, CARD), CARD);
    expect(slatePixelRatio(many)).toBe(4);
  });
});
