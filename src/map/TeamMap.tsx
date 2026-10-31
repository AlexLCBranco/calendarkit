// The Team List's map (after round 8; Alex: "on the team view too, with a more detailed view for the selected team"):
// one road trip of the selected team at a time — the one under way (or next), or the one of the hovered row — as
// numbered stops at the feed's arenas, the route home → stops → home, and the trip's numbers under the map. Hovering a
// row lights its stop; hovering a stop lights its row (MapHover.tsx). Desktop, beside the Team List; never in a copy.

import { useMemo } from 'react';
import type { CalendarData } from '../data/model';
import { teamLabel } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import { parseHover } from '../components/MapHover';
import { useValue, type ValueStore } from '../components/valueStore';
import { MAP_H, MAP_W } from './basemap';
import { arc, Basemap, pct } from './draw';
import { gameLocation, placeName, type GameLocation } from './location';
import { project } from './project';
import { currentTrip, homeArena, teamTrips, tripOf, tripStats, tripStops, type Trip } from './trips';
import { ZONE_NAMES } from './zones';
import './map.css';

export interface TeamMapProps {
  data: CalendarData;
  teamId: number;
  /** The widget's "now": which trip is under way. */
  now: number;
  /** The room beside the list (CSS px). */
  room: { width: number; height: number };
  hover: ValueStore<string>;
}

/** Under the map: the trip's numbers (two lines) and the hover line, always reserved; the legend. */
const STATS_H = 40;
/** Stops closer than this (map units) stack their labels above / below instead of beside. */
const NEAR_LABEL = 40;
const INFO_H = 20;
const LEGEND_H = 24;

type Placed = Exclude<GameLocation, { kind: 'unknown' }>;
const placed = (l: GameLocation): l is Placed => l.kind !== 'unknown';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (d: string) => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
const range = (a: string, b: string) => (a === b ? md(a) : a.slice(5, 7) === b.slice(5, 7) ? `${md(a)}–${+b.slice(8, 10)}` : `${md(a)} – ${md(b)}`);

