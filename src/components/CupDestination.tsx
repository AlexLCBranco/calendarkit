// The Cup destination: Groups · Schedule · Simulator · History (desktop).

import { lazy, Suspense, useCallback, useEffect, useState, type RefObject } from 'react';
import { cupNights, cupStageLabel } from '../data/cupSchedule';
import { TEAM_BY_ID } from '../data/teams';
import { CUP_START, seasonDay, type CupState } from './calendarState';
import { capturePixelRatio, copyElement, COPY_PIXEL_RATIO } from './copyAsImage';
import type { SimMode, SimPicks } from './CupSimulator';
import type { BracketPicks } from '../data/cupBracket';
import { DestinationFrame, SelectionCopyStage, useSelectionCopy, type DestinationApi, type DestinationProps } from './destination';
import { Segmented } from './Segmented';
import { SelectionBar } from './SelectionBar';
import type { SelectionKind } from './SelectionCapture';
import { AllTeamsButton, TeamPicker } from './TeamPicker';
import { Crumbs, PageRow } from './Header';
import type { Crumb } from './nav';
import { fullName } from './widget';
import { TEAMS } from '../data/teams';

/** The Cup views, their own chunk, loaded (and worked out) only when the Cup is opened. */
const CupView = lazy(() => import('./CupView'));
/** The simulator's "Tonight in the Cup" line, beside the How switch in the page rows (the Cup's chunk). */
const CupTonight = lazy(() => import('./CupTonight').then((m) => ({ default: m.CupTonight })));

export interface CupApi extends DestinationApi {
  /** The Cup's state, for the page's snapshot. */
  state: CupState;
  /** The parts of the Cup state that make a new page; whether the page is a team's (its team counts too). */
  pageKey(): unknown[];
  teamScoped: boolean;
  /** A change of night (By date) is a day step, not a new page. */
  night?: string;
  restore(cup: CupState): void;
  /** Another Cup page ("Go anywhere"): the patch over the Cup's state. */
  go(patch: Partial<CupState>): void;
}

const CUP_TABS: [CupState['tab'], string][] = [['standings', 'Groups'], ['schedule', 'Schedule'], ['simulator', 'Simulator'], ['history', 'History']];
/** The Cup's How, for the breadcrumb and "Go anywhere". */
export const cupTabs = CUP_TABS;
/** The past Cups (History), newest first: written out, so the shell doesn't load the History's data (its own chunk);
 * a unit test keeps it equal to cupHistory.json. */
export const CUP_SEASONS = [2025, 2024, 2023];
const TEAMS_BY_NAME = [...TEAMS].sort((a, b) => fullName(a).localeCompare(fullName(b)));

