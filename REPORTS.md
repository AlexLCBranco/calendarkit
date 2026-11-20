# Reports — calendarkit

Build reports, newest first (CLAUDE.md, "Feature backlog, built list and ideas").

## 2026-11-20 — CK-26 … CK-32 built (CK-22 blocked)

**Built (all v1.92.0):**
- CK-26: every "Cup" label (Slate cards, League List, Team List, calendar cells, the Cup schedule) is a link. A group game opens Cup › Groups with its group outlined; a knockout game opens the Simulator's bracket, outlined. Ctrl / middle-click opens a new tab (`?view=cup&cg=West+Group+A`). The gauntlet gets it once it provides `CupLinkContext` (docs/slate-in-gauntlet.md).
- CK-27: hovering a "Cup" label (anywhere, not only the Slate) shows the group table: place, team, Cup W-L, point difference, ★ / WC / IN / OUT, the game's two teams highlighted. Knockout games show each team's way through the Cup. A click inside the popup pins it; the label's own click still goes to the Cup page.
- CK-28: a team's record on a Slate card or a League List row opens that team's List, rest days on, on the day you were looking at. Tooltip "All BOS games". Name and logo still open the Calendar.
- CK-29: each Team Calendar game cell has a second, tinted line that starts with the opponent's tricode: record, streak, back-to-back night ("2/2 · HA" with the plane), 3-in-4, days off (2+). Month cells: record and the marks in short form, the rest on hover. It replaces the yellow dot on the opponent's tricode.
- CK-30: at a full-size window List / Calendar / Slate sit on the first line and the date controls on the second, right of the team chips. The page rows are 64 px (were 100). A Team Calendar month and the 1- and 2-week views fit 1920 × 1080 with no page scroll.
- CK-31: in a past season, the season-series popup lists the two teams' play-in and playoff games under the regular-season ones, in purple, labelled G1…, with a line like "Playoffs · East 1st round · DET won 4-3". The header count stays regular season. "View series" opens Standings on that season with the series outlined. This season's playoff games will show the same way once the feed has them.
- CK-32: a small label on the day (Team and League calendars, League List heading, Slate header) and a ★ on that day's game rows and Slate cards, with one plain sentence on hover. Holidays by rule; opening night, Christmas and MLK games, Cup knockout nights, All-Star break and the last day from the schedule; trade deadline (Feb 11), play-in (Apr 13–16) and playoffs start (Apr 17) by hand from NBA.com's key dates. The list is `src/data/holidays.ts`.
- Fix found on the way: on the Cup's Team schedule the West teams' chips ran off the right edge of the page (since v1.91.0). Cause: without the "All teams" chip the two conferences landed side by side. Now East over West; a test covers it.

**Choices I made (tell me if you want otherwise):**
- CK-29 costs text size in the month view: every cell needs room for one more line, so the month's text is drawn at 0.95 instead of 1.2 at 1920 × 1080 (week views are unchanged in practice: 1.9). The test that held 1.2 now holds 0.95.
- CK-29: for a game further ahead than the opponent's next one, the line shows the opponent's record as of now (its tooltip says "now"); the record going in isn't knowable yet.
- CK-30 applies to the Schedule from 1800 px of content (a 1920 window). The League calendars still fill the window under the pinned header after a small scroll, as since v1.91.0: making them fit without it shrank the 1-week view's text from 1.25 to 1.1. Only the team calendars lost the scroll, as the item asks.
- CK-26: the bracket lives in the Simulator, so knockout labels open that tab.
- CK-32: the NBA Finals are not marked: the NBA has not published the 2027 dates. NBA.com lists the playoffs' start under a "2026" typo; I took Apr 17, 2027. The star on Slate cards sits in the corner of the time strip (as a chip it made the strip taller than the card).
- CK-31: "View series" needs the season's page, so it exists for past seasons only.

**Blocked:** CK-22 (waits on halftime-timer HT-1), unchanged. **Ideas added:** none.

