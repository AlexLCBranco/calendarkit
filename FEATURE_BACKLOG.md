# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

Items CK-38 to CK-42 are one redesign of the **team calendar, Month range** (`.ck-team-month`), designed live in the owner's
browser on 2026-11-22 by editing the real page. Scope: team calendar Month only (except CK-41, which is site-wide). League views, List, Slate and
the team 1 week / 2 weeks ranges must look exactly as they do now; if they share the cell component, branch on the range.
Reference pictures of the agreed result (window 1920 wide, about 855 tall, v1.95.0 underneath):
`docs/mocks/ck-38-team-month-fatigue-off.jpg` (whole page: header line, TV highlight, fatigue info off) and
`docs/mocks/ck-39-cells-fatigue-on-closeup.png` (three cells with fatigue info on). Where a picture and the text
disagree, the text wins. Hard rule for all five: the page never scrolls vertically at the owner's full-size window, in
5-week and 6-week months (6-week months were not tried in the mock: test one).

### CK-38 — Team month: header line with team name, record, standing and centred month
**In short:** Above the team's month calendar there is a big line with the team's full name, its record and its place in the conference on the left, and the month centred over the grid, all clickable.
- New line between the toolbar and the weekday names, three columns `1fr auto 1fr`, baseline-aligned:
  left = team full name (about 34px, weight 800), then record (about 24px, tabular numbers, e.g. `14-3`), then
  placement (about 18px, dimmed, e.g. `1st West`); centre = month and year (about 26px, weight 700, e.g. `November 2026`);
  right = empty.
- The owner knows the team name is now on screen three times (breadcrumb, picker, this line) and wants it. Keep the
  breadcrumb and the picker as they are. Keep the small month label between the toolbar arrows too.
- Record and placement come from the same code that feeds the Standings page, so they can never disagree with it
  (same tie-breaks). Do not compute them a second way.
- Everything hovers and clicks: each of the four pieces gets a soft highlight on hover (rounded, `rgba(255,255,255,.09)`),
  a pointer cursor and a tooltip. Team name opens the team picker; record and placement open Standings; month opens the
  date picker.
- The line follows month and team changes.

### CK-39 — Team month: cleaner game cells (one-line matchup, one logo line per team, bigger text)
**In short:** Each game in the team's month calendar becomes four tidy lines: time, the matchup with scores on one evenly spaced line, then one line per team that starts with that team's logo and shows its streak and fatigue chips.
Cell layout, top to bottom (the day number and road trip / homestand label row stays as it is):
1. Time (with its `(+1)` mark), then the game-level chips `Cup` and `TV` on the same line.
2. Matchup on ONE line, in the current order `[logo] LAL 131 vs 125 TOR [logo]` (upcoming: `[logo] LAL @ SAS [logo]`).
   - Even spacing: drop the fixed-width slots for team, score and `vs`/`@`; every piece sits one equal gap (about 6px)
     from the next, so a name sits right next to its own score.
   - This line is the biggest text in the cell: about 22% bigger than today (team and score about 14.6px where they are
     12px now). Everything else in the cell about 6% bigger than today.
   - It must never wrap to a second line.
   - The opponent's record is no longer printed in the cell. It shows on hover of the matchup line and of the opponent's
     abbreviation, e.g. `TOR record: 3-3`.
3. Calendar team's line: its logo, then its streak chip (`W1`), then its chips as today (back-to-back, N-in-M, rest days).
4. Opponent's line: its logo, then its streak chip, then its chips. Same chip styles and sizes as line 3, no grey bar
   behind it, no repeated abbreviation, no record.
- The logo at the start of lines 3 and 4 is what tells the two lines apart; it is the same size as the matchup logos
  and clickable like every team logo (team's schedule).
- Streak on both lines, on every game. Finished games: the streak after that game (as today for the calendar team).
  Upcoming games: each team's current streak, on every upcoming game, not only the next one. The opponent's streak is
  already known to the cell (today it is only in the opponent line's hover text).
- If a team has nothing to show on its line, leave the line out.
- Lines 3 and 4 never wrap. The mock had no wraps in November and December 2026 for LAL.
- Sizes above are what fit a 5-week month with no vertical scroll at a 1920 by 855 window with CK-38's line in place.
  If a 6-week month would scroll, shrink the cell text for that month only as far as needed; never add a scrollbar.
- Keep every hover pop-up and click target the chips and teams have today.

### CK-40 — Team month: TV games get the Slate's green highlight
**In short:** In the team's month calendar, a nationally televised game's whole cell gets the same green border and faint green tint the Slate uses for TV games.
- Reuse the Slate rule's exact look (`.ck-slate-card.ck-slate-tv`): `box-shadow: inset 0 0 0 2px var(--ck-tv)` and
  `background: linear-gradient(var(--ck-tv-tint), var(--ck-tv-tint)), var(--ck-surface-2)`, applied to the day cell.
- Finished TV games get it too. The `TV` chip stays.
- If a TV game is on today's cell, today's blue outline stays as it is and the cell only gets the green tint.

### CK-41 — Team logos without the white circle, everywhere
**In short:** Team logos across the whole site sit directly on the dark background with no white circle behind them, with a hairline light outline so dark logos stay visible.
- Everywhere a team logo has the light disc today (`.ck-logo-backing` background and any equivalent): league and team
  views, List, Calendar, Slate, Cup, Standings (page and quick pop-up), the team picker, pop-ups and the map. This item
  is site-wide, unlike CK-38 to CK-40 and CK-42.
- Remove the disc: transparent background, no border, no shadow. Keep the logo's size and position so nothing shifts.
- Add a thin light outline that follows the logo's own shape. The mock (team month view only) used, on the `img`:
  `filter: drop-shadow(0 0 .6px rgba(255,255,255,.95)) drop-shadow(0 0 .6px rgba(255,255,255,.7))`.
- Every logo must be easy to make out at every size it is shown. In the mock UTA and CHA were fine, SAS and MEM were
  still faint at cell size: strengthen the outline (for all logos, or for dark logos only) until those two read
  clearly, and check all 30 in each view.
- "Copy as image" output (transparent background, pasted onto the gauntlet whiteboard): keep the circles there for
  now. The outline is tuned for this site's dark background and was not tried on the whiteboard.

### CK-42 — Team month: "Fatigue info" on/off option
**In short:** A new "Fatigue info" switch in Options hides the two per-team lines (streaks and fatigue chips) in the team's month calendar, and the remaining time and matchup text grows to use the space.
- One switch only, in the Options menu, on by default, remembered between visits. If Options already has something
  that overlaps, extend that instead of adding a second control.
- Off: lines 3 and 4 of CK-39 are hidden in every cell (streaks included). Time line, `Cup`/`TV` chips, matchup line,
  CK-40's highlight and all hovers stay.
- Off also scales the cell text up as far as it goes without the matchup line wrapping or touching the cell edge and
  without vertical scroll. In the mock that was about 40% bigger than today (team and score about 16.8px), limited by
  the finished-game line's width. Do not stack the two teams to gain more size.
- On: exactly CK-39.
