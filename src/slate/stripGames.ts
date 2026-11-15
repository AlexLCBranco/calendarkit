// The day strip's matchups (tooltip.tsx): a stretch's game ids → each game day from the team's side. The team is
// the one every game of the stretch shares (a 3-in-4 stretch or a road trip has 3 or more games). Pure lookups on the
// loaded schedule, worked out when a tooltip with a strip opens (never at load or per render of a row).

import type { CalendarData } from '../data/model';
import type { GameLink } from './links';
import type { StripGame, StripGames } from './tooltip';

const byIdCache = new WeakMap<CalendarData, Map<string, CalendarData['games'][number]>>();

/** The host's `StripGames` for `useTooltip`: matchups and each game's page (`gameLink`). */
export function stripGamesOf(data: CalendarData, gameLink?: GameLink): StripGames {
  return (ids) => {
    let byId = byIdCache.get(data);
    if (!byId) byIdCache.set(data, (byId = new Map(data.games.map((g) => [g.gameId, g]))));
    const games = ids.map((id) => byId!.get(id)).filter((g) => !!g);
    if (games.length < 2) return undefined;
    const sides = (g: (typeof games)[number]) => [g.homeTeam.teamId, g.awayTeam.teamId].filter(Boolean);
    const team = sides(games[0]!).find((t) => games.every((g) => sides(g).includes(t)));
    if (!team) return undefined;
    const out = new Map<string, StripGame>();
    for (const g of games) {
      const home = g.homeTeam.teamId === team;
      const opp = home ? g.awayTeam : g.homeTeam;
      out.set(g.dateEt, { at: home ? 'vs' : '@', opponentId: opp.teamId, opponent: opp.teamTricode || 'TBD', url: gameLink?.(g) });
    }
    return out;
  };
}
