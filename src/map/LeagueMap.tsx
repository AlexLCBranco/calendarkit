// Round 8 (Part 2): the League List's map — where the day's games are played, beside the list (desktop). A static SVG
// outline bundled with the app (src/map/basemap.ts, loaded as its own chunk), states faintly shaded by time zone, one
// dot per game at the feed's arena, labeled with the home team; yellow when either team is on a back-to-back. Never in a
// copied image (outside the copied nodes, and data-capture-exclude).

import { memo, useMemo } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue } from '../data/fatigue';
import type { CalendarData } from '../data/model';
import { teamLabel } from '../data/model';
import { CANADA, MAP_H, MAP_W, MEXICO, STATES } from './basemap';
import { gameLocation, type GameLocation } from './location';
import { parseHover } from '../components/MapHover';
import { useValue, type ValueStore } from '../components/valueStore';
import { travelLines, type TravelLine } from './travel';
import { STATE_ZONE, ZONE_NAMES, type Zone } from './zones';
import './map.css';

export interface MapGame {
  game: ScheduleGame;
  loc: GameLocation;
  /** Either team is on a back-to-back night (1st or 2nd). */
  b2b: boolean;
  /** Pixel offset (CSS px) when dots of the same place would sit on top of each other (LA, New York). */
  dx: number;
  dy: number;
  /** Label on the left of the dot (the right half of a close pair). */
  labelLeft: boolean;
}

/** Dots closer than this (map units) are spread around their middle. */
const NEAR = 14;
/** How far (CSS px) spread dots move from their middle. */
const SPREAD = 7;

