// An icon button of the top bar with a popover under it (Options, ⓘ).

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * An icon button with a popover under it. The popover stays in the page while closed (hidden), so what is in it — the
 * options' checkboxes, a destination's portal into it — exists all the time; Escape or a press outside closes it.
 */
export function PopoverButton({ label, testId, icon, className = '', buttonClass = '', popClass = '', title, tip, children }: { label: string; testId: string; icon: ReactNode; className?: string; buttonClass?: string; popClass?: string; title?: string; tip?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      wrap.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', esc);
    return () => (document.removeEventListener('pointerdown', outside, true), window.removeEventListener('keydown', esc));
  }, [open]);
  return (
    <span className={`ck-pop-wrap${className}`} ref={wrap}>
      <button type="button" className={`ck-button ck-icon-button${buttonClass}`} aria-label={label} title={open ? undefined : title ?? label} data-tip={open ? undefined : tip} aria-haspopup="dialog" aria-expanded={open} data-testid={testId} onClick={() => setOpen((o) => !o)}>
        {icon}
      </button>
      <div className={`ck-pop${popClass}`} role="dialog" aria-label={label} hidden={!open} data-testid={`${testId}-pop`}>
        {children}
      </div>
    </span>
  );
}

