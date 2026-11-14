// @vitest-environment jsdom
// No active-day highlight in the lists. The League List shows one day at a time, and the Team List has no day strip
// (its rows show their dates), so neither marks a "selected" day. A copy turns transitions off and drops link styling.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CalendarView } from '../src/components/CalendarView';
import { suspendForCapture } from '../src/components/copyAsImage';
import { data } from './feed';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const LAL = 1610612747;
const lit = () => document.querySelectorAll('.ck-active-day, .ck-hl').length;

describe('League List', () => {
  it('no active-day class or band: the list shows one day', () => {
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ date: '2026-11-17' }} />);
    expect(lit()).toBe(0);
    // A direct selector, not getByRole over the whole XL League view (the costly part of this test)
    fireEvent.click([...document.querySelectorAll<HTMLElement>('[role="tab"][aria-label^="Thursday, November 19"]')].at(0)!);
    expect(lit()).toBe(0);
  });
});

describe('Team List', () => {
  it('no day strip and no active-day highlight, also after scrolling', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.dataset.rowDate ? [...this.parentElement!.children].indexOf(this) * 40 : 0;
    });
    render(<CalendarView data={data} size={XL} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'list', teamId: LAL, showRest: false }} />);
    expect(screen.queryByTestId('week-strip')).toBeNull();
    expect(lit()).toBe(0);
    const list = screen.getByTestId('team-list');
    list.scrollTop = 20 * 40;
    fireEvent.scroll(list);
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(screen.queryByTestId('week-strip')).toBeNull();
    expect(lit()).toBe(0);
  });
});

describe('copies', () => {
  it('suspendForCapture turns transitions off and marks the node capturing, and undoes both', () => {
    const root = document.createElement('div');
    const row = document.createElement('div');
    row.style.transition = 'opacity 1s';
    root.append(row);
    const restore = suspendForCapture(root);
    expect([root.style.transition, row.style.transition, root.classList.contains('ck-capturing')]).toEqual(['none', 'none', true]);
    restore();
    expect([root.style.transition, row.style.transition, root.classList.contains('ck-capturing')]).toEqual(['', 'opacity 1s', false]);
  });
});
