calendarkit — map redesign: travel view (prev → this game → next, both teams)

Context: the maps beside the League List (src/map/LeagueMap.tsx) and the Team List (src/map/TeamMap.tsx) aren't useful enough. The league map only draws travel for B2Bs, so on most games hovering shows "no back-to-back travel". The team map only shows road trips, so hovering home games does nothing, and a short trip (TOR → DET) is a tiny line in a corner of the whole-US map. I need to see what's going on at a glance, without squinting. Read the current map code first (src/map/*, src/components/MapHover.tsx, src/components/ScheduleDestination.tsx) and keep what works: lazy loading, never in copied images (data-capture-exclude), hover sync between list rows and the map. Desktop only; I always use a full-size window. Fluidity is the top priority: nothing here may make the app slow or janky.

WHAT TO BUILD

1. One "travel view" for a focused game, used by both maps. It replaces the B2B-only arrows on the league map and the road-trip-only view on the team map. For the focused game, for BOTH teams, show:
   - their previous game's location → this game's location
   - this game's location → their next game's location
   Use the feed's arena for each game (as location.ts does now), so neutral-site / Mexico City / Paris games are handled the same way edge markers are today.

2. Visuals (must be readable at a glance):
   - One color per team, used for that team's lines AND its text in the panel below. Two clearly different colors that work on the dark theme and don't clash with the app's B2B yellow.
   - Solid line = previous game → this game. Dashed/faded line = this game → next game. Past vs future must be impossible to confuse.
   - Distance printed ON each line in large, readable text (e.g. "620 mi"). Straight-line miles are fine; say "straight line" once in the legend, not on every label.
   - If a team stays in the same arena (e.g. home → home), draw no line but show "stayed · 0 mi" next to the dot.
   - City names on the map (not only tricodes). Arena name can stay in the panel.
   - Thicker lines, bigger dots and labels than now.

3. Zoom to fit: when a game is focused, the map zooms/pans (smoothly, cheaply) to fit all points of that game's legs with padding, instead of always showing the whole US. Set a minimum zoom-out so a 0-mile case doesn't zoom absurdly into one city. With nothing focused, show the whole US as now.

4. Panel under the map, one block per team, in that team's color:
   TEAM   last: vs/@ OPP · Day DD/MM HH:MM · City → X mi · N days rest · TZ change (e.g. +2h / none)
          this: vs/@ OPP · Day DD/MM HH:MM · City
          next: vs/@ OPP · Day DD/MM HH:MM · City → X mi · N days rest · TZ change
   - Times in my time zone, as the rest of the app shows them; dates in the same format the lists use.
   - Rest days: use the SAME rest-day count the app already uses for the rest chips in the lists (so the map and the lists never disagree). No adjustment for early tip-offs.
   - First game of the season: "last: none (season opener)". No next game: "next: none".
   - The B2B, 3-in-4 and other tags the app already computes may appear here in their usual style if there's room; don't invent new ones.
   - Keep the panel's height reserved so nothing jumps when it fills.
   - Tricodes in the panel are team links (same click rule as the rest of the app); the map labels stay click-through as now.

5. Focus rules:
   - League map: hover a game (row or dot) to focus it. CLICK a row or dot to PIN it, so it stays focused while I move the mouse onto the map. Click it again, press Esc, or click empty map to unpin. Hovering another game shows that game temporarily; leaving returns to the pinned one. Changing the day clears the pin. Pinned state must be visible (row + dot).
   - League map with nothing focused: dots as now, but label each dot "AWAY @ HOME" plus the city, without overlapping labels. If labels would collide, fall back to tricodes only and keep the city for the focused game. B2B yellow on the dots stays.
   - Team map: defaults to the selected team's next game (today's game if there is one). Hovering ANY row (home games too) focuses that game. Same click-to-pin behavior as the league map.
   - Remove the old road-trip view and its stats ("Road trip X of N…") from the team map. Keep any trip/homestand logic in trips.ts that other parts of the app use (e.g. the Homestand 1/3 labels in the Team List); don't break those.

6. Legend: short. Team colors, solid = since last game, dashed = to next game, straight-line distances. Drop the time-zone band shading if it adds nothing once TZ change is in the panel. Your call, but tell me what you did.

TESTS (automate everything possible; I don't want to test by hand)
- Unit tests for the travel computation against the real season data: prev/next game per team, same-arena = 0 mi, season opener / no next game, rest days equal to the lists' rest chips for every game, TZ change, off-map arenas.
- E2E tests: hover focuses, click pins/unpins (click again, Esc, empty map, day change), team map defaults to the next game and home-game rows work, zoom-to-fit contains all leg points, the map is never inside a copied image, no label overlap in the default league view on a busy day.
- Check that hovering rows quickly doesn't cause visible lag (no heavy recomputation on hover; memoize per game).
- Take screenshots of: a busy league day (nothing focused), a pinned league game with long cross-country legs, a TOR home game on the team map, and a short trip (TOR @ DET). Look at them yourself and fix anything that's hard to read before you finish.

FINISH
- Update PROJECT.md briefly (keep it short).
- Commit and push the way this repo normally does.
- Tell me in a few lines what changed and anything you decided on your own (legend, TZ shading, label fallback).