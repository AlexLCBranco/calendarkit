# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-22 — Countdown to the Slate's first game (halftime-timer)
**In short:** The Slate gets a "⏱ Countdown" button that opens halftime-timer with a timer counting down to the day's first tip-off.
**What:**
- Button in the Slate header (site and, through the package, the gauntlet Slate widget). Opens halftime-timer in a new tab with an end-time timer set to the first game's start, named e.g. "First game · BOS @ DET 20:00".
- If the first game has already started, it counts to the next game that hasn't, and the timer name says so ("Next game · …"). If none is left: button disabled, tooltip "No more games today".
- Uses the link format from halftime-timer HT-1.
Blocked: waits for halftime-timer HT-1 (its link format and live URL); the owner unblocks it once HT-1 ships.
**Tests:** unit: first / next not-started game, link built correctly; e2e: the button's link points to halftime-timer with the right time and name.

### CK-33 — Calendar screen: controls move up into the tab row
**In short:** On the calendar screen, the WHAT / HOW / 1 week–2 weeks–Month / month-arrows / Today controls sit on the same line as the top menu tabs, in the empty space to their right, and the row under the line is gone.
**What:**
- Screen: the team calendar screen (owner's screenshot, 2026-11-21: tabs row, a thin line, then a second row with the controls).
- Move every control of that second row into the tabs row, to the right of the last tab, in the same left-to-right order as today. Nothing is removed, renamed or restyled.
- The tabs row must NOT get taller: same height and spacing as today. The line stays where it is, with the page content starting right under it, so the page gains the height of the removed row.
- The owner always uses a full-size window; that is the width this must fit at. If it can't fit on one line there without shrinking text, stop and add a `Blocked:` note instead of wrapping or growing the row.
- Other screens: unchanged in this item.
**Sibling:** FK-75 in footykit (same change, keep the two looking the same).
**Tests:** e2e at a full-size desktop viewport: the controls are inside the tabs row, no control row exists under the line, and the tabs row's height equals its height before the change.
