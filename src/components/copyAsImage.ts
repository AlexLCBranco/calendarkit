// "Copy as image", ported from Boardkit (src/features/board/copyAsImage.ts): html-to-image renders the element at
// pixelRatio 4, so a paste into a whiteboard (tldraw, Excalidraw) stays sharp when it's scaled up. Differences:
// every copy is laid over the app's dark background (never transparent corners), and the ratio cap is a pure
// function so it can be unit-tested.

import { toSvg } from 'html-to-image';

/**
 * Browsers cap canvas size (Chrome: 16384 px on a side), and a blank or failed export is the result of exceeding
 * it — so a big export lowers its own pixel density rather than fail.
 */
export const MAX_CANVAS_SIDE = 16000;

/** Pixel density of every copy. */
export const COPY_PIXEL_RATIO = 4;

export interface RenderOptions {
  /** Preferred pixel density; lowered automatically if the node is huge. */
  readonly pixelRatio: number;
  /** Renders the clone at this CSS zoom, e.g. `1` to ignore a zoomed ancestor's view. */
  readonly zoom?: number;
  /** Fills the background, for formats (JPEG) that have no transparency. */
  readonly backgroundColor?: string;
}

/** The pixel ratio actually used for a node of this size: `preferred`, unless the canvas would exceed the cap. */
export const capturePixelRatio = (width: number, height: number, preferred: number) => Math.min(preferred, MAX_CANVAS_SIDE / Math.max(width, height, 1));

/** Elements tagged `data-capture-exclude="true"` (copy buttons) are left out of the image. */
/** The lists' active-day highlight (a class on the day section / the row); never part of an image. */
export const ACTIVE_DAY = 'ck-active-day';

/**
 * Lifts the active-day highlight from `node` and everything in it, with transitions off so the copy reads the plain
 * look at once, and marks it `ck-capturing` (countdowns show their time); returns the undo (the highlight is back, still without a fade, then transitions on again).
 */
export function suspendForCapture(node: HTMLElement): () => void {
  const els = [node, ...node.querySelectorAll<HTMLElement>(`.${ACTIVE_DAY}`)].filter((e) => e.classList.contains(ACTIVE_DAY));
  const all = [node, ...node.querySelectorAll<HTMLElement>('*')];
  const transitions = all.map((e) => e.style.transition);
  all.forEach((e) => (e.style.transition = 'none'));
  els.forEach((e) => e.classList.remove(ACTIVE_DAY));
  // countdowns show their plain time in images (CSS under .ck-capturing)
  node.classList.add('ck-capturing');
  return () => {
    node.classList.remove('ck-capturing');
    els.forEach((e) => e.classList.add(ACTIVE_DAY));
    void node.offsetWidth; // apply without a fade before the transitions come back
    all.forEach((e, i) => (e.style.transition = transitions[i]!));
  };
}

export const keepInCapture = (node: Node) => !(node instanceof HTMLElement && node.dataset.captureExclude === 'true');

/**
 * Computed properties a copy never needs (round 6). html-to-image writes every computed property (~480 in Chrome) into
 * each clone's inline style, and the browser then parses all of it again to draw the SVG — that is most of a copy's
 * time (full Team List: ~5 s, 85 % of it drawing a 19 MB SVG). Left out: the logical duplicates of physical properties
 * (the widget is horizontal, left to right, so `inline-size` = `width`, `margin-inline-start` = `margin-left`, …) and
 * what can't change a still image (animation, transitions, scroll snapping/margins, anchoring, pointer/caret/selection,
 * paging, multi-column rules, ruby, math). Kept although it looks irrelevant: `overscroll-behavior-x/y` (leaving it out
 * changed ~500 pixel channels of a League List image). Images are pixel-identical with and without the rest (checked on
 * the six whole-view kinds, test-output/m6/copydiff.mjs).
 */
export const CAPTURE_SKIP_STYLE =
  /^(?:(?:border|margin|padding|inset|overflow|overscroll-behavior|scroll-margin|scroll-padding|contain-intrinsic|max|min)-(?:block|inline)|(?:block|inline)-size$|border-(?:start|end)-(?:start|end)-radius$|corner-(?:start|end)-(?:start|end)-shape$|animation|transition|scroll-|view-transition|view-timeline|timeline|anchor-|position-(?:anchor|area|try|visibility)|interest-|trigger-|caret|cursor$|pointer-events$|touch-action$|user-select$|resize$|speak$|orphans$|widows$|break-|app-region$|window-drag$|interactivity$|reading-|field-sizing$|overflow-anchor$|scrollbar-|will-change$|print-color-adjust$|column-rule|row-rule|rule-overlap$|ruby-|math-|-webkit-(?:user-|tap-highlight|locale$|rtl-ordering$|line-break$|text-security$))/;

