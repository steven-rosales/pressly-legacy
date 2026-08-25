import type {
  StartScheduleCommand,
  StartScheduleResult,
} from '@pressly/production-system/operations/scheduling/start-schedule/types';

export type StartScheduleTransactionOutcome =
  | 'committed'
  | 'expected_rollback'
  | 'failed';

export type StartScheduleFixture = Readonly<{
  schedule?: 'accepted' | 'draft' | 'missing';
  window?: 'ready' | 'not_started' | 'expired';
  snapshot?:
    | 'ready'
    | 'version_stale'
    | 'selection_stale'
    | 'coverage_stale'
    | 'execution_scheduled';
  batches?: 'ready' | 'empty';
  existingRun?: boolean;
  acceptedBy?: string | null;
  storedReceipt?: 'matching' | 'divergent' | 'malformed';
  corruptSchedule?: 'input' | 'output' | 'warning_codes';
  fault?:
    | 'late_order_cas'
    | 'missing_station'
    | 'receipt_id_collision'
    | 'slow_receipt';
  signalFault?: boolean;
}>;

export type StartScheduleExecutionMode = 'concurrent' | 'sequential';

export type StartScheduleScenario = Readonly<{
  name: string;
  fixture: StartScheduleFixture;
  commands: readonly StartScheduleCommand[];
  executionMode: StartScheduleExecutionMode;
  separateExecutors?: boolean;
  expectedOutcomeCodes: readonly string[];
  expectedClockReads: number;
  expectedSignalCount: number;
  expectedIssuedIdCount: number;
}>;

export type CanonicalStartScheduleFailure = Readonly<{
  kind: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalStartScheduleOutcome =
  | Readonly<{ kind: 'success'; value: StartScheduleResult }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalStartScheduleFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalStartScheduleFailure;
    }>;

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const failure = (value: unknown): CanonicalStartScheduleFailure => {
  const candidate = record(value);
  return Object.freeze({
    kind: typeof candidate?.['kind'] === 'string' ? candidate['kind'] : null,
    code:
      typeof candidate?.['code'] === 'string'
        ? candidate['code']
        : 'unknown_error',
    message:
      typeof candidate?.['message'] === 'string'
        ? candidate['message']
        : 'Unknown error.',
    safeMessage:
      typeof candidate?.['safeMessage'] === 'string'
        ? candidate['safeMessage']
        : null,
    status:
      typeof candidate?.['status'] === 'number' ? candidate['status'] : null,
  });
};

export const captureStartScheduleOutcome = async (
  execute: (command: StartScheduleCommand) => Promise<unknown>,
  command: StartScheduleCommand,
): Promise<CanonicalStartScheduleOutcome> => {
  try {
    const outcome = record(await execute(command));
    if (outcome?.['tag'] === 'ok' || outcome?.['kind'] === 'success')
      return {
        kind: 'success',
        value: (outcome['value'] ?? {}) as StartScheduleResult,
      };
    if (outcome?.['tag'] === 'err' || outcome?.['kind'] === 'failure')
      return {
        kind: 'failure',
        failure: failure(outcome['error'] ?? outcome['failure']),
      };
    return { kind: 'unexpected', error: failure(outcome) };
  } catch (error) {
    return { kind: 'unexpected', error: failure(error) };
  }
};

const uuid = (suffix: number, prefix = 86000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const startScheduleConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  otherActor: uuid(3),
  shift: uuid(4),
  config: uuid(5),
  schedule: uuid(6),
  fulfillmentA: uuid(11),
  demandA: uuid(12),
  orderA: uuid(13),
  fulfillmentB: uuid(21),
  demandB: uuid(22),
  orderB: uuid(23),
  sortingStation: uuid(30),
  washingStation: uuid(31),
  dryingStation: uuid(32),
  foldingStation: uuid(33),
  washer: uuid(34),
  dryer: uuid(35),
  existingRun: uuid(40),
  receiptEvent: uuid(41),
});

export const startScheduleConformanceLocationId =
  'location-start-schedule-conformance';
export const startScheduleConformanceOtherLocationId =
  'location-start-schedule-other';
export const startScheduleConformanceNow = new Date('2026-08-22T15:00:00.000Z');
export const startScheduleConformanceOutputHash = 'b'.repeat(64);
export const startScheduleConformanceInputHash = 'a'.repeat(64);
export const startScheduleConformanceGeneratedIds = Object.freeze(
  Array.from({ length: 30 }, (_, index) => uuid(index + 1, 87000000)),
);

