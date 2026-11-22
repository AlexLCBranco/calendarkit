# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-35 — Season-series popup: past-season games are clickable
**In short:** In the season-series popup, every game of an earlier season opens that game's date on NBA.com in a new tab, instead of being a dead square.
**What:** today the past-season squares (`PastSquare` in `src/slate/series.tsx`: regular season, play-in and playoff games) have no link, because ESPN's past-season data has no NBA game id, so there is no hoopsjunkie page to point to. Owner's rule (2026-11-19, confirmed 2026-11-22): when hoopsjunkie isn't available, the game links to NBA.com. Make the whole square a link, new tab, to NBA.com's games page for the game's date, the same link the NBA History page already uses (`pastGameUrl` in `src/data/nbaHistory.ts`, `https://www.nba.com/games?date=YYYY-MM-DD`). Same hover look as this season's squares (no underline), title "Open on NBA.com". This season's squares keep their hoopsjunkie link. The link must work everywhere the popup shows, including the Slate kit the gauntlet loads (gauntlet GT-22).
**Tests:** e2e: switch the popup to an earlier season; every regular-season, play-in and playoff square is a link to `nba.com/games?date=` with that game's date, opening in a new tab; this season's squares still link to hoopsjunkie.
