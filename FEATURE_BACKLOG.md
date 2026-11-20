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

### CK-26 — Cup label on a card opens the Cup page
**In short:** Clicking the "Cup" label on any game card takes you to the NBA Cup page.
**What:**
- Everywhere a game shows the NBA Cup label (Slate cards, League List, Team List, calendars, popups): a click opens the Cup section, on that game's group (group games) or on the bracket (knockout games).
- Pointer cursor and a tooltip "Open the NBA Cup page". Same in the gauntlet Slate widget (through the package).
- Fits the click rule: every label does something.
**Tests:** e2e: clicking the Cup label on a Slate card and on a League List row lands on the Cup page with that group in view; a knockout game lands on the bracket.

### CK-27 — Hovering the Cup label on the Slate shows the group
**In short:** Hovering the "Cup" label on a Slate card pops up that game's Cup group: the standings with every team's Cup record.
**What:**
- Popup on hover of the Cup label (Slate first; reuse it wherever the label is shown if it costs nothing): the group table as on the Cup page (place, team, Cup W-L, point difference, who goes through), the two teams of this game highlighted.
- Teams in different groups (not possible in group play, possible later): show both groups side by side. Knockout games: show the bracket path of the two teams instead.
- Same popup behaviour as the others (opens fast, closes within 100 ms, click pins it; a click on the label itself still goes to the Cup page, CK-26). Works inside the gauntlet Slate widget.
**Tests:** unit: popup data for a group game matches the Cup standings; e2e: hover on a Cup night shows the group with both teams highlighted.

### CK-28 — Team record on the Slate opens that team's games list
**In short:** Clicking a team's record (e.g. "9-4") on a Slate card opens that team's List view, with every game and the rest days.
**What:**
- Record click → Team List for that team, "Show rest days" on, scrolled to today (the month that holds the Slate's date). Team name and logo keep going to the Team Calendar (existing click rule).
- Tooltip on the record: "All BOS games". Same in the gauntlet Slate widget (opens calendarkit in a new tab there).
- Apply the same rule to every other place a team's record is shown next to a matchup (League List).
**Tests:** e2e: clicking the record on a Slate card opens Team List for that team with rest-day rows visible and today in view.

### CK-29 — Team Calendar cells show the opponent's situation
**In short:** In a single team's calendar, each game cell also tells you about the opponent (record, streak, tired or rested), not only about the team you opened.
**What:**
- Today the labels in the Team Calendar cells describe the calendar's team (B2B, 3-in-4, rest days, road trip). Add, per game cell, the opponent's side: record and streak going into the game, B2B leg (HH/HA/AH/AA), 3-in-4, and rest days when 2+.
- Always on screen without hover, clearly split so it's obvious which team a label is about (e.g. the opponent's labels sit on the opponent's line beside its logo, the team's own stay where they are). Same colours as elsewhere (B2B yellow).
- Must fit week, 2-week and month ranges; in month cells keep it to record + tired/rested marks, the rest on hover.
**Tests:** unit: opponent fatigue/rest/record computed for a known date; e2e: a known game cell shows the opponent's B2B mark and record.

### CK-30 — One menu layer: view controls beside the team menu
**In short:** The List / Calendar / Slate buttons, the month arrows, Today and the 1 week / 2 weeks / Month buttons move to the right of the team chips, so the menu is one block and team calendars need no scrolling.
**What:**
- Today the "HOW" row sits under the two "WHAT" team rows (a second menu layer). Move the HOW controls into the empty space to the right of the team chips, using the same two rows' height (e.g. view + range on the first line, date arrows + Today on the second). No third row.
- Owner always uses a full-size desktop window; design for that. Narrower windows may wrap back under.
- Goal check: on a 1920 × 1080 window, a Team Calendar month shows completely without scrolling the page.
**Tests:** e2e at 1920 × 1080: HOW controls sit right of the team chips and the header is no taller than the two team rows; Team Calendar month fits without page scroll.

### CK-31 — Season-series popup: playoff games in past seasons
**In short:** When you look at two teams' meetings in a past season, their playoff games are there too, in their own colour, with a link to see the whole series.
**What:**
- The season-series popup's other seasons (CK-17) show regular-season meetings only. Add that season's playoff games between the two teams (also play-in), after the regular-season ones, in a highlight colour with a label ("Playoffs · West semis · DEN won 4-2", "G1"…), so they can't be mixed up with regular-season games. The header count stays regular season ("DEN won 3-1"), the playoff line is separate.
- "View series" on the playoff line opens that series in the season's bracket (CK-24 history).
- Current season: same, once the two teams meet in the playoffs.
**Tests:** unit: a known pair with a playoff series in 2025-26 returns both groups, counts kept separate; e2e: the popup shows the playoff games highlighted and "View series" opens that season's bracket.

### CK-32 — US holidays and big dates marked
**In short:** Days that get extra attention in the US (holidays and big NBA dates) are marked on the calendars, lists and the Slate, with a line saying why the day matters.
**What:**
- US national holidays (federal list, computed by rule, no network): New Year's Day, MLK Day, Presidents' Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas. Plus NBA dates: opening night, Christmas games, MLK Day games, Cup knockout dates, trade deadline, All-Star break, last day of the regular season, play-in, playoffs start, Finals.
- Shown as a small label on the day (calendar cells, List day headers, Slate header) and a mark on that day's game cards. Hover: one plain sentence a 5-year-old gets ("Christmas Day: the whole country watches these games").
- Keep the list in one data file so dates can be added by hand.
**Tests:** unit: holiday rules give the right dates for 2026 and 2027 (e.g. MLK Day = third Monday of January); e2e: 25 December shows the Christmas label on the calendar and the Slate.
