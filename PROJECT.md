# calendarkit — PROJECT

NBA schedule calendar: every team's schedule plus the full-league schedule. Standalone web app (Vite + React),
own repo (github.com/AlexLCBranco/calendarkit) and own Vercel project.

## Goals (v1)
- League and Team views of the NBA schedule, each as a List or a Calendar (month).
- **Schedule first**: no live status. Final scores in every view (desktop/tablet; see "Final scores everywhere"),
  records and streaks only in the Team List, all from the daily snapshot. Live scores would need a fresher refresh
  strategy.
- Components are widget-first so they can later be dropped into **gauntlet** (whiteboard with live widgets).
- Links into **rotationkit** for games that are over.

Out of scope for v1: live status, New Event, event categories, calendar settings, other leagues,
where-to-watch info, embedding in gauntlet.

## Status
- [x] Step 0 — probe (below)
- [x] Data layer — `src/data/model.ts` (pure derivations), `src/data/load.ts` (fetch snapshot once, parse with `parse.ts`), `src/data/teams.ts`
- [x] Views — one file per component in `src/components/` (split 2026-10-23; `CalendarView.tsx` re-exports them all, so hosts and tests import from it): `LeagueListView` (continuous, virtualized day list + week strip), `TeamListView`, `TeamMonthGrid`, `LeagueWeekView` (1 or 2 week rows, every game per day with logos; desktop widths), `MonthNavigator` (count grid, click → day; narrow widths and the week picker popup), `TeamPicker` (custom listbox with logos), `TeamHeader`, and `CalendarView` combining them behind a one-row top bar. Shared pieces: `widget.ts` (size, date formatting, clock, B2B lookups), `PeriodNav.tsx`, `Segmented.tsx`, `Tooltip.tsx`, `WeekPicker.tsx`, `CaptureStage.tsx`. Styles: `calendar.css` is only an ordered list of `@import`s of `styles/*.css` (one per component; the order is the cascade order). Day-cell layout maths in `src/components/dayflow.ts` (pure). App shell `src/App.tsx` (URL state `?view=&layout=&team=&date=&weeks=&tv=`).
- [x] Game card — `src/components/GameCard.tsx`: "BOS vs CHI" / "BOS @ DET" (team view, selected team first) or AWAY @ HOME, local tip-off with (+1), TBD, B2B (league: badge per team; team: 1/2 · 2/2 labels + opponent 2/2 dot), Cup / Cup Final / Play-In / Playoffs-round markers, national TV badge, "Rotations ↗" action (raises `onOpenGame`) once tip-off + 3 h has passed — only when the host passes `onOpenGame`; the app shell does so only once `ROTATIONKIT_BASE_URL` is set (hidden for now, see Open questions).
- [x] Tests — see "Tests" below
- [x] Copy as image (2026-10-23) — `src/components/copyAsImage.ts` + `CopyButton.tsx`, ported from Boardkit; see "Copy as image" in Decisions
- [x] Round 3 (2026-10-24): rest days, schedule fatigue (B2B + 3-in-4), Team Calendar week views, marquee select — see
  "Round 3" in Decisions.
- [x] Round 2 (2026-10-23/24): perf guard, file split, Today button, final scores everywhere, data freshness +
  Try again, daily deploy check, shared-module drift check (`npm run check-shared`). See the sections below.
- [x] Deploy — live URL: **https://calendarkit-brown.vercel.app** (Vercel project `calendarkit`, imported
  2026-10-23; push to `main` deploys). Smoke test passes against it (`npm run e2e:live -- <url>`).
  The snapshot is served brotli-compressed: ~106 KB over the wire for the 4 MB file.

## Current state / handoff (2026-10-30, after round 7)
Round 7 shipped v1.18.2 (leftovers: merged chip in Team Calendar cells, no opponent dot beside its component, home
plane inside the line; tests: modified clicks open a real tab, Cup URLs checked against hoopsjunkie), v1.19.0 (today in
the Team Calendar, rest days on by default and never stored, countdown removed with the minute tick, tight unplayed
rows) and v1.20.0 (**Slate view** + transparent page-shaped copies). Details: "### Round 7 (2026-10-30)" under
Decisions. Decisions recorded there, don't undo: no persistence for defaults until a settings page exists; countdown
dropped for now; unplayed rows don't line up with played ones; Slate copy = largest-cards rule.

