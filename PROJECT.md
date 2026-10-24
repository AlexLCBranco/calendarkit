# calendarkit — PROJECT

NBA schedule calendar: every team's schedule plus the full-league schedule. Standalone web app (Vite + React),
own repo (github.com/AlexLCBranco/calendarkit) and own Vercel project.

## Goals (v1)
- League and Team views of the NBA schedule, each as a List or a Calendar (month).
- **Schedule first**: no live status. Final scores and records only in the Team List (Alex, 2026-10-23; see
  "Team list season line"), from the daily snapshot. Full game objects are kept in the data layer, so scores
  elsewhere need only UI changes; live scores would also need a fresher refresh strategy.
- Components are widget-first so they can later be dropped into **gauntlet** (whiteboard with live widgets).
- Links into **rotationkit** for games that are over.

Out of scope for v1: scores outside the Team List, live status, New Event, event categories, calendar settings, other leagues,
where-to-watch info, embedding in gauntlet.

## Status
- [x] Step 0 — probe (below)
- [x] Data layer — `src/data/model.ts` (pure derivations), `src/data/load.ts` (fetch snapshot once, parse with `parse.ts`), `src/data/teams.ts`
- [x] Views — one file per component in `src/components/` (split 2026-10-23; `CalendarView.tsx` re-exports them all, so hosts and tests import from it): `LeagueListView` (continuous, virtualized day list + week strip), `TeamListView`, `TeamMonthGrid`, `LeagueWeekView` (1 or 2 week rows, every game per day with logos; desktop widths), `MonthNavigator` (count grid, click → day; narrow widths and the week picker popup), `TeamPicker` (custom listbox with logos), `TeamHeader`, and `CalendarView` combining them behind a one-row top bar. Shared pieces: `widget.ts` (size, date formatting, clock, B2B lookups), `PeriodNav.tsx`, `Segmented.tsx`, `Tooltip.tsx`, `WeekPicker.tsx`, `CaptureStage.tsx`. Styles: `calendar.css` is only an ordered list of `@import`s of `styles/*.css` (one per component; the order is the cascade order). Day-cell layout maths in `src/components/dayflow.ts` (pure). App shell `src/App.tsx` (URL state `?view=&layout=&team=&date=&weeks=&tv=`).
- [x] Game card — `src/components/GameCard.tsx`: "BOS vs CHI" / "BOS @ DET" (team view, selected team first) or AWAY @ HOME, local tip-off with (+1), TBD, B2B (league: badge per team; team: 1/2 · 2/2 labels + opponent 2/2 dot), Cup / Cup Final / Play-In / Playoffs-round markers, national TV badge, "Rotations ↗" action (raises `onOpenGame`) once tip-off + 3 h has passed — only when the host passes `onOpenGame`; the app shell does so only once `ROTATIONKIT_BASE_URL` is set (hidden for now, see Open questions).
- [x] Tests — see "Tests" below
- [x] Copy as image (2026-10-23) — `src/components/copyAsImage.ts` + `CopyButton.tsx`, ported from Boardkit; see "Copy as image" in Decisions
- [x] Deploy — live URL: **https://calendarkit-brown.vercel.app** (Vercel project `calendarkit`, imported
  2026-10-23; push to `main` deploys). Smoke test passes against it (`npm run e2e:live -- <url>`).
  The snapshot is served brotli-compressed: ~106 KB over the wire for the 4 MB file.

## Probe (2026-10-23)

### 1. CORS — browser cannot fetch the feed directly
- Real browser (Claude desktop browser pane, page on `http://localhost:4181`): `fetch(scheduleLeagueV2.json)` →
  `TypeError: Failed to fetch`; console: *"blocked by CORS policy: No 'Access-Control-Allow-Origin' header"*.
  A `no-cors` fetch of the same URL succeeds (opaque), so the CDN answers but doesn't allow our origin.
- The CDN's CORS headers name a single origin: `Access-Control-Allow-Origin: https://www.nba.com`.
  Confirmed from the live site: `https://calendarkit-brown.vercel.app` is refused the same way (2026-10-23).
- Headless Chromium (Playwright, `scripts/probe-cors.ts`) doesn't even get that far:
  `net::ERR_HTTP2_PROTOCOL_ERROR` (Akamai bot blocking). `curl` gets **403** even with browser-like headers;
  Node's `fetch` via the module's `node.ts` (browser-like headers) gets the full feed (4.0 MB, 1274 games).
- **Decision:** no browser fetch. A GitHub Actions job (`.github/workflows/schedule-update.yml`, daily 11:00 UTC)
  runs `scripts/update-schedule.ts`, which downloads the feed with `node.ts`, checks it parses, and commits the
  **raw feed unchanged** to `public/data/schedule.json`. The app fetches that file and parses it with `parse.ts`.
  No per-request proxy.
- GitHub Actions runners reach the feed (dry run 2026-10-23: 1274 games downloaded, tests passed).

### 2. National broadcasters (`broadcasters.nationalBroadcasters`, 2026-27 feed)
Values seen (`broadcasterDisplay`; all `broadcasterScope: "natl"`, `broadcasterMedia: "tv"`):
NBC, Peacock, NBC Sports Network, Telemundo, ESPN, ESPN2, ABC, Prime Video, NBA TV.
- 329 of 1274 games have at least one; 945 have none.
- NBC games carry `localizationRegion` "National", "East" or "West" (regional split of the national window);
  shown as plain "NBC" — it's an importance marker, not a where-to-watch guide.
- `nationalOttBroadcasters` is empty for every game; `nationalRadioBroadcasters` (SiriusXM) is ignored.
  Only `nationalBroadcasters` drives the TV badge and the "TV games only" filter.

