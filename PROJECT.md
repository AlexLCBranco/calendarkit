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
- **Waiting on Alex**: which menu to keep (then delete the other: `Menu.tsx` variant, `menu.css` part, the switch, the
  `ck:menu:v1` key, the second smoke test); whether the League List rows look right (then they can leave "in flux").

## What the app is
- **Destinations**: **Schedule** (League or Team by the scope picker; views List · Calendar · Slate), **Cup** (Groups ·
  Schedule · Simulator · History), **Standings** (West | East side by side, four column sets). Page history ← → with
  real browser history entries.
- **Menu (trial, two variants)** — switched in the ⓘ popover ("Menu (trial)"), kept in localStorage `ck:menu:v1`
  (absent = packed). **Packed bar**: one 44 px row packed left — ← →, destinations, the destination's sub-views, its
  date controls. **Rail**: ← → and the destinations (icon + label) in an 84 px strip on the left; the bar holds the
  destination's controls only. Both: icon buttons at the right end (Options — Schedule only: TV games only, Rest days
  in the Team List —, ⓘ, Quick standings, Copy); a destination's controls always in the same place and order; the bar
  never hides. Alex picks one after a few days; the other gets deleted (`Menu.tsx`, `menu.css`, the switch).
- **League List**: one game day at a time, week strip, map of the night's games beside it (desktop). Rows: time,
  [away tags] [record] logo AWAY (score) @ (score) HOME logo [record] [home tags] — the tags (Fatigue components) in
  fixed-width columns on the outside, so names, "@" and records line up down the list; its legend is in the ⓘ popover.
  **League Calendar**: week view, 1 or 2 weeks. **Slate**: a day of games as cards with a note box per game.
  **Team List**: one calendar month, records / streaks / scores, rest rows, the team's road-trip map.
  **Team Calendar**: month grid or 1–2 week spans.
- Game info everywhere: local tip-off ((+1) past local midnight, TBD), national TV (NBA TV excluded), Cup / play-in /
  playoff tags, final scores, back-to-backs and 3-in-4 (Fatigue component), abnormal rest (≥ 3 days) badge,
  season-series chip and popup, streak popup, moneyline odds on the Slate.
- **Click rule**: game things (matchup, score, Cup square, series square, ↗) open the game's hoopsjunkie page in a new
  tab; team names / logos / tricodes open that team's **Team Calendar** here (`TEAM_LINK_LAYOUT`; the scope picker
  keeps the current layout). Nothing with a pointer cursor is dead
  (`e2e/click-audit.spec.ts`).
- **Road trips / homestands** (Team List and Team Calendar): `RUN_MIN_GAMES` (3) or more away / home games in a row
  over the whole season; a neutral site or a break of `RUN_BREAK_DAYS` (6) ends one. A band (rose: road,
  periwinkle: home) and an always-on label on **every game** of the run with its place ("Road trip · 3/5"); its
  tooltip: game k of N, dates, cities. In the
  copies; not in selection images.
- **Calendar side arrows**: League and Team Calendar, in the page margin beside the grid, the bar's ‹ › step; never in a
  copy. **Tab title**: "BOS schedule · Nov 2026 — calendarkit", set on every navigation and back / forward.
- **Copy as image** on every view (html-to-image, `src/components/copyAsImage.ts`).
- **Data**: `public/data/schedule.json`, a daily snapshot of the NBA's schedule feed (cdn.nba.com blocks browsers by
  CORS and headless clients by bot detection, so the site never fetches the feed itself). Schedule first: no live
  status; scores appear the morning after.

## Where things live
- `src/App.tsx` — app shell, URL state (`?view=&layout=&team=&weeks=&span=&tv=&cup=…`; `date=` is written but never
  read on load), page history, the reload keeping its page (`reloadedState`).
- `src/components/` — one file per view/component. `CalendarView.tsx` is the shell: the shared `CalendarState`, the
  top bar's frame (← →, destination switch or rail, ⓘ / Quick standings / Copy), page history, team links, sizing,
  overlays; it re-exports the widgets (hosts and tests import from it). One component per destination, each owning its
  state and filling the bar's slots (sub-views, date controls, Options, ⓘ lines) through portals:
  `ScheduleDestination.tsx` (League + Team),
  `CupDestination.tsx`, `StandingsDestination.tsx`. All three stay mounted (their state lasts as long as the page);
  only the active one renders. `destination.tsx` = the shell ↔ destination contract and the shared selection copy;
  `calendarState.ts` = state / page types and pure helpers; `TopBar.tsx` = the shell's bar parts (← →, ⓘ);
  `Menu.tsx` = the two menu variants, the rail and the switch; `Popover.tsx` = the bar's icon-button popovers.
  Styles: `calendar.css` is an ordered list of `@import`s of `styles/*.css`.
- `src/data/` — pure derivations (`model.ts`, `cup*.ts`, `fatigue.ts`, `rest.ts`, `streak.ts`, `standings.ts`,
  `odds.ts`, `regulation.ts`), loading (`load.ts`).
- `src/slate/` — the Slate's self-contained part (imports only `src/slate`, `src/data`, `src/shared`, React); the
  gauntlet installs this repo as a package pinned to a commit. `slate.html` / `src/slate/demo.tsx` is its demo page.
- `src/shared/nba-schedule/` — copied byte-for-byte from rotationkit; never edit here. `npm run check-shared` (local
  only: needs gh access to the private rotationkit repo) compares it with rotationkit.
- `src/map/` — League and Team maps (static basemap from `scripts/make-basemap.ts`).
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
    them (fatigue, Cup rules, streaks, standings) are not affected. Currently in flux: **the top bar / menu** and
    **the League List rows** (and the legend's place). A view leaves the list when Alex says it is settled or locked;
    then it gets its full e2e back.
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
- Rest = difference of ET game dates; ≥ 3 (`REST_FLAG_DAYS`) flags both games around the break. The rest badge takes
  no width (sits in the B2B or 3-in-4 track, else a corner tick): a fifth track broke the desktop fits.
- Records and streaks: a final game's line is *after* it, a game to come *going in*. Regular season only (Cup group and
  knockout count; the Cup Final doesn't).
- National TV = `nationalBroadcasters` only, NBA TV left out (NBA.com's own filter excludes it). Shown as an
  importance marker, not where-to-watch.
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
- Countdown to tip-off dropped on purpose (no minute tick; the clock moves at midnight and on waking).
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
