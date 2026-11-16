# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-6 — Hover popups close as soon as the cursor leaves
(owner, 2026-11-16, chat; gauntlet's GT-9 waits for this)
Today a hover popup (tooltip, streak popup, season-series popup) can stay open after the cursor has left its element.
Fix it in the hooks themselves (useTooltip, useStreakPopup, useSeriesPopup in src/slate/), not around them: gauntlet's
Slate widget uses the same hooks, so one fix covers /calendar and the whiteboard.
- Leaving an element closes its popup within 100 ms.
- Moving straight from one element to another swaps to the new popup without a flicker or both being open.
- The popups have clickable links, so the cursor must be able to travel from the element into its popup: a short grace
  (about 100 ms) only for that trip; once the cursor leaves the popup, it closes within 100 ms.
- Never two popups open at once; a fast sweep across a whole night leaves none stuck open.
Tests (Playwright, automated): leave → gone within 100 ms (for each popup type); element → element; element → popup →
click its link; a fast sweep across every card leaves no popup open. Only "does it feel smooth" is left to the owner.

### CK-7 — Tight grid: divider lines instead of gaps between Slate cards
(owner, 2026-11-16, chat; gauntlet's GT-8 waits for this)
The space between the Slate's cards (24 px today) becomes a 1 px divider line, like a table: cards touch, split only by
the lines. Everywhere the Slate is drawn: /calendar, the copy layout (copy-paste) and the component gauntlet embeds.
- Nothing a card shows today is removed, hidden, shrunk or moved out: times, game number, TV, teams, logos, records,
  streaks, rest/B2B badges, home/away icons, chips, dots, odds, notes. Only the space between cards changes.
- All corners square, the outer edge too (owner: "keep all lines straight").
- With notes shown, a card and its note box are one cell of the grid.
- The highlighted card (teal border today) keeps a visible highlight as an inset outline that does not cover the
  dividers or its neighbours.
Tests: every piece of each card's info is still present (compare against the current layout's content); cards touch
with one 1 px line between them, in /calendar and in a copy; highlight visible; existing visual/copy tests updated to
the new layout, not loosened.
