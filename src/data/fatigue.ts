// Schedule fatigue for every team in every game, for the league views (week view and League List): back-to-back
// nights (with the plane on a change of metro), 3-in-4 positions and a tooltip per team. Same rules as the team views
// (teamB2BPairs, teamThreeInFour, leagueRecords); computed once per data set, never per render or scroll.

import { leagueRecords, sideLabel, teamB2BPairs, type B2BPair, type CalendarData } from './model';
import { ORDINAL, teamThreeInFour, threeInFourTip, type ThreeInFour } from './scheduleTags';
import { TEAM_BY_ID } from './teams';

export interface TeamFatigue {
  /** The back-to-back nights this game is for the team (usually none or one; 3 days in a row make it both). */
  nights: (1 | 2)[];
  /** The pairs those nights belong to. */
  pairs: B2BPair[];
  /** The team changes metro between the two nights of one of those pairs. */
  travels: boolean;
  tif?: ThreeInFour;
  /** Tooltip: leg and code, both games with dates and opponents, travel, every 3-in-4 set, record going in. */
  tip: string;
}

/** The team has something to show in this game: a back-to-back night or a 3-in-4 set (the Fatigue component isn't empty). */
export const hasFatigue = (f?: TeamFatigue) => !!f && (f.nights.length > 0 || !!f.tif);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const where = (g: B2BPair['first'], teamId: number) => (g.homeTeam.teamId === teamId ? 'home' : 'away');

const cache = new WeakMap<CalendarData, Map<string, Map<number, TeamFatigue>>>();

/** gameId → teamId → that team's fatigue in the game (every game, both teams, "rested" ones too). */
export function leagueFatigue(data: CalendarData): Map<string, Map<number, TeamFatigue>> {
  const hit = cache.get(data);
  if (hit) return hit;
  const out = new Map<string, Map<number, TeamFatigue>>();
  const records = leagueRecords(data);
  for (const teamId of data.teamDates.keys()) {
    const tri = TEAM_BY_ID.get(teamId)?.tricode ?? '';
    const pairsByGame = new Map<string, { pair: B2BPair; night: 1 | 2 }[]>();
    for (const pair of teamB2BPairs(data, teamId)) {
      for (const [g, night] of [[pair.first, 1], [pair.second, 2]] as const) pairsByGame.set(g.gameId, [...(pairsByGame.get(g.gameId) ?? []), { pair, night }]);
    }
    const tifs = teamThreeInFour(data, teamId);
    for (const g of data.games) {
      if (g.homeTeam.teamId !== teamId && g.awayTeam.teamId !== teamId) continue;
      const legs = pairsByGame.get(g.gameId) ?? [];
      const tif = tifs.get(g.gameId);
      const rec = records.get(g.gameId)?.get(teamId);
      const lines = legs.flatMap(({ pair, night }) => [
        `${tri} — ${night}/2 · ${pair.code} (${night === 1 ? '1st' : '2nd'} night of a back-to-back)`,
        `${md(pair.first.dateEt)} ${sideLabel(pair.first, teamId)} (${where(pair.first, teamId)}) → ${md(pair.second.dateEt)} ${sideLabel(pair.second, teamId)} (${where(pair.second, teamId)})`,
        ...(pair.travels ? [`Travels ${pair.fromCity} → ${pair.toCity}`] : []),
      ]);
      if (!legs.length) lines.push(`${tri} — ${tif ? `3-in-4 · ${ORDINAL[tif.position]}` : 'rested'}`);
      if (tif) lines.push(threeInFourTip(tif));
      if (rec) lines.push(`Record going in: ${rec.wins}-${rec.losses}`);
      let m = out.get(g.gameId);
      if (!m) out.set(g.gameId, (m = new Map()));
      m.set(teamId, { nights: legs.map((l) => l.night), pairs: legs.map((l) => l.pair), travels: legs.some((l) => l.pair.travels), tif, tip: lines.join('\n') });
    }
  }
  cache.set(data, out);
  return out;
}
