// @vitest-environment jsdom
// Round 9, Part 3: Slate notes — a note per game (NBA gameId) with three slots (pre / live / post) and the slot on show,
// in localStorage under NOTES_KEY; saved as typed (debounced) and on every switch; other tabs follow (storage event);
// export / import (merge: per slot the file's text wins); "Switch all"; "Hide all notes" not remembered; typing re-renders
// only its own card; the two-column rule. Real browser behaviour (reload, two tabs, copies, timing): e2e/notes.spec.ts.

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarView } from '../src/components/CalendarView';
import { createNotesStore, EMPTY_NOTE, exportFile, mergeNotes, NOTES_KEY, parseExport, SAVE_DELAY_MS } from '../src/components/notes';
import { slateColumns, slateNoteWidth, SLATE_NOTE_MIN } from '../src/components/slate';
import { data } from './feed';

const NOW = Date.parse('2026-11-15T15:00:00Z');
const XL = { width: 1840, height: 1000 };
const stored = () => JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}');
const open = (now = NOW, initial = {}) => render(<CalendarView data={data} size={XL} now={now} timeZone="UTC" initial={{ mode: 'league', layout: 'slate', date: '2026-11-15', ...initial }} />);
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-testid="slate"] .ck-slate-card')];
const box = (i: number) => within(cards()[i]!);
const type = (i: number, text: string) => fireEvent.change(box(i).getByTestId('note-text'), { target: { value: text } });
const slot = (i: number) => box(i).getByTestId('note-slot').textContent;
const text = (i: number) => (box(i).getByTestId('note-text') as HTMLTextAreaElement).value;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

describe('format, parse, merge', () => {
  it('export file → parse → the same notes; a bare map too', () => {
    const notes = { '0022600001': { pre: 'a', live: '', post: 'c', shown: 'post' as const } };
    expect(parseExport(exportFile(notes))).toEqual(notes);
    expect(parseExport(JSON.stringify(notes))).toEqual(notes);
    expect(JSON.parse(exportFile(notes)).format).toBe(NOTES_KEY);
  });

  it('malformed files are rejected with a reason', () => {
    for (const [bad, why] of [
      ['not json', /not JSON/],
      ['[1,2]', /not a notes object/],
      ['{"notes": {"abc": {"pre": ""}}}', /not an NBA game id/],
      ['{"0022600001": {"pre": 3}}', /not \{ pre, live, post, shown \}/],
      ['{"0022600001": {"pre": "", "shown": "later"}}', /not \{ pre, live, post, shown \}/],
      ['{"format": "something:else", "notes": {}}', /unknown format/],
    ] as const)
      expect(() => parseExport(bad), bad).toThrow(why);
  });

  it('merge: for a game in both, each slot the file has text for wins; an empty slot keeps ours; others kept', () => {
    const ours = { '0022600001': { pre: 'mine', live: 'mine live', post: '', shown: 'pre' as const }, '0022600002': { pre: 'only mine', live: '', post: '', shown: 'pre' as const } };
    const theirs = { '0022600001': { pre: 'theirs', live: '', post: 'theirs post', shown: 'post' as const }, '0022600003': { pre: 'new', live: '', post: '', shown: 'pre' as const } };
    expect(mergeNotes(ours, theirs)).toEqual({
      '0022600001': { pre: 'theirs', live: 'mine live', post: 'theirs post', shown: 'post' },
      '0022600002': ours['0022600002'],
      '0022600003': theirs['0022600003'],
    });
  });
});

