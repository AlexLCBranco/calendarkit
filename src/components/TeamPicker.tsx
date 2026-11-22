// The team box in the header's controls row: a button with the team's logo and full name that opens the list of teams
// by division (East over West, three columns), and beside it the "All teams" button — always on screen with the box,
// one click to the league view.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { DIVISIONS, TEAMS, TEAM_BY_ID, type Team } from '../data/teams';
import { injuryUrl } from '../slate/gameLinks';
import { TeamLogo } from './GameCard';
import { clampX, fullName } from './widget';

const PICKER_ORDER: Team[] = DIVISIONS.flatMap(({ division }) => TEAMS.filter((t) => t.division === division));

export interface TeamPickerHandle {
  open(): void;
}

/**
 * Team picker with logos: a button (logo + full name; the tricode on narrower windows and phones) opening a listbox
 * grouped by conference and division. Keyboard: Enter/Space/↓ open; arrows move (←/→ jump a division), Home/End, a
 * letter jumps to the next team starting with it, Enter selects, Escape closes; focus returns to the button.
 * Without a team (the league view; the Cup's Team schedule before a pick) the button reads "Pick a team", no logo.
 * Fixed width, so the controls after it never move.
 */
export function TeamPicker({ teamId, onChange, compact = false, handle }: { teamId?: number; onChange: (teamId: number) => void; compact?: boolean; /** Set to a handle that opens the list (the Team Calendar's own team name does) */ handle?: RefObject<TeamPickerHandle | null> }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(teamId ?? PICKER_ORDER[0]!.id);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const team = teamId === undefined ? undefined : TEAM_BY_ID.get(teamId);
  const id = `ck-team-${useId()}`;

  const openList = () => {
    const r = btn.current!.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
    setActive(teamId ?? PICKER_ORDER[0]!.id);
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const pick = (t: number) => {
    close();
    if (t !== teamId) onChange(t);
  };
  const order = PICKER_ORDER;
  if (handle) handle.current = { open: () => !open && openList() };
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el) return;
    el.style.left = `${clampX(pos.left, el.offsetWidth)}px`;
    el.focus();
  }, [open, pos]);
  useLayoutEffect(() => {
    if (open) list.current?.querySelector(`[data-team-id="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => !list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && close(false);
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const move = (by: number) => {
    const i = order.findIndex((t) => t.id === active);
    setActive(order[Math.max(0, Math.min(order.length - 1, i + by))]!.id);
  };
  const onListKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      ArrowRight: () => move(compact ? 15 : 5),
      ArrowLeft: () => move(compact ? -15 : -5),
      Home: () => setActive(order[0]!.id),
      End: () => setActive(PICKER_ORDER.at(-1)!.id),
      Enter: () => pick(active),
      ' ': () => pick(active),
      Escape: () => close(),
      Tab: () => close(),
    };
    if (keys[e.key]) {
      if (e.key !== 'Tab') e.preventDefault();
      keys[e.key]!();
    } else if (/^[a-z]$/i.test(e.key)) {
      // next team (after the active one) whose city or name starts with the letter
      const i = PICKER_ORDER.findIndex((t) => t.id === active);
      const rot = [...PICKER_ORDER.slice(i + 1), ...PICKER_ORDER.slice(0, i + 1)]; // never lands on "All teams"
      const hit = rot.find((t) => fullName(t).toLowerCase().startsWith(e.key.toLowerCase()) || t.name.toLowerCase().startsWith(e.key.toLowerCase()));
      if (hit) setActive(hit.id);
    }
  };

  return (
    <div className="ck-picker ck-picker-scope">
      <span id={`${id}-label`} className="ck-sr">
        Team
      </span>
      <button
        ref={btn}
        type="button"
        id={`${id}-button`}
        className="ck-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-button`}
        data-testid="team-picker"
        title={team ? `${fullName(team)}: pick another team` : 'Pick a team'}
        data-team-id={teamId}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
      >
        {team && <TeamLogo team={{ teamId } as ScheduleGame['homeTeam']} link={false} />}
        {team && !compact ? (
          // the scope picker: the full name, the tricode on narrower windows (CSS picks one); read out once, as the name
          <span className="ck-picker-name" title={fullName(team)}>
            <span className="ck-sr">{fullName(team)}</span>
            <span className="ck-picker-full" aria-hidden="true">
              {fullName(team)}
            </span>
            <span className="ck-picker-tri" aria-hidden="true">
              {team.tricode}
            </span>
          </span>
        ) : (
          <span className={`ck-picker-name${team ? '' : ' ck-picker-none'}`}>{team ? team.tricode : 'Pick a team'}</span>
        )}
        <span className="ck-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={list}
          className={`ck-picker-list${compact ? ' ck-picker-compact' : ''}`}
          role="listbox"
          aria-label="Teams"
          data-testid="team-picker-list"
          data-no-marquee="true"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          style={{ top: pos.top }}
        >
          {DIVISIONS.map(({ conference, division }) => (
            <div key={division} role="group" aria-labelledby={`${id}-${division}`} className="ck-picker-group">
              <div id={`${id}-${division}`} className="ck-picker-head" role="presentation">
                {conference} · {division}
              </div>
              {TEAMS.filter((t) => t.division === division).map((t) => (
                <div
                  key={t.id}
                  id={`${id}-${t.id}`}
                  role="option"
                  aria-selected={t.id === teamId}
                  data-team-id={t.id}
                  className={`ck-picker-option${t.id === active ? ' ck-picker-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(t.id)}
                  // only a pointer that really moves takes the highlight: when the list opens (or scrolls) under a
                  // resting pointer, Chrome sends that option a mouseover/mouseenter with no movement, which used to
                  // overwrite a keyboard choice made just before (the flaky "Miami instead of Orlando")
                  onMouseMove={(e) => (e.movementX || e.movementY) && setActive(t.id)}
                >
                  <TeamLogo team={{ teamId: t.id } as ScheduleGame['homeTeam']} link={false} />
                  {fullName(t)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "All teams": the league view in one click; lit while it is the view on show. */
export function AllTeamsButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`ck-button ck-all-teams${on ? ' ck-all-teams-on' : ''}`} aria-pressed={on} data-testid="all-teams" title="Every team: the whole league" onClick={() => !on && onClick()}>
      All teams
    </button>
  );
}

/** The team's ESPN injury page, small and muted after the team box (team pages only). */
export function InjuriesLink({ teamId }: { teamId: number }) {
  const url = injuryUrl(teamId);
  if (!url) return null;
  return (
    <a className="ck-team-injuries" href={url} target="_blank" rel="noopener noreferrer" data-testid="team-injuries" data-capture-exclude="true" title="The team's injury report on ESPN">
      Injuries ↗
    </a>
  );
}
