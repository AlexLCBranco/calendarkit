// The Slate's self-contained part: one day of NBA games as cards with a note box each — what calendarkit's
// League → Slate shows and the gauntlet's Slate widget puts on the whiteboard. Inputs: the schedule data
// (loadCalendarData), a date, a time zone and a notes store (localNotesStore by default); nothing from calendarkit's app
// shell. Styles: ./slate.css. docs/slate-in-gauntlet.md is the guide.

export { loadCalendarData } from '../data/load';
export type { CalendarData } from '../data/model';
export { SCHEDULE_DATA_URL } from '../data/address';
export { SlateCard, SlateCopy, SlateDay, slateGames, type SlateDayProps } from './SlateCard';
export { gameLinkUrl, hoopsjunkieLink, type GameLink } from './links';
export {
  createNotesStore,
  EMPTY_NOTE,
  localNotesStore,
  mergeNotes,
  NOTES_KEY,
  parseNotes,
  SAVE_DELAY_MS,
  SLOTS,
  type GameNote,
  type NotesMap,
  type NotesStore,
  type Slot,
  type SlateNotes,
} from './notes';
export { slateColumns, slateCopyColumns, slateImageSize, slateInfoColumns, slateNoteWidth, slatePixelRatio, SLATE_CARD_WIDTH, SLATE_COPY_GAP, SLATE_INFO_WIDTH, SLATE_NOTE_MIN } from './layout';
export { useTooltip } from './tooltip';
// The streak popup and the series popup, for a host that wants them on its cards
export { useStreakPopup } from './streakPopup';
export { useSeriesPopup } from './series';
export { createOddsStore, fmtOdds, liveOddsStore, oddsKey, ODDS_URL, type DayOdds, type GameOdds, type SlateOdds } from './odds';