export const makeStartScheduleConformanceCommand = (
  overrides: Partial<StartScheduleCommand> = {},
): StartScheduleCommand => ({
  locationId: startScheduleConformanceLocationId,
  scheduleRunId: startScheduleConformanceIds.schedule,
  expectedOutputPlanHash: startScheduleConformanceOutputHash,
  idempotencyKey: 'start-schedule-conformance-1',
  actorId: startScheduleConformanceIds.actor,
  ...overrides,
});

const command = makeStartScheduleConformanceCommand;

const expectedFailure = (
  name: string,
  fixture: StartScheduleFixture,
  code: string,
  overrides: Partial<StartScheduleCommand> = {},
  clockReads = 0,
): StartScheduleScenario => ({
  name,
  fixture,
  commands: [
    command({ idempotencyKey: `start-conformance-${code}`, ...overrides }),
  ],
  executionMode: 'sequential',
  expectedOutcomeCodes: [`failure:${code}`],
  expectedClockReads: clockReads,
  expectedSignalCount: 0,
  expectedIssuedIdCount: 0,
});

const expectedUnexpected = (
  name: string,
  fixture: StartScheduleFixture,
  code: string,
  issuedIds = 0,
): StartScheduleScenario => ({
  name,
  fixture,
  commands: [command({ idempotencyKey: `start-conformance-${code}` })],
  executionMode: 'sequential',
  expectedOutcomeCodes: [`unexpected:${code}`],
  expectedClockReads: fixture.corruptSchedule === undefined ? 1 : 0,
  expectedSignalCount: fixture.signalFault === true ? 1 : 0,
  expectedIssuedIdCount: issuedIds,
});

