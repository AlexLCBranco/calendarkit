// Slate: pure layout rules for the copied image of a day's game cards.

/**
 * Sketching space (CSS px) between the cards of a copied slate, and half of it around them: everything there is
 * transparent, for drawing on the whiteboard. The site's own gap is 12 px. One constant, to tune. 120 px. * 24 px — each card now carries its own note box (the space written over on the whiteboard) and is ~2× wider, and with
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
 * The tight info block. A narrow strip on the left (tip-off time or "Final", then a wrapping row of the
 * ↗ link, the season-series chip, the TV pill and the Cup / play-off tags) beside the two team rows, whose tracks are
 * fixed and sized to their widest content at the app's text sizes (nothing shrunk): "@" 13, logo 28,
 * name 110 ("Timberwolves" is 109.7 px at 16 px semibold), record 39 ("41-41" at 12 px), streak 28 ("W12"), Fatigue 102
 * (B2B badge, two nights, the "7in11" chip — the stretch, tonight's place is in its tooltip), score 35 ("128" at 18 px),
 * odds 34 ("10.50" at 12 px semibold, 34.3 px; reserved whether or not odds came), 4 px apart. All CSS px; the CSS reads them as variables (slateVars), so this is the one source.
 */
export const SLATE_STRIP = 68; // "00:30 (+1)" is 66 px; the widest chip 56.8 px (Cup tags), chips ≤ 2 lines from 60 px (measured over the season)
export const SLATE_STRIP_GAP = 6;
export const SLATE_ROW_TRACKS = { at: 13, logo: 28, name: 110, rec: 39, streak: 28, fx: 102, score: 35, odds: 34 } as const;
export const SLATE_ROW_GAP = 4;
const trackSum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0) + (Object.keys(t).length - 1) * SLATE_ROW_GAP;
/** The info block's width: strip, its gap, the team rows. */
export const SLATE_INFO_WIDTH = SLATE_STRIP + SLATE_STRIP_GAP + trackSum(SLATE_ROW_TRACKS);
/** Card padding (8 px, was 12 / 14) and border. */
export const SLATE_CARD_PAD = 8;
export const SLATE_CARD_BORDER = 1;
/** An info-only card's width (notes hidden): the info block and the card's padding and border, nothing stretched. */
export const SLATE_CARD_WIDTH = SLATE_INFO_WIDTH + 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER);
/** Notes hidden: as many info-only cards per row as fit `width`, SLATE_GRID_GAP apart (at least 1). */
export const slateInfoColumns = (width: number, cup: CupTrackKind = false) => Math.max(1, Math.floor((width + SLATE_GRID_GAP) / (slateCardWidth(cup) + SLATE_GRID_GAP)));

/**
 * Each card is the game's info at its old size (the info-only card's content width), the room right of
 * it holding the note's space label and switch, and the note box under the team rows across the whole card. The grid
 * starts at the page's left edge and fills the widget: two columns while the room right of the info keeps
 * SLATE_NOTE_MIN (the column rule from when the note box sat there, kept so the grid is unchanged), else one.
 */
/** The gap between the info and the room right of it, and the gap between cards (CSS px). */
export const SLATE_NOTE_GAP = 14;
export const SLATE_GRID_GAP = 12;
/** The narrowest note box worth writing in (Alex: "~300 px"). */
export const SLATE_NOTE_MIN = 300;

/**
 * On a night with NBA Cup group games, every card's team rows get one more track after the streak —
 * the team's 4 group games as mini squares (37 px: "vs MEM" over "W +12" at 10 px) and its group record over its
 * differential (22 px). Alex's choice (2026-11-06): the note boxes give up the room those nights (~220 px at 1920, the
 * 300 px minimum waived down to SLATE_NOTE_MIN_CUP), so the cards keep 2 columns and their height.
 */
export const SLATE_CUP_TRACK = 4 * 37 + 3 * 2 + 4 + 22;
export const SLATE_NOTE_MIN_CUP = 175;
/**
 * On a Cup night where a team on show has clinched ("IN") or is out ("OUT"), the track gets the tag
 * after the squares (only those nights: the last group nights). The note boxes give those 24 px too (~183 px at 1920;
 * SLATE_NOTE_MIN_CUP 200 → 175 for that, so 2 columns stay).
 */
