// Every team name, logo and tricode is a link to that team's Team view. One shared piece for calendarkit's
// views and the Slate part: `TeamLink` renders an <a> only under a `TeamLinkContext` provider (calendarkit's
// CalendarView), else the plain <span> it always was (the gauntlet's Slate, tests without a host).
//
// Cost: no listener per link. The host handles every link with one capture-phase click / pointerdown handler on its
// root (`teamLinkTarget`), and the context value never changes, so no link re-renders for a new date or Team mode:
// `href` is right as of the link's last render and the host rewrites it on pointerdown (before a click, a middle-click
// or a context menu reads it).

import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';
import { TEAM_BY_ID } from '../data/teams';

export interface TeamLinks {
  /** The Team view URL for a team (its Calendar, on the date shown as of now). */
  href: (teamId: number) => string;
}

export const TeamLinkContext = createContext<TeamLinks | undefined>(undefined);

/** The class on every team link (hover styles in styles/team-link.css; `.ck-capturing` drops them in images). */
export const TEAM_LINK_CLASS = 'ck-tlink';
export const TEAM_LINK_SELECTOR = 'a[data-team-link]';

/** The team link an event happened on, with its team id, or undefined. */
export function teamLinkTarget(target: EventTarget | null): { a: HTMLAnchorElement; teamId: number } | undefined {
  const a = target instanceof Element ? target.closest<HTMLAnchorElement>(TEAM_LINK_SELECTOR) : null;
  const teamId = Number(a?.dataset.teamLink);
  return a && teamId ? { a, teamId } : undefined;
}

type TeamLinkProps = { teamId: number; className?: string; children?: ReactNode } & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>;

/**
 * A team's name / tricode / logo: an <a> to its Team view under a provider (not in the tab order: the Slate's note
 * boxes and the views keep their Tab stops), else a <span>. Same class, same children, so the layout is unchanged.
 */
export function TeamLink({ teamId, className, children, ...rest }: TeamLinkProps) {
  const links = useContext(TeamLinkContext);
  if (!links || !teamId)
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    );
  return (
    <a className={className ? `${className} ${TEAM_LINK_CLASS}` : TEAM_LINK_CLASS} href={links.href(teamId)} data-team-link={teamId} draggable={false} tabIndex={-1} {...rest}>
      {children}
    </a>
  );
}

/**
 * A team's Team Calendar on `date`, for a host outside calendarkit (the gauntlet's Slate widget, which opens it in a new
 * tab): calendarkit's own team-link address (App.tsx teamLinkUrl) with the default options, under `base` (calendarkit's root).
 */
export function teamCalendarUrl(teamId: number, date: string, base = '/calendar/'): string {
  const p = new URLSearchParams({ view: 'team', layout: 'calendar', team: TEAM_BY_ID.get(teamId)?.tricode ?? '', on: date });
  return `${base}?${p}`;
}
