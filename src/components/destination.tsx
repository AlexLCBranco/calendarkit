// The contract between the shell (CalendarView) and its destinations (Schedule, Cup, Standings), and the parts they
// share. Every destination stays mounted while the page is open, so its state lasts as long as the page did when it all
// lived in one component; only the active one renders. Its top-bar controls go into the bar's slots through portals,
// so the bar's DOM is the same as when the shell rendered them itself.

import { useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarData } from '../data/model';
import { CaptureStage, CAPTURE_PAD } from './CaptureStage';
import type { CalendarState } from './calendarState';
import { capturePixelRatio, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import type { GameLink } from './GameCard';
import { leagueListStyle } from './LeagueListView';
import type { SelectionStore } from './selection';
import { SelectionCapture, type SelectionKind } from './SelectionCapture';
import { TeamHeader } from './TeamHeader';
import { LEAGUE_LIST_COLUMN, leagueZoom, LIST_MAX_WIDTH, TEAM_LIST_MAX_WIDTH, type WidgetSize } from './widget';

/** The top bar's two slots a destination fills: the centre and the right (before the shell's end of the bar). */
export interface BarSlots {
  center: HTMLElement;
  right: HTMLElement;
}

export interface DestinationProps {
  /** This destination is on show; the others render nothing. */
  active: boolean;
  data: CalendarData;
  size: WidgetSize;
  /** The time the widget opened (or the fixed clock). */
  now: number;
  today: string;
  timeZone?: string;
  compact: boolean;
  barShort: boolean;
  slateFits: boolean;
  state: CalendarState;
  update: (patch: Partial<CalendarState>) => void;
  root: RefObject<HTMLDivElement | null>;
  onOpenGame?: (gameId: string) => void;
  gameLink?: GameLink;
  title?: string;
  note?: string;
  /** Undefined until the bar is in the page (the first commit). */
  slots?: BarSlots;
  /** The shell's end of the bar (ⓘ, Quick standings, Copy), last in the right slot; `extra` joins the ⓘ's tooltip. */
  barEnd: (extra?: string) => ReactNode;
  selection: SelectionStore;
  /** Page history: the next change is a new page although only the date changed (a picked date, Today). */
  jump: () => void;
  /** Page history: after every render of a destination, so a change of its own state reaches the host. */
  rendered: () => void;
}

/** What a destination tells the shell; reassigned on every render. */
export interface DestinationApi {
  /** The date on show, for team links and the address. */
  lookingAt(): string;
  /** The page's name in the ← → tooltips. */
  label(): string;
  /** "Copy as image" for the view on show. */
  copy(button: HTMLButtonElement): Promise<HTMLCanvasElement>;
  /** What a marquee selection selects; none: no marquee. */
  selKind: SelectionKind | undefined;
}

/** The bar controls into the bar's slots, the rest in place; nothing until the bar is there. */
export function DestinationFrame({ slots, center, right, children }: { slots?: BarSlots; center: ReactNode; right: ReactNode; children: ReactNode }) {
  if (!slots) return null;
  return (
    <>
      {createPortal(center, slots.center)}
      {createPortal(right, slots.right)}
      {children}
    </>
  );
}

/** The League List's width on screen (and in its copies): its zoomed column beside the map, else up to LIST_MAX_WIDTH. */
export function leagueListWidth(size: WidgetSize): number {
  return leagueListStyle(size.width) ? Math.ceil(LEAGUE_LIST_COLUMN * leagueZoom(size.width)) : Math.min(size.width, LIST_MAX_WIDTH);
}

interface SelectionCaptureState {
  ids: ReadonlySet<string>;
  cellWidth?: number;
  teamScale?: number;
  weekStyle?: string;
  onReady: (node: HTMLElement) => void;
}

/**
 * Copying a marquee selection (all but the Slate's): the selected games drawn off-screen like the view they came from
 * — the cell width, the Team grid's scale and the week view's sizes are read from the screen — copied, then removed.
 */
export function useSelectionCopy(root: RefObject<HTMLDivElement | null>, selection: SelectionStore) {
  const [capture, setCapture] = useState<SelectionCaptureState>();
  const copy = (button: HTMLButtonElement) => {
    const el = root.current!;
    const cell = el.querySelector('.ck-team-grid .ck-day-cell, .ck-week-grid .ck-month-cell');
    return new Promise<HTMLCanvasElement>((resolve, reject) =>
      setCapture({
        ids: selection.get(),
        cellWidth: cell ? cell.getBoundingClientRect().width : undefined,
        teamScale: Number(el.querySelector<HTMLElement>('.ck-team-grid')?.dataset.scale ?? 1),
        weekStyle: el.querySelector('.ck-week-view')?.getAttribute('style') ?? undefined,
        onReady: (node) => {
          // the size copied (CSS px) and the pixel ratio used: data-captured="1840x1010@4"
          button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
          copyElement(node, 1)
            .then(resolve, reject)
            .finally(() => setCapture(undefined));
        },
      }),
    );
  };
  return [capture, copy] as const;
}

/** The off-screen page a selection is copied from: the heading, the team's header (team lists), the selected games. */
export function SelectionCopyStage({ capture, kind, list, team, teamId, cup = false, period, p }: { capture: SelectionCaptureState; kind: SelectionKind; list: boolean; team: boolean; teamId: number; cup?: boolean; period?: string; p: DestinationProps }) {
  const { data, size, now, timeZone, compact, title, note, state } = p;
  return (
    <CaptureStage onReady={capture.onReady} width={(list ? (team ? Math.min(size.width, TEAM_LIST_MAX_WIDTH) : leagueListWidth(size)) : Math.max(capture.cellWidth ?? 0, 360)) + 2 * CAPTURE_PAD} className={list ? ' ck-root-fill' : ' ck-root-grow'}>
      <div className="ck-capture-head">
        {title && <span className="ck-title">{title}</span>}
        {cup && <span className="ck-capture-period">NBA Cup</span>}
        {!list && period && <span className="ck-capture-period">{period}</span>}
        {state.tvOnly && <span className="ck-capture-filter">TV games only</span>}
        {note && <span className="ck-note">{note}</span>}
      </div>
      {team && <TeamHeader teamId={teamId} compact={compact} />}
      <SelectionCapture kind={kind} data={data} ids={capture.ids} teamId={teamId} tvOnly={state.tvOnly && !cup} cup={cup} size={size} now={now} timeZone={timeZone} cellWidth={capture.cellWidth} teamScale={capture.teamScale} weekStyle={capture.weekStyle} weeks={state.weeks} />
    </CaptureStage>
  );
}
