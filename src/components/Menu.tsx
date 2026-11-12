// The menu — page history and the destinations — in one of two variants while Alex tries both (a temporary switch in
// the ⓘ popover, kept in localStorage; the one not picked gets deleted): "rail", a slim strip down the left edge with
// ← → and the destinations (icon + label), the top bar then holding only the destination's controls; or "packed", one
// top row packed to the left (← →, destinations, the destination's sub-views, its date controls). Both: the icon
// buttons at the right end, the options in one popover, the bar always shown.

import { useState, type ReactNode } from 'react';
import type { Destination, PageHistory } from './calendarState';
import { PageArrows, StandingsIcon } from './TopBar';

export type MenuVariant = 'rail' | 'packed';
/** The localStorage key of the variant picked (absent: packed). Shared origin with the whiteboard, hence the prefix. */
export const MENU_KEY = 'ck:menu:v1';
/** The rail's width, taken from the widget's width (the views get the rest). */
export const RAIL_WIDTH = 84;

export function readMenuVariant(): MenuVariant {
  try {
    return localStorage.getItem(MENU_KEY) === 'rail' ? 'rail' : 'packed';
  } catch {
    return 'packed';
  }
}

/** The variant on show, and the switch that changes and remembers it. */
export function useMenuVariant() {
  const [variant, setVariant] = useState(readMenuVariant);
  const set = (v: MenuVariant) => {
    setVariant(v);
    try {
      localStorage.setItem(MENU_KEY, v);
    } catch {
      // storage blocked: the switch still works for this page
    }
  };
  return [variant, set] as const;
}

const CalendarIcon = () => (
  <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M4 1h1.6v2H4zM10.4 1H12v2h-1.6zM1.5 3.2h13v11.3h-13zM3 6.4v6.6h10V6.4z" />
    <path fill="currentColor" d="M4.5 8h2v1.6h-2zM7 8h2v1.6H7zM9.5 8h2v1.6h-2zM4.5 10.6h2v1.6h-2zM7 10.6h2v1.6H7z" opacity=".7" />
  </svg>
);
const CupIcon = () => (
  <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M4 1.5h8v4.2a4 4 0 0 1-8 0zM1.5 2.5H4v1.5H3v.6a1.8 1.8 0 0 0 1.2 1.7l-.4 1.4A3.3 3.3 0 0 1 1.5 4.6zM14.5 2.5H12v1.5h1v.6a1.8 1.8 0 0 1-1.2 1.7l.4 1.4a3.3 3.3 0 0 0 2.3-3.1zM7.2 9.4h1.6v2.6H7.2zM4.5 12.5h7V15h-7z" />
  </svg>
);
const ICONS: Record<Destination, () => ReactNode> = { schedule: CalendarIcon, cup: CupIcon, standings: StandingsIcon };

/** Variant "rail": ← → and the destinations, one under the other, each an icon over its label. */
export function Rail({ value, options, onChange, pageHistory }: { value: Destination; options: [Destination, string][]; onChange: (d: Destination) => void; pageHistory?: PageHistory }) {
  return (
    <nav className="ck-rail" data-testid="rail" aria-label="Menu" style={{ width: RAIL_WIDTH }}>
      {pageHistory && <PageArrows h={pageHistory} />}
      <div className="ck-rail-tabs" role="tablist" aria-label="Destination" aria-orientation="vertical">
        {options.map(([d, label]) => {
          const Icon = ICONS[d];
          return (
            <button key={d} type="button" role="tab" aria-selected={value === d} className={`ck-rail-tab${value === d ? ' ck-rail-tab-on' : ''}`} onClick={() => onChange(d)}>
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The temporary switch between the two menus, in the ⓘ popover. */
export function MenuSwitch({ value, onChange }: { value: MenuVariant; onChange: (v: MenuVariant) => void }) {
  return (
    <div className="ck-menu-switch" data-testid="menu-switch">
      <span className="ck-pop-head">Menu (trial)</span>
      <div className="ck-tabs ck-tabs-small" role="tablist" aria-label="Menu layout">
        {(
          [
            ['rail', 'Rail'],
            ['packed', 'Packed bar'],
          ] as const
        ).map(([v, text]) => (
          <button key={v} type="button" role="tab" aria-selected={value === v} className={`ck-tab${value === v ? ' ck-tab-selected' : ''}`} data-text={text} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The Options icon: three sliders. */
export const OptionsIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M1.5 3.2h13v1.4h-13zM1.5 7.3h13v1.4h-13zM1.5 11.4h13v1.4h-13z" opacity=".55" />
    <path fill="currentColor" d="M4 1.9h2.2v4H4zM9.6 6h2.2v4H9.6zM5.4 10.1h2.2v4H5.4z" />
  </svg>
);