export const SLATE_CUP_TAG = 24;
/**
 * On a night where tonight can settle something for a team on show, that column holds the stakes
 * chips ("Win = clinch", "+8 to pass ORL", two lines at most) and is 72 px; the note boxes give it (~135 px at 1920;
 * SLATE_NOTE_MIN_STAKES 130 those nights, so the 2 columns stay) — flagged to Alex.
 */
export const SLATE_CUP_CHIPS = 72;
export const SLATE_NOTE_MIN_STAKES = 130;
/** 0: no Cup track; 1: the Cup track; 2: with the IN / OUT tag column; 3: with the stakes chips column. */
export type CupTrackKind = 0 | 1 | 2 | 3 | boolean;
export const cupExtra = (cup: CupTrackKind) => (cup === 2 ? SLATE_CUP_TAG : cup === 3 ? SLATE_CUP_CHIPS : 0);
const cupWidth = (cup: CupTrackKind) => (!cup ? 0 : SLATE_CUP_TRACK + SLATE_ROW_GAP + cupExtra(cup));
/** The info block's width on a Cup night or not. */
export const slateInfoWidth = (cup: CupTrackKind = false) => SLATE_INFO_WIDTH + cupWidth(cup);
/** An info-only card's width on a Cup night or not. */
export const slateCardWidth = (cup: CupTrackKind = false) => slateInfoWidth(cup) + 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER);

/** The note box's width in a card `card` px wide. */
export const slateNoteWidth = (card: number, cup: CupTrackKind = false) => card - 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER) - slateInfoWidth(cup) - SLATE_NOTE_GAP;

/** Columns of cards for a widget `width` px wide: 2 when each card's note box keeps SLATE_NOTE_MIN (Cup nights: SLATE_NOTE_MIN_CUP), else 1. */
export const slateColumns = (width: number, cup: CupTrackKind = false) => (slateNoteWidth((width - SLATE_GRID_GAP) / 2, cup) >= (cup === 3 ? SLATE_NOTE_MIN_STAKES : cup ? SLATE_NOTE_MIN_CUP : SLATE_NOTE_MIN) ? 2 : 1);

/**
 * In a copied slate with note boxes, the game's info is drawn larger inside the card — the card keeps
 * its on-screen width; the note box is under the team rows, so the info may take the card's width but for the space
 * label in the top-right corner (SLATE_COPY_HEAD), at most ×SLATE_COPY_ZOOM_MAX; the card only grows in height as much
 * as the bigger content needs. Pasted and shrunk on the whiteboard, the text, logos and scores stay readable. CSS
 * `zoom` (layout, not a transform), so the image stays crisp at its pixel ratio. Info-only cards (notes hidden) are
 * exactly their content: nothing to give, ×1.
 */
export const SLATE_COPY_ZOOM_MAX = 1.35;
/** The room the copy keeps right of the info for the space label ("POST" at 11 px bold in its pill: ~42 px). */
export const SLATE_COPY_HEAD = 56;
/**
 * A copied card's width (calendarkit's images; Alex, 2026-11-13): no wider than the info at ×SLATE_COPY_ZOOM_MAX plus
 * the label's room — the note under the rows made copied cards taller, and at the on-screen width a 15-game night's image
 * fitted to the page showed the names at 10.9 px (this width: ≥ 12). Never wider than on screen (`shown`).
 */
export const slateCopyCardWidth = (shown: number, cup: CupTrackKind = false) => Math.min(shown, Math.ceil(slateInfoWidth(cup) * SLATE_COPY_ZOOM_MAX) + SLATE_COPY_HEAD + 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER));
export function slateCopyZoom(cardWidth: number, cup: CupTrackKind = false, notes = true): number {
  if (!notes) return 1;
  const room = cardWidth - 2 * (SLATE_CARD_PAD + SLATE_CARD_BORDER) - SLATE_COPY_HEAD;
  return Math.max(1, Math.min(SLATE_COPY_ZOOM_MAX, Math.floor((room / slateInfoWidth(cup)) * 100) / 100));
}