### 3. Game types in the current feed
| gameId prefix | module `gameType` | games | notes |
|---|---|---|---|
| 001 | preseason | 67 | dropped |
| 002 | regular | 1206 | incl. 60 Cup group games (`in-season`), 6 Cup knockout (4 QF, 2 SF), 3 Global Games, 12 "AWS NBA Rivals Week", 1 "NBA Pioneers Classic" |
| 006 | cup-final | 1 | `gameSubLabel: "Championship"`, 2026-12-11 8 pm ET, teams TBD |
| 003 / 004 / 005 | all-star / playoffs / play-in | 0 | not in the feed yet (appear when scheduled); covered by the module's ID-prefix mapping |

- **TBD**: the 6 Cup QF/SF games have `timeTbd` + `teamsTbd` (`gameStatusText: "TBD"`, `teamId: 0`, empty
  tricode, placeholder time = midnight ET). The Cup final has a known time but `teamsTbd`.
- **Undecided matchups not yet in the feed**: 1206 regular games + 24 still to be added = 1230. The 24 are the
  games the 22 non-knockout teams play during the Cup knockout week; the NBA adds them after the group stage.
- 290 games tip at/after 02:00 UTC (late West Coast games), so the "+1" marker matters for users east of ET.
- No postponed games (`postponedStatus` always "N").

### 4. Team logos (probe 2026-10-23)
- URL pattern confirmed: `https://cdn.nba.com/logos/nba/<teamId>/primary/L/logo.svg` → `200 image/svg+xml`
  (LAL 12 KB; `/global/L/` serves the same file). Unlike the schedule feed, plain `curl` and Node `fetch` get it
  (no bot blocking on downloads).
- **Real browser** (browser pane, page on the live site): loads (150×150 for LAL, BOS, BKN, SAS).
- **Headless Playwright** Chromium: **fails** (`onerror` for all 3 tried) — the same CDN bot blocking as the feed.
  So runtime hotlinking would break the e2e tests and any blocked client; local files avoid it.
- **Source / license**: downloaded once with `npm run fetch-logos` (`scripts/fetch-logos.ts`, Node `fetch`, checks
  HTTP 200 + SVG) to `public/logos/<tricode>.svg` (30 files, 1.5–12 KB, no scripts or external references).
  NBA team logos are trademarks of the NBA and its teams; stored locally for this personal project. The app only
  uses the local files (`teamLogo(teamId)` in `src/data/teams.ts`); never the NBA CDN at runtime (tested).
- **Visibility on the dark background** (contact sheet at 18 px and 64 px, not recolored): hard to see at line size —
  **SAS** (black spurs), **MEM** and **NOP** (navy), **UTA** (dark purple); borderline — **CHA** (navy/purple) and
  **PHI** (blue "76"). All others are clear. → Solved without editing the files: all logos now sit on a light
  circular backing in the month view (see Decisions).

## Tests
`npm test` (Vitest, 194 tests) · `npm run e2e` (Playwright, desktop 1280 px, desktop-xl 1920 px, tablet 768 px, phone 390 px, then the **perf** guard — see Performance) · CI: `.github/workflows/ci.yml` (runs on `main` and `claude/**` branches, so layout changes can be checked on Linux before they reach production).
- Module tests (`src/shared/nba-schedule/*.test.ts`) run unchanged.
- `tests/fixtures/feed-2026-10-23.json`: full real feed saved on 2026-10-23 (fixed, unlike the daily snapshot).
  `tests/synthetic.ts` builds targeted games through the module's `deriveGame`.
- `*.tz.test.ts` run twice, under America/New_York and America/Sao_Paulo; the zone is set as `env.TZ` per Vitest
  project in `vite.config.ts` (no shell prefix, works on Windows/Linux/CI). Cover the Nov 1, 2026 DST change,
  +1 grouping and the default-day rule with a mocked clock.
- `card.test.tsx` / `views.test.tsx` (jsdom): markers, TV badge/filter, TBD, B2B, rotationkit action contract,
  navigation.
- `week.test.tsx` (replaces `month.test.tsx`): league week view — opens on the default day's week, 7 cells / 14 in
  2-week mode, game count per week = data for **every week of the season** in both modes, 15-game day, lines
  with "AWAY@HOME" on every line and no legend, TBD without `<img>`, logo backing, today, equal rows; prev/next by 1 or 2 weeks and disabled
  at the season's ends, cross-year title, month popup (counts, month arrows, jump, Escape), day header → League List,
  TV filter (per day TV-only ⊆ all); time groups under two zones incl. (+1) and TBD; columns (1 week = 1 column,
  2 weeks = as many as fit), day flow (balance, newspaper order, no label ends a column, repeated label, no
  needless split); TV pill + floating tooltip on hover and focus; league B2B dot on the 2/2 team only, no team marks;
  cutoff 887 and the count grid at 360/700/886 px. `logos.test.ts`: 30 logo files + feed mapping.
- `team.test.tsx`: team header (48 px / 40 px logo, full name) in both team layouts; picker (logos on button and all
  30 options, 6 conference · division groups, mouse, keyboard ↓/↑/←/→/Home/End/letters/Enter/Escape, focus back to
  the button, phone tricode); selected team first + vs/@ + logos [team, opponent] on every BOS and LAL game, list and
  calendar (all months); phone calendar keeps opponent-only cells; B2B pairs worked out independently in the test
  for LAL, BOS, ORL, NYK (labels, night, code, plane iff the arena cities' metros differ, bracket attribute, no "B2B"
  badge), all four codes present in the real schedule, synthetic all-four-codes + unknown-city case, tooltip text on
  hover and focus, calendar bars (full bar placement, Sat → Sun halves on consecutive rows, cross-month half),
  phone short labels; opponent 2/2 dot exactly on 2/2 (tooltip text), not on 1/2, both marks; equal rows (5- and
  6-week months).
- `lists.test.tsx` (jsdom): List | Calendar switch in League and Team, the 4 views, layout kept across League ↔ Team,
  League → Calendar day-header click opens the list there, TV filter in all 4 views; league list opens on the
  default day, consecutive game days with headers, bounded rendering, scroll → week strip/date, no snap-back when a
  render lands between a scroll and its event, arrows/week strip; team list: every game in order, next game marked,
  row date/time/(+1)/"LAL @ LAC"/both logos, markers + TV names + B2B nights on exactly the right games (3 teams).
  `app.test.tsx`: old and new `?view=` links, `weeks=2`, layout and TV written to the URL.
