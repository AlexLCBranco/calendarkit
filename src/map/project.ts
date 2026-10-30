// Round 8 (2.2): longitude/latitude → map units, the same projection the base map was drawn with (d3-geo's geoAlbers as
// fitted by scripts/make-basemap.ts), without bundling d3: its raw conic equal-area formulas, rotated and offset like
// d3 does. tests/map.test.ts checks it against d3-geo for every arena.

import { MAP_H, MAP_W, PROJECTION } from './basemap';

const RAD = Math.PI / 180;
const [p0, p1] = PROJECTION.parallels.map((p) => p * RAD) as [number, number];
const sy0 = Math.sin(p0);
const n = (sy0 + Math.sin(p1)) / 2;
const c = 1 + sy0 * (2 * n - sy0);
const r0 = Math.sqrt(c) / n;
const raw = (lambda: number, phi: number): [number, number] => {
  const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
  return [r * Math.sin(lambda * n), r0 - r * Math.cos(lambda * n)];
};
const [ccx, ccy] = raw(PROJECTION.center[0] * RAD, PROJECTION.center[1] * RAD);

/** [x, y] in map units (0…MAP_W, 0…MAP_H; may fall outside for places off the drawn area). */
export function project(lon: number, lat: number): [number, number] {
  const [x, y] = raw((lon - PROJECTION.rotate) * RAD, lat * RAD);
  return [PROJECTION.tx + PROJECTION.k * (x - ccx), PROJECTION.ty - PROJECTION.k * (y - ccy)];
}

export const inMap = ([x, y]: [number, number], margin = 0) => x >= margin && x <= MAP_W - margin && y >= margin && y <= MAP_H - margin;