## Previous handoff (2026-10-30, after round 6)
State at v1.18.1 (live at https://calendarkit-brown.vercel.app). Rounds 1–6 are done. Details and measurements for
each item are under "Decisions" ("### Round 6 (2026-10-30)", "### Round 5 (2026-10-29)", "### Round 4 (2026-10-28)").

**Round 6 shipped:**
- v1.17.2: **copies ~25 % faster.** html-to-image wrote all ~480 computed properties into every cloned node; the
  browser drawing that SVG is most of a copy. `CAPTURE_SKIP_STYLE` (copyAsImage.ts) leaves out logical duplicates and
  what a still image never shows; images pixel-identical. The seven-copy test budget is 90 s (was 150 s).
- Test only: **perf guard** — the scroll checks' main-thread time is compared with v1.17.1 built and run in the same
  run, interleaved (`scripts/perf-ref.ts`, `REFERENCE` / `REF_RATIO` 1.25 / `AB_RUNS` 7 in perf.spec.ts); no absolute
  main-thread baselines any more.
- Test only: **NBA Cup knockout links** checked on a fixture in the feed's format (`tests/fixtures/cup-knockout-2025.json`).
- v1.17.3: **team picker** — a resting pointer no longer overrides the keyboard choice (the flaky "Miami instead of
  Orlando" was a real bug).
- v1.17.4: **2-week view** — the away tricode's plane sits inside the line; it no longer overlaps time labels.
- v1.17.5: **the page always opens on today** (the URL's `date=` is ignored on load) and follows midnight while on
  today, also after sleep / tab switch.
- v1.18.0: **Fatigue component** — leg dot in the B2B badge (left = 1st night, right = 2nd), merged 3-in-4 stretches
  ("4in6 · 2nd"; compact: "4in6"), pop-up with the stretch and a day strip; no yellow tricode boxes where the component
  is shown (League List desktop, 1-week view); legends follow.
- v1.18.1: **copies can no longer hang.** html-to-image's image loader ignored a rejected `img.decode()`, so a copy whose
  SVG Chrome refused to decode (CI, full Team List) never finished — the real cause of round 5's CI "timeouts".
  `loadImage` (copyAsImage.ts) replaces it: a rejected decode is ignored, a load error shows "!".

**Where things live (new):** `e2e/fixtures.ts` (the e2e `test`: hands a URL's `date=` to the app's test hook
`window.__ckOpenDate`, App.tsx); `seasonDay` / `teamMonthOf` / `teamWeekOf` and the midnight effect in CalendarView.tsx;
`B2BBadge` in Fatigue.tsx; `MergedThreeInFour`, `mergedChip`, `mergedDays`, `ordinal` in scheduleTags.ts; the pop-up's
`DayStrip` in Tooltip.tsx (`data-tip-days`); `scripts/perf-ref.ts`.

**Tests:**
- Commands: `npm test` (Vitest, 348 tests) and `npm run e2e` (Playwright). Run the e2e projects one at a time so each
  run fits `timeout 300`: `--project=desktop` (~1.7 min), `--project=desktop-xl` (~2.4 min),
  `--project=tablet --project=phone` (~45 s), and the perf project in pieces (`--project=perf --no-deps -g "<name>"`:
  each scroll check ~1–1.7 min with the reference runs). CI: e2e 9–12 min (job limit 25 min).
- e2e specs import `test` from `./fixtures`, not `@playwright/test` — except `open-today.spec.ts` (and the perf spec's
  reference pages), which must see what a person's browser does.
- New e2e: `open-today.spec.ts`; round-6 blocks in `fatigue-component.spec.ts` (leg dot, yellow boxes vs views,
  widest chip); plane/label overlap in `two-week-fit.spec.ts`; the picker race in `features.spec.ts`.
- The rules stay: `timeout 300` on every command, output to a file, never pipe test output into grep.

**Decided:** the compact week-view chip shows the stretch without tonight's place ("7in11"): two full chips
("7in11 · 2nd") need ~166 px under a line whose day cell is 163 px at 1280 × 900. Alex chose to keep it (2026-10-30).

**Open issues** (round 7 resolved the first three: merged chip in cells — the tablet/phone Team List never had a chip,
this note was wrong —, opponent dot removed beside its component, home plane fixed):
- Team Calendar month view at 1280×900 stays at scale 0.8 (unchanged).

**Don't break:** everything in round 5's list still holds. Also:
- The league views open on today on every load (never the URL's date); e2e opens other days only via `__ckOpenDate`.
- The leg dot never flips with the column; the badge keeps its width.
- The Fatigue component's width stays fixed, empty or not (10.25 em; compact 8.35 em).

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
- **Deploy check** (2026-10-23): after committing a snapshot the job runs `scripts/verify-deploy.ts`: it polls
  `https://calendarkit-brown.vercel.app/data/schedule.json?verify=<unique>` (no-cache; the unique query skips the
  CDN's 5-minute cache) every 30 s, 20 times (~10 min), until the live `meta.time` equals the committed file's, and
  fails the run otherwise (GitHub emails the owner). Skipped when no snapshot was committed (unchanged feed, or the
  push-triggered dry run). Job timeout 15 → 25 min.

### 2. National broadcasters (`broadcasters.nationalBroadcasters`, 2026-27 feed)
Values seen (`broadcasterDisplay`; all `broadcasterScope: "natl"`, `broadcasterMedia: "tv"`):
NBC, Peacock, NBC Sports Network, Telemundo, ESPN, ESPN2, ABC, Prime Video, NBA TV.
- 329 of 1274 games have at least one; 945 have none.
- NBC games carry `localizationRegion` "National", "East" or "West" (regional split of the national window);
  shown as plain "NBC" — it's an importance marker, not a where-to-watch guide.
- `nationalOttBroadcasters` is empty for every game; `nationalRadioBroadcasters` (SiriusXM) is ignored.
  Only `nationalBroadcasters` drives the TV badge and the "TV games only" filter.
- **NBA TV is left out** (2026-10-28, user report): NBA.com's "National broadcasters" filter doesn't show NBA TV
  games (79 games, always NBA TV alone; description "Watch with League Pass…"), so `nationalTv()` drops it.

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
`npm test` (Vitest, 224 tests) · `npm run e2e` (Playwright, desktop 1280 px, desktop-xl 1920 px, tablet 768 px, phone 390 px, then the **perf** guard — see Performance) · CI: `.github/workflows/ci.yml` (runs on `main` and `claude/**` branches, so layout changes can be checked on Linux before they reach production).
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
- `today.test.tsx` (jsdom) + `e2e/today.spec.ts` (desktop, desktop-xl): Today in all four views — disabled on load, enabled
  after moving away, back to the default day / its week (1 and 2 weeks) / current month (and clamped after the season)
  / next game at the top (real wheel scrolling), right after the › arrow, absent on phones, top bar height unchanged
  when it toggles, ≤ 40 px at 1920. The 6 unit tests fail on the code before it.
- `scores.test.tsx` (jsdom, fixture) + `e2e/scores.spec.ts` (desktop, desktop-xl, served snapshot): every final game
  shows the right score in the League List, every team's Team Calendar, the week view in 1 and 2 weeks (score in the
  logo slot, no logo/TV pill on final lines, TV slot kept, upcoming lines with logos + TV pill as before) and the Team
  List; winner/loser classes and weights; phones unchanged; scores fit their slot; "@" column straight; 2 columns at
  1920. `scale.test.tsx`: score font = largest step that fits; 1-week "logos + scores" < 1.3. `e2e/copy.spec.ts`:
  a `score` region kind (must hold text pixels) and a test copying the week of Oct 18 (1 and 2 weeks), the Oct 21
  League List day, BOS's October calendar + a day, and the BOS Team List: score count = 2 × final games. 5 of the
  new unit tests fail on the code before it (the other 3 check phones stay unchanged); 2 team-calendar matchup tests
  and the old "scores only in the Team List" test were updated.
- `freshness.test.tsx` (jsdom) + `e2e/freshness.spec.ts` (desktop widths): stamp text in three zones, under the note,
  muted while fresh, orange + tooltip past 36 h (and not at 36 h − 1 min), none without a time or on phones; the
  loader keeps `meta.time`; the stamp from the served snapshot through the real shell (text worked out in the
  test); Try again after a 503 on the first request (unit: mocked fetch; e2e: routed request). 4 of the 5 unit tests
  fail on the code before it (the 5th checks phones have none).
- `verify-deploy.test.ts`: passes when the live time matches (after an old deploy and a 404), fresh query and no-cache
  each try, 30 s apart; fails after 20 tries (10 min) of the old snapshot or network errors; the workflow's commit
  step sets `committed=true` and the check runs only then (fails on the workflow before it).
- `check-shared.test.ts`: blob id of stored bytes = git's (incl. the empty blob), identical trees pass with our
  SOURCE.md ignored, changed / missing / extra files reported. Checked by hand: a copy with one byte changed → exit 1.
- `scroll-cost.test.tsx` (jsdom): tipoff / localDate / fmtDate over 300 games × 3 zones build ≤ 10 formatters (2 760
  before) with unchanged results; a League List scroll that keeps the same days rendered formats no tip-off time or
  day heading (75 before: every visible day re-rendered). Both fail on the code before the fix.
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
extra uncounted warm-up run. Baselines per OS in `e2e/perf-baseline.json` (Windows PC; Linux = GitHub CI, the slower runs: runners vary up to ~1.8× between runs of identical code — scroll mean 19–35 ms, p95 30–61 ms — so on CI the guard catches only large regressions; the local Windows run, same machine every time, is the fine-grained one. 2026-10-24: a CI run failed scroll mean 35.3 > 34.5; an A/B on one machine, Today commit vs HEAD alternating ×3, showed no difference (mean 28.9 vs 29.1 ms, p95 50 vs 52 ms), so the Linux scroll baseline was raised from the two fast runs (23 / 41) to the slow ones (34 / 59)). A metric fails
when it exceeds **max(baseline × 1.5, baseline + slack)**; slack: load 150 ms, scroll frame p95 15 ms, scroll mean
frame 10 ms, view switch 40 ms (identical runs vary by up to ±30 % — a pure ratio flaked on the small numbers). Checked:
a 1 ms busy-wait per game card fails the scroll and switch checks; 0.5 ms takes scroll p95 to 289 ms.
- **Load → first view** (navigation start → frame after the first game row is in the DOM; includes fetching and
  parsing the 4 MB snapshot): League List 300 ms, week view 473 ms, Team Calendar (BOS) 308 ms.
- **League List scroll fix (2026-10-24)**. Measured first in **real headed Chrome 156 with the GPU** (Radeon RX 550,
  D3D11; window maximized on the 1920 × 1080, 59 Hz screen → page 1904 × 985; `npm run measure-scroll`, same gesture as
  the guard): **54.6 fps** without Playwright's fake clock (mean 18.3 ms, p95 33.4 ms, 7–10 % of frames > 25 ms, main
  thread busy ~4.9 s of the ~5 s gesture); 36.9 fps with it. **Cause** (CPU profile of an unminified build): (1)
  `tipoff`, `localDate` and `fmtDate` built a new `Intl.DateTimeFormat` on every call — 52 % of all CPU (`tipoff`
  alone 1.8 s of 3.5 s; `dayHeading` 0.25 s); (2) every scroll event re-rendered every visible day and all its game
  cards. Playwright's fake clock (`page.clock`) wraps `Intl.DateTimeFormat`, which made it look worse in tests
  (36.9 fps). **Fix**: one shared formatter per locale + options (`dateFormat` in model.ts), and `memo` on the League
  List's day section. **After: 59.9 fps** (mean 16.7 ms = one refresh, p95 16.8 ms, no frame > 25 ms; main thread
  1.1–1.9 s), also with the fake clock (61.9). The formatter cache also sped up the week view: load 473 → 253 ms,
  switch to League Calendar 248 → 54 ms. No visible change: computed style + box diff of 10 views × 4 widths, old vs
  new build, 61 055 entries, 0 differences.
- **Guard after the fix**: the scroll test runs without the fake clock (it measured the wrapper). Headless frames now
  sit at the refresh floor (16.7 ms) and even the old code reaches ~17 ms headless without the clock, so
  **main-thread time** during the gesture is guarded too (slack 500 ms; it was ~the whole gesture before the fix and
  couldn't grow): the old code fails it (5 066 ms vs the 2 913 ms limit). New Windows baseline (mean of 3 runs): loads
  246 / 253 / 294 ms, scroll mean 16.7 / p95 16.8 ms / main thread 1 942 ms, switches 54 / 50 / 81 / 60 ms. Linux
  (CI, slower of two runs): loads 364 / 363 / 307, scroll 16.7 / 16.8, main thread 916 → baseline 1 100 (+20 % for
  runner variance), switches 32 / 32 / 50 / 35 ms.
- **League List wheel scroll** Nov 1 → December (~13 000 px) with Chromium's own wheel gesture
  (`Input.synthesizeScrollGesture`, mouse, 2400 px/s, ticks at the display rate): **mean frame 34 ms, p95 61 ms**
  (Windows; idle frames are 16.7 ms). Not guarded, printed: worst frame (77–580 ms between identical runs), long-task
  total (0–100 ms), main-thread time (≈ the gesture's whole duration, so it can't grow). So scrolling the list runs
  at ~30 fps in headless Chromium today: each scroll event re-renders every visible day — a candidate for a later
  speed-up. (First version stepped `page.mouse.wheel` + 16 ms waits: Playwright waits for each wheel event, so the
  frames just followed the ~45 ms step period; replaced.)
- **View switch** (click → next frame): League List → Calendar (week) 248 ms, → Team Calendar 44 ms, → Team List
  80 ms, → League List 110 ms.
- Baseline = mean of three measuring runs on the unchanged code before the split (loads 277–319 ms / 401–498 /
  259–315; scroll mean 32–38, p95 58–66; switches 212–276 / 35–48 / 65–87 / 77–125).

- **Split (step 1)**: checked as a pure reorganization by dumping every element's computed style (incl. ::before/::after) and box in 10 views × 4 widths from the old and new builds: 60 863 entries, 0 differences (only the enumeration order of custom properties changed). Screenshots differ by a few hundred channel values, the same as two runs of one build (raster noise). Perf after the split: loads 304 / 461 / 283 ms, scroll p95 56 ms (wheel-step method), switches 238 / 62 / 80 / 98 ms.
- **After step 2 (Today)**: loads 326 / 390 / 264 ms, scroll mean 34.7 / p95 67 ms, switches 238 / 48 / 81 / 93 ms.
- **After step 3 (scores)**: loads 264 / 402 / 304 ms, scroll mean 32.8 / p95 57 ms, switches 230 / 41 / 85 / 94 ms.
- **After step 4 (freshness)**: loads 245 / 387 / 274 ms, scroll mean 28.7 / p95 51 ms, switches 227 / 36 / 63 / 85 ms.
- **After steps 5–6** (no app code changed): loads 236 / 447 / 272 ms, scroll mean 29.4 / p95 54 ms, switches 213 / 64 /
  66 / 100 ms. All within the limits; every number is in the run-to-run spread of the baseline.

## Decisions
- **Stack**: Vite + React + TypeScript, Vitest, Playwright — same as rotationkit.
- **Shared module** `src/shared/nba-schedule/` copied unchanged from rotationkit (see its `SOURCE.md`; the
  header note is a separate file so the copied files stay byte-identical). Its own tests run here.
  **Drift check** (2026-10-23): `npm run check-shared` (`scripts/check-shared.ts`) compares git blob ids — ours at HEAD
  (`git ls-tree`) with rotationkit's default branch through `gh api …/contents` (`--ref` for another branch;
  `--local <dir>` or, without gh access, ~/rotationkit-src via `git hash-object`, which applies git's CRLF → LF so a
  Windows checkout compares correctly). Exit 1 lists each changed / missing / extra file. **Local only, not CI**: the
  repo's `GITHUB_TOKEN` can't read the private rotationkit repo; CI would need a new secret (a read-only token),
  which needs Alex's OK. Result 2026-10-24: identical (7 files) to rotationkit `main` 933fa0b and to the SOURCE.md
  branch (5eb9bf7) — rotationkit's main now has the folder too.
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

- **Today button** (2026-10-23, `TodayButton` in `PeriodNav.tsx`): right after the › arrow, 36 px like the
  arrows, disabled (35 %) when already there. League List → the default day (same rule as on load, then the list's
  nearest day when filtered), disabled while that day is at the top; League Calendar → the week of the default day
  (1 and 2 weeks; count grid → its month); Team Calendar → the current month (clamped into the season's months);
  Team List (no arrows there; the button stands alone in the top bar) → scrolls the next game not over back to the
  top (`TeamListView` `handle.toNext`, `onAtNext` re-enables it once scrolled away). Jumps, never smooth-scrolls:
  click → next frame 49–68 ms in the League List (e2e). **Left out on phones** (desktop only; the phone top bar is
  full). Top bar: still one row at 1920 px (≥ 290 px spare in every view); at 1280 px the league views already took
  two rows before it; the Team List still fits one row (28 px spare).

### Data freshness (2026-10-23)
- **"Data updated Oct 23, 08:29"** (`DataStamp` in `CalendarView.tsx`, prop `updatedAt`): the feed's own
  `meta.time` (kept by `load.ts` as `CalendarData.updatedAt`; the shared module drops `meta`), in the viewer's
  zone, 24-hour like the tip-off times. 11 px muted, **stacked under the time-zone note** (right-aligned) rather than
  beside it: the stack fits the 36 px bar, so the top bar keeps its width and stays one row at 1920 px (and the Team
  List at 1280 px, which had 28 px to spare). Desktop/tablet only; phones keep the "i" note.
- **Older than 36 h** (`STALE_AFTER_MS`, against the live clock): orange (`--ck-b2b`) with the tooltip "Data is
  more than 36 hours old: the daily update may have failed." (focusable).
- **Load error**: the message now has a **Try again** button (`App.tsx`); the loader already forgets a failed load,
  so the retry fetches again.

### Final scores everywhere (2026-10-23)
- Games with status **final** in the snapshot show their score in every view; games that are over but not final in
  the snapshot look as before. Same look everywhere: winner's score and tricode bright and bold (700), loser's muted
  (score 500 muted; tricode muted). The Team List's loser tricode is now muted too (it had only the score muted) so
  all views read the same. **Desktop/tablet only** for the League List and Team Calendar (`GameCard scores`); phone
  rows and cells are unchanged (the Team List keeps its scores on phones, as before).
- **League List**: "BOS 113 @ DET 121" (score after each tricode, before a B2B badge); aria-label adds "final BOS 113,
  DET 121".
- **Team Calendar**: "BOS 113 @ DET 121" in the cell; the tip-off time stays (only phone *list* rows drop it). The
  scale probe is now a final game with 3-digit scores (188–186). **Scale at 1920 × 1080: 1.3 before, 1.3 after**
  (1280 × 900: 1 → 1). Every final cell of every team is checked unclipped in e2e.
- **Week view, 2 weeks**: on final lines the score **replaces the logo in its 16 px slot** ("113 BOS @ 121 DET"),
  right-aligned against the tricode, and the TV pill is dropped (its column stays, so the "@" column stays straight;
  e2e checks one x per day column). Score font: the largest 0.1 px step that fits — 3 tabular digits measure 1.94 em
  in the bundled Inter at weight 500–700 (15.52 px at 8 px; 8.5 px → 16.50 px is too wide), so **8.2 px** (15.91 px;
  measured in Chromium 15.95 of 16.00 px). Tricodes and upcoming lines unchanged (119 px line, 2 columns at 1920 px).
  Winner tricode bold: widest bold tricode MEM 27.19 px < its 28 px column.
- **Week view, 1 week**: the option "logos + scores" was checked against the rule: with each score after its tricode
  at the tricode's 11 px (21.34 px) + 1 px gap, the line is 163.7 px at scale 1, and the 80 % width rule (199.5 px of a
  249.42 px cell) allows only **1.2 < 1.3**. So 1-week mode uses the **logo-slot layout** too, at scale 1.5 (score
  12.3 px, 23.92 of a 24 px slot); the scale stays 1.5 at 1920 × 1080 (1.05 at 1280 × 900).
- **Score font per slot** (`scoreFontFor`, fix 2026-10-24): CI (Linux) failed the "score fits its slot" e2e at 1280 px:
  Linux Chromium rounds each digit's width to whole pixels (measured 8.2 px → 15.00 px, 8.61 px → **18.00 px**,
  12.3 px → 24.00 px), so the plain scaled font (8.2 × 1.05 = 8.61 px) overflowed the 16.8 px slot by 1.2 px there
  (Windows: 16.72 px, fit). The font is now the largest 0.1 px step that fits both exactly and with digits rounded
  (0.1 px margin): 16 px → 8.2, 16.8 px → 8.3, 24 px → 12.3.
- Copy as image includes the scores (same components); checked pixel by pixel.

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

### Round 3 (2026-10-24)
- **Show rest days** (Team List, feature B): checkbox "Show rest days" in the top bar (Team List, desktop/tablet
  only; off by default; `rest=1` in the URL, kept across team changes — **round 7: on by default at every load, not in
  the URL, never stored**). On: one row per calendar day without a game
  of the team between its first and last game (`teamRestDays` in model.ts: ET game dates, all games — never the TV
  filter, so a day with a non-TV game is neither a row nor rest when filtered). Row: the game rows' date column and
  format + muted italic "Rest", 17 px tall (game rows 35–36.5 px). Toggling re-opens the list at the next game.
  Whole-list copy includes the rows. Top bar: the Team List at 1280 px now takes two rows (it had 28 px spare; the
  checkbox is 127 px), like the league views there; one row at 1920 px. Tests: `tests/rest.test.tsx`,
  `e2e/rest.spec.ts`, copy e2e (`view-team-list-rest.png`), URL in `app.test.tsx`.
- **Schedule fatigue** (feature D): `src/data/scheduleTags.ts` ports rotationkit's 3-in-4 (`scheduleTags.ts` at 5a531d5,
  chip/tooltip from `ScheduleChips.tsx` at 1401d85; origin noted in the file): a set = 3 consecutive team games whose
  first and last ET dates are ≤ 3 days apart; position 1st/2nd/3rd, a game in overlapping sets shows its highest and
  keeps all sets; unplayed games count; all the team's games, never the TV filter; cached per data set + team.
  **Whitelist check**: calendarkit's shown types (regular, cup-final, play-in, playoffs = ID prefixes 002/006/005/004)
  are exactly rotationkit's "everything but preseason 001 and All-Star 003" (tested on the fixture). Chip "3-in-4 ·
  2nd" in rotationkit's purple (#2a2140 / #c4b5fd / #4c3d75; 3rd #3a2160 / #e9d5ff / #7c4dcc); tooltip "3 games in 4
  days — set:" / "N sets:" then one line per set ("Oct 21, Oct 22, Oct 24 (3rd game)"; tooltips now honour line
  breaks, `white-space: pre-line`).
  - **Team List columns** (desktop: widget ≥ 1080 px; tablet and phone rows unchanged, B2B among the tags, no chips):
    after the time, a 156 px column with the team's B2B label (same label/tooltip) + 3-in-4 chip; after the matchup, a
    104 px column with the opponent's "2/2" (10 px, outlined, lighter orange; tooltip = the dot's) + the opponent's own
    3-in-4 chip (transparent, 10 px; tooltip prefixed "CHI: "). The B2B label left the tag area; the opponent dot and
    the left bracket stay. Rest rows have neither column.
  - **Fit — measured before changing anything** (every row of all 30 teams, 1920 px, Inter): widest team column 152.7
    px ("2/2 · AA ✈" + "3-in-4 · 3rd"), opponent 101.4 px, matchup 211.0 px ("GSW 108 vs MEM 111"), tags 239.7 px (DEN
    vs DAL Nov 24: "NBA Cup · West Group A" + "NBC · Peacock"), season line 110.6 px. In the 960 px column, 24 of 2 400
    rows wrapped (widest needed 981.5 of 935 px), and with scores the tag area moved by up to 76 px between rows. So,
    instead of shrinking any text: the matchup sits in a fixed 214 px slot (so the opponent column and tags start at
    one x with or without a score), and the **Team List column is 1080 px** (`TEAM_LIST_MAX_WIDTH`; League List stays
    960): a row needs 1055 px. Result at 1280 and 1920: 2 400 rows, 0 wrapped, 0 clipped, team tricode / opponent
    column / tags each at a single x, ≥ 16 px spare on the fullest row.
  - **Team Calendar**: the team's chip right after the B2B label in every cell (desktop/tablet; phones none). The probe
    now also holds "3-in-4 · 3rd": **scale at 1920 × 1080: 1.3 → 1.15** (the chip pushes the probe's tags onto one more
    row at 1.3); **1280 × 900: 1 → 0.8**. At 1280 even scale 1 no longer fit: CHI Jan 4, 2027 ("1/2 · AH" + "3-in-4 ·
    2nd" + "Peacock" + "NBC Sports Network") took 3 tag rows of a 115 px 6-week cell, the rows grew and the page
    scrolled 102 px (caught by the every-team × every-month e2e). The scale floor was 1 ("never below 1"); it is now
    `TEAM_SCALE_MIN` = 0.8, so the same probe rule decides at small windows too (text 12 → 9.6 px at 1280 × 900;
    fullest real cell then 81.5 of 101.5 px). Alternative if 0.8 reads too small: a shorter chip text in cells
    (e.g. "3in4·2nd", full text in the tooltip). Not in the league views.
  - Tests: `tests/scheduleTags.test.ts` (rotationkit's cases + all 30 teams vs an independent count),
    `tests/fatigue.test.tsx` (LAL/BOS/NYK every row: both columns' labels, no B2B in tags, dot kept, tooltips list
    every set, rest rows, TV filter, narrow widths, calendar chip for every LAL month, probe), `e2e/fatigue.spec.ts`
    (all 30 teams at 1280/1920: fixed x, left-aligned, one line, nothing clipped; tooltips hover + focus), copy e2e
    (`tif` regions must be purple; opponent 2/2 orange).
- **Team Calendar 1 week | 2 weeks | Month** (feature C): segmented control "1 week | 2 weeks | Month" (Team →
  Calendar, desktop/tablet; phones keep the month) — state `teamSpan`, URL `span=1w|2w` (none = Month, so old links
  open Month), kept across teams and List ↔ Calendar. `TeamMonthGrid` takes `weeks` + `start` (a Sunday) and renders
  1 or 2 Sun–Sat rows with the same cells (empty cells = rest days; the 1st of a month reads "Nov 1"), same B2B bar
  rules (full bar inside a row, Sat → Sun halves on consecutive rows, a half with an arrow toward a night outside the
  shown weeks). Month → weeks: the week of today if today is in the shown month, else the week of the month's 1st;
  weeks → Month: the month of the first shown day; 1 ↔ 2 weeks keeps the first day; prev/next ±1/2 weeks, disabled
  at the season's ends; Today → the current week (clamped to the season); picking a team → the week of its next game
  (as Month does with its month). Title like the league week view ("Oct 25 – 31, 2026").
  - **Scale** (same probe, measured on the shown cells; cap `TEAM_WEEK_SCALE_MAX` = 3): **1920 × 1080: 1 week 2.0, 2
    weeks 2.0** (cells 259 × 913 / 259 × 455 px; bound by width: "Peacock · NBC Sports Network" pills and "BOS 188 @
    DET 186" can't grow past the 259 px cell); **1280 × 900: 1.3 and 1.3** (173 × 583 / 173 × 290 px). No page
    scroll, nothing clipped (e2e walks every week of BOS, LAL, ORL in both modes at both sizes).
  - Tests: `tests/teamweeks.test.tsx` (control, URL, phones, start-week rule, prev/next/ends, Today, Month ↔ weeks,
    every game in its cell for every week of BOS and LAL in both modes, B2B full/Sat→Sun/edge halves, TV filter),
    `e2e/teamweeks.spec.ts`, copy e2e (`view-team-calendar-1w/2w.png`, `day-team-calendar-1w/2w.png`).
- **Marquee select** (feature A): ported from Boardkit (`useMarqueeSelection.ts`, `SelectionBar.tsx`) into
  `src/components/selection.ts` (store + hook), `SelectionBar.tsx` (bar + highlight) and `SelectionCapture.tsx` (the
  image). Desktop/tablet, mouse only (touch keeps scrolling), in every view with games (Team List, League List, Team
  Calendar in month / 1 week / 2 weeks, league week view in 1 / 2 weeks). Items are games only (`[data-game-id]`:
  list rows, week-view lines, the game in a team calendar cell) — never days or rest rows. A drag past 4 px starts
  anywhere in the content (rows included) except controls (buttons, links, inputs, tabs, the picker, the top bar);
  a plain click clears, Shift adds, Escape and ✕ clear, Ctrl+C copies. Changing view, team, month/week, span or a
  toggle clears (scrolling the League List doesn't).
  - **Smoothness**: the box is drawn by writing its style; one update per animation frame (auto-scroll, hit-test reads,
    then box writes); the selected ids live in a small store (`useSyncExternalStore`) that ignores unchanged sets, so
    selecting re-renders only a generated `<style>` (accent outline + tint per selected id) and the bar — never a view
    or card. Measured (perf project, 1920 × 1080, headless): box across the busiest 2 weeks of the week view (91 games
    selected) mean frame 16.3 ms, p95 22 ms, **0 ms long tasks**; Team List drag with auto-scroll (63 rows) mean 16.1
    ms, p95 21 ms, 0 ms long tasks. Guarded: p95 ≤ 34 ms, long tasks ≤ 100 ms.
  - **Auto-scroll**: within 48 px of a scrolling list's top/bottom the list scrolls (up to 28 px per frame). The box's
    start stays on the content it was pressed on: it follows the pressed element (the League List's virtualizer moves
    scrollTop by itself to keep its top day in place, so scrollTop alone drifted — found by e2e), and the scroll offset
    once that element is unmounted. Rows scrolled past keep their last measured rect, so they stay selected. Wheel
    scrolling mid-drag re-runs the hit-test. Found by e2e: a press on a logo started Chromium's native image drag and
    cancelled the box — logos are now `-webkit-user-drag: none` and `dragstart` is blocked during a gesture.
  - **Image**: same renderer as every copy (html-to-image, ratio 4 with the 16 000 px cap, dark opaque background,
    copy buttons excluded, wrap slack), off-screen via `CaptureStage`, caption line (title, period for calendars, TV
    filter, time zone) + the team header in team views. Lists: the selected rows stacked (League List under each
    game's day header; Team List rows carry their date, no headers; the B2B bracket only when both nights are selected,
    `GameCard bracketNights`). Calendars: each day with selected games as its cell (same card / same week-view lines at
    the on-screen scale, time groups), header "Fri 23 Oct · 2 games", days stacked in order, no empty cells; 360 px
    wide minimum for the caption. No highlight, bar or hover buttons in the image.
  - Tests: `tests/selection.test.tsx` (store notifications and re-renders, hit-testing incl. scroller clipping,
    remembered rows, probe and rest rows excluded, threshold, Shift, click, controls, touch, clearing in CalendarView),
    `e2e/selection.spec.ts` (1280 + 1920: every view, exact set vs rects, Shift, click/Escape/✕, auto-scroll beyond
    the first screen + wheel mid-drag, every clearing change, Copy and Ctrl+C), copy e2e (images read back for all 7
    view/span combinations: only the selected ids in order, same text, day headers, logo counts, size × ratio, dark
    corners, logo pixels; Team List bracket rule; PNGs `test-output/copy-images/selection-*.png`), perf (above).
- **Fixes after the round-3 push (2026-10-28)**: (1) CI on the marquee commit failed 4 older tests that assumed the
  early-season data (League List matchup text without the per-team "B2B" badge; the week of Oct 18 having unplayed
  games with logos; the season's first week having a logo) — they now hold whatever the snapshot date. (2) The copy
  read-backs for round 3's images now also run at 1280 × 900 (they ran at 1920 only), and found a real bug: at 1280 the
  Team Calendar scale is 0.8, html-to-image gives each cloned card its computed height, and under a zoom below 1 that
  height was too small, so the card's column wrapped and its tags came out beside the matchup, clipped by the cell
  (whole view, day and selection copies). Fix: calendar cards never wrap into a second column (`flex-wrap: nowrap`);
  no on-screen change (the e2e cell walks pass unchanged). The 1280 whole-view copy test fails without the fix.

### Round 4 (2026-10-28)
- **Perf checks added first** (`e2e/perf.spec.ts`, before any round-4 change): **Team List wheel scroll** (LAL, 2400 px
  down and back up with Chromium's wheel gesture; frame mean / p95 and main-thread time, same limits as the League
  List scroll). Windows baseline from the unchanged code: mean 16.7, p95 16.8, main thread 575–744 ms → 660. The view
  switch test now has one uncounted warm-up round: on unchanged code its first full run failed twice (League Calendar
  117 ms, Team Calendar 105 ms vs 38–84 / 63–72 ms when warm). No baseline was raised.
- **Overtime marker** (item 1): `overtime(g)` in model.ts reads "OT" / "2OT" / "3OT" from a final game's status text
  ("Final/OT"; 7 games in the snapshot of Oct 28, all others "Final"). A small muted marker (0.75 em, 600) after the
  last score in the League List, Team List and Team Calendar; aria-labels end "(OT)". **Week view**: in the TV column,
  which final lines leave empty, at the TV pill's text size — "2OT" 14.9 of 15 px, "3OT" 15.0 (letter-spacing −0.03 em) —
  so the line keeps its 119 px. Copies use the same components.
  - **Measured first** (1920 px): League List widest row 487 of 960 px → fits. Team Calendar: the probe now ends "3OT";
    scale unchanged (1920 × 1080: month 1.15, weeks 2.0 / 2.0; 1280 × 900: 0.8, 1.3 / 1.3). **Team List**: the matchup
    slot was 214 px, the widest possible matchup 211.5 px, + " OT" 235.8 px, + " 2OT" 242.5 px, and the fullest row had
    ~15 px spare → no room. Alex chose to widen: **Team List column 1080 → 1110 px, slot 214 → 244 px** (worst case
    written into a real row in e2e: "MEM 188 vs MEM 188 3OT" 237.8 of 244 px). Still fits at 1280 (1248 px content).
  - Perf: the Team List scroll's main-thread time looked higher after the widening (852–887 vs ~660 ms, 4 runs each),
    but an interleaved A/B on one build (CSS width override, 5 rounds) showed noise only: medians 1080 → 659–707 ms,
    1092 → 679, 1100 → 783, 1110 → 696, 1120 → 543, 1152 → 663. Not a regression.
  - Tests: `tests/overtime.test.tsx` (4 of 5 fail before; the 5th checks the snapshot's status texts), e2e
    `scores.spec.ts` "overtime marker" (League List / Team List one line, worst case in the slot, week-view TV column)
    + the Team Calendar text check now expects the marker; `features.spec.ts` cap 1110. All fail on the old build.

- **Scores next to each other, logos mirrored** (item 2): `[logo] BOS 113 @ 121 DET [logo]` — away tricode, away
  score, "@", home score, home tricode, home logo on the outside; team views keep the selected team first ("BOS 113 vs
  121 CHI"). League List, Team List (incl. tablet and phone), Team Calendar; winner bright/bold, loser muted as before.
  - **Fixed slots** (League List desktop + tablet; Team List desktop with its fatigue columns): tricode 2.6 em (MEM
    35.8 px at 14 px), score 2 em (3 bold tabular digits 27.2 px — measured in the app; a first try at 1.6 em let the
    digits spill out), "@"/"vs" 1.3 em, an empty score slot on games without a score. So logos, tricodes and "@" are at
    one x on every row of a day / of the Team List, played or not (e2e: 6 days × 4 widths; all 30 teams). Elsewhere
    (phone rows, calendar cells) the parts take their natural width; each side still wraps as one unit in cells.
  - **League "B2B" badges** moved out of the matchup into the tags ("B2B · BOS"; "B2B" on phones) — item 6 replaces
    them with tricode marks.
  - **Measured**: League List widest row 565.6 of 960 px (tablet 736). Team List worst case written into a row
    ("MEM 188 vs 188 MEM [logo] 3OT", both bold) 235.3 of the 244 px slot. Row heights old vs new, 5 061 rows (League
    List every 4th day, 6 Team Lists; phone/tablet/1280): none grew; 9 phone League rows with a B2B badge went 49 →
    47.5 px. One phone row (Cup Final "TBD @ TBD") first grew 28.5 → 47.5 px (the team rows' 1.3 em "@" width) — fixed.
  - Perf (Windows): League scroll mean 17.0 / p95 16.8 / main 2 214 ms, Team List scroll main 808 ms, switches 46–79 ms;
    all within limits.
  - Tests: `tests/mirror.test.tsx` (part order + slots per view and width; 4/4 fail before), 8 matchup-text tests
    updated (12 fail before), e2e `mirror.spec.ts` (League List at every width: one x per part, one line, text inside
    its slot), `fatigue.spec.ts` (logos, "vs", opponent tricode at one x over 2 400 rows), `scores.spec.ts` texts.

- **B2B in yellow** (item 3): `--ck-b2b` #e08a3c (orange) → **#f5e042** (lemon, hue 53°; the Cup gold #d9a521 is 43° and
  darker, so the two stay apart). Contrast 14.1:1 on the background, 13.0 on the cards, 11.7 on surface-2 (orange was
  7.1); the solid 2/2 label's text #1f1a02 on yellow 12.9:1. Everywhere B2B shows: League List tags, week-view dot, Team
  List labels + bracket + opponent dot + "2/2", Team Calendar bars + arrows. The stale data stamp has its own
  `--ck-stale` (#e08a3c, still orange). Tests: `e2e/b2b-color.spec.ts` (computed colours of every B2B mark + the
  stale stamp), bracket colour in `features.spec.ts`, copy read-backs check yellow (R ≈ G ≫ B) instead of orange —
  all three fail on the old build.
  - **Perf flake** (not from this change): the view-switch guard failed once in the full run (Team Calendar 109 > 90 ms)
    and once in 3 reruns (102). Interleaved A/B, pre-round-4 build vs this one, 14 runs each: Team Calendar 55–101 vs
    47–87 ms, Team List 57–93 vs 65–122, League Calendar 51–80 vs 44–86 — the old code shows the same outliers. The next
    full perf run passed (76 ms). Baselines unchanged. Linux Team List scroll baseline added from CI (main thread 131 ms
    → 160 with the usual +20 % for runner variance).

- **Team Calendar text at 1280 px** (item 4): calendar cells (month, 1 and 2 weeks, desktop/tablet; selection images
  too) show the short chip **"3in4·2nd"** and, Alex's pick after measuring, one green **"TV" pill** with the network
  names in its tooltip/aria-label (like the week view). The Team List keeps "3-in-4 · 2nd" and the names; phones keep
  the dot. The probe holds both ("3in4·3rd", "TV").
  - **Result**: 1920 × 1080 month **1.15 → 1.2**, weeks 2.0 → **2.05**; **1280 × 900 month stays 0.8**, weeks 1.3. The
    target (≥ 1 at 1280) is **not reachable** without removing more from month cells — measured at 1280 (6-week cell
    112 px, room 72 px by the 90 % rule, cell 163 px wide): the worst cell is 93 px at scale 1 because a played game's
    score line with wide tricodes ("MEM 188 vs 186 MEM" + 2 logos ≈ 170 px) is wider than the cell and wraps; without
    OT 93, without logos 87, without logos and OT 74. The fullest real cell (ATL Feb 8, 2027: "2/2 · HH", chip,
    "Peacock", "NBC Sports Network") was 97.5 px at scale 1 with the names, 75 with "NBCSN", 52.5 with the pill. A
    probe built from the real schedule (heaviest tag sets + worst-case score line) was tried: same 0.8 / 1.2, so the
    worst-case probe stays.
  - Tests: fatigue.test (cell chip text + tooltip, probe chip), scale.test (TV pill + tooltip in every LAL November TV
    cell), e2e `calendar-cells.spec.ts` (pill/chip tooltips, Team List unchanged), Team Calendar walk: 1920 scale ≥ 1.2.
    All fail on the old build.

- **Records going in, League List** (item 5): `leagueRecords(data)` (model.ts) = the Team List season line's rule
  (teamSeason) for all 30 teams, gameId → team → W-L, **computed once per data set** (WeakMap). Each row: "3-1 [logo] BOS
  113 @ 121 DET [logo] 2-2" — 11 px muted tabular, on the outside of each logo, in 3.3 em slots ("41-41" is 35.6 px) so
  the logos keep one x; empty slot when unknown (after the team's first non-final regular-season game) or not a
  regular-season game. aria-label ends ", records going in BOS 3-1, DET 2-2". Desktop/tablet; phones none.
  - **Measured first** (every 3rd day of the season): widest row 652.8 px with records (was 565.6) of 960 px at 1920 and
    721 px at 768 → no wrap. Row heights old vs new, 5 061 rows at 390/768/1280: 0 changed.
  - Perf: the full run's League scroll main thread 2 295 ms (pre-round runs 2 003–2 242). A 2-way A/B suggested +17 %,
    but a 5-way interleaved A/B of the builds (pre-round, items 1, 2, 4, this) gave medians 2 488 / 2 361 / 2 249 /
    2 363 / 2 238 ms — noise (±20 % between identical runs), no regression.
  - Tests: `tests/records.test.tsx` (model vs an independent count over the real feed + synthetic W/L/unknown/Cup Final;
    rows at desktop and tablet incl. aria-label; phones none — 3 of 4 fail before), e2e `mirror.spec.ts` (record
    slots at one x, "41-41" fits). Matchup-text tests strip or include the records.
  - The OT marker now sits after the home record ("… DET [logo] 2-2 OT").

- **Fatigue on the tricode, league views** (item 6): `src/data/fatigue.ts` `leagueFatigue(data)` — for every game and both
  teams: back-to-back nights (teamB2BPairs), plane on a metro change, 3-in-4 (teamThreeInFour) and a tooltip; **once per
  data set** (WeakMap). `FatigueMark` draws it on the tricode in the week view and the League List (phones too, same
  component): **yellow fill** (dark text) = 2nd night, **yellow 1 px outline** = 1st night, **small plane** over the
  top-right corner = metro change (same rule as the team views), **purple underline** (2 px; the chips' #4c3d75, the 3rd
  game #7c4dcc) = in a 3-in-4 set. Replaces the week view's B2B dot and the League List's "B2B" badge. Tooltip (hover
  and focus, every tricode focusable) for that team: "BOS — 2/2 · HA (2nd night of a back-to-back)", both games with
  dates, opponents and home/away, "Travels Boston → Los Angeles", every 3-in-4 set (the chip's tooltip), "Record going
  in: 3-1"; "BOS — rested" when there's nothing. Legend under the week grid and the League List: "■ 2nd night · ▢ 1st
  night · ✈ changed cities · 3-in-4" (22 px, taken out of the 1-week scale's cell height).
  - **No width**: background, outline and text-decoration only, the plane absolutely placed. e2e at 1280/1920: 2-week
    lines stay 119.00 px, no line or tricode column overflows, the plane overlaps no "@", TV pill or other tricode
    (212 marks in the 2 weeks of Jan 3, 2027; 108 in 1 week; 96–120 in the League List of Jan 7). Row heights,
    5 061 rows: none grew; 332 per width got 1.5 px shorter (36.5 → 35: the "B2B" pill is gone).
  - **Busy?** The busiest days have no 1st nights (on Nov 2 and Dec 23, 15 games, every team plays and nobody plays the
    next day: 8 / 6 fills, 0 outlines). Most marks: Jan 7, 2027 (12 games: 10 outlines, 5 fills, 13 underlines, 8
    planes) — screenshots in test-output/round4-shots/ (item6-*.png). Busy but each tricode stays readable.
  - **Perf**: the first version (1 px box-shadow rings, drop-shadow on the plane) cost the League List scroll ~9 % more
    main-thread time (interleaved A/B, 14 runs: item 5 2 360, it 2 575 ms; frames unchanged at 16.7 ms); with CSS
    stripped it was back to item 5, so it was paint. **Outlines instead of box-shadows, no filter: 2 389 ms (+1 %)**.
    Load: `leagueFatigue` runs on the first League List / week view render (load-league-list 264 ms vs 226–240).
    Marquee drag (Team List) p95 25 vs 23 ms pre-round, occasional long tasks in both (pre-round once 122 ms) — the
    guard flaked once (113 ms) and passed on rerun.
  - Tests: `tests/leaguefatigue.test.tsx` (model vs an independent count over every team's games incl. plane by metro and
    3-in-4; marks + tooltip on every line of two weeks and every League List row; legend; none in team views),
    week.test / card.test updated (fill/ring instead of dot/badge), e2e `league-fatigue.spec.ts` (geometry, colours,
    tooltip hover + focus, legend in the window), b2b-color + copy read-backs (fill and ring yellow in the images).

- **Week view redesign, aligned rows** (item 7): line = `[logo] AWAY · score · @ · score · HOME [logo] · TV` in fixed
  grid columns (MONTH_LINE: logo 16 · 1 · tricode 28 · 2 · score 16 · "@" 12 · score 16 · 2 · tricode 28 · 1 · logo 16 · 2 ·
  TV 15 = **155 px**, was 119). Logos always shown (on the outside), each score in its own slot against the "@" (empty
  before the game; 8.2 px, scoreFontFor), tricodes against their logos — so logos, tricodes, scores and "@" are at one
  x down every day (e2e walks every week of the season, 1 and 2 weeks, at 1280 and 1920). Fatigue marks on the
  tricodes (item 6), OT in the TV column of final lines (item 1). Day header, count, header → list, TV filter, copy,
  marquee unchanged.
  - **Measured first, then Alex's choice**: with the time on every line (9 px, "00:00 (+1)" 38.3 px) the line would be
    191 px: 2 columns at 1920 need 390 of 249.4 px; it doesn't fit a 1280 cell (164.9 px) at all; 1-week zoom 1920
    1.5 → 1.0. Alex picked **"no per-line time"**: the small time-group labels stay (10 px, muted), the rest is aligned.
  - **Result**: one column of games per day in both modes (`monthColumns` → 1 up to a ~2600 px widget; `flowDay` kept
    for wider). **1-week zoom: 1920 × 1080 1.5 → 1.25** (line 193.75 px, logos 20 px, tricodes 13.75 px), 1280 × 900 1.05
    → 1.0. **Week view cutoff 887 → 1179 px widget** (window ≈ 1226 px; 1280 windows keep the week view, tablets the count
    grid as before). Fit at 1920 × 1080: tallest day 561 px of a 978 px cell (1 week), 455 of 487 (2 weeks, Apr 4), no
    page scroll. At 1280 × 900: 1 week 455 of 760, no page scroll; **2 weeks: the page scrolls up to 164 px** (week of
    Nov 1: Nov 2's 15 games, 437 of 442 px, plus the 2nd row) — **already 106 / 70 / 142 px before round 4** (2-week mode
    was one column there too), +22 px since item 6's legend. Not fixed: needs a decision (e.g. 2-week mode only from
    ~1400 px, or a smaller row there).
  - Perf: load-week-view 242 ms, marquee across the busiest 2 weeks p95 18 ms (102 games selected now: one column).
  - Tests updated (fail on the old build by construction: 155 px, 1179, 1 column): week.test (line parts, columns,
    cutoff, flowDay as a pure function), scale.test (1.25, 155, --ck-score), scores.test (logos + score slots), views /
    lists tests use a 1280 widget for the week view; e2e features (fit walk at 1280 and 1920 with straight columns,
    cutoff), smoke, scores, copy (empty score slots aren't text; 2 logos per line), league-fatigue (155 px).

- **Compact week strip, both lists** (item 8): `WeekStrip` — fixed Sun–Sat week (never recenters), no boxes: small
  "Sun Nov" over a 16 px "15", a small line under it, the selected day in a filled pill (accent ring), today's number in
  blue, ‹ › on the sides. **42.6 px** tall (the boxed strip was 61 px + 12 px margin). League List: the day's game count
  (TV filter respected); ‹ › = the first game day of the previous / next week with games. **Team List** (desktop/tablet):
  the same strip with the opponent under each date ("@ PHX" / "vs CHA"), days without a row dimmed and disabled (rest days
  enabled with "Show rest days"), a click scrolls that row to the top, ‹ › = previous / next week with a game; a **date
  title** in the top bar ("Sunday, November 15, 2026") left of Today. Top bar still one row at 1920 (Team List had ~500
  px spare). Room after the last row so every row can reach the top (as in the League List; not in copies).
  - **Following the scroll without re-rendering rows**: row tops measured after layout (and again when the row list
    resizes — the font arriving moved them), the row at the top found by binary search in a frame callback, its date
    written to a `ValueStore` (`valueStore.ts`, like selection.ts). Only the title and the strip read it: the strip
    re-renders when the week changes, within a week only the old and new selected day. The Today button's "at the next
    game" state moved to a store too (scrolling away used to re-render the view and every row once).
  - **Perf, measured step by step** (Team List wheel gesture, interleaved A/B vs item 7, main-thread time medians): first
    version (strip re-rendered on every row change) **1 001 vs 506 ms**; trace: paint 0 → 279 ms, layout 0 → 88, JS 29 →
    151. Then: per-day selection (StoreDays) + `contain: layout paint` and own layers for the strip and title → paint 71,
    layout 39, JS 63; still ~1.8× by TaskDuration (every change = a main-thread frame + commit during an otherwise
    compositor-only scroll). **Final: the title and strip follow at most every 120 ms (`FOLLOW_MS`) plus once when the
    list stops** → **516 vs 446 ms (+16 %)**, frames unchanged (mean 16.7, p95 16.8). Full run: team-scroll main thread
    742 ms (baseline 660, limit 1 160). Rows untouched while scrolling (e2e MutationObserver: 0 mutations).
  - Tests: `tests/strip.test.tsx` (both strips, counts with the TV filter, no recentering, ‹ ›, Team List title/strip on
    the top row with a faked layout, day click, rest days, no tip-off formatted on a scroll, phones none — 6 of 7 fail
    before), scroll-cost (the memo'd strip formats nothing on a scroll), e2e `strip.spec.ts` (strip height, wheel
    follow, 0 row mutations, day click → row at top, ‹ ›, Today, top bar one row at 1920).

- **Date picker in both lists** (item 9): a calendar icon (`DatePickButton`, 36 px like the arrows) right after the date
  title opens `DatePicker` — the month popup (`MonthNavigator`, as in the week view's picker), rendered only while open.
  ‹ › months; League List: game count per day (TV filter), days without games disabled, a day → the list there; Team
  List: game days show the opponent ("@ PHX", 10 px), a day without a game → the next game (none after the last),
  through `TeamListHandle.toDate` (the row of that date or the next row). **Keyboard**: the shown day is focused, ← → a
  day, ↑ ↓ a week (skipping days that can't be picked, turning the month), Enter picks, Escape closes with the focus back
  on the icon; a click outside closes. The arrows are new in `MonthNavigator` (the week picker had Escape/Tab only), so
  the narrow count grid and the week picker get them too. Desktop/tablet (the phone top bar is full). Top bar still one
  row at 1920. Closes when the view, layout or team changes.
  - Tests: `tests/datepicker.test.tsx` (icon next to the title, popup only while open, counts with the TV filter, a pick
    jumps, months, keyboard incl. into the next month, Escape → focus; Team List opponents, game day → its row, day
    without a game → next game — 3/3 fail before), e2e `datepicker.spec.ts` (real keyboard, popup inside the window,
    top bar). Perf unchanged (popup not rendered while closed).
  - Gotcha: the Vite dev server kept serving an old period-nav.css after an append (nested @import cache); touching
    calendar.css fixed it. The builds were never affected.

- **Active day highlighted** (item 10): the strip's selected day — League List: its header in the accent and a faint
  accent band with a 2 px accent bar over its rows; Team List: over that day's row. A class (`ACTIVE_DAY`) on the old /
  new day only plus two overlay layers in the scroller (`ActiveHighlight.tsx`) that **crossfade** (opacity, 150 ms); the
  header gets an accent copy of its text (::after, active day only) that fades in. League List: written when the top
  day, the rendered days or their measured heights change (not per scroll event); Team List: on the store's change.
  **Never in images**: the band is outside the rows; `suspendForCapture` (copyAsImage.ts) lifts the class, transitions
  off, while html-to-image reads the node (e2e: 0 accent pixels in a copied active day; 1 622 + 5/5 bars without it).
  - **Perf, measured**: the first version faded the rows' own background + box-shadow (150 ms CSS transitions): League
    List scroll main thread **2 428 → 3 203 ms (+32 %)**, failing the guard (3 177 > 2 913); without transitions 2 494.
    Overlay crossfade: 2 684 (+13 %); then the effect only on changes and the header pseudo-element only on the active
    day: **2 727 (item 9) vs 2 620 ms** — no difference. Team List gesture 877 vs 937 ms (+7 %, within run noise). The
    League List scroll guard now runs with the highlight on and checks it followed the day at the top.
  - Tests: `tests/activeday.test.tsx` (class on the active day only, moves on a strip click / scroll, no row re-render,
    suspendForCapture), e2e `activeday.spec.ts` (band over the rows, accent header, fades 0.15 s, follows the wheel in
    both lists), copy e2e (no highlight in the image), strip.spec ignores the class moving between rows.
  - Flake seen once: lists.spec "continuous days" (desktop-xl) found no card below the top at one step; 6/6 on rerun.

- **Countdown on today's games** (item 11): a game of today (viewer's zone) before tip-off shows **"in 2h 35m"** ("in 2h",
  "in 35m", minutes rounded up) in the accent in place of its time, League List and Team List (phones too); the time
  again once it has started. Same size as the time: the widest, "in 23h 59m", is 66.1 px of the 77 px time column, so
  rows keep their width. **One clock per widget** (`clock.ts`, `useClock`): a ValueStore set at load and at every
  minute boundary (re-armed from the time itself), read by `TipTime` through context — a tick re-renders the countdown
  texts only. The view's `now` is now the time it opened: before, a 60 s `useNow` re-rendered the whole view (every
  visible day and row) every minute; today's date (strip, week view) and the stale-data stamp read the clock instead
  (the view re-renders at midnight only). Images keep the plain time: it stays in the DOM, hidden, and
  `.ck-capturing` (set by suspendForCapture) shows it and hides the countdown. `CLOCK_TICK_EVENT` lets a test tick now.
  - **Perf check added**: the League List wheel gesture from Nov 15 with countdowns on screen, the clock moved a minute
    and ticked after every piece. Playwright's fixed clock alone puts the frame p95 at ~33 ms (with ticks off: 34; on: 32),
    so it has its own baseline from the build before the countdown with the identical gesture (8 interleaved runs:
    p95 33.0 / mean 17.4 / main thread 1 819 ms; with the countdown 34.0 / 17.7 / 1 797). Linux baseline still to add
    from CI.
  - Tests: `tests/countdown.test.tsx` (labels; both lists; one minute-aligned timer; a tick formats no row time;
    capture class), e2e `countdown.spec.ts` (fits and one line, runFor 60 s → every countdown a minute shorter and
    nothing else in the list changed, time back after tip-off, the copy is made with the countdown hidden).
- **Hang (2026-10-29)**: a perf run piped into `grep` never returned (7 h, killed by Alex). Rerun alone with output to a
  file: exit 0 in 41 s; nothing of Playwright's left running afterwards — the cause couldn't be established (the tests
  had printed their results; a process outliving Playwright and holding the pipe open would explain it, unproven). Since:
  `globalTimeout` 15 min (top-level only in Playwright; a full local run is ~5 min), perf project `timeout` 180 s, html
  reporter `open: 'never'`; every command wrapped in `timeout 300`, test output to a file, never piped into grep.

- **Link to the game's hoopsjunkie.io page** (item 12): injury report, win probability, box score. **URL verified on the
  live site** 2026-10-29 in Alex's Chrome (the app's own browser pane never got past hoopsjunkie's bot check, so it wasn't
  used): `https://hoopsjunkie.io/games/<NBA ET date>/<away>-vs-<home>`, lowercase tricodes. 9 played games (8 tipping
  after midnight UTC) and a future one (2026-11-15/lal-vs-phx) load; POR @ LAL, ET Oct 27, 03:00 UTC Oct 28 (00:00 in São
  Paulo, a "+1" game): `2026-10-27/por-vs-lal` loads, `2026-10-28/por-vs-lal` redirects to that day's scores — so the
  ET date (the feed's `dateEt`), never the viewer's. Tricode slugs GSW, NOP, SAS, BKN, NYK, UTA, PHX, OKC, MEM all match.
  - Widget API kept: a "↗" (`GameLinkButton`) raises `onOpenGameLink(gameId)`; the shell (`openGameLink` in App.tsx,
    `gameLinkUrl` in config.ts) opens it in a new tab, noopener. `HOOPSJUNKIE_BASE_URL` (empty = hidden), like
    rotationkit's. Undecided teams: no link. Where: League List and Team List rows (under the copy button, the corner it
    already covers), Team Calendar cells (left of the day's copy button), week-view lines (in the room right of the line,
    9 px — 9.9 px free at 1280). On hover / focus-within; the glyph is CSS content (no text in rows); never in images.
  - **Perf**: shown with opacity like the copy buttons, the hidden button on every game cost the League List scroll
    +15–18 % main thread (A/B vs item 11: 2 565 → 3 029 ms; with `display: none` forced 2 717). Now `display: none` until
    hover / focus-within: **2 692 vs 2 696 ms**. Keyboard: Tab to the row's copy button (a line's TV pill / mark) shows
    it, the next Tab reaches it.
  - Tests: `tests/gamelink.test.tsx` (URL rule incl. the after-midnight case and TBD, the shell opens with noopener, all
    four views raise the event and never call window.open, no link without a handler / for TBD; 6/6 fail before),
    e2e `gamelink.spec.ts` (hidden until hovered, inside its row / cell, covers no TV pill, tag, chip, mark or score
    beyond what the copy button already covers, a click opens the expected URL in a new tab; hoopsjunkie stubbed).
    League-fatigue and OT line checks measure the line's own parts (the "↗" hangs right of it on purpose).
  - Flaky (2nd time, item 10 too): lists.spec "continuous days" (tablet) found no card below the top at one step; 3/3 on
    rerun.

### Round 5 (2026-10-29)
- **Fatigue component** (item 1, v1.16.0): `src/components/Fatigue.tsx` + `styles/fatigue.css` — one component, `full`
  (12 px) and `compact` (≈ 0.72 × the week line's font) sizes: yellow **"B2B" badge**, the two nights as **house (home) /
  plane (away)** in time order (earlier night left; tonight solid, the other night faded via fill-opacity in the image),
  **"3in4" chip** (the chips' purples, 3rd game stronger). A grid of fixed tracks (`b n1 n2 c`, 8 em), so an empty
  component (team not on a B2B / 3-in-4) has the same width; `.ck-fx-mirror` swaps only the badge and chip tracks (badge
  next to the team's logo), never the night icons. Icons are CSS background images (data-URI SVG, fill #f5e042 = --ck-b2b),
  no SVG elements; at most 4 children. Tooltip = `leagueFatigue`'s text (leg, both games with opponents, travel, 3-in-4
  sets/game number, record) — details only.
  - **League List (desktop, widget ≥ 960 px)**: `[rec] [away fx] [logo AWAY score @ score HOME logo] [home fx] [rec]`
    (matchup now `.ck-rec`, `.ck-fx`, `.ck-teams`, `.ck-fx`, `.ck-rec`). Tablet/phone unchanged (tricode marks only). The
    tricode marks stay yellow, but lose their small plane where the component is shown (its plane means "away").
  - **Team List (desktop)**: the two fatigue columns hold the team's (mirrored) and the opponent's component (replaces the
    "1/2 · HA" label, "3-in-4 · 2nd" chips and the opponent's "2/2"); the bracket and the opponent's tricode dot stay.
    Tablet/phone keep the labels among the tags.
  - **Week view, 1 week**: a second row under each line where either team has fatigue — compact components, the away one
    starting under the away logo, the home one ending under the home logo (columns stay aligned). `busiestDayHeight`
    counts that row (`MONTH_LINE.fxRow` 11 + `fxGap` 1), so the **1-week scale at 1920 × 911 went 1.25 → 1.1** (1280 × 900
    stays 1.0, 1920 × 1080 stays 1.25). No component in 2-week mode (legend and tricode marks as before). There is no room
    for it inline: a 1280 cell is 164.9 px for a 155 px line.
  - Legend in the League List and 1-week view explains the component; 2-week keeps the old one.
  - Selection images (League List, 1-week view) draw the components too (`SelectionCapture`).
  - **Perf** (interleaved A/B, `test-output/m5/abn.mjs` / `abt.mjs` at 1920 × 911, base = v1.15.0 build): an SVG version
    with 9 elements per component measured League 1145 → 1873 ms in a 7-run A/B, but 2388 vs 2417 in a 12-run rerun
    (noise); the final grid/CSS-icon version: **League List 2703 → 2848 ms (+5 %), Team List 620 → 643 ms (+4 %)**, medians
    of 12 / 15 runs, inside the ±20 % run spread. Perf guard: frames p95 16.8 ms, League scroll main thread 2786 ms (limit
    2913).
  - **Copy**: League List week image 3936 × 10 064 px before and after (984 × 2516 CSS px × 4) — the stage width is the
    list's, not the content's; badges and chips are pixel-checked in the images (`copy.spec.ts`).
  - Tests: `tests/fatigue.test.tsx` (Team List: every row of LAL/BOS/NYK vs an independent calendar-day rule),
    `tests/leaguefatigue.test.tsx` (League List rows vs leagueFatigue, the HA case, 1-week rows), e2e
    `fatigue-component.spec.ts` (1920 × 911 and 1280 × 900: one x per column, same width empty or not, icon order, week
    rows under the logos, no page scroll; HA 2nd night MIA @ CHA Oct 24: faded house left of a solid plane). A team on an
    HA 2nd night is always the away team, so the home (mirrored) column is checked with AH 2nd night (WAS @ CHI) and HA
    1st night (CHI @ MIL); likewise HH only occurs in home columns and AA only in away columns.
- **Matchup = game link** (item 2, v1.17.0): round 4's hover "↗" (`GameLinkButton`, `.ck-open-link`) is gone. `MatchLink`
  (GameCard.tsx) wraps the teams + scores — League List / Team List rows (`.ck-teams`), Team Calendar cells (desktop), the
  week view's line (`.ck-mline`, a CSS subgrid over the line's columns 1–11, so alignment is unchanged) — in a real
  `<a href target="_blank" rel="noopener noreferrer" draggable=false>`; records, Fatigue components, OT and the copy button
  stay outside it. Widget API: `gameLink?: (game) => url | undefined` (was `onOpenGameLink(gameId)`); the shell passes
  `appGameLink` (App.tsx → `gameLinkUrl`, unchanged rule: feed `dateEt`, no link while a team is undecided). Styling:
  text colour as before, pointer + underline on hover, accent ring on keyboard focus; `.ck-capturing` drops underline
  and ring, so images never show link styling.
  - **Marquee vs click** (`selection.ts`): a press on a game link may start a box (other links/controls still can't);
    pointer capture is taken only once the press becomes a drag (4 px), so a plain click reaches the link; the click
    that ends a drag started on a link is swallowed (one click, listener removed after that task).
  - Headless Chromium opens no tab on a middle-click (not even for a bare `<a target="_blank">`) and not reliably on
    ctrl-click, so e2e checks those at the event level (a real middle / ctrl click on the `<a>`, the auxclick / click
    reaches the window uncancelled); click and Enter open the expected URL in a new tab.
  - Perf (A/B item 1 vs item 2, 1920 × 911): League List 2938 → 2767 ms (−6 %), Team List 231 → 262 ms (both builds swing
    between ~200 and ~800 ms run to run). Perf guard passed (League scroll main thread 2873 ms of the 2913 limit — the
    limit is close on this PC; frames unchanged).
  - Tests: `tests/gamelink.test.tsx` (an `<a>` with the URL in all four views, nothing hover-only, none for TBD / without
    gameLink), `tests/selection.test.tsx` (drag from a game link selects, its closing click is cancelled, a plain click
    isn't), e2e `gamelink.spec.ts` (all four views: href, idle vs hover look, capture class, click / Enter / middle /
    ctrl, Tab reaches the link and the copy button still copies, a drag from a link selects 3 rows and opens nothing).
- **Flaky "continuous days" test fixed** (item 3, test only): reproduced in a loop (`test-output/flaky/loop.sh`, all four
  projects per run): 1 failure in 30 runs (120 executions, phone), then 2 in 15 runs (180 executions; desktop and phone)
  with the step instrumented. **Cause: the test, not the app.** The "no jumps when scrolling up" step set `scrollTop` from
  2 % to 60 % of the list (≈ 27 000–33 000 px) and waited two animation frames; the virtualized list re-renders from the
  scroll event in a later task, and on a busy machine that hadn't happened yet — captured state: scrolled to 33 499 px
  while still rendering Oct 21–26 (the previous position), so no card was found. The week strip / active day were never
  involved (their assertions passed in every failing run), and the list caught up on the next steps. **Fix**: the test
  waits for the real condition — the rendered days cover the list's viewport (`covered()` in `e2e/lists.spec.ts`,
  checked every frame, 5 s cap with the rendered ranges in the error) — after each fast jump and each 200 px step; no
  retries, no longer sleeps. **After: 30 runs, 120/120 executions passed.** (A blank frame or two after a 30 000 px jump
  is how the virtualized list behaves; rendering synchronously in the scroll handler would cost every scroll frame.)
- **Two-week view fits the window** (item 4, v1.17.1): measured first over every two-week stretch: page scroll up to
  **164 px at 1280 × 900 and 115 px at 1920 × 911** (Alex's window too), on the stretches with Apr 4, 2027 (13 games in 10
  time groups: 425 px of lines + labels in a 460 px cell). Vertical space only, game text unchanged (tricodes 11 px,
  16 px lines/logos, scores): `TWO_WEEK_SPACING` (dayflow.ts) — gap between lines 3 → 2 px, between time groups 7 → 2,
  time label line 12.5 → 10 px (its 10 px font kept, `--ck-label-line`), label gap 2 → 1; 2-week cells padding 4 → 2,
  header padding 2 → 1, header-to-games 6 → 2 (`week-view.css`). The tallest day 425 → 342 px. **Result: no page scroll on
  any of the 26 stretches at either size; tightest cell (Apr 4) 14 px spare at 1280 × 900, 38.5 px at 1920 × 911.** No
  internal scrolling, so copies still capture the full view. 1-week mode unchanged. The toolbar was not touched.
  - Tests: e2e `two-week-fit.spec.ts` (both sizes, every stretch from both week parities: no page scroll, no line outside
    its cell, legend in the window, 11 px / 16 px; fails on the v1.17.0 build: page scroll from Nov 1 at 1920 × 911);
    `features.spec.ts` fit walk: the 164 px allowance at 1280 is gone, and its straight-columns check (whose selectors
    had stopped matching after item 2's link wrapper, so it checked nothing) is fixed and now asserts it sees every line.
  - Perf guard: load-week-view 329 ms, switch to League Calendar 61 ms (both inside their limits; CSS spacing only).
  - Seen, not changed: in 2-week mode a tricode's small plane can overlap the time label above it (42 cases on the
    stretches walked at 1280, e.g. "00:00 (+1)"); the same 42 before this change.

- **Link checks** (item 5, test only):
  - **5a, the link date is the feed's ET game date** (`tests/gamelink.tz.test.tsx`, run under America/New_York and
    America/Sao_Paulo). It uses the real late games on each side of the Nov 1, 2026 DST change:
    - ET Oct 31 (EDT): SAC @ MEM, CLE @ MIL and MIN @ SAS tip off at 00:00 UTC Nov 1; OKC @ HOU at 00:30.
    - ET Nov 1 (EST): LAC @ GSW tips off at 01:30 UTC Nov 2; TOR @ LAL at 02:00.

    For each of these games, the link in the League List and the week view carries the raw feed's `gameDateEst`. It
    is not the UTC day or the local day. A synthetic game whose feed date disagrees with every date its tip-off gives
    also gets the feed date. Mutation check: building the URL from the UTC date makes 6 of the 8 tests fail.
  - **5b, `away-vs-home` on NBA Cup knockout games (neutral site): not verified.** The 2025-26 full schedule is public
    at data.nba.com (`/data/10s/v2015/json/mobile_teams/nba/2025/league/00_full_schedule.json`, 1271 games). It has no
    games at all on Dec 9–16, 2025, the knockout dates, and no results. Other NBA score endpoints refuse plain requests,
    and getting past that wasn't attempted. hoopsjunkie's pages also need a browser that passes its bot check (Alex's
    Chrome). So no knockout game was checked.

### Round 6 (2026-10-30)
- **A1, copy time** (v1.17.2): stage timing of a full ORL Team List copy (`test-output/m6/copyprof.mjs`, medians of 3):
  v1.15.0 total 4 965 ms, SVG 16.8 MB, browser drawing it 3 730 ms; v1.17.1 5 475 ms, 19.3 MB, 4 471 ms (+~290 cloned
  nodes from the Fatigue components, each with all ~480 computed properties inlined). So the extra ~0.5 s was the
  browser parsing/drawing the bigger SVG, not cloning or PNG encoding. Fix: `includeStyleProperties` = the browser's
  list minus `CAPTURE_SKIP_STYLE` (logical duplicates, animation/transition, scroll, anchoring, pointer/caret, paging,
  multi-column rules, ruby, math). `overscroll-behavior-x/y` must stay (bisected: leaving it out changed ~500 pixel
  channels of a League List image). After: 4 038 ms, 13.0 MB. Six whole-view kinds pixel-identical (copydiff.mjs; two
  runs of one build are also identical, so the comparison is exact). The seven-copy test: 18.7 s locally, 19.6 s on CI
  after the change (23.7 s before) → budget 90 s. Round 5's CI failures were one stalled copy (full Team List still
  "idle" after 40+ s), not a 10 % slower test. Copy timings are now printed (`[copy] … copied in N ms`).
  The stall came back once on CI after the trim (run 41034246143) and was traced (v1.18.1): html-to-image's
  `createImage` runs `img.decode().then(…)` with no rejection handler, so a rejected decode (an `EncodingError`,
  reproduced with a stand-in image) leaves the copy pending forever. `renderToCanvas` now does html-to-image's
  toCanvas itself with its own `loadImage`; images pixel-identical. CI after it: the seven copies 30.1 s, full Team
  List copies 8–9.6 s.
- **A2, perf guard**: identical builds vary ~10 % in median main-thread time between sessions on the Windows PC (v1.17.1:
  2 434 – 2 733 ms), which more runs can't remove; interleaving two builds in one run cancels it (v1.17.1 against itself:
  ×0.985, ×1.089, ×1.023). So the three scroll checks run the current build and v1.17.1 (`REFERENCE`, built once by
  `scripts/perf-ref.ts` from a git worktree into `test-output/perf-ref/<commit>/`, served with today's snapshot), ABBA,
  7 counted runs each, and fail when current ÷ reference > 1.25. Frame checks keep their baselines; the main-thread
  baselines were removed. Sensitivity: 3 ms busy-wait per game-card render → ×1.15 (caught by frame p95 instead); the
  ratio catches ≥ ~+25 %. CI: ×0.93 – 0.98; the e2e job went to 9–12 min (limits raised: job 25 min, Playwright 20 min).
  Move `REFERENCE` forward only on purpose.
- **A3, team picker** (v1.17.3): reproduced with an event log — when the list opens under a resting pointer, Chrome sends
  that option mouseover/mouseenter with movement 0,0, sometimes after the key that moved the highlight; the picker's
  `onMouseEnter` then took it ("Miami" under the pointer after "o" chose Orlando). App bug. Fix: only `mousemove` with
  movement highlights. New e2e (pointer resting where Atlanta will be, Enter after the browser's hover lands): 9 of 9
  fail on the old build; unit test fails on the old code.
- **A4, Cup knockout links**: `tests/fixtures/cup-knockout-2025.json` (built by `make-cup-knockout-2025.mjs` from real
  game objects): QFs Dec 9–10 at home sites, SFs Dec 13 and the final Dec 16 (006…) neutral (Las Vegas), one QF at
  11:30 pm ET (04:30 UTC next day). Expected `https://hoopsjunkie.io/games/<gameDateEst date>/<away>-vs-<home>`, the feed's
  away/home even at a neutral site (the only order the feed gives, and the rule verified on regular games). Building
  the date from the UTC tip-off fails 10 of 12 checks. Still unverified against hoopsjunkie's real neutral-site pages.
- **A5, 2-week plane** (v1.17.4): the planes that hit labels were all away tricodes under long labels ("00:00 (+1)",
  52 px); home planes are past any label. The away plane in 2-week mode now sits inside the line (0.5 em, just right of
  the letters, above the score digits). `two-week-fit.spec.ts` checks every plane against the labels' text on all 26
  stretches at both sizes: 84 hits (the 42 places, each week walked twice) on the old build, 0 now; no new collision
  with scores, letters or "@" (planecheck.mjs). Left as they were: home planes over the line above (102) and the home
  logo disc's edge (276).
- **B, open on today** (v1.17.5): cause — the shell wrote the top day into the URL (`date=`) while scrolling and read it
  back on load; there is no other saved state. Now App drops the URL date (`e2eOpenDate` test hook only); the league
  views open on `seasonDay(data, today)`: the clock's local date (the day strip's today), kept inside the season.
  League Today goes there too (it used `defaultDay`, which kept last night's games until they ended). Midnight: when the
  clock's date changes (minute timer, or visibilitychange/pageshow after sleep), every view still on the old today
  moves (List day, week, Team Calendar month/week); a view moved elsewhere stays. The League List strip takes the
  clock's today (it used the open time, so its marker stayed on yesterday). e2e `open-today.spec.ts` (New York and São
  Paulo): 8/8, all fail on the old build.
- **C/D/E, Fatigue component** (v1.18.0):
  - Leg dot: a 0.32 em dark dot inside the badge, before "B2B" on a 1st night, after it on a 2nd; the badge keeps its
    2.6 em (text 2.0 em). Same in every column, view and size.
  - Merged 3-in-4: sets of consecutive games overlap iff their first games are ≤ 2 apart; runs chain into a stretch
    (`ThreeInFour.merged`). Season: 152 × 3in4, 171 × 4in6, 14 × 6in9, 23 × 7in11 (widest chip "7in11 · 2nd", 4.6 em).
    Chip track 4.75 em (component 8 → 10.25 em; League and Team List rows stay one line, checked). Compact: the stretch
    only ("7in11", track 3 em, component 8.35 em): two full chips need ~166 px, the 1280 × 900 day cell is 163 px.
  - Pop-up: one line "4in6 · 2nd: 4 games in 6 days (Oct 28 – Nov 2), tonight the 2nd" instead of a line per set, then
    a day strip (`data-tip-days`, Tooltip.tsx): cells filled on game days, empty on rest days, tonight yellow-ringed,
    the date under each cell (month on the first and the 1st).
  - No yellow fill/outline on tricodes beside the component (`FatigueMark component`); kept in the 2-week view and the
    narrow League List. Legends follow the view.
  - Copies: League List week 3 936 × 10 064 px, selections 3 936 × 1 196 / 1 536 × 1 440 px — the same as before (×4);
    every badge's dot and merged chip pixel-checked (`leg` region in copy.spec).
  - Perf (1920 × 911, `test-output/m6/abf.mjs`, 8 interleaved runs, v1.17.1 → v1.18.0): League List main thread median
    2 559 → 2 809 ms (v1.17.1's runs spread 1 114 – 2 862), frame p95 16.8 → 16.8 ms; Team List 443 → 281 ms, p95 16.7 →
    16.7 ms. Perf guard (1920 × 1080, vs v1.17.1 in the same run): League ×0.883, countdown ×0.959, Team ×0.889.

### Round 7 (2026-10-30)
- **1.1, middle- / ctrl-click on a matchup, automated** (test only): headless Chromium 156 *does* open a tab for both,
  but the tab never reaches the test: a bare cross-origin `<a target="_blank">` on a localhost page opens a tab the
  context's `page` event never reports (same-origin links and about:blank pages do get it), and a `context.route` for
  that host holds the tab's request forever. So `gamelink.spec.ts` watches the browser's own target list (CDP
  `Target.setDiscoverTargets`, `tabOpenedBy`), takes the stub route off before the modified clicks, and maps
  hoopsjunkie.io to a closed local port (`--host-resolver-rules`) so the tab stays offline. Each view: middle and ctrl
  open a tab with the expected URL, and the auxclick / ctrl-click reaches the window uncancelled. 36/36 over 3 repeats
  at both sizes; a build whose link cancels auxclick and ctrl-clicks fails it. No manual step left.
- **1.2, Cup knockout URLs checked against hoopsjunkie.io** (test only): plain requests get Cloudflare's 403 "Checking
  your browser"; checked from Alex's Chrome (the page check passes on its own there, no click), with a script fetching
  each URL same-origin and reading where it lands. All 7 games (Dec 9–16, 2025) have a page at `<ET date>/<away>-vs-<home>`,
  every page names its first team "Away" — neutral sites included (SAS–OKC, NYK–ORL, SAS–NYK final). The wrong order
  redirects to the day's scores (HTTP 200, no 404 anywhere). **The rule was right; the A4 fixture wasn't**: its
  matchups were "illustrative" and two had the sides swapped (real: NYK @ TOR in the QF; NYK the designated away team vs
  ORL in the SF), PHX scored 89 not 125. Fixture fixed from the real pages (tip-off times still illustrative).
- **1.3, merged chip in Team Calendar cells** (and their selection images): `TifChip` shows `mergedChip` ("4in6 · 2nd",
  purple, 3rd+ stronger), tooltip "4in6 · 2nd: 4 games in 6 days (…), tonight the 2nd" + the day strip. The probe holds
  the season's longest chip, "7in11 · 2nd" (unit test checks it is the longest over all 30 teams). **Scales unchanged**:
  month 1.2 (1920 × 1080) / 0.8 (1280 × 900), weeks 2.5 / 1.6; every team × month walk unclipped. **The tablet/phone
  Team List has no 3-in-4 chip at all** (never had since round 3; round 6's handoff said otherwise — wrong). Alex
  (2026-10-30): leave it that way.
- **1.4, opponent dot**: gone from the opponent's tricode where its Fatigue component is shown (desktop Team List), as
  round 6 did with the yellow tricode boxes. Kept where nothing else marks the opponent's 2nd night: tablet/phone Team
  List and Team Calendar cells. No legend mentioned it.
- **1.5, home plane in the 2-week view**: the away fix carried over mirrored — the home plane sits inside the line just
  left of its letters (above the home score's digits). Over the stretches walked (`two-week-fit.spec.ts`, both sizes):
  plane on the line above 102 → 0, on a logo disc 276 → 0, on a time label 0 → 0; `test-output/m7/planecheck.mjs`
  also finds no plane on scores, letters or "@". The test fails on the old CSS (378 overlaps).
- **2.1, today in the Team Calendar** (Month, 1 week, 2 weeks): today's cell gets the league week view's highlight
  (`.ck-cell-today`: accent border + inset ring, accent day number). `today` is CalendarView's — the clock's local date,
  the same the day strip and the Today buttons use — so it moves at midnight and after sleep / a tab switch. The league
  week view already had it (since round 1). Whole-view copies show it, as the week view's do.
- **2.2, "Show rest days" is on by default, on every load, and never remembered**: unchecking lasts until a reload (it
  stays off across team changes while the page is open). The app shell no longer reads or writes `rest=` (an old link's
  `rest=1` — or `rest=0` — changes nothing); nothing in the app uses localStorage, sessionStorage, cookies or IndexedDB
  (checked in e2e after unchecking). **Defaults like this will move to a future settings page; don't add persistence
  before that exists.**
- **2.3, countdown dropped "for now", on purpose**: today's games show their start time in the same format and zone as
  every other day. Removed entirely: `countdownLabel`, `TipTime`'s clock read, the hidden-time CSS, the countdown unit/e2e
  tests and the perf guard's "while the countdown ticks" scroll check (and its baselines). **The clock has no minute tick
  any more**: one timeout to the next local midnight (`nextMidnight`, bisection in the widget's zone, right on 23/25-hour
  DST days), plus visibilitychange / pageshow; the stale-data stamp sets one timeout for the 36 h mark. Unit test: no
  `Date.now()` call during an hour before midnight, today moves at midnight; the old clock fails it.
- **2.4, no empty score gap on unplayed rows** (lists only — Alex, 2026-10-30: the week view keeps its aligned score
  columns): a League List / Team List row without a score has no score slots and its tricodes stand against the "@"
  (`ck-noscore`): **"CHA @ WAS", 28.2 px between the codes' letters** (desktop, "@" slot 1.3 em + two 5 px gaps; before: ~100 px, worked out from the
  slot widths — two empty 2 em score slots, two more gaps and the tricode slots' padding — not measured). Played rows keep "[logo] BOS 113 @ 121 DET [logo]". **Deliberate trade-off
  (Alex): on a day mixing played and unplayed games (today), the columns don't line up between the two kinds** — they
  still do within each kind (e2e checks one x per part per kind). Don't "fix" it back. No alignment test across kinds.
- **Part 2 perf** (guard vs v1.17.1, same run): League scroll ×0.942, **Team List scroll ×1.155** (×1.039 before 2.2 — the
  rest rows, now on by default, are ~80 more rows; inside the ×1.25 limit), loads 292 / 332 / 291 ms, switches 34–73 ms,
  marquee p95 20–21 ms.
- **Part 3, Slate view** (`SlateView.tsx`, `slate.ts`, `styles/slate.css`): League → **List | Calendar | Slate**, desktop
  only (from a 960 px widget; tablets/phones don't offer it and show the List). A day of games as cards, **two columns**
  in the lists' 960 px column (cards 474 px wide, 117 px tall), scrolling inside the view when they don't fit.
  - **Day**: the same `date` as the League List (List ↔ Slate keep the day); changed only by ← / → — the top bar's
    arrows (previous/next game day, TV filter respected) or the arrow keys anywhere except in a field, a tab row, a
    listbox/grid, an open picker, or with a modifier. Scrolling never changes it. Opens on today (same `seasonDay` /
    clock as everything else, midnight rollover included); Today and the date picker work as in the List. Team views
    show their List while the layout is Slate (League comes back to it); URL `layout=slate`.
  - **Card**: head = start time (`TipTime`, same format/zone) or "Final" + OT, then the Cup / play-off labels and the
    national TV names; then the away row and the home row ("@" before the home team): logo (28 px), full team name
    ("Wizards"), record going in, the Fatigue component (B2B badge with the leg dot, night icons, merged 3-in-4 chip),
    score (winner bright). Same facts as the League List row (e2e compares them game by game). No countdown, no
    thumbnails. The teams are the hoopsjunkie link (`MatchLink`); never link-styled in images.
  - **Copy** (toolbar button, and the marquee selection bar): `SlateCopy` in `CaptureStage`, no caption, **transparent**
    (no background fill: only the cards are opaque — e2e: every pixel outside the cards alpha 0, every pixel inside 255).
    `SLATE_COPY_GAP` = **120 px** between cards and half of it around them (site: 12 px) — one constant to tune.
    **Columns** (`slateCopyColumns`): the count whose image, fitted to the page (the window: `innerWidth × innerHeight`),
    shows the cards largest — **Alex chose this "largest cards" rule (2026-10-30)** over "3 selected = one row of 3",
    which only comes out with near-square cards. At 1920 × 911: 1 game 1 column, 3 → 2 + 1, 5 → 2/2/1, 12 → 3 × 4,
    15 → 4 × 4. Marquee selections use the same rule. **Pixel ratio** (`slatePixelRatio`): 4, or 2 × the fitted scale
    when that is more (one game: ×6.5), so the PNG still has a pixel per screen pixel at 2× its fitted size; ¼ of it is
    a plain downscale of that.
  - **Measured** (1920 × 911, e2e `slate.spec.ts`; fitted = scale to fit the page; names 16 px on the card):

    | games | columns | image (CSS px × ratio) | fitted | names on the page | copy |
    |---|---|---|---|---|---|
    | 1 | 1 | 594 × 237 × 6.5 | ×3.23 | 51.7 px | 274 ms |
    | 5 | 2 | 1188 × 711 × 4 | ×1.28 | 20.5 px | 530 ms |
    | 12 | 3 | 1782 × 948 × 4 | ×0.96 | 15.4 px | 1 197 ms |
    | 15 | 4 | 2376 × 948 × 4 | ×0.81 | 12.9 px | 1 254 ms |
    | 3 selected | 2 | 1188 × 474 × 4 | — | — | 392 ms |

    Existing copies in the same run: whole week view / Team Calendar 1.0–3.9 s, full Team List 5.8–6.3 s, parts
    0.13–0.76 s — the Slate copies are in line (smaller images).
  - Tests: `tests/slate.test.ts` (rule = best of every column count, gap, ratio), `tests/slateview.test.tsx` (desktop
    only, ← / → and Today, Team shows List, URL), `e2e/slate.spec.ts` (opens on today ignoring a URL date, 2 columns,
    every game, same facts as the League List, names/"@"/scores/OT vs the snapshot, keys + arrows + wheel, the four copy
    sizes with transparency / fit / sharpness / column rule, marquee of 3). Readability "≥ 12 px names when fitted" is
    the test's threshold; whether that reads well on the whiteboard is for Alex's eyes.
  - **Round 7 tests vs the pre-round build** (v1.18.1 served, desktop-xl): 14 of the new/changed e2e fail there as they
    should (b2b-color, calendar-cells, mirror, rest, today-cell ×2, two-week-fit ×2, slate ×7); the game-link and
    per-kind alignment checks pass there (they guard behaviour that already held; the link test fails on a mutation that
    cancels auxclick / ctrl-click). Unit: clock 3/3, today-cell 3/4 (the 4th checks "no highlight" off-month), mirror,
    fatigue chip and rest tests fail on the old code.
  - Perf guard (vs v1.17.1, same run): League scroll ×0.975, Team List scroll ×1.015 (the ×1.155 after part 2 was run
    noise — same code), loads 298 / 319 / 303 ms, switches 47–66 ms, marquee p95 18 ms. The Slate itself has no scroll
    guard (a day is ≤ 15 cards, no virtualization involved).

### Site version (2026-10-28)
- **"v1.3.0"** (MAJOR.MINOR.PATCH, from package.json) in the **bottom-right corner** of the window, small and muted, in
  every view and width, inside the page's bottom padding so it covers no row, cell or control (e2e checks); tooltip
  "Version 1.3.0 · commit c93db81, built Oct 28, 2026, 21:00". Part of the app shell (`src/SiteVersion.tsx`), not the
  widgets, so never in a copied image. `/version.json` = `{"version","commit","builtAt"}`, served `no-cache`. The commit
  comes from `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`, else git (`+` = built with uncommitted changes); `vite.config.ts`,
  read via `src/build-info.ts`. (First shipped as "v<commit>" after the data stamp; Alex asked for the corner and
  numbered versions.)
- **Numbering**: patch for fixes, minor for features, major for big changes. Start: **1.3.0** = v1 + round 2 + round 3.
  **Enforced in CI**: `npm run check-version` (`scripts/check-version.ts`, first CI step on pushes) fails when the last
  commit changes the app (anything but `public/data/`, tests, e2e, scripts, CI, docs) without raising the version; the
  daily data commits pass. Tests: `tests/version.test.tsx`, `e2e/version.spec.ts` (corner, fixed when scrolling, covers
  nothing, = package.json and git HEAD; against the live site: no-cache).

## Requests for rotationkit (module gaps — not forked here)
- **Playoff round**: the module has `gameType: 'playoffs'` but no round. calendarkit reads it from the gameId
  (`004 YY 00 R S G`, R = round) in `playoffRound()` in `src/data/model.ts`. Please add e.g. `playoffRound: 1–4 | null`
  (and series/game number) to `deriveGame`; calendarkit will switch to it on the next copy.

## Open questions / items
- **Flaky under load**: `features.spec.ts` "team header and team picker" (tablet) failed once in a full run on
  2026-10-24 (`toHaveText`), then passed 3/3 alone and in the next full run; seen after a change that touched no app
  code. **Resolved in round 6 (A3):** a real picker bug (a resting pointer's synthetic hover overrode the keyboard).
- **Today mid-scroll**: clicking Today within the same frames as a fast wheel burst (only a script can) lets Chrome's
  wheel animation carry the list on after the jump (title and button follow wherever it ends). Seen in ~3 % of e2e
  runs after the scroll fix, 0 % before (the old, slower renders let the wheel finish first); the e2e now waits for
  the scroll to settle, as a person's click does.
- The scheduled snapshot ran at 15:36 UTC on day 1 instead of 11:00 (GitHub delays cron runs under load).
  Harmless for a schedule; the job now rebases before pushing in case it races a normal push.
- **ROTATIONKIT_BASE_URL** is a placeholder until rotationkit has a production URL (it isn't merged to main).
  While it is, the app **hides the "Rotations ↗" action everywhere** (league day, team grid, phone detail card):
  `isRotationkitConfigured()` in `src/config.ts` is the single check, and the shell then passes no `onOpenGame`.
  **To turn it on, set `ROTATIONKIT_BASE_URL` in `src/config.ts` to the real URL — that is the only step.** The
  tests follow the config (the e2e expects the action iff it is configured), so no test edits are needed.
- **Was 911b638 (the 2026-10-23 bot commit, 15:36 UTC) deployed?** Not by itself: GitHub shows no Vercel status on
  it, and Vercel's first status is on 671e3e4 (15:59 UTC) — the Vercel project didn't exist yet. Its snapshot is live
  (live `meta.time` 2026-10-23T11:29:41.2941Z = the commit's, checked 2026-10-24) because later pushes redeployed it.
  So whether Vercel deploys a **bot-authored** commit is still unproven; the next daily run checks it automatically
  (deploy check above). If it fails: Vercel's Hobby plan blocks deployments of private-repo commits whose author isn't
  the account owner — set repo variables `DATA_COMMIT_NAME` / `DATA_COMMIT_EMAIL` to Alex's identity (or make the
  repo public).
- Repo is private; the standard for these projects is public (needs Alex's yes to change).
- Repo growth from daily 4 MB snapshot commits (~a few hundred KB compressed per change). Fine for a season;
  revisit if it becomes a problem (e.g. Vercel Blob or a separate data branch).
