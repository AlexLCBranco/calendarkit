# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-9 — Slate: clearer lines between cards, never under the TV pill
**What:** on the Slate (the /slate page and the gauntlet's Slate widget) the dividing lines between cards are too faint. Make them clearly visible, and make sure no line runs under the national-TV pill (`ck-slate-tv-pill`). If the pill has to be toned down (smaller, lighter, moved) for that, do it.
**Tests:** e2e: the line between two cards has visible contrast; the TV pill's box doesn't overlap any divider; no card changes size.

### CK-10 — Slate header line
**What:** a header line at the top of every Slate, e.g. "SLATE · 18-11 · NBA" (date as day-month). Shows in the gauntlet widget and in copied images. Use the same pattern footykit will use (FK-35) so a combined Slate can say "SLATE · 18-11 · NBA + Football".
**Tests:** unit for the label; e2e that the header shows on /slate and in a copied image.

### CK-11 — Slate: notes switch always available, never over the odds
**What:** the button that shows/hides the game descriptions (notes) on the Slate is always visible (not only on hover or in some states) and never sits on top of the odds column.
**Tests:** e2e: button visible with notes on and off; its box doesn't overlap any odds cell.

### CK-12 — Slate: score right beside the team name
**What:** on a Slate card the final score sits right after the team's name instead of in its own track near the odds (same change footykit made in FK-31). Live (gauntlet) and copied images.
**Tests:** e2e: score's left edge is within a few px of the name's right edge on a finished game; card width unchanged.

### CK-14 — Countdown to the first tip-off on the Slate page
**What:** on the Slate *page* (/slate, not inside the Slate itself, so never in copied images), a countdown to the first game's tip-off of that night ("First tip-off in 2h 14m"); once it's started, hide it. Reuse the one-minute clock (`src/components/clock.ts`).
**Tests:** unit for the text at fixed times; e2e that it's on the page and not in the copied image.

### CK-15 — Slate game button: player props and injury reports
**What:** each Slate card gets a small game button that opens a pop-up with links (no betting inside the app, links only):
- "Player props" → FanDuel's NBA player-props page. Linking to the exact game needs FanDuel's own game ID; if Claude Code can't find a reliable way to build that URL, link to FanDuel's NBA props section and say so in the report.
- "BOS injuries" / "DEN injuries" → each team's ESPN injury page (verify the URL format for all 30 teams in a test).
- "Official NBA injury report" → official.nba.com/nba-injury-report.
Use the same team injury link anywhere else a team's name already has room for it (team header, popups). Must not add width to the card.
**Tests:** unit: all 30 ESPN URLs built and well-formed; e2e: the button opens the pop-up with the 4 links; card size unchanged.

### CK-16 — Cold-weather flag on games
**What:** flag a game when it's extremely cold in the arena's city at tip-off (it matters for the players' travel even indoors). Weather from Open-Meteo (free, no key, non-commercial; attribution "Weather data by Open-Meteo.com" required, CC BY 4.0). Needs coordinates for the 30 arenas: build them once into a config file from a real source with the source kept per entry (like footykit's `scripts/make-venues.ts`), never guessed. Threshold: start at −10 °C feels-like and put it in one constant. Only a small mark plus the temperature in the game's popup; nothing when it's not cold.
**Tests:** unit for the threshold rule and the 30 coordinates present; one live check that Open-Meteo answers for one arena.

### CK-17 — Season-series popup: other seasons
**What:** the season-series popup ("BOS – DEN · 2 meetings", image `docs/backlog-img/CK-17-series-popup.png`) gets ◀ season ▶ buttons to switch to earlier seasons' meetings between the same two teams. Default is the current season; up to 2 seasons back (older matters little, rosters change). First check whether the free data source actually has earlier seasons' games; if it doesn't, mark this item `Blocked:` with what's missing and stop.
**Tests:** unit for picking a season's meetings; e2e: switching season changes the list and the count.

### CK-18 — Standings: hover and click to reach the games
**What:** in the Standings view (image `docs/backlog-img/CK-18-standings.png`), the numbers become ways into the games: hovering a team's W-L shows its last 5 results (each a game link, like the streak popup); hovering a Remaining number (Left, Home, Road, B2B) or a B2B-legs record lists those games (each a game link). Click pins the popup like the other popups. Team name still opens the Team view.
**Tests:** unit for which games each cell lists; e2e: hover opens the right popup, a link in it points to the game.

### CK-19 — Standings: offensive and defensive rating
**What:** a new column set in Standings (`COLUMNS` in `src/components/Standings.tsx`), group "Ratings": ORtg (points scored per 100 possessions), DRtg (points allowed per 100 possessions, lower is better, sorts ascending) and Net (ORtg − DRtg), each with the team's league rank in small text. Both tables side by side as usual.
Step 1, then stop and report: find a free source for team possessions (NBA.com's team advanced stats, or team box score totals to estimate possessions), fetched at build time like `schedule.json` if the browser can't call it. If it's not free or too hard, don't build it and don't mark it Blocked: move it to `IDEAS.md` (next free I ID) with one line on why (e.g. "not possible: no free source"), cut it from the backlog, and say so in the report.
**Tests:** unit: possessions/rating math from a fixture; e2e: the Ratings set shows ORtg, DRtg, Net for all 30 teams and sorting DRtg puts the lowest first.
