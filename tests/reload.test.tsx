// @vitest-environment jsdom
// A reload of the same tab keeps the page it showed (its day, month or week), from the tab's own history entry; a fresh
// visit — no entry of ours — opens on today. The browser side (a real reload, a new tab) is in e2e/reload.spec.ts.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { reloadedState } from '../src/App';
import { CalendarView, type CalendarHandle, type ViewSnapshot } from '../src/components/CalendarView';
import { data } from './feed';
import { pickScope } from './nav';

afterEach(cleanup);

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1600, height: 1000 };
const tabs = (name: string) => within(screen.getByRole('tablist', { name }));

/** Opens the widget, lets `go` move it, and returns the page as the host would keep it at a reload. */
async function snapAfter(go: () => void, initial = {}) {
  const handle = createRef<CalendarHandle>();
  render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={initial} handle={handle} />);
  go();
  await act(async () => {});
  const snap = handle.current!.snap();
  cleanup();
  return snap;
}
/** The "reload": a new widget from the entry, as App does. */
const reload = (snap: ViewSnapshot) => render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={reloadedState({ ck: 1, i: 0, max: 0, trail: [], snap })} />);
const entry = (snap: unknown) => ({ ck: 1, i: 0, max: 0, trail: [], snap });

describe('reloadedState', () => {
  it('a fresh visit (no entry, or not ours) opens as before; an entry this version can’t read too', () => {
    expect(reloadedState(null)).toBeUndefined();
    expect(reloadedState({ some: 'other app' })).toBeUndefined();
    expect(reloadedState(entry(undefined))).toBeUndefined();
    expect(reloadedState(entry({ state: { mode: 'league', date: 'yesterday' } }))).toBeUndefined();
  });

  it('a reload: the state as it was, "Show rest days" back to its default', async () => {
    const snap = await snapAfter(() => pickScope('Boston Celtics'));
    const r = reloadedState(entry({ ...snap, state: { ...snap.state, showRest: false } }))!;
    expect(r.mode).toBe('team');
    expect(r.showRest).toBe(true);
    expect(r.snap.teamMonth).toBe(snap.teamMonth);
  });
});

describe('a reload keeps the page', () => {
  it('League List: the day', async () => {
    const snap = await snapAfter(() => {
      fireEvent.click(screen.getByLabelText('Next day'));
      fireEvent.click(screen.getByLabelText('Next day'));
    });
    expect(snap.state.date).toBe('2026-11-17');
    reload(snap);
    expect(screen.getByTestId('day-title').textContent).toBe('Tuesday, November 17, 2026');
  });

  it('League Calendar: the week; 2 weeks kept', async () => {
    const snap = await snapAfter(() => {
      fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Calendar' }));
      fireEvent.click(tabs('Weeks').getByRole('tab', { name: '2 weeks' }));
      fireEvent.click(screen.getByLabelText('Next 2 weeks'));
    });
    reload(snap);
    expect(screen.getByTestId('period-title').textContent).toBe('Nov 29 – Dec 12, 2026');
  });

  it('Team Calendar: the month; and its week view keeps its week', async () => {
    let snap = await snapAfter(() => {
      fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Calendar' }));
      pickScope('Boston Celtics');
      fireEvent.click(screen.getByLabelText('Next month'));
      fireEvent.click(screen.getByLabelText('Next month'));
    });
    reload(snap);
    expect(screen.getByTestId('period-title').textContent).toBe('January 2027');
    cleanup();
    snap = await snapAfter(() => {
      fireEvent.click(tabs('Layout').getByRole('tab', { name: 'Calendar' }));
      pickScope('Boston Celtics');
      fireEvent.click(tabs('Span').getByRole('tab', { name: '1 week' }));
      fireEvent.click(screen.getByLabelText('Next week'));
    });
    reload(snap);
    expect(screen.getByTestId('period-title').textContent).toBe('Nov 22 – 28, 2026');
  });
});
