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
