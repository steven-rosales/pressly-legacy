import type {
  UpdateShiftCommand,
  UpdateShiftResult,
} from '@pressly/production-system/operations/scheduling/update-shift/types';

export type UpdateShiftTransactionOutcome =
  | 'committed'
  | 'expected_rollback'
  | 'failed';

export type UpdateShiftFixture = Readonly<{
  shift: 'absent' | 'closed' | 'open' | 'open_version_2' | 'replayed_result';
  scheduleStatus?: 'accepted' | 'draft' | null;
  runExists?: boolean;
  storedReceipt?: 'divergent' | 'malformed' | 'matching';
  fault?: 'event_append' | 'schedule_cas' | 'shift_cas' | 'slow_event_append';
}>;

export type UpdateShiftExecutionMode = 'concurrent' | 'sequential';

export type UpdateShiftScenario = Readonly<{
  name: string;
  fixture: UpdateShiftFixture;
  executionMode: UpdateShiftExecutionMode;
  commands: readonly UpdateShiftCommand[];
  normalizeOutcomeOrder?: boolean;
  expectedOutcomeCodes: readonly string[];
  expectedTelemetry: readonly UpdateShiftTransactionOutcome[];
}>;

export type CanonicalUpdateShiftFailure = Readonly<{
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalUpdateShiftOutcome =
  | Readonly<{ kind: 'failure'; failure: CanonicalUpdateShiftFailure }>
  | Readonly<{ kind: 'success'; value: UpdateShiftResult }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalUpdateShiftFailure }>;

