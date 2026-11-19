// @vitest-environment jsdom
// CK-15: the Slate card's game button and its links; the team injury links.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { gameLinks, injuryUrl, NBA_INJURY_REPORT_URL, PLAYER_PROPS_URL, useGameLinksPopup } from '../src/slate/gameLinks';
import { SlateCopy, SlateDay } from '../src/slate/SlateCard';
import { TEAMS } from '../src/data/teams';
import type { CalendarData } from '../src/data/model';
import { data } from './feed';

afterEach(cleanup);

describe('ESPN injury pages', () => {
  it('all 30 built and well-formed, all different', () => {
    const urls = TEAMS.map((t) => injuryUrl(t.id));
    for (const [i, u] of urls.entries()) expect(u, TEAMS[i]!.tricode).toMatch(/^https:\/\/www\.espn\.com\/nba\/team\/injuries\/_\/name\/[a-z]{2,4}\/[a-z0-9]+(-[a-z0-9]+)+$/);
    expect(new Set(urls).size).toBe(30);
    expect(injuryUrl(1610612744)).toBe('https://www.espn.com/nba/team/injuries/_/name/gs/golden-state-warriors');
    expect(injuryUrl(0)).toBeUndefined();
  });
  it('a game: props, away injuries, home injuries, the official report', () => {
    expect(gameLinks(1610612738, 1610612743).map((l) => l.label)).toEqual(['Player props', 'BOS injuries', 'DEN injuries', 'Official NBA injury report']);
    expect(gameLinks(1610612738, 1610612743)[0]!.url).toBe(PLAYER_PROPS_URL);
    expect(NBA_INJURY_REPORT_URL).toMatch(/^https:\/\/official\.nba\.com\/nba-injury-report/);
  });
});

function Host({ data, date }: { data: CalendarData; date: string }) {
  const pop = useGameLinksPopup(data);
  return (
    <div {...pop.handlers}>
      <SlateDay data={data} date={date} width={1840} timeZone="UTC" gameMenu />
      {pop.node}
    </div>
  );
}

describe('the button', () => {
  const date = [...data.byDate.keys()].sort()[12]!;
  it('one per card, in the away row; it opens the 4 links', () => {
    render(<Host data={data} date={date} />);
    const buttons = screen.getAllByTestId('game-menu');
    expect(buttons).toHaveLength(document.querySelectorAll('.ck-slate-card').length);
    for (const b of buttons) expect(b.closest('.ck-slate-row')!.getAttribute('data-side')).toBe('away');
    fireEvent.mouseOver(buttons[0]!);
    const links = [...screen.getByTestId('game-links-popup').querySelectorAll('a')];
    expect(links).toHaveLength(4);
    for (const a of links) expect(a.getAttribute('target')).toBe('_blank');
  });
  it('never in a copy, and not without gameMenu', () => {
    render(<SlateCopy data={data} games={data.byDate.get(date)!} cols={2} cardWidth={500} timeZone="UTC" />);
    expect(screen.queryAllByTestId('game-menu')).toHaveLength(0);
    cleanup();
    render(<SlateDay data={data} date={date} width={1840} timeZone="UTC" />);
    expect(screen.queryAllByTestId('game-menu')).toHaveLength(0);
  });
});
