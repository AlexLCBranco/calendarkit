// A single value outside React state (like selection.ts's store): what follows a scroll or a clock writes here, and only
// the components reading it re-render — never the list or view around them (Rule #1, round 4).

import { useSyncExternalStore } from 'react';

export interface ValueStore<T> {
  get(): T;
  /** No-op (and no notification) when the value is unchanged. */
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(value) {
      if (Object.is(value, current)) return;
      current = value;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useValue = <T,>(store: ValueStore<T>): T => useSyncExternalStore(store.subscribe, store.get, store.get);
