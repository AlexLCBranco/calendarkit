# calendarkit — PROJECT

NBA schedule calendar: every team's schedule plus the full-league schedule, the NBA Cup and the standings. Standalone
web app (Vite + React + TypeScript), own repo (github.com/AlexLCBranco/calendarkit, public) and own Vercel project.
Its Slate cards are also a self-contained part the gauntlet whiteboard installs (see docs/slate-in-gauntlet.md).

**Read this file, not docs/HISTORY.md.** HISTORY.md is the archive of every earlier round, handoff, probe and
measurement; open it only when a question needs the backstory.

## Rules for working here
- **Comments explain why the code is the way it is. History goes in commit messages and docs/HISTORY.md, never in
  comments.** (No "round N", "item M" or "since vX.Y.Z" in comments.)
- Desktop, full-size window only. **Phone and tablet are parked, not abandoned**: the narrow-layout code and its specs
  stay and must keep compiling, but the `tablet` / `phone` Playwright projects don't run by default, in `e2e:all` or in
  CI. Run them on purpose with `E2E_NARROW=1` (see Tests).
- Every app change bumps the version in package.json (patch fix / minor feature / major big change); CI enforces it.
- Every fix gets a test that fails on the old code.
- `timeout 300` on every long local test command, output to a file; never pipe test output into grep.
- **New tests assert behaviour and data** ("the BOS row shows B2B 2/2"), not pixel positions or exact layout, unless
  Alex says a view is locked. See Test tiers.

## Current state / handoff (2026-11-12)
- All features of rounds 1–22 are built (history: docs/HISTORY.md).
- **Maintenance round, part 1 of 3 done** (phases 1–3):
  - v1.58.2 — phase 1: history out of comments, this file shrunk (old content in docs/HISTORY.md, Slate guide in
    docs/slate-in-gauntlet.md), phone/tablet e2e parked (`E2E_NARROW=1`).
  - v1.58.3 — phase 2: ESLint (`npm run lint`, in CI). Plus two fixes the Nov 7–11 snapshots needed: list rows show at
    most two TV networks + "+N" (`TV_NAMES_MAX`), and the Team Calendar's probe cell always uses the widest tricode.
  - Phase 3 (data + scripts only, no version): `public/data/schedule.json` keeps only the fields the app reads
    (`scripts/slim-schedule.ts`, ~4.1 MB → ~0.6 MB); `tests/slim-schedule.test.ts` fails if code starts reading a
    dropped field. e2e reads team names from the raw fixture (`e2e/feedTeams.ts`).
- **Part 2 of 3 done** (phase 4, v1.58.4): `CalendarView.tsx` split with no behaviour change into a thin shell and one
  component per destination (file layout under "Where things live").
- **Part 3 of 3 done** (phases 5–8) — the maintenance round is finished:
  - Phase 5 (tests and docs only, no version): test tiers, settled vs in flux (see Test tiers); the top bar and the
    League List rows are in flux; their layout-pinning tests were deleted or relaxed, `e2e/in-flux.spec.ts` smokes them.
  - v1.59.0 — phase 6: a reload keeps the page (day / month / week / Team List row) from `history.state`; a fresh visit
    opens on today.
  - v1.60.0 — phase 7: two menu variants (rail / packed bar) behind the "Menu (trial)" switch in ⓘ; Options popover
    (TV games only, Rest days); ⓘ is a popover; the bar never hides.
  - v1.61.0 — phase 8: League List rows — tags in fixed columns on the outside, records against the logos, score slots
    per day; the legend moved into ⓘ.
- **v1.62.0** (2026-11-13): road trips / homestands in the Team views (`src/data/runs.ts`, `styles/runs.css`), side
  arrows beside the calendars, the tab title follows the page (`src/pageTitle.ts`), the Slate opens with notes hidden,
  team links open the Team Calendar.
