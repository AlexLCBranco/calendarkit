// Round 10: each test starts as a fresh page — the notes store is one per page (localNotesStore).
import { afterEach } from 'vitest';
import { resetLocalNotesStore } from '../src/slate/notes';

afterEach(() => resetLocalNotesStore());
