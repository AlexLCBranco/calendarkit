# calendarkit — working rules for Claude

Read PROJECT.md first.

## Feature backlog (owner's standing workflow, added 2026-11-15)

The owner plans features in Claude chat, and the specs are written into `FEATURE_BACKLOG.md`. Most sessions will
start with a short message instead of a pasted prompt:
- "next batch" / "build the backlog": `git pull`, then implement every item under **Ready**, top to bottom.
- "next": only the top item under **Ready**.
- "build BK-n": only that item.

For each item: one branch/PR per item, following this file's other rules. Move the item to **Done** (with the PR
number and date) in that same PR. If an item is unclear or blocked, don't guess: leave it in **Ready** with a
`Blocked:` note saying what's missing, and continue with the next one. Don't add, rewrite or reorder **Ready**
items yourself; only move them and add notes. End with a short report: done / blocked / what the owner must test by
hand (only what couldn't be automated). A pasted prompt overrides this section.