let captureStyle: string[] | undefined;
/** The computed properties every clone gets: the browser's list minus CAPTURE_SKIP_STYLE (worked out once). */
export const captureStyleProperties = () => (captureStyle ??= [...getComputedStyle(document.documentElement)].filter((p) => !CAPTURE_SKIP_STYLE.test(p)));

/**
 * Rasterises `node` onto a canvas. Every element tagged `data-capture-exclude="true"` is skipped, so the image is
 * the content only, not its interactive chrome. Throws on failure; callers own the user-facing state.
 */
export async function renderToCanvas(node: HTMLElement, options: RenderOptions): Promise<HTMLCanvasElement> {
  const pixelRatio = capturePixelRatio(node.scrollWidth, node.scrollHeight, options.pixelRatio);
  const restore = slackWrappingRows(node);
  const unsuspend = suspendForCapture(node);
  try {
    // html-to-image's toCanvas, except loading the image (loadImage): the node's size as it measures it, its SVG, drawn
    // at the pixel ratio
    const px = (p: string) => parseFloat(getComputedStyle(node).getPropertyValue(p)) || 0;
    const width = node.clientWidth + px('border-left-width') + px('border-right-width');
    const height = node.clientHeight + px('border-top-width') + px('border-bottom-width');
    const svg = await toSvg(node, {
      width,
      height,
      filter: keepInCapture,
      includeStyleProperties: captureStyleProperties(),
      ...(options.zoom !== undefined ? { style: { zoom: String(options.zoom) } } : {}),
    });
    const img = await loadImage(svg);
    const canvas = document.createElement('canvas');
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    if (options.backgroundColor !== undefined) {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    unsuspend();
    restore();
  }
}

/**
 * Loads the copy's SVG as an image. html-to-image's own loader waits on `img.decode()` and has no handler for its
 * rejection, so when Chrome rejects the decode of a very large SVG (seen on CI: a full Team List, ~13 MB) the copy
 * never finished and the button stayed idle forever (round 6). Here a rejected decode is only a missed head start: the
 * image has loaded, and drawImage decodes it. A load error rejects (the button shows "!").
 */
export function loadImage(url: string, ImageCtor: new () => HTMLImageElement = Image): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new ImageCtor();
    img.onload = () => {
      img
        .decode()
        .catch(() => undefined)
        .then(() => requestAnimationFrame(() => resolve(img)));
    };
    img.onerror = () => reject(new Error('the copy\'s image did not load'));
    img.decoding = 'async';
    img.src = url;
  });
}

/** Extra width (CSS px) a wrapping flex row gets while it's cloned. */
export const WRAP_SLACK = 0.1;

/**
 * html-to-image gives every clone its element's computed width as a string, rounded to a few decimals. A wrapping
 * flex row whose items exactly fill it can then come out a hair too narrow and wrap in the image (seen: a TV badge
 * dropped below its game row, clipped). Each wrapping flex row inside `node` gets WRAP_SLACK more width while it is
 * cloned; returns the undo. (`node` itself is left alone: its size is the image's size.)
 */
export function slackWrappingRows(node: HTMLElement): () => void {
  const rows = [...node.querySelectorAll<HTMLElement>('*')].filter((el) => {
    const cs = getComputedStyle(el);
    return cs.flexWrap === 'wrap' && cs.display.includes('flex');
  });
  const widths = rows.map((el) => [el.style.width, parseFloat(getComputedStyle(el).width)] as const); // read all, then write
  rows.forEach((el, i) => (el.style.width = `${widths[i]![1] + WRAP_SLACK}px`));
  return () => rows.forEach((el, i) => (el.style.width = widths[i]![0]));
}

/**
 * Rasterises `node` and puts the PNG on the clipboard. `finish`, if given, gets the captured canvas first and
 * returns the one to copy (here: the dark background behind it).
 */
export async function copyAsImage(node: HTMLElement, options: RenderOptions, finish?: (captured: HTMLCanvasElement) => Promise<HTMLCanvasElement> | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const captured = await renderToCanvas(node, options);
  const canvas = finish ? await finish(captured) : captured;
  const blob = await canvasToBlob(canvas, 'image/png');
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), type, quality);
  });
}

/** `captured` laid over a solid fill: rounded corners and gaps get the app's background instead of transparency. */
export function withBackground(captured: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = captured.width;
  out.height = captured.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(captured, 0, 0);
  return out;
}

/** The widget's background (`--ck-bg`, set on .ck-root and .ck-card), as seen from `node`. */
export const appBackground = (node: HTMLElement) => getComputedStyle(node).getPropertyValue('--ck-bg').trim() || '#0f1115';

/** What every copy button does: `node` at pixelRatio 4 on the dark background, to the clipboard. */
export function copyElement(node: HTMLElement, zoom?: number): Promise<HTMLCanvasElement> {
  return copyAsImage(node, { pixelRatio: COPY_PIXEL_RATIO, ...(zoom !== undefined ? { zoom } : {}) }, (c) => withBackground(c, appBackground(node)));
}
