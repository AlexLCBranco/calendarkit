// The simulator's knockout bracket, big and playable: West's quarterfinals → semifinal → the Final ← East's semifinal ←
// quarterfinals, then the champion. Click a team to advance it (again: take it back); the detailed mode also takes the
// margin, as the group picks do. Each game says where it is played (HOST on the home team; the Final's neutral arena),
// its round's dates and what the round is worth per player. The bracket itself is src/data/cupBracket.ts.

import type { ReactNode } from 'react';
import { cupBoard } from '../data/cupSchedule';
import type { Bracket, BracketMatch, BracketPick, BracketSide } from '../data/cupBracket';
import type { Seed, Tiebreak } from '../data/cupEngine';
import { prizeLines } from '../data/cupPrize';
import { hostArena, prepFor } from '../data/knockout';
import { dateFormat, type CalendarData } from '../data/model';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import type { GameLink } from '../slate/links';
import { TeamLink } from '../slate/teamLink';
import { HostTag, VenueBadge, type Venue } from '../slate/VenueMarker';

const tri = (id: number) => TEAM_BY_ID.get(id)?.tricode ?? '?';
const fmtDay = (d: string) => dateFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));
/** "Fri, Dec 4 – Sat, Dec 5" / "Tue, Dec 8": a round's nights from the feed. */
const nights = (games: readonly ScheduleGame[]) => {
  const ds = [...new Set(games.map((g) => g.dateEt))].sort();
  return !ds.length ? 'dates TBD' : ds.length === 1 ? fmtDay(ds[0]!) : `${fmtDay(ds[0]!)} – ${fmtDay(ds.at(-1)!)}`;
};

export interface CupBracketProps {
  data: CalendarData;
  bracket: Bracket;
  mode: 'quick' | 'detailed';
  onPick: (key: BracketMatch['key'], pick?: BracketPick) => void;
  finalVenue: Venue;
  gameLink?: GameLink;
  /** The "depends on margin" mark for a seed that isn't settled. */
  depends: (u: { rule: Tiebreak; games: string[] }) => ReactNode;
}

export function CupBracket({ data, bracket, mode, onPick, finalVenue, gameLink, depends }: CupBracketProps) {
  const board = cupBoard(data); // once per data set
  const prize = prizeLines(Number(data.seasonYear.slice(0, 4)));
  // Rest / travel before a quarterfinal, from the real schedule (the trip to the host's arena); the rest only once the
  // feed gives the matchup its night
  const qfDates = [...new Set(board.qf.map((g) => g.dateEt))].sort();
  const prep = (team: number, host?: number) => (host === undefined ? undefined : qfDates[0] ? prepFor(data, team, qfDates[0], hostArena(data, host), qfDates.length === 1) : prepFor(data, team, undefined, undefined));
  const m = bracket.matches;
  const match = (x: BracketMatch, testId: string, from?: [string, string]) => <Match m={x} testId={testId} mode={mode} onPick={onPick} from={from} prep={x.round === 'QF' ? prep : undefined} venue={x.round === 'F' ? finalVenue : undefined} gameLink={gameLink} depends={depends} />;
  const col = (round: string, when: string, children: ReactNode, line?: string, cls = '') => (
    <div className={`ck-kb-col${cls}`}>
      <div className="ck-kb-colhead">
        <span className="ck-kb-round">{round}</span>
        <span className="ck-kb-when" data-testid="kb-dates">{when}</span>
      </div>
      <div className="ck-kb-games">{children}</div>
      {line && prize && <PrizeLine text={line} source={prize.source} />}
    </div>
  );
  const champ = bracket.champion;
  return (
    <div className="ck-sim-panel ck-kb-panel" data-testid="sim-bracket">
      <div className="ck-kb-top">
        <h3>Knockout bracket</h3>
        <span className="ck-kb-hint">Click a team to advance it{mode === 'detailed' ? ', then its margin' : ''} · HOST = home court</span>
      </div>
      <div className="ck-kb" data-testid="kb">
        {col('West · Quarterfinals', nights(board.qf), <>{match(m['QF-West-1'], 'sim-qf')}{match(m['QF-West-2'], 'sim-qf')}</>, prize?.qf)}
        {col('West · Semifinal', nights(board.sf), match(m['SF-West'], 'sim-sf', ['QF 1 winner', 'QF 2 winner']), prize?.sf)}
        {col(
          'Final',
          nights(board.final),
          <>
            {match(m.F, 'sim-final', ['West winner', 'East winner'])}
            <div className={`ck-kb-champ${champ ? ' ck-kb-champ-set' : ''}`} data-testid="kb-champion" data-team={champ ? tri(champ) : undefined}>
              <span className="ck-kb-trophy" aria-hidden="true">🏆</span>
              {champ ? (
                <>
                  <Logo id={champ} size={30} />
                  {/* city over name: "Cleveland Cavaliers" on one line is wider than the Final's column at 1600 */}
                  <TeamLink teamId={champ} className="ck-kb-champ-name">
                    <span className="ck-kb-champ-city">{TEAM_BY_ID.get(champ)?.city ?? ''}</span>
                    {TEAM_BY_ID.get(champ)?.name ?? tri(champ)}
                  </TeamLink>
                </>
              ) : (
                <span className="ck-kb-champ-none">Champion</span>
              )}
            </div>
          </>,
          prize?.final,
          ' ck-kb-col-final',
        )}
        {col('East · Semifinal', nights(board.sf), match(m['SF-East'], 'sim-sf', ['QF 1 winner', 'QF 2 winner']), prize?.sf, ' ck-kb-col-east')}
        {col('East · Quarterfinals', nights(board.qf), <>{match(m['QF-East-1'], 'sim-qf')}{match(m['QF-East-2'], 'sim-qf')}</>, prize?.qf, ' ck-kb-col-east')}
      </div>
    </div>
  );
}

