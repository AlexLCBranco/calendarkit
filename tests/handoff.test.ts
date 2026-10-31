// Round 10 (1.1): the old address hands its notes to the new one once, then redirects (handoff.ts). Here both sides run
// with storages of their own (two origins), passing the URLs between them as the browser would.

import { describe, expect, it } from 'vitest';
import { HANDED_OFF_KEY, handoff, newAddress, NEW_ORIGIN, OLD_ORIGIN, type HandoffEnv } from '../src/handoff';
import { NOTES_KEY } from '../src/slate/notes';

class Mem implements Storage {
  m = new Map<string, string>();
  full = false;
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.full) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    this.m.set(k, v);
  }
}

const loc = (href: string) => {
  const u = new URL(href);
  return { href, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash };
};

/** One browser tab: the old origin's and the new origin's storages, and where it is. */
function tab(oldNotes?: object, newNotes?: object) {
  const old = { local: new Mem(), session: new Mem() };
  const neu = { local: new Mem(), session: new Mem() };
  if (oldNotes) old.local.setItem(NOTES_KEY, JSON.stringify(oldNotes));
  if (newNotes) neu.local.setItem(NOTES_KEY, JSON.stringify(newNotes));
  let replaced = '';
  const at = (href: string, referrer = ''): HandoffEnv => {
    const side = new URL(href).origin === OLD_ORIGIN ? old : neu;
    return { location: loc(href), referrer, ...side, random: () => 'n0nce', replaceUrl: (u) => (replaced = u) };
  };
  /** Follows the hand-off from a visit to `href` until a page runs or stops; returns the steps. */
  const visit = (href: string, hideReferrer = false) => {
    const steps: string[] = [];
    let url = href;
    let referrer = '';
    for (let i = 0; i < 5; i++) {
      const r = handoff(at(url, referrer));
      if (r.kind !== 'go') return { steps, end: r, url };
      steps.push(r.to);
      referrer = hideReferrer ? '' : `${new URL(url).origin}/`;
      url = r.to;
    }
    throw new Error('loop');
  };
  return { old, neu, at, visit, replaced: () => replaced };
}

const A = '0022600101';
const B = '0022600102';
const C = '0022600103';

describe('the new address for an old one', () => {
  it('/calendar/ + the rest of the path, query and fragment kept', () => {
    expect(newAddress(loc(`${OLD_ORIGIN}/`))).toBe(`${NEW_ORIGIN}/calendar/`);
    expect(newAddress(loc(`${OLD_ORIGIN}/?view=team&layout=list&team=BOS`))).toBe(`${NEW_ORIGIN}/calendar/?view=team&layout=list&team=BOS`);
    expect(newAddress(loc(`${OLD_ORIGIN}/calendar/slate.html?date=2026-11-02#x`))).toBe(`${NEW_ORIGIN}/calendar/slate.html?date=2026-11-02#x`);
    expect(newAddress(loc(`${OLD_ORIGIN}/calendar`))).toBe(`${NEW_ORIGIN}/calendar`);
  });
});

