import type { RecordOrderIntakeCommand } from '@pressly/production-system/operations/demand/record-order-intake/types';

// These scenarios remain authoritative after legacy deletion; the runner is
// target-only and the expected observations characterize the public behavior.

export type RecordOrderIntakeExecutionMode = 'concurrent' | 'sequential';

export type RecordOrderIntakeFixture = Readonly<{
  includeOrder?: boolean;
  phase?:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
  operationalStatus?:
    | 'eligible'
    | 'finished'
    | 'ineligible'
    | 'intake_pending'
    | 'release_pending'
    | 'scheduled';
  executionStatus?: 'finished' | 'scheduled' | 'unassigned';
  resolutionState?: 'open' | 'resolved_without_production';
  admissionOverride?: 'released' | null;
  bagCount?: number | null;
  intakeVersion?: number;
  version?: number;
  forceLateCas?: boolean;
  forceWorkEventAppendFailure?: boolean;
}>;

export type RecordOrderIntakeScenario = Readonly<{
  name: string;
  executionMode: RecordOrderIntakeExecutionMode;
  fixture: RecordOrderIntakeFixture;
  commands: readonly RecordOrderIntakeCommand[];
  normalizeWinningIdempotencyKey?: boolean;
}>;

export type CanonicalRecordOrderIntakeFailure = Readonly<{
  kind: string;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalRecordOrderIntakeResult = Readonly<{
  locationId: string;
  orderId: string;
  bagCount: number;
  bagCountProvenance: 'operator_intake';
  intakeVersion: number;
  version: number;
  replayed: boolean;
}>;

export type CanonicalRecordOrderIntakeOutcome =
  | Readonly<{ kind: 'success'; value: CanonicalRecordOrderIntakeResult }>
  | Readonly<{ kind: 'failure'; failure: CanonicalRecordOrderIntakeFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalRecordOrderIntakeFailure }>;

export type RecordOrderIntakeState = Readonly<{
  bagCount: number | null;
  bagCountSource: string | null;
  intakeRecordedAt: string | null;
  intakeVersion: number;
  status: string;
  eligibleAt: string | null;
  version: number;
  updatedAt: string;
}> | null;

export type RecordOrderIntakeBag = Readonly<{
  id: string;
  bagIndex: number;
  status: string;
}>;

export type RecordOrderIntakeAuditEvent = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: unknown;
}>;

export type RecordOrderIntakeTransactionObservation = Readonly<{
  operation: string;
  outcome: 'committed' | 'expected_rollback' | 'failed';
}>;

export type RecordOrderIntakeObservation = Readonly<{
  outcome: readonly CanonicalRecordOrderIntakeOutcome[];
  stateDelta: Readonly<{
    before: RecordOrderIntakeState;
    after: RecordOrderIntakeState;
  }>;
  bags: Readonly<{
    before: readonly RecordOrderIntakeBag[];
    after: readonly RecordOrderIntakeBag[];
  }>;
  workEvents: readonly RecordOrderIntakeAuditEvent[];
  idempotencyReceipt: unknown | null;
  liveRevision: Readonly<{ before: number; after: number }>;
  signals: readonly unknown[];
  telemetry: readonly RecordOrderIntakeTransactionObservation[];
}>;

export const recordOrderIntakeFixtureIds = Object.freeze({
  actor: '63000000-0000-4000-8000-000000000001',
  business: '63000000-0000-4000-8000-000000000002',
  fulfillment: '63000000-0000-4000-8000-000000000004',
  demand: '63000000-0000-4000-8000-000000000005',
  productionOrder: '63000000-0000-4000-8000-000000000006',
  missingProductionOrder: '63000000-0000-4000-8000-000000000007',
  existingBags: Object.freeze([
    '63000000-0000-4000-8000-000000000011',
    '63000000-0000-4000-8000-000000000012',
    '63000000-0000-4000-8000-000000000013',
  ]),
  generated: Object.freeze([
    '63000000-0000-4000-8000-000000000021',
    '63000000-0000-4000-8000-000000000022',
    '63000000-0000-4000-8000-000000000023',
    '63000000-0000-4000-8000-000000000024',
    '63000000-0000-4000-8000-000000000025',
    '63000000-0000-4000-8000-000000000026',
  ]),
});

