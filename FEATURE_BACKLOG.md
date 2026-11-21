# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-22 — Countdown to the Slate's first game (halftime-timer)
**In short:** The Slate gets a "⏱ Countdown" button that opens halftime-timer with a timer counting down to the day's first tip-off.
**What:**
- Button in the Slate header (site and, through the package, the gauntlet Slate widget). Opens halftime-timer in a new tab with an end-time timer set to the first game's start, named e.g. "First game · BOS @ DET 20:00".
- If the first game has already started, it counts to the next game that hasn't, and the timer name says so ("Next game · …"). If none is left: button disabled, tooltip "No more games today".
- Uses the link format from halftime-timer HT-1.
Blocked: waits for halftime-timer HT-1 (its link format and live URL); the owner unblocks it once HT-1 ships.
**Tests:** unit: first / next not-started game, link built correctly; e2e: the button's link points to halftime-timer with the right time and name.

### CK-33 — Header: team picker instead of chips, every control above the line
**In short:** The 30 team chips go away; a team box that opens the old list of teams by division comes back, with an "All teams" button always on screen beside it, and every control sits in the tabs row so nothing is left under the header line and the calendar boxes are tall again.
**From I-6**
**Why:** CK-25 (v1.91.0) doubled the header to 92px and then put the chips, How, the dates and the team title under it. On the owner's window the month started about 120px lower and each day box lost about 25px. Owner's rules (2026-11-21): nothing crosses the header line, the line never moves down, no always-on-screen chips.
**Pictures:** `docs/design/DESIGN_LOG.md`. Target is mock C (`docs/design/shots/2026-11-21-mock-C-picker-plus-all-teams.png`); the panel is `2026-11-20-v1.90.0-picker-open.png`. Mock C was made by moving elements in the browser: follow its layout, not its pixels.
**What:**
- The header stays exactly 92px tall with its two rows. It may never get taller.
- Row 1: unchanged (back / forward, breadcrumb with the full team name, Go anywhere, icon buttons).
- Row 2, left to right: Schedule / Cup / Standings tabs · "All teams" button · team picker · "Injuries ↗" (team pages only) · List / Calendar / Slate · 1 week / 2 weeks / Month · month arrows with the month name, date picker and Today. Same controls as today on each page; a control that a page doesn't have today is simply absent.
- "All teams" button: always on screen wherever the picker is. One click opens the league view. Lit when the league view is open.
- Team picker: the v1.90.0 picker (logo + full team name + ▾). It opens the same panel as v1.90.0: six divisions in three columns (East: Atlantic, Central, Southeast; West: Northwest, Pacific, Southwest), each team with logo and full name, the open team highlighted. The panel no longer has an "All teams" entry (the button replaces it). On the league view the box shows a "Pick a team" style placeholder.
- The team chips are removed everywhere they appear (Schedule and the Cup's Team schedule); the picker takes their place.
- The big team title row under the header (logo, "Los Angeles Lakers", Injuries) is removed. The picker and breadcrumb already name the team.
- The month name between the arrows keeps a fixed width so the arrows don't jump between months.
- Same rule on every page (Cup, Standings and their sub-pages): the page's controls go in row 2 and nothing sits between the header line and the page content. If a page's controls can't fit row 2 on a 1912px-wide window without shrinking text or wrapping, leave that page as it is and add a `Blocked:` note naming the page and what doesn't fit.
- Calendar boxes: the freed height goes to the day boxes. On a 1912×913 window the Lakers' November 2026 month has boxes at least 145px tall (v1.90.0 had about 145, v1.92.1 has about 120, mock C has 147) with no page scrolling.
- When this ships, add an entry and a screenshot to `docs/design/DESIGN_LOG.md` (rules at the top of that file).
**Sibling:** FK-75 in footykit (same layout, keep the two looking the same).
**Tests:** e2e at 1912×913 on the Lakers month: header is 92px tall; no team chips anywhere; nothing with controls between the header and the weekday names; a day box is at least 145px tall; the page doesn't scroll; "All teams" opens the league view and is lit there; the picker opens the six-division panel and choosing a team opens that team in Calendar.

### CK-34 — Back-to-back plane readable as a plane
**In short:** The small plane on back-to-back chips gets big and clear enough to read as a plane at a glance, instead of looking like an "x".
**Why:** On a v1.92.1 screenshot of the Mavericks' November month (2026-11-21) the plane on chips like "1/2 · HA" read as "✕". The rule behind it is right and stays as is (plane only when the team changes metro between the two nights).
**What:**
- Every place the back-to-back plane is drawn (team chips, the opponent row's chips, league views, Slate): the plane is at least as tall as the chip's own letters and is recognisably a plane at 100% zoom on a 1912px-wide window.
- The chip may get a little wider for it; it may not get taller, and day boxes may not grow.
- No change to when the plane shows, to the HH/HA/AH/AA letters, or to the tooltip.
**Tests:** e2e on a team month with a travelling back-to-back: the plane's rendered height is at least the chip text's height, on both the team chip and the opponent-row chip; a same-metro back-to-back (Lakers then Clippers) still shows no plane.