- `e2e/features.spec.ts` (fixed clock Nov 15, 2026; all 4 widths): top bar one row (≤ 40 px) at 1920 px in all
  views incl. week view, ≤ 2 rows on phones, no sideways scroll; header (logo loaded, size, larger than any top-bar
  text, visible) and picker (30 loaded logos, inside the viewport, mouse, keyboard only); team list + calendar
  against the served snapshot: "ORL vs/@ OPP", two loaded logos per game, ORL at the same x on every row (phone
  calendar: opponent only); uniform cells (team calendar Nov 2026 = 5 weeks and Jan 2027 = 6 weeks, week view 1/2
  weeks, count grid), no page scroll at 1920 × 1080 and 1280 × 900, nothing cut off in a cell; week view: 7 equal
  columns, counts vs snapshot, toggle, prev/next, popup jump, day header → list; **fit**: walks every week of the
  season in 1- and 2-week mode at 1920 × 1080 (no page scroll, no line outside its cell, counts match), prints the
  busiest week(s) and the tallest day; cutoff: week view at widget 887 px with 119 px lines and nothing clipped,
  count grid 1 px below; B2B for ORL Nov 2026: bar geometry (inside night 1 → across the gap → inside night 2),
  week-break halves with arrow triangles, 1/2 transparent vs 2/2 filled, code, plane iff metro change, tooltip on
  hover and focus inside the viewport, opponent dot (5 px × the Team Calendar scale) + tooltip, list bracket (2 px orange, the two halves meet
  in the row gap), same labels; lists ≤ 960 px and centered with everything inside; TV filter: per rendered day
  TV-only count ≤ all-games count and every shown game has a national broadcaster in the snapshot.
- `e2e/lists.spec.ts` (fixed clock Nov 15, 2026 15:00 UTC; all 4 widths): switch + 4 views with layout checks
  (images loaded, logos backed, nothing clipped, no sideways scroll, list layouts fill the window without page
  scroll), reload keeps the state, old links; league list: opens at Nov 15 at the top, wheel scrolling (sticky
  header, week strip + title + URL follow, days in order, ≤ 12 days rendered), week-strip click and arrows, fast
  jumps, no position jumps while scrolling up, rows no taller with logos than without (team list: not on phones,
  see Decisions; there date, time and matchup always share one line); team list against the served snapshot
  (every game, order, B2B by the calendar-day rule), opens at the next game, top reachable; TV filter in all 4
  views. Screenshots `<project>-<league|team>-<list|calendar>.png` and `<project>-f-*.png`.
- `e2e/smoke.spec.ts`: loads, league + team view, TV toggle, calendar → day, no console errors; week view: 15 lines
  on Nov 2, two weeks around Nov 15 measured (`[project] content …, cols …, cell inner …, line …, 2-col spare …`):
  2 columns with ≥ 3 px spare at 1920 px, "AWAY@HOME" text on every line with the "@" clear of the tricode and logo, Nov 15 flows across both columns, 11 px / 16 px lines, every `<img>`
  loaded, nothing clipped, TV tooltip on hover, no request to cdn.nba.com; screenshots to `e2e/screenshots/`
  (git-ignored; uploaded as a CI artifact). `npm run e2e:live -- <url>` runs all e2e against a deployed site.
- `metro.test.tsx`: table (Inglewood → LA, Brooklyn → NY, other cities unchanged); real feed: 30 home cities → 28
  metros, only LAL/LAC and NYK/BKN shared, every table entry is a real arena city; synthetic LAL → @ LAC and NYK →
  @ BKN pairs: no plane, no travel in the tooltip; BKN → @ LAC: plane + "travels Brooklyn → Inglewood"; LA →
  Mexico City: plane; every crosstown pair in the real schedule: no travel.
- `scale.test.tsx`: `weekScale` (1.5 at 1920 × 1080 with line and busiest day inside 80 %, max, min 1, the cutoff → 1, 1280 px → 1.1, 0.05 steps), `scaleLine`; week view: 1 week scaled (every line variable = base × 1.5)
  vs 2 weeks at base size, 2 columns unchanged; Team Calendar: scale > 1 on desktop, probe gone after render,
  phone scale 1, TV names one span per network.
- `season.test.tsx`: `teamSeason` on synthetic games (numbers skip the Cup Final, record and streak from scores —
  W W W L L → –, W1, W2, W3, L1, L2 and the mirror for the opponent — unknown after a game not yet final), `finalScore` from either side; real feed, all 30 teams: numbers 1…n, every known record =
  the feed's W-L on the previous game, every streak = one counted in the test; BOS rows: "G1 0-0", "G2 0-1 L1"
  (red, tooltip), "G3" only, score + winner class, aria-label;
  no season line or score in the league views or Team Calendar. e2e (all 4 widths, served snapshot): BOS list
  game numbers, records, streaks and scores = the snapshot; season block inside the row at its right edge, records aligned;
  phone rows: time left out only on played rows, ≤ 2 lines without tags, ≤ 3 with. Team-list matchup checks
  elsewhere compare the text without scores. Before the change: `season.test.tsx` fails as a whole (`teamSeason`
  missing) and the 2 updated team-list matchup tests fail. Streak: 3 new/changed unit tests fail before it.
- e2e **fit** (above) also checks: 1-week scale ≥ 1.4 and line wider than 2-week (119 px, 11 px, scale 1), no
  tricode wider than its column. New e2e (desktop 1280 and desktop-xl 1920): **every team × every month** of the
  Team Calendar — no cell clipped (height or width), no page scroll, B2B bars on the cells' bottom edge (0–6 px),
  at 1920 px scale > 1 with logos 16 × scale; prints the fullest cell for 5- and 6-week months.
