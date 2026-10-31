// slate.html (round 10): the Slate's part on a page of its own, built from src/slate/ only — no calendarkit app shell.
// The tests compare it with calendarkit's Slate and check its requests, timers and storage listeners; it is also a
// working example for the gauntlet's Slate widget. URL: ?date=YYYY-MM-DD (the NBA / ET date; default today in ET)
// &width=<px> (default: the window less the page's padding) &tz=<IANA zone> &notes=0 (info-only cards) &n=<widgets>
// (that many grids of the same day, as on a whiteboard with several widgets).

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { hoopsjunkieLink, loadCalendarData, localNotesStore, SlateDay, useTooltip, type CalendarData } from './index';
import './slate.css';

const q = new URLSearchParams(location.search);
const date = q.get('date') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const width = Number(q.get('width') ?? innerWidth - 32);
const timeZone = q.get('tz') ?? undefined;
const notes = q.get('notes') === '0' ? undefined : localNotesStore();
const count = Math.max(1, Number(q.get('n') ?? 1));

function Widget({ data }: { data: CalendarData }) {
  const tooltip = useTooltip();
  return (
    <div className="ck-root ck-slate-widget" data-testid="slate-widget" style={{ width }} {...tooltip.handlers}>
      <SlateDay data={data} date={date} timeZone={timeZone} notes={notes} width={width} gameLink={hoopsjunkieLink} />
      {tooltip.node}
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