export function mapGames(data: CalendarData, games: readonly ScheduleGame[]): MapGame[] {
  const fatigue = leagueFatigue(data);
  const out: MapGame[] = games.map((game) => {
    const f = fatigue.get(game.gameId);
    const b2b = [game.awayTeam.teamId, game.homeTeam.teamId].some((t) => (f?.get(t)?.nights.length ?? 0) > 0);
    const loc = gameLocation(game);
    // an edge marker's label opens towards the middle of the map, so it stays inside the frame
    return { game, loc, b2b, dx: 0, dy: 0, labelLeft: loc.kind === 'edge' && loc.x > MAP_W / 2 };
  });
  // groups of placed dots within NEAR of each other: spread on a small circle, labels on the outside
  const placed = out.filter((m) => m.loc.kind !== 'unknown') as (MapGame & { loc: Exclude<GameLocation, { kind: 'unknown' }> })[];
  const seen = new Set<MapGame>();
  for (const m of placed) {
    if (seen.has(m)) continue;
    const group = placed.filter((o) => !seen.has(o) && Math.hypot(o.loc.x - m.loc.x, o.loc.y - m.loc.y) < NEAR);
    group.forEach((o) => seen.add(o));
    if (group.length < 2) continue;
    group.sort((a, b) => a.loc.x - b.loc.x || a.game.gameId.localeCompare(b.game.gameId));
    group.forEach((o, i) => {
      const a = Math.PI + (2 * Math.PI * i) / group.length; // the first to the left
      o.dx = Math.round(Math.cos(a) * SPREAD * 10) / 10;
      o.dy = Math.round(Math.sin(a) * SPREAD * 10) / 10;
      o.labelLeft = o.dx < 0;
    });
  }
  return out;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/** The outline: neighbours, then the states in their zone's tint. Never changes: memo with no props. */
const Basemap = memo(function Basemap() {
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

export interface LeagueMapProps {
  data: CalendarData;
  /** The games the list shows (its day, the TV filter applied). */
  games: readonly ScheduleGame[];
  /** The room beside the list (CSS px): the map is as wide as it can be there, at MAP_W : MAP_H. */
  room: { width: number; height: number };
  /** The hovered game (MapHover.tsx), shared with the list (round 8, Part 3). */
  hover: ValueStore<string>;
}

/** Under the map: the hover info (two lines, always reserved: nothing moves when it fills) and the legend. */
const INFO_H = 36;
const LEGEND_H = 44;

/** Bend of a travel line (share of its length): away team one way, home team the other, so two lines never coincide. */
const BEND = 0.14;

/** A travel line's path: a gentle arc from → to, bent to the team's side. */
function arc(from: { x: number; y: number }, to: { x: number; y: number }, side: 'away' | 'home'): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.max(BEND * len, 10) * (side === 'away' ? 1 : -1);
  const cx = (from.x + to.x) / 2 - (dy / len) * k;
  const cy = (from.y + to.y) / 2 + (dx / len) * k;
  const f = (n: number) => n.toFixed(1);
  return `M${f(from.x)} ${f(from.y)} Q${f(cx)} ${f(cy)} ${f(to.x)} ${f(to.y)}`;
}

type Placed = Exclude<GameLocation, { kind: 'unknown' }>;
const placed = (l: GameLocation): l is Placed => l.kind !== 'unknown';
const when = (night: 1 | 2) => (night === 2 ? 'yesterday' : 'tomorrow');

/** The hovered game's back-to-back travel (3.2), drawn only for the hovered game (3.3). */
function TravelLayer({ lines }: { lines: TravelLine[] }) {
  const drawn = lines.filter((l) => !l.stays && placed(l.from) && placed(l.to));
  if (!drawn.length) return null;
  return (
    <>
      <svg className="ck-map-travel" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet" data-testid="map-travel">
        <defs>
          {(['away', 'home'] as const).map((side) => (
            <marker key={side} id={`ck-arrow-${side}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0 0 L10 5 L0 10 z" className={`ck-travel-head ck-travel-${side}`} />
            </marker>
          ))}
        </defs>
        {drawn.map((l) => {
          const from = l.from as Placed;
          const to = l.to as Placed;
          return <path key={`${l.teamId}-${l.night}`} className={`ck-travel ck-travel-${l.side}`} d={arc(from, to, l.side)} markerEnd={`url(#ck-arrow-${l.side})`} data-travel={`${l.team}:${l.night}`} data-from={from.arena.arena} data-to={to.arena.arena} />;
        })}
      </svg>
      {drawn.map((l) => {
        const far = (l.night === 2 ? l.from : l.to) as Placed;
        return (
          <div key={`${l.teamId}-${l.night}-end`} className={`ck-travel-end ck-travel-${l.side}`} style={{ left: pct(far.x, MAP_W), top: pct(far.y, MAP_H) }} data-travel-end={`${l.team}:${l.night}`}>
            <span className="ck-travel-ring" aria-hidden="true" />
            <span className="ck-travel-label">
              {l.team} {when(l.night)}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** The hover info (3.1): the place and arena, then each team's back-to-back travel in words. */
function hoverInfo(m: MapGame, lines: TravelLine[]): { place: string; travel: string } {
  const place = m.loc.kind === 'unknown' ? `location unknown (${m.loc.label})` : `${m.loc.label} · ${m.loc.arena.arena}${m.loc.kind === 'edge' ? ' (off this map)' : ''}`;
  const travel = lines.map((l) => {
    const other = l.night === 2 ? l.from : l.to;
    const away = l.other.awayTeam.teamId === l.teamId;
    const at = `${away ? '@' : 'vs'} ${teamLabel(away ? l.other.homeTeam : l.other.awayTeam)}`;
    if (other.kind === 'unknown') return `${l.team} ${when(l.night)} ${at}: location unknown`;
    if (l.stays) return `${l.team} ${l.night === 2 ? 'played here yesterday' : 'plays here again tomorrow'} (${at})`;
    return `${l.team} ${l.night === 2 ? 'from' : 'on to'} ${other.label} ${when(l.night)} (${at})`;
  });
  return { place, travel: travel.join(' · ') || 'no back-to-back travel' };
}

export default function LeagueMap({ data, games, room, hover }: LeagueMapProps) {
  const width = Math.max(0, Math.floor(Math.min(room.width, ((room.height - LEGEND_H - INFO_H) * MAP_W) / MAP_H)));
  const items = useMemo(() => mapGames(data, games), [data, games]);
  const unknown = items.filter((m) => m.loc.kind === 'unknown');
  const h = parseHover(useValue(hover));
  const hot = h ? items.find((m) => m.game.gameId === h.id) : undefined;
  const lines = useMemo(() => (hot ? travelLines(data, hot.game) : []), [data, hot]);
  const info = hot && hoverInfo(hot, lines);
  return (
    <aside className="ck-map" data-testid="league-map" data-capture-exclude="true" aria-label="Where tonight's games are played" style={{ width }}>
      <div className={`ck-map-box${hot ? ' ck-map-dimmed' : ''}`} style={{ height: (width * MAP_H) / MAP_W }}>
        <Basemap />
        <TravelLayer lines={lines} />
        {items.map((m) =>
          m.loc.kind === 'unknown' ? null : (
            <div
              key={m.game.gameId}
              className={`ck-map-dot${m.b2b ? ' ck-map-b2b' : ''}${m.loc.kind === 'edge' ? ' ck-map-edge' : ''}${m.labelLeft ? ' ck-map-label-left' : ''}${m === hot ? ' ck-map-hot' : ''}`}
              style={{ left: pct(m.loc.x, MAP_W), top: pct(m.loc.y, MAP_H), transform: m.dx || m.dy ? `translate(${m.dx}px, ${m.dy}px)` : undefined }}
              data-map-game={m.game.gameId}
              data-kind={m.loc.kind}
              title={`${teamLabel(m.game.awayTeam)} @ ${teamLabel(m.game.homeTeam)} · ${m.loc.label}${m.loc.kind === 'edge' ? ' (off this map)' : ''}`}
            >
              <span className="ck-map-pin" aria-hidden="true" />
              <span className="ck-map-code">{m.loc.kind === 'edge' ? `${teamLabel(m.game.homeTeam)} · ${m.loc.arena.city} ${m.loc.arrow}` : teamLabel(m.game.homeTeam)}</span>
            </div>
          ),
        )}
        {unknown.length > 0 && (
          <div className="ck-map-unknown" data-testid="map-unknown">
            {unknown.map((m) => (
              <div key={m.game.gameId} className={m === hot ? 'ck-map-hot' : undefined} data-map-game={m.game.gameId} data-kind="unknown">
                {teamLabel(m.game.awayTeam)} @ {teamLabel(m.game.homeTeam)}: location unknown ({m.loc.label})
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="ck-map-info" data-testid="map-info" style={{ height: INFO_H }}>
        {info && (
          <>
            <div className="ck-map-info-place">
              <b>
                {teamLabel(hot!.game.awayTeam)} @ {teamLabel(hot!.game.homeTeam)}
              </b>{' '}
              {info.place}
            </div>
            <div className="ck-map-info-travel">{info.travel}</div>
          </>
        )}
      </div>
      <div className="ck-map-legend" data-testid="map-legend">
        {(['PT', 'MT', 'CT', 'ET'] as Zone[]).map((z) => (
          <span key={z} className="ck-map-key">
            <span className={`ck-map-swatch ck-tz-${z}`} aria-hidden="true" /> {ZONE_NAMES[z]}
          </span>
        ))}
        <span className="ck-map-key">
          <span className="ck-map-pin ck-map-key-b2b" aria-hidden="true" /> back-to-back
        </span>
        <span className="ck-map-note">time zone bands are approximate</span>
      </div>
    </aside>
  );
}