export type UpdateShiftRow = Readonly<{
  id: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  effectiveFolderCount: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type UpdateShiftScheduleRow = Readonly<{
  id: string;
  locationId: string;
  productionShiftId: string;
  status: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  supersededAt: string | null;
}>;

export type UpdateShiftRunRow = Readonly<{
  id: string;
  locationId: string;
  productionShiftId: string;
  scheduleRunId: string;
  status: string;
  version: number;
}>;

export type UpdateShiftAuditEvent = Readonly<{
  id: string;
  locationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: unknown;
}>;

export type UpdateShiftState = Readonly<{
  shifts: readonly UpdateShiftRow[];
  schedules: readonly UpdateShiftScheduleRow[];
  runs: readonly UpdateShiftRunRow[];
  workEvents: readonly UpdateShiftAuditEvent[];
  liveRevision: number;
}>;

export type UpdateShiftSignal = Readonly<{
  kind: 'plan_superseded';
  state: UpdateShiftState;
}>;

export type UpdateShiftObservation = Readonly<{
  outcomes: readonly CanonicalUpdateShiftOutcome[];
  stateDelta: Readonly<{
    before: UpdateShiftState;
    after: UpdateShiftState;
  }>;
  idempotencyReceipts: readonly unknown[];
  signals: readonly UpdateShiftSignal[];
  clockReads: number;
  issuedIds: readonly string[];
  transactionTelemetry: readonly UpdateShiftTransactionOutcome[];
}>;

export const updateShiftConformanceIds = Object.freeze({
  actor: '37000000-0000-4000-8000-000000000001',
  business: '37000000-0000-4000-8000-000000000002',
  shift: '37000000-0000-4000-8000-000000000003',
  config: '37000000-0000-4000-8000-000000000004',
  schedule: '37000000-0000-4000-8000-000000000005',
  run: '37000000-0000-4000-8000-000000000006',
  eventA: '37000000-0000-4000-8000-000000000007',
  eventB: '37000000-0000-4000-8000-000000000008',
  evidence: '37000000-0000-4000-8000-000000000009',
  collision: '37000000-0000-4000-8000-000000000010',
});

export const updateShiftConformanceLocationId =
  'location-update-shift-conformance';
export const updateShiftConformanceOtherLocationId =
  'location-update-shift-other';
export const updateShiftConformanceInitialTime = new Date(
  '2026-08-22T11:00:00.000Z',
);
export const updateShiftConformanceNow = new Date('2026-08-22T12:00:00.000Z');
export const updateShiftConformanceOriginalStart = new Date(
  '2026-08-22T13:00:00.000Z',
);
export const updateShiftConformanceOriginalEnd = new Date(
  '2026-08-22T21:00:00.000Z',
);

export const makeUpdateShiftConformanceCommand = (
  overrides: Partial<UpdateShiftCommand> = {},
): UpdateShiftCommand => ({
  locationId: updateShiftConformanceLocationId,
  productionShiftId: updateShiftConformanceIds.shift,
  startsAt: '2026-08-22T12:30:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  effectiveFolderCount: 4,
  expectedVersion: 1,
  actorId: updateShiftConformanceIds.actor,
  idempotencyKey: 'update-shift-conformance-1',
  ...overrides,
});

const command = makeUpdateShiftConformanceCommand;

export const updateShiftConformanceScenarios: readonly UpdateShiftScenario[] =
  Object.freeze([
    {
      name: 'material edit without a current plan commits exact shift and receipt state',
      fixture: { shift: 'open' },
      executionMode: 'sequential',
      commands: [command()],
      expectedOutcomeCodes: ['success:new'],
      expectedTelemetry: ['committed'],
    },
    ...(['draft', 'accepted'] as const).map((scheduleStatus) => ({
      name: `material edit supersedes the current ${scheduleStatus} plan and signals after commit`,
      fixture: { shift: 'open' as const, scheduleStatus },
      executionMode: 'sequential' as const,
      commands: [
        command({ idempotencyKey: `update-shift-${scheduleStatus}-plan` }),
      ],
      expectedOutcomeCodes: ['success:new'],
      expectedTelemetry: ['committed'] as const,
    })),
    {
      name: 'semantically identical instants audit a no-op without versioning supersession or signal',
      fixture: { shift: 'open', scheduleStatus: 'accepted' },
      executionMode: 'sequential',
      commands: [
        command({
          startsAt: '2026-08-22T09:00:00-04:00',
          endsAt: '2026-08-22T17:00:00-04:00',
          effectiveFolderCount: 2,
          idempotencyKey: 'update-shift-noop',
        }),
      ],
      expectedOutcomeCodes: ['success:new'],
      expectedTelemetry: ['committed'],
    },
    {
      name: 'matching stored receipt replays before the scheduling lock without clock or IDs',
      fixture: {
        shift: 'replayed_result',
        storedReceipt: 'matching',
      },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-stored-replay' })],
      expectedOutcomeCodes: ['success:replayed'],
      expectedTelemetry: ['committed'],
    },
    {
      name: 'malformed stored receipt diverges before the scheduling lock',
      fixture: { shift: 'open', storedReceipt: 'malformed' },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-malformed' })],
      expectedOutcomeCodes: ['failure:production_idempotency_conflict'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'different stored command diverges before the scheduling lock',
      fixture: { shift: 'open', storedReceipt: 'divergent' },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-divergent' })],
      expectedOutcomeCodes: ['failure:production_idempotency_conflict'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'same-key concurrent commands miss before lock then replay after lock',
      fixture: { shift: 'open', fault: 'slow_event_append' },
      executionMode: 'concurrent',
      commands: [
        command({ idempotencyKey: 'update-shift-after-lock-replay' }),
        command({ idempotencyKey: 'update-shift-after-lock-replay' }),
      ],
      normalizeOutcomeOrder: true,
      expectedOutcomeCodes: ['success:new', 'success:replayed'],
      expectedTelemetry: ['committed', 'committed'],
    },
    {
      name: 'same-key concurrent divergent commands conflict after the scheduling lock',
      fixture: { shift: 'open', fault: 'slow_event_append' },
      executionMode: 'concurrent',
      commands: [
        command({ idempotencyKey: 'update-shift-after-lock-divergence' }),
        command({
          endsAt: '2026-08-22T23:00:00.000Z',
          effectiveFolderCount: 5,
          idempotencyKey: 'update-shift-after-lock-divergence',
        }),
      ],
      normalizeOutcomeOrder: true,
      expectedOutcomeCodes: [
        'failure:production_idempotency_conflict',
        'success:new',
      ],
      expectedTelemetry: ['committed', 'expected_rollback'],
    },
    {
      name: 'invalid operating window rejects before opening a transaction',
      fixture: { shift: 'open' },
      executionMode: 'sequential',
      commands: [
        command({
          startsAt: '2026-08-22T22:00:00.000Z',
          endsAt: '2026-08-22T22:00:00.000Z',
          idempotencyKey: 'update-shift-invalid-window',
        }),
      ],
      expectedOutcomeCodes: ['failure:production_shift_window_invalid'],
      expectedTelemetry: [],
    },
    {
      name: 'wrong location preserves the deployed not-found outcome',
      fixture: { shift: 'open' },
      executionMode: 'sequential',
      commands: [
        command({
          locationId: updateShiftConformanceOtherLocationId,
          idempotencyKey: 'update-shift-wrong-location',
        }),
      ],
      expectedOutcomeCodes: ['failure:production_shift_not_found'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'missing shift preserves the deployed not-found outcome',
      fixture: { shift: 'absent' },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-missing' })],
      expectedOutcomeCodes: ['failure:production_shift_not_found'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'stale expected version wins before lifecycle guards',
      fixture: { shift: 'open_version_2' },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-stale' })],
      expectedOutcomeCodes: ['failure:production_shift_version_conflict'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'closed lifecycle rejects a current-version edit',
      fixture: { shift: 'closed' },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-closed' })],
      expectedOutcomeCodes: ['failure:production_shift_closed'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'existing production run freezes the otherwise-open shift',
      fixture: {
        shift: 'open',
        scheduleStatus: 'accepted',
        runExists: true,
      },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-started' })],
      expectedOutcomeCodes: ['failure:production_shift_already_started'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'same-version race serializes under the location and shift locks',
      fixture: { shift: 'open', fault: 'slow_event_append' },
      executionMode: 'concurrent',
      commands: [
        command({ idempotencyKey: 'update-shift-version-race-a' }),
        command({
          endsAt: '2026-08-22T23:00:00.000Z',
          effectiveFolderCount: 5,
          idempotencyKey: 'update-shift-version-race-b',
        }),
      ],
      normalizeOutcomeOrder: true,
      expectedOutcomeCodes: [
        'failure:production_shift_version_conflict',
        'success:new',
      ],
      expectedTelemetry: ['committed', 'expected_rollback'],
    },
    {
      name: 'late shift CAS conflict rolls the attempted mutation back',
      fixture: { shift: 'open', fault: 'shift_cas' },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-late-shift-cas' })],
      expectedOutcomeCodes: ['failure:production_shift_version_conflict'],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'late schedule CAS conflict rolls shift and plan back together',
      fixture: {
        shift: 'open',
        scheduleStatus: 'accepted',
        fault: 'schedule_cas',
      },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-late-schedule-cas' })],
      expectedOutcomeCodes: [
        'failure:production_shift_schedule_version_conflict',
      ],
      expectedTelemetry: ['expected_rollback'],
    },
    {
      name: 'late work-event failure rolls shift plan receipt and live revision back',
      fixture: {
        shift: 'open',
        scheduleStatus: 'accepted',
        fault: 'event_append',
      },
      executionMode: 'sequential',
      commands: [command({ idempotencyKey: 'update-shift-late-event' })],
      expectedOutcomeCodes: ['unexpected:production_shift_update_failed'],
      expectedTelemetry: ['failed'],
    },
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const stringField = (
  fields: Readonly<Record<string, unknown>> | null,
  key: string,
  fallback: string,
): string => {
  const value = fields?.[key];
  return typeof value === 'string' ? value : fallback;
};

const nullableStringField = (
  fields: Readonly<Record<string, unknown>> | null,
  key: string,
): string | null => {
  const value = fields?.[key];
  return typeof value === 'string' ? value : null;
};

const canonicalFailure = (value: unknown): CanonicalUpdateShiftFailure => {
  const fields = record(value);
  return {
    kind: stringField(fields, 'kind', 'unexpected'),
    classification: nullableStringField(fields, 'classification'),
    code: stringField(fields, 'code', 'unknown_error'),
    message: stringField(fields, 'message', 'Unknown error.'),
    safeMessage: nullableStringField(fields, 'safeMessage'),
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  };
};

export const captureUpdateShiftOutcome = async (
  execute: (command: UpdateShiftCommand) => Promise<unknown>,
  commandValue: UpdateShiftCommand,
): Promise<CanonicalUpdateShiftOutcome> => {
  try {
    const outcome = record(await execute(commandValue));
    if (outcome?.['kind'] === 'success')
      return {
        kind: 'success',
        value: outcome['value'] as UpdateShiftResult,
      };
    return {
      kind: 'failure',
      failure: canonicalFailure(outcome?.['failure']),
    };
  } catch (error) {
    return { kind: 'unexpected', error: canonicalFailure(error) };
  }
};

export const updateShiftOutcomeCode = (
  outcome: CanonicalUpdateShiftOutcome,
): string => {
  if (outcome.kind === 'success')
    return `success:${outcome.value.replayed ? 'replayed' : 'new'}`;
  return `${outcome.kind}:${
    outcome.kind === 'failure' ? outcome.failure.code : outcome.error.code
  }`;
};