- New tests were run against the previous code first: 52 of the new/changed unit tests fail there (2026-10-23).
  Metro / scale work (2026-10-23): the 2 metro behaviour tests fail on the old code (the other 4 cover the table and
  cases that already worked), `scale.test.tsx` fails as a whole (functions missing), and the 5 new/changed e2e
  checks (team walk ×2, fit, B2B dot ×2) fail against an old build.
  "@" on every week-view line (2026-10-23): 7 new/changed unit tests fail on the code before it. The week test that
  walks every week of the season in jsdom takes 4–6 s, so it now has a 30 s timeout (it hit Vitest's 5 s default
  on a busy machine — the one unexplained failure in the previous change).
- `copy.test.tsx` (jsdom): pixel-ratio cap (4, lowered so the largest side is 16000 px), the capture filter
  (`data-capture-exclude`), wrap slack (wrapping flex rows widened inside the node, not the node, then undone),
  CopyButton (no text, excluded, ✓ → idle after 1.5 s, ! + console.error on failure, click not passed to the cell).
- `e2e/copy.spec.ts` (desktop-xl only, fixed clock Nov 15, 2026): clicks the real buttons, reads the PNG back from
  the clipboard (clipboard permission granted) and checks it: size = copied element × the ratio used, opaque corners
  in the dark background, not blank, and **every** logo area holds logo pixels (not only its light disc), every
  tricode / "@" area holds text, every B2B label/dot is orange, every TV badge/pill green. Exports: league week view
  (1 and 2 weeks), Team Calendar (LAL Nov 2026), full Team List (every ORL row, taller than the window), League List
  (whole week, logo count = the feed's games), a week-view day, a Team Calendar day with B2B, a League List day, a
  League List game with TV, a Team List game with B2B label + opponent dot. Negative checks: logo files that draw
  nothing → the logo check flags both logos; logo files missing → the copy fails with ! and a console error (no
  half-made image). PNGs go to `test-output/copy-images/` (git-ignored). The League List export fails with the wrap
  slack set to 0 (checked 2026-10-23).
- Manual only: judging look and feel, and pasting copies into the gauntlet whiteboard / Excalidraw and scaling them
  up (the clipboard read-back covers what the app puts on the clipboard; how another app scales a pasted image
  can't be scripted from here).

## Performance (guard: `e2e/perf.spec.ts`, 2026-10-23)
Measured at 1920 × 1080 in headless Chromium against the production build (`vite preview`), Playwright project
**perf**, which runs after every other project (so nothing runs alongside). Medians of 5 runs; the scroll test has an
extra uncounted warm-up run. Baselines per OS in `e2e/perf-baseline.json` (Windows PC; Linux = CI). A metric fails
when it exceeds **max(baseline × 1.5, baseline + slack)**; slack: load 150 ms, scroll p95 20 ms, scroll long tasks
300 ms, view switch 40 ms (identical runs vary by up to ±30 % — a pure ratio flaked on the small numbers). Checked:
a 1 ms busy-wait per game card fails the scroll and switch checks.
- **Load → first view** (navigation start → frame after the first game row is in the DOM; includes fetching and
  parsing the 4 MB snapshot): League List 300 ms, week view 473 ms, Team Calendar (BOS) 308 ms.
- **League List wheel scroll** Nov 1 → December (120 px wheel steps, ~170 frames): frame p95 65 ms, long tasks
  620 ms in total; worst single frame 100–400 ms (printed, not guarded: too noisy). Idle frames are 16.7 ms, so the
  ~50–65 ms scroll frames are real work (each scroll re-renders the visible days) — a candidate for a later speed-up.
- **View switch** (click → next frame): League List → Calendar (week) 248 ms, → Team Calendar 44 ms, → Team List
  80 ms, → League List 110 ms.
- Baseline = mean of three measuring runs on the unchanged code before the split (loads 277–319 ms / 401–498 /
  259–315; p95 50–73; long tasks 254–798; switches 212–276 / 35–48 / 65–87 / 77–125).

- **Split (step 1)**: checked as a pure reorganization by dumping every element's computed style (incl. ::before/::after) and box in 10 views × 4 widths from the old and new builds: 60 863 entries, 0 differences (only the enumeration order of custom properties changed). Screenshots differ by a few hundred channel values, the same as two runs of one build (raster noise). Perf after the split: loads 304 / 461 / 283 ms, scroll p95 56 ms, switches 238 / 62 / 80 / 98 ms.

## Decisions
- **Stack**: Vite + React + TypeScript, Vitest, Playwright — same as rotationkit.
- **Shared module** `src/shared/nba-schedule/` copied unchanged from rotationkit (see its `SOURCE.md`; the
  header note is a separate file so the copied files stay byte-identical). Its own tests run here.
- **Vitest 5** (rotationkit uses 3): vitest 3 has open audit advisories (tinypool RCE, @vitest/mocker); 5 is clean
  and runs the module's tests unchanged.
- **Which games**: whitelist by module `gameType`: `regular`, `cup-final`, `play-in`, `playoffs`. Everything else
  (preseason, all-star, unknown) is dropped.
- **Game date** is always the module's `dateEt`; local time is only used to format tip-off. "+1" = local calendar
  day of tip-off minus `dateEt`.
- **"Over"** = tip-off + 3 h. A TBD-time game counts as over at 12:00 UTC the day after its date.
- **Default league day**: earliest date with a game not over; after the season's last game, the last game date
  (there is no "next upcoming" date then).
- **Back-to-back** = the team also plays on the previous *calendar* day (ET game dates), not the previous league
  game date (which would flag games after the All-Star break).
- **Widget API**: components take `data` (`CalendarData`) + `size` ({width, height}; compact below 640 px) and
  optional `now`/`timeZone`; they raise `onOpenGame(gameId)` / `onStateChange` and never touch the URL or open
  links. Styles are in `calendar.css` (→ `styles/*.css`) imported by the components, colors as CSS variables.
- **List | Calendar switch** (2026-10-23): a segmented control next to League | Team, both options always visible;
  replaces the old "Month" toggle. League + List = continuous day list, League + Calendar = week view (count
  grid below 887 px; see below), Team + List = team list, Team + Calendar = team month grid. The layout is kept when
  switching League ↔ Team and stored as `layout=list|calendar`. Old links without `layout` map to what they
  showed: `?view=team` → Calendar, `?view=league` → List. "TV games only" is shown and applies in all four.
  Clicking a day header in League → Calendar opens League → List at that day. The URL always carries `tv=1` when on
  and `weeks=2` when the week view shows two weeks (kept across layouts; old links open one week).
- **League list** (`LeagueListView`): one scrolling list of game days (days without games — or without TV games
  when filtered — are left out), each under a sticky header "Sun, Nov 15 · 9 games". The nav title and week strip
  show the day at the top of the list; week-strip days without games are disabled; clicking one scrolls it to the
  top; arrows jump to the previous/next game day. Opens on the default day. **Rendering**: only days within 0.75
  viewport heights above/below the visible part are rendered (4–8 days in practice); the rest are spacers sized
  from measured heights (`getBoundingClientRect`, sub-pixel — integer `offsetHeight` drifted) or estimates. The
  day at the top and the offset into it are kept in place when heights above it get measured (`overflow-anchor:
  none`, the component restores it itself before paint); a scroll not yet seen by the handler is read first so a
  re-render can't undo it. Space after the last day lets every day reach the top. Events: `onSelectDate` (day at the
  top changed), `onOpenGame`.
- **Team list** (`TeamListView`): every game of the team, one row: date "Sun 15/11", local tip-off ((+1)/TBD),
  "BOS vs CHI" / "BOS @ DET" with both logos, Cup/Play-In/Playoffs markers, national TV badge with names, B2B labels. All rows rendered
  (~82, cheap); opens scrolled so the next game not over is at the top (accent border); earlier games are above
  (scroll up). Same team picker as Team → Calendar.
- **Team list season line** (2026-10-23, `teamSeason` / `finalScore` in model.ts): on the right of each row the
  regular-season **game number** ("G1"–"G82"), the team's **record going into the game** ("0-1") and its
  **streak going in** ("W3" green / "L1" red; Alex, 2026-10-23), in fixed tabular columns right-aligned to the row
  (min-widths fit "G82", "41-41", "W9"; gaps 6 px); tooltip "Game 2, record 0-1 going in, on a 1-game losing
  streak". The streak is the run of equal results ending with the previous regular-season game; none on G1 or where
  the record is unknown. Only regular-season games
  (gameType `regular`, Cup group and knockout games included) are numbered and counted; the Cup Final, play-in and
  playoff rows have neither, as in the standings. The record is counted from the final scores (status `final`)
  and is known through the first game not yet final; later rows show the number only (the record going into G5
  isn't known before G4 is played). Once a game is final its **score** sits beside each tricode ("BOS 113 @ DET
  121"), the winner's bright and bold, the loser's muted; the row's aria-label adds "lost 113–121". Scores and
  records come from the daily snapshot (~11:00 UTC), so last night's result appears the next morning. Not in the
  league views or the Team Calendar. Tests check each known record against the feed's own `wins`/`losses` on the
  previous game (an independent source), and each streak against one worked out in the test from the scores.
  Team-list rows use 8 px between their parts (10 elsewhere): the widest tablet row (LAL Nov 30: B2B + "Peacock ·
  NBC Sports Network" + season line) needs 682.2 of 689 px at 768 px; with 10 px it would wrap.
  - **Phone** (measured): line 1 = date, time and "BOS 113 @ DET 121" with logos needs 345 px of a 304–334 px row,
    so a **played** game's phone row leaves out its tip-off time (it stays in the aria-label); line 1 then needs
    271 px. Tags and the season line share line 2 (season right-aligned), so every phone row is two lines (47.5 px);
    three (66.5 px) when a B2B label plus "Peacock · NBC Sports Network" fill line 2.
- **List layouts fill the window**: the shell passes height = window below the widget's top (min 360 px); in List
  layouts the widget is that tall and the list scrolls inside it (top bar and week strip stay put). Calendar
  layouts fill at least that height (equal rows share it) on desktop/tablet and grow past it only if the content
  needs more; on phones they grow with the page.
- **Logos in the lists**: `GameCard logos` — the month view's 16 px light disc before each tricode, "@" kept. Rows
  keep their size (35 / 36.5 px desktop, 27 / 28.5 px phone single-line rows); on phone the date is 12 px and gaps
  4 px so a logo never pushes a row onto a second line (tested: no row height changes when logos are hidden) —
  except phone **team** rows, see "Team perspective".
- **Phone team grid**: cells show time, vs/@, opponent, markers; national TV shrinks to a dot; tapping a game shows
  the full card (selected team first, both logos, full B2B label, TV names, rotationkit action) below the grid.

### Top bar, team header, picker, list width (2026-10-23)
- **One-row top bar** (`CalendarView`): title (`title` prop; the shell passes "NBA schedule 2026-27"), League |
  Team, List | Calendar, team picker (team views), period title with prev/next (League List: day; Team Calendar:
  month; League Calendar: week(s), title opens the week picker; count grid: month; Team List: none), "1 week | 2
  weeks" (week view), TV games only, time-zone note (`note` prop, 12 px muted; a tooltip "i" on phones). The app
  shell has no header of its own any more. Measured at 1920 px: one row, 34–36 px, in all views. The period title
  has a **fixed width** (16.5 em = 247.5 px; widest title "Wednesday, September 30, 2026" is 238 px): with a
  min-width only, the title's width changed while scrolling the league list, the bar re-wrapped at 1280/768 px and
  moved the list under it (caught by the "no position jumps" e2e check). Phones: two rows (switches + TV on row 1;
  picker, period, note on row 2), fits a 360 px phone; the title is 10.5 em there.
- **Team header** (`TeamHeader`, team views): 48 px logo disc (40 px on phones) + full name "Boston Celtics"
  at 26 px bold (20 px phones), under the top bar — the largest text above the content. In Team List it sits in the
  960 px list column.
- **Team picker** (`TeamPicker`): button with the team's logo + full name (logo + tricode on phones); opens a
  listbox (fixed position, clamped into the viewport) grouped East · Atlantic … West · Southwest — 3 × 2 divisions
  on desktop, 2 columns (East | West) on phones — every option with its logo. Keyboard: Enter/Space/↓ open on the
  current team, ↑/↓ move, ←/→ jump a division (a conference on phones), Home/End, a letter jumps to the next team
  whose city or name starts with it, Enter picks, Escape/Tab close; focus returns to the button.
- **List width**: League List and Team List content capped at **960 px** (`LIST_MAX_WIDTH`), centered; week strip,
  day headers and the team header align to it. Calendars keep the full 1840 px.
- **Tooltips**: one floating tooltip per widget for every `[data-tip]` (TV pill, B2B dots and labels, the phone
  note) on hover and keyboard focus; fixed position and clamped into the viewport, so cells with overflow: hidden
  can't clip it (the B2B tooltip is ~330 px, wider than a cell). Replaces the CSS `::after` tooltips. Closes on
  scroll.

### Team perspective and back-to-backs (team views, 2026-10-23)
- **Selected team first**: "BOS vs CHI" at home, "BOS @ DET" away, both logos, in Team List rows and Team Calendar
  cells; each side (team; vs/@ + opponent) wraps as one unit in narrow cells (tablet). Fixed-width tricode slots
  keep the selected team at the same x on every list row. **Phone calendar** keeps the opponent-only cell ("vs
  CHI", no logos): cells are ~40 px wide, both tricodes don't fit; the header names the team, and the tapped card
  shows both. **Phone team list (measured deviation)**: date, time and "BOS vs CHI" with both logos always share
  one line, but the second logo leaves no room on that line for tags, so a row with a B2B label or TV names carries
  them on a second line. Rows without tags keep their height.
- **B2B pairs** (`teamB2BPairs` in model.ts): consecutive calendar days of the team's games (all games, not the TV
  filter). Both nights are marked: night 1 outlined "1/2 · XY", night 2 solid "2/2 · XY"; XY = home/away of night 1
  then night 2 (HH/HA/AH/AA), same on both. Real schedule: HH 128, HA 78, AH 68, AA 152 pairs (all four occur), 51
  cross a Sat → Sun week break. Replaces the "B2B" badge in team views; league views unchanged (badge in the list,
  dot on the 2/2 team in the week view).
  - **Plane** (metro areas, 2026-10-23): shown when the **metro** of the feed's **arena city** (`arenaCity`, passed
    through by the shared module) differs between the nights; omitted when either city is empty. Reason: the feed
    names the arena's own city, and two arenas sit in a suburb/borough of a metro another team plays in, so
    Lakers–Clippers and Knicks–Nets back-to-backs showed a plane. Fixed table `ARENA_METRO` in
    `src/data/metro.ts`: **Inglewood → Los Angeles** (LAC, Intuit Dome), **Brooklyn → New York** (BKN, Barclays
    Center). Checked against all 30 teams' home arena cities in the 2026-27 feed (30 cities → 28 metros; GSW is
    "San Francisco", the only Bay Area team; no other shared metro). Any city not in the table is its own metro, so
    neutral sites keep their city (Mexico City, Paris, Manchester, Austin). The tooltip names the real cities
    ("travels Brooklyn → Inglewood") only when there is a plane. Tests write the table out independently.
  - **Calendar**: a 3 px orange bar at the bottom of both cells, one element spanning both grid columns so it
    continues through the gap. Across a week break (or a month edge) each night gets a half ending in a 6 px arrow
    toward the other. Bars are grid items over explicitly placed cells. If the TV filter hides one night, no bar
    (labels only). Phone cells show "1/2" / "2/2" (+ plane) without the code (measured: "1/2 · HA" is ~40 px in a
    39 px cell); the tooltip and the tapped card have the full label.
  - **List**: a 2 px orange bracket on the left edge of both rows (night 1 from its middle down, night 2 from the top
    to its middle, meeting in the row gap); same labels and plane.
  - **Tooltip** (hover + focus): "Back-to-back: vs BKN (home) → @ LAL (away) · travels Boston → Los Angeles"; no
    travel part in the same city.
- **Opponent's 2nd night**: 5 px orange dot on the opponent's tricode (no bar, no label) when the opponent played
  the previous calendar day; tooltip "CHI on 2nd night of a back-to-back · played @ MIA yesterday". Not on its
  1/2. Both marks when both teams are on 2/2. Phone calendar cells too.

### Uniform cells (2026-10-23)
- Every day cell in a grid has the same size: columns `repeat(7, minmax(0, 1fr))`, rows 1fr. **Team Calendar**
  rows `minmax(92px, 1fr)` (**minimum cell height 92 px** on desktop/tablet) filling the window below the header;
  measured at 1920 × 1080: 259.4 × 179.4 px cells (5-week month), 259.4 × 148.8 px (6-week), no page scroll; also
  none at 1280 × 900 (138.8 / 115.0 px). Phones: rows 1fr (all as tall as the busiest), page scrolls. Week view and
  count grid: rows 1fr.
- **Team Calendar scale** (2026-10-23): on desktop/tablet the cell content (time, "BOS vs CHI" + logos, B2B label,
  TV names, Cup markers, opponent dot) is scaled with CSS `zoom: var(--ck-team-scale)`; the B2B bar stays a grid
  item at the cells' bottom edge, unscaled. The scale is measured, not guessed: a hidden **probe** cell (rendered
  only while measuring, removed before paint) holds the fullest cell the season can have — the longest national TV
  names ("Peacock · NBC Sports Network"), a Cup Final marker, a travelling "1/2 · AA ✈" label and the opponent
  dot — and the scale is the largest (0.05 steps, ≤ 2) at which it fits ≤ 90 % of a **6-week** month's cell (the
  smallest cells) with no sideways overflow. So one scale for every month and team at a given window size.
  Measured at **1920 × 1080: 1.3** (12 → 15.6 px text, 16 → 20.8 px logos); fullest real cell 116 px of 137.8 px
  (6-week, CHI Jan 2027, 259.4 × 148.8 px cells) and of 168.4 px (5-week, ATL Feb 2027, 259.4 × 179.4 px). It is
  bound by height: at 1.35 the probe's tags take a third row. 1280 × 900 → 1 (fullest cell 96 of 104 px). Phone
  cells unchanged (no scale). Not budgeted: the "Rotations ↗" button (hidden while `ROTATIONKIT_BASE_URL` is unset).