describe('hand-off', () => {
  const notes = { [A]: { pre: 'p', live: 'l', post: 'o', shown: 'live' }, [B]: { pre: '', live: '', post: 'only post', shown: 'post' } };

  it('notes on the old origin → the same notes (every slot and the shown one) on the new, then the bookmark\'s page', () => {
    const t = tab(notes);
    const { steps, end, url } = t.visit(`${OLD_ORIGIN}/?view=league&layout=slate`);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(new RegExp(`^${NEW_ORIGIN}/calendar/#ck-handoff=`));
    expect(steps[1]).toBe(`${OLD_ORIGIN}/calendar/?ck-handoff=done&nonce=n0nce&games=2`);
    expect(steps[2]).toBe(`${NEW_ORIGIN}/calendar/?view=league&layout=slate`);
    expect(end.kind).toBe('run');
    expect(url).toBe(`${NEW_ORIGIN}/calendar/?view=league&layout=slate`);
    expect(JSON.parse(t.neu.local.getItem(NOTES_KEY)!)).toEqual(notes);
    expect(JSON.parse(t.old.local.getItem(HANDED_OFF_KEY)!)).toMatchObject({ to: NEW_ORIGIN, games: 2 });
    // the old side keeps its copy (nothing deleted there); the pending hand-off is cleared
    expect(JSON.parse(t.old.local.getItem(NOTES_KEY)!)).toEqual(notes);
    expect(t.old.session.length).toBe(0);
  });

  it('the notes leave the new page\'s address at once', () => {
    const t = tab(notes);
    const [to] = t.visit(`${OLD_ORIGIN}/`).steps;
    handoff(t.at(to!, `${OLD_ORIGIN}/`));
    expect(t.replaced()).toBe('/calendar/');
  });

  it('a second visit goes straight on: no second hand-off, so later edits on the new side stay', () => {
    const t = tab(notes);
    t.visit(`${OLD_ORIGIN}/`);
    const edited = { ...notes, [A]: { ...notes[A]!, pre: 'edited later at the new address' } };
    t.neu.local.setItem(NOTES_KEY, JSON.stringify(edited));
    const again = t.visit(`${OLD_ORIGIN}/?view=team&team=BOS`);
    expect(again.steps).toEqual([`${NEW_ORIGIN}/calendar/?view=team&team=BOS`]);
    expect(JSON.parse(t.neu.local.getItem(NOTES_KEY)!)).toEqual(edited);
  });

  it('notes already at the new address survive the merge: other games kept, an empty slot never overwrites', () => {
    const theirs = { [A]: { pre: 'old pre', live: '', post: '', shown: 'pre' } };
    const ours = { [A]: { pre: '', live: 'new live', post: 'new post', shown: 'post' }, [C]: { pre: 'only new', live: '', post: '', shown: 'pre' } };
    const t = tab(theirs, ours);
    t.visit(`${OLD_ORIGIN}/`);
    expect(JSON.parse(t.neu.local.getItem(NOTES_KEY)!)).toEqual({
      [A]: { pre: 'old pre', live: 'new live', post: 'new post', shown: 'pre' }, // round 9's import rule: the incoming shown slot wins
      [C]: ours[C],
    });
  });

  it('no notes on the old origin (none, or an empty map): straight on, nothing written anywhere', () => {
    for (const n of [undefined, {}]) {
      const t = tab(n);
      expect(t.visit(`${OLD_ORIGIN}/?view=league`).steps).toEqual([`${NEW_ORIGIN}/calendar/?view=league`]);
      expect(t.neu.local.length).toBe(0);
      expect(t.old.local.getItem(HANDED_OFF_KEY)).toBeNull();
    }
  });

  it('the new address full: no redirect — the old page says why, offers Export, and tries again next time', () => {
    const t = tab(notes);
    t.neu.local.full = true;
    const { steps, end } = t.visit(`${OLD_ORIGIN}/`);
    expect(steps).toHaveLength(2);
    expect(end).toMatchObject({ kind: 'failed', reason: 'the browser storage at the new address is full', target: `${NEW_ORIGIN}/calendar/` });
    expect(end.kind === 'failed' && JSON.parse(end.notes)).toEqual(notes);
    expect(t.old.local.getItem(HANDED_OFF_KEY)).toBeNull();
    t.neu.local.full = false;
    expect(t.visit(`${OLD_ORIGIN}/`).end.kind).toBe('run');
    expect(JSON.parse(t.neu.local.getItem(NOTES_KEY)!)).toEqual(notes);
  });

  it('origins are checked: notes from anywhere but the old address are ignored; an answer not from the new one is refused', () => {
    const t = tab(notes);
    const [to] = t.visit(`${OLD_ORIGIN}/`).steps.slice(0, 1);
    t.neu.local.clear();
    expect(handoff(t.at(to!, 'https://evil.example/'))).toEqual({ kind: 'run' });
    expect(t.neu.local.length).toBe(0);
    const t2 = tab(notes);
    t2.visit(`${OLD_ORIGIN}/`); // done once properly
    const t3 = tab(notes);
    t3.old.session.setItem('ck:handoff:pending', JSON.stringify({ nonce: 'n0nce', target: `${NEW_ORIGIN}/calendar/` }));
    expect(handoff(t3.at(`${OLD_ORIGIN}/calendar/?ck-handoff=done&nonce=n0nce&games=2`, 'https://evil.example/')).kind).toBe('failed');
    expect(handoff(t3.at(`${OLD_ORIGIN}/calendar/?ck-handoff=done&nonce=other&games=2`, `${NEW_ORIGIN}/`)).kind).toBe('failed');
    expect(t3.old.local.getItem(HANDED_OFF_KEY)).toBeNull();
  });

  it('a browser that hides the referrer: not silent — the old page says why and offers Export; nothing stored or marked', () => {
    const t = tab(notes);
    const { steps, end } = t.visit(`${OLD_ORIGIN}/?view=league`, true);
    expect(steps).toHaveLength(2);
    expect(end).toMatchObject({ kind: 'failed', reason: 'the browser did not say where they came from (its referrer is hidden)', target: `${NEW_ORIGIN}/calendar/?view=league` });
    expect(t.neu.local.length).toBe(0);
    expect(t.old.local.getItem(HANDED_OFF_KEY)).toBeNull();
  });

  it('notes the old page can\'t read: not redirected, the reason and the stored text for Export', () => {
    const t = tab();
    t.old.local.setItem(NOTES_KEY, '{"bad id": 1}');
    const { steps, end } = t.visit(`${OLD_ORIGIN}/`);
    expect(steps).toEqual([]);
    expect(end).toMatchObject({ kind: 'failed', notes: '{"bad id": 1}' });
  });

  it('elsewhere (the new address, localhost, previews) without a hand-off: the app runs', () => {
    for (const h of [`${NEW_ORIGIN}/calendar/`, 'http://localhost:4180/calendar/', 'https://calendarkit-git-x-alexlcbrancos-projects.vercel.app/']) expect(handoff(tab().at(h))).toEqual({ kind: 'run' });
  });

  it('a large set of notes goes over whole (≈ 700 KB of text)', () => {
    const big: Record<string, object> = {};
    for (let i = 0; i < 1300; i++) big[`00226${String(i).padStart(5, '0')}`] = { pre: 'é'.repeat(200), live: 'x'.repeat(100), post: '🏀'.repeat(20), shown: 'post' };
    const t = tab(big);
    expect(t.visit(`${OLD_ORIGIN}/`).end.kind).toBe('run');
    expect(JSON.parse(t.neu.local.getItem(NOTES_KEY)!)).toEqual(big);
  });

  it('more than an address can carry: not redirected, Export offered', () => {
    const huge: Record<string, object> = {};
    for (let i = 0; i < 3000; i++) huge[`00226${String(i).padStart(5, '0')}`] = { pre: 'x'.repeat(400), live: '', post: '', shown: 'pre' };
    const t = tab(huge);
    const { steps, end } = t.visit(`${OLD_ORIGIN}/`);
    expect(steps).toEqual([]);
    expect(end).toMatchObject({ kind: 'failed', reason: 'there are too many to move automatically' });
    expect(t.old.session.length).toBe(0);
  });
});