**To check by hand:** only the looks: whether the opponent line reads clearly at the smaller month text, and the purple of the playoff games.

## 2026-11-20 — CK-25, CK-23, CK-24 built (CK-22 blocked)

**Built (all v1.91.0):**
- CK-25: the shared layout (backlogkit's NAV_PATTERN.md, styles copied from footykit FK-65). A header pinned at the top of every page, 92 px everywhere: ← →, the breadcrumb (Schedule › Boston Celtics › Calendar; Cup › History › 2025; Standings › This season › Main — every part opens its neighbours), "Go anywhere" (Ctrl+K: places, views, every team as Calendar or List, Cup views and seasons, column sets, past NBA seasons), then Options / ⓘ / Quick standings / Copy; the Where tabs Schedule · Cup · Standings (no Tools tab: calendarkit has no small tools). Under it the page rows: What = the teams as chips (All teams + 30, East | West by division; logo + tricode from 1600 px, logo only below) and How = the existing switches with the date controls. No dropdowns left (the team picker is gone, also in the Cup's Team schedule). Every state in the address: the standings' column set is new there (`set=`). The <100 ms click check, layout shift, names on icon buttons and 390 px are tested (e2e/nav.spec.ts, perf.spec.ts); clicks paint in 35–78 ms.
- CK-23: "⧉ Pop out live scores" in the Slate's tools row (Chrome / Edge; hidden elsewhere). A 320 px always-on-top window with the Slate's day: before the first game a countdown to it ("First game · BOS @ DET 20:00", 1:23:45), then one line per game — tip-off, red "LIVE Q3 4:12" with the score, or Final / Final/OT. CK-21's live data and polling rules. The window stays open when you change view or place; the button closes it.
- CK-24: Standings has a season strip (What): This season, then 2025-26 back to 2001-02. A past season shows its final standings (West | East, the Main columns), the play-in (2020-21 on), the full bracket (hover or click a series for its games, each linking to that day's scores on NBA.com) and the champions and conference winners of every season (click one to open it). Data: ESPN's free feeds into public/data/history/, loaded only when a past season is opened. Checked against Basketball-Reference for 2001-02, 2007-08, 2010-11, 2015-16 and 2022-23.

**Conflicts with earlier decisions (flagged, my choice — tell me if you want otherwise):**
- The pinned header plus the page rows take more height than the old 44 px bar. Following the pattern ("page rows scroll away"), the Schedule calendars now fill the window *under the header* once the rows have scrolled off, so their text keeps its size; at the top of the page their last row runs under the window edge by ~60–125 px. Every "fits without page scroll" check now means "fits under the pinned header after that scroll". Cost that remains: the 1-week League Calendar at 1920×911 is drawn at scale 1 instead of 1.05 (tricodes 11 px, not 11.55).
- The two trial menus (rail / packed bar) and their ⓘ switch are gone: the pattern replaces both, so that "which menu" question is closed.
- A shared link still opens on today: the day isn't read from the address (your earlier rule), even though the pattern says every state is in the URL. A reload keeps the day as before.
- The Cup simulator's "Tonight in the Cup" line moved up into the page rows beside How (it pushed the simulator 24 px past one screen).
- CK-24 starts at 2001-02, not earlier: ESPN has standings back to 1984-85, but before 2001-02 its playoff games have gaps and misfiled games (a 1990 Finals with four games, the All-Star game listed as a playoff game), and the bracket checks fail. Going further back needs another source.
- CK-24 game links: NBA.com's scores of that day for every past game. I couldn't check which past games hoopsjunkie has (its bot check blocks me), so none link there yet.

**Blocked:** CK-22 (waits on halftime-timer HT-1), unchanged. **Ideas added:** none.

**To check by hand:** the looks (screenshots of every main page attached in chat, from test-output/nav-shots/), and the pop-out window over another app in real Chrome (tests can only render it inside the page).

## 2026-11-19 — CK-20, CK-21 built

**Built:**
- CK-20 (v1.89.0): outside the Cup section a Cup group game's tag (and its tooltip) is just "NBA Cup": League and Team lists, calendars, the Slate, copies and the gauntlet widget. Inside the Cup section nothing changed ("West A", "Group play · West A", round names). Knockout games keep their round outside the Cup too ("NBA Cup Quarterfinal"), since the spec only takes the group off.
- CK-21 (v1.90.0): live scores. The existing `/calendar/api/odds` answer now also carries the games being played (score, period, clock) from ESPN's scoreboard, so the browser still makes one small same-origin request that the CDN shares (cached 60 s while a game is on or within 15 min of tip-off). The page's odds store asks every minute only while a game **on screen** is live or within 15 min of tip-off and the tab is visible; otherwise nothing polls (one timer waits for the next tip-off). A failed answer keeps what's on screen. Where it shows:
  - League / Team List rows: the red LIVE label with period and clock in the tip-off's column (the row keeps its columns); the score in the final score's places, no winner yet.
  - Team Calendar cells: LIVE, period/clock and the score. League Calendar (1/2 weeks): LIVE in the TV pill's slot, the score in the score slots.
  - Slate (site, copies, gauntlet widget): LIVE + period/clock in the status where the tip-off was, scores by the names. The strip only has room for "Q3 4:12": a longer clock ("Q1 11:48", "2OT 10:59") shows the period alone ("LIVE Q1"), with the full clock in its tooltip; letting it wrap made the card taller than its neighbours.
  - Cup schedule rows, Cup standings squares and the Slate's Cup squares (red edge, LIVE), the season-series popup and the 3-in-4 / B2B / road-trip day strips (LIVE and the score).
  - When the game ends: LIVE goes away and the normal final shows (with OT), no reload.
  Choices I made without asking: LIVE sits in the tip-off column rather than after the score (keeps every row's columns lined up); the Slate's long-clock rule above; the streak popup lists finished games only, so it never shows a live one.

**Blocked:** none. **Ideas added:** none.

**Not done yet:** the gauntlet's pinned calendarkit commit isn't bumped (separate repo). For the minute refresh to start 15 min before tip-off there, the widget should pass the night's games as the third argument of `odds.show(date, allOver, games)`; without it the widget still turns live once ESPN says a game is on (within 10 min), then refreshes every minute. "Hide scores" hasn't shipped, so its rule isn't wired.

**To check by hand:** how the red LIVE label looks during a real game tonight; everything else is tested with a mocked ESPN answer (e2e/live.spec.ts).

## 2026-11-19 — CK-11 built

**Built (v1.88.1):**
- CK-11: the ⇄ note switch in the copy layout shown live (the gauntlet's Slate widget). **Cause:** the corner right of the odds (`SLATE_COPY_HEAD`, 56 px) was sized for the PRE/LIVE/POST label alone; once a note was opened, the label and ⇄ sat side by side (63 px) and slid 7 px left over the odds column. And ⇄ only existed while a note was being typed in. **Fix:** in the copy layout ⇄ sits under the label (right-aligned, 35 px wide), and the live copy shows it on every card at all times; a press switches the space without opening the note. Copied images are unchanged (no ⇄, pixel-identical). The kit's demo page has a `&copy=1` mode that renders the gauntlet's layout, which the new e2e test measures.

**Blocked:** none. **Ideas added:** none.

**To check by hand:** whether ⇄ under the label looks right to you on the whiteboard; the placement is tested.

## 2026-11-19 — CK-19 built

**Built (v1.88.0):**
- CK-19: Standings has a sixth column set, "Ratings": ORtg, DRtg and Net, each with the team's league rank in small text ("115.8 4th"). DRtg sorts lowest first. Possessions and points scored come from ESPN's public team statistics, fetched by the daily data job into `public/data/ratings.json` (scripts/update-ratings.ts). Points allowed come from the schedule the app already has, over the same games. ESPN's games played and points matched the app's schedule for all 30 teams. If ESPN is down, the job keeps yesterday's file and the schedule update still goes through.

**Blocked:** CK-11 (unchanged at the time; built later that day, above).

**Ideas added:** none.

**To check by hand:** nothing new; the numbers and the sort are tested.

## 2026-11-18 — CK-8, CK-9, CK-10, CK-12, CK-13, CK-14, CK-15, CK-16, CK-17, CK-18 built; CK-11, CK-19 blocked

**Built (v1.79.0 → v1.87.0):**
- CK-13 (v1.79.0): "Wolves" and "Blazers" everywhere.
- CK-8 (v1.80.0): the "G2/4" chip is drawn inverted (light fill, dark text) when a team plays the same opponent in consecutive games; its pop-up names the team and the other date. The look was my choice. It is less rare than expected: 76 games this season.
- CK-9 + CK-12 (v1.81.0): the lines between Slate cards are clearly visible; the score follows the team name. The TV pill never touched a line on any night of the season (checked on every night); a test now guards it.
- CK-10 (v1.82.0): "SLATE · 18-11 · NBA" across the top of every Slate, in copies and in the gauntlet's widget. The kit exports `slateHeaderLabel(date, sports)` so footykit's FK-35 can use the same pattern. The date is zero-padded ("05-12").
- CK-14 (v1.83.0): "First tip-off in 2h 14m" beside the notes buttons on the Slate page; hidden once the first game starts; never in copies. The minute clock had been removed earlier, so I added a minute tick to clock.ts that runs only while the countdown shows.
- CK-15 (v1.84.0): a small "⋯" button on each card (in the away row's empty "@" cell, so no width added) opens Player props, both teams' ESPN injury pages and the official NBA injury report. **FanDuel:** a link to one game needs FanDuel's own event ID, which nothing in our data gives, so "Player props" opens FanDuel's NBA player-props tab. All 30 ESPN injury pages were opened once and showed the right team. The team header and the streak pop-up also link the team's injury page.
- CK-16 (v1.85.0): "❄" replaces "⋯" (and shows in copies) when the arena city feels −10 °C or colder at tip-off; the pop-up gives the temperature and "Weather data by Open-Meteo.com". The arena coordinates already existed (src/data/arenas.ts, Wikidata, a source per entry), so I reused them instead of building a new file.
- CK-17 (v1.86.0): the season-series pop-up has ◀ season ▶ back to 2025-26 and 2024-25 (ESPN's free team schedules, 1230 games per season, the Cup Championship left out). Past squares have no game link: ESPN's data has no NBA game ID.
- CK-18 (v1.87.0): Standings: hovering W-L (W or L in Main), Left, Home, Road, B2B or a B2B-legs record lists those games, each a link to the game; a click pins the pop-up.

**Blocked:**
- CK-11: which button is meant? calendarkit's own "Show notes / Hide all notes" is already always visible and nowhere near the odds. The show/hide button that appears only sometimes is the gauntlet's (its date bar shows only while the widget is selected), so it belongs in the gauntlet's backlog. A related calendarkit issue I found: in the gauntlet's live copy, each card's ⇄ switch shows only while a note is being edited, and then it covers the odds. Say if that is the one meant.
- CK-19: step 1 is done; waiting for your go. Free source: ESPN's public team statistics give season possessions and points (BOS: 1387.9 possessions, 1607 points → ORtg 115.8). DRtg would use the points allowed we already have. I did not use NBA.com's stats site because it blocks scripts.

**For the gauntlet:** the game button, the ❄ flag and the season switch reach the whiteboard only once the gauntlet passes `gameMenu` / `cold` and renders `useGameLinksPopup`. The header line and the visual changes reach it automatically.

**Ideas added:** none.

**To check by hand (can't be automated):** whether the inverted series chip, the stronger divider lines and the "⋯" / "❄" button read well to you. Their behaviour is all tested.
