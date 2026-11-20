# Built — calendarkit

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.
Entries dated before 2026-11-16 were backfilled from the git commit messages (data, docs, test-only, merge and
spec commits left out). New entries name their backlog ID (see CLAUDE.md, "Feature backlog, built list and ideas").

## 2026-11-20
- CK-25 — Shared layout: pinned header menu, chips instead of dropdowns (v1.91.0)
  A header pinned at the top of every page (back / forward, a breadcrumb whose parts jump to their neighbours, "Go anywhere" on Ctrl+K, the icon buttons, the Schedule · Cup · Standings tabs), and under it the teams as chips and a How switch instead of the team picker; the two trial menus are gone.
- CK-23 — Floating live scores window (v1.91.0)
  The Slate's "⧉ Pop out live scores" opens a small always-on-top window (Chrome / Edge) with the day's games and live scores, and a countdown to the first game until it starts.
- CK-24 — NBA history: past seasons' standings, play-in and playoffs (v1.91.0)
  Standings has a season strip: any season from 2001-02 shows its final standings, play-in and full bracket (hover a series for its games), plus every season's champions and conference winners.

## 2026-11-19
- CK-21 — Live scores with a red LIVE label (v1.90.0)
  While a game is being played, every view showing it has the score so far and a red "LIVE Q3 4:12" label, updated about once a minute, and the final score as soon as it ends, with no reload.
- CK-20 — "NBA Cup" tag without the group outside the Cup section (v1.89.0)
  Outside the Cup page a Cup group game's tag reads just "NBA Cup" (also in its tooltip); the Cup schedule still shows "West A" and the round names.
- CK-11 — Slate: notes switch always available, never over the odds (v1.88.1)
  In the gauntlet's Slate, each card's ⇄ switch is always there, under the PRE/LIVE/POST label, clear of the odds.
- CK-19 — Standings: offensive and defensive rating (v1.88.0)
  A Ratings set in Standings shows ORtg, DRtg and Net with each team's league rank, from ESPN's possessions (updated daily).

### Internal
- e2e copy test: the single-day copy picks a day that still shows a TV pill (Nov 18 lost its pills once played) (v1.90.0)

## 2026-11-18
- CK-18 — Standings: hover and click to reach the games (v1.87.0)
  In Standings, hovering W-L (or W / L in Main) lists the team's last 5 results, and hovering Left, Home, Road, B2B or a B2B-legs record lists those games, each a link to the game; a click pins the pop-up.
- CK-17 — Season-series popup: other seasons (v1.86.0)
  The season-series popup has ◀ season ▶ to show the same two teams' meetings in the two previous seasons (2025-26, 2024-25: dates, winners, scores, from ESPN), with that season's count and result.
- CK-16 — Cold-weather flag on games (v1.85.0)
  A Slate game whose arena city feels −10 °C or colder at tip-off shows "❄" on its game button (and in copies); the button's pop-up gives the temperature, with "Weather data by Open-Meteo.com".
