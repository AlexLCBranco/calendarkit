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
- **Parts 2 and 3 of this round (phases 4–8) are still to come.** A separate "CalendarView component split" session
  works in this folder too; it was paused while part 1 ran (its `tsconfig.tsbuildinfo` is untracked, left alone).

## What the app is
- **Destinations** (one-row 44 px top bar; hides while a list is scrolled down): **Schedule** (League or Team by the
  scope picker; views List · Calendar · Slate), **Cup** (Groups · Schedule · Simulator · History), **Standings**
  (West | East side by side, four column sets). Page history ← → with real browser history entries.
- **League List**: one game day at a time, week strip, map of the night's games beside it (desktop).
  **League Calendar**: week view, 1 or 2 weeks. **Slate**: a day of games as cards with a note box per game.
  **Team List**: one calendar month, records / streaks / scores, rest rows, the team's road-trip map.
  **Team Calendar**: month grid or 1–2 week spans.
- Game info everywhere: local tip-off ((+1) past local midnight, TBD), national TV (NBA TV excluded), Cup / play-in /
  playoff tags, final scores, back-to-backs and 3-in-4 (Fatigue component), abnormal rest (≥ 3 days) badge,
  season-series chip and popup, streak popup, moneyline odds on the Slate.
- **Click rule**: game things (matchup, score, Cup square, series square, ↗) open the game's hoopsjunkie page in a new
  tab; team names / logos / tricodes open that team's Team view here. Nothing with a pointer cursor is dead
  (`e2e/click-audit.spec.ts`).
- **Copy as image** on every view (html-to-image, `src/components/copyAsImage.ts`).
- **Data**: `public/data/schedule.json`, a daily snapshot of the NBA's schedule feed (cdn.nba.com blocks browsers by
  CORS and headless clients by bot detection, so the site never fetches the feed itself). Schedule first: no live
  status; scores appear the morning after.

## Where things live
- `src/App.tsx` — app shell, URL state (`?view=&layout=&team=&weeks=&span=&tv=&cup=…`; `date=` is written but never
  read on load), page history.
- `src/components/` — one file per view/component; `CalendarView.tsx` combines them behind the top bar and re-exports
  them (hosts and tests import from it). Styles: `calendar.css` is an ordered list of `@import`s of `styles/*.css`.
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
- The page always opens on today; a URL's `date=` is never read back. Midnight with the tab open moves today along.
- Defaults are never stored (rest days on, Hide all notes off, TV filter) until a settings page exists. Slate notes are
  stored (content): localStorage `ck:notes:v1`, per game, three slots (pre / live / post), the slot switched only by the
  person — format and rules in docs/slate-in-gauntlet.md.
- Countdown to tip-off dropped on purpose (no minute tick; the clock moves at midnight and on waking).
- Unplayed rows have no score slots, so they don't line up with played ones (deliberate trade-off).
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
