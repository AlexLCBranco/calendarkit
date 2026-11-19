// A Slate card's game button (CK-15) and its pop-up of outside links — links only, no betting in the app:
// FanDuel's NBA player props, each team's ESPN injury page and the NBA's official injury report.
// ESPN's team abbreviations and page slugs come from ESPN's own team list
// (site.api.espn.com/apis/site/v2/sports/basketball/nba/teams, read 2026-11-18); every injury page was opened once and
// showed its team ("Boston Celtics Injury Status - ESPN"). FanDuel's page for one game needs FanDuel's own event ID,
// which nothing in the schedule gives, so "Player props" is FanDuel's NBA player-props tab.

import type { ReactNode } from 'react';
import { TEAM_BY_ID } from '../data/teams';
import type { CalendarData } from '../data/model';
import { useHoverPopup } from './hoverPopup';

/** Tricode → [ESPN abbreviation, ESPN page slug]. */
const ESPN: Record<string, [string, string]> = {
  ATL: ['atl', 'atlanta-hawks'],
  BOS: ['bos', 'boston-celtics'],
  BKN: ['bkn', 'brooklyn-nets'],
  CHA: ['cha', 'charlotte-hornets'],
  CHI: ['chi', 'chicago-bulls'],
  CLE: ['cle', 'cleveland-cavaliers'],
  DAL: ['dal', 'dallas-mavericks'],
  DEN: ['den', 'denver-nuggets'],
  DET: ['det', 'detroit-pistons'],
  GSW: ['gs', 'golden-state-warriors'],
  HOU: ['hou', 'houston-rockets'],
  IND: ['ind', 'indiana-pacers'],
  LAC: ['lac', 'la-clippers'],
  LAL: ['lal', 'los-angeles-lakers'],
  MEM: ['mem', 'memphis-grizzlies'],
  MIA: ['mia', 'miami-heat'],
  MIL: ['mil', 'milwaukee-bucks'],
  MIN: ['min', 'minnesota-timberwolves'],
  NOP: ['no', 'new-orleans-pelicans'],
  NYK: ['ny', 'new-york-knicks'],
  OKC: ['okc', 'oklahoma-city-thunder'],
  ORL: ['orl', 'orlando-magic'],
  PHI: ['phi', 'philadelphia-76ers'],
  PHX: ['phx', 'phoenix-suns'],
  POR: ['por', 'portland-trail-blazers'],
  SAC: ['sac', 'sacramento-kings'],
  SAS: ['sa', 'san-antonio-spurs'],
  TOR: ['tor', 'toronto-raptors'],
  UTA: ['utah', 'utah-jazz'],
  WAS: ['wsh', 'washington-wizards'],
};

/** The team's ESPN injury page; undefined for an undecided team. */
export function injuryUrl(teamId: number): string | undefined {
  const e = ESPN[TEAM_BY_ID.get(teamId)?.tricode ?? ''];
  return e && `https://www.espn.com/nba/team/injuries/_/name/${e[0]}/${e[1]}`;
}
export const PLAYER_PROPS_URL = 'https://sportsbook.fanduel.com/navigation/nba?tab=player-props';
export const NBA_INJURY_REPORT_URL = 'https://official.nba.com/nba-injury-report/';

/** The pop-up's links for a game, in order: player props, the away team's injuries, the home team's, the official report. */
export function gameLinks(away: number, home: number): { label: string; url: string }[] {
  const tri = (id: number) => TEAM_BY_ID.get(id)?.tricode;
  const team = (id: number) => {
    const url = injuryUrl(id);
    return url ? [{ label: `${tri(id)} injuries`, url }] : [];
  };
  return [{ label: 'Player props', url: PLAYER_PROPS_URL }, ...team(away), ...team(home), { label: 'Official NBA injury report', url: NBA_INJURY_REPORT_URL }];
}

/** The card's game button: a control (never in a copy); it sits in the away row's empty "@" cell, so no width is added. */
export function GameMenuButton({ gameId, label }: { gameId: string; label: string }) {
  return (
    <button type="button" className="ck-game-menu" data-game-links={gameId} data-testid="game-menu" data-capture-exclude="true" aria-label={`Links for ${label}: player props, injuries`} title="Player props · injuries">
      ⋯
    </button>
  );
}

/** One external link, the rule everywhere here: a new tab. */
export const OutLink = ({ url, children, className }: { url: string; children: ReactNode; className?: string }) => (
  <a className={className} href={url} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

/** The widget's game-links pop-up (on useHoverPopup): spread `handlers` on the wrapper, render `node` inside it. */
export function useGameLinksPopup(data: CalendarData | undefined) {
  return useHoverPopup(
    'data-game-links',
    (gameId) => {
      const g = data?.games.find((x) => x.gameId === gameId);
      if (!g) return null;
      return (
        <ul className="ck-game-links">
          {gameLinks(g.awayTeam.teamId, g.homeTeam.teamId).map((l) => (
            <li key={l.label}>
              <OutLink url={l.url} className="ck-game-link">
                {l.label} ↗
              </OutLink>
            </li>
          ))}
        </ul>
      );
    },
    { className: 'ck-series-pop ck-game-links-pop', label: 'Game links', testId: 'game-links-popup' },
  );
}