export const recordOrderIntakeLocationId =
  'location-record-order-intake-conformance';
export const recordOrderIntakeAlternateLocationId =
  'location-record-order-intake-other';
export const recordOrderIntakeNow = new Date('2026-08-21T15:00:00.000Z');

const command = (
  idempotencyKey: string,
  input: Partial<
    Pick<
      RecordOrderIntakeCommand,
      'bagCount' | 'expectedVersion' | 'locationId' | 'productionOrderId'
    >
  > = {},
): RecordOrderIntakeCommand => ({
  locationId: input.locationId ?? recordOrderIntakeLocationId,
  productionOrderId:
    input.productionOrderId ?? recordOrderIntakeFixtureIds.productionOrder,
  actorId: recordOrderIntakeFixtureIds.actor,
  bagCount: input.bagCount ?? 3,
  expectedVersion: input.expectedVersion ?? 1,
  idempotencyKey,
});

const replay = command('record-order-intake-conformance-replay');

export const recordOrderIntakeScenarios: readonly RecordOrderIntakeScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'success replay and divergent reuse preserve one receipt',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        replay,
        replay,
        command('record-order-intake-conformance-replay', { bagCount: 2 }),
      ]),
    }),
    Object.freeze({
      name: 'authoritative zero count replaces bags and advances both versions',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        bagCount: 2,
        intakeVersion: 1,
        operationalStatus: 'eligible' as const,
        version: 4,
      }),
      commands: Object.freeze([
        command('record-order-intake-conformance-zero', {
          bagCount: 0,
          expectedVersion: 4,
        }),
      ]),
    }),
    Object.freeze({
      name: 'unreleased demand remains release pending after intake',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ phase: 'expected' as const }),
      commands: Object.freeze([
        command('record-order-intake-conformance-unreleased'),
      ]),
    }),
    Object.freeze({
      name: 'manager release override admits unreleased demand',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        phase: 'expected' as const,
        admissionOverride: 'released' as const,
      }),
      commands: Object.freeze([
        command('record-order-intake-conformance-override'),
      ]),
    }),
    Object.freeze({
      name: 'missing and cross-location orders are not found',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('record-order-intake-conformance-missing', {
          productionOrderId: recordOrderIntakeFixtureIds.missingProductionOrder,
        }),
        command('record-order-intake-conformance-cross-location', {
          locationId: recordOrderIntakeAlternateLocationId,
        }),
      ]),
    }),
    Object.freeze({
      name: 'stale production version is rejected',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('record-order-intake-conformance-stale', {
          expectedVersion: 2,
        }),
      ]),
    }),
    Object.freeze({
      name: 'archived production order is rejected',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        resolutionState: 'resolved_without_production' as const,
      }),
      commands: Object.freeze([
        command('record-order-intake-conformance-archived'),
      ]),
    }),
    Object.freeze({
      name: 'scheduled production order is rejected',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        operationalStatus: 'scheduled' as const,
        executionStatus: 'scheduled' as const,
      }),
      commands: Object.freeze([
        command('record-order-intake-conformance-scheduled'),
      ]),
    }),
    Object.freeze({
      name: 'withdrawn demand is rejected by intake policy',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ phase: 'withdrawn' as const }),
      commands: Object.freeze([
        command('record-order-intake-conformance-withdrawn'),
      ]),
    }),
    Object.freeze({
      name: 'post-production demand is rejected by intake policy',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ phase: 'post_production' as const }),
      commands: Object.freeze([
        command('record-order-intake-conformance-post-production'),
      ]),
    }),
    Object.freeze({
      name: 'same production version race commits exactly one command',
      executionMode: 'concurrent' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('record-order-intake-conformance-race-a'),
        command('record-order-intake-conformance-race-b'),
      ]),
      normalizeWinningIdempotencyKey: true,
    }),
    Object.freeze({
      name: 'late production-version CAS miss returns the owned conflict',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ forceLateCas: true }),
      commands: Object.freeze([
        command('record-order-intake-conformance-late-cas'),
      ]),
    }),
    Object.freeze({
      name: 'late work event failure rolls every durable effect back',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ forceWorkEventAppendFailure: true }),
      commands: Object.freeze([
        command('record-order-intake-conformance-rollback'),
      ]),
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
  fallback: string,
): string => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : fallback;
};

