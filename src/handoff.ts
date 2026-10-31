// Round 10: calendarkit moved from calendarkit-brown.vercel.app to gauntlet-home.vercel.app/calendar/ (one origin with
// the gauntlet). A browser visit to the old address is sent on to the new one, path (under /calendar/) and query kept —
// but first its Slate notes (localStorage `ck:notes:v1`, per origin) are handed over once, so none are stranded there:
//
//   old page  → new /calendar/#ck-handoff=<notes>        (top-level navigation; the fragment never reaches a server)
//   new page  → merges them (round 9's import rule), → old /calendar/?ck-handoff=done&nonce=…  (or =failed&reason=…)
//   old page  → marks the hand-off done, → the new address
//
// Not an iframe or a pop-up: vercel.app is a public suffix, so the two hosts are different sites, and a cross-site
// iframe gets partitioned storage (not the new site's own localStorage); a pop-up needs a click. Each side checks the
// other's origin (document.referrer) and the old side's nonce. A failure is never silent: the old page shows why, with
// Export notes. Only the exact old host redirects; Vercel's proxy (gauntlet-home's rewrite) fetches the files from that
// host without running them, so the browser there is always on gauntlet-home and nothing can loop.

import { exportFile, mergeNotes, NOTES_KEY, parseNotes, type NotesMap } from './slate/notes';

export const OLD_ORIGIN = 'https://calendarkit-brown.vercel.app';
export const NEW_ORIGIN = 'https://gauntlet-home.vercel.app';
export const OLD_HOST = new URL(OLD_ORIGIN).hostname;
/** On the old origin: the notes went over (never handed off again: the new side may have changed them since). */
export const HANDED_OFF_KEY = 'ck:notes:handoff:v1';
/** On the old origin, this tab only: the hand-off under way (its nonce, and where to go once it is done). */
const PENDING_KEY = 'ck:handoff:pending';
const HASH = '#ck-handoff=';
/** The longest hand-off address sent (Chrome's limit is 2 MB): ≈ 1.1 MB of notes; more → Export / Import instead. */
export const MAX_URL = 1_500_000;

/** The new address for an old one: /calendar/ + the rest of the path (old paths had none of it), query and fragment. */
export function newAddress(old: { pathname: string; search: string; hash: string }) {
  const path = old.pathname === '/calendar' || old.pathname.startsWith('/calendar/') ? old.pathname : `/calendar${old.pathname}`;
  return `${NEW_ORIGIN}${path}${old.search}${old.hash}`;
}

function b64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

/** What the page must do before (or instead of) running the app. */
export type Handoff =
  | { kind: 'run' }
  | { kind: 'go'; to: string }
  | { kind: 'failed'; reason: string; target: string; notes: string };

export interface HandoffEnv {
  location: { href: string; hostname: string; pathname: string; search: string; hash: string };
  referrer: string;
  local: Storage;
  session: Storage;
  random?: () => string;
  now?: () => Date;
  replaceUrl?: (url: string) => void;
}

/** Decides (and does the storage part of) the hand-off for this page load. Never throws. */
export function handoff(env: HandoffEnv): Handoff {
  try {
    return env.location.hostname === OLD_HOST ? onOld(env) : onNew(env);
  } catch (e) {
    return env.location.hostname === OLD_HOST ? { kind: 'failed', reason: (e as Error).message, target: newAddress(env.location), notes: safeGet(env.local, NOTES_KEY) ?? '' } : { kind: 'run' };
  }
}

const safeGet = (s: Storage, k: string) => {
  try {
    return s.getItem(k);
  } catch {
    return null;
  }
};

