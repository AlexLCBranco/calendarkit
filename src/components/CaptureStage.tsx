// Off-screen render of the whole view for "Copy view as image".

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Padding around the view in a whole-view image (.ck-capture); the stage is this much wider so the view keeps its width. */
export const CAPTURE_PAD = 12;

/**
 * Off-screen copy of the current view for "Copy view as image": the whole view, not only the part a list has
 * scrolled to (team list: every game; league list: the week of the day at the top), under a caption with the
 * title, period, filter and time zone instead of the controls. Rendered only while copying; `onReady` gets the
 * node once fonts and logos are decoded.
 */
export function CaptureStage({ onReady, width, minHeight, className, children }: { onReady: (node: HTMLElement) => void; width: number; minHeight?: number; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in development
    started.current = true;
    const node = ref.current!;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    (async () => {
      await frame();
      await frame(); // layout effects (Team Calendar scale) have settled
      await document.fonts?.ready;
      await Promise.all([...node.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
      onReady(node);
    })();
  }, []);
  return createPortal(
    <div className="ck-capture-stage" aria-hidden="true">
      <div ref={ref} className={`ck-root ck-capture${className}`} style={{ width, minHeight }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