- CK-15 — Slate game button: player props and injury reports (v1.84.0)
  Each Slate card has a small "⋯" button (in the away row's empty "@" cell, no extra width) opening links to FanDuel's NBA player props, both teams' ESPN injury pages and the official NBA injury report; the team header and the streak pop-up link the team's injury page too.
- CK-14 — Countdown to the first tip-off on the Slate page (v1.83.0)
  The Slate page says "First tip-off in 2h 14m" beside the notes buttons until the night's first game starts; it is never in the Slate itself or a copied image.
- CK-10 — Slate header line (v1.82.0)
  Every Slate starts with "SLATE · 18-11 · NBA" across its top, on screen, in copied images and in the gauntlet's widget; the kit exports `slateHeaderLabel` so a combined Slate can say "NBA + Football".
- CK-12 — Slate: score right beside the team name (v1.81.0)
  A finished game's score follows the team's name on Slate cards; the cards keep their width.
- CK-9 — Slate: clearer lines between cards, never under the TV pill (v1.81.0)
  The lines between Slate cards are clearly visible (on screen, in copies and in the gauntlet's widget); the TV pill already sat clear of every line on every night of the season, now tested.
- CK-8 — Mark back-to-back meetings with the same opponent (v1.80.0)
  The season-series chip ("G2/4") is drawn inverted (light fill) when a team plays the same opponent in consecutive games, both games of the pair; its popup names the team and the other date.
- CK-13 — Short names: Wolves and Blazers (v1.79.0)
  Minnesota and Portland show as "Wolves" and "Blazers" everywhere a team name shows.
- The gauntlet's Slate popups show each day's opponent, as here (v1.78.1, for the gauntlet's GT-13)
  The Slate kit now gives the day squares of a back-to-back or 3-in-4 popup their matchups ("vs NYK", the logo, its page); nothing changes in calendarkit itself.
- Slate notes box: always 3 lines, scrolls inside (v1.78.0, for the gauntlet's GT-11)
  Every note box on a Slate is 3 lines tall, empty or not, so all cards are the same height; a longer note scrolls inside its box; a copied picture still shows each note whole.
### Internal
- test: the Slate pixel reference moved to v1.85.0 (CK-8, 9, 10, 12, 15, 16 change the Slate on purpose); e2e and unit tests never ask Open-Meteo for real weather
- test: the Slate pixel reference moved to v1.78.0 (the 3-line notes box changes the Slate on purpose)

## 2026-11-17
- A Slate can be drawn from a saved schedule, for the gauntlet's archive files (v1.77.0)
  Nothing changes in calendarkit itself; the gauntlet's saved boards keep their night's games as they were.
- Final scores the same night, and the gauntlet's Slate always up to date (v1.76.0)
  A Slate card shows a game's final score within minutes of the end (from ESPN, with the odds), not the next morning; the gauntlet's whiteboard now loads calendarkit's current Slate itself, so changes here reach it with each deploy.
- Notes can be typed in the gauntlet's Slate widget: click a note there (v1.75.0)
  The copy layout, shown live by the gauntlet, opens a clicked note in calendarkit's own field (with ⇄); it looks like the copy until then.
### Internal
- test: the Slate link check picks a night not played yet (16 Nov was played in today's snapshot: its scores are links)

## 2026-11-16
- CK-7 — Tight grid: divider lines instead of gaps between Slate cards (v1.74.0)
  The Slate's cards touch, split by one 1 px line with square corners, on screen, in copies and in the gauntlet's widget; the TV card's teal is an inset outline.
- CK-6 — Hover popups close as soon as the cursor leaves (v1.74.0)
  Tooltips, streak and season-series popups close within 100 ms of leaving, swap without overlap, and never stay stuck after a fast sweep.
- Team List header shows the conference position (v1.73.0)
  The Team List header shows the team's current position after its name ("2nd in the East"), since its rows have no room for it.
- CK-5 — Show a team's position in its league (v1.72.0)
  League List rows show each team's current conference position ("2nd E") beside its record (not in the Team List: no room there).
- CK-4 — Remove the streak from the NBA Cup standings (v1.72.0)
  The Cup group standings and the simulator's group tables no longer show a streak after the team.
### Internal
- test: the CK-7 content check compares against v1.73.0 built in the same run (CI's Linux fonts differ from a Windows baseline)
- test: slate, gamelink and smoke e2e accept games already played in the data snapshot (Nov 15–16 finals: "Final" instead of a time, score links, "IND124@131PHI")
- test: runs side-arrow check waits for the hover fade to finish (read mid-fade at alpha 0.008 in CI)

## 2026-11-15
- v1.71.1: day-strip tooltips never cover the top bar and only their game squares take the pointer (a tip opened under a resting pointer could sit on the team picker); logos inside game squares no longer look like team links
- CK-3 — Bigger hover squares with the matchup. v1.71.0: tooltip day strips with 50 × 42 squares ("vs LAL" / "@ DEN", logo, each a hoopsjunkie link; rest days empty, tonight ringed); season-series squares say "BOS @ DEN"; Team Calendar selection images carry the streak again
- CK-2 — Cup simulator: big, playable knockout bracket. v1.70.0: click a team to advance it QF → SF → Final → champion; margins in Detailed; group picks that move the seeds clear only the stale knockout picks; race and bracket share the bottom row, tables and bracket on one screen
- CK-1 — Win/loss streaks everywhere. v1.69.0: streaks in more places — one StreakChip (same rule, colours and popup) in League List rows, Team Calendar cells, Cup groups and the simulator tables; not in the League week view or the Cup schedule league lists (no room)
- v1.68.0: Standings column set "Extended" — W-L, 3-pt (≤ 3), 10-pt (≥ 10), .500+, <.500 (going into the game), OT, Close; margins on the final score, OT included (as ESPN),…
- v1.67.0: the feed writes double overtime as "Final/OT2" — every OT reader (OT marker, Cup OT rule, standings OT column) accepts "Final/OT", "Final/<n>OT" and "Final/OT<n>" thr…

## 2026-11-14
- v1.66.0: maps become one travel view — a focused game's two teams, last game → this (solid) → next (dashed) with miles on each line, zoom to fit, a panel per team (last / …

## 2026-11-13
- v1.65.1: the 2-day legend entry fits the week view's one-line legend at 1280; e2e follow the 2-day rest marks (week view scale 1.05 at 1920 x 911), the Team List perf gesture th…
- v1.65.0: no lines between Team Calendar cells; no Team List day strip; 2-day rest badge (quiet tier); bigger scope picker; movable / resizable Quick standings popup
- v1.64.0: Slate notes under the team rows, full card width, capped at 5 lines with their own scrollbar; the wheel scrolls the page until a note is clicked into; PRE/LIVE/POST + s…
- v1.63.0: the Slate part for the gauntlet's step 3: SlateCopy takes a gameLink (↗ and score links on a live widget), teamCalendarUrl and the team-link context exported
- v1.62.2: calendar side arrows bigger and blended in
- v1.62.1: every game of a road trip / homestand carries its label ("Road trip · 3/5")
- v1.62.0: road trips / homestands in the Team views; calendar side arrows; tab title follows the page; Slate opens with notes hidden; team links open the Calendar

## 2026-11-12
- v1.61.1: Cup Schedule By date no longer scrolls sideways
- v1.61.0: League List rows in straight columns; its legend moved into ⓘ
- v1.60.0: two menu variants behind a temporary switch (rail / packed bar); Options popover; bar never hides
- v1.59.0: a reload keeps the day; a fresh visit still opens on today
- Test tiers: settled vs in flux; top bar and League List rows in flux (no version: tests and docs only)
- v1.58.4: split CalendarView into a thin shell + one component per destination (no behaviour change)

## 2026-11-11
- Slim the daily snapshot to the fields the app reads (4.1 MB -> 0.6 MB)
- v1.58.3: ESLint (typescript-eslint + react-hooks), lint in CI; fixes for the Nov 7-11 snapshots
- v1.58.2: cleanup — history out of comments, PROJECT.md shrunk, phone/tablet e2e parked

## 2026-11-06
- move.spec: every wait on the new address accepts the page's own date= (the live job's flaky hand-off tests); PROJECT.md round 22 handoff
- move.spec: the second hand-off visit waits for the address with or without the page's own date= (flaky live job since v1.42.0)
- v1.58.1: bar chips' on-state as a class (no :has), only a Fatigue component with the break tick is positioned
- v1.58.0: one-row 44 px top bar (history + destinations | date | views, scope, options, TV chip, ⓘ, icon buttons) that hides while a list is scrolled down (round 22, item 9)
- slate-same: reference v1.57.0 (the Slate and its copies changed on purpose in round 22)
- v1.57.0: copied Slate — each card's info drawn larger inside the same card width, the note box gives the room (round 22, item 14)
- v1.56.0: click rule — every final score and season-series square opens its game on hoopsjunkie; click audit of every view (round 22, item 12)
- v1.55.0: abnormal rest flag — a teal "4d" badge on both games around a 3+ day break, in the B2B / 3-in-4 area, no extra width (round 22, item 15)
- v1.54.2: records and streaks include a finished game (no one-game lag); the next game shows the current line (round 22, item 13)
- v1.54.1: Cup rows' squares fit with Linux fonts; live hand-off test follows the new addresses
- v1.54.0: Cup history — who usually makes the knockout rounds, and each past edition (round 21, item 9)
- v1.53.0: Cup prize money per player under each knockout round (round 21, item 14)
- v1.52.0: rest and travel before Cup knockout games (round 21, item 13)
- v1.51.0: Cup knockout venue markers from the feed — HOST / Neutral · arena / venue TBD (round 21, item 10)
- v1.50.0: "Tonight in the Cup" strip on the Cup page (round 21, item 12)
- v1.49.0: Cup stakes chips — what tonight can settle, from the shared engine (round 21, item 11)
- v1.48.0: Cup IN / OUT tags on the Slate — only when mathematically certain (round 21, item 2)
- v1.47.0: NBA Cup simulator — what-if picks on the shared engine (round 21, item 4)
- v1.46.1: one shared Cup rules engine (round 21, before item 4)
- v1.46.0: Slate Cup squares — each team's 4 group games and Cup record on Cup nights (round 21, item 1)
- v1.45.0: streak popup — hover W6/L2 for that streak's games, each a game link (round 21, item 8)
- v1.44.0: Team List load earlier / more games, one month per click (round 21, item 3)
- v1.43.0: one shared Cup game square — "vs"/"@" before the opponent, every square a game link (round 21, item 5)
- v1.42.0: page history — every view a real history entry, back/forward restore it (round 21, item 6)
- v1.41.0: two-row top bar — destinations, scope picker, fixed date block (round 21, item 7)

## 2026-11-05
- v1.40.1: week view loads ~45 ms faster — one render pass, lazy league fatigue
- v1.40.0: data deploy hardening + freshness alarm, Cup rule 3 on regulation points, test cleanup
- v1.39.0: Cup schedule League view By group / By date, rounds dropped
- v1.38.0: Standings shows West and East side by side, with column sets
- v1.37.0: Standings view and the header's condensed standings popup
- v1.36.0: List rows open the game page from the Slate's "↗" icon
- v1.35.0: every team name, logo and tricode links to its Team view
- v1.34.0: Cup standings — a group game that goes to overtime counts 0 in point differential
- v1.33.1: fix the odds function on Vercel (extensionless ESM import crashed it on load)
- v1.33.0: tight Slate cards (3 columns), ESPN odds, season-series chip, days with no games, faster suite (round 14, items 2-6)

## 2026-11-04
- v1.32.0: Cup standings — each team's 4 group games in its row

## 2026-10-31
- v1.31.0: Cup schedule — group play by Round 1–4
- v1.30.0: Cup schedule — League and Team lists of the NBA Cup's games
- v1.29.2: Cup view back to full size; wild-card race lists 5 per conference
- v1.29.1: Cup view fits the window; wild-card race in two columns
- v1.29.0: Cup view — NBA Cup group standings from the loaded schedule
- PROJECT.md: repo made public (Alex) for the gauntlet's pinned package; homepage = new address
- PROJECT.md: code sharing with the gauntlet = option A, pinned package (Alex)
- v1.28.1: notes hand-off never silent when the browser hides the referrer
- PROJECT.md: round 10 — pixel checks against the live site, perf at the new address, live suite results
- v1.28.0: calendarkit at gauntlet-home.vercel.app/calendar/; the old address hands its notes over and redirects
- v1.27.1: the Slate as a self-contained part (src/slate/) for the gauntlet widget
- v1.27.0: Slate wide layout + a note box per game

## 2026-10-30
- v1.26.0: Slate streaks, national TV cards in green, link as an icon
- v1.25.0: Team List one month at a time
- v1.24.0: Team map — the selected team's road trip beside the Team List
- PROJECT.md: keep the 299 px map at 1280 (Alex's call)
- v1.23.0: hover links the League List and its map; B2B travel lines
- v1.22.0: League map beside the list (static)
- v1.21.0: League List one day at a time, left-aligned, rows scaled by width
- CI: unit, two functional e2e shards and the perf guard as parallel jobs
- PROJECT.md: round 7 tests vs the pre-round build
- v1.20.0: Slate view — a day of games as cards, copied as a transparent page-shaped image
- v1.19.0: today in the Team Calendar, rest days on by default, countdown removed, tight unplayed rows
- v1.18.2: merged 3-in-4 chip in Team Calendar cells, no opponent dot beside its component, home plane inside the line
- PROJECT.md: compact chip stays "7in11" (decided)
- PROJECT.md: v1.18.1 (copy stall cause) in the round 6 notes
- Copies can no longer hang: load the SVG ourselves (html-to-image ignored a rejected img.decode())
- PROJECT.md: round 6 handoff and decisions (A1-A5, B, C-E measurements)
- CI: job limit 15 -> 25 min, Playwright global limit 15 -> 20 min (perf reference runs)
- Fatigue component: leg dot in the B2B badge, merged 3-in-4 stretches with a day strip; no yellow tricode boxes beside it (C, D, E)
- Page always opens on today; follows midnight while on today (B)
- Two-week view: the away tricode's plane no longer overlaps the time label above it
- Team picker: a resting pointer no longer overrides the keyboard choice (the flaky "Miami instead of Orlando")
- Cup knockout game links tested on a fixture in the feed's format (Dec 9-16, 2025)
- Perf guard: scroll main-thread time vs v1.17.1 measured in the same run (interleaved), not an absolute baseline
- Copies ~25% faster: leave non-drawing style properties out of the clones; copy test budget 150 s -> 90 s

## 2026-10-29
- copy e2e: give the seven-copy "final scores" test a 150 s budget (CI went past 60 s)
- Link date checks across the Nov 1 DST change; round 5 handoff in PROJECT.md
- Two-week view fits 1920x911 and 1280x900 without page scroll (tighter vertical spacing)
- Fix flaky League List "continuous days" test: wait until rendered days cover the list
- Matchup is the game link: real <a> to the hoopsjunkie page, hover "↗" removed
- B2B fatigue component: badge + home/away nights + 3in4, League List, Team List, week view
- PROJECT.md: current state / handoff section after round 4
- Link every game to its hoopsjunkie.io page (verified URL rule; hover ↗, shell opens it)
- Perf: Linux baseline for the countdown scroll check (CI run 40829107632)
- Active-day e2e: poll instead of a fixed wait (failed on CI's slower runner)
- Countdown on today's games (one minute clock per widget; no view re-render per minute)
- Playwright: global timeout, finite perf timeout, html report never opens
- Active day highlighted in both lists (compositor crossfade, never in copies)
- Date picker (calendar icon) in the League List and the Team List; keyboard in the month grid
- Compact week strip in both lists; Team List date title and strip follow the scroll (store, no row re-render)
- Week view: aligned rows (logos always, score slots, straight @ column), one column per day

## 2026-10-28
- League views: fatigue marks on the tricodes (back-to-back nights, travel, 3-in-4) with a tooltip per team
- League List: each team's record going into the game
- Team Calendar cells: short 3-in-4 chip and one TV pill (names in the tooltip)
- Back-to-back marks in yellow across the app; stale stamp keeps its own orange
- Scores next to each other, logos mirrored; fixed slots in the lists
- Overtime marker (OT / 2OT) after final scores; Team List column 1110 px
- Perf guard: Team List wheel scroll check; warm-up round for view switches
- National TV: leave out NBA TV (NBA.com's national filter doesn't show it)
- Site version 1.3.0 in the bottom-right corner (MAJOR.MINOR.PATCH from package.json)
- Show the site version: v<commit> in the top bar and /version.json
- Copy e2e: full Team List image once, at 1920 (same image at 1280; two at once stalled CI)
- Copy e2e: wait up to 60 s for the full Team List copy (14000 px canvas, slow on CI)
- Team Calendar copies at 1280: cards never wrap into a second column; date-proof older tests
- Marquee select: drag a box over games in any view, copy just those as one image

## 2026-10-24
- Team Calendar: 1 week | 2 weeks | Month (span=1w|2w)
- Schedule fatigue: B2B + 3-in-4 columns in the Team List, 3-in-4 chip in Team Calendar cells
- Team List: Show rest days toggle (rest=1), one quiet row per day without a game
- Perf guard: Linux baseline after the scroll fix
- League List scroll at 60 fps: shared date formatters, memoized day sections

## 2026-10-23
- Perf guard: Linux scroll baseline from the slower CI runners (A/B showed no code regression)
- Week view scores: font sized per slot so 3 digits fit on Linux too (whole-pixel digit widths)
- Shared module drift check: npm run check-shared (byte-identical to rotationkit via git blob ids)
- Daily update: check the live site serves the committed snapshot (up to ~10 min)
- Data freshness: "Data updated" stamp (orange after 36 h), Try again on load errors
- Perf guard: Linux scroll baseline from CI
- Final scores in every view: League List, Team Calendar, week view (score in the logo slot)
- Today button: back to today's games in every view, disabled once there
- Perf guard: scroll with Chromium's native wheel gesture; guard mean + p95 frame time; Linux baselines
- Split CalendarView.tsx and calendar.css into one file per component (no visible change)
- Performance guard: load, League List scroll and view-switch timings vs a recorded baseline
- Copy as image: whole view, a day, a game (port of Boardkit's copyAsImage)
- Team list: win/loss streak going into each game
- Team list: game number + record going in, final score beside the names
- Week view: "AWAY @ HOME" on every line
- Plane by metro area; larger games in 1-week League and Team Calendar
- League week view, team header + logo picker, team perspective, B2B pairs, one-row top bar
- List | Calendar switch for League and Team; continuous league list; team list
- PROJECT.md: drop the month game background (day flow separates columns; wouldn't fit)
- League month: flow each day as one list across the columns
- PROJECT.md: page width, bundled font, month time groups, columns, TV pill, B2B mark, logo backing
- League month: time groups, multi-column days, TV pill, B2B marks, logo backing; wider app; bundled Inter
- League month: scale tricode text to cell width so lines fit wider fonts
- League month: full calendar with every game and local team logos
- Hide Rotations action while ROTATIONKIT_BASE_URL is the placeholder
- PROJECT.md: record live URL, CORS confirmed from live origin
- Add e2e:live script to run the smoke test against a deployed site
- GameCard tests: markers, TV badge, TBD, +1, rotationkit action contract
- Views: team month grid, league day view with week strip, month navigator, app shell
- Data layer: calendar model, snapshot loader, team table
- Probe feed, copy nba-schedule module, add daily schedule snapshot job
- Initial commit