function onOld({ location, referrer, local, session, random = () => crypto.randomUUID(), now = () => new Date() }: HandoffEnv): Handoff {
  const q = new URLSearchParams(location.search);
  const back = q.get('ck-handoff');
  const raw = safeGet(local, NOTES_KEY);
  if (back) {
    // the new side answered: only it can (referrer), and only to this tab's own hand-off (nonce)
    const pending = JSON.parse(session.getItem(PENDING_KEY) ?? 'null') as { nonce: string; target: string } | null;
    const target = pending?.target ?? `${NEW_ORIGIN}/calendar/`;
    if (originOf(referrer) !== NEW_ORIGIN) return { kind: 'failed', reason: 'the answer did not come from the new address', target, notes: raw ?? '' };
    if (!pending || q.get('nonce') !== pending.nonce) return { kind: 'failed', reason: 'the answer does not match this hand-off', target, notes: raw ?? '' };
    if (back !== 'done') return { kind: 'failed', reason: q.get('reason') || 'the new address could not store them', target, notes: raw ?? '' };
    local.setItem(HANDED_OFF_KEY, JSON.stringify({ to: NEW_ORIGIN, at: now().toISOString(), games: Number(q.get('games')) || 0 }));
    session.removeItem(PENDING_KEY);
    return { kind: 'go', to: target };
  }
  const target = newAddress(location);
  if (safeGet(local, HANDED_OFF_KEY) || !raw) return { kind: 'go', to: target };
  let notes: NotesMap;
  try {
    notes = parseNotes(JSON.parse(raw));
  } catch (e) {
    return { kind: 'failed', reason: `the notes here can't be read (${(e as Error).message})`, target, notes: raw };
  }
  if (!Object.keys(notes).length) return { kind: 'go', to: target };
  const nonce = random();
  const to = `${NEW_ORIGIN}/calendar/${HASH}${b64(JSON.stringify({ v: 1, nonce, notes }))}`;
  // Chrome refuses addresses over 2 MB
  if (to.length > MAX_URL) return { kind: 'failed', reason: 'there are too many to move automatically', target, notes: raw };
  session.setItem(PENDING_KEY, JSON.stringify({ nonce, target }));
  return { kind: 'go', to };
}

function onNew({ location, referrer, local, replaceUrl = (u) => history.replaceState(history.state, '', u) }: HandoffEnv): Handoff {
  if (!location.hash.startsWith(HASH)) return { kind: 'run' };
  const payload = location.hash.slice(HASH.length);
  replaceUrl(location.pathname + location.search); // the notes leave the address bar (and this history entry) at once
  // only the old address may hand notes over; anything else is ignored, the app runs as usual
  if (originOf(referrer) !== OLD_ORIGIN) return { kind: 'run' };
  let nonce = '';
  try {
    const msg = JSON.parse(unb64(payload)) as { v: number; nonce: string; notes: unknown };
    nonce = String(msg.nonce ?? '');
    if (msg.v !== 1 || !nonce) throw new Error('unknown hand-off format');
    const theirs = parseNotes(msg.notes);
    const ours = parseNotes(JSON.parse(local.getItem(NOTES_KEY) ?? '{}'));
    const merged = mergeNotes(ours, theirs);
    local.setItem(NOTES_KEY, JSON.stringify(merged));
    // read back: every game handed over is stored as merged
    const stored = parseNotes(JSON.parse(local.getItem(NOTES_KEY) ?? '{}'));
    for (const id of Object.keys(theirs)) if (JSON.stringify(stored[id]) !== JSON.stringify(merged[id])) throw new Error(`game ${id} was not stored`);
    return { kind: 'go', to: `${OLD_ORIGIN}/calendar/?ck-handoff=done&nonce=${encodeURIComponent(nonce)}&games=${Object.keys(theirs).length}` };
  } catch (e) {
    const reason = (e as Error).name === 'QuotaExceededError' ? 'the browser storage at the new address is full' : (e as Error).message;
    return { kind: 'go', to: `${OLD_ORIGIN}/calendar/?ck-handoff=failed&nonce=${encodeURIComponent(nonce)}&reason=${encodeURIComponent(reason)}` };
  }
}

/** The failure page's Export: the notes as round 9's export file (or, when they can't be read, as they are stored). */
export function exportText(raw: string, now = new Date()) {
  try {
    return exportFile(parseNotes(JSON.parse(raw)), now);
  } catch {
    return raw;
  }
}
