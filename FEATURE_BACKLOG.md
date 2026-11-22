# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-22 — Countdown to the Slate's first game (halftime-timer)
**In short:** The Slate gets a "⏱ Countdown" button that opens halftime-timer with a timer counting down to the day's first tip-off.
**What:**
- Button in the Slate header (site and, through the package, the gauntlet Slate widget). Opens halftime-timer in a new tab with an end-time timer set to the first game's start, named e.g. "First game · BOS @ DET 20:00".
- If the first game has already started, it counts to the next game that hasn't, and the timer name says so ("Next game · …"). If none is left: button disabled, tooltip "No more games today".
- Link format (halftime-timer HT-1, shipped; its README): `https://halftime-timer.vercel.app/?end=<ISO date-time with offset>&name=<text, URL-encoded>`, e.g. `https://halftime-timer.vercel.app/?end=2026-11-19T20:00:00-05:00&name=First%20game%20%C2%B7%20BOS%20%40%20DET`.
**Answered (2026-11-21):** Has halftime-timer HT-1 shipped (link format and live URL)? → Yes: it is in halftime-timer's BUILT.md, live at https://halftime-timer.vercel.app; the link format is in the bullet above.
**Tests:** unit: first / next not-started game, link built correctly; e2e: the button's link points to halftime-timer with the right time and name.

### CK-34 — The Slate kit gives one game card on its own
**In short:** Nothing changes on screen in calendarkit: its Slate kit can also hand over a single game card and the night's list of games, so the whiteboard can mix NBA and football games in time order.
**Why:** gauntlet GT-21 (Combined Slate). Today the kit only draws a whole night with its own header (SlateCopy), so cards can't be mixed with another sport's.
**What:**
- The kit exports: the list of a night's games (each with its start time as an exact instant, and an id), and a way to draw one game's card alone, exactly the card the Slate shows, live score included.
- The NBA card's size does not change: 509 × 78 (owner, 2026-11-21).
- The whole-night Slate keeps working and is built from the same single card (one card code, not two).
- Raise `SLATEKIT_API` only if an existing export changes.
**Sibling:** footykit FK-77. gauntlet GT-21 waits for both.
**Tests:** unit: the night's list is in start-time order with exact instants; e2e: one card drawn alone is 509 × 78 and has the same content as that game's card in the site's Slate.
