// Period navigation (prev · title · next), shared by every view that pages through days, weeks or months.

import { addMonths } from '../data/model';
import { fmtMonth } from './widget';

export interface PeriodNavProps {
  title: string;
  unit: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  testId?: string;
  /** Title is a button (e.g. opens the week picker). */
  onTitleClick?: () => void;
  titleExpanded?: boolean;
}

export function PeriodNav({ title, unit, onPrev, onNext, prevDisabled, nextDisabled, testId = 'period-title', onTitleClick, titleExpanded }: PeriodNavProps) {
  return (
    <div className="ck-nav ck-period">
      <button type="button" className="ck-arrow" aria-label={`Previous ${unit}`} disabled={prevDisabled} onClick={onPrev}>
        ‹
      </button>
      {onTitleClick ? (
        <button type="button" className="ck-nav-title ck-title-button" data-testid={testId} aria-haspopup="dialog" aria-expanded={titleExpanded} onClick={onTitleClick}>
          {title}
          <span className="ck-caret" aria-hidden="true">
            ▾
          </span>
        </button>
      ) : (
        <h2 className="ck-nav-title" data-testid={testId}>
          {title}
        </h2>
      )}
      <button type="button" className="ck-arrow" aria-label={`Next ${unit}`} disabled={nextDisabled} onClick={onNext}>
        ›
      </button>
    </div>
  );
}

export function monthNav(month: string, months: string[], onMonthChange: (m: string) => void): PeriodNavProps {
  const i = months.indexOf(month);
  return {
    title: fmtMonth(month),
    unit: 'month',
    onPrev: () => onMonthChange(addMonths(month, -1)),
    onNext: () => onMonthChange(addMonths(month, 1)),
    prevDisabled: i <= 0,
    nextDisabled: i < 0 || i >= months.length - 1,
  };
}
