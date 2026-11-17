// The Slate kit (gauntlet GT-5): everything the gauntlet's Slate widget uses from calendarkit, built on its own
// (vite.slatekit.config.ts) into /calendar/slatekit/, so the whiteboard loads calendarkit's current Slate at run time —
// a new card design here reaches the whiteboard with calendarkit's deploy, no new pin in the gauntlet. React comes from
// the page that loads it (globalThis.__calendarkitHost, see vite.slatekit.config.ts), so the cards are part of the
// page's own React tree. /calendar/slatekit/manifest.json names the files and the kit's API version.
//
// SLATEKIT_API: bumped only when this list changes in a way an older gauntlet can't use (a name removed or a
// signature changed); the gauntlet then keeps its own pinned copy until it is updated. Adding names is fine.

import './slate.css';

export * from './index';
export { SLATE_GRID_GAP, slateCardWidth } from './layout';
export { claimPopup, releasePopup } from './popupGate';
export { slateCopyCup } from './SlateCard';

export const SLATEKIT_API = 1;
