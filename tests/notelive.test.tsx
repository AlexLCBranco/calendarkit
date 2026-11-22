// @vitest-environment jsdom
// Notes typed in the copy layout shown live (SlateCopy editNotes: the gauntlet's Slate widget, its GT-4): a note looks
// exactly like the copy (plus ⇄ under the label, CK-11) until clicked; a click opens calendarkit's field in that box (with ⇄); typing saves to the
// game's note (the store), Enter adds a line, leaving the field saves at once and shows the copy again; a note saved
// elsewhere shows at once. Without editNotes the copy stays static (images).

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SlateCopy } from '../src/slate/SlateCard';
import { createNotesStore } from '../src/slate/notes';
import { data } from './feed';

const games = data.byDate.get('2026-10-23')!.slice(0, 4);
const memory = () => createNotesStore(undefined, undefined);
const card = (c: HTMLElement, i: number) => c.querySelectorAll<HTMLElement>('.ck-slate-card')[i]!;
const box = (c: HTMLElement, i: number) => card(c, i).querySelector<HTMLElement>('[data-testid="note"]')!;
const field = (c: HTMLElement, i: number) => card(c, i).querySelector<HTMLTextAreaElement>('textarea[data-testid="note-text"]');

afterEach(cleanup);

describe('SlateCopy editNotes (NoteLive)', () => {
  it('at rest: the copy itself (static text, the label, no field) plus ⇄ under the label, on every card (CK-11)', () => {
    const store = memory();
    store.set(games[0]!.gameId, { pre: 'Watch the starters' }, true);
    const live = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" notes={store} editNotes />).container;
    const still = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" notes={store} />).container;
    const strip = (c: HTMLElement) => c.innerHTML.replace(/ data-editable="true"/g, '').replace(/<button[^>]*data-testid="note-switch"[^>]*>⇄<\/button>/g, '').replace(/<(a|span)[^>]*data-testid="slate-countdown"[^>]*>[^<]*<\/\1>/, '');
    // the live copy's header also has the countdown link (CK-22); never in images
    expect(live.querySelectorAll('[data-testid="slate-countdown"]')).toHaveLength(1);
    expect(still.querySelectorAll('[data-testid="slate-countdown"]')).toHaveLength(0);
    expect(strip(live)).toBe(still.innerHTML);
    expect(live.querySelectorAll('textarea')).toHaveLength(0);
    // CK-11: the switch is always there in the live copy, stacked under the label; never in images
    expect(live.querySelectorAll('[data-testid="note-switch"]')).toHaveLength(games.length);
    expect(live.querySelectorAll('.ck-gnote-head-stack [data-testid="note-switch"]')).toHaveLength(games.length);
    expect(still.querySelectorAll('[data-testid="note-switch"]')).toHaveLength(0);
    expect(still.querySelectorAll('[data-editable]')).toHaveLength(0);
  });

  it('a click opens the field (focused, the text in it, ⇄ under the label); typing saves to the game; Enter adds a line', () => {
    const store = memory();
    const id = games[1]!.gameId;
    store.set(id, { pre: 'First line' }, true);
    const { container: c } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" notes={store} editNotes />);
    fireEvent.click(box(c, 1));
    const t = field(c, 1)!;
    expect(t).not.toBeNull();
    expect(document.activeElement).toBe(t);
    expect(t.value).toBe('First line');
    expect(card(c, 1).querySelector('[data-testid="note-switch"]')).not.toBeNull();
    // only that card opened
    expect(c.querySelectorAll('textarea')).toHaveLength(1);
    fireEvent.change(t, { target: { value: 'First line\nSecond line' } });
    expect(store.get(id).pre).toBe('First line\nSecond line');
    // Enter is the field's own (a new line): nothing closes it
    fireEvent.keyDown(t, { key: 'Enter' });
    expect(field(c, 1)).not.toBeNull();
  });

  it('leaving the field (blur: a click elsewhere) saves at once and shows the copy again with the new text; Escape too', () => {
    const saved: string[] = [];
    const storage = { getItem: () => null, setItem: (_k: string, v: string) => void saved.push(v), removeItem: () => {} } as unknown as Storage;
    const store = createNotesStore(storage, undefined);
    const id = games[0]!.gameId;
    const { container: c } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" notes={store} editNotes />);
    fireEvent.click(box(c, 0));
    fireEvent.change(field(c, 0)!, { target: { value: 'Closing lineup' } });
    expect(saved).toHaveLength(0); // the store's delay
    fireEvent.blur(field(c, 0)!);
    expect(saved.length).toBeGreaterThan(0);
    expect(JSON.parse(saved.at(-1)!)[id].pre).toBe('Closing lineup');
    expect(field(c, 0)).toBeNull();
    expect(box(c, 0).textContent).toBe('Closing lineup');
    // Escape leaves too
    fireEvent.click(box(c, 0));
    fireEvent.keyDown(field(c, 0)!, { key: 'Escape' });
    expect(field(c, 0)).toBeNull();
  });

  it('⇄ while typing switches the space and keeps the field open (the press leaves the focus in it)', () => {
    const store = memory();
    const id = games[2]!.gameId;
    store.set(id, { pre: 'pre text', live: 'live text' }, true);
    const { container: c } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" notes={store} editNotes />);
    fireEvent.click(box(c, 2));
    const sw = card(c, 2).querySelector<HTMLButtonElement>('[data-testid="note-switch"]')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    sw.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    fireEvent.click(sw);
    expect(store.get(id).shown).toBe('live');
    expect(field(c, 2)!.value).toBe('live text');
    expect(card(c, 2).querySelector('[data-testid="note-slot"]')!.textContent).toBe('LIVE');
  });

  it('a note saved elsewhere (another tab, /calendar) shows at once, open or not', () => {
    const store = memory();
    const id = games[3]!.gameId;
    const { container: c } = render(<SlateCopy data={data} games={games} cols={2} cardWidth={944} timeZone="UTC" notes={store} editNotes />);
    act(() => store.set(id, { post: 'from elsewhere', shown: 'post' }, true));
    expect(box(c, 3).textContent).toBe('from elsewhere');
    expect(card(c, 3).querySelector('[data-testid="note-slot"]')!.textContent).toBe('POST');
  });
});
