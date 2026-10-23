// Team logos: 30 local SVG files, every feed team maps to one, served from /logos (never the NBA CDN).

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEAMS, teamLogo } from '../src/data/teams';
import { data } from './feed';

const dir = join(import.meta.dirname, '..', 'public', 'logos');

describe('team logos', () => {
  it('30 files, one per team, valid SVG with no external references', () => {
    expect(readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()).toEqual(TEAMS.map((t) => `${t.tricode}.svg`).sort());
    for (const t of TEAMS) {
      const svg = readFileSync(join(dir, `${t.tricode}.svg`), 'utf8');
      expect(svg, t.tricode).toMatch(/<svg[\s>]/);
      expect(svg, t.tricode).toMatch(/viewBox=/);
      expect(svg, t.tricode).not.toMatch(/<script|href="https?:/);
    }
  });

  it('every team in the feed maps to an existing local logo; undecided teams map to none', () => {
    const ids = new Set(data.games.flatMap((g) => [g.homeTeam.teamId, g.awayTeam.teamId]).filter(Boolean));
    expect(ids.size).toBe(30);
    for (const id of ids) {
      const src = teamLogo(id);
      expect(src, String(id)).toMatch(/^\/logos\/[A-Z]{3}\.svg$/);
      expect(existsSync(join(dir, src!.slice('/logos/'.length))), src).toBe(true);
    }
    expect(teamLogo(0)).toBeUndefined();
  });

  it('app code never points at the NBA logo CDN', () => {
    const files = ['src/data/teams.ts', 'src/components/CalendarView.tsx', 'src/components/GameCard.tsx'];
    for (const f of files) expect(readFileSync(join(import.meta.dirname, '..', f), 'utf8'), f).not.toMatch(/cdn\.nba\.com\/logos/);
  });
});
