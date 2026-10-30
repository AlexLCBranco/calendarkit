// Slate (round 7): pure layout rules for the copied image of a day's game cards.

/**
 * Sketching space (CSS px) between the cards of a copied slate, and half of it around them: everything there is
 * transparent, for drawing on the whiteboard. The site's own gap is 12 px. One constant, to tune.
 */
export const SLATE_COPY_GAP = 120;

/** The page the image goes onto when no window is measured (Alex's whiteboard window). */
export const SLATE_PAGE = { width: 1920, height: 911 };

/** The image's CSS size for `n` cards in `cols` columns (gap between, half a gap around). */
export function slateImageSize(n: number, cols: number, card: { width: number; height: number }, gap = SLATE_COPY_GAP) {
  const rows = Math.ceil(n / cols);
  return { width: cols * (card.width + gap), height: rows * (card.height + gap), rows };
}

/** How much the image is scaled to fit the page (both sides inside it). */
export const fitScale = (img: { width: number; height: number }, page: { width: number; height: number }) => Math.min(page.width / img.width, page.height / img.height);

/**
 * Columns for a copied slate of `n` cards: the count whose image, scaled to fit the page, shows the cards largest —
 * so its shape comes close to the page's (wide). Not the screen's 2 columns: 12 cards (474 × 117 px, 120 px gap) on a
 * 1920 × 911 page come out 3 × 4, not 2 × 6; 3 cards come out 2 + 1 (fitted ×1.62; one row of 3 would be ×1.08) — Alex
 * chose this rule over "3 = one row" (2026-10-30). Ties: fewer columns.
 */
export function slateCopyColumns(n: number, card: { width: number; height: number }, page = SLATE_PAGE, gap = SLATE_COPY_GAP): number {
  let best = 1;
  let bestScale = 0;
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const s = fitScale(slateImageSize(n, cols, card, gap), page);
    if (s > bestScale + 1e-9) {
      best = cols;
      bestScale = s;
    }
  }
  return best;
}

/**
 * Pixel ratio of a slate image: the copies' usual 4, or more when the image, fitted to the page, is shown larger than
 * a quarter of its pixels — so it stays sharp up to 2× its fitted size (one card fills a page at ~2.5×).
 */
export const slatePixelRatio = (img: { width: number; height: number }, page = SLATE_PAGE) => Math.max(4, Math.ceil(2 * fitScale(img, page) * 4) / 4);
