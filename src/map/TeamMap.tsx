// The Team List's map: the travel view (TravelMap.tsx) of one of the selected team's games — by default its next
// game (today's, if it plays today), or the hovered / pinned row's, home games included: where the team and its
// opponent come from and go next. Desktop, beside the Team List; never in a copy.

import { useCallback, useMemo } from 'react';
import type { CalendarData } from '../data/model';
import { teamGames } from '../data/model';
import { TEAM_BY_ID } from '../data/teams';
import type { ValueStore } from '../components/valueStore';
import { MAP_H, MAP_W } from './basemap';
import { LEGEND_H, LegendKeys, PANEL_H, TravelMap, useFocus } from './TravelMap';

export interface TeamMapProps {
  data: CalendarData;
  teamId: number;
  /** Today (local date): the default game is the first on or after it. */
  today: string;
  /** The room beside the list (CSS px). */
  room: { width: number; height: number };
  hover: ValueStore<string>;
  pin: ValueStore<string>;
  timeZone?: string;
}

/** The game the Team map shows with nothing hovered or pinned: today's or the next one; after the season, the last. */
export function defaultGame(data: CalendarData, teamId: number, today: string) {
  const games = teamGames(data, teamId);
  return games.find((g) => g.dateEt >= today) ?? games.at(-1);
}

export default function TeamMap({ data, teamId, today, room, hover, pin, timeZone }: TeamMapProps) {
  const width = Math.max(0, Math.floor(Math.min(room.width, ((room.height - PANEL_H - LEGEND_H - 12) * MAP_W) / MAP_H)));
  const byId = useMemo(() => new Map(teamGames(data, teamId).map((g) => [g.gameId, g])), [data, teamId]);
  const known = useCallback((id: string) => byId.has(id), [byId]);
  const fallback = useMemo(() => defaultGame(data, teamId, today)?.gameId, [data, teamId, today]);
  const focus = useFocus(hover, pin, known, fallback);
  const tri = TEAM_BY_ID.get(teamId)?.tricode ?? '';
  return (
    <TravelMap
      data={data}
      width={width}
      focus={focus.id ? byId.get(focus.id) : undefined}
      pinned={focus.pinned}
      zoom={focus.zoom}
      first={teamId}
      timeZone={timeZone}
      testId="team-map"
      label={`${tri} travel`}
      idle={<span className="ck-tv-hint">No games.</span>}
      legend={<LegendKeys a={tri} b="opponent" />}
    />
  );
}