export default function TeamMap({ data, teamId, now, room, hover }: TeamMapProps) {
  const width = Math.max(0, Math.floor(Math.min(room.width, ((room.height - STATS_H - INFO_H - LEGEND_H - 12) * MAP_W) / MAP_H)));
  const trips = useMemo(() => teamTrips(data, teamId), [data, teamId]);
  const home = useMemo(() => homeArena(data, teamId), [data, teamId]);
  const h = parseHover(useValue(hover));
  const hoveredTrip = h ? tripOf(trips, h.id) : undefined;
  const trip: Trip | undefined = hoveredTrip ?? currentTrip(trips, now);
  const stops = useMemo(() => (trip ? tripStops(trip) : []), [trip]);
  const stats = useMemo(() => (trip ? tripStats(data, teamId, trip) : undefined), [data, teamId, trip]);
  const tri = TEAM_BY_ID.get(teamId)?.tricode ?? '';
  const homeXY = home ? project(home.lon, home.lat) : undefined;
  // the route: home → each game's place in order → home; legs to/from home dashed
  const pts = trip ? trip.games.map((g) => gameLocation(g)) : [];
  const legs: { d: string; home: boolean; key: string }[] = [];
  if (homeXY && trip && pts.every(placed)) {
    const xy = [{ x: homeXY[0], y: homeXY[1] }, ...(pts as Placed[]).map((p) => ({ x: p.x, y: p.y })), { x: homeXY[0], y: homeXY[1] }];
    for (let i = 1; i < xy.length; i++) {
      const [a, b] = [xy[i - 1]!, xy[i]!];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1) continue; // two games in one arena
      legs.push({ d: arc(a, b, 'away'), home: i === 1 || i === xy.length - 1, key: `${i}` });
    }
  }
  // stops close together (Sacramento / San Francisco): the upper one's label above its dot, the lower one's below
  const stacked = new Map<string, 'up' | 'down'>();
  const near = stops.filter((s) => placed(s.loc)) as (typeof stops[number] & { loc: Placed })[];
  for (const a of near)
    for (const b of near)
      if (a !== b && Math.hypot(a.loc.x - b.loc.x, a.loc.y - b.loc.y) < NEAR_LABEL) stacked.set(a.loc.arena.arena, a.loc.y < b.loc.y || (a.loc.y === b.loc.y && a.loc.x < b.loc.x) ? 'up' : 'down');
  const hotGame = h?.id;
  const hotStop = stops.find((s) => s.games.some((x) => x.game.gameId === hotGame));
  const hotInfo = hotStop && hotStop.games.find((x) => x.game.gameId === hotGame)!;
  const unknown = stops.filter((s) => !placed(s.loc));
  const opp = (g: (typeof stops)[number]['games'][number]['game']) => (g.awayTeam.teamId === teamId ? `@ ${teamLabel(g.homeTeam)}` : `vs ${teamLabel(g.awayTeam)}`);
  return (
    <aside className="ck-map ck-team-map" data-testid="team-map" data-capture-exclude="true" aria-label={`${tri} road trip`} style={{ width }} data-trip={trip?.index}>
      <div className={`ck-map-box${hotStop ? ' ck-map-dimmed' : ''}`} style={{ height: (width * MAP_H) / MAP_W }}>
        <Basemap />
        <svg className="ck-map-travel" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet" data-testid="trip-route">
          <defs>
            <marker id="ck-arrow-route" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0 0 L10 5 L0 10 z" className="ck-travel-head ck-route-head" />
            </marker>
          </defs>
          {legs.map((l) => (
            <path key={l.key} className={`ck-route${l.home ? ' ck-route-home' : ''}`} d={l.d} markerEnd="url(#ck-arrow-route)" data-leg={l.key} />
          ))}
        </svg>
        {homeXY && home && (
          <div className={`ck-map-dot ck-trip-home${homeXY[0] > MAP_W * 0.72 ? ' ck-map-label-left' : ''}`} style={{ left: pct(homeXY[0], MAP_W), top: pct(homeXY[1], MAP_H) }} data-trip-home={home.arena}>
            <span className="ck-map-pin" aria-hidden="true" />
            <span className="ck-map-code">{tri} home</span>
          </div>
        )}
        {stops.filter((s) => placed(s.loc)).map((s) => {
          const loc = s.loc as Placed;
          const right = loc.x < MAP_W * 0.72;
          return (
            <div
              key={loc.arena.arena}
              className={`ck-map-dot ck-trip-stop${s === hotStop ? ' ck-map-hot' : ''}${right ? '' : ' ck-map-label-left'}${loc.kind === 'edge' ? ' ck-map-edge' : ''}${stacked.has(loc.arena.arena) ? ` ck-label-${stacked.get(loc.arena.arena)}` : ''}`}
              style={{ left: pct(loc.x, MAP_W), top: pct(loc.y, MAP_H) }}
              data-map-game={s.games[0]!.game.gameId}
              data-stop={s.games.map((x) => x.n).join(',')}
              data-arena={loc.arena.arena}
            >
              <span className="ck-map-pin ck-trip-num" aria-hidden="true">
                {s.games.map((x) => x.n).join('·')}
              </span>
              <span className="ck-map-code">
                {s.games.map((x) => `${opp(x.game)} ${md(x.game.dateEt)}`).join(', ')}
                {loc.kind === 'edge' ? ` · ${loc.arena.city} ${loc.arrow}` : ''}
              </span>
            </div>
          );
        })}
        {unknown.length > 0 && (
          <div className="ck-map-unknown" data-testid="map-unknown">
            {unknown.flatMap((s) => s.games).map((x) => (
              <div key={x.game.gameId} data-map-game={x.game.gameId} data-kind="unknown">
                {x.n}. {opp(x.game)} {md(x.game.dateEt)}: location unknown
              </div>
            ))}
          </div>
        )}
        {!trip && <div className="ck-map-unknown">No road games.</div>}
      </div>
      <div className="ck-trip-stats" data-testid="trip-stats" style={{ height: STATS_H }}>
        {trip && stats && (
          <>
            <div>
              <b>
                Road trip {trip.index + 1} of {trips.length}
              </b>
              {hoveredTrip ? '' : ' (current)'} · {stats.games} game{stats.games === 1 ? '' : 's'} in {stats.days} day{stats.days === 1 ? '' : 's'}, {range(stats.from, stats.to)}
            </div>
            <div>
              {stats.miles === undefined ? 'distance unknown' : `≈ ${stats.miles.toLocaleString('en-US')} mi (straight lines)`} · {stats.zones.length > 1 ? `${stats.zones.join(' → ')} (${stats.zoneChanges ?? '?'} time-zone change${stats.zoneChanges === 1 ? '' : 's'})` : `stays in ${stats.zones[0] ? ZONE_NAMES[stats.zones[0]] : '?'} time`} · {stats.b2b} back-to-back{stats.b2b === 1 ? '' : 's'}
            </div>
          </>
        )}
      </div>
      <div className="ck-map-info" data-testid="map-info" style={{ height: INFO_H }}>
        {hotInfo && hotStop && placed(hotStop.loc) && (
          <div className="ck-map-info-place">
            <b>
              Game {hotInfo.n}: {opp(hotInfo.game)} {md(hotInfo.game.dateEt)}
            </b>{' '}
            {placeName(hotStop.loc.arena)} · {hotStop.loc.arena.arena}
          </div>
        )}
      </div>
      <div className="ck-map-legend" data-testid="map-legend">
        <span className="ck-map-note">numbers = game order on the trip · dashed = leaving / coming home · hover a row for its trip</span>
      </div>
    </aside>
  );
}
