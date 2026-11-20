// One NBA Cup group game from one team's side, as a small square — the ONE square used wherever Cup
// group games appear (Cup standings, the Slate's Cup rows, the simulator, Cup history). "vs" (home) or "@" (away) in
// smaller muted text before the opponent's tricode, visible without hovering; a played game below it: W / L (and, where
// asked, the margin: "W +12"), coloured by the result; a game to come: the opponent alone, muted. Tonight's game is
// outlined. The tooltip keeps the full final score ("DEN 127 @ PHX 120 · Final"). With a URL the square is the game's
// hoopsjunkie page (new tab); a control's square (the simulator's picks) passes none.

import type { ReactNode } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { finalScore, overtime, teamLabel } from '../data/model';
import { liveDetail, type GameLive } from '../data/odds';

/** What a square shows: one game from one team's side (CupSlot in data/cup.ts has these fields). */
export interface CupSquareGame {
  gameId: string;
  opponent: string;
  home: boolean;
  played: boolean;
  win?: boolean;
  /** This team's points minus the opponent's (the game's real margin). */
  margin?: number;
  /** The full final score, away team first: "HOU 105 @ DEN 112 · Final/OT". */
  final?: string;
  /** Being played (CK-21): this team's score so far against the opponent's ("58–61"), and the tooltip's line. */
  live?: { score: string; tip: string };
}

/**
 * A square as it stands now (CK-21): `game` is the game with ESPN's final if it has one (useLive), `live` the score so
 * far. A game ESPN has finished before the snapshot shows its W / L and margin; one being played shows LIVE.
 */
export function cupSquareNow(s: CupSquareGame, game: ScheduleGame, live: GameLive | undefined): CupSquareGame {
  const team = s.home ? game.homeTeam : game.awayTeam;
  const away = teamLabel(game.awayTeam);
  const home = teamLabel(game.homeTeam);
  if (live) {
    const [mine, theirs] = s.home ? [live.home, live.away] : [live.away, live.home];
    return { ...s, live: { score: `${mine}–${theirs}`, tip: `LIVE ${liveDetail(live)} · ${away} ${live.away} @ ${home} ${live.home}` } };
  }
  const r = !s.played ? finalScore(game, team.teamId) : undefined;
  if (!r) return s;
  const ot = overtime(game);
  return { ...s, played: true, win: r.win, margin: r.score - r.oppScore, final: `${away} ${game.awayTeam.score} @ ${home} ${game.homeTeam.score} · ${ot ? `Final/${ot}` : 'Final'}` };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export function CupSquare({ g, url, margin = false, tonight = false, tip, className = '' }: { g: CupSquareGame; url?: string; margin?: boolean; tonight?: boolean; /** overrides the tooltip */ tip?: string; className?: string }) {
  const at = g.home ? 'vs' : '@';
  const where = g.home ? 'vs' : 'at';
  const label = g.live ? `${where} ${g.opponent}, live ${g.live.score}` : g.played ? `${g.win ? 'Won' : 'Lost'} ${where} ${g.opponent}: ${g.final}` : `${where} ${g.opponent}, ${tonight ? 'tonight' : 'not played yet'}`;
  const cls = `ck-cup-slot ${g.live ? 'ck-cup-slot-live' : g.played ? (g.win ? 'ck-cup-slot-w' : 'ck-cup-slot-l') : 'ck-cup-slot-next'}${tonight ? ' ck-cup-slot-tonight' : ''}${className}`;
  const body: ReactNode = (
    <>
      <span className="ck-cup-slot-opp">
        <span className="ck-cup-slot-at">{at}</span>
        {g.opponent}
      </span>
      {g.live && (
        <span className="ck-cup-slot-res ck-cup-slot-livescore">
          <span className="ck-live-tag">LIVE</span>
        </span>
      )}
      {!g.live && g.played && (
        <span className="ck-cup-slot-res">
          {g.win ? 'W' : 'L'}
          {margin && g.margin !== undefined && <span className="ck-cup-slot-margin"> {signed(g.margin)}</span>}
        </span>
      )}
    </>
  );
  const common = { className: cls, 'data-game-id': g.gameId, 'data-tip': tip ?? g.live?.tip ?? g.final, 'data-tonight': tonight || undefined, 'aria-label': label } as const;
  return url ? (
    <a {...common} href={url} target="_blank" rel="noopener noreferrer" draggable={false} data-testid="cup-square">
      {body}
    </a>
  ) : (
    <span {...common} tabIndex={g.played ? 0 : undefined} data-testid="cup-square">
      {body}
    </span>
  );
}
