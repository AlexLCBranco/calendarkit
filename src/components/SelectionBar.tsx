// The floating bar for a marquee selection (Boardkit's SelectionBar, trimmed to what a read-only schedule needs):
// "N games selected", Copy (the CopyButton's ⧉ → ✓ / !) and ✕. The bar itself renders only while something is
// selected, so it costs nothing otherwise. Also the selection's highlight: one generated <style> rule, so selecting
// re-renders no game card.

import { useEffect, useRef } from 'react';
import { CopyButton } from './CopyButton';
import { useSelection, type SelectionStore } from './selection';
import { plural } from './widget';

export function SelectionBar({ store, copy }: { store: SelectionStore; copy: (button: HTMLButtonElement) => Promise<unknown> }) {
  const n = useSelection(store).size;
  return n ? <Bar n={n} store={store} copy={copy} /> : null;
}

function Bar({ n, store, copy }: { n: number; store: SelectionStore; copy: (button: HTMLButtonElement) => Promise<unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  // Ctrl+C copies the selection (unless text is selected or a field has focus); Escape clears it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.closest('input, textarea, select, [contenteditable="true"], [role="listbox"]')) return;
      if (e.key === 'Escape') store.clear();
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        e.preventDefault();
        ref.current?.querySelector<HTMLButtonElement>('[data-testid="copy-selection"]')?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [store]);
  return (
    <div ref={ref} className="ck-selbar" role="toolbar" aria-label="Selection" data-capture-exclude="true" data-testid="selection-bar">
      <span className="ck-selbar-count" data-testid="selection-count">
        {plural(n)} selected
      </span>
      <CopyButton label="Copy selected games as image" copy={copy} testId="copy-selection" />
      <button type="button" className="ck-selbar-clear" onClick={() => store.clear()} aria-label="Clear selection" title="Clear selection (Esc)">
        ✕
      </button>
    </div>
  );
}

/** Highlight of the selected games inside `scope` (the live views only, never an image being copied). */
export function SelectionStyle({ store, scope }: { store: SelectionStore; scope: string }) {
  const ids = useSelection(store);
  if (!ids.size) return null;
  const sel = [...ids].map((id) => `${scope} [data-game-id="${CSS.escape(id)}"]`).join(',\n');
  return <style data-testid="selection-style">{`${sel} { outline: 2px solid var(--ck-accent); outline-offset: -1px; background-color: rgba(78, 161, 255, 0.16); }`}</style>;
}
