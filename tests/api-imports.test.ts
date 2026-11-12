// Vercel runs each api/*.ts as plain Node ESM, file by file (no bundler): a relative import without its extension
// ("../src/data/odds") throws ERR_MODULE_NOT_FOUND when the function loads, and every request answers 500
// FUNCTION_INVOCATION_FAILED (it happened once). Every relative import in api/ and in the files it pulls in must
// name its file as ".js" (TypeScript maps it to the .ts source) and that source must exist.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const specifiers = (file: string) => [...readFileSync(file, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('api/ functions load as plain Node ESM', () => {
  const seen = new Set<string>();
  const walk = (file: string): string[] => {
    if (seen.has(file)) return [];
    seen.add(file);
    return specifiers(file)
      .filter((s) => s.startsWith('.'))
      .flatMap((s) => {
        const target = resolve(dirname(file), s.replace(/\.js$/, '.ts'));
        const bad = !s.endsWith('.js') || !existsSync(target) ? [`${file}: '${s}'`] : [];
        return [...bad, ...(existsSync(target) ? walk(target) : [])];
      });
  };
  const files = readdirSync('api').filter((f) => f.endsWith('.ts')).map((f) => resolve(join('api', f)));

  it('every relative import names a .js file whose .ts source exists', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap(walk)).toEqual([]);
  });
});
