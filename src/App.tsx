// Standalone app shell: loads the schedule, sizes the widget to the window, keeps view state in the URL, and
// handles onOpenGame by opening rotationkit. Everything else lives in the self-contained components.

import { useEffect, useState } from 'react';
import { CalendarView, type CalendarState } from './components/CalendarView';
import { loadCalendarData } from './data/load';
import type { CalendarData } from './data/model';
import { TEAMS, TEAM_BY_ID } from './data/teams';
import { rotationkitUrl } from './rotationkit';

/** Shell's handling of GameCard's "open game" action: the rotationkit deep link in a new tab. */
export function openGameInRotationkit(gameId: string, open: (url: string) => void = (url) => window.open(url, '_blank', 'noopener')) {
  open(rotationkitUrl(gameId));
}

function readUrlState(): Partial<CalendarState> {
  const p = new URLSearchParams(window.location.search);
  const team = TEAMS.find((t) => t.tricode === p.get('team')?.toUpperCase());
  return {
    mode: p.get('view') === 'team' ? 'team' : p.get('view') === 'league' ? 'league' : undefined,
    teamId: team?.id,
    date: p.get('date') ?? undefined,
    tvOnly: p.get('tv') === '1' ? true : undefined,
  };
}

function writeUrlState(s: CalendarState) {
  const p = new URLSearchParams();
  p.set('view', s.mode);
  if (s.mode === 'team') p.set('team', TEAM_BY_ID.get(s.teamId)?.tricode ?? '');
  else {
    p.set('date', s.date);
    if (s.tvOnly) p.set('tv', '1');
  }
  window.history.replaceState(null, '', `${window.location.pathname}?${p}`);
}

function useWindowSize() {
  const get = () => ({ width: Math.min(window.innerWidth - 32, 1100 - 32), height: window.innerHeight });
  const [size, setSize] = useState(get);
  useEffect(() => {
    const on = () => setSize(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

export function App() {
  const [data, setData] = useState<CalendarData>();
  const [error, setError] = useState<string>();
  const size = useWindowSize();
  const [initial] = useState(readUrlState);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    loadCalendarData().then(setData, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NBA schedule {data && <span className="app-tz">{data.seasonYear}</span>}</h1>
        <span className="app-tz">Times in your time zone ({timeZone})</span>
      </header>
      {error && <p className="app-status" role="alert">Couldn’t load the schedule: {error}</p>}
      {!data && !error && <p className="app-status">Loading schedule…</p>}
      {data && <CalendarView data={data} size={size} initial={initial} onOpenGame={(id) => openGameInRotationkit(id)} onStateChange={writeUrlState} />}
    </div>
  );
}
