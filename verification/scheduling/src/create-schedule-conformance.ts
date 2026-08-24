import type { CreateScheduleCommand } from '@pressly/production-system/operations/scheduling/create-schedule/types';
import type { ScheduleProposal } from '@pressly/production-system/models/production-schedule';

export type CreateScheduleTransactionOutcome =
  | 'committed'
  | 'expected_rollback'
  | 'failed';

export type CreateScheduleFixture = Readonly<{
  shift?: 'expired' | 'missing' | 'open' | 'started';
  config?: 'missing' | 'present';
  selection?: 'empty' | 'invalid' | 'ready';
  current?: 'accepted' | 'draft' | null;
  storedReceipt?: 'divergent' | 'malformed' | 'matching_v1';
  fault?:
    | 'corrupt_persisted_output'
    | 'event_id_collision'
    | 'schedule_cas'
    | 'schedule_id_collision'
    | 'slow_event_append';
  secondLocation?: boolean;
  signalFault?: boolean;
}>;

export type CreateScheduleExecutionMode = 'concurrent' | 'sequential';

export type CreateScheduleScenario = Readonly<{
  name: string;
  fixture: CreateScheduleFixture;
  commands: readonly CreateScheduleCommand[];
  executionMode: CreateScheduleExecutionMode;
  betweenCommands?: 'replace_selection';
  separateExecutors?: boolean;
  expectedOutcomeCodes: readonly string[];
}>;

export type CanonicalCreateScheduleFailure = Readonly<{
  kind: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalCreateScheduleOutcome =
  | Readonly<{ kind: 'success'; value: ScheduleProposal }>
  | Readonly<{ kind: 'failure'; failure: CanonicalCreateScheduleFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalCreateScheduleFailure }>;

const uuid = (suffix: number, prefix = 82000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const createScheduleConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  shift: uuid(3),
  config: uuid(4),
  fulfillment: uuid(6),
  demand: uuid(7),
  productionOrder: uuid(8),
  secondFulfillment: uuid(10),
  secondDemand: uuid(11),
  secondProductionOrder: uuid(12),
  currentSchedule: uuid(13),
  scheduleA: uuid(14),
  eventA: uuid(15),
  scheduleB: uuid(16),
  eventB: uuid(17),
  collision: uuid(18),
  secondShift: uuid(19),
  secondConfig: uuid(20),
  secondSchedule: uuid(21),
  secondEvent: uuid(22),
  receiptEvent: uuid(23),
  otherFulfillment: uuid(25),
  otherDemand: uuid(26),
  otherProductionOrder: uuid(27),
  washingStation: uuid(28),
  dryingStation: uuid(29),
  washer: uuid(30),
  dryer: uuid(31),
  secondWashingStation: uuid(32),
  secondDryingStation: uuid(33),
  secondWasher: uuid(34),
  secondDryer: uuid(35),
});

export const createScheduleConformanceLocationId =
  'location-create-schedule-conformance';
export const createScheduleConformanceSecondLocationId =
  'location-create-schedule-conformance-second';
export const createScheduleConformanceNow = new Date(
  '2026-08-22T12:00:00.000Z',
);

export const makeCreateScheduleConformanceCommand = (
  overrides: Partial<CreateScheduleCommand> = {},
): CreateScheduleCommand => ({
  locationId: createScheduleConformanceLocationId,
  productionShiftId: createScheduleConformanceIds.shift,
  schedulerConfigId: createScheduleConformanceIds.config,
  idempotencyKey: 'create-schedule-conformance-1',
  actorId: createScheduleConformanceIds.actor,
  ...overrides,
});

const command = makeCreateScheduleConformanceCommand;

