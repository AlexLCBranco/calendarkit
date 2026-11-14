// The League List's map — where the day's games are played, beside the list (desktop). A static SVG outline
// bundled with the app (src/map/basemap.ts, its own chunk), one dot per game at the feed's arena, yellow when either team
// is on a back-to-back, labeled "AWAY @ HOME" and the city where there's room (shorter where there isn't, never
// overlapping). Hover a game (row or dot) to focus it, click to pin it: the travel view (TravelMap.tsx). Never in a
// copied image (outside the copied nodes, and data-capture-exclude).

import { useCallback, useMemo } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { leagueFatigue } from '../data/fatigue';
import type { CalendarData } from '../data/model';
import type { ValueStore } from '../components/valueStore';
import { MAP_H, MAP_W } from './basemap';
import { gameLocation, type GameLocation } from './location';
import { LEGEND_H, LegendKeys, PANEL_H, TravelMap, useFocus, type DayDot } from './TravelMap';

export type MapGame = DayDot;

/** Dots closer than this (map units) are spread around their middle. */
const NEAR = 14;
/** How far (CSS px) spread dots move from their middle. */
const SPREAD = 7;

export function mapGames(data: CalendarData, games: readonly ScheduleGame[]): MapGame[] {
  const fatigue = leagueFatigue(data);
  const out: MapGame[] = games.map((game) => {
    const f = fatigue.get(game.gameId);
    const b2b = [game.awayTeam.teamId, game.homeTeam.teamId].some((t) => (f?.get(t)?.nights.length ?? 0) > 0);
    return { game, loc: gameLocation(game), b2b, dx: 0, dy: 0 };
  });
  // groups of placed dots within NEAR of each other: spread on a small circle
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
    });
  }
  return out;
}

export interface LeagueMapProps {
  data: CalendarData;
  /** The games the list shows (its day, the TV filter applied). */
  games: readonly ScheduleGame[];
  /** The room beside the list (CSS px): the map is as wide as it can be there, at MAP_W : MAP_H. */
  room: { width: number; height: number };
  /** The hovered game (MapHover.tsx), shared with the list. */
  hover: ValueStore<string>;
  /** The pinned game. */
  pin: ValueStore<string>;
  timeZone?: string;
}

export default function LeagueMap({ data, games, room, hover, pin, timeZone }: LeagueMapProps) {
  const width = Math.max(0, Math.floor(Math.min(room.width, ((room.height - LEGEND_H - PANEL_H) * MAP_W) / MAP_H)));
  const items = useMemo(() => mapGames(data, games), [data, games]);
  const byId = useMemo(() => new Map(items.map((m) => [m.game.gameId, m.game])), [items]);
  const known = useCallback((id: string) => byId.has(id), [byId]);
  const focus = useFocus(hover, pin, known);
  return (
    <TravelMap
      data={data}
      width={width}
      focus={focus.id ? byId.get(focus.id) : undefined}
      pinned={focus.pinned}
      zoom={focus.zoom}
      dots={items}
      timeZone={timeZone}
      testId="league-map"
      label="Where tonight's games are played"
      idle={<span className="ck-tv-hint">Hover a game for both teams' travel; click it to pin.</span>}
      legend={
        <>
          <LegendKeys a="away" b="home" />
          <span className="ck-map-key">
            <span className="ck-map-pin ck-map-key-b2b" aria-hidden="true" /> B2B
          </span>
        </>
      }
    />
  );
}
