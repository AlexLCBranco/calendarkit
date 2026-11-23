# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-43 — Cup history: each season laid out like the Groups page, plus a full-screen bracket
**In short:** Each past season in Cup › History looks exactly like the Groups page with a small knockout bracket where "Who advances" sits, and a Groups | Bracket switch opens a full-screen bracket with everything about each knockout game; no scroll bar anywhere.

Owner's request (2026-11-23, chat, with a screenshot of Cup › Groups v1.96.0).

**A. The season page (Groups view)**
- Each past season's page in Cup › History uses the same layout as Cup › Groups: the six group panels (West A/B/C over East A/B/C) with the same rows (star / WC badge, the four game squares, W, L, DIFF), showing that season's final group tables.
- The wide bottom-left panel (where Groups shows "Who advances") shows instead that season's knockout bracket, small: the teams that advanced, QF → SF → Final, with results. Clicking the panel's empty area or its title opens the full-screen bracket (B); games and teams inside it keep the usual click rule.
- The bottom-right "Wild card race" panel stays in its place, showing that season's final wild-card race (West | East).
- If the small bracket panel has leftover space, add a short summary of that season's rules ONLY where they differed from the current rules. If nothing differed, show nothing extra (no filler).
- NO scroll bar: neither the page nor the bracket panel may scroll at the owner's full-size desktop window. If things don't fit, cut the rules summary first, then the extras (prize lines, venues), never the bracket itself.

**B. The full-screen bracket (Bracket view)**
- Each season gets a Groups | Bracket switch. Bracket shows only that season's knockout bracket, as big as the window allows, no scroll bar (page or panels). It is a real page-history entry (back/forward work) and sets the tab title.
- Layout: West on one side, East on the other, QF → SF → Final toward the center, the champion shown large at the center.
- Every game box shows, always on screen (not in hover):
  1. Both teams with logo and tricode, the score, the winner highlighted, an OT marker when the game went to overtime.
  2. The game's date.
  3. Venue: arena and city, with a clear host tag (which team is at home) or neutral-court tag.
  4. How each team got there: its group, how it qualified (group winner or wild card), group record and group point differential.
  5. Prize money for the round (the same lines the history bracket shows today).
  6. Click rule as everywhere: the game opens its game page (hoopsjunkie, or NBA.com for seasons hoopsjunkie doesn't cover), a team name or logo opens that team's schedule.
  7. Each team's rest days and travel before the game (the same line the current Cup's knockout games use, e.g. "2d rest · ✈ 1,140 mi, ET→CT").
  8. Each team's overall season record going into the game.
  9. Each team's seed (1 to 4 in its conference), by that season's own seeding rules.
- Items 7, 8 and 9 are not stored for past seasons today. Get them from the NBA's own data (past seasons' schedules and results; that season's published seeding rules) in the history build script, never recomputed with today's rules and never guessed. If one of them can't be got for a season, leave it out for that season, keep the rest, and say which in the report.
- Left out on purpose: top scorers / box-score stats, national TV badge.
- Leftover space: the same per-season rule-differences summary as in A (only if something differed).
- If everything doesn't fit without scrolling, shrink in this order: rules summary, prize lines, item 8, item 4's point differential. Never drop teams, scores, dates, venue tags or rest/travel.

**Rules summary (A and B)**
- The differences must come from the NBA's own published rules for that season, never from memory; if a season's rules can't be confirmed, leave the summary out for that season and say so in the report.

**Not part of this item**
- The "who usually makes the cut" summary table of History stays as it is.

**Tests (automatic)**
- For every stored season, at the desktop viewport, in both Groups and Bracket views: no vertical or horizontal overflow on the page or in any panel.
- Both brackets show all 8 knockout teams and 7 games; the full bracket shows items 1 to 6 for every game, and 7 to 9 wherever the data exists.
- The switch, the click-through from the small bracket, and back/forward between the two views.
