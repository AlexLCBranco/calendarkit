// @vitest-environment jsdom
// Larger games where there is room: 1-week League Calendar lines scaled to the day cell (weekScale), Team Calendar
// cell content scaled to the cell (measured probe; CSS zoom). 2-week mode and phone cells keep their size.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CalendarView, LeagueWeekView, TeamMonthGrid, TEAM_SCALE_MAX } from '../src/components/CalendarView';
import { LINE_WITH_SCORES, SCORE3_EM, busiestDayHeight, columnHeight, MONTH_LINE, MONTH_LINE_WIDTH, monthCellInner, scaleLine, timeGroups, WEEK_HEAD_H, WEEK_SCALE_FILL, WEEK_SCALE_MAX, weekScale, lineWidth } from '../src/components/dayflow';
import { data } from './feed';

afterEach(cleanup);

const XL = { width: 1840, height: 1000 }; // content at a 1920 × 1080 window, below the page padding
const NOW = Date.parse('2026-11-15T15:00:00Z');
const vars = (el: Element) => (el as HTMLElement).style;

describe('weekScale (1-week League Calendar)', () => {
  const busiest = busiestDayHeight(data.byDate, 'America/Sao_Paulo');

  it('the season’s busiest day is the tallest one-column day (every day checked)', () => {
    for (const games of data.byDate.values()) expect(columnHeight(timeGroups(games, 'America/Sao_Paulo'))).toBeLessThanOrEqual(busiest);
    expect(busiest).toBeGreaterThan(300);
  });

  it('1920 × 1080 (cell inner 249.4 × ~970 px): 1.5×, with the line and the busiest day inside the fill share', () => {
    const w = monthCellInner(1840);
    const h = 984 - 10; // measured cell height minus padding and border
    const s = weekScale(w, h, busiest);
    expect(s).toBe(1.5);
    expect(s * MONTH_LINE_WIDTH).toBeLessThanOrEqual(w * WEEK_SCALE_FILL);
    expect(columnHeight(timeGroups([...data.byDate.values()].sort((a, b) => b.length - a.length)[0]!, 'America/Sao_Paulo'), scaleLine(s)) + WEEK_HEAD_H).toBeLessThanOrEqual(h);
    expect(s * busiest).toBeLessThanOrEqual((h - WEEK_HEAD_H) * WEEK_SCALE_FILL);
  });

  it('never above WEEK_SCALE_MAX, never below 1 (the 2-week size), 0.05 steps; limited by width or height', () => {
    expect(weekScale(5000, 5000, busiest)).toBe(WEEK_SCALE_MAX);
    expect(weekScale(MONTH_LINE_WIDTH, 400, busiest)).toBe(1); // the width cutoff: a full-size line just fits
    expect(weekScale(100, 100, busiest)).toBe(1);
    expect(weekScale(monthCellInner(1233), 2000, busiest)).toBe(1.05); // 1280 px window (content 1233 px): 162.7 × 0.8 / 119 = 1.09
    expect(weekScale(1000, 24 + busiest * 1.3 / WEEK_SCALE_FILL, busiest)).toBe(1.3);
    for (let w = 100; w < 400; w += 7.3) expect((weekScale(w, 900, busiest) * 20) % 1).toBeCloseTo(0);
  });

  it('scaleLine multiplies every length; the scaled line width is the base width × s', () => {
    const L = scaleLine(1.5);
    for (const k of Object.keys(MONTH_LINE) as (keyof typeof MONTH_LINE)[]) expect(L[k]).toBe(MONTH_LINE[k] * 1.5);
    expect(lineWidth(L)).toBe(178.5);
  });
});