- **v1.65.0–1.65.1** (2026-11-13): Team Calendar has no lines between cells (B2B bars and road-trip bands removed; the cells'
  labels say it); the Team List has no day strip (or active-row highlight); rest of exactly 2 days gets a quiet teal
  badge, 3+ keeps the strong one; the scope picker is the bar's most prominent control (full name from 1440 px, tricode
  below); Quick standings popup movable / resizable, remembered in `ck:stpop:v1`, "↺" resets (`floatBox.ts`).
- **v1.66.0** (2026-11-14): both maps are one **travel view** (`src/map/TravelMap.tsx`): a focused game's two
  teams, last game → this (solid) → next (dashed), miles on each line, zoom to fit; a panel per team under the map
  (last / this / next, rest = the rest chips, clock change). Hover focuses, click pins (Esc / again / empty map / another
  day unpins). Road-trip map and `trips.ts` removed; no time-zone tint.
- **Batch 2026-11-15** (spec `docs/specs/batch-2026-11-15.md`; details in docs/HISTORY.md "Batch 2026-11-15"):
  - v1.67.0 — the feed writes 2OT as "Final/OT2" now (it stopped the daily job Nov 13–14); every OT reader goes through
    `overtimeOf()` (`model.ts`). Data older than 36 h shows an orange banner at the bottom centre (never in a copy).
  - v1.68.0 — Standings column set **Extended**: W-L, 3-pt, 10-pt, .500+, <.500, OT, Close.
  - v1.69.0 — streaks (one `StreakChip`, `src/slate/streakPopup.tsx`) also in League List rows, Team Calendar cells, Cup
    groups and the simulator's tables (the Cup ones removed again in v1.72.0); not in the League week view or the Cup
    schedule's league lists (no room).
- **v1.72.0** (2026-11-16): no streaks in the Cup standings (groups, simulator tables); each team's current conference
  position ("2nd E", `conferencePositions` in `standings.ts`) beside its record in League List rows (not in the Team
  List: its busiest rows have no room). A team without a finished game shows none.
- **v1.73.0** (2026-11-16): the Team List header shows the team's position once, after its name ("2nd in the East").
  - v1.70.0 — the simulator's knockout bracket is playable and big (`CupBracket.tsx`, `src/data/cupBracket.ts`).
  - v1.71.0 — tooltip day strips: 50 × 42 squares with the matchup ("vs LAL" / "@ DEN", logo), each a hoopsjunkie
    link (the tip stays while the pointer moves onto it); series popup squares say "BOS @ DEN" with the home logo.
- **v1.91.0** (2026-11-20, CK-25): the shared layout of every app (backlogkit's NAV_PATTERN.md, same look as footykit
  FK-65) replaced both trial menus (rail and packed bar, the ⓘ switch and `ck:menu:v1` are gone) and the scope picker.
  Same version: CK-23, the Slate's "⧉ Pop out live scores" (`LivePopout.tsx`: Document Picture-in-Picture, Chrome / Edge
  only, the button hidden elsewhere; the window belongs to the page, so another view keeps it; a countdown to the first
  tip-off, then one line per game from CK-21's live data); CK-24, past seasons in Standings (`NbaHistory.tsx`,
  `src/data/nbaHistory.ts`, data in `public/data/history/` from `scripts/make-nba-history.ts`, run once per new season:
  ESPN's free feeds; 2001-02 on, since before that ESPN's playoff games have gaps; game links open NBA.com's scores of
  that day — hoopsjunkie's past coverage couldn't be checked, its bot check blocks scripts). `?view=standings&season=2016`.
