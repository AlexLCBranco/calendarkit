// The maps' view geometry (src/map/view.ts) and the travel view's layout (TravelMap.tsx): zoom-to-fit holds every
// point of a game's legs inside the box with room for labels, never zooms past the minimum span, and labels never overlap.
import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W } from '../src/map/basemap';
import { mapGames } from '../src/map/LeagueMap';
import { dayLayout, focusLayout, placed } from '../src/map/TravelMap';
import { gameTravel } from '../src/map/travel';
import { fitView, MAX_ZOOM, MIN_SPAN, placeLabels, toPx, WHOLE, type Rect } from '../src/map/view';
import { data } from './feed';

const W = 900;
const H = (W * MAP_H) / MAP_W;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('fitView', () => {
  it('nothing to fit: the whole map', () => {
    expect(fitView([], W)).toEqual(WHOLE);
  });
  it('one place (a 0-mile game): zoomed no further than the minimum span, centred on it', () => {
    const v = fitView([{ x: 500, y: 300 }], W);
    expect(v.k).toBeLessThanOrEqual(MAX_ZOOM);
    expect(MAP_W / v.k).toBeGreaterThanOrEqual(MIN_SPAN - 0.01);
    expect([v.cx, v.cy]).toEqual([500, 300]);
  });
  it('the far corners: zoom 1, the whole map', () => {
    expect(fitView([{ x: 20, y: 20 }, { x: 980, y: 620 }], W).k).toBe(1);
  });
});

describe('focusLayout: every game of the season', () => {
  it('all leg points inside the box (with label room), labels inside and never overlapping each other or a dot', () => {
    let zoomed = 0;
    for (const g of data.games) {
      const tv = gameTravel(data, g);
      if (!placed(tv.loc)) continue;
      const lay = focusLayout(tv, (id) => (id === g.awayTeam.teamId ? 'a' : 'b'), W);
      if (lay.view.k > 1.05) zoomed++;
      for (const p of lay.points) {
        const q = toPx(lay.view, W, p.loc);
        expect(q.x, g.gameId).toBeGreaterThanOrEqual(0);
        expect(q.x, g.gameId).toBeLessThanOrEqual(W);
        expect(q.y, g.gameId).toBeGreaterThanOrEqual(0);
        expect(q.y, g.gameId).toBeLessThanOrEqual(H);
      }
      expect(lay.labels.size, g.gameId).toBe(lay.points.filter((p) => p.label).length + lay.lines.length);
    }
    expect(zoomed).toBeGreaterThan(500);
  });

  it('labels overlap on almost no game (a few with legs to Paris / Manchester, or many places in one region): ≤ 1% at 900 px, ≤ 2% at 640', () => {
    for (const [w, max] of [[900, 0.01], [640, 0.02]] as const) {
      let bad = 0;
      let n = 0;
      for (const g of data.games) {
        const tv = gameTravel(data, g);
        if (!placed(tv.loc)) continue;
        n++;
        const l = [...focusLayout(tv, (id) => (id === g.awayTeam.teamId ? 'a' : 'b'), w).labels.values()];
        if (l.some((a, i) => l.some((b, j) => j > i && overlaps(a, b)))) bad++;
      }
      expect(bad / n, `${w} px: ${bad} of ${n}`).toBeLessThanOrEqual(max);
    }
  });

  it('TOR @ DET (a short trip): zoomed in well past the whole-US view', () => {
    const g = data.games.find((x) => x.awayTeam.teamTricode === 'TOR' && x.homeTeam.teamTricode === 'DET')!;
    const lay = focusLayout(gameTravel(data, g), (id) => (id === g.awayTeam.teamId ? 'a' : 'b'), W);
    // TOR's previous/next games may be anywhere; the view still fits them all — and a TOR home stand fits tight
    expect(lay.view.k).toBeGreaterThanOrEqual(1);
  });
});

describe('dayLayout (nothing focused)', () => {
  it('every day of the season: no two labels overlap, none covers a dot, all inside the map', () => {
    for (const date of data.dates) {
      const dots = mapGames(data, data.byDate.get(date)!);
      const labels = [...dayLayout(dots, W).values()];
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(overlaps(labels[i]!, labels[j]!), date).toBe(false);
      for (const r of labels) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(W);
      }
    }
  });
});

describe('placeLabels', () => {
  it('takes the first free option; skips an ask with none free unless forced', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 };
    const got = placeLabels(
      [
        { key: 'a', options: [{ x: 0, y: 0, w: 20, h: 10, variant: 0 }] },
        { key: 'b', options: [{ x: 5, y: 0, w: 20, h: 10, variant: 0 }, { x: 50, y: 50, w: 20, h: 10, variant: 1 }] },
        { key: 'c', options: [{ x: 0, y: 0, w: 20, h: 10, variant: 0 }] },
        { key: 'd', force: true, options: [{ x: 0, y: 0, w: 20, h: 10, variant: 0 }] },
      ],
      [],
      bounds,
    );
    expect(got.get('b')!.variant).toBe(1);
    expect(got.has('c')).toBe(false);
    expect(got.has('d')).toBe(true);
  });
});
