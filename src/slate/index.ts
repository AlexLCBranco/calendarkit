// The Slate's self-contained part: one day of NBA games as cards with a note box each — what calendarkit's
// League → Slate shows and the gauntlet's Slate widget puts on the whiteboard. Inputs: the schedule data
// (loadCalendarData), a date, a time zone and a notes store (localNotesStore by default); nothing from calendarkit's app
// shell. Styles: ./slate.css. docs/slate-in-gauntlet.md is the guide.

export { calendarDataFromRaw, loadCalendarData, refreshCalendarData, SCHEDULE_CHECK_MS } from '../data/load';
export type { CalendarData } from '../data/model';
export { SCHEDULE_DATA_URL } from '../data/address';
export { SlateCard, SlateCopy, SlateDay, slateGames, type SlateDayProps } from './SlateCard';
export { gameLinkUrl, hoopsjunkieLink, type GameLink } from './links';
// "SLATE · 18-11 · NBA" — the header line's text; a combined Slate passes every sport ("NBA + Football")
export { slateHeaderLabel } from './header';
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
export { slateColumns, slateCopyCardWidth, slateCopyColumns, slateImageSize, slateInfoColumns, slateNoteWidth, slatePixelRatio, SLATE_CARD_WIDTH, SLATE_COPY_GAP, SLATE_COPY_MARGIN, SLATE_INFO_WIDTH, SLATE_NOTE_MIN } from './layout';
export { useTooltip, type StripGame, type StripGames } from './tooltip';
// The day strips' matchups for useTooltip (opponent, vs / @, its page), as CalendarView gives them
export { stripGamesOf } from './stripGames';
// Team links: a host provides TeamLinkContext (calendarkit's CalendarView; the gauntlet's widget with teamCalendarUrl)
export { TeamLinkContext, teamLinkTarget, teamCalendarUrl, type TeamLinks } from './teamLink';
// The streak popup and the series popup, for a host that wants them on its cards
export { useStreakPopup } from './streakPopup';
export { useSeriesPopup } from './series';
// A card's game button (SlateDay gameMenu) and its pop-up: player props, the teams' ESPN injury pages, the official report
export { gameLinks, injuryUrl, useGameLinksPopup } from './gameLinks';
export { createOddsStore, fmtOdds, liveOddsStore, oddsKey, ODDS_URL, withFinal, withFinals, type DayOdds, type GameFinal, type GameOdds, type SlateOdds } from './odds';