- **v1.92.0** (2026-11-20, CK-26 … CK-32):
  - **Cup label** (`src/slate/cupLink.tsx`, `src/data/cupPopup.ts`): every "Cup" label is a link to the Cup page — a
    group game to Groups with its group outlined (`CupState.focus`, `cg=` in the address), a knockout game to the
    Simulator's bracket — and on hover the group table (or a knockout game's two teams' way through the Cup); a click
    inside the popup pins it (`useHoverPopup` `pinInside`). Narrower than the Cup's own minimum the labels stay plain.
  - **Record link**: a team's record (Slate cards, League List rows) is a team link with `view="list"`: that team's
    List, rest days on, on the date looked at. Names, logos and tricodes still open the Calendar.
  - **Opponent line** in Team Calendar cells (`src/data/opponent.ts`, GameCard `OpponentLine`): tricode, record,
    streak, back-to-back night, 3-in-4, days off (2+); month cells the short forms. Its marks have their own classes
    (`ck-opp-b2b`, `ck-opp-tif`): `.ck-b2b-label` and `data-testid="tif"` stay the calendar's team's. A game further
    ahead than the opponent's next one shows its record as of now. The scale probe holds the line (month text 1.2 → 0.95
    at 1920 × 1080).
  - **One menu layer**: replaced by v1.93.0 (the controls are in the header).
  - **Playoff games in the season-series popup** (`series.tsx`, `nbaHistory.ts` `pastPlayoffs` / `playoffLine`): a past
    season's play-in and series games from `public/data/history/<year>.json`, under the regular-season squares in the
    playoffs' colour; "View series" opens Standings on that season with the series outlined (`showSeries`, `series=`).
  - **Holidays and big dates** (`src/data/holidays.ts` — the one list; `src/slate/bigDay.tsx`): federal holidays by
    rule, NBA dates from the feed, and `EXTRA_DAYS` by hand per season (2026-27: trade deadline, play-in, playoffs
    start; **add the Finals dates when the NBA publishes them**, and next season's block).
- **v1.93.0** (2026-11-21, CK-33; pictures and numbers in `docs/design/DESIGN_LOG.md`): **every page's controls are in
  the header's second row**, after the Where tabs — nothing with controls sits under the header's line, the header is
  92 px on every page, nothing scrolls away, the calendars fit the window (the page has no top padding any more: the
  header starts at the window's edge, `.app` in `app.css`). The team chips are gone: an **"All teams"
  button** (lit on the league view) and a **team box** (`TeamPicker.tsx`: logo + full name, tricode under 1560 px; its
  list is the six divisions in three columns, no "All teams" entry) with the team's Injuries link. The team title row is
  gone from the screen (`TeamHeader` stays in the copies and as the Cup team schedule's heading). The Team List's place
  ("1st in the West", from 1560 px) and loaded months are plain text at the row's end. Owner's rules: nothing crosses the
  header line, it never moves down, no always-on-screen team chips. Left where they were (a view's own strips, not the
  page's controls): the Slate's notes row, the League List's week strip, the Cup's nights strip and — because a busy Cup
  night's line can't fit the row — the Simulator's "Tonight in the Cup" line, now the page's first line.
- **Waiting on Alex**: whether the League List rows look right (then they can leave "in flux").

## What the app is
- **Destinations** (the header's Where tabs): **Schedule** (All teams or a team by the "All teams" button and the team box; views List · Calendar · Slate), **Cup** (Groups ·
  Schedule · Simulator · History), **Standings** (West | East side by side, five column sets: Main · Splits · Extended · Form & scoring · Schedule & B2B). Page history ← → with
  real browser history entries.
- **Header** (NAV_PATTERN.md; `Header.tsx`, `nav.ts`, `styles/nav.css`): pinned at the top (`position: sticky`), 92 px on
  every page. Row 1: page history ← →, the breadcrumb (place › team or All teams › view; Cup › view › list / team /
  season; Standings › column set — each part opens its siblings), "Go anywhere" (Ctrl+K: places, views, every team as
  Calendar and List, Cup views and seasons, column sets), then the icon buttons (Options — Schedule only: TV games
  only, Rest days in the Team List —, ⓘ, Quick standings, Copy). Row 2: the Where tabs Schedule · Cup · Standings, then
  the page's own controls (`.ck-hrow`, test id `head-controls`), one line that never wraps: **What** = "All teams" +
  the team box (+ Injuries ↗ on a team's pages; the Cup's Team schedule has both too — its "All teams" opens the Cup's
  League list; Standings: the season strip, scrolling inside the room left); **How** = the view switch (List · Calendar ·
  Slate; the Cup's views and list switches; the standings' column sets); then weeks or span and the date block (a
  month's name has a fixed width, so its arrows never move). No `<select>` anywhere. The standings' column set is in
  the address (`set=`) and page history.
- **Narrow windows** (content under `HEAD_ROW_MIN_WIDTH` 1200 px; tablets and phones, parked): the same controls in
  **page rows** under the header (`.ck-prows`, test id `page-rows`), which wrap and scroll away.
- **Quick standings popup**: drag the header to move, the edges / corners to resize (min 360 × 200), kept in the
  window; place and size in localStorage `ck:stpop:v1`; "↺" resets. It never starts a selection marquee
  (`data-no-marquee`).
- **League List**: one game day at a time, week strip, map of the night's games beside it (desktop; see Maps). Rows: time,
  [away tags] [record] logo AWAY (score) @ (score) HOME logo [record] [home tags] — the tags (Fatigue components) in
  fixed-width columns on the outside, so names, "@" and records line up down the list; its legend is in the ⓘ popover.
  **League Calendar**: week view, 1 or 2 weeks. **Slate**: a day of games as cards with a note box per game.
  **Team List**: one calendar month, records / streaks / scores, rest rows, the travel map (1920); no day strip
  (date picker, ‹ › game, Today, load more). **Team Calendar**: month grid or 1–2 week spans; no lines between cells.
- Game info everywhere: local tip-off ((+1) past local midnight, TBD), national TV (NBA TV excluded), Cup / play-in /
  playoff tags, final scores, back-to-backs and 3-in-4 (Fatigue component), rest badge (2 days quiet, ≥ 3 days strong),
  season-series chip and popup, streaks (`StreakChip`: one element, colours and popup everywhere), moneyline odds on the Slate.
- **Click rule**: game things (matchup, score, Cup square, series square, ↗) open the game's hoopsjunkie page in a new
  tab; team names / logos / tricodes open that team's **Team Calendar** here (`TEAM_LINK_LAYOUT`; the team box
  keeps the current layout). Nothing with a pointer cursor is dead
  (`e2e/click-audit.spec.ts`).
- **Road trips / homestands** (Team List and Team Calendar): `RUN_MIN_GAMES` (3) or more away / home games in a row
  over the whole season; a neutral site or a break of `RUN_BREAK_DAYS` (6) ends one. Team List: a band down the rows
  (rose: road, periwinkle: home); both views: an always-on label on **every game** of the run with its place ("Road trip · 3/5"); its
  tooltip: game k of N, dates, cities. In the
  copies; not in selection images.
- **Calendar side arrows**: League and Team Calendar, large borderless chevrons sized to the page margin beside the grid, the bar's ‹ › step; never in a
  copy. **Tab title**: "BOS schedule · Nov 2026 — calendarkit", set on every navigation and back / forward.
- **Maps** (desktop, beside the League List / Team List; never in a copy): one dot per game; nothing focused: "AWAY @
  HOME" + city where it fits (else "AWAY @ HOME", else HOME, else none — never overlapping). **Focus** = the hovered row
  or dot, else the pinned game (click a row or dot), else (Team map) the team's game today or next. For both teams:
  previous game → this (solid) → next (dashed, faded), straight-line miles on each line, "stayed · 0 mi" for the same
  arena; colours: pink = away / the selected team, green = home / the opponent. The view zooms to fit (CSS transform,
  `--k` keeps dots/labels/lines at screen size; min span ≈ 480 mi) — not for a dot hovered on the map (it would slide
  from under the pointer), only for a row hover or a pin. Panel: last / this / next with date, time, city, miles, rest
  days (`restDays`, = the rest chips; B2B badge for 1), clock change at the later tip-off (DST in between isn't counted).
  Travel worked out once per game (`travel.ts`, cached per data set); labels placed once per game and width (`view.ts`).
- **Copy as image** on every view (html-to-image, `src/components/copyAsImage.ts`).
- **Data**: `public/data/schedule.json`, a daily snapshot of the NBA's schedule feed (cdn.nba.com blocks browsers by
  CORS and headless clients by bot detection, so the site never fetches the feed itself). Live scores and the night's
  finals come from ESPN through `api/odds.ts` (CK-21, `src/slate/live.tsx`): polled every minute only while a game on
  screen is live or within 15 min of tip-off and the tab is visible.

## Where things live
- `src/App.tsx` — app shell, URL state (`?view=&layout=&team=&weeks=&span=&tv=&cup=&set=&season=…`; `date=` is written but never
  read on load), page history, the reload keeping its page (`reloadedState`).
- `src/components/` — one file per view/component. `CalendarView.tsx` is the shell: the shared `CalendarState`, the
  pinned header with the controls' slots, "Go anywhere"'s entries, page history, team links, sizing,
  overlays; it re-exports the widgets (hosts and tests import from it). One component per destination, each owning its
  state and filling the slots (breadcrumb parts, What, How, date controls, Options, ⓘ lines) through portals:
  `ScheduleDestination.tsx` (League + Team),
  `CupDestination.tsx`, `StandingsDestination.tsx`. All three stay mounted (their state lasts as long as the page);
  only the active one renders. `destination.tsx` = the shell ↔ destination contract and the shared selection copy;
  `calendarState.ts` = state / page types and pure helpers; `Header.tsx` = the header's parts (breadcrumb parts, Go anywhere, Where tabs, page-row captions);
  `nav.ts` = the places and Go anywhere's matching; `TeamPicker.tsx` = the team box, the "All teams" button, the Injuries link; `TopBar.tsx` = ← →, ⓘ, the
  stale banner; `Popover.tsx` = the header's icon-button popovers.
  Styles: `calendar.css` is an ordered list of `@import`s of `styles/*.css`.
- `src/data/` — pure derivations (`model.ts`, `cup*.ts` (`cupBracket.ts`: the simulator's playable bracket), `fatigue.ts`, `rest.ts`, `streak.ts`, `standings.ts`,
  `odds.ts`, `regulation.ts`), loading (`load.ts`).
- `src/slate/` — the Slate's self-contained part (imports only `src/slate`, `src/data`, `src/shared`, React); the
  gauntlet installs this repo as a package pinned to a commit. `slate.html` / `src/slate/demo.tsx` is its demo page.
- `src/shared/nba-schedule/` — copied byte-for-byte from rotationkit; never edit here. `npm run check-shared` (local
  only: needs gh access to the private rotationkit repo) compares it with rotationkit.
- `src/map/` — League and Team maps: `TravelMap.tsx` (shared view + panel), `travel.ts` (legs), `view.ts` (zoom, label
  placement), `LeagueMap.tsx` / `TeamMap.tsx` (thin wrappers); static basemap from `scripts/make-basemap.ts`.
- `api/odds.ts` — Vercel function proxying ESPN's public scoreboard for moneyline odds.
- `scripts/` — snapshot job, deploy checks, version check, e2e runners, perf reference builds.

## Run, test, deploy
- `npm run dev` · `npm run build` (tsc + app + slate demo) · `npm run preview` (port 4180).
- **Unit**: `npm test` (Vitest, jsdom; `*.tz.test.*` run under America/New_York and America/Sao_Paulo).
- **Lint**: `npm run lint` (ESLint flat config, typescript-eslint + react-hooks).
- **E2E**: `npm run e2e:all` — builds once, serves on a free port, runs the desktop groups (desktop-xl and desktop,
  each halved by test), merges the reports. `npx playwright test --project=desktop-xl` for one project. Specs import
  `test` from `./fixtures` (it hands a URL's `date=` to the app's test hook), except `open-today.spec.ts`.
  Parked narrow projects: `E2E_NARROW=1 npx playwright test --project=tablet --project=phone`.
- **Test tiers.** Every view is either *settled* or *in flux*:
  - **Settled** (everything not listed below): full e2e as before — behaviour, data and the layout checks they have.
  - **In flux**: one smoke test each in `e2e/in-flux.spec.ts` (loads, shows the right games for a fixed date, no
    console errors) and **no layout or position assertions** anywhere (e2e or unit). Unit tests of the logic behind
    them (fatigue, Cup rules, streaks, standings) are not affected. Currently in flux: **the League List rows** (and the legend's place). A view leaves the list when Alex says it is settled or locked;
    then it gets its full e2e back.
- **The header's controls row** (CK-33): `e2e/ck33.spec.ts` — the owner's window (1912 × 913) on the Lakers' month
  (92 px header, no chips, nothing with controls under the line, day boxes ≥ 145 px, no page scroll, All teams, the team
  box) and every page at 1912 and 1280 (controls in the row, on one line, inside the window).
- **The shared layout** (header) is settled by NAV_PATTERN.md: `e2e/nav.spec.ts` checks it as its §6 asks
  (header on every main page, every Where / What / How / breadcrumb part, address round-trips, layout shift, names,
  390 px) and saves a screenshot of every main page to `test-output/nav-shots/`; the < 100 ms click is in the perf guard.
- **Perf guard**: `npm run perf` (alone on the machine; compares main-thread time against a reference build run in the
  same session, `scripts/perf-ref.ts`; frame baselines per OS in `e2e/perf-baseline.json`).
- **Live**: `npm run e2e:live -- https://gauntlet-home.vercel.app` (move, smoke, version against the deployed site).
- **CI** (`.github/workflows/ci.yml`, on `main` and `claude/**`): `unit` (version check, lint, tests, build), `e2e` ×4
  (desktop-xl ½ ½, desktop ½ ½), `perf`, and on `main` pushes `live` (waits for the deploy, then live e2e + data
  freshness).
- **Deploy**: push to `main` → Vercel project `calendarkit` (calendarkit-brown.vercel.app), served to users at
  **https://gauntlet-home.vercel.app/calendar/** through the gauntlet's rewrite (one origin with the whiteboard, so
  shared localStorage). The old address redirects after handing its notes over. `/version.json` is no-cache; the
  version shows bottom-right with commit and build time in its tooltip.
- **Data job** (`.github/workflows/schedule-update.yml`, daily 11:00 UTC; GitHub often starts it hours late):
  `scripts/update-schedule.ts` downloads the feed, stores the fields the app reads plus the regulation scores of
  finished Cup group games (from boxscores), commits, then `scripts/verify-deploy.ts` waits until the live file is the
  committed one (optional Vercel deploy hook after 10 min). `data-freshness.yml` (every 4 h) alarms when the live data
  is > 1 day behind or the snapshot > 2 days old. Bot commits run no CI (GITHUB_TOKEN pushes trigger nothing); the job's
  own `npm test` is their test run.

## Decisions still in force
**Data and rules**
- Games shown: module `gameType` `regular`, `cup-final`, `play-in`, `playoffs`; preseason / all-star dropped.
- Game date is always the feed's ET date (`dateEt`); local time only formats tip-off. "Over" = tip-off + 3 h (TBD:
  12:00 UTC the next day). Default league day = earliest date with a game not over (after the season: the last).
- Back-to-back = also played the previous *calendar* day. Travel only when the arena metros differ (LA and NY shared).
- Rest = difference of ET game dates (B2B 1, one empty day 2); ≥ 2 (`REST_MARK_DAYS`) flags both games around the
  break, 2 days in a quiet badge, ≥ 3 (`REST_FLAG_DAYS`) in the strong one; a game shows its bigger tier. The rest badge takes
  no width (sits in the B2B or 3-in-4 track, else a corner tick): a fifth track broke the desktop fits.
- Records and streaks: a final game's line is *after* it, a game to come *going in*. Regular season only (Cup group and
  knockout count; the Cup Final doesn't).
- National TV = `nationalBroadcasters` only, NBA TV left out (NBA.com's own filter excludes it). Shown as an
  importance marker, not where-to-watch.
- Overtime is read only through `overtimeOf()`: the feed writes "Final/OT", "Final/2OT" and "Final/OT2".
- Cup standings use NBA.com's rules; an OT game counts its regulation points (stored in the snapshot as
  `calendarkit.regulation`) and 0 differential for the OT margin. The simulator and stakes chips use the same engine
  (`cupEngine.ts`).
- Team logos are local files (`public/logos/`), on a light disc; never the NBA CDN at runtime.
- Playoff round is read from the gameId (`playoffRound()`) until rotationkit's module provides it.

**Behaviour**
- A fresh visit (new tab, typed address, bookmark) opens on today; a URL's `date=` is never read back. A reload of
  the same tab keeps its page (day, month / week, Team List row, scroll) from the tab's history entry (`history.state`,
  written on every change and a moment after scrolling stops); "Show rest days" still resets. Midnight with the tab
  open moves today along.
- Defaults are never stored (rest days on, Hide all notes **on** — the Slate opens with notes hidden —, TV filter) until a settings page exists. Slate notes are
  stored (content): localStorage `ck:notes:v1`, per game, three slots (pre / live / post), the slot switched only by the
  person — format and rules in docs/slate-in-gauntlet.md.
- No countdown on game rows (no minute tick in the widget clock; it moves at midnight and on waking). The one countdown
  is the Slate *page*'s "First tip-off in 2h 14m" (CK-14): `useMinuteTick` in clock.ts, ticking only while it shows,
  never in the Slate part or a copy.
- Slate cards (v1.80–1.85): the season-series chip is drawn inverted for a back-to-back meeting (`leagueRematches`);
  the score follows the name (one track); a header line "SLATE · 18-11 · NBA" (`slateHeaderLabel`, shared pattern
  with footykit); a game button "⋯" in the away row's empty "@" cell (links: FanDuel NBA props, ESPN injuries, the
  official report), "❄" instead when the arena city feels ≤ −10 °C at tip-off (Open-Meteo through `liveColdStore()`,
  like the odds; e2e and unit tests never call it). The gauntlet gets the button and the flag only once it passes
  `gameMenu` / `cold` and renders `useGameLinksPopup`.
- Season-series popup: ◀ season ▶ back two seasons from `public/data/past-seasons.json` (scripts/make-past-seasons.ts,
  ESPN, run once per new season), loaded on the first switch only.
- Standings cells W-L / W / L, Remaining and B2B legs list their games (`cellGames`), hover; a click pins
  (`useHoverPopup` `pin`).
- League List score slots per day: a day with any final score keeps empty score slots on its unplayed rows too (every
  row in the same columns); a day with none stays tight around the "@" ("CHA @ WAS"). Elsewhere (Team List) unplayed
  rows still have no score slots.
- List rows (League / Team List, Cup schedule) open the game from the "↗" icon; calendar cells and week lines keep the
  matchup as the link.
- Compact week-view chip shows the stretch only ("7in11"): two full chips don't fit a 1280 × 900 day cell.
- Slate copies follow the largest-cards rule; with notes the info is zoomed (CSS `zoom`, ≤ ×1.35) inside the card width.
- The rotationkit "Rotations ↗" action is hidden until `ROTATIONKIT_BASE_URL` in `src/config.ts` is set (the only
  step; tests follow the config).

**Engineering**
- Widget API: components take `data` + `size` (+ optional `now` / `timeZone`), raise events, never touch the URL.
- At rest the Slate part starts no timer and no animation frame (tested; it may be on a board many times).
- `e2e/slate-same.spec.ts` pins the Slate pixel for pixel to a reference build (`REF`); move `REF` only when the Slate
  is meant to change.
- Vitest 5 (rotationkit uses 3: 3 has open audit advisories).

## Open questions
- **ROTATIONKIT_BASE_URL**: placeholder until rotationkit has a production URL.
- **rotationkit module gap**: `deriveGame` has no playoff round / series number; asked for upstream.
- **Repo growth** from daily snapshot commits; revisit if it becomes a problem (Vercel Blob or a data branch).
- **Team Calendar month view at 1280 × 900** stays at scale 0.8.
- **Today mid-scroll**: clicking Today inside a fast wheel burst can let Chrome's wheel animation carry on (only a
  script can do it; the e2e waits for the scroll to settle).
