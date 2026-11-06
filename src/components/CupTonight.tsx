// Round 21 (item 12): "Tonight in the Cup" — on a night with Cup group games, at the top of the Cup page: tonight's Cup
// games in one compact row, each team with its Cup record, its point differential and its stakes chips (item 11, the
// same chips as the Slate); games link to hoopsjunkie, teams to their schedule. On a night without Cup games: nothing,
// and no room kept for it.

import { cupStandingsOf } from '../data/cup';
import type { CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { useCupStakes } from '../slate/cupFates';
import type { GameLink } from '../slate/links';
import { GameLinkIcon } from '../slate/parts';
import { TeamLink } from '../slate/teamLink';
import type { StakeChip } from '../data/cupStakes';

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** Tonight's Cup group games (`today`, the ET game date of the local today). */
export const tonightCupGames = (data: CalendarData, today: string) => (data.byDate.get(today) ?? []).filter((g) => g.isCupGroupGame);

export function CupTonight({ data, today, gameLink, lead, inline = false }: { data: CalendarData; today: string; gameLink?: GameLink; /** shown first (e.g. "Through Thu, Nov 26") */ lead?: string; /** in the Cup header's row (no frame of its own) */ inline?: boolean }) {
  const games = tonightCupGames(data, today);
  const chips = useCupStakes(data, today, games.length > 0);
  if (!games.length) return null;
  const lines = cupStandingsOf(data).byTeam;
  const side = (t: ScheduleGame['homeTeam']) => {
    const l = lines.get(t.teamId);
    const c: StakeChip[] = chips?.get(t.teamId) ?? [];
    return (
      <span className="ck-tonight-team" data-team={t.teamTricode}>
        <TeamLink teamId={t.teamId} className="ck-tonight-tri">
          {t.teamTricode}
        </TeamLink>
        {l && (
          <span className="ck-tonight-rec" title={`${t.teamTricode} in the Cup: ${l.w}-${l.l}, point differential ${signed(l.diff)}`}>
            {l.w}-{l.l} <span className={l.diff > 0 ? 'ck-cup-pos-text' : l.diff < 0 ? 'ck-cup-neg-text' : ''}>{signed(l.diff)}</span>
          </span>
        )}
        {c.map((x) => (
          <span key={x.kind} className={`ck-stake ck-stake-${x.kind}`} data-tip={x.tip} title={x.tip}>
            {x.text}
          </span>
        ))}
      </span>
    );
  };
  return (
    <div className={`ck-tonight${inline ? ' ck-tonight-inline' : ''}`} data-testid="cup-tonight" role="region" aria-label="Tonight in the Cup" data-capture-exclude="true">
      <span className="ck-tonight-title">Tonight in the Cup</span>
      {lead && <span className="ck-tonight-lead">{lead}</span>}
      {games.map((g) => {
        const url = gameLink?.(g);
        return (
          <span key={g.gameId} className="ck-tonight-game" data-game-id={g.gameId} data-testid="tonight-game">
            {side(g.awayTeam)}
            <span className="ck-vsat">@</span>
            {side(g.homeTeam)}
            {url && <GameLinkIcon url={url} />}
          </span>
        );
      })}
    </div>
  );
}
