import type { CreateShiftCommand } from '@pressly/production-system/operations/scheduling/create-shift/types';

// These scenarios characterize the current Production operation and its
// durable observations.

const uuid = (suffix: number): string =>
  `24000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const createShiftConformanceLocationId =
  'create-shift-conformance-location';

export const createShiftConformanceIds = Object.freeze({
  business: '00000000-0000-4000-8000-000000000100',
  actor: uuid(2),
  shift: uuid(3),
  event: uuid(4),
});

export type CreateShiftConformanceFixture =
  | 'empty'
  | 'event-id-conflict'
  | 'shift-id-conflict';

export type CanonicalCreateShiftFailure = Readonly<{
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalCreateShiftOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: CanonicalCreateShiftFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalCreateShiftFailure }>;

export type CreateShiftConformanceState = Readonly<{
  shifts: readonly Readonly<{
    id: string;
    locationId: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    effectiveFolderCount: number;
    status: string;
    version: number;
  }>[];
  workEvents: readonly Readonly<{
    id: string;
    locationId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    actorId: string;
    expectedVersion: number | null;
    idempotencyKey: string;
    payload: unknown;
  }>[];
  liveRevision: number;
}>;

export type CreateShiftTransactionObservation = 'err' | 'ok' | 'threw';

export type CreateShiftConformanceVariant = Readonly<{
  execute: (command: CreateShiftCommand) => Promise<unknown>;
  clockReads: () => number;
  transactionOutcomes: () => readonly CreateShiftTransactionObservation[];
}>;

export type CreateShiftConformanceScenario = Readonly<{
  name: string;
  fixture: CreateShiftConformanceFixture;
  commands: readonly CreateShiftCommand[];
  expectedOutcomeCodes: readonly string[];
  expectedShiftDelta: number;
  expectedWorkEventDelta: number;
  expectedTransactions: readonly CreateShiftTransactionObservation[];
}>;

const baseCommand = Object.freeze({
  locationId: createShiftConformanceLocationId,
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 4,
  idempotencyKey: 'create-shift-conformance-1',
  actorId: createShiftConformanceIds.actor,
}) satisfies CreateShiftCommand;

export const createShiftConformanceScenarios: readonly CreateShiftConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'success persists the shift and exact work-event receipt',
      fixture: 'empty' as const,
      commands: Object.freeze([baseCommand]),
      expectedOutcomeCodes: Object.freeze(['success']),
      expectedShiftDelta: 1,
      expectedWorkEventDelta: 1,
      expectedTransactions: Object.freeze(['ok'] as const),
    }),
    Object.freeze({
      name: 'an invalid window is rejected before persistence',
      fixture: 'empty' as const,
      commands: Object.freeze([
        Object.freeze({
          ...baseCommand,
          endsAt: baseCommand.startsAt,
          idempotencyKey: 'create-shift-invalid-window-1',
        }),
      ]),
      expectedOutcomeCodes: Object.freeze(['production_shift_window_invalid']),
      expectedShiftDelta: 0,
      expectedWorkEventDelta: 0,
      expectedTransactions: Object.freeze([]),
    }),
    Object.freeze({
      name: 'exact retry replays the original result without another write',
      fixture: 'empty' as const,
      commands: Object.freeze([baseCommand, baseCommand]),
      expectedOutcomeCodes: Object.freeze(['success', 'success']),
      expectedShiftDelta: 1,
      expectedWorkEventDelta: 1,
      expectedTransactions: Object.freeze(['ok', 'ok'] as const),
    }),
    Object.freeze({
      name: 'divergent reuse of the key returns the typed conflict',
      fixture: 'empty' as const,
      commands: Object.freeze([
        baseCommand,
        Object.freeze({ ...baseCommand, effectiveFolderCount: 5 }),
      ]),
      expectedOutcomeCodes: Object.freeze([
        'success',
        'production_idempotency_conflict',
      ]),
      expectedShiftDelta: 1,
      expectedWorkEventDelta: 1,
      expectedTransactions: Object.freeze(['ok', 'err'] as const),
    }),
    Object.freeze({
      name: 'generated shift identity collision is an unexpected database failure',
      fixture: 'shift-id-conflict' as const,
      commands: Object.freeze([
        Object.freeze({
          ...baseCommand,
          idempotencyKey: 'create-shift-id-conflict-1',
        }),
      ]),
      expectedOutcomeCodes: Object.freeze(['production_shift_create_failed']),
      expectedShiftDelta: 0,
      expectedWorkEventDelta: 0,
      expectedTransactions: Object.freeze(['threw'] as const),
    }),
    Object.freeze({
      name: 'work-event append failure rolls the inserted shift back',
      fixture: 'event-id-conflict' as const,
      commands: Object.freeze([
        Object.freeze({
          ...baseCommand,
          idempotencyKey: 'create-shift-event-rollback-1',
        }),
      ]),
      expectedOutcomeCodes: Object.freeze(['production_shift_create_failed']),
      expectedShiftDelta: 0,
      expectedWorkEventDelta: 0,
      expectedTransactions: Object.freeze(['threw'] as const),
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (value: unknown): CanonicalCreateShiftFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: nullableString(fields, 'kind') ?? 'unknown',
    classification: nullableString(fields, 'classification'),
    code: nullableString(fields, 'code') ?? 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : (nullableString(fields, 'message') ?? 'Unknown error.'),
    safeMessage: nullableString(fields, 'safeMessage'),
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

export const captureCreateShiftOutcome = async (
  execute: CreateShiftConformanceVariant['execute'],
  command: CreateShiftCommand,
): Promise<CanonicalCreateShiftOutcome> => {
  try {
    const raw = await execute(command);
    const carrier = record(raw);
    if (carrier?.['kind'] === 'success')
      return Object.freeze({ kind: 'success', value: carrier['value'] });
    if (carrier?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['failure']),
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

export const runCreateShiftConformanceScenario = async (input: {
  scenario: CreateShiftConformanceScenario;
  reset: () => Promise<void>;
  seed: (fixture: CreateShiftConformanceFixture) => Promise<void>;
  readState: () => Promise<CreateShiftConformanceState>;
  makeTarget: () => CreateShiftConformanceVariant;
}) => {
  await input.reset();
  await input.seed(input.scenario.fixture);
  const before = await input.readState();
  const target = input.makeTarget();
  const outcomes = [];
  for (const command of input.scenario.commands)
    outcomes.push(await captureCreateShiftOutcome(target.execute, command));
  return Object.freeze({
    before,
    after: await input.readState(),
    outcomes: Object.freeze(outcomes),
    clockReads: target.clockReads(),
    transactionOutcomes: Object.freeze([...target.transactionOutcomes()]),
  });
};

export const createShiftOutcomeCode = (
  outcome: CanonicalCreateShiftOutcome,
): string =>
  outcome.kind === 'success'
    ? 'success'
    : outcome.kind === 'failure'
      ? outcome.failure.code
      : outcome.error.code;
