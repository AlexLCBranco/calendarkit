# calendarkit — PROJECT

NBA schedule calendar: every team's schedule plus the full-league schedule. Standalone web app (Vite + React),
own repo (github.com/AlexLCBranco/calendarkit) and own Vercel project.

## Goals (v1)
- Team view (month grid) and league view (day list + month navigator) of the NBA schedule.
- **Schedule only**: no scores, no live status shown. Full game objects are kept in the data layer so scores can
  be added later with UI changes plus a fresher refresh strategy.
- Components are widget-first so they can later be dropped into **gauntlet** (whiteboard with live widgets).
- Links into **rotationkit** for games that are over.

Out of scope for v1: scores, live status, New Event, event categories, calendar settings, other leagues,
where-to-watch info, embedding in gauntlet.

## Status
- [x] Step 0 — probe (below)
- [x] Data layer — `src/data/model.ts` (pure derivations), `src/data/load.ts` (fetch snapshot once, parse with `parse.ts`), `src/data/teams.ts`
- [x] Views — `src/components/CalendarView.tsx`: `TeamMonthGrid`, `LeagueDayView` (week strip, prev/next day), `MonthNavigator` (counts, click → day), `TeamPicker`, and `CalendarView` combining them. App shell `src/App.tsx` (URL state `?view=&team=&date=&tv=`).
- [x] Game card — `src/components/GameCard.tsx`: vs/@ (team view) or AWAY @ HOME, local tip-off with (+1), TBD, B2B per team, Cup / Cup Final / Play-In / Playoffs-round markers, national TV badge, "Rotations ↗" action (raises `onOpenGame`) once tip-off + 3 h has passed — only when the host passes `onOpenGame`; the app shell does so only once `ROTATIONKIT_BASE_URL` is set (hidden for now, see Open questions).
- [x] Tests — see "Tests" below
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

## Tests
`npm test` (Vitest, 77 tests) · `npm run e2e` (Playwright, desktop 1280 px + phone 390 px) · CI: `.github/workflows/ci.yml`.
- Module tests (`src/shared/nba-schedule/*.test.ts`) run unchanged.
- `tests/fixtures/feed-2026-10-23.json`: full real feed saved on 2026-10-23 (fixed, unlike the daily snapshot).
  `tests/synthetic.ts` builds targeted games through the module's `deriveGame`.
- `*.tz.test.ts` run twice, under America/New_York and America/Sao_Paulo; the zone is set as `env.TZ` per Vitest
  project in `vite.config.ts` (no shell prefix, works on Windows/Linux/CI). Cover the Nov 1, 2026 DST change,
  +1 grouping and the default-day rule with a mocked clock.
- `card.test.tsx` / `views.test.tsx` (jsdom): markers, TV badge/filter, TBD, B2B, rotationkit action contract,
  navigation.
- `e2e/smoke.spec.ts`: loads, league + team view, TV toggle, month jump, no console errors; screenshots to
  `e2e/screenshots/` (git-ignored; uploaded as a CI artifact). `npm run e2e:live -- <url>` runs it against a
  deployed site.
- Manual only: none needed for v1 beyond judging look and feel.

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
  links. Styles are in `calendar.css` imported by the components, colors as CSS variables.
- **League day arrows** step one calendar day (empty days say "No games this day"); range = first..last game date.
- **Phone team grid**: cells show time, vs/@, opponent, markers; national TV shrinks to a dot; tapping a game shows
  the full card (with TV names and the rotationkit action) below the grid.
- **Snapshot size**: the raw feed is ~4 MB (≈ 200–300 KB gzipped over the wire). Committed daily only when it
  changes. Kept raw so no information is lost (scores later).

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
