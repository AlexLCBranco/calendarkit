// "Fatigue info" (Options): whether the Team Calendar's month cells show the two per-team lines (streaks, back-to-back,
// N-in-M and rest chips). On by default; the choice is remembered between visits. One store, so the grid, its copies
// and the Options switch read the same value without passing it through every view.

import { createValueStore, useValue } from './valueStore';

const KEY = 'ck:fatigue:v1';

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true; // storage blocked: the default
  }
}

export const fatigueInfo = createValueStore<boolean>(stored());

export function setFatigueInfo(on: boolean) {
  fatigueInfo.set(on);
  try {
    // only the choice that differs from the default is kept
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // storage blocked: the switch still works for this visit
  }
}

export const useFatigueInfo = () => useValue(fatigueInfo);
