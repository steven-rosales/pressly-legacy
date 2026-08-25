import type { ExecuteLoadWorkspace } from '@pressly/production-system/operations/queries/load-workspace/execute';
import {
  captureQueryOutcome,
  type CanonicalQueryOutcome,
} from './production-query-conformance.ts';

export type LoadWorkspaceInput = Parameters<ExecuteLoadWorkspace>[0];

const uuid = (suffix: number): string =>
  `36000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const loadWorkspaceConformanceIds = Object.freeze({
  actor: uuid(1),
  configV1: uuid(2),
  configV2: uuid(3),
  sortingStation: uuid(4),
  washingStation: uuid(5),
  dryingStation: uuid(6),
  foldingStation: uuid(7),
  washerB: uuid(8),
  washerA: uuid(9),
  dryer: uuid(10),
  targetShift: uuid(20),
  targetSchedule: uuid(21),
  targetRun: uuid(22),
  batch: uuid(23),
  sorting: uuid(24),
  washing: uuid(25),
  drying: uuid(26),
  folding: uuid(27),
  scheduledOrder: uuid(30),
  eligibleOrder: uuid(31),
  expectedDemand: uuid(32),
  explicitShift: uuid(120),
  unknownShift: uuid(999),
  newerShift: uuid(102),
  olderShift: uuid(101),
  thirdShift: uuid(103),
  closedShift: uuid(104),
  endedShift: uuid(105),
  runShift: uuid(106),
  newerSchedule: uuid(202),
  olderSchedule: uuid(201),
  thirdSchedule: uuid(203),
  newerRun: uuid(302),
  olderRun: uuid(301),
  completedRun: uuid(306),
});

export const loadWorkspaceBusinessId = '00000000-0000-4000-8000-000000000100';
export const loadWorkspaceLocationId = 'location-load-workspace';
export const loadWorkspaceAsOf = new Date('2026-08-21T16:00:00.000Z');

export type LoadWorkspaceFixture =
  | 'explicit-shift'
  | 'precedence-started'
  | 'multiple-started'
  | 'precedence-accepted'
  | 'multiple-accepted'
  | 'single-future'
  | 'multiple-future-with-exclusions'
  | 'full-started'
  | 'full-accepted'
  | 'identity-conflict';

// Permanent conformance for the current query.
// The characterized scenarios and explicit assertions remain the oracle.
export type LoadWorkspaceConformanceScenario = Readonly<{
  name: string;
  fixture: LoadWorkspaceFixture;
  request: LoadWorkspaceInput;
}>;

const request = (shiftId?: string): LoadWorkspaceInput => ({
  locationId: loadWorkspaceLocationId,
  ...(shiftId === undefined ? {} : { shiftId }),
});

export const loadWorkspaceConformanceScenarios: readonly LoadWorkspaceConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'explicit known shift wins regardless of closed status',
      fixture: 'explicit-shift' as const,
      request: request(loadWorkspaceConformanceIds.explicitShift),
    }),
    Object.freeze({
      name: 'explicit unknown shift returns the exact not-found failure',
      fixture: 'explicit-shift' as const,
      request: request(loadWorkspaceConformanceIds.unknownShift),
    }),
    Object.freeze({
      name: 'one started run wins over accepted plans and future shifts',
      fixture: 'precedence-started' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'multiple started runs remain an ordered ambiguity',
      fixture: 'multiple-started' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'one accepted actionable plan wins over future shifts',
      fixture: 'precedence-accepted' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'multiple accepted plans remain an ordered ambiguity',
      fixture: 'multiple-accepted' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'one open future shift is selected without a plan',
      fixture: 'single-future' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'future ambiguity retains draft association and excludes closed ended and run shifts',
      fixture: 'multiple-future-with-exclusions' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'full started workspace preserves resources board demand and live projections',
      fixture: 'full-started' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'full accepted workspace preserves proposal and demand forecast',
      fixture: 'full-accepted' as const,
      request: request(),
    }),
    Object.freeze({
      name: 'stale live placement identity returns the exact conflict',
      fixture: 'identity-conflict' as const,
      request: request(),
    }),
  ]);

export type LoadWorkspaceTraceEvent =
  | Readonly<{ kind: 'clock' }>
  | Readonly<{
      kind: 'read';
      isolationLevel: string;
      accessMode: string;
      transactionReadOnly: string;
    }>;

export type LoadWorkspaceConformanceExecutor = Readonly<{
  execute: (input: LoadWorkspaceInput) => Promise<unknown>;
  trace: () => readonly LoadWorkspaceTraceEvent[];
}>;

export type LoadWorkspaceConformanceObservation<State> = Readonly<{
  outcome: CanonicalQueryOutcome;
  state: Readonly<{
    before: State;
    after: State;
  }>;
  trace: readonly LoadWorkspaceTraceEvent[];
}>;

export const runLoadWorkspaceConformanceScenario = async <State>(input: {
  scenario: LoadWorkspaceConformanceScenario;
  reset: () => Promise<void>;
  seed: (fixture: LoadWorkspaceFixture) => Promise<void>;
  readState: () => Promise<State>;
  makeExecutor: (
    scenario: LoadWorkspaceConformanceScenario,
  ) => LoadWorkspaceConformanceExecutor;
}): Promise<LoadWorkspaceConformanceObservation<State>> => {
  await input.reset();
  await input.seed(input.scenario.fixture);
  const before = await input.readState();

  const executor = input.makeExecutor(input.scenario);
  const outcome = await captureQueryOutcome(
    executor.execute,
    input.scenario.request,
  );
  const after = await input.readState();

  return Object.freeze({
    outcome,
    state: Object.freeze({ before, after }),
    trace: Object.freeze([...executor.trace()]),
  });
};
