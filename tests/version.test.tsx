// @vitest-environment jsdom
// Site version in the top bar: "v<commit>" after the data stamp, tooltip with the build time; phones in the "i" tip.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BUILD_INFO } from '../src/build-info';
import { CalendarView } from '../src/components/CalendarView';
import { data } from './feed';

afterEach(cleanup);
const NOW = Date.parse('2026-10-23T15:00:00Z');
const V = { version: '0f8f254', builtAt: '2026-10-28T20:02:00Z' };

describe('site version', () => {
  it('desktop: "v0f8f254" beside the data stamp, build time in the tooltip (hover and focus)', () => {
    render(<CalendarView data={data} size={{ width: 1200, height: 800 }} now={NOW} timeZone="UTC" note="tz" updatedAt="2026-10-23T08:29:00Z" version={V} />);
    const v = screen.getByTestId('site-version');
    expect(v.textContent).toBe('v0f8f254');
    expect(v.parentElement).toBe(screen.getByTestId('data-updated').parentElement); // same line
    fireEvent.focus(v);
    expect(screen.getByTestId('tooltip').textContent).toBe('Site version: commit 0f8f254, built Oct 28, 20:02');
  });

  it('phones: in the "i" tooltip; without a version prop: nothing', () => {
    render(<CalendarView data={data} size={{ width: 390, height: 800 }} now={NOW} timeZone="UTC" note="tz" version={V} />);
    expect(screen.getByRole('img', { name: 'tz' }).getAttribute('data-tip')).toBe('tz · site version 0f8f254');
    cleanup();
    render(<CalendarView data={data} size={{ width: 1200, height: 800 }} now={NOW} timeZone="UTC" note="tz" />);
    expect(screen.queryByTestId('site-version')).toBeNull();
  });

  it('the build fills BUILD_INFO with a commit (7 hex, "+" for uncommitted changes) and an ISO time', () => {
    expect(BUILD_INFO.version).toMatch(/^[0-9a-f]{7}\+?$/);
    expect(Number.isNaN(Date.parse(BUILD_INFO.builtAt))).toBe(false);
  });
});
