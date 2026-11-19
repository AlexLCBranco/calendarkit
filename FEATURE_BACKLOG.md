# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-20 — "NBA Cup" tag without the group outside the Cup section
**What:** everywhere outside the Cup section (League and Team schedules, lists, calendars, Slate, copies, the gauntlet Slate widget), a Cup game's tag reads just "NBA Cup", not "NBA Cup · West Group A". Inside the Cup section nothing changes: it keeps showing the group exactly as today ("West A", "Group play · West A", knockout round names).
**Tests:** unit for the label function per context; e2e: a Cup game shows "NBA Cup" in the League list and Slate, and the group in the Cup schedule.

