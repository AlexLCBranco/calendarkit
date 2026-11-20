// CK-32: US holidays by rule (no network) and the NBA's big dates, read from the schedule where it has them.
import { describe, expect, it } from 'vitest';
import { bigDayOf, bigDays, EXTRA_DAYS, nthWeekday, usHolidays } from '../src/data/holidays';
import { data } from './feed';

const dates = (year: number) => Object.fromEntries(usHolidays(year).map((h) => [h.label, h.date]));

describe('US holidays, by rule', () => {
  it('2026', () => {
    expect(dates(2026)).toEqual({
      "New Year's Day": '2026-01-01',
      'MLK Day': '2026-01-19', // third Monday of January
      "Presidents' Day": '2026-02-16',
      'Memorial Day': '2026-05-25', // last Monday of May
      Juneteenth: '2026-06-19',
      'Independence Day': '2026-07-04',
      'Labor Day': '2026-09-07',
      'Columbus Day': '2026-10-12',
      'Veterans Day': '2026-11-11',
      Thanksgiving: '2026-11-26', // fourth Thursday of November
      Christmas: '2026-12-25',
    });
  });
  it('2027', () => {
    expect(dates(2027)).toEqual({
      "New Year's Day": '2027-01-01',
      'MLK Day': '2027-01-18',
      "Presidents' Day": '2027-02-15',
      'Memorial Day': '2027-05-31',
      Juneteenth: '2027-06-19',
      'Independence Day': '2027-07-04',
      'Labor Day': '2027-09-06',
      'Columbus Day': '2027-10-11',
      'Veterans Day': '2027-11-11',
      Thanksgiving: '2027-11-25',
      Christmas: '2027-12-25',
    });
  });
  it('the n-th weekday of a month, and the last one', () => {
    expect(nthWeekday(2027, 1, 1, 3)).toBe('2027-01-18');
    expect(nthWeekday(2026, 5, 1, -1)).toBe('2026-05-25');
    expect(nthWeekday(2026, 11, 4, 4)).toBe('2026-11-26');
  });
  it('every holiday has one plain sentence that starts with its name', () => {
    for (const h of usHolidays(2026)) expect(h.why).toMatch(new RegExp(`^${h.label}: \\S.{15,}`));
  });
});

describe('the season on show (2026-27 feed)', () => {
  const days = bigDays(data);
  const labels = (date: string) => days.get(date)?.map((d) => d.label) ?? [];
  it('opening night and the last day come from the schedule', () => {
    expect(labels(data.dates[0]!)).toContain('Opening night');
    const last = data.games.filter((g) => g.gameType === 'regular').map((g) => g.dateEt).sort().at(-1)!;
    expect(labels(last)).toContain('Last day');
  });
  it('Christmas is one mark (holiday and games), with the sentence for the games', () => {
    expect(labels('2026-12-25')).toEqual(['Christmas']);
    expect(bigDayOf(data, '2026-12-25')).toEqual({ label: 'Christmas', tip: 'Christmas Day: the whole country watches these games' });
  });
  it('MLK Day, Thanksgiving, the trade deadline (added by hand)', () => {
    expect(labels('2027-01-18')).toEqual(['MLK Day']);
    expect(labels('2026-11-26')).toEqual(['Thanksgiving']);
    expect(labels('2027-02-11')).toEqual(['Trade deadline']);
    expect(EXTRA_DAYS['2026-27']!.some((d) => d.date === '2027-02-11')).toBe(true);
  });
  it('the Cup knockout nights are the feed\'s', () => {
    for (const g of data.games.filter((x) => x.isCupKnockout || x.gameType === 'cup-final')) {
      expect(labels(g.dateEt).some((l) => /^Cup (quarterfinals|semifinals|final)$/.test(l)), g.dateEt).toBe(true);
    }
  });
  it('the All-Star break: every day of the longest February gap, no game day', () => {
    const brk = [...days].filter(([, list]) => list.some((d) => d.label === 'All-Star break')).map(([date]) => date).sort();
    expect(brk.length).toBeGreaterThanOrEqual(4);
    for (const d of brk) {
      expect(d.startsWith('2027-02')).toBe(true);
      expect(data.byDate.get(d)?.length ?? 0).toBe(0);
    }
  });
  it('an ordinary day has no mark', () => {
    expect(bigDayOf(data, '2026-11-17')).toBeUndefined();
  });
});
