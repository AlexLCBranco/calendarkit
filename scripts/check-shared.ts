// Checks that src/shared/nba-schedule/ is byte-identical to rotationkit's copy (the source; see its SOURCE.md).
// Compares git blob SHAs (a hash of the exact bytes): ours from HEAD (`git ls-tree`), rotationkit's from the GitHub
// API (`gh api …/contents`, needs `gh auth` with access to the private repo) at its default branch, or `--ref <ref>`.
// Without gh access it falls back to a local checkout (~/rotationkit-src, or --local <dir>): `git hash-object` there
// gives the id git would store (Windows checkouts have CRLF on disk, git stores LF).
// SOURCE.md is ours only. Exit 0 = identical, 1 = drift (listed), 2 = could not check.
// Usage: npm run check-shared [-- --ref <branch>] [-- --local <dir>]
// Not in CI: the repo's GITHUB_TOKEN can't read another private repo, and adding a secret needs Alex's OK.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SHARED_DIR = 'src/shared/nba-schedule';
export const REPO = 'AlexLCBranco/rotationkit';
/** Files that exist only in calendarkit's copy. */
export const OURS_ONLY = new Set(['SOURCE.md']);

/** Git's blob id of a file's bytes: sha1("blob <size>\0" + bytes). */
export const blobSha = (bytes: Buffer) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

/** Differences between our files and theirs (name → blob sha), ignoring OURS_ONLY. Empty = identical. */
export function compareTrees(ours: Map<string, string>, theirs: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [name, sha] of ours) {
    if (OURS_ONLY.has(name)) continue;
    if (!theirs.has(name)) out.push(`${name}: only in calendarkit`);
    else if (theirs.get(name) !== sha) out.push(`${name}: differs (calendarkit ${sha.slice(0, 7)}, rotationkit ${theirs.get(name)!.slice(0, 7)})`);
  }
  for (const name of theirs.keys()) if (!ours.has(name)) out.push(`${name}: only in rotationkit (not copied)`);
  return out.sort();
}

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Our committed files (HEAD), and whether the working tree has uncommitted changes there. */
function oursAtHead(): { files: Map<string, string>; dirty: boolean } {
  const files = new Map<string, string>();
  for (const line of run('git', ['ls-tree', 'HEAD', `${SHARED_DIR}/`]).trim().split('\n')) {
    const [meta, path] = line.split('\t');
    const [, type, sha] = meta!.split(' ');
    if (type !== 'blob') throw new Error(`${path}: subfolders are not supported`);
    files.set(path!.slice(SHARED_DIR.length + 1), sha!);
  }
  const dirty = run('git', ['status', '--porcelain', '--', SHARED_DIR]).trim() !== '';
  return { files, dirty };
}

function theirsFromGitHub(ref?: string): { files: Map<string, string>; where: string } {
  const branch = ref ?? run('gh', ['api', `repos/${REPO}`, '--jq', '.default_branch']).trim();
  const commit = run('gh', ['api', `repos/${REPO}/commits/${encodeURIComponent(branch)}`, '--jq', '.sha']).trim();
  const list = JSON.parse(run('gh', ['api', `repos/${REPO}/contents/${SHARED_DIR}?ref=${commit}`])) as { name: string; sha: string; type: string }[];
  const files = new Map<string, string>();
  for (const f of list) {
    if (f.type !== 'file') throw new Error(`${f.name}: subfolders are not supported`);
    files.set(f.name, f.sha);
  }
  return { files, where: `${REPO}@${branch} (${commit.slice(0, 7)}) via GitHub` };
}

function theirsFromDisk(dir: string): { files: Map<string, string>; where: string } {
  const folder = join(dir, SHARED_DIR);
  const names = readdirSync(folder).filter((name) => statSync(join(folder, name)).isFile());
  let shas: string[];
  try {
    // git's own normalization (line endings) for that checkout
    shas = run('git', ['-C', folder, 'hash-object', ...names]).trim().split('\n');
  } catch {
    // not a git checkout: hash with CRLF → LF for text files (no NUL byte), like git's text=auto
    shas = names.map((name) => {
      const b = readFileSync(join(folder, name));
      return blobSha(b.includes(0) ? b : Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));
    });
  }
  const files = new Map(names.map((name, i) => [name, shas[i]!] as const));
  let rev = '';
  try {
    rev = ` (${run('git', ['-C', dir, 'rev-parse', '--short', 'HEAD']).trim()}, working tree)`;
  } catch {}
  return { files, where: `${folder}${rev} — local copy, may be behind GitHub` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const local = arg('--local');
  const ours = oursAtHead();
  let theirs: { files: Map<string, string>; where: string } | undefined;
  if (!local) {
    try {
      theirs = theirsFromGitHub(arg('--ref'));
    } catch (e) {
      console.warn(`GitHub not reachable with gh (${(e as Error).message.split('\n')[0]}); trying a local checkout.`);
    }
  }
  if (!theirs) {
    const dir = local ?? join(homedir(), 'rotationkit-src');
    if (!existsSync(join(dir, SHARED_DIR))) {
      console.error(`Could not check: no gh access to ${REPO} and no ${join(dir, SHARED_DIR)}.`);
      process.exit(2);
    }
    theirs = theirsFromDisk(dir);
  }
  const diff = compareTrees(ours.files, theirs.files);
  console.log(`calendarkit ${SHARED_DIR} (HEAD) vs ${theirs.where}`);
  if (ours.dirty) console.warn(`note: uncommitted changes in ${SHARED_DIR} are not part of the check (it compares HEAD).`);
  if (diff.length) {
    console.error(`DRIFT: ${diff.length} file(s) differ:\n  ${diff.join('\n  ')}\nRe-copy the folder from rotationkit unchanged and update SOURCE.md.`);
    process.exit(1);
  }
  console.log(`identical: ${[...ours.files.keys()].filter((n) => !OURS_ONLY.has(n)).length} files byte for byte.`);
}