export const startScheduleConformanceScenarios: readonly StartScheduleScenario[] =
  Object.freeze([
    {
      name: 'materializes the complete ordered run batch stage assignment attempt receipt and revision graph',
      fixture: {},
      commands: [command()],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:fresh'],
      expectedClockReads: 1,
      expectedSignalCount: 1,
      expectedIssuedIdCount: 24,
    },
    {
      name: 'preserves the accepted schedule actor as overtime acknowledgement owner',
      fixture: { acceptedBy: startScheduleConformanceIds.otherActor },
      commands: [
        command({
          actorId: startScheduleConformanceIds.actor,
          idempotencyKey: 'start-overtime-owner-fallback',
        }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:fresh'],
      expectedClockReads: 1,
      expectedSignalCount: 1,
      expectedIssuedIdCount: 24,
    },
    {
      name: 'fresh start replays exactly and divergent same-key reuse conflicts before another clock or ID',
      fixture: {},
      commands: [
        command({ idempotencyKey: 'start-sequence' }),
        command({ idempotencyKey: 'start-sequence' }),
        command({
          idempotencyKey: 'start-sequence',
          actorId: startScheduleConformanceIds.otherActor,
        }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: [
        'success:fresh',
        'success:replay',
        'failure:production_idempotency_conflict',
      ],
      expectedClockReads: 1,
      expectedSignalCount: 1,
      expectedIssuedIdCount: 24,
    },
    {
      name: 'matching stored receipt replays before locks clock IDs and graph materialization',
      fixture: { storedReceipt: 'matching' },
      commands: [command({ idempotencyKey: 'start-stored-receipt' })],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:replay'],
      expectedClockReads: 0,
      expectedSignalCount: 0,
      expectedIssuedIdCount: 0,
    },
    ...(['divergent', 'malformed'] as const).map(
      (storedReceipt): StartScheduleScenario => ({
        name: `${storedReceipt} stored receipt conflicts before locks clock and IDs`,
        fixture: { storedReceipt },
        commands: [command({ idempotencyKey: 'start-stored-receipt' })],
        executionMode: 'sequential',
        expectedOutcomeCodes: ['failure:production_idempotency_conflict'],
        expectedClockReads: 0,
        expectedSignalCount: 0,
        expectedIssuedIdCount: 0,
      }),
    ),
    expectedFailure(
      'missing schedule is concealed as the exact not-found failure',
      { schedule: 'missing' },
      'schedule_not_found',
    ),
    expectedFailure(
      'cross-location schedule is concealed as the same not-found failure',
      {},
      'schedule_not_found',
      { locationId: startScheduleConformanceOtherLocationId },
    ),
    expectedFailure(
      'output-plan hash mismatch precedes shift lock and clock',
      {},
      'schedule_hash_mismatch',
      { expectedOutputPlanHash: 'e'.repeat(64) },
    ),
    expectedFailure(
      'shift start boundary rejects an early command after one clock read',
      { window: 'not_started' },
      'production_shift_not_started',
      {},
      1,
    ),
    expectedFailure(
      'shift end boundary rejects an expired command after one clock read',
      { window: 'expired' },
      'production_shift_expired',
      {},
      1,
    ),
    expectedFailure(
      'non-accepted schedule preserves the schedule lifecycle failure',
      { schedule: 'draft' },
      'schedule_not_accepted',
      {},
      1,
    ),
    ...(
      [
        ['version_stale', 'schedule_input_snapshot_stale'],
        ['selection_stale', 'schedule_input_snapshot_stale'],
        ['coverage_stale', 'schedule_input_snapshot_stale'],
        ['execution_scheduled', 'production_order_execution_event_not_allowed'],
      ] as const
    ).map(([snapshot, code]) =>
      expectedFailure(
        `${snapshot} selected work rolls back with ${code}`,
        { snapshot },
        code,
        {},
        1,
      ),
    ),
    expectedFailure(
      'an accepted empty plan cannot start',
      { batches: 'empty' },
      'schedule_has_no_batches',
      {},
      1,
    ),
    expectedFailure(
      'an existing production run prevents a second graph',
      { existingRun: true },
      'production_run_already_exists',
      {},
      1,
    ),
    expectedFailure(
      'late second-order CAS miss rolls back the earlier order update',
      { fault: 'late_order_cas' },
      'production_schedule_start_order_version_conflict',
      {},
      1,
    ),
    expectedUnexpected(
      'missing required station rolls back orders and every partial graph row',
      { fault: 'missing_station' },
      'production_schedule_start_station_missing',
      7,
    ),
    expectedUnexpected(
      'late receipt ID collision rolls back the complete graph and order transitions',
      { fault: 'receipt_id_collision' },
      'production_run_start_failed',
      24,
    ),
    ...(
      [
        ['input', 'production_schedule_input_snapshot_invalid'],
        ['output', 'production_schedule_output_plan_invalid'],
        [
          'warning_codes',
          'production_schedule_acknowledged_warning_codes_invalid',
        ],
      ] as const
    ).map(([corruptSchedule, code]) =>
      expectedUnexpected(
        `private accepted-schedule loader rejects corrupt ${corruptSchedule}`,
        { corruptSchedule },
        code,
      ),
    ),
    expectedUnexpected(
      'post-commit signal failure preserves the committed graph and committed telemetry',
      { signalFault: true },
      'start_schedule_signal_failed',
      24,
    ),
    {
      name: 'same-key concurrent commands both miss first then the loser replays after the lock',
      fixture: { fault: 'slow_receipt' },
      commands: [
        command({ idempotencyKey: 'start-same-key-race' }),
        command({ idempotencyKey: 'start-same-key-race' }),
      ],
      executionMode: 'concurrent',
      separateExecutors: true,
      expectedOutcomeCodes: ['success:fresh', 'success:replay'],
      expectedClockReads: 1,
      expectedSignalCount: 1,
      expectedIssuedIdCount: 24,
    },
    {
      name: 'same-key divergent commands both miss first then conflict after the lock',
      fixture: { fault: 'slow_receipt' },
      commands: [
        command({ idempotencyKey: 'start-divergent-race' }),
        command({
          idempotencyKey: 'start-divergent-race',
          actorId: startScheduleConformanceIds.otherActor,
        }),
      ],
      executionMode: 'concurrent',
      separateExecutors: true,
      expectedOutcomeCodes: [
        'success:fresh',
        'failure:production_idempotency_conflict',
      ],
      expectedClockReads: 1,
      expectedSignalCount: 1,
      expectedIssuedIdCount: 24,
    },
    {
      name: 'different-key concurrent commands serialize to one graph and one stale-snapshot loser',
      fixture: { fault: 'slow_receipt' },
      commands: [
        command({ idempotencyKey: 'start-different-race-a' }),
        command({ idempotencyKey: 'start-different-race-b' }),
      ],
      executionMode: 'concurrent',
      separateExecutors: true,
      expectedOutcomeCodes: [
        'success:fresh',
        'failure:schedule_input_snapshot_stale',
      ],
      expectedClockReads: 2,
      expectedSignalCount: 1,
      expectedIssuedIdCount: 24,
    },
  ]);

export const startScheduleOutcomeCode = (
  outcome: CanonicalStartScheduleOutcome,
): string => {
  if (outcome.kind === 'success')
    return `success:${outcome.value.replayed ? 'replay' : 'fresh'}`;
  return `${outcome.kind}:${
    outcome.kind === 'failure' ? outcome.failure.code : outcome.error.code
  }`;
};
