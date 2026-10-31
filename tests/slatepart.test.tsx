// @vitest-environment jsdom
// Round 10 (1.2, 1.3, 1.7): the Slate's self-contained part (src/slate/). It imports nothing of calendarkit's app shell;
// its notes store is an input (the default, localNotesStore, is one per page with one storage listener however many
// grids show it); at rest it starts no timer and makes no request — typing starts only the save's debounce.

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_NOTE, localNotesStore, NOTES_KEY, SAVE_DELAY_MS, SlateDay, type GameNote, type SlateNotes } from '../src/slate';
import { data } from './feed';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const busiest = [...data.byDate.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
const [DAY, GAMES] = busiest;

describe('depends only on the data layer', () => {
  /** Every module reachable from `entry` by its static imports (relative ones resolved; bare ones listed as such). */
  function reach(entry: string) {
    const files = new Set<string>();
    const bare = new Set<string>();
    const walk = (file: string) => {
      if (files.has(file)) return;
      files.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+'([^']+)'|import\s+'([^']+)'/g)) {
        const spec = m[1] ?? m[2]!;
        if (!spec.startsWith('.')) {
          bare.add(spec);
          continue;
        }
        const base = resolve(dirname(file), spec);
        const hit = ['', '.ts', '.tsx', '/index.ts'].map((x) => base + x).find((p) => existsSync(p) && !p.endsWith('/'));
        if (!hit) throw new Error(`${file}: can't resolve ${spec}`);
        if (/\.(css|json)$/.test(hit)) continue;
        walk(hit);
      }
    };
    walk(resolve(entry));
    return { files: [...files].map((f) => relative(resolve('.'), f).replaceAll('\\', '/')).sort(), bare: [...bare].sort() };
  }

  for (const entry of ['src/slate/index.ts', 'src/slate/demo.tsx']) {
    it(`${entry}: only src/slate, src/data and src/shared; only React from outside`, () => {
      const { files, bare } = reach(entry);
      const outside = files.filter((f) => !/^src\/(slate|data|shared)\//.test(f));
      expect(outside).toEqual([]);
      expect(files).not.toContain('src/config.ts');
      expect(bare.filter((b) => !['react', 'react-dom/client'].includes(b))).toEqual([]);
      expect(files.length).toBeGreaterThan(8);
    });
  }

  it("the part's stylesheet is calendarkit's widget stylesheet, scoped to .ck-* (no html / body / :root rules)", () => {
    const css = (file: string): string =>
      readFileSync(file, 'utf8').replace(/@import '([^']+)';/g, (_, p: string) => css(join(dirname(file), p)));
    const all = css('src/slate/slate.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...all.matchAll(/(^|})\s*([^{}@]+?)\s*{/g)].map((m) => m[2]!.trim()).filter((s) => !/^(from|to|\d+%)$/.test(s));
    expect(selectors.length).toBeGreaterThan(100);
    const global = selectors.flatMap((s) => s.split(',')).map((s) => s.trim()).filter((s) => /^(html|body|:root)\b/.test(s));
    expect(global).toEqual([]);
  });
});

describe('the notes store is an input', () => {
  it('a store of the host\'s own, with only get / set / flush / subscribe, drives the boxes', () => {
    const notes = new Map<string, GameNote>([[GAMES[0]!.gameId, { pre: '', live: 'from the host', post: '', shown: 'live' }]]);
    const fns = new Set<() => void>();
    const store: SlateNotes = {
      get: (id) => notes.get(id) ?? EMPTY_NOTE, // the same object until the note changes (useSyncExternalStore)
      set: (id, patch) => {
        notes.set(id, { ...store.get(id), ...patch });
        fns.forEach((f) => f());
      },
      flush: () => {},
      subscribe: (_id, fn) => (fns.add(fn), () => fns.delete(fn)),
    };
    const { container } = render(<SlateDay data={data} date={DAY} notes={store} width={1840} />);
    const box = container.querySelector<HTMLTextAreaElement>(`[data-game-id="${GAMES[0]!.gameId}"] textarea`)!;
    expect(box.value).toBe('from the host');
    fireEvent.change(box, { target: { value: 'typed' } });
    expect(notes.get(GAMES[0]!.gameId)!.live).toBe('typed');
    expect(localStorage.getItem(NOTES_KEY)).toBeNull();
  });

  it('one storage listener per page for every grid (3 widgets + their cards)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(
      <>
        <SlateDay data={data} date={DAY} notes={localNotesStore()} />
        <SlateDay data={data} date={DAY} notes={localNotesStore()} />
        <SlateDay data={data} date={DAY} notes={localNotesStore()} />
      </>,
    );
    expect(document.querySelectorAll('.ck-slate-card')).toHaveLength(3 * GAMES.length);
    expect(add.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(1);
    add.mockRestore();
  });

  it('every widget of the page shows a note typed in another, and one saved in another tab', () => {
    const { container } = render(
      <>
        <div data-w="a">
          <SlateDay data={data} date={DAY} notes={localNotesStore()} />
        </div>
        <div data-w="b">
          <SlateDay data={data} date={DAY} notes={localNotesStore()} />
        </div>
      </>,
    );
    const id = GAMES[1]!.gameId;
    const box = (w: string) => container.querySelector<HTMLTextAreaElement>(`[data-w="${w}"] [data-game-id="${id}"] textarea`)!;
    fireEvent.change(box('a'), { target: { value: 'from widget a' } });
    expect(box('b').value).toBe('from widget a');
    const saved = JSON.stringify({ [id]: { pre: 'from another tab', live: '', post: '', shown: 'pre' } });
    act(() => {
      localNotesStore().flush();
      localStorage.setItem(NOTES_KEY, saved);
      window.dispatchEvent(new StorageEvent('storage', { key: NOTES_KEY, newValue: saved }));
    });
    expect(box('a').value).toBe('from another tab');
    expect(box('b').value).toBe('from another tab');
  });
});

describe('nothing ticking at rest, no requests of its own (1.7)', () => {
  afterEach(() => vi.useRealTimers());

  it('mounted (5 widgets of the busiest night), it starts no timer and fetches nothing; typing starts only the save debounce, which ends', () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const interval = vi.spyOn(window, 'setInterval');
    const { container } = render(
      <>
        {[0, 1, 2, 3, 4].map((i) => (
          <SlateDay key={i} data={data} date={DAY} notes={localNotesStore()} />
        ))}
      </>,
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    fireEvent.change(container.querySelector('textarea')!, { target: { value: 'x' } });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(SAVE_DELAY_MS));
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.parse(localStorage.getItem(NOTES_KEY)!)[GAMES[0]!.gameId].pre).toBe('x');
    fetchSpy.mockRestore();
    raf.mockRestore();
    interval.mockRestore();
  });
});
