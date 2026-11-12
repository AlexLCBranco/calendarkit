// Each test starts as a fresh page — the notes store is one per page (localNotesStore), and the menu variant a test
// picked (localStorage) is forgotten.
import { afterEach } from 'vitest';
import { MENU_KEY } from '../src/components/Menu';
import { resetLocalNotesStore } from '../src/slate/notes';

afterEach(() => {
  resetLocalNotesStore();
  if (typeof localStorage !== 'undefined') localStorage.removeItem(MENU_KEY);
});
