// One hover popup open at a time, across every popup hook (tooltip, streak, series) and every widget on the page:
// a hook that opens claims the gate, which closes the one open before it at once — moving from one element to another
// swaps popups in the same render, never two open, never a stuck one.

/** The grace after the pointer leaves an element with a clickable popup, to travel into it; it closes after that. */
export const POPUP_GRACE_MS = 80;

let active: (() => void) | undefined;

/** `close` (a hook's own, stable) now holds the gate; the previous holder closes. */
export function claimPopup(close: () => void) {
  if (active && active !== close) active();
  active = close;
}

/** `close` gives the gate up (its popup closed). */
export function releasePopup(close: () => void) {
  if (active === close) active = undefined;
}
