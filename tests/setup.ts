// Each test starts as a fresh page — the notes store is one per page (localNotesStore).
import { afterEach } from 'vitest';
import { resetLocalNotesStore } from '../src/slate/notes';

afterEach(() => {
  resetLocalNotesStore();
});

// No real weather in unit tests: the app's cold-weather store (src/slate/weather.ts) would ask Open-Meteo for today's
// night. Tests of the flags give the store their own fetch.
{
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input instanceof Request ? input.url : input).startsWith('https://api.open-meteo.com/') ? Promise.reject(new Error('no weather in unit tests')) : real(input, init)) as typeof fetch;
}
