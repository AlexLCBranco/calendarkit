// Copy-as-image button (Boardkit's list copy button): ⧉, ✓ on success, ! on error, back after 1.5 s. Tagged
// data-capture-exclude so it never appears in an image. The glyph is CSS content, so the button adds no text to the
// card or cell it sits in (their textContent is unchanged).

import { useState, type MouseEvent } from 'react';
import { copyElement } from './copyAsImage';

/** How long ✓ / ! stay before the button returns to ⧉. */
export const COPY_FEEDBACK_MS = 1500;

export type CopyState = 'idle' | 'copied' | 'error';

export interface CopyButtonProps {
  /** Accessible name and tooltip, e.g. "Copy day as image". */
  label: string;
  /** Copies something, given the button (e.g. its closest card). Default: `copyElement` of the closest `of`. */
  copy?: (button: HTMLButtonElement) => Promise<unknown>;
  /** CSS selector of the ancestor to copy (with the default `copy`). */
  of?: string;
  /** `hover`: shown on hover/focus of the parent only (day cells, game cards). */
  hover?: boolean;
  testId?: string;
}

export function CopyButton({ label, copy, of, hover = false, testId }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  async function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation(); // a cell click selects its game (phone team calendar)
    const button = e.currentTarget;
    try {
      if (copy) await copy(button);
      else {
        const node = of ? button.closest<HTMLElement>(of) : null;
        if (!node) throw new Error(`nothing to copy: no ${of} around the button`);
        await copyElement(node);
      }
      setState('copied');
    } catch (error) {
      console.error(`${label} failed`, error);
      setState('error');
    } finally {
      setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
    }
  }

  return (
    <button
      type="button"
      className={`ck-copy${hover ? ' ck-copy-hover' : ''}`}
      onClick={handleClick}
      data-capture-exclude="true"
      data-state={state}
      data-testid={testId}
      aria-label={label}
      title={label}
    />
  );
}
