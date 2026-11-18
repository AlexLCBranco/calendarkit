# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-8 — Mark back-to-back meetings with the same opponent

**What:** some teams meet in consecutive games (example: Tuesday BOS vs MIA is G3/4, Friday BOS vs MIA is G4/4,
no other game for either team in between). Mark both of those games so it is visible at a glance. Rare, so it
must cost no space.

**Rule (per team):** a team's game is marked when that team's previous game was against the same opponent
(consecutive in that team's own schedule, any number of days apart, not only calendar B2Bs). Checked for each
team separately: if BOS played MIA twice in a row but MIA played someone else in between, only BOS gets it. Mark
both games of the pair for that team (the first one too, so it is visible before the rematch). Uses the same
series as the "G2/4" chip (regular season, `src/data/series.ts`); computed once per data set like `leagueSeries`.

**Where / how:** on the existing season-series chip (`SeriesChip` in `src/slate/series.tsx`, used by `GameCard`
and `SlateCard`), so every view and the Slate get it, including copied images. No new element, no extra width
or height on any card: change the chip's look only (for example a distinct color/outline different from the
B2B yellow; pick one that reads clearly in the copied image). The chip is marked when at least one of the two teams has the
mark; its tooltip/pop-up adds one line per marked team, naming it: "BOS: back-to-back meeting, also played
<Tue Nov 18> / plays again <Fri Nov 21>". In a team's own schedule views, the chip is marked only when the open
team is one of the marked teams.

**Tests:** unit test for the rule (both teams consecutive → both marked; only one team consecutive → only
that team marked; first and second game of the pair both marked; team view of the unmarked team → chip not
marked); e2e check that the chip on a marked game has the marked
style and no card changes size.
