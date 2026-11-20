// The "Cup" label of a game, wherever it is shown: a link to the NBA Cup page (that game's group, or the bracket for a
// knockout game), and on hover the game's group table (or the two teams' way through the Cup). Like the team links: an
// <a> only under a `CupLinkContext` provider (calendarkit's CalendarView; a host outside it gives `cupPageUrl`), else
// the plain <span> it always was. The host handles every label with one click handler on its root (`cupLinkTarget`),
// and shows the popup with `useCupPopup` (one per widget, on useHoverPopup).

import { createContext, useContext, type ReactNode } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import type { CalendarData } from '../data/model';
import { cupFocusOf, cupFocusParam, cupPopupData, type CupFocus } from '../data/cupPopup';
import { cupFatesNow } from '../data/cupDecide';
import { TEAM_BY_ID, teamLogo } from '../data/teams';
import { useHoverPopup } from './hoverPopup';
import { TeamLink } from './teamLink';

export interface CupLinks {
  /** The Cup page's URL for a game's group or the bracket ('' = no link). */
  href: (focus: CupFocus) => string;
}
export const CupLinkContext = createContext<CupLinks | undefined>(undefined);

export const CUP_LINK_TIP = 'Open the NBA Cup page';
export const CUP_LINK_SELECTOR = 'a[data-cup-link]';

/** The Cup label an event happened on, with its game id, or undefined. */
export function cupLinkTarget(target: EventTarget | null): { a: HTMLAnchorElement; gameId: string } | undefined {
  const a = target instanceof Element ? target.closest<HTMLAnchorElement>(CUP_LINK_SELECTOR) : null;
  return a?.dataset.cupLink ? { a, gameId: a.dataset.cupLink } : undefined;
}

/**
 * The Cup page for a game, for a host outside calendarkit (the gauntlet's Slate widget opens it in a new tab):
 * calendarkit's own address (App.tsx cupLinkUrl) under `base` (calendarkit's root).
 */
export function cupPageUrl(focus: CupFocus, base = '/calendar/'): string {
  const p = new URLSearchParams({ view: 'cup' });
  if (focus.kind === 'bracket') p.set('cup', 'simulator');
  p.set('cg', cupFocusParam(focus));
  return `${base}?${p}`;
}

/**
 * A game's Cup label ("Cup", "Cup QF", "NBA Cup", "West A"…). Under a provider: a link to the Cup page (pointer, the
 * tooltip "Open the NBA Cup page"; not in the tab order, as the team links). Always: `data-cup-pop`, the popup's hook.
 */