/** A small muted line under a knockout round — the prize per player; the source in its tooltip. */
export const PrizeLine = ({ text, source }: { text: string; source: string }) => (
  <p className="ck-prize" data-testid="cup-prize" title={`Per player (two-way players: half). Source: ${source}`}>
    {text}
  </p>
);

function Logo({ id, size = 22 }: { id: number; size?: number }) {
  const src = teamLogo(id);
  return (
    <TeamLink teamId={id} className="ck-logo-backing ck-kb-logo" aria-label={tri(id)}>
      {src && <img src={src} alt="" width={size} height={size} />}
    </TeamLink>
  );
}

function Match({ m, testId, mode, onPick, from, prep, venue, gameLink, depends }: { m: BracketMatch; testId: string; mode: 'quick' | 'detailed'; onPick: CupBracketProps['onPick']; from?: [string, string]; prep?: (team: number, host?: number) => { text: string; tip: string } | undefined; venue?: Venue; gameLink?: GameLink; depends: CupBracketProps['depends'] }) {
  const ready = !!m.a && !!m.b && !m.real;
  const url = m.real && gameLink?.(m.real.game);
  const row = (s: BracketSide | undefined, i: 0 | 1) => {
    if (!s)
      return (
        <div className="ck-kb-team ck-kb-open" data-testid="kb-team">
          <span className="ck-kb-wait">{from?.[i] ?? 'TBD'}</span>
        </div>
      );
    const won = m.winner === s.teamId;
    const lost = m.winner !== undefined && !won;
    const p = prep?.(s.teamId, m.host);
    const seed: Seed | undefined = s.seed;
    const body = (
      <>
        <span className="ck-sim-seed ck-kb-seed">{seed?.seed ?? ''}</span>
        <Logo id={s.teamId} />
        <span className="ck-kb-tri">{tri(s.teamId)}</span>
        {m.host === s.teamId && <HostTag />}
        {seed?.wildCard && <span className="ck-cup-wc">WC</span>}
        {seed?.undecided && depends(seed.undecided)}
        {p && (
          <span className="ck-ko-prep" data-testid="ko-prep" title={p.tip}>
            {p.text}
          </span>
        )}
        {m.real && <span className="ck-kb-score">{m.real.score[i]}</span>}
        {won && !m.real && m.margin !== undefined && <span className="ck-kb-score">+{m.margin}</span>}
      </>
    );
    const cls = `ck-kb-team${won ? ' ck-kb-won' : ''}${lost ? ' ck-kb-lost' : ''}`;
    return ready ? (
      <button type="button" className={cls} data-testid="kb-team" data-team={tri(s.teamId)} aria-pressed={won} title={won ? `Take back: ${tri(s.teamId)} advances` : `${tri(s.teamId)} wins and advances`} onClick={() => onPick(m.key, won ? undefined : { winner: s.teamId, margin: m.margin })}>
        {body}
      </button>
    ) : (
      <div className={cls} data-testid="kb-team" data-team={tri(s.teamId)}>
        {body}
      </div>
    );
  };
  return (
    <div className={`ck-kb-match${m.real ? ' ck-kb-real' : ''}`} data-testid={testId} data-key={m.key} data-host={m.host ? tri(m.host) : undefined} data-winner={m.winner ? tri(m.winner) : undefined}>
      {row(m.a, 0)}
      {row(m.b, 1)}
      <div className="ck-kb-meta">
        {venue && <VenueBadge venue={venue} compact />}
        {m.real && url && (
          <a className="ck-kb-link" href={url} target="_blank" rel="noopener noreferrer" title="Open on hoopsjunkie">
            Final ↗
          </a>
        )}
        {mode === 'detailed' && ready && (
          <input
            className="ck-sim-margin"
            type="number"
            min={1}
            max={99}
            placeholder="±"
            aria-label={`Winning margin, ${m.a ? tri(m.a.teamId) : ''} vs ${m.b ? tri(m.b.teamId) : ''}`}
            disabled={m.winner === undefined}
            value={m.margin ?? ''}
            onChange={(e) => {
              if (m.winner === undefined) return;
              const n = Math.round(Number(e.target.value));
              onPick(m.key, { winner: m.winner, margin: e.target.value === '' || !(n >= 1) ? undefined : Math.min(99, n) });
            }}
          />
        )}
      </div>
    </div>
  );
}