const canonicalFailure = (
  value: unknown,
): CanonicalRecordOrderIntakeFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: stringField(fields, 'kind', 'unknown'),
    code: stringField(fields, 'code', 'unknown_error'),
    message:
      value instanceof Error
        ? value.message
        : stringField(fields, 'message', 'Unknown error.'),
    safeMessage:
      typeof fields?.['safeMessage'] === 'string'
        ? fields['safeMessage']
        : null,
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

const canonicalResult = (
  value: unknown,
): CanonicalRecordOrderIntakeResult | null => {
  const fields = record(value);
  const locationId = fields?.['locationId'];
  const orderId = fields?.['orderId'];
  const bagCount = fields?.['bagCount'];
  const bagCountProvenance = fields?.['bagCountProvenance'];
  const intakeVersion = fields?.['intakeVersion'];
  const version = fields?.['version'];
  const replayed = fields?.['replayed'];
  return typeof locationId === 'string' &&
    typeof orderId === 'string' &&
    typeof bagCount === 'number' &&
    bagCountProvenance === 'operator_intake' &&
    typeof intakeVersion === 'number' &&
    typeof version === 'number' &&
    typeof replayed === 'boolean'
    ? Object.freeze({
        locationId,
        orderId,
        bagCount,
        bagCountProvenance,
        intakeVersion,
        version,
        replayed,
      })
    : null;
};

export const captureRecordOrderIntakeOutcome = async (
  execute: (command: RecordOrderIntakeCommand) => Promise<unknown>,
  input: RecordOrderIntakeCommand,
): Promise<CanonicalRecordOrderIntakeOutcome> => {
  try {
    const raw = await execute(input);
    const result = record(raw);
    if (result?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(result['error']),
      });
    if (result?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(result['failure']),
      });

    const value =
      result?.['tag'] === 'ok' || result?.['kind'] === 'success'
        ? result['value']
        : raw;
    const canonical = canonicalResult(value);
    if (canonical !== null)
      return Object.freeze({ kind: 'success', value: canonical });
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure({
        kind: 'invalid_result',
        code: 'invalid_record_order_intake_result',
        message: JSON.stringify(raw),
      }),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

const sortOutcomes = (
  outcomes: readonly CanonicalRecordOrderIntakeOutcome[],
): readonly CanonicalRecordOrderIntakeOutcome[] =>
  Object.freeze(
    [...outcomes].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  );

export const runRecordOrderIntakeScenario = async (
  execute: (command: RecordOrderIntakeCommand) => Promise<unknown>,
  scenario: RecordOrderIntakeScenario,
): Promise<readonly CanonicalRecordOrderIntakeOutcome[]> => {
  if (scenario.executionMode === 'concurrent')
    return sortOutcomes(
      await Promise.all(
        scenario.commands.map((input) =>
          captureRecordOrderIntakeOutcome(execute, input),
        ),
      ),
    );

  const outcomes: CanonicalRecordOrderIntakeOutcome[] = [];
  for (const input of scenario.commands)
    outcomes.push(await captureRecordOrderIntakeOutcome(execute, input));
  return Object.freeze(outcomes);
};
