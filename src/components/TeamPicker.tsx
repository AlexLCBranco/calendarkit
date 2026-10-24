// Team picker: button with the team's logo + name, opening a listbox grouped by conference and division.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ScheduleGame } from '../shared/nba-schedule/parse';
import { DIVISIONS, TEAMS, TEAM_BY_ID, type Team } from '../data/teams';
import { TeamLogo } from './GameCard';
import { clampX, fullName } from './widget';

const PICKER_ORDER: Team[] = DIVISIONS.flatMap(({ division }) => TEAMS.filter((t) => t.division === division));

/**
 * Team picker with logos: a button (logo + name; tricode on phones) opening a listbox grouped by conference and
 * division. Keyboard: Enter/Space/↓ open; arrows move (←/→ jump a division), Home/End, a letter jumps to the next
 * team starting with it, Enter selects, Escape closes; focus returns to the button.
 */
export function TeamPicker({ teamId, onChange, compact = false }: { teamId: number; onChange: (teamId: number) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(teamId);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const team = TEAM_BY_ID.get(teamId)!;
  const id = `ck-team-${useId()}`;

  const openList = () => {
    const r = btn.current!.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
    setActive(teamId);
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
    const i = PICKER_ORDER.findIndex((t) => t.id === active);
    setActive(PICKER_ORDER[Math.max(0, Math.min(PICKER_ORDER.length - 1, i + by))]!.id);
  };
  const onListKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      ArrowRight: () => move(compact ? 15 : 5),
      ArrowLeft: () => move(compact ? -15 : -5),
      Home: () => setActive(PICKER_ORDER[0]!.id),
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
      const rot = [...PICKER_ORDER.slice(i + 1), ...PICKER_ORDER.slice(0, i + 1)];
      const hit = rot.find((t) => fullName(t).toLowerCase().startsWith(e.key.toLowerCase()) || t.name.toLowerCase().startsWith(e.key.toLowerCase()));
      if (hit) setActive(hit.id);
    }
  };

  return (
    <div className="ck-picker">
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
        data-team-id={teamId}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
      >
        <TeamLogo team={{ teamId } as ScheduleGame['homeTeam']} />
        <span className="ck-picker-name">{compact ? team.tricode : fullName(team)}</span>
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
                  onMouseEnter={() => setActive(t.id)}
                >
                  <TeamLogo team={{ teamId: t.id } as ScheduleGame['homeTeam']} />
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