describe('the store', () => {
  it('a game with no note: empty, on PRE; typing is saved after the delay, a switch at once; an emptied note is removed', () => {
    vi.useFakeTimers();
    const s = createNotesStore(localStorage, window);
    expect(s.get('0022600001')).toEqual(EMPTY_NOTE);
    s.set('0022600001', { pre: 'hello' });
    expect(localStorage.getItem(NOTES_KEY)).toBeNull();
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(stored()).toEqual({ '0022600001': { pre: 'hello', live: '', post: '', shown: 'pre' } });
    s.set('0022600001', { shown: 'live' }, true);
    expect(stored()['0022600001'].shown).toBe('live');
    s.set('0022600001', { pre: '', shown: 'pre' }, true);
    expect(localStorage.getItem(NOTES_KEY)).toBeNull();
  });

  it('another tab: its save arrives (that game only is told); text typed here and not saved yet is kept; saving keeps their other games', () => {
    vi.useFakeTimers();
    const s = createNotesStore(localStorage, window);
    const off = s.listen();
    const heard: string[] = [];
    s.subscribe('0022600001', () => heard.push('1'));
    s.subscribe('0022600002', () => heard.push('2'));
    // the other tab saved game 1
    const theirs = { '0022600001': { pre: 'from B', live: '', post: '', shown: 'live' } };
    localStorage.setItem(NOTES_KEY, JSON.stringify(theirs));
    window.dispatchEvent(new StorageEvent('storage', { key: NOTES_KEY, newValue: JSON.stringify(theirs) }));
    expect(s.get('0022600001')).toEqual(theirs['0022600001']);
    expect(heard).toEqual(['1']);
    // typing here in game 2; meanwhile B saves game 1 again and (an old copy of) game 2
    s.set('0022600002', { pre: 'typing in A' });
    const again = { '0022600001': { pre: 'from B 2', live: '', post: '', shown: 'live' }, '0022600002': { pre: 'old', live: '', post: '', shown: 'pre' } };
    localStorage.setItem(NOTES_KEY, JSON.stringify(again));
    window.dispatchEvent(new StorageEvent('storage', { key: NOTES_KEY, newValue: JSON.stringify(again) }));
    expect(s.get('0022600002').pre).toBe('typing in A'); // kept
    expect(s.get('0022600001').pre).toBe('from B 2');
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(stored()).toEqual({ '0022600001': again['0022600001'], '0022600002': { pre: 'typing in A', live: '', post: '', shown: 'pre' } });
    off();
  });

  it('switch all and import: saved at once; import says how many games', () => {
    const s = createNotesStore(localStorage, window);
    s.showAll(['0022600001', '0022600002'], 'post');
    expect(stored()).toEqual({ '0022600001': { ...EMPTY_NOTE, shown: 'post' }, '0022600002': { ...EMPTY_NOTE, shown: 'post' } });
    expect(s.importNotes({ '0022600003': { pre: 'x', live: '', post: '', shown: 'pre' }, '0022600001': { pre: 'y', live: '', post: '', shown: 'live' } })).toBe(2);
    expect(stored()['0022600001']).toEqual({ pre: 'y', live: '', post: '', shown: 'live' });
    expect(stored()['0022600003'].pre).toBe('x');
  });
});

