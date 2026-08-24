import type { ExecuteLoadRemainingDayForecast } from '@pressly/production-system/operations/queries/load-remaining-day-forecast/execute';
import {
  captureQueryOutcome,
  type CanonicalQueryOutcome,
} from './production-query-conformance.ts';

export type LoadRemainingDayForecastInput =
  Parameters<ExecuteLoadRemainingDayForecast>[0];

const uuid = (suffix: number, prefix = 77000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const remainingDayForecastConformanceIds = Object.freeze({
  business: '00000000-0000-4000-8000-000000000770',
  actor: uuid(1),
  shift: uuid(2),
  config: uuid(3),
  schedule: uuid(4),
  run: uuid(5),
  batch0: uuid(6),
  batch1: uuid(7),
  sortingStation: uuid(8),
  washingStation: uuid(9),
  dryingStation: uuid(10),
  foldingStation: uuid(11),
  washerA: uuid(12),
  washerB: uuid(13),
  dryer: uuid(14),
  activeA: uuid(101),
  activeB: uuid(102),
  ready: uuid(103),
  rejected: uuid(104),
  overtime: uuid(105),
  release: uuid(106),
  intake: uuid(107),
  finished: uuid(108),
  resolved: uuid(109),
  secondShift: uuid(202),
  secondConfig: uuid(203),
  secondSchedule: uuid(204),
  secondRun: uuid(205),
});

export const remainingDayForecastLocationId =
  'location-remaining-day-forecast-conformance';
export const remainingDayForecastInactiveLocationId =
  'location-remaining-day-forecast-conformance-inactive';
export const remainingDayForecastSiblingLocationId =
  'location-remaining-day-forecast-conformance-sibling';
export const remainingDayForecastAsOf = new Date('2026-03-08T15:00:00.000Z');

export type RemainingDayForecastFixture =
  | 'empty'
  | 'complete'
  | 'ready-without-run'
  | 'ambiguous-runs'
  | 'lifecycle-conflict'
  | 'demand-overflow';

// Permanent conformance for the current query.
// The characterized scenarios and explicit assertions remain the oracle.
export type RemainingDayForecastConformanceScenario = Readonly<{
  name: string;
  fixture: RemainingDayForecastFixture;
  request: LoadRemainingDayForecastInput;
}>;

const request = (
  serviceDay: string,
  locationId = remainingDayForecastLocationId,
): LoadRemainingDayForecastInput => ({ locationId, serviceDay });

export const remainingDayForecastConformanceScenarios: readonly RemainingDayForecastConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'a real leap day keeps its exact Gregorian service-day window',
      fixture: 'empty' as const,
      request: request('2024-02-29'),
    }),
    Object.freeze({
      name: 'spring-forward keeps the exact 23-hour local service day',
      fixture: 'empty' as const,
      request: request('2026-03-08'),
    }),
    Object.freeze({
      name: 'fall-back keeps the exact 25-hour local service day',
      fixture: 'empty' as const,
      request: request('2026-11-01'),
    }),
    Object.freeze({
      name: 'an impossible Gregorian date returns the exact validation failure',
      fixture: 'empty' as const,
      request: request('2026-02-30'),
    }),
    Object.freeze({
      name: 'a missing location returns the exact not-found failure',
      fixture: 'empty' as const,
      request: request('2026-03-08', 'missing-forecast-location'),
    }),
    Object.freeze({
      name: 'an inactive location remains indistinguishable from missing',
      fixture: 'empty' as const,
      request: request('2026-03-08', remainingDayForecastInactiveLocationId),
    }),
    Object.freeze({
      name: 'the complete graph partitions all four groups in exact order',
      fixture: 'complete' as const,
      request: request('2026-03-08'),
    }),
    Object.freeze({
      name: 'cross-location reads expose only the requested sibling scope',
      fixture: 'complete' as const,
      request: request('2026-03-08', remainingDayForecastSiblingLocationId),
    }),
    Object.freeze({
      name: 'ready work without an active run preserves no-active-run reasons',
      fixture: 'ready-without-run' as const,
      request: request('2026-03-08'),
    }),
    Object.freeze({
      name: 'multiple active runs preserve ambiguity and stable run ordering',
      fixture: 'ambiguous-runs' as const,
      request: request('2026-03-08'),
    }),
    Object.freeze({
      name: 'invalid persisted execution state returns the exact lifecycle conflict',
      fixture: 'lifecycle-conflict' as const,
      request: request('2026-03-08'),
    }),
    Object.freeze({
      name: 'the 501st base demand row returns the exact bounded-scope conflict',
      fixture: 'demand-overflow' as const,
      request: request('2026-03-08'),
    }),
  ]);

export type RemainingDayForecastTraceEvent =
  | Readonly<{ kind: 'clock' }>
  | Readonly<{
      kind: 'read';
      isolationLevel: string;
      accessMode: string;
      transactionReadOnly: string;
    }>;

export type RemainingDayForecastConformanceExecutor = Readonly<{
  execute: (input: LoadRemainingDayForecastInput) => Promise<unknown>;
  trace: () => readonly RemainingDayForecastTraceEvent[];
}>;

export type RemainingDayForecastConformanceObservation<State> = Readonly<{
  outcome: CanonicalQueryOutcome;
  state: Readonly<{
    before: State;
    after: State;
  }>;
  trace: readonly RemainingDayForecastTraceEvent[];
}>;

export const runRemainingDayForecastConformanceScenario = async <State>(input: {
  scenario: RemainingDayForecastConformanceScenario;
  reset: () => Promise<void>;
  seed: (fixture: RemainingDayForecastFixture) => Promise<void>;
  readState: () => Promise<State>;
  makeExecutor: (
    scenario: RemainingDayForecastConformanceScenario,
  ) => RemainingDayForecastConformanceExecutor;
}): Promise<RemainingDayForecastConformanceObservation<State>> => {
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
