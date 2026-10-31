import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { handoff, newAddress, OLD_HOST, type Handoff } from './handoff';
import { HandoffFailed } from './HandoffFailed';
import './app.css';

// Round 10: at the old address, hand the notes over and go to the new one (handoff.ts); at the new one, take them.
let step: Handoff;
try {
  step = handoff({ location, referrer: document.referrer, local: localStorage, session: sessionStorage });
} catch {
  // no storage at all (blocked site data): no notes to move
  step = location.hostname === OLD_HOST ? { kind: 'go', to: newAddress(location) } : { kind: 'run' };
}

if (step.kind === 'go') location.replace(step.to);
else
  createRoot(document.getElementById('root')!).render(
    <StrictMode>{step.kind === 'failed' ? <HandoffFailed reason={step.reason} target={step.target} notes={step.notes} /> : <App />}</StrictMode>,
  );
