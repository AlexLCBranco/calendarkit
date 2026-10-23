# nba-schedule

Self-contained reader for the NBA schedule feed
`https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json`.
No imports from the rest of rotationkit — copy this folder into another repo as-is.

| File | Runs in | Purpose |
|---|---|---|
| `parse.ts` | **browser + Node** (no imports, no Node APIs) | raw feed JSON → typed game objects |
| `node.ts` | **Node only** (optional) | download with browser-like headers, timeout, retries, proxy; then `parseSchedule` |
| `*.test.ts`, `fixture.json` | Vitest | tests on a trimmed copy of the real feed (9 games) |

Imports between the files are extensionless (`./parse`), which works with Vite/Vitest/tsx and TypeScript
`moduleResolution: "Bundler"`.

## Exports

`parse.ts`
- `parseSchedule(json: unknown): Schedule` — throws `ScheduleParseError` on an unexpected shape.
- `deriveGame(raw, seasonYear): ScheduleGame`, `gameTypeOf(gameId): GameType`
- `regularSeason(schedule)`, `finished(games)` — small filters.
- `SCHEDULE_URL`; types `Schedule`, `ScheduleGame`, `RawScheduleGame`, `ScheduleTeam`, `ScheduleBroadcaster`,
  `ScheduleWeek`, `GameType`.

`node.ts`
- `fetchSchedule(opts?): Promise<Schedule>` — fetch + parse.
- `fetchScheduleJson(opts?): Promise<unknown>` — raw JSON (e.g. to cache it).
- Options: `url`, `timeoutMs` (15 s), `retryDelaysMs` ([2 s, 4 s, 8 s]; 403/404 are not retried), `headers`,
  `onRetry`. `ScheduleFetchError` carries the HTTP `status`.
- Proxy: Node's built-in `fetch` ignores `HTTPS_PROXY`. If it is set, `node.ts` installs undici's
  `EnvHttpProxyAgent` when the `undici` package is available; otherwise run Node with `NODE_USE_ENV_PROXY=1`
  (Node ≥ 22.21 / 24.5). Without a proxy nothing is needed.

## Shape

```ts
interface Schedule { seasonYear: string /* "2026-27" */; leagueId: string; weeks: ScheduleWeek[]; games: ScheduleGame[] }
```

A `ScheduleGame` is **every field of the raw game, unchanged** (unknown/new fields included), plus derived fields:

| Raw (selection) | |
|---|---|
| `gameId`, `gameCode`, `gameStatus` (1/2/3), `gameStatusText` | |
| `gameDateTimeUTC` (real UTC), `gameDateEst`, `gameDateTimeEst`, `homeTeamTime`, `awayTeamTime` | |
| `homeTeam`/`awayTeam`: `teamId`, `teamTricode`, `teamCity`, `teamName`, `teamSlug`, `wins`, `losses`, `score`, `seed` | |
| `broadcasters`: `nationalBroadcasters`, `nationalRadioBroadcasters`, `nationalOttBroadcasters`, `home*`/`away*` Tv/Radio/Ott | |
| `gameLabel`, `gameSubLabel`, `gameSubtype`, `seriesText`, `seriesGameNumber`, `ifNecessary`, `weekNumber`, `weekName` | |
| `arenaName`, `arenaCity`, `arenaState`, `isNeutral`, `postponedStatus`, `pointsLeaders`, `branchLink` | |

| Derived | Meaning |
|---|---|
| `seasonYear` | from the feed, e.g. `"2026-27"` |
| `gameType` | from the gameId prefix: `001` preseason, `002` regular, `006` cup-final (seen in the feed); `003` all-star, `004` playoffs, `005` play-in (NBA ID convention, not in the current feed) |
| `status` | `'scheduled' \| 'live' \| 'final' \| 'unknown'` from `gameStatus` |
| `statusText` | `gameStatusText` trimmed |
| `dateEt` | US Eastern calendar date `YYYY-MM-DD` |
| `startTimeUtc` | `gameDateTimeUTC`, or `null` while the time is TBD |
| `timeTbd`, `teamsTbd` | time / opponents not decided yet |
| `isCupGroupGame`, `isCupKnockout` | NBA Cup group stage / knockout |

## Feed quirks (seen on 2026-10-23)

- **"Est" fields are Eastern time with a fake `Z` suffix** (`gameDateTimeEst: "2026-10-03T19:00:00Z"` means
  7 pm ET). `gameTimeEst`/`gameTimeUTC` carry a dummy `1900-01-01` date. Use `gameDateTimeUTC` (or
  `startTimeUtc`) for real instants and `dateEt` for the calendar day.
- **NBA Cup knockout games** (`gameSubtype: "in-season-knockout"`): quarterfinals and semifinals have regular
  season IDs (`002…`) and count in the 82; until decided they have `teamId: 0`, empty `teamTricode`,
  `gameStatusText: "TBD"` and a placeholder time (midnight ET). The home team of a quarterfinal is the
  higher seed, so a team can end with 42 designated home games (and 40 away). The championship has a `006…`
  ID, is not a regular-season game, and is on a neutral court (`isNeutral: true`).
- **Neutral sites**: Global Games still designate a home team. `isNeutral` is `true` for Mexico City, Paris,
  Manchester and the preseason Macao games, but `false` for the preseason NBA Canada Games (Quebec City,
  Vancouver) — check `arenaCity` rather than trusting the flag alone.
- `gameStatusText` can have trailing spaces while live (`"3rd Qtr             "`).
- `ifNecessary` is the string `"true"`/`"false"`, not a boolean.
- Scores are `0` before a game starts; `wins`/`losses` are the team record at the time of the feed.
- The feed only covers the current season (preseason through Cup final; playoffs appear when scheduled).

## Tests

`npx vitest run <this folder>` — needs `vitest` (and `esbuild`, which comes with it). `browser-safe.test.ts`
bundles `parse.ts` and runs it in a fresh JS realm without `process`, `require`, `Buffer` or `fetch`.
`node.test.ts` mocks `fetch` (no network).
