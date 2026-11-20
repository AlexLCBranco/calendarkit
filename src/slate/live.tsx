// Live scores (CK-21): while a game is being played, every view that shows the matchup shows the score so far and a
// red "LIVE" label with the period and clock; once ESPN has it as finished, the normal final score — with no reload
// and no wait for the morning snapshot. The data is the odds store's answer (src/slate/odds.ts), which the host hands
// down as context (calendarkit: CalendarView; the Slate part: its `odds` input). Without a store nothing is asked and
// every game shows as the snapshot has it.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { liveDetail, type GameLive } from '../data/odds';
import { gameLive, withFinal, type SlateOdds } from './odds';

/** The odds store the views read live scores from; none (tests, hosts without it): no live scores, no request. */
export const LiveScores = createContext<SlateOdds | undefined>(undefined);

const DAY_MS = 86_400_000;
/** A game that can be live around `now` (cheap, so the views' many games outside it cost nothing). */
export const liveCandidate = (g: ScheduleGame, now: number) => {
  if (g.status === 'final' || !g.startTimeUtc) return false;
  const tip = Date.parse(g.startTimeUtc);
  return tip - now < 2 * DAY_MS && now - tip < DAY_MS;
};

const NO_SUB = () => () => {};
export interface LiveGame {
  /** The game, final with ESPN's score once it has finished (the snapshot's object otherwise). */
  game: ScheduleGame;
  /** The score so far, period and clock while it is being played. */
  live?: GameLive;
}

/**
 * A game as it stands now: `game` final once ESPN has it finished, `live` while it is being played. Watches the game
 * (the store polls only while one on screen is live or about to be); `now` (default: when the view mounted) only picks
 * the games worth watching.
 */
export function useLive(g: ScheduleGame, now?: number): LiveGame {
  const store = useContext(LiveScores);
  const [mounted] = useState(Date.now);
  const on = !!store && liveCandidate(g, now ?? mounted);
  useEffect(() => (on ? store!.watch([g]) : undefined), [on, store, g]);
  const subscribe = useCallback((fn: () => void) => (on ? store!.subscribe(g.dateEt, fn) : () => {}), [on, store, g.dateEt]);
  const day = useSyncExternalStore(on ? subscribe : NO_SUB, () => (on ? store!.get(g.dateEt) : undefined));
  return useMemo(() => {
    if (!day) return { game: g };
    const live = gameLive(g, day);
    return live ? { game: g, live } : { game: withFinal(g, day) };
  }, [g, day]);
}

/** Both sides' scores from one team's side (the selected team, or the away team in league views). */
export const liveFrom = (g: ScheduleGame, live: GameLive, teamId: number) =>
  g.homeTeam.teamId === teamId ? { score: live.home, oppScore: live.away } : { score: live.away, oppScore: live.home };

/**
 * The red "LIVE" label and, beside it, the period and clock ("Q3 4:12", "Half", "End Q3", "OT 1:30"); `detail={false}`
 * drops them (the small calendar cells); `score` adds the score where the view has no score of its own ("58–61");
 * `maxChars`: a longer detail shows the period alone ("Q1" for "Q1 11:48"), the full one in the tooltip (the Slate strip).
 */
export function LiveLabel({ live, detail = true, score, maxChars }: { live: GameLive; detail?: boolean; score?: string; maxChars?: number }) {
  const full = liveDetail(live);
  const d = maxChars && full.length > maxChars ? full.split(' ')[0]! : full;
  return (
    <span className="ck-live" data-testid="live" data-tip={`Live: ${full}`} aria-label={`Live, ${full}${score ? `, ${score}` : ''}`}>
      <span className="ck-live-tag">LIVE</span>
      {detail && <span className="ck-live-clock"> {d}</span>}
      {score && <span className="ck-live-score"> {score}</span>}
    </span>
  );
}
