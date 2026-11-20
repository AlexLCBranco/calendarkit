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
- Before the first game starts (owner, 2026-11-19, from I-3): the window opens as a countdown to the first game of the Slate's day (like halftime-timer's), and turns into the live scores list by itself at kickoff/tip-off. One click on the pop-out button, one window for the whole night.
- Needs CK-21 first.
**Tests:** unit: the window's list (order, live/final/upcoming, hidden scores); e2e: the pop-out content renders from mocked live data.

### CK-24 — NBA history: past seasons' standings, play-in and playoffs
**In short:** Like the Cup history, you can pick any past NBA season and see its final standings (East and West side by side), the play-in and the full playoff bracket.
**What:**
- Season picker (newest first) in Standings, with the same columns as today's standings where the data exists for that season.
- Play-in (2020-21 on) and the full playoff bracket with series results; hover a series for its games (scores, links to each game page as the app's click rules say: hoopsjunkie where it has the game, NBA.com otherwise).
- A small summary like the Cup history: champions and conference winners by season.
- Free sources only (NBA's own data feeds, Basketball-Reference pages for links); go back as far as free data is reliable and say in the report how far that is. Must not slow down today's pages: history loads only when opened.
**Tests:** unit: final standings and bracket for a few past seasons equal the real ones (checked against a second source); e2e: pick 2015-16, standings and bracket render, a series hover shows its games.