- **TV names in calendar cells** (desktop/tablet): one pill per network, flowing with the other tags, so they wrap
  between networks, never inside one. Fixes a clip found while measuring: at 1280 px "Peacock · NBC Sports Network"
  (177 px nowrap) overflowed a 171 px cell sideways (LAL Nov 30, 2026; the old check only looked at height). A
  single pill wrapping inside made CHI Jan 4, 2027 too tall for a 6-week cell (page scrolled 51 px). The separator
  " · " stays in the text (hidden), so the badge text is unchanged. Phones keep the green dot.
- **Page width**: content up to **1840 px** (`.app` max-width 1872 px incl. 16 px padding; `MAX_CONTENT_WIDTH` in
  `App.tsx`) — ~40 px side margins at a 1920 px window — for every view. The shell passes the widget its *measured*
  content width (ResizeObserver on `.app`), not `window.innerWidth`, and `html { scrollbar-gutter: stable }` keeps
  that width from jumping when a view grows taller than the window.
- **Font**: Inter (variable, latin subset, 48 KB, SIL OFL 1.1 — `public/fonts/Inter-OFL.txt`), self-hosted at
  `public/fonts/inter-latin-wght-normal.woff2`, preloaded in `index.html`, used app-wide. Reason: identical text
  widths on Windows, Linux and CI, which the month view's fixed column widths rely on (before it, Linux's wider
  default font clipped lines). Tabular digits for times. No third-party font request.
