// The parser must run without Node APIs. Bundle parse.ts and execute it in a fresh JS realm
// that has only standard JavaScript globals (no process, require, Buffer, fetch, module).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import fixture from './fixture.json';
import { parseSchedule } from './parse';

const here = import.meta.dirname;

describe('parse.ts is browser-safe', () => {
  it('has no imports at all', () => {
    const src = readFileSync(join(here, 'parse.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\(|process\.|Buffer\b|node:/);
  });

  it('runs in a sandbox without Node globals and gives the same result', async () => {
    const out = await build({ entryPoints: [join(here, 'parse.ts')], bundle: true, write: false, format: 'iife', globalName: 'NbaSchedule', platform: 'neutral' });
    const code = out.outputFiles[0]!.text;
    const sandbox: Record<string, unknown> = { input: JSON.stringify(fixture) };
    const result = runInNewContext(`${code}; JSON.stringify([typeof process, typeof require, typeof Buffer, typeof fetch, NbaSchedule.parseSchedule(JSON.parse(input))])`, sandbox);
    const [p, r, b, f, parsed] = JSON.parse(result) as [string, string, string, string, unknown];
    expect([p, r, b, f]).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
    expect(parsed).toEqual(JSON.parse(JSON.stringify(parseSchedule(fixture))));
  });
});
