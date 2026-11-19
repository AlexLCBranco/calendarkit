// slate.html: the Slate's part on a page of its own, built from src/slate/ only — no calendarkit app shell.
// The tests compare it with calendarkit's Slate and check its requests, timers and storage listeners; it is also a
// working example for the gauntlet's Slate widget. URL: ?date=YYYY-MM-DD (the NBA / ET date; default today in ET)
// &width=<px> (default: the window less the page's padding) &tz=<IANA zone> &notes=0 (info-only cards) &n=<widgets>
// (that many grids of the same day, as on a whiteboard with several widgets) &copy=1 (the copy layout shown live, notes
// open for typing on a click: what the gauntlet's Slate widget shows — 2 columns, its card width).

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { hoopsjunkieLink, loadCalendarData, localNotesStore, SlateCopy, SlateDay, slateCopyCardWidth, slateGames, useGameLinksPopup, useTooltip, type CalendarData } from './index';
import { SLATE_GRID_GAP, slateCopyCup } from './kit';
import './slate.css';

const q = new URLSearchParams(location.search);
const date = q.get('date') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const width = Number(q.get('width') ?? innerWidth - 32);
const timeZone = q.get('tz') ?? undefined;
const notes = q.get('notes') === '0' ? undefined : localNotesStore();
const count = Math.max(1, Number(q.get('n') ?? 1));
const copy = q.get('copy') === '1';

/** The gauntlet's live copy (gauntlet src/slate/SlateWidget.tsx): 2 columns of calendarkit's copy card width. */
function LiveCopy({ data }: { data: CalendarData }) {
  const games = slateGames(data, date);
  const cardWidth = slateCopyCardWidth((1840 - SLATE_GRID_GAP) / 2, slateCopyCup(data, games));
  return <SlateCopy data={data} games={games} cols={Math.max(1, Math.min(2, games.length))} cardWidth={cardWidth} timeZone={timeZone} notes={notes} editNotes gameLink={hoopsjunkieLink} />;
}

function Widget({ data }: { data: CalendarData }) {
  const tooltip = useTooltip();
  const links = useGameLinksPopup(data);
  return (
    <div className="ck-root ck-slate-widget" data-testid="slate-widget" style={{ width }} {...tooltip.handlers} onMouseOver={(e) => (tooltip.handlers.onMouseOver(e), links.handlers.onMouseOver(e))} onFocus={(e) => (tooltip.handlers.onFocus(e), links.handlers.onFocus(e))} onMouseLeave={() => (tooltip.handlers.onMouseLeave(), links.handlers.onMouseLeave())}>
      {copy ? <LiveCopy data={data} /> : <SlateDay data={data} date={date} timeZone={timeZone} notes={notes} width={width} gameLink={hoopsjunkieLink} gameMenu />}
      {tooltip.node}
      {links.node}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
loadCalendarData().then(
  (data) =>
    root.render(
      <StrictMode>
        {Array.from({ length: count }, (_, i) => (
          <Widget key={i} data={data} />
        ))}
      </StrictMode>,
    ),
  (e: Error) => root.render(<p style={{ color: '#e6e8ec', font: '14px system-ui' }}>Schedule not loaded: {e.message}</p>),
);