- **League → Calendar = week view** (`LeagueWeekView`, 2026-10-23; replaces the full league month): 7 equal day
  columns, 1 or 2 week rows ("1 week | 2 weeks", default 1, `weeks=2` in the URL), every game of each day at the
  game-line size below (no "+N more"), time groups, logos, TV pill, B2B dot. 1 week: one column of games per day;
  2 weeks: the day flows into as many columns as fit (2 at 1920 px, 1 at 1280 px). Opens on the default day's week
  (state `date`); prev/next move 1 or 2 weeks (disabled at the season's ends); the period title ("Nov 15 – 21,
  2026") opens a month popup with counts per day (month arrows) — a day jumps to its week; each cell's day header
  ("Sun 15 · 9 games") opens League → List at that day. Today's cell highlighted.
  - **Fit at 1920 × 1080** (measured 2026-10-23, every week of the season walked in e2e): busiest week Dec 27 – Jan 2
    (56 games), busiest 2 weeks Dec 27 – Jan 9 (110 games); at the 1× size the tallest day (Apr 4, 2027, one
    column) needed 455 px of a 984 px cell, now **667.5 px at 1.5×** (316.5 px spare); in 2-week mode the tallest
    day (Nov 2, 15 games, 2 columns) needs 249.5 px in a 490 px cell. No page scroll, nothing clipped, nothing
    shrunk or hidden.
  - **1-week scale** (`weekScale` in `dayflow.ts`, 2026-10-23): in 1-week mode the whole line (logos, tricodes,
    time labels, TV pill, B2B dot, gaps — every `MONTH_LINE` length, `scaleLine(s)`) is scaled by one factor s:
    the largest in 0.05 steps up to **1.5** (`WEEK_SCALE_MAX`) such that one line uses ≤ 80 % of the cell's inner
    width and the season's busiest one-column day (`busiestDayHeight`, all games, in the viewer's zone) ≤ 80 % of
    the cell height below the day header; never below 1. Cell width from `monthCellInner(width)`; cell height = the
    widget height below the grid's top (measured once per size; independent of s, so no feedback loop). The day
    header keeps its size. Measured: **1920 × 1080 → 1.5** (line 178.5 px in a 249.4 px cell = 72 %, logos 24 px,
    tricodes 16.5 px, "@" 13.5 px); 1280 × 900 → 1.05 (bound by width: 162.7 px inner cell width); 2560 × 1440 → 1.5;
    the 887 px cutoff → 1. 2-week mode: 1× (119 px, 2 columns at 1920 px).
  - **Line**: `[logo] AWAY @ [logo] HOME [TV]` — **"@" on every line** (Alex, 2026-10-23: "HOU @ ATL"; replaces
    the earlier no-"@" line + "Away · Home" legend, which is gone). 11 px Inter semibold tricodes, 16 px logos;
    the "@" 9 px regular, muted (8.69 px wide), centered in its own 12 px column; the away tricode is right-aligned
    against it, so the "@" forms one straight column down a day. 2-week mode; 1-week mode scales it all, see
    "1-week scale". Geometry in `MONTH_LINE` (`dayflow.ts`): logo 16 · gap 1 · tricode 28 · "@" 12 · logo 16 ·
    gap 1 · tricode 28 · gap 2 · TV 15 = **119 px** (was 115: the logo→tricode gaps went 2 → 1 px to make room),
    fixed for every line. Tricode column 28 px fits the widest tricode (MEM 26.95 px).
  - **Time groups**: each day's games grouped by local tip-off label ("20:00", "00:00 (+1)", "TBD" last), small
    muted label above each group; no time on the lines.
  - **TV pill**: literal "TV" in a 15 px green pill on national-TV games; network names only in its tooltip
    (hover/focus). The pill's column is reserved on every line.
  - **B2B mark**: 5 px orange dot over the top-right corner of the tricode of the team on the second night (same
    `isBackToBack` rule as elsewhere); takes no width; tooltip "Back-to-back".
  - **Columns** (2 weeks): `monthColumns(width)` = as many 119 px lines as fit the cell's inner width with an 8 px
    gap (`MONTH_COL_GAP`, was 10 before the "@"; computed from the widget width, no DOM measuring). Measured at
    1920 px: cell inner 249.42 px, 2 × 119 + 8 = 246 → 3.42 px spare (was 9.42), so still 2 columns.
  - **Day flow** (`flowDay`): a day's content (time labels + games, in tip-off order) is one list filling column 1,
    then column 2 (newspaper order). Break points minimise the tallest column (heights estimated from
    `MONTH_LINE`); each column starts with a game's group, so a label never ends a column; a group is split only
    when that balances the columns by more than a row, and then repeats its label (`data-repeat`). On ties, fewer
    splits, then the longer column first.
  - **Game background dropped** (earlier): 2 px padding on each side would cost 4 px more than the 3.42 px spare.
  - **Logo backing**: every logo sits on a 16 px light disc (`rgba(226,231,238,.92)`), logo drawn at 80 % inside
    it; SVG files unchanged. Fixes the dark logos (SAS, MEM, NOP, UTA; CHA, PHI).
