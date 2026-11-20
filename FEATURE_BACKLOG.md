# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-21 — Live scores with a red LIVE label
**In short:** While an NBA game is being played, every place that shows that matchup shows the current score and a red "LIVE" label with the quarter and clock, updating by itself about once a minute.
**What:**
- Where: every view that shows a matchup — League and Team schedules (lists and calendars, 1 week / 2 weeks / month), Slate (site and the gauntlet Slate widget), Cup schedule and Cup standings squares, popups that list games (season series, streak, 3-in-4, B2B), and "copy as image" (a copy taken mid-game shows the score and LIVE at that moment).
- Score: same layout as final scores (`[logo] BOS 58 @ 61 DET [logo]`). Next to it a red "LIVE" label plus the period and clock (e.g. "LIVE Q3 4:12", "LIVE Half", "LIVE OT 1:30"). The label must be clearly red and readable at a glance in every view, including the small calendar cells (there, "LIVE" plus the score is enough; period/clock may drop if it doesn't fit).
- When the game ends: LIVE goes away and the score becomes the normal final (with the OT marker as today), with no reload and no wait for the next daily snapshot.
- Source: ESPN's free scoreboard (`site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD`, no key). `api/odds.ts` already fetches it for odds and finals; reuse that call (or a sibling endpoint) so the browser makes one small same-origin request that the CDN shares. Status/period/clock come from each event's `status`.
- Refresh: only while a game on screen is live or within ~15 min of tip-off, and only while the tab is visible; about once a minute (lower the CDN cache for live answers from today's 120 s to ~60 s). Nothing polls when no game is live. The site must stay as fast as it is now (fluidity is the priority).
- Failure: if ESPN doesn't answer, keep showing what's on screen (last known score, or the start time) without errors or empty gaps.
- Hide scores (when that ships): hidden scores also hide live scores; the LIVE label stays so he knows the game is on.
- gauntlet: the Slate widget gets this through the calendarkit package; bump the pinned commit in gauntlet after this ships.
**Tests:** unit: ESPN status → label text (pre, in Q1–Q4, Half, End of Qn, OT, final), polling only while live or near tip-off, failure keeps the last score; e2e with a mocked ESPN answer: a live game shows score + red LIVE in League list, Team calendar and Slate, then turns into a final score without reload.

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
