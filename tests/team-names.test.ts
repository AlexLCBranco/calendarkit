import { describe, expect, it } from 'vitest';
import { TEAMS, TEAM_BY_ID } from '../src/data/teams';

describe('team table: short names', () => {
  it('shows "Wolves" and "Blazers", never the feed\'s long forms', () => {
    expect(TEAM_BY_ID.get(1610612750)!.name).toBe('Wolves');
    expect(TEAM_BY_ID.get(1610612757)!.name).toBe('Blazers');
    expect(TEAMS.map((t) => t.name).filter((n) => /Timberwolves|Trail Blazers/.test(n))).toEqual([]);
  });
  it('still has 30 teams with unique tricodes', () => {
    expect(TEAMS).toHaveLength(30);
    expect(new Set(TEAMS.map((t) => t.tricode)).size).toBe(30);
  });
});