- **Narrow widths: count grid** (`MonthNavigator`, month of counts per day, click → League List): below a widget
  width of **887 px** (`WEEK_MIN_WIDTH`; 859 before the "@"), where a full-size 119 px line no longer fits a
  7-column cell ((w − 12) / 7 − 6 ≥ 119). Measured (e2e `desktop`, headless Chromium): window **934 px** (887 + 32
  padding + 15 px scrollbar gutter) → content 887 px, line 119.00 px, nothing clipped; 933 px → count grid. Tablets (768 px) and
  phones get the count grid. The old month view's line scaling (768–860 px windows) is gone: lines are never shrunk.
- **Snapshot size**: the raw feed is ~4 MB (≈ 200–300 KB gzipped over the wire). Committed daily only when it
  changes. Kept raw so no information is lost (scores later).

### Copy as image (2026-10-23)
- **Port of Boardkit's** `copyAsImage.ts`: html-to-image `toCanvas`, pixelRatio **4**, capped so the largest side
  is ≤ 16000 px (`min(4, 16000 / largest side)`), elements with `data-capture-exclude="true"` (every copy button)
  filtered out, `canvas.toBlob` → PNG → `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`.
  Buttons show ⧉, ✓ on success, ! on error (logged with console.error), back after 1.5 s. The glyphs are CSS
  content, so the buttons add no text to cards and cells.
