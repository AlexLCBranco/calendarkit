# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-43 — Cup history: each season laid out like the Groups page, bracket where the rules are
**In short:** Each past season in Cup › History looks exactly like the Groups page, with that season's knockout bracket in the spot where "Who advances" sits, and no scroll bar anywhere.

Owner's request (2026-11-23, chat, with a screenshot of Cup › Groups v1.96.0).

- Each past season's page in Cup › History uses the same layout as Cup › Groups: the six group panels (West A/B/C over East A/B/C) with the same rows (star / WC badge, the four game squares, W, L, DIFF), showing that season's final group tables.
- The wide bottom-left panel (where Groups shows "Who advances") shows instead that season's knockout bracket: the teams that advanced, QF → SF → Final, with results. Reuse what the history bracket already shows today (results, venues, prize lines) as long as it fits.
- The bottom-right "Wild card race" panel stays in its place, showing that season's final wild-card race (West | East).
- If the bracket panel has leftover space, add a short summary of that season's rules ONLY where they differed from the current rules. If nothing differed, show nothing extra (no filler). The differences must come from the NBA's own published rules for that season, never from memory; if a season's rules can't be confirmed, leave the summary out for that season and say so in the report.
- NO scroll bar: neither the page nor the bracket panel may scroll at the owner's full-size desktop window. If the bracket plus the rules summary don't fit, cut the rules summary first, then the extras (prize lines, venues), never the bracket itself.
- The "who usually makes the cut" summary table of History is not part of this request: leave it as it is.
- Test automatically: for every stored season, at the desktop viewport, assert the page and the bracket panel have no vertical or horizontal overflow, and that the bracket shows all 8 knockout teams.
