# Using Slate in the gauntlet

For the gauntlet's Slate widget. Self-contained: an assistant in the gauntlet repo can
follow it without reading calendarkit's code. Code: `src/slate/` in this repo (entry `src/slate/index.ts`, styles
`src/slate/slate.css`); a working example page: **https://gauntlet-home.vercel.app/calendar/slate.html**
(`src/slate/demo.tsx`; `?date=YYYY-MM-DD&width=<px>&n=<widgets>`). **How the gauntlet gets the code (decided, Alex
2026-10-31): option A** — a package pinned to a calendarkit commit, like Boardkit and Linkkit
(`"calendarkit": "https://codeload.github.com/AlexLCBranco/calendarkit/tar.gz/<commit>"`); a card change reaches the
gauntlet when the pin moves. Don't copy the code. The repo is public (2026-10-31), so the tarball downloads without a token
(checked: HTTP 200 for a commit's tarball, signed out).

**One origin.** calendarkit is served at gauntlet-home.vercel.app/calendar/ through the gauntlet's own `vercel.json`
rewrites (`/calendar`, `/calendar/`, `/calendar/:path+` → calendarkit-brown.vercel.app/calendar/…). So the whiteboard,
/boardkit, /linkkit and /calendar share one origin: one localStorage, `storage` events between all their tabs, no CORS.

**Inputs** (`SlateDay` props; nothing else is read — no URL, no app state, no page layout, no clock):
- `data: CalendarData` — from `loadCalendarData()` (fetches `/calendar/data/schedule.json` once per page, cached in
  memory; every widget of the page shares the one promise). Parse errors reject; call it again to retry.
- `date: string` — the NBA game date, `YYYY-MM-DD` (US Eastern date, the feed's `gameDateEst`). A date without games
  renders "No games."
- `timeZone?: string` — IANA zone for the tip-off times (default: the browser's). A game after local midnight shows
  "(+1)".
- `notes?: SlateNotes` — the notes store (below). Leave it out for info-only cards (no note boxes).
- `width?: number` — the CSS width the grid fills (default 1840); decides one or two columns.
- `gameLink?: GameLink` — pass `hoopsjunkieLink` for the "↗" icon after each time (opens the game's hoopsjunkie.io
  page in a new tab); leave it out for no icon.
- `tvOnly?: boolean` — only national-TV games (calendarkit's TV filter).
- `odds?: SlateOdds` — moneyline odds per team (decimal). Pass `liveOddsStore()` (fetches
  `/calendar/api/odds?date=` once a Slate shows a date, refreshes every 10 min while shown unless the night is over, one
  store per page); leave it out for no odds — then the part makes no request and starts no timer for odds (the odds
  column stays reserved and empty).

**The notes store** (`SlateNotes`, what a note box needs):
`get(gameId) → { pre, live, post, shown }` (must return the same object until that game's note changes — React's
`useSyncExternalStore`; `EMPTY_NOTE` for none), `set(gameId, patch, now?)` (saved after 400 ms of no typing, at once
with `now`), `flush()` (a box calls it on blur), `subscribe(gameId | '*', fn) → unsubscribe`, optional `listen() →
undo` (a grid calls it while shown). **Pass `localNotesStore()`** — the default, the same one calendarkit uses: one
store per page shared by every widget (a note typed in one widget shows in the others at once), localStorage
`ck:notes:v1`, following other tabs (calendarkit's included) through the `storage` event with **one listener per page**,
however many widgets. Never write a second store on the same key.

**Notes design (final — don't re-decide; layout redone in v1.64.0):** each card = the game's info on top + a note box
under the team rows across the card's full width, the PRE / LIVE / POST label and ⇄ in the card's top-right corner beside
the odds; on screen the box grows up to 5 lines, then scrolls inside (its own scrollbar; the wheel scrolls the page
until the note is clicked into); copies (`SlateCopy`, also the gauntlet widget) show the whole note, never capped (calendarkit's images draw
their cards `slateCopyCardWidth` wide: the enlarged info + the label, ~737 px on a regular night);
always shown (an empty box is the space Alex writes or draws over on the whiteboard). Three slots, PRE / LIVE / POST,
switched with ⇄ (PRE → LIVE → POST → PRE); the slot on show is saved with the note; **nothing switches it but Alex**
(not tip-off, not the game ending). A note belongs to the **game** (its gameId), not to a widget, board or view: the same
note shows and is editable everywhere that game appears. Format, `localStorage["ck:notes:v1"]`:
`{ "<10-digit NBA gameId>": { "pre": string, "live": string, "post": string, "shown": "pre" | "live" | "post" } }`; a
game whose note is empty and on PRE is removed; the key is removed when no note is left. A save writes only the games
changed in that tab onto what is stored then (another tab's notes on other games survive); last edit wins; a tab's own
unsaved typing is never replaced by another tab's save. Notes live in that browser on that PC only (Export / Import in
calendarkit's Slate toolbar is the backup).

**What it renders:** `<SlateDay>` = "No games." on an empty day, else `<div class="ck-slate-grid">` of
`<article class="ck-slate-card" data-game-id>` in tip-off order. Card: a narrow strip on the left (start time or
"Final" + OT; then the ↗ icon, the green "TV" pill with the networks in its tooltip, the short Cup / play-off labels), beside
the away row and the home row ("@" before the home team): logo (28 px), team name, record and streak going in, the Fatigue
component (B2B badge with the leg dot, the two nights as house / plane, the 3-in-4 chip as the stretch only, "7in11"),
score (winner bright), moneyline odds (decimal). National TV games: green outline and tint. Then the note box (under the
rows, full width; its label and ⇄ in the card's top-right corner). Wrap
the grid in an element with class `ck-root` (the colours and font are variables on it) and `ck-slate-widget` (no
background: nothing is drawn between or around the cards, only the cards are opaque); import `src/slate/slate.css` once
(calendarkit's widget stylesheet, every rule scoped to `.ck-*`, no html/body rules; 35.7 KB, 7.6 KB gz). Tooltips
(records, streaks, fatigue — with the day strip): `useTooltip()` gives `handlers` to spread on the wrapper and a
`node` to render inside it (as slate.html does). `SlateCopy` is the copied image's layout (no controls, the note box as
static text) if the widget ever copies.

**Size:** a card = the info (`SLATE_INFO_WIDTH`) + the room right of it (the note's label and ⇄), the note box under both; 8 px padding and a 1 px border; cards 12 px apart (`SLATE_GRID_GAP`); 78 px tall. Info-only
cards (no store) are `SLATE_CARD_WIDTH` (523 px) wide, as many per row as fit the width (`slateInfoColumns`: 3 in 1840 px).
With notes: **Two columns while each note box keeps 300 px (`SLATE_NOTE_MIN`), i.e. a
width ≥ 1588 px; else one column, cards as wide as the width.** (Measured in calendarkit: 1920 window → 2 columns, cards
914 px, note box 426 px; 1280 → 1 column, card 1233 px, box 745 px.) On screen a long note grows its box up to 5 lines, then scrolls inside; in copies it grows its card
whole (the font never shrinks). The widget's height = rows × card height + gaps + the grid's 8 px top / 16 px bottom padding — it grows
with the day's games and the notes; scaling by the corners (phase 2) should scale this whole layout (a CSS transform),
not change `width`, so the columns stay put. Copies (calendarkit) use `SLATE_COPY_GAP` = 24 px between cards and half of it
around them, transparent; their columns follow the largest-cards rule (`slateCopyColumns`). No virtualization: a day is
at most 15 games.

**Pinned date (decided):** a widget stores its own date. Inserting one defaults to today (the viewer's local date, as
calendarkit's "today"); after that it stays on that date until Alex changes it with ← / → — it never follows "today" by
itself (sketches around the games must stay with that night). In calendarkit ← / → go to the previous / next day with
games (`nearestDay` / `listDays` in LeagueListView.tsx); phase 3 decides what the widget's arrows do and how they share
the keys with the whiteboard's nudge.

**Data:** `https://gauntlet-home.vercel.app/calendar/data/schedule.json` (from a gauntlet page: `/calendar/data/schedule.json`,
same origin, no CORS — e2e `move.spec.ts` fetches it from a gauntlet page). The NBA's own schedule feed (cdn.nba.com),
snapshotted daily at 11:00 UTC by this repo's GitHub Action (`.github/workflows/schedule-update.yml`; GitHub may start it
hours late), committed to `public/data/schedule.json`, deployed by Vercel; the action then waits until the live file is
the committed one (`scripts/verify-deploy.ts`, polling the address above). Final scores therefore appear the morning
after (live scores would need another source — phase 5). ~0.6 MB (only the fields the app reads; the raw feed is ~4 MB), ~18 KB brotli; `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
(A long stale-while-revalidate served day-old data through the rewrite.)

**Must know:**
- At rest the part starts no timer and asks for no animation frame, and its only requests are the snapshot (once per
  page) and the 30 team logos (`/calendar/logos/<TRI>.svg`, images); the font is `/calendar/fonts/…`. Typing starts only
  the 400 ms save debounce. Tested (unit `slatepart.test.tsx`, e2e `slate-part.spec.ts`) — keep it so: the widget may be
  on a board many times.
- Everything it needs is under `/calendar/`: logos, font, data. Don't serve copies of them from the gauntlet.
- `src/slate/` imports only `src/slate`, `src/data`, `src/shared` and React (unit test). calendarkit's Slate is built from
  it, so a card change in calendarkit is a change here — one source of truth.
- `ck:notes:handoff:v1` (old origin only) and the `#ck-handoff=` fragment are the one-time move from the old address; ignore them.