describe('week view sizes', () => {
  it('1 week: lines larger than in 2-week mode (logos, tricodes, labels, TV pill, B2B dot all scaled)', () => {
    const one = render(<LeagueWeekView data={data} start="2026-12-27" weeks={1} tvOnly={false} size={XL} onSelectDate={() => {}} />);
    const v1 = one.container.querySelector('.ck-week-view')!;
    const s = Number(v1.getAttribute('data-scale'));
    expect(s).toBe(1.5);
    cleanup();
    const two = render(<LeagueWeekView data={data} start="2026-12-27" weeks={2} tvOnly={false} size={XL} onSelectDate={() => {}} />);
    const v2 = two.container.querySelector('.ck-week-view')!;
    expect(v2.getAttribute('data-scale')).toBe('1');
    for (const [name, base] of [['--ck-logo', 16], ['--ck-font', 11], ['--ck-label-font', 10], ['--ck-pill', 15], ['--ck-dot', 5], ['--ck-at-font', 9], ['--ck-line', 119]] as const) {
      expect(vars(v2).getPropertyValue(name), name).toBe(`${base}px`);
      expect(vars(v1).getPropertyValue(name), name).toBe(`${base * s}px`);
    }
  });

  it('2 weeks: 119 px line, still 2 columns at 1920 px', () => {
    const el = render(<LeagueWeekView data={data} start="2026-11-15" weeks={2} tvOnly={false} size={XL} onSelectDate={() => {}} />);
    expect(el.container.querySelector('.ck-month-day')!.getAttribute('data-cols')).toBe('2');
    expect(vars(el.container.querySelector('.ck-week-view')!).getPropertyValue('--ck-line')).toBe('119px');
  });

  it('a narrow widget keeps the full-size line (scale 1) and the same columns', () => {
    const el = render(<LeagueWeekView data={data} start="2026-11-15" weeks={1} tvOnly={false} size={{ width: 900, height: 800 }} onSelectDate={() => {}} />);
    expect(el.container.querySelector('.ck-week-view')!.getAttribute('data-scale')).toBe('1');
  });
});

describe('team calendar sizes', () => {
  it('desktop: cell content scaled up (--ck-team-scale > 1); the measuring probe is gone after render', () => {
    const el = render(<TeamMonthGrid data={data} teamId={1610612747} month="2026-11" onMonthChange={() => {}} size={XL} now={NOW} timeZone="UTC" />);
    const grid = el.container.querySelector<HTMLElement>('.ck-team-grid')!;
    const s = Number(grid.getAttribute('data-scale'));
    expect(s).toBeGreaterThan(1);
    expect(s).toBeLessThanOrEqual(TEAM_SCALE_MAX);
    expect(grid.style.getPropertyValue('--ck-team-scale')).toBe(String(s));
    expect(el.container.querySelector('.ck-team-probe')).toBeNull();
    expect(el.container.querySelector('[data-game-id="ck-probe"]')).toBeNull();
  });

  it('phone: cells keep their size (scale 1, no probe)', () => {
    const el = render(<CalendarView data={data} size={{ width: 360, height: 700 }} now={NOW} timeZone="UTC" initial={{ mode: 'team', layout: 'calendar', teamId: 1610612747 }} />);
    expect(el.container.querySelector('.ck-team-grid')!.getAttribute('data-scale')).toBe('1');
    expect(el.container.querySelector('.ck-team-probe')).toBeNull();
  });

  it('TV names wrap between networks, never inside one (one nowrap span per network)', () => {
    const el = render(<TeamMonthGrid data={data} teamId={1610612747} month="2026-11" onMonthChange={() => {}} size={XL} now={NOW} timeZone="UTC" />);
    const tv = [...el.container.querySelectorAll('.ck-tv')].find((t) => t.textContent === 'Peacock · NBC Sports Network')!;
    expect([...tv.querySelectorAll('.ck-tv-name')].map((n) => n.textContent)).toEqual(['Peacock', 'NBC Sports Network']);
  });
});

describe('week view scores (final games)', () => {
  it('the score font is the largest 0.1 px step whose 3 digits fit the 16 px logo slot', () => {
    expect(MONTH_LINE.scoreFont * SCORE3_EM).toBeLessThanOrEqual(MONTH_LINE.logo);
    expect((MONTH_LINE.scoreFont + 0.1) * SCORE3_EM).toBeGreaterThan(MONTH_LINE.logo);
  });

  it('1 week with logos + 11 px scores would drop below 1.3 at 1920 × 1080, so 1 week uses the logo slot too', () => {
    const inner = monthCellInner(1840);
    expect(LINE_WITH_SCORES).toBeCloseTo(119 + 2 * (1 + 21.34), 0);
    expect(weekScale(inner, 10_000, 1, LINE_WITH_SCORES)).toBeLessThan(1.3);
    expect(weekScale(inner, 10_000, 1)).toBe(1.5); // the line the slot layout keeps
  });
});
