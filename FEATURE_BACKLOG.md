# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-11 — Slate: notes switch always available, never over the odds
**What:** the button that shows/hides the game descriptions (notes) on the Slate is always visible (not only on hover or in some states) and never sits on top of the odds column.
**Tests:** e2e: button visible with notes on and off; its box doesn't overlap any odds cell.
**Blocked:** which button is meant? calendarkit's own one ("Show notes" / "Hide all notes" in the toolbar above the cards on /slate) is already always visible and far from the odds. The one that shows only in some states is the gauntlet's: its date bar (`DateBar` / `toggleSlateNotes` in gauntlet `src/slate/SlateWidget.tsx`) appears only while the widget is selected, so it belongs in the gauntlet's backlog. (Also seen: in the gauntlet's live copy each card's ⇄ switch shows only while a note is being typed in, and the room kept for it, `SLATE_COPY_HEAD` 56 px, fits the PRE/LIVE/POST label only, so the ⇄ then covers the odds. If that is the one meant, say so and it is a calendarkit fix.)

### CK-19 — Standings: offensive and defensive rating
**What:** a new column set in Standings (`COLUMNS` in `src/components/Standings.tsx`), group "Ratings": ORtg (points scored per 100 possessions), DRtg (points allowed per 100 possessions, lower is better, sorts ascending) and Net (ORtg − DRtg), each with the team's league rank in small text. Both tables side by side as usual.
Step 1, then stop and report: find a free source for team possessions (NBA.com's team advanced stats, or team box score totals to estimate possessions), fetched at build time like `schedule.json` if the browser can't call it. If it's not free or too hard, don't build it and don't mark it Blocked: move it to `IDEAS.md` (next free I ID) with one line on why (e.g. "not possible: no free source"), cut it from the backlog, and say so in the report.
**Tests:** unit: possessions/rating math from a fixture; e2e: the Ratings set shows ORtg, DRtg, Net for all 30 teams and sorting DRtg puts the lowest first.
**Blocked:** step 1 done, waiting for the owner's go to build. Source found, free: ESPN's public team statistics (sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/<year>/types/2/teams/<id>/statistics) give each team's season `possessions` and `points` (BOS on 2026-11-18: 1387.9 possessions, 1607 points → ORtg 115.8). DRtg = points allowed (already in the standings) per 100 of the same possessions. Fetched in the daily data job into its own file (one request per team), as schedule.json is. NBA.com's stats site was not used: it turns away scripts (bot detection), the same reason the site never fetches the NBA feed itself.
