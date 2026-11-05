// Slate (round 7): pure layout rules for the copied image of a day's game cards.

/**
 * Sketching space (CSS px) between the cards of a copied slate, and half of it around them: everything there is
 * transparent, for drawing on the whiteboard. The site's own gap is 12 px. One constant, to tune. Round 7: 120 px. Round 9:
 * 24 px — each card now carries its own note box (the space written over on the whiteboard) and is ~2× wider, and with
 * 120 px a 12- or 15-game night fitted to a 1920 × 911 page showed the team names at ~10 px (24 px: ≥ 12.9 px).
 */
export const SLATE_COPY_GAP = 24;

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

/**
 * Round 14 (item 3): the tight info block. A narrow strip on the left (tip-off time or "Final", then a wrapping row of the
 * ↗ link, the season-series chip, the TV pill and the Cup / play-off tags) beside the two team rows, whose tracks are
 * fixed and sized to their widest content at the text sizes used since round 7 (nothing shrunk): "@" 13, logo 28,
 * name 110 ("Timberwolves" is 109.7 px at 16 px semibold), record 39 ("41-41" at 12 px), streak 28 ("W12"), Fatigue 102
 * (B2B badge, two nights, the "7in11" chip — the stretch, tonight's place is in its tooltip), score 35 ("128" at 18 px),
 * odds 34 (item 4: "10.50" at 12 px semibold, 34.3 px; reserved whether or not odds came), 4 px apart. All CSS px; the CSS reads them as variables (slateVars), so this is the one source.
 */
export const SLATE_STRIP = 68; // "00:30 (+1)" is 66 px; the widest chip 56.8 px (Cup tags), chips ≤ 2 lines from 60 px (measured over the season)
export const SLATE_STRIP_GAP = 6;
export const SLATE_ROW_TRACKS = { at: 13, logo: 28, name: 110, rec: 39, streak: 28, fx: 102, score: 35, odds: 34 } as const;
export const SLATE_ROW_GAP = 4;
const trackSum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0) + (Object.keys(t).length - 1) * SLATE_ROW_GAP;
/** The info block's width: strip, its gap, the team rows. */
export const SLATE_INFO_WIDTH = SLATE_STRIP + SLATE_STRIP_GAP + trackSum(SLATE_ROW_TRACKS);
/** Card padding (round 14: 8 px, was 12 / 14) and border. */
export const SLATE_CARD_PAD = 8;
export const SLATE_CARD_BORDER = 1;
/** An info-only card's width (notes hidden): the info block and the card's padding and border, nothing stretched. */
export const SLATE_CARD_WIDTH = SLATE_INFO_WIDTH + 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER);
/** Notes hidden: as many info-only cards per row as fit `width`, SLATE_GRID_GAP apart (at least 1). */
export const slateInfoColumns = (width: number) => Math.max(1, Math.floor((width + SLATE_GRID_GAP) / (SLATE_CARD_WIDTH + SLATE_GRID_GAP)));

/**
 * Round 9 (Part 3): each card is the game's info at its old size (the round 7 card's content width) beside a note box
 * that takes the rest of the card. The grid starts at the page's left edge and fills the widget: two columns while each
 * card's note box keeps SLATE_NOTE_MIN, else one.
 */
/** The gap between the info and the note box, and the gap between cards (CSS px). */
export const SLATE_NOTE_GAP = 14;
export const SLATE_GRID_GAP = 12;
/** The narrowest note box worth writing in (Alex: "~300 px"). */
export const SLATE_NOTE_MIN = 300;

/** The note box's width in a card `card` px wide. */
export const slateNoteWidth = (card: number) => card - 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER) - SLATE_INFO_WIDTH - SLATE_NOTE_GAP;

/** Columns of cards for a widget `width` px wide: 2 when each card's note box keeps SLATE_NOTE_MIN, else 1. */
export const slateColumns = (width: number) => (slateNoteWidth((width - SLATE_GRID_GAP) / 2) >= SLATE_NOTE_MIN ? 2 : 1);
