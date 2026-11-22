# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-35 — Season-series popup: past-season games are clickable
**In short:** In the season-series popup, every game of an earlier season opens that game's date on NBA.com in a new tab, instead of being a dead square.
**What:** today the past-season squares (`PastSquare` in `src/slate/series.tsx`: regular season, play-in and playoff games) have no link, because ESPN's past-season data has no NBA game id, so there is no hoopsjunkie page to point to. Owner's rule (2026-11-19, confirmed 2026-11-22): when hoopsjunkie isn't available, the game links to NBA.com. Make the whole square a link, new tab, to NBA.com's games page for the game's date, the same link the NBA History page already uses (`pastGameUrl` in `src/data/nbaHistory.ts`, `https://www.nba.com/games?date=YYYY-MM-DD`). Same hover look as this season's squares (no underline), title "Open on NBA.com". This season's squares keep their hoopsjunkie link. The link must work everywhere the popup shows, including the Slate kit the gauntlet loads (gauntlet GT-22).
**Tests:** e2e: switch the popup to an earlier season; every regular-season, play-in and playoff square is a link to `nba.com/games?date=` with that game's date, opening in a new tab; this season's squares still link to hoopsjunkie.

### CK-36 — Holiday / big-date label opens that day's Slate
**In short:** Clicking a holiday or big-date label (Thanksgiving, Christmas, MLK Day, Cup knockout nights...) anywhere in the app opens the league Slate for that day.
**What:** today the label (`BigDayLabel` in `src/slate/bigDay.tsx`, added in CK-32) is plain text with a hover sentence. Make it a link to the league Slate of its date, same tab, pushed to history so the back arrow returns to where the owner was. Applies everywhere the label shows: team calendar cells (`TeamMonthGrid`), the month navigator (`MonthNavigator`), the league week view (`LeagueWeekView`) and the league list day heading (`LeagueListView`). In a team view the click leaves the team and goes to the league Slate (all games of that day). The label in the Slate's own header (`SlateCard`) is already on that day: it stays as it is, not a link (also the case inside the gauntlet's Slate widget, which is pinned to its date). Keep the hover sentence; pointer cursor, no underline on hover (owner dislikes it). The click must not also trigger the cell/day click behind it. The star on game cards (`BigDayMark`) is not part of this item.
**Tests:** e2e: in a team calendar, the league week view and the league list, click a big-day label; the league Slate opens on that label's date; browser back returns to the previous view. The Slate header's label is not a link.