export function CupLabel({ game, className, long, children }: { game: ScheduleGame; className: string; /** The label's full name ("NBA Cup Quarterfinal") */ long: string; children: ReactNode }) {
  const links = useContext(CupLinkContext);
  const focus = cupFocusOf(game);
  const href = links && focus ? links.href(focus) : '';
  if (!href)
    return (
      <span className={className} title={long} data-cup-pop={focus ? game.gameId : undefined} data-testid="cup-label">
        {children}
      </span>
    );
  return (
    <a className={`${className} ck-cuplink`} href={href} data-cup-link={game.gameId} data-cup-pop={game.gameId} draggable={false} tabIndex={-1} aria-label={`${long}. ${CUP_LINK_TIP}`} data-testid="cup-label">
      {children}
    </a>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const groupShort = (g: string) => g.replace(' Group ', ' ');

function Logo({ teamId }: { teamId: number }) {
  const src = teamLogo(teamId);
  return <span className="ck-logo-backing">{src && <img src={src} alt="" width={16} height={16} />}</span>;
}

/** The popup's content for a game (exported for tests). */
export function CupPopupBody({ data, gameId, linked }: { data: CalendarData; gameId: string; /** the label is a link: say what a click does */ linked: boolean }) {
  const d = cupPopupData(data, gameId);
  if (!d) return null;
  const fates = cupFatesNow(data)?.fate;
  const foot = linked && (
    <div className="ck-cuppop-foot" data-testid="cup-pop-foot">
      Click the label: {CUP_LINK_TIP}
    </div>
  );
  if (d.kind === 'knockout')
    return (
      <>
        <div className="ck-series-head">
          <span className="ck-series-title">NBA Cup · {d.round}</span>
        </div>
        {d.paths.length === 0 && <div className="ck-cuppop-none">The teams aren’t decided yet</div>}
        <div className="ck-cuppop-paths" data-testid="cup-pop-paths">
          {d.paths.map((p) => (
            <div key={p.teamId} className="ck-cuppop-path" data-team={p.tricode}>
              <div className="ck-cuppop-path-team">
                <Logo teamId={p.teamId} />
                <TeamLink teamId={p.teamId}>{p.tricode}</TeamLink>
              </div>
              {p.steps.map((s, i) => (
                <div key={i} className={`ck-cuppop-step${s.result ? ` ck-cuppop-${s.result}` : ''}`}>
                  <span className="ck-cuppop-round">{s.round}</span> {s.text}
                </div>
              ))}
            </div>
          ))}
        </div>
        {foot}
      </>
    );
  return (
    <>
      <div className="ck-cuppop-tables">
        {d.tables.map((t) => (
          <table key={t.group} className="ck-cuppop-table" data-group={t.group} data-testid="cup-pop-group">
            <thead>
              <tr>
                <th colSpan={2} className="ck-cuppop-name">
                  NBA Cup · {groupShort(t.group)}
                </th>
                <th>W-L</th>
                <th>Diff</th>
                <th aria-label="Goes through" />
              </tr>
            </thead>
            <tbody>
              {t.teams.map((x) => {
                const fate = fates?.get(x.teamId);
                const through = fate === 'in' ? 'IN' : fate === 'out' ? 'OUT' : x.status === 'leader' ? '★' : x.status === 'wild-card' ? 'WC' : '';
                const why = fate === 'in' ? 'Clinched a knockout spot' : fate === 'out' ? 'Can no longer qualify' : x.status === 'leader' ? 'Leads the group: goes through if group play ended today' : x.status === 'wild-card' ? 'Holds the wild card: goes through if group play ended today' : undefined;
                const on = d.teams.includes(x.teamId);
                return (
                  <tr key={x.teamId} className={on ? 'ck-cuppop-on' : undefined} data-team={x.tricode} data-on={on || undefined}>
                    <td className="ck-cuppop-rank">{x.rank}</td>
                    <td className="ck-cuppop-team">
                      <Logo teamId={x.teamId} />
                      <TeamLink teamId={x.teamId}>{TEAM_BY_ID.get(x.teamId)?.tricode ?? x.tricode}</TeamLink>
                    </td>
                    <td className="ck-cuppop-rec">
                      {x.w}-{x.l}
                    </td>
                    <td className={`ck-cuppop-diff ${x.diff > 0 ? 'ck-cup-pos-text' : x.diff < 0 ? 'ck-cup-neg-text' : ''}`}>{signed(x.diff)}</td>
                    <td className={`ck-cuppop-through${through === 'OUT' ? ' ck-cuppop-out' : ''}`} title={why}>
                      {through}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
      {foot}
    </>
  );
}

/**
 * The widget's one Cup popup: spread `handlers` on the wrapper, render `node` inside it. A click inside the popup pins
 * it (the label's own click goes to the Cup page); `close` for the host's navigation.
 */
export function useCupPopup(data: CalendarData | undefined, opts: { /** the labels are links (a CupLinkContext is provided) */ linked?: boolean } = {}) {
  return useHoverPopup('data-cup-pop', (gameId) => (data ? <CupPopupBody data={data} gameId={gameId} linked={!!opts.linked} /> : null), { className: 'ck-series-pop ck-cuppop', label: 'NBA Cup group', testId: 'cup-popup', pinInside: true });
}
