// Shared-module drift check (scripts/check-shared.ts): blob ids equal git's, and the tree comparison reports every
// kind of drift (changed, missing, extra) while ignoring calendarkit's own SOURCE.md.

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { blobSha, compareTrees } from '../scripts/check-shared';

describe('check-shared', () => {
  it("blobSha of the stored bytes = git's blob id (the id GitHub reports for a file)", () => {
    for (const f of ['src/shared/nba-schedule/parse.ts', 'src/shared/nba-schedule/fixture.json']) {
      const stored = execFileSync('git', ['cat-file', 'blob', `HEAD:${f}`]);
      expect(blobSha(stored), f).toBe(execFileSync('git', ['rev-parse', `HEAD:${f}`], { encoding: 'utf8' }).trim());
    }
    expect(blobSha(Buffer.from(''))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'); // git's empty blob
  });

  it('identical trees (SOURCE.md is ours only): no differences', () => {
    const theirs = new Map([['parse.ts', 'a'], ['node.ts', 'b']]);
    expect(compareTrees(new Map([...theirs, ['SOURCE.md', 'z']]), theirs)).toEqual([]);
  });

  it('reports a changed byte, a file missing on either side', () => {
    const ours = new Map([['parse.ts', 'aaaaaaaa1'], ['node.ts', 'b'], ['extra.ts', 'c']]);
    const theirs = new Map([['parse.ts', 'aaaaaaaa2'], ['node.ts', 'b'], ['new.ts', 'd']]);
    expect(compareTrees(ours, theirs)).toEqual([
      'extra.ts: only in calendarkit',
      'new.ts: only in rotationkit (not copied)',
      'parse.ts: differs (calendarkit aaaaaaa, rotationkit aaaaaaa)',
    ]);
  });
});
