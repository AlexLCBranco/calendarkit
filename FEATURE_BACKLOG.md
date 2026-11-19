# Feature backlog — calendarkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are CK-1, CK-2, ... (never reused; CK is this repo's prefix, unique across the owner's repos).

## Ready

### CK-11 — Slate: notes switch always available, never over the odds
**What:** the button that shows/hides the game descriptions (notes) on the Slate is always visible (not only on hover or in some states) and never sits on top of the odds column.
**Tests:** e2e: button visible with notes on and off; its box doesn't overlap any odds cell.
**Blocked:** which button is meant? calendarkit's own one ("Show notes" / "Hide all notes" in the toolbar above the cards on /slate) is already always visible and far from the odds. The one that shows only in some states is the gauntlet's: its date bar (`DateBar` / `toggleSlateNotes` in gauntlet `src/slate/SlateWidget.tsx`) appears only while the widget is selected, so it belongs in the gauntlet's backlog. (Also seen: in the gauntlet's live copy each card's ⇄ switch shows only while a note is being typed in, and the room kept for it, `SLATE_COPY_HEAD` 56 px, fits the PRE/LIVE/POST label only, so the ⇄ then covers the odds. If that is the one meant, say so and it is a calendarkit fix.)
