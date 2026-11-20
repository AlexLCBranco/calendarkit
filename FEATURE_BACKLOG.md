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

### CK-23 — Floating live scores window
**In short:** A "Pop out live scores" button opens a small always-on-top window (like halftime-timer's pop-out) with today's NBA games and live scores, so you can watch them over other apps.
**What:**
- Same technique as halftime-timer's pop-out (Document Picture-in-Picture; Chrome/Edge desktop; button hidden where not supported).
- Button in the Slate header. Window: one compact line per game of the Slate's day: start time or "LIVE Q3 4:12" in red, `BOS 58 @ 61 DET`, finals as finals. Uses CK-21's live data and its polling rules (nothing polls when nothing is live). Hide scores (when shipped) applies here too.
- Small and resizable; a normal night fits without a scrollbar.
- Needs CK-21 first.
**Tests:** unit: the window's list (order, live/final/upcoming, hidden scores); e2e: the pop-out content renders from mocked live data.