export const createScheduleConformanceScenarios: readonly CreateScheduleScenario[] =
  Object.freeze([
    {
      name: 'real canonical v2 algorithm persists the exact proposal snapshot event and revision',
      fixture: {},
      commands: [command()],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:fixed-pulse-ffd-v2'],
    },
    ...(['draft', 'accepted'] as const).map((current) => ({
      name: `a current ${current} plan is atomically superseded before the new draft and signals after commit`,
      fixture: { current },
      commands: [
        command({ idempotencyKey: `create-schedule-supersede-${current}` }),
      ],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: ['success:fixed-pulse-ffd-v2'] as const,
    })),
    {
      name: 'matching historical v1 receipt replays before locks clock and IDs',
      fixture: { storedReceipt: 'matching_v1' },
      commands: [command({ idempotencyKey: 'create-schedule-v1-replay' })],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:fixed-pulse-ffd-v1'],
    },
    ...(['malformed', 'divergent'] as const).map((storedReceipt) => ({
      name: `${storedReceipt} stored receipt diverges before the scheduling lock`,
      fixture: { storedReceipt },
      commands: [
        command({ idempotencyKey: `create-schedule-${storedReceipt}` }),
      ],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: [
        'failure:production_idempotency_conflict',
      ] as const,
    })),
    {
      name: 'changed selection with the same key replays the original schedule identity',
      fixture: {},
      commands: [
        command({ idempotencyKey: 'create-schedule-selection-replay' }),
        command({ idempotencyKey: 'create-schedule-selection-replay' }),
      ],
      executionMode: 'sequential',
      betweenCommands: 'replace_selection',
      expectedOutcomeCodes: [
        'success:fixed-pulse-ffd-v2',
        'success:fixed-pulse-ffd-v2',
      ],
    },
    ...(
      [
        {
          name: 'missing shift',
          fixture: { shift: 'missing' as const },
          code: 'production_shift_not_found',
        },
        {
          name: 'missing scheduler configuration',
          fixture: { config: 'missing' as const },
          code: 'scheduling_input_not_found',
        },
        {
          name: 'empty selection',
          fixture: { selection: 'empty' as const },
          code: 'schedule_selection_empty',
        },
        {
          name: 'selected order no longer ready',
          fixture: { selection: 'invalid' as const },
          code: 'schedule_selection_not_ready',
        },
        {
          name: 'shift already started',
          fixture: { shift: 'started' as const },
          code: 'production_shift_already_started',
        },
        {
          name: 'expired shift window',
          fixture: { shift: 'expired' as const },
          code: 'production_shift_expired',
        },
      ] as const
    ).map(({ name, fixture, code }) => ({
      name: `${name} preserves its exact expected failure`,
      fixture,
      commands: [command({ idempotencyKey: `create-schedule-${code}` })],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: [`failure:${code}`] as const,
    })),
    {
      name: 'same-key concurrent commands miss before lock then replay after lock',
      fixture: { fault: 'slow_event_append' },
      commands: [
        command({ idempotencyKey: 'create-schedule-same-key-race' }),
        command({ idempotencyKey: 'create-schedule-same-key-race' }),
      ],
      executionMode: 'concurrent',
      expectedOutcomeCodes: [
        'success:fixed-pulse-ffd-v2',
        'success:fixed-pulse-ffd-v2',
      ],
    },
    {
      name: 'same-key concurrent divergent commands conflict after the location lock',
      fixture: { fault: 'slow_event_append', secondLocation: true },
      commands: [
        command({ idempotencyKey: 'create-schedule-divergent-race' }),
        command({
          productionShiftId: createScheduleConformanceIds.secondShift,
          schedulerConfigId: createScheduleConformanceIds.secondConfig,
          idempotencyKey: 'create-schedule-divergent-race',
        }),
      ],
      executionMode: 'concurrent',
      expectedOutcomeCodes: [
        'failure:production_idempotency_conflict',
        'success:fixed-pulse-ffd-v2',
      ],
    },
    {
      name: 'different keys at one location serialize into one superseded and one current revision',
      fixture: { fault: 'slow_event_append' },
      commands: [
        command({ idempotencyKey: 'create-schedule-location-race-a' }),
        command({ idempotencyKey: 'create-schedule-location-race-b' }),
      ],
      executionMode: 'concurrent',
      expectedOutcomeCodes: [
        'success:fixed-pulse-ffd-v2',
        'success:fixed-pulse-ffd-v2',
      ],
    },
    {
      name: 'different locations and keys progress independently',
      fixture: { fault: 'slow_event_append', secondLocation: true },
      commands: [
        command({ idempotencyKey: 'create-schedule-cross-location-a' }),
        command({
          locationId: createScheduleConformanceSecondLocationId,
          productionShiftId: createScheduleConformanceIds.secondShift,
          schedulerConfigId: createScheduleConformanceIds.secondConfig,
          idempotencyKey: 'create-schedule-cross-location-b',
        }),
      ],
      executionMode: 'concurrent',
      separateExecutors: true,
      expectedOutcomeCodes: [
        'success:fixed-pulse-ffd-v2',
        'success:fixed-pulse-ffd-v2',
      ],
    },
    ...(
      [
        {
          name: 'late schedule CAS',
          fault: 'schedule_cas' as const,
          current: 'accepted' as const,
          code: 'failure:production_schedule_revision_version_conflict',
        },
        {
          name: 'generated schedule ID collision',
          fault: 'schedule_id_collision' as const,
          current: 'accepted' as const,
          code: 'unexpected:schedule_create_failed',
        },
        {
          name: 'late event ID collision',
          fault: 'event_id_collision' as const,
          current: 'accepted' as const,
          code: 'unexpected:schedule_create_failed',
        },
        {
          name: 'corrupt persisted output round trip',
          fault: 'corrupt_persisted_output' as const,
          current: 'accepted' as const,
          code: 'unexpected:production_schedule_output_plan_invalid',
        },
      ] as const
    ).map(({ name, fault, current, code }) => ({
      name: `${name} rolls supersession insert event and revision back together`,
      fixture: { fault, current },
      commands: [command({ idempotencyKey: `create-schedule-${fault}` })],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: [code] as const,
    })),
    {
      name: 'unknown post-commit plan-superseded signal fault is normalized after durable commit',
      fixture: { current: 'accepted', signalFault: true },
      commands: [command({ idempotencyKey: 'create-schedule-signal-fault' })],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['unexpected:schedule_create_failed'],
    },
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const canonicalFailure = (value: unknown): CanonicalCreateScheduleFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: typeof fields?.['kind'] === 'string' ? fields['kind'] : null,
    code:
      typeof fields?.['code'] === 'string' ? fields['code'] : 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : typeof fields?.['message'] === 'string'
          ? fields['message']
          : 'Unknown error.',
    safeMessage:
      typeof fields?.['safeMessage'] === 'string'
        ? fields['safeMessage']
        : null,
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

export const captureCreateScheduleOutcome = async (
  execute: (command: CreateScheduleCommand) => Promise<unknown>,
  input: CreateScheduleCommand,
): Promise<CanonicalCreateScheduleOutcome> => {
  try {
    const raw = await execute(input);
    const carrier = record(raw);
    if (carrier?.['kind'] === 'success' || carrier?.['tag'] === 'ok')
      return Object.freeze({
        kind: 'success',
        value: (carrier['value'] ?? carrier['value']) as ScheduleProposal,
      });
    if (carrier?.['kind'] === 'failure' || carrier?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['failure'] ?? carrier['error']),
      });
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(raw),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export const createScheduleOutcomeCode = (
  outcome: CanonicalCreateScheduleOutcome,
): string =>
  outcome.kind === 'success'
    ? `success:${outcome.value.algorithmVersion}`
    : outcome.kind === 'failure'
      ? `failure:${outcome.failure.code}`
      : `unexpected:${outcome.error.code}`;
