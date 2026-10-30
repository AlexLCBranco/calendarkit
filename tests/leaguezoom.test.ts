// Round 8 (1.5): the desktop League List's size follows the widget's width (Alex: "scale rows by width"), from two
// font constants; the map gets the rest of the width.
import { describe, expect, it } from 'vitest';
import { LEAGUE_FONT_MAX, LEAGUE_FONT_MIN, LEAGUE_LIST_COLUMN, LEAGUE_MAP_GAP, LEAGUE_MAP_MIN, leagueSideBySide, leagueZoom } from '../src/components/widget';

describe('leagueZoom / leagueSideBySide', () => {
  it('base font 14 px at a 1280 px window (widget 1248), 18.2 px at 1920 (widget 1840), linear between, clamped', () => {
    expect(LEAGUE_FONT_MIN).toBe(14);
    expect(leagueZoom(1248)).toBe(1);
    expect(leagueZoom(1840)).toBe(1.3);
    expect(leagueZoom(1544)).toBe(1.15);
    expect(leagueZoom(1000)).toBe(1);
    expect(leagueZoom(2500)).toBe(+(LEAGUE_FONT_MAX / 14).toFixed(3));
  });

  it('side by side (left list + map) when the map gets LEAGUE_MAP_MIN px; tablets and phones keep the centered list', () => {
    for (const w of [1248, 1840, 2500]) {
      expect(leagueSideBySide(w)).toBe(true);
      expect(w - LEAGUE_LIST_COLUMN * leagueZoom(w) - LEAGUE_MAP_GAP).toBeGreaterThanOrEqual(LEAGUE_MAP_MIN);
    }
    for (const w of [360, 736, 1000]) expect(leagueSideBySide(w)).toBe(false);
    // the map's width at the two desktop sizes: 314 px at 1280, 633 px at 1920
    expect(Math.floor(1248 - LEAGUE_LIST_COLUMN * leagueZoom(1248) - LEAGUE_MAP_GAP)).toBe(314);
    expect(Math.floor(1840 - LEAGUE_LIST_COLUMN * leagueZoom(1840) - LEAGUE_MAP_GAP)).toBe(633);
  });
});
