// Round 10: shown at the old address when its notes could not be handed to the new one (handoff.ts) — instead of
// redirecting and leaving them behind. The notes stay where they are; Export saves them as round 9's export file.

import { exportText, OLD_ORIGIN } from './handoff';

export function HandoffFailed({ reason, target, notes }: { reason: string; target: string; notes: string }) {
  const exportNotes = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportText(notes)], { type: 'application/json' }));
    a.download = `calendarkit-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const retry = () => {
    const t = new URL(target);
    location.replace(`${OLD_ORIGIN}${t.pathname}${t.search}${t.hash}`);
  };
  return (
    <main className="handoff" data-testid="handoff-failed">
      <h1>calendarkit has moved</h1>
      <p>
        Its new address is <a href={target}>{new URL(target).origin}/calendar/</a>. Your Slate notes could not be moved there:{' '}
        <span data-testid="handoff-reason">{reason}</span>.
      </p>
      <p>They are still here, in this browser. Export them, then use Import notes in the Slate at the new address.</p>
      <p className="handoff-actions">
        <button type="button" onClick={exportNotes} data-testid="handoff-export">
          Export notes
        </button>
        <button type="button" onClick={retry} data-testid="handoff-retry">
          Try again
        </button>
        <a href={target} data-testid="handoff-continue">
          Go to the new address without them
        </a>
      </p>
    </main>
  );
}
