// @vitest-environment jsdom
// Knockout venue markers, from data only — the Championship neutral at the feed's arena (Hinkle
// Fieldhouse for 2026: checked here against the feed, not assumed), a quarterfinal / semifinal hosted by the feed's home
// team once the feed has the teams and the arena, "venue TBD" before; on the Slate's knockout cards and the Cup schedule.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { knockoutVenue } from '../src/data/knockout';
import { SlateDay } from '../src/slate/SlateCard';
import CupSchedule from '../src/components/CupSchedule';
import { data } from './feed';
import { game, TEAM } from './synthetic';

afterEach(cleanup);
const final = data.games.find((g) => g.gameType === 'cup-final')!;
const qf = data.games.find((g) => g.isCupKnockout && /quarter/i.test(g.gameSubLabel ?? ''))!;

describe('knockoutVenue', () => {
  it('the Championship: neutral, at the feed\'s arena', () => {
    expect(final.arenaName).toBe('Hinkle Fieldhouse');
    expect(knockoutVenue(final)).toEqual({ kind: 'neutral', arena: 'Hinkle Fieldhouse', city: 'Indianapolis' });
  });
  it('a quarterfinal before the feed has its teams: venue TBD; with teams and an arena: the feed\'s home team hosts', () => {
    expect(knockoutVenue(qf)).toEqual({ kind: 'tbd' });
    const set = game({ date: '2026-12-04', utc: '2026-12-05T00:00:00Z', home: TEAM.BOS, away: TEAM.NYK, subtype: 'in-season-knockout', subLabel: 'Quarterfinal', raw: { arenaName: 'TD Garden', arenaCity: 'Boston' } });
    expect(knockoutVenue(set)).toEqual({ kind: 'host', teamId: TEAM.BOS });
  });
});

describe('where it shows', () => {
  it('the Slate on the Championship night: the NEUTRAL badge with the arena, no HOST tag; a quarterfinal night: venue TBD', () => {
    render(<SlateDay data={data} date={final.dateEt} timeZone="UTC" />);
    expect(screen.getByTestId('venue-neutral').textContent).toBe('Neutral · Hinkle Fieldhouse, Indianapolis');
    expect(screen.queryByTestId('venue-host')).toBeNull();
    cleanup();
    render(<SlateDay data={data} date={qf.dateEt} timeZone="UTC" />);
    expect(screen.getAllByTestId('venue-tbd').length).toBeGreaterThan(0);
  });
  it('the Cup schedule by date: the final\'s heading has the neutral badge, the arena (the city in its tooltip, so it fits its card)', () => {
    render(<CupSchedule data={data} list="league" by="date" size={{ width: 1920, height: 1000 }} now={Date.parse('2026-11-06T12:00:00Z')} today="2026-11-06" timeZone="UTC" />);
    const night = document.querySelector(`[data-testid="cup-night"][data-night="${final.dateEt}"]`)!;
    const badge = night.querySelector('.ck-cg-head [data-testid="venue-neutral"]')!;
    expect(badge.textContent).toBe('Neutral · Hinkle Fieldhouse');
    expect(badge.getAttribute('title')).toBe('Neutral court: neither team is at home (Hinkle Fieldhouse, Indianapolis)');
  });
});
