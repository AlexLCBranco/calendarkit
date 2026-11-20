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

/** Where a team link goes: the team's Calendar (names, logos, tricodes) or its List (its record: every game, rest days on). */
export type TeamLinkView = 'calendar' | 'list';

export interface TeamLinks {
  /** The Team view URL for a team (its Calendar, on the date shown as of now). */
  href: (teamId: number, view?: TeamLinkView) => string;
}

export const TeamLinkContext = createContext<TeamLinks | undefined>(undefined);

/** The class on every team link (hover styles in styles/team-link.css; `.ck-capturing` drops them in images). */
export const TEAM_LINK_CLASS = 'ck-tlink';
export const TEAM_LINK_SELECTOR = 'a[data-team-link]';

/** The team link an event happened on, with its team id, or undefined. */
export function teamLinkTarget(target: EventTarget | null): { a: HTMLAnchorElement; teamId: number; view: TeamLinkView } | undefined {
  const a = target instanceof Element ? target.closest<HTMLAnchorElement>(TEAM_LINK_SELECTOR) : null;
  const teamId = Number(a?.dataset.teamLink);
  return a && teamId ? { a, teamId, view: a.dataset.teamView === 'list' ? 'list' : 'calendar' } : undefined;
}

type TeamLinkProps = { teamId: number; /** 'list': the team's List (a record) */ view?: TeamLinkView; className?: string; children?: ReactNode } & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>;

/**
 * A team's name / tricode / logo: an <a> to its Team view under a provider (not in the tab order: the Slate's note
 * boxes and the views keep their Tab stops), else a <span>. Same class, same children, so the layout is unchanged.
 */
export function TeamLink({ teamId, view, className, children, ...rest }: TeamLinkProps) {
  const links = useContext(TeamLinkContext);
  if (!links || !teamId)
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    );
  return (
    <a className={className ? `${className} ${TEAM_LINK_CLASS}` : TEAM_LINK_CLASS} href={links.href(teamId, view)} data-team-link={teamId} data-team-view={view === 'list' ? 'list' : undefined} draggable={false} tabIndex={-1} {...rest}>
      {children}
    </a>
  );
}

/**
 * A team's Team Calendar on `date`, for a host outside calendarkit (the gauntlet's Slate widget, which opens it in a new
 * tab): calendarkit's own team-link address (App.tsx teamLinkUrl) with the default options, under `base` (calendarkit's root).
 */
export function teamCalendarUrl(teamId: number, date: string, base = '/calendar/', view: TeamLinkView = 'calendar'): string {
  const p = new URLSearchParams({ view: 'team', layout: view, team: TEAM_BY_ID.get(teamId)?.tricode ?? '', on: date });
  return `${base}?${p}`;
}

/** A team's record: "All BOS games" (the link's tooltip), its Team List with the rest days. */
export const teamListTip = (tricode: string) => `All ${tricode} games`;
