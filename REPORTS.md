# Reports — calendarkit

Build reports, newest first (CLAUDE.md, "Feature backlog, built list and ideas").

## 2026-11-19 — CK-19 built

**Built (v1.88.0):**
- CK-19: Standings has a sixth column set, "Ratings": ORtg, DRtg and Net, each with the team's league rank in small text ("115.8 4th"). DRtg sorts lowest first. Possessions and points scored come from ESPN's public team statistics, fetched by the daily data job into `public/data/ratings.json` (scripts/update-ratings.ts). Points allowed come from the schedule the app already has, over the same games. ESPN's games played and points matched the app's schedule for all 30 teams. If ESPN is down, the job keeps yesterday's file and the schedule update still goes through.

**Blocked:** CK-11 (unchanged, see below).

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