- **What can be copied**: the whole view (toolbar button, every view), a day (hover button: week-view day cell,
  Team Calendar day cell with a game, League List day), a game (hover button on every game card: League List, Team
  List, phone detail card). Not on week-view game lines (a hover button there would cover the TV pill and its
  tooltip; copy the day instead), and not on the card inside a Team Calendar cell (cell = one game; the day button
  copies it with its date).
- **Whole view = rendered off-screen** (`CaptureStage`: a portal at left −100000 px, only while copying) at the
  widget's width, with a caption (title, period, "TV games only" when on, time-zone note) instead of the controls,
  plus the team header in team views. So it's the full view, not what a list has scrolled to: Team List = every
  game; League List = the week of the day at the top (the whole season would be ~50 000 px tall and drop far below
  4×). Rendered at zoom 1, like Boardkit's board copy.
- **Differences from Boardkit**: (1) every copy is drawn over the app background (`--ck-bg`, #0f1115); Boardkit
  keeps transparent gaps when a board has no background. (2) The whole view is a fresh off-screen render, not the
  live node, because the lists scroll inside fixed-height boxes. (3) **Wrap slack**: html-to-image gives each clone
  its element's computed width rounded to a few decimals, so a wrapping flex row that exactly fits can wrap in the
  image (found by the e2e: "Prime Video" dropped below the TOR @ DET Cup row and was clipped). Wrapping flex rows
  inside the copied node get +0.1 px while it's cloned, then their width is restored.
- **Logos** were already local (`public/logos/*.svg`, same origin), so html-to-image embeds them; no CORS issue.
  Verified pixel by pixel in every export test. A missing logo file makes the copy fail (!) instead of copying a
  blank logo.
- Team Calendar B2B bars span two cells, so a single-day copy shows the cell's B2B label but not the bar.

## Requests for rotationkit (module gaps — not forked here)
- **Playoff round**: the module has `gameType: 'playoffs'` but no round. calendarkit reads it from the gameId
  (`004 YY 00 R S G`, R = round) in `playoffRound()` in `src/data/model.ts`. Please add e.g. `playoffRound: 1–4 | null`
  (and series/game number) to `deriveGame`; calendarkit will switch to it on the next copy.

## Open questions / items
- The scheduled snapshot ran at 15:36 UTC on day 1 instead of 11:00 (GitHub delays cron runs under load).
  Harmless for a schedule; the job now rebases before pushing in case it races a normal push.
- **ROTATIONKIT_BASE_URL** is a placeholder until rotationkit has a production URL (it isn't merged to main).
  While it is, the app **hides the "Rotations ↗" action everywhere** (league day, team grid, phone detail card):
  `isRotationkitConfigured()` in `src/config.ts` is the single check, and the shell then passes no `onOpenGame`.
  **To turn it on, set `ROTATIONKIT_BASE_URL` in `src/config.ts` to the real URL — that is the only step.** The
  tests follow the config (the e2e expects the action iff it is configured), so no test edits are needed.
- Check that the next daily snapshot commit (by `github-actions[bot]`) triggers a Vercel deploy. If Vercel refuses
  bot-authored commits, set repo variables `DATA_COMMIT_NAME` / `DATA_COMMIT_EMAIL`.
- Repo is private; the standard for these projects is public (needs Alex's yes to change).
- Repo growth from daily 4 MB snapshot commits (~a few hundred KB compressed per change). Fine for a season;
  revisit if it becomes a problem (e.g. Vercel Blob or a separate data branch).
