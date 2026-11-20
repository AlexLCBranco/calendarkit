// The pinned header (backlogkit's NAV_PATTERN.md §1), the same on every page: page history ← →, the breadcrumb (each
// part opens its siblings), "Go anywhere" (Ctrl+K) and the icon buttons on the right, and under them the Where tabs.
// It never changes height and stays at the top while the page scrolls; the page rows under it scroll away. Styles copy
// footykit's (FK-65) so the apps read as one site.

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Destination } from './calendarState';
import { searchFind, WHERE, type Crumb, type SearchEntry } from './nav';

export const CalendarIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M4 1h1.6v2H4zM10.4 1H12v2h-1.6zM1.5 3.2h13v11.3h-13zM3 6.4v6.6h10V6.4z" />
    <path fill="currentColor" d="M4.5 8h2v1.6h-2zM7 8h2v1.6H7zM9.5 8h2v1.6h-2zM4.5 10.6h2v1.6h-2zM7 10.6h2v1.6H7z" opacity=".7" />
  </svg>
);
export const CupIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M4 1.5h8v4.2a4 4 0 0 1-8 0zM1.5 2.5H4v1.5H3v.6a1.8 1.8 0 0 0 1.2 1.7l-.4 1.4A3.3 3.3 0 0 1 1.5 4.6zM14.5 2.5H12v1.5h1v.6a1.8 1.8 0 0 1-1.2 1.7l.4 1.4a3.3 3.3 0 0 0 2.3-3.1zM7.2 9.4h1.6v2.6H7.2zM4.5 12.5h7V15h-7z" />
  </svg>
);
/** A small table: the Standings place's icon and the Quick standings button's. */
export const StandingsIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M2 2.5h12v2H2zM2 6.5h12v1.6H2zM2 10h12v1.6H2zM2 13.4h12V15H2z" opacity=".95" />
    <path fill="currentColor" d="M5.2 6.5h1.2V15H5.2z" opacity=".55" />
  </svg>
);
/** The Options icon: three sliders. */
export const OptionsIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M1.5 3.2h13v1.4h-13zM1.5 7.3h13v1.4h-13zM1.5 11.4h13v1.4h-13z" opacity=".55" />
    <path fill="currentColor" d="M4 1.9h2.2v4H4zM9.6 6h2.2v4H9.6zM5.4 10.1h2.2v4H5.4z" />
  </svg>
);
const ICONS: Record<Destination, () => ReactNode> = { schedule: CalendarIcon, cup: CupIcon, standings: StandingsIcon };

/** Closes a popover on Escape or a press outside `box`. */
function useDismiss(open: boolean, box: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const f = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', f);
    document.addEventListener('keydown', f);
    return () => {
      document.removeEventListener('pointerdown', f);
      document.removeEventListener('keydown', f);
    };
  }, [open, box, close]);
}

/** One breadcrumb part: a button that opens its siblings (other teams, other views) to jump sideways. */
export function CrumbPart({ c, last = false }: { c: Crumb; last?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, box, close);
  const has = c.items.length > 1;
  return (
    <span className="ck-crumb" ref={box} data-testid="crumb" data-crumb={c.id}>
      <span className="ck-crumb-sep" aria-hidden="true">
        ›
      </span>
      <button type="button" className={`ck-crumb-btn${last ? ' ck-crumb-last' : ''}`} aria-haspopup={has ? 'menu' : undefined} aria-expanded={has ? open : undefined} title={has ? `${c.label}: jump to another` : c.label} disabled={!has} onClick={() => setOpen((o) => !o)} data-testid="crumb-btn">
        {c.label}
      </button>
      {open && (
        <span className="ck-crumb-menu" role="menu" data-testid="crumb-menu">
          {c.items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`ck-crumb-item${it.on ? ' ck-crumb-item-on' : ''}`}
              aria-current={it.on || undefined}
              ref={it.on ? (el) => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
              onClick={() => {
                setOpen(false);
                if (!it.on) it.go();
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** The breadcrumb parts a destination adds after its place, in order (the last one bold). */
export const Crumbs = ({ parts }: { parts: Crumb[] }) => (
  <>
    {parts.map((c, i) => (
      <CrumbPart key={`${c.id}|${c.label}`} c={c} last={i === parts.length - 1} />
    ))}
  </>
);

/** "Go anywhere": Ctrl+K (⌘K) or the button; type and Enter (or click) to jump. The entries are built on opening. */
export function GoAnywhere({ entries }: { entries: () => SearchEntry[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const all = useMemo(() => (open ? entries() : []), [open, entries]);
  const found = useMemo(() => searchFind(all, q), [all, q]);
  const close = () => {
    setOpen(false);
    setQ('');
    setActive(0);
  };
  const go = (i: number) => {
    const e = found[i];
    if (!e) return;
    close();
    e.go();
  };
  return (
    <>
      <button type="button" className="ck-go-btn" onClick={() => setOpen(true)} aria-label="Go anywhere (Ctrl+K)" title="Go anywhere: a team, a view, a Cup season (Ctrl+K)" data-testid="go-anywhere">
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.3 10.3l3.9 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="ck-go-text">Go anywhere</span>
        <kbd className="ck-go-kbd">Ctrl K</kbd>
      </button>
      {open && (
        <div
          className="ck-go-shade"
          data-no-marquee="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="ck-go" role="dialog" aria-label="Go anywhere" data-testid="go-dialog">
            <input
              autoFocus
              className="ck-go-input"
              placeholder='Type a team, a view, "cup 2023"…'
              value={q}
              spellCheck={false}
              autoComplete="off"
              role="combobox"
              aria-expanded="true"
              aria-controls="ck-go-list"
              aria-label="Where to go"
              data-testid="go-input"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, found.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(active);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  close();
                }
              }}
            />
            <div className="ck-go-list" id="ck-go-list" role="listbox" data-testid="go-list">
              {found.map((e, i) => (
                <div key={`${e.kind}|${e.label}`} role="option" aria-selected={i === active} className={`ck-go-item${i === active ? ' ck-go-on' : ''}`} onMouseMove={() => setActive(i)} onClick={() => go(i)} data-testid="go-item">
                  <span>{e.label}</span>
                  <span className="ck-go-kind">{e.kind}</span>
                </div>
              ))}
              {!found.length && <div className="ck-go-none">Nothing matches "{q}"</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The Where tabs: the app's places, always the same, the current one highlighted. */
export function WhereTabs({ value, places, onChange }: { value: Destination; places: Destination[]; onChange: (d: Destination) => void }) {
  return (
    <nav className="ck-where" aria-label="Places" data-testid="where-tabs">
      {WHERE.filter(([d]) => places.includes(d)).map(([d, label, tip]) => {
        const Icon = ICONS[d];
        return (
          <button key={d} type="button" className={`ck-where-tab${d === value ? ' ck-where-on' : ''}`} aria-current={d === value ? 'page' : undefined} title={tip} onClick={() => onChange(d)} data-testid={`where-${d}`} data-text={label}>
            <Icon />
            <span className="ck-where-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** A page row's part: a small caption ("What", "How") and its control. */
export const PageRow = ({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) => (
  <div className={`ck-prow${className}`}>
    <span className="ck-prow-label">{label}</span>
    {children}
  </div>
);
