// One floating tooltip per widget for every [data-tip] element (hover + keyboard focus).

import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { teamLogo } from '../data/teams';

/** A left edge for a box `w` px wide near `x`, kept 8 px inside the viewport. */
export const clampX = (x: number, w: number) => Math.max(8, Math.min(x, document.documentElement.clientWidth - w - 8));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND = { g: 'game', r: 'rest', t: 'tonight' } as const;

/** A game day of a strip from the team's side: "vs LAL" / "@ DEN", the opponent's logo, its hoopsjunkie page. */
export interface StripGame {
  at: 'vs' | '@';
  opponentId: number;
  opponent: string;
  url?: string;
}
/**
 * The host's lookup for a strip's games: the stretch's game ids (`data-tip-games`) → ET date → that game from the
 * team's side (the team is the one every game shares).
 */
export type StripGames = (ids: readonly string[]) => ReadonlyMap<string, StripGame> | undefined;

/** How long a tooltip with a day strip stays after the pointer leaves its element, so the pointer can reach a square. */
export const STRIP_CLOSE_MS = 180;

/**
 * A day strip under the text, from `data-tip-days` ("YYYY-MM-DD:g|r|t" joined by spaces — a game, a rest day,
 * tonight; scheduleTags mergedDays, runs runTipDays): one square per day — a game day with the matchup ("vs LAL" /
 * "@ DEN", the opponent's logo) and a link to its page, a rest day empty with a dashed edge, tonight highlighted —
 * the day of the month under each, the month under the first and the 1st.
 */
function DayStrip({ days, games }: { days: string; games?: ReadonlyMap<string, StripGame> }) {
  const cells = days.split(' ').map((d) => ({ date: d.slice(0, 10), kind: KIND[d.slice(11) as keyof typeof KIND] ?? 'rest' }));
  return (
    <div className="ck-tip-days" data-testid="tip-days">
      {cells.map(({ date, kind }, i) => {
        const day = Number(date.slice(8, 10));
        const g = kind !== 'rest' ? games?.get(date) : undefined;
        const logo = g && teamLogo(g.opponentId);
        const body = g ? (
          <>
            {logo && (
              <span className="ck-sq-logo">
                <img src={logo} alt="" width={16} height={16} />
              </span>
            )}
            <span className="ck-tip-match">
              {g.at === '@' ? '@' : 'vs'} {g.opponent}
            </span>
          </>
        ) : null;
        return (
          <span key={date} className={`ck-tip-day ck-tip-${kind}`} data-date={date} data-kind={kind} data-testid="tip-day">
            {g?.url ? (
              <a className="ck-tip-sq" href={g.url} target="_blank" rel="noopener noreferrer" title="Open on hoopsjunkie" aria-label={`${g.at === '@' ? 'at' : 'vs'} ${g.opponent}. Open on hoopsjunkie`} data-testid="tip-game">
                {body}
              </a>
            ) : (
              <i className="ck-tip-sq" aria-label={kind === 'rest' ? 'rest day' : g ? `${g.at === '@' ? 'at' : 'vs'} ${g.opponent}` : undefined}>
                {body}
              </i>
            )}
            <span className="ck-tip-num">{i === 0 || day === 1 ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${day}` : day}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * One floating tooltip for every `[data-tip]` element in the widget, shown on hover and keyboard focus. Fixed
 * positioning, so cells with overflow: hidden don't clip it, and clamped into the viewport. A tip with a day strip
 * stays a moment after the pointer leaves its element and while the pointer is on it, so a game square can be clicked;
 * `games` gives the strip its matchups (none: plain squares).
 */
export function useTooltip(games?: StripGames) {
  const [tip, setTip] = useState<{ text: string; days?: string; ids?: string; x: number; top: number; bottom: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const closer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const keep = () => clearTimeout(closer.current);
  const hide = () => (keep(), setTip(undefined));
  const later = () => {
    keep();
    closer.current = setTimeout(() => setTip(undefined), STRIP_CLOSE_MS);
  };
  const show = (e: SyntheticEvent) => {
    const target = e.target as Element;
    if (ref.current?.contains(target)) return keep();
    const el = target.closest?.('[data-tip]');
    // A streak has its popup instead
    if (!el || target.closest?.('[data-streak]')) return tip?.days ? later() : hide();
    keep();
    const r = el.getBoundingClientRect();
    const text = el.getAttribute('data-tip')!;
    const days = el.getAttribute('data-tip-days') ?? undefined;
    const ids = el.getAttribute('data-tip-games') ?? undefined;
    setTip((t) => (t && t.text === text && t.days === days && t.x === r.left + r.width / 2 && t.top === r.top ? t : { text, days, ids, x: r.left + r.width / 2, top: r.top, bottom: r.bottom }));
  };
  const leave = () => (tip?.days ? later() : hide());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    el.style.left = `${clampX(tip.x - el.offsetWidth / 2, el.offsetWidth)}px`;
    const above = tip.top - el.offsetHeight - 6;
    // A tip with a strip takes the pointer on its squares, so it never covers the top bar (it opens below its element
    // instead): a tip that opened under a resting pointer must not sit on the controls the next click goes to
    const floor = tip.days ? (document.querySelector('[data-testid="top-bar"]')?.getBoundingClientRect().bottom ?? 0) + 4 : 4;
    el.style.top = `${above >= floor ? above : tip.bottom + 6}px`;
  });
  useEffect(() => {
    if (!tip) return;
    const timer = closer;
    const onScroll = () => (clearTimeout(timer.current), setTip(undefined));
    window.addEventListener('scroll', onScroll, true);
    return () => (window.removeEventListener('scroll', onScroll, true), clearTimeout(timer.current));
  }, [tip]);
  const strip = tip?.days && tip.ids && games ? games(tip.ids.split(' ')) : undefined;
  return {
    handlers: { onMouseOver: show, onFocus: show, onMouseLeave: leave, onBlur: hide },
    node: tip && (
      <div ref={ref} className={`ck-tooltip${tip.days ? ' ck-tooltip-days' : ''}`} role="tooltip" data-testid="tooltip" data-capture-exclude="true" onMouseEnter={keep} onMouseLeave={later}>
        {tip.text}
        {tip.days && <DayStrip days={tip.days} games={strip} />}
      </div>
    ),
  };
}
