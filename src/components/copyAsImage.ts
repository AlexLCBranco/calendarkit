// "Copy as image", ported from Boardkit (src/features/board/copyAsImage.ts): html-to-image renders the element at
// pixelRatio 4, so a paste into a whiteboard (tldraw, Excalidraw) stays sharp when it's scaled up. Differences:
// every copy is laid over the app's dark background (never transparent corners), and the ratio cap is a pure
// function so it can be unit-tested.

import { toCanvas } from 'html-to-image';

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
 * Rasterises `node` onto a canvas. Every element tagged `data-capture-exclude="true"` is skipped, so the image is
 * the content only, not its interactive chrome. Throws on failure; callers own the user-facing state.
 */
export async function renderToCanvas(node: HTMLElement, options: RenderOptions): Promise<HTMLCanvasElement> {
  const pixelRatio = capturePixelRatio(node.scrollWidth, node.scrollHeight, options.pixelRatio);
  const restore = slackWrappingRows(node);
  const unsuspend = suspendForCapture(node);
  try {
    return await toCanvas(node, {
      pixelRatio,
      filter: keepInCapture,
      ...(options.zoom !== undefined ? { style: { zoom: String(options.zoom) } } : {}),
      ...(options.backgroundColor !== undefined ? { backgroundColor: options.backgroundColor } : {}),
    });
  } finally {
    unsuspend();
    restore();
  }
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