export function CupDestination(p: DestinationProps & { initial?: Partial<CupState>; api: RefObject<CupApi | undefined> }) {
  const { active, data, size, now, today, timeZone, compact, headRow, state, root, onOpenGame, gameLink, slots, selection, initial } = p;
  // Standings | Schedule, the schedule's League | Team, its team and night — never remembered: leaving the Cup resets
  // them, so it always opens on Groups (then League; no team until one is picked).
  const [cupView, setCupView] = useState<CupState>(() => (initial ? { ...CUP_START, ...initial } : CUP_START));
  useEffect(() => {
    if (!active) setCupView(CUP_START);
  }, [active]);
  // The simulator's picks and mode — kept while the page is open (leaving the Cup keeps them), never stored
  const [simPicks, setSimPicks] = useState<SimPicks>(() => new Map());
  const [simMode, setSimMode] = useState<SimMode>('quick');
  const [koPicks, setKoPicks] = useState<BracketPicks>(() => new Map());
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
    pageKey: () => [cupView.tab, cupView.list, cupView.by, cupView.teamId, cupView.hs, cupView.hv, cupView.focus],
    teamScoped: cupView.list === 'team',
    night: cupView.night,
    restore: setCupView,
    go: (patch) => setCupView((v) => ({ ...v, ...patch })),
    lookingAt: () => {
      const night = cupSchedule && cupView.list === 'league' && cupView.by === 'date' ? cupView.night : undefined;
      return night ?? seasonDay(data, today);
    },
    label: () => {
      const ct = cupView.teamId !== undefined ? TEAM_BY_ID.get(cupView.teamId)?.tricode : undefined;
      return cupView.tab === 'standings' ? 'Cup · Groups' : cupView.tab === 'simulator' ? 'Cup · Simulator' : cupView.tab === 'history' ? `Cup · History${cupView.hs ? ` ${cupView.hs}${cupView.hv === 'bracket' ? ' · Bracket' : ''}` : ''}` : `Cup · Schedule · ${cupView.list === 'team' ? ct ?? 'Team' : cupView.by === 'date' ? 'By date' : 'By group'}`;
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
      crumbs={<Crumbs parts={cupCrumbs(cupView, setCupView)} />}
      what={
        cupTeam ? (
          <PageRow label="What" className=" ck-prow-what">
            {/* All teams: the Cup schedule of every team (the League list) */}
            <AllTeamsButton on={false} onClick={() => setCupView((v) => ({ ...v, list: 'league' }))} />
            <TeamPicker teamId={cupView.teamId} onChange={(teamId) => setCupView((v) => ({ ...v, teamId }))} compact={compact} />
          </PageRow>
        ) : undefined
      }
      date={
        // a narrow window's page rows wrap around it; the header's row can't, so there it is the page's first line
        cupSim && !headRow ? (
          <Suspense fallback={null}>
            <CupTonight data={data} today={today} gameLink={gameLink} inline />
          </Suspense>
        ) : undefined
      }
      sub={
        <PageRow label="How">
          <Segmented label="Cup view" value={cupView.tab} options={CUP_TABS} onChange={(tab) => setCupView((v) => ({ ...v, tab, focus: undefined }))} />
          {cupSchedule && <Segmented label="Cup list" value={cupView.list} options={[['league', 'League'], ['team', 'Team']]} onChange={(list) => setCupView((v) => ({ ...v, list }))} />}
          {cupSchedule && !cupTeam && <Segmented label="Cup layout" value={cupView.by} options={[['group', 'By group'], ['date', 'By date']]} onChange={(by) => setCupView((v) => ({ ...v, by }))} />}
        </PageRow>
      }
      info={
        <span className="ck-info-cup">
          NBA Cup: <span data-testid="cup-stage">{stage}</span>
        </span>
      }
    >
      {cupSim && headRow && (
        <Suspense fallback={null}>
          <CupTonight data={data} today={today} gameLink={gameLink} />
        </Suspense>
      )}
      <Suspense fallback={<p className="ck-empty">Loading the Cup standings…</p>}>
        <CupView data={data} today={today} gameLink={gameLink} focus={cupView.focus} history={cupHist ? { season: cupView.hs, view: cupView.hv ?? 'groups', onSeason: (hs) => setCupView((v) => ({ ...v, hs, hv: hs ? v.hv : undefined })), onView: (view) => setCupView((v) => ({ ...v, hv: view === 'bracket' ? 'bracket' : undefined })) } : undefined} sim={cupSim ? { picks: simPicks, onPicks: setSimPicks, mode: simMode, onMode: setSimMode, bracket: koPicks, onBracket: setKoPicks } : undefined} schedule={cupSchedule ? { list: cupView.list, by: cupView.by, teamId: cupView.teamId, size, now, today, timeZone, onOpenGame, gameLink, onNight: onCupNight } : undefined} />
      </Suspense>
      {selKind && <SelectionBar store={selection} copy={copySelection} />}
      {selCapture && selKind && <SelectionCopyStage capture={selCapture} kind={selKind} list team={cupTeam} teamId={selTeamId} cup p={p} />}
    </DestinationFrame>
  );
}

/** The Cup's breadcrumb parts after "Cup": its view, then the schedule's list (and team) or the History's season. */
function cupCrumbs(v: CupState, set: (f: (v: CupState) => CupState) => void): Crumb[] {
  const go = (patch: Partial<CupState>) => () => set((x) => ({ ...x, ...patch }));
  const out: Crumb[] = [{ id: 'cup-view', label: CUP_TABS.find(([t]) => t === v.tab)![1], items: CUP_TABS.map(([t, label]) => ({ label, on: t === v.tab, go: go({ tab: t, focus: undefined }) })) }];
  if (v.tab === 'schedule') {
    out.push({ id: 'cup-list', label: v.list === 'team' ? 'Team' : v.by === 'date' ? 'By date' : 'By group', items: [
      { label: 'By group', on: v.list === 'league' && v.by === 'group', go: go({ list: 'league', by: 'group' }) },
      { label: 'By date', on: v.list === 'league' && v.by === 'date', go: go({ list: 'league', by: 'date' }) },
      { label: 'Team', on: v.list === 'team', go: go({ list: 'team' }) },
    ] });
    const t = v.list === 'team' && v.teamId !== undefined ? TEAMS.find((x) => x.id === v.teamId) : undefined;
    if (t) out.push({ id: 'cup-team', label: fullName(t), items: TEAMS_BY_NAME.map((x) => ({ label: fullName(x), on: x.id === t.id, go: go({ teamId: x.id }) })) });
  }
  if (v.tab === 'history') {
    out.push({ id: 'cup-season', label: v.hs ? String(v.hs) : 'Summary', items: [{ label: 'Summary', on: !v.hs, go: go({ hs: undefined, hv: undefined }) }, ...CUP_SEASONS.map((y) => ({ label: String(y), on: y === v.hs, go: go({ hs: y }) }))] });
    if (v.hs) out.push({ id: 'cup-hview', label: v.hv === 'bracket' ? 'Bracket' : 'Groups', items: [{ label: 'Groups', on: v.hv !== 'bracket', go: go({ hv: undefined }) }, { label: 'Bracket', on: v.hv === 'bracket', go: go({ hv: 'bracket' }) }] });
  }
  return out;
}
