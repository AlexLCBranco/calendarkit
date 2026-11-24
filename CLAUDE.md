# calendarkit — working rules for Claude

Read PROJECT.md first.

## Vercel requests are a budget (owner's rule, 2026-11-24)

Vercel's free plan gives 1M CDN requests per rolling 30 days, shared by all the owner's projects; going over pauses
all of them. Every page, file, API call and prefetch on a `*.vercel.app` site (gauntlet-home.vercel.app included)
counts; local runs cost nothing.
- The full Playwright suite runs **locally** (against a local production build), never against the live site unless
  the owner asks for it.
- After a push, the live site gets only a **small smoke check**: CI's `live` job runs `npm run e2e:live -- <url>`
  (version + smoke specs, `LIVE_TESTS` in `scripts/e2e-live.ts`). The fuller live check (adds `move.spec.ts`) is
  `npm run e2e:live -- <url> --full`, run by hand only when the owner asks.
- Don't poll live URLs: check the live `/calendar/version.json` at most every 30 s (`scripts/wait-live.ts`), and stop
  once it shows the new version. Don't open live pages in a browser to look around when a local run shows the same.
- The odds refresh, the data-freshness workflow and the daily schedule update stay as they are.

## Feature backlog, built list and ideas (owner's standing workflow, updated 2026-11-15)

Three lists, never mixed:
- `FEATURE_BACKLOG.md`: planned work only. Nothing built is ever in it. It is the only list of planned work:
  "next", "queued" or "plan" sections in other docs are history, not the plan.
- `BUILT.md`: shipped work only, newest first.
- `IDEAS.md`: ideas the owner mentioned that are not planned (maybe later, maybe never). Never built from directly.

The owner's messages. Always read the lists from `main` on GitHub, never from your local checkout or branch
(Claude Code sessions run on a branch made at session start, so `git pull` there does NOT bring in backlog
items added later): run `git fetch origin main`, then read with `git show origin/main:FEATURE_BACKLOG.md`
(same for `BUILT.md` and `IDEAS.md`). Before building, merge `origin/main` into your branch.
- "build what's planned" / "build the backlog": build only the items under Ready in `FEATURE_BACKLOG.md` on
  `origin/main`. If there are none, say "Backlog is empty" and stop. Never build from `IDEAS.md`, `PLAN.md` or
  any other doc, and never fill gaps in a spec with your own defaults: ask.
- "what's planned" / "what's in the backlog": read `FEATURE_BACKLOG.md` only. List each item as
  `CK-n — title — one plain sentence on what changes in the app`. Build nothing.
- "what's built" / "what shipped" (maybe "since <date>" or "last N"): read `BUILT.md` only and list it.
- "ideas" / "what ideas": read `IDEAS.md` only and list it as `I-n — idea`.
- "next batch" / "build the backlog": every item, top to bottom. "next": the top item only. "build CK-n": that item only.
- "promote I-n": cut it from `IDEAS.md` and add it at the bottom of Ready in `FEATURE_BACKLOG.md` with the next free
  CK ID and a `From I-n` line. Build it only if the owner also asks for that.

Before building, list the IDs and titles you are about to build, in plain words.

When an item ships: in the same commit/PR as the code, cut it from `FEATURE_BACKLOG.md` and add it at the top of
`BUILT.md` under that day's `## <YYYY-MM-DD>` heading (one heading per day, newest first) as
`- CK-n — title (v<version>)`, then at most one plain sentence on what the owner sees. An item is never in both files. IDs are
never reused. Work shipped without a backlog item (a direct request, a fix) gets the same line without the ID:
`- title (v<version>)`. Housekeeping the owner can't see (handoff notes, pins, test-only or CI fixes, docs) goes under a
`### Internal` subheading at the bottom of that day, not in the main list. The same format is used in every one of
the owner's repos, so `gauntlet` can merge them into one `ALL_BUILT.md`.
Follow this file's other rules (branches, tests, version bump) as usual.

When the owner mentions something that isn't to be built now (an aside, "later", "someday", "maybe"), add it at the
bottom of `IDEAS.md` as `- I-n — the idea in plain words (YYYY-MM-DD)` and say so in the report. Never put an idea
in the backlog yourself.

If an item is unclear or blocked, don't guess: leave it in `FEATURE_BACKLOG.md` with a `Blocked:` note saying what's
missing, and continue with the next one. Don't add, rewrite or reorder backlog items yourself; only remove shipped
ones, add `Blocked:` notes and turn them into `**Unblocked**` lines (see "backlogkit formats"). End with a short report: built / blocked / ideas added / what the owner must test by
hand (only what couldn't be automated). Also save that report at the top of `REPORTS.md` (newest first: date, item IDs, the report text) in the same commit, so the owner's Claude chat can read it without a paste. A pasted prompt overrides this section.

Guard: `scripts/check-lists.mjs` runs with the checks (inside `npm run check-version`, in CI) and fails if an ID is both planned and built, an
ID repeats, or package.json's version has no `BUILT.md` entry. Fix the lists, never the check.

## backlogkit formats (owner's rule, 2026-11-19; same text in every repo)

backlogkit (the owner's site that shows every repo's lists) reads these lines; keep them exact.
- Specs: every item in `FEATURE_BACKLOG.md` has, as the first line under its `### ID — title` heading,
  `**In short:** <one plain sentence: what the owner will see change, no code words>`. If nothing visible changes,
  say so ("Nothing changes on screen: ...").
- Blocked: a `Blocked:` line means the item can't be built yet. "build the backlog", "next batch" and "next" skip
  blocked items (they stay where they are) until they are unblocked. There are two kinds (rule of 2026-11-24):
  - It waits only for other items: write it with no question, naming each item's repo and ID, like
    `Blocked: waits for footykit FK-76, calendarkit CK-34`. It unblocks itself: on "build the backlog", "next batch",
    "next" or "build <ID>", look each one up in that repo's `BUILT.md` on GitHub's `main`. When all have shipped,
    replace the line with `**Unblocked (YYYY-MM-DD):** footykit FK-76 shipped (v0.87.0)` (every item, with its
    version) and build the item in that same run; say so in the report. Otherwise it stays blocked.
  - It asks the owner something: write the question with a "?". It waits on the owner, even when every item named in
    it has shipped. An answer replaces the line with `**Answered (YYYY-MM-DD):** <the question> → <the answer>`; from
    then on the item is built normally.
  Every item an item needs first must be written by ID in its `Blocked:` line, also when the line is mainly a question
  to the owner: backlogkit's Stuck section and Build order page only see the IDs written there, and say when they
  have shipped.
- Ideas: every idea in `IDEAS.md` ends with one reason tag saying why it isn't planned: `[why: waiting]` waits on
  something (a data source, a key or account, another feature, an outside event; the idea's text says which),
  `[why: decision]` needs the owner to decide something, `[why: too-big]` needs splitting first, `[why: later]` not
  important yet, `[why: never]` probably never. Tag only from what the owner said; if he gave no reason, leave the tag
  off (backlogkit shows it under "No reason yet"). The owner can also set it from backlogkit.
