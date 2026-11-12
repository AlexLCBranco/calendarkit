// The Cup destination: Groups · Schedule · Simulator · History (desktop).

import { lazy, Suspense, useCallback, useEffect, useState, type RefObject } from 'react';
import { cupNights, cupStageLabel } from '../data/cupSchedule';
import { TEAM_BY_ID } from '../data/teams';
import { CUP_START, seasonDay, type CupState } from './calendarState';
import { capturePixelRatio, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import type { SimMode, SimPicks } from './CupSimulator';
import { DestinationFrame, SelectionCopyStage, useSelectionCopy, type DestinationApi, type DestinationProps } from './destination';
import { Segmented } from './Segmented';
import { SelectionBar } from './SelectionBar';
import type { SelectionKind } from './SelectionCapture';
import { TeamPicker } from './TeamPicker';

/** The Cup views, their own chunk, loaded (and worked out) only when the Cup is opened. */
const CupView = lazy(() => import('./CupView'));

export interface CupApi extends DestinationApi {
  /** The Cup's state, for the page's snapshot. */
  state: CupState;
  /** The parts of the Cup state that make a new page; whether the page is a team's (its team counts too). */
  pageKey(): unknown[];
  teamScoped: boolean;
  /** A change of night (By date) is a day step, not a new page. */
  night?: string;
  restore(cup: CupState): void;
}

export function CupDestination(p: DestinationProps & { initial?: Partial<CupState>; api: RefObject<CupApi | undefined> }) {
  const { active, data, size, now, today, timeZone, compact, state, root, onOpenGame, gameLink, slots, barEnd, selection, initial } = p;
  // Standings | Schedule, the schedule's League | Team, its team and night — never remembered: leaving the Cup resets
  // them, so it always opens on Groups (then League; no team until one is picked).
  const [cupView, setCupView] = useState<CupState>(() => (initial ? { ...CUP_START, ...initial } : CUP_START));
  useEffect(() => {
    if (!active) setCupView(CUP_START);
  }, [active]);
  // The simulator's picks and mode — kept while the page is open (leaving the Cup keeps them), never stored
  const [simPicks, setSimPicks] = useState<SimPicks>(() => new Map());
  const [simMode, setSimMode] = useState<SimMode>('quick');
  const onCupNight = useCallback((night: string) => setCupView((v) => (v.night === night ? v : { ...v, night })), []);
  const cupSchedule = active && cupView.tab === 'schedule';
  const cupSim = active && cupView.tab === 'simulator';
  const cupHist = active && cupView.tab === 'history';
  const cupTeam = cupSchedule && cupView.list === 'team';
  // the Cup Schedule's lists select like the League / Team List
  const selKind: SelectionKind | undefined = compact ? undefined : cupSchedule ? (cupTeam ? (cupView.teamId !== undefined ? 'team-list' : undefined) : 'league-list') : undefined;
  const selTeamId = cupTeam ? cupView.teamId ?? state.teamId : state.teamId;
  const [selCapture, copySelection] = useSelectionCopy(root, selection);
  useEffect(() => selection.clear(), [cupView.tab, cupView.list, cupView.by, cupView.teamId, cupView.night, selection]);
  useEffect(() => p.rendered());

  p.api.current = {
    state: cupView,
    pageKey: () => [cupView.tab, cupView.list, cupView.by, cupView.teamId, cupView.hs],
    teamScoped: cupView.list === 'team',
    night: cupView.night,
    restore: setCupView,
    lookingAt: () => {
      const night = cupSchedule && cupView.list === 'league' && cupView.by === 'date' ? cupView.night : undefined;
      return night ?? seasonDay(data, today);
    },
    label: () => {
      const ct = cupView.teamId !== undefined ? TEAM_BY_ID.get(cupView.teamId)?.tricode : undefined;
      return cupView.tab === 'standings' ? 'Cup · Groups' : cupView.tab === 'simulator' ? 'Cup · Simulator' : cupView.tab === 'history' ? `Cup · History${cupView.hs ? ` ${cupView.hs}` : ''}` : `Cup · Schedule · ${cupView.list === 'team' ? ct ?? 'Team' : cupView.by === 'date' ? 'By date' : 'By group'}`;
    },
    // The group cards under their heading, as on screen (the rules and wild-card panels stay out); the Schedule: the
    // night on show as the League List copies its day, or the team's Cup games with its header — as on screen (the
    // Schedule never scrolls, so the node on screen is the whole view)
    copy: (button) => {
      const node = root.current?.querySelector<HTMLElement>(cupHist ? '[data-testid="cup-history"]' : cupSim ? '[data-testid="cup-sim"]' : cupSchedule ? (cupTeam ? '[data-testid="cup-team"]' : '[data-testid="cup-league"] [data-testid="cup-copy"]') : '[data-testid="cup-grid"]');
      if (!node) return Promise.reject(new Error('the Cup standings are not on screen yet'));
      button.dataset.captured = `${node.offsetWidth}x${node.offsetHeight}@${capturePixelRatio(node.scrollWidth, node.scrollHeight, COPY_PIXEL_RATIO)}`;
      return copyElement(node, cupSchedule ? undefined : 1);
    },
    selKind,
  };

  if (!active) return null;
  const stage = cupStageLabel(cupNights(data), today);
  return (
    <DestinationFrame
      slots={slots}
      center={
        <>
          <Segmented label="Cup view" value={cupView.tab} options={[['standings', 'Groups'], ['schedule', 'Schedule'], ['simulator', 'Simulator'], ['history', 'History']]} onChange={(tab) => setCupView((v) => ({ ...v, tab }))} />
          {cupSchedule && <Segmented label="Cup list" value={cupView.list} options={[['league', 'League'], ['team', 'Team']]} onChange={(list) => setCupView((v) => ({ ...v, list }))} />}
          {cupSchedule && !cupTeam && <Segmented label="Cup layout" value={cupView.by} options={[['group', 'By group'], ['date', 'By date']]} onChange={(by) => setCupView((v) => ({ ...v, by }))} />}
          {cupTeam && <TeamPicker teamId={cupView.teamId} onChange={(teamId) => setCupView((v) => ({ ...v, teamId }))} />}
        </>
      }
      right={
        <>
          <span className="ck-sr" data-testid="cup-stage">
            {stage}
          </span>
          {barEnd(stage)}
        </>
      }
    >
      <Suspense fallback={<p className="ck-empty">Loading the Cup standings…</p>}>
        <CupView data={data} today={today} gameLink={gameLink} history={cupHist ? { season: cupView.hs, onSeason: (hs) => setCupView((v) => ({ ...v, hs })) } : undefined} sim={cupSim ? { picks: simPicks, onPicks: setSimPicks, mode: simMode, onMode: setSimMode } : undefined} schedule={cupSchedule ? { list: cupView.list, by: cupView.by, teamId: cupView.teamId, size, now, today, timeZone, onOpenGame, gameLink, onNight: onCupNight } : undefined} />
      </Suspense>
      {selKind && <SelectionBar store={selection} copy={copySelection} />}
      {selCapture && selKind && <SelectionCopyStage capture={selCapture} kind={selKind} list team={cupTeam} teamId={selTeamId} cup p={p} />}
    </DestinationFrame>
  );
}