describe('Slate cards with notes', () => {
  it('three slots: type in PRE, LIVE, POST, switch around twice — every text intact; the slot is saved and comes back', () => {
    vi.useFakeTimers();
    open();
    expect(slot(0)).toBe('PRE');
    type(0, 'pregame');
    fireEvent.click(box(0).getByTestId('note-switch'));
    expect(slot(0)).toBe('LIVE');
    expect(text(0)).toBe('');
    type(0, 'live text');
    fireEvent.click(box(0).getByTestId('note-switch'));
    type(0, 'postgame');
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      fireEvent.click(box(0).getByTestId('note-switch'));
      seen.push(`${slot(0)}:${text(0)}`);
    }
    expect(seen).toEqual(['PRE:pregame', 'LIVE:live text', 'POST:postgame', 'PRE:pregame', 'LIVE:live text', 'POST:postgame']);
    act(() => vi.advanceTimersByTime(SAVE_DELAY_MS));
    const id = cards()[0]!.dataset.gameId!;
    expect(stored()[id]).toEqual({ pre: 'pregame', live: 'live text', post: 'postgame', shown: 'post' });
    // "reload": a new widget reads it back; the other games start on PRE, empty
    cleanup();
    open();
    expect(slot(0)).toBe('POST');
    expect(text(0)).toBe('postgame');
    expect(slot(1)).toBe('PRE');
    expect(text(1)).toBe('');
  });

  it('the slot never changes by itself: not at tip-off, not once the game is over', () => {
    open();
    fireEvent.click(box(2).getByTestId('note-switch')); // LIVE
    const id = cards()[2]!.dataset.gameId!;
    const g = data.games.find((x) => x.gameId === id)!;
    for (const now of [Date.parse(g.startTimeUtc!) - 60_000, Date.parse(g.startTimeUtc!) + 60_000, Date.parse(g.startTimeUtc!) + 4 * 3_600_000]) {
      cleanup();
      open(now);
      expect(slot(2), new Date(now).toISOString()).toBe('LIVE');
      expect(slot(0)).toBe('PRE');
    }
  });

  it('the note belongs to the game: the same note on the same game reached another way (another day and back, the date picker)', () => {
    vi.useFakeTimers();
    open();
    type(1, 'kept by gameId');
    const id = cards()[1]!.dataset.gameId!;
    fireEvent.click(screen.getByLabelText('Next day'));
    expect(cards().some((c) => c.dataset.gameId === id)).toBe(false);
    fireEvent.click(screen.getByLabelText('Previous day'));
    expect(text(1)).toBe('kept by gameId');
    act(() => vi.advanceTimersByTime(SAVE_DELAY_MS));
    expect(stored()[id].pre).toBe('kept by gameId');
  });

  it('Switch all: every card of the day on that slot, saved; Hide all notes: info only, back after a reload', () => {
    open();
    fireEvent.click(screen.getByTestId('notes-all-live'));
    expect(cards().map((_, i) => slot(i))).toEqual(cards().map(() => 'LIVE'));
    for (const c of cards()) expect(stored()[c.dataset.gameId!].shown).toBe('live');
    fireEvent.click(screen.getByTestId('notes-hide'));
    expect(document.querySelectorAll('[data-testid="note"]')).toHaveLength(0);
    expect(screen.getByTestId('notes-hide').getAttribute('aria-pressed')).toBe('true');
    cleanup();
    open();
    expect(document.querySelectorAll('[data-testid="note"]').length).toBe(cards().length);
    expect(slot(0)).toBe('LIVE');
    // nothing but the notes is stored
    expect(Object.keys(localStorage)).toEqual([NOTES_KEY]);
  });

  it('typing in one box re-renders that card only: no other card’s DOM changes', () => {
    open();
    const others = cards().slice(1);
    let changes = 0;
    const mo = new MutationObserver((m) => (changes += m.length));
    for (const c of others) mo.observe(c, { subtree: true, childList: true, attributes: true, characterData: true });
    for (const t of ['a', 'ab', 'abc', 'abcd']) type(0, t);
    mo.takeRecords();
    mo.disconnect();
    expect(changes).toBe(0);
    expect(text(0)).toBe('abcd');
  });

  it('export downloads every note; import merges a file and says how many games; a bad file changes nothing', async () => {
    open();
    type(0, 'one');
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => (created.push(b as Blob), 'blob:x'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByTestId('notes-export'));
    expect(click).toHaveBeenCalled();
    const file = JSON.parse(await created[0]!.text());
    expect(file.notes[cards()[0]!.dataset.gameId!].pre).toBe('one');
    const input = screen.getByTestId('notes-file') as HTMLInputElement;
    const id1 = cards()[1]!.dataset.gameId!;
    const good = new File([JSON.stringify({ format: NOTES_KEY, notes: { [id1]: { pre: 'imported', live: '', post: '', shown: 'pre' } } })], 'notes.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [good] } });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('notes-message').textContent).toBe('Imported notes for 1 game.');
    expect(text(1)).toBe('imported');
    const before = localStorage.getItem(NOTES_KEY);
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['{"oops": 1}'], 'bad.json')] } });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('notes-message').textContent).toMatch(/^Not imported: .+\. Nothing was changed\.$/);
    expect(localStorage.getItem(NOTES_KEY)).toBe(before);
  });
});

describe('columns', () => {
  it('two columns while the note box keeps 300 px, else one (1280 → 1, 1920 → 2)', () => {
    expect(slateColumns(1840)).toBe(2);
    expect(slateNoteWidth((1840 - 12) / 2)).toBeGreaterThanOrEqual(SLATE_NOTE_MIN);
    expect(slateColumns(1233)).toBe(1);
    expect(slateNoteWidth((1233 - 12) / 2)).toBeLessThan(SLATE_NOTE_MIN);
    open();
    expect(document.querySelector('.ck-slate-grid')!.getAttribute('data-cols')).toBe('2');
    cleanup();
    render(<CalendarView data={data} size={{ width: 1233, height: 900 }} now={NOW} timeZone="UTC" initial={{ mode: 'league', layout: 'slate' }} />);
    expect(document.querySelector('.ck-slate-grid')!.getAttribute('data-cols')).toBe('1');
  });
});
