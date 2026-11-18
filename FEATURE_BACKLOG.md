# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-8 — Mark back-to-back meetings with the same opponent

**What:** some teams meet in consecutive games (example: Tuesday BOS vs MIA is G3/4, Friday BOS vs MIA is G4/4,
no other game for either team in between). Mark both of those games so it is visible at a glance. Rare, so it
must cost no space.

**Rule:** a meeting is marked when the previous game of **both** teams was against each other (consecutive in
each team's own schedule, any number of days apart, not only calendar B2Bs). Mark both games of the pair (the
first one too, so it is visible before the rematch). Uses the same series as the "G2/4" chip (regular season,
`src/data/series.ts`); computed once per data set like `leagueSeries`.

**Where / how:** on the existing season-series chip (`SeriesChip` in `src/slate/series.tsx`, used by `GameCard`
and `SlateCard`), so every view and the Slate get it, including copied images. No new element, no extra width
or height on any card: change the chip's look only (for example a distinct color/outline different from the
B2B yellow; pick one that reads clearly in the copied image). The chip's tooltip/pop-up adds one line:
"Back-to-back meeting: also played <Tue Nov 18> / plays again <Fri Nov 21>".

**Tests:** unit test for the rule (both-teams-consecutive marked; one team played someone in between → not
marked; first and second game of the pair both marked); e2e check that the chip on a marked game has the marked
style and no card changes size.
