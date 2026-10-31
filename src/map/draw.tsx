// The maps' shared drawing pieces (League map, Team map): the outline, % positions, arcs.

import { memo } from 'react';
import { CANADA, MAP_H, MAP_W, MEXICO, STATES } from './basemap';
import { STATE_ZONE } from './zones';

export const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** The outline: neighbours, then the states in their zone's tint. Never changes: memo with no props. */
export const Basemap = memo(function Basemap() {
  return (
    <svg className="ck-map-svg" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <path className="ck-map-land" d={CANADA} data-country="CA" />
      <path className="ck-map-land" d={MEXICO} data-country="MX" />
      {STATES.map(([st, d]) => (
        <path key={st} className={`ck-map-state ck-tz-${STATE_ZONE[st] ?? 'none'}`} d={d} data-state={st} />
      ))}
    </svg>
  );
});

/** Bend of a travel line (share of its length): away team one way, home team the other, so two lines never coincide. */
const BEND = 0.14;

/** A travel line's path: a gentle arc from → to, bent to the team's side. */
export function arc(from: { x: number; y: number }, to: { x: number; y: number }, side: 'away' | 'home'): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.max(BEND * len, 10) * (side === 'away' ? 1 : -1);
  const cx = (from.x + to.x) / 2 - (dy / len) * k;
  const cy = (from.y + to.y) / 2 + (dx / len) * k;
  const f = (n: number) => n.toFixed(1);
  return `M${f(from.x)} ${f(from.y)} Q${f(cx)} ${f(cy)} ${f(to.x)} ${f(to.y)}`;
}

