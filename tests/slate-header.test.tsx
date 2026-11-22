// @vitest-environment jsdom
// CK-10: the Slate's header line "SLATE · 18-11 · NBA", on the grid and in the copy.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { slateHeaderLabel } from '../src/slate/header';
import { SlateCopy, SlateDay } from '../src/slate/SlateCard';
import { data } from './feed';

afterEach(cleanup);

describe('slateHeaderLabel', () => {
  it('day-month and the sport', () => {
    expect(slateHeaderLabel('2026-11-18')).toBe('SLATE · 18-11 · NBA');
    expect(slateHeaderLabel('2026-12-05')).toBe('SLATE · 05-12 · NBA');
  });
  it('a combined Slate joins the sports', () => {
    expect(slateHeaderLabel('2026-11-18', ['NBA', 'Football'])).toBe('SLATE · 18-11 · NBA + Football');
  });
});

describe('where it shows', () => {
  const date = [...data.byDate.keys()].sort()[10]!;
  it('on the grid, first, once', () => {
    render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" />);
    expect(screen.getAllByTestId('slate-header')).toHaveLength(1);
    expect(document.querySelector('.ck-slate-grid')!.firstElementChild!.getAttribute('data-testid')).toBe('slate-header');
    expect(screen.getByTestId('slate-header-label').textContent).toBe(slateHeaderLabel(date));
  });
  it('in the copy (images and the gauntlet widget)', () => {
    render(<SlateCopy data={data} games={data.byDate.get(date)!} cols={2} cardWidth={500} timeZone="UTC" />);
    expect(screen.getByTestId('slate-header').textContent).toBe(slateHeaderLabel(date));
  });
  it('not on a day without games', () => {
    render(<SlateDay data={data} date="2026-07-01" width={1840} timeZone="UTC" />);
    expect(screen.queryByTestId('slate-header')).toBeNull();
  });
});
