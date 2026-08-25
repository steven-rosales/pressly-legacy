import type { ChangeAdmissionCommand } from '@pressly/production-system/operations/demand/change-admission/types';

// These scenarios remain authoritative after legacy deletion; the runner is
// target-only and the expected observations characterize the public behavior.

export type ChangeAdmissionExecutionMode = 'concurrent' | 'sequential';

export type ChangeAdmissionFixture = Readonly<{
  includeOrder?: boolean;
  sourceAdmissionState?: 'released' | 'unreleased' | 'withdrawn';
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
  version?: number;
  selectedForShift?: boolean;
  forceWorkEventAppendFailure?: boolean;
}>;

export type ChangeAdmissionScenario = Readonly<{
  name: string;
  executionMode: ChangeAdmissionExecutionMode;
  fixture: ChangeAdmissionFixture;
  commands: readonly ChangeAdmissionCommand[];
  normalizeWinningIdempotencyKey?: boolean;
}>;

export type CanonicalChangeAdmissionFailure = Readonly<{
  kind: string;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalChangeAdmissionResult = Readonly<{
  locationId: string;
  orderId: string;
  admissionOverride: 'released' | null;
  status: string;
  version: number;
  replayed: boolean;
}>;

export type CanonicalChangeAdmissionOutcome =
  | Readonly<{ kind: 'success'; value: CanonicalChangeAdmissionResult }>
  | Readonly<{ kind: 'failure'; failure: CanonicalChangeAdmissionFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalChangeAdmissionFailure }>;

export type ChangeAdmissionState = Readonly<{
  admissionOverride: 'released' | null;
  admissionOverrideAt: string | null;
  admissionOverrideBy: string | null;
  status: string;
  eligibleAt: string | null;
  version: number;
  updatedAt: string;
}> | null;

export type ChangeAdmissionAuditEvent = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: unknown;
}>;

export type ChangeAdmissionTransactionObservation = Readonly<{
  operation: string;
  outcome: 'committed' | 'expected_rollback' | 'failed';
}>;

export type ChangeAdmissionObservation = Readonly<{
  outcome: readonly CanonicalChangeAdmissionOutcome[];
  stateDelta: Readonly<{
    before: ChangeAdmissionState;
    after: ChangeAdmissionState;
  }>;
  workEvents: readonly ChangeAdmissionAuditEvent[];
  idempotencyReceipt: unknown | null;
  liveRevision: Readonly<{ before: number; after: number }>;
  signals: readonly unknown[];
  telemetry: readonly ChangeAdmissionTransactionObservation[];
}>;

export const changeAdmissionFixtureIds = Object.freeze({
  actor: '61000000-0000-4000-8000-000000000001',
  business: '61000000-0000-4000-8000-000000000002',
  fulfillment: '61000000-0000-4000-8000-000000000004',
  demand: '61000000-0000-4000-8000-000000000005',
  productionOrder: '61000000-0000-4000-8000-000000000006',
  missingProductionOrder: '61000000-0000-4000-8000-000000000007',
  shift: '61000000-0000-4000-8000-000000000008',
  workEvent: '61000000-0000-4000-8000-000000000009',
});

export const changeAdmissionLocationId =
  'location-change-admission-conformance';
export const changeAdmissionNow = new Date('2026-08-21T15:00:00.000Z');

const command = (
  idempotencyKey: string,
  input: Partial<
    Pick<
      ChangeAdmissionCommand,
      'expectedVersion' | 'productionOrderId' | 'target'
    >
  > = {},
): ChangeAdmissionCommand => ({
  locationId: changeAdmissionLocationId,
  productionOrderId:
    input.productionOrderId ?? changeAdmissionFixtureIds.productionOrder,
  actorId: changeAdmissionFixtureIds.actor,
  target: input.target ?? 'released',
  expectedVersion: input.expectedVersion ?? 1,
  idempotencyKey,
});

const replay = command('change-admission-conformance-replay');

export const changeAdmissionScenarios: readonly ChangeAdmissionScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'success replay and divergent reuse preserve one receipt',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        replay,
        replay,
        command('change-admission-conformance-replay', { target: 'source' }),
      ]),
    }),
    Object.freeze({
      name: 'same version race commits exactly one command',
      executionMode: 'concurrent' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('change-admission-conformance-race-a'),
        command('change-admission-conformance-race-b'),
      ]),
      normalizeWinningIdempotencyKey: true,
    }),
    Object.freeze({
      name: 'manual release returns to source before commitment',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        operationalStatus: 'eligible' as const,
        admissionOverride: 'released' as const,
      }),
      commands: Object.freeze([
        command('change-admission-conformance-reversal', {
          target: 'source',
        }),
      ]),
    }),
    Object.freeze({
      name: 'late work event failure rolls the transaction back',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ forceWorkEventAppendFailure: true }),
      commands: Object.freeze([
        command('change-admission-conformance-rollback'),
      ]),
    }),
    Object.freeze({
      name: 'missing order is an expected not-found result',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ includeOrder: false }),
      commands: Object.freeze([
        command('change-admission-conformance-missing', {
          productionOrderId: changeAdmissionFixtureIds.missingProductionOrder,
        }),
      ]),
    }),
    Object.freeze({
      name: 'stale version is an expected conflict',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('change-admission-conformance-stale', { expectedVersion: 2 }),
      ]),
    }),
    Object.freeze({
      name: 'withdrawn source admission is rejected',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ sourceAdmissionState: 'withdrawn' as const }),
      commands: Object.freeze([
        command('change-admission-conformance-withdrawn'),
      ]),
    }),
    Object.freeze({
      name: 'archived production order is rejected',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        resolutionState: 'resolved_without_production' as const,
      }),
      commands: Object.freeze([
        command('change-admission-conformance-archived'),
      ]),
    }),
    Object.freeze({
      name: 'committed execution cannot return to source',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        operationalStatus: 'scheduled' as const,
        executionStatus: 'scheduled' as const,
        admissionOverride: 'released' as const,
      }),
      commands: Object.freeze([
        command('change-admission-conformance-committed', {
          target: 'source',
        }),
      ]),
    }),
    Object.freeze({
      name: 'open shift selection prevents source reversal',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        operationalStatus: 'eligible' as const,
        admissionOverride: 'released' as const,
        selectedForShift: true,
      }),
      commands: Object.freeze([
        command('change-admission-conformance-selected', {
          target: 'source',
        }),
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

const canonicalFailure = (value: unknown): CanonicalChangeAdmissionFailure => {
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
): CanonicalChangeAdmissionResult | null => {
  const fields = record(value);
  const locationId = fields?.['locationId'];
  const orderId = fields?.['orderId'];
  const admissionOverride = fields?.['admissionOverride'];
  const status = fields?.['status'];
  const version = fields?.['version'];
  const replayed = fields?.['replayed'];
  return typeof locationId === 'string' &&
    typeof orderId === 'string' &&
    (admissionOverride === null || admissionOverride === 'released') &&
    typeof status === 'string' &&
    typeof version === 'number' &&
    typeof replayed === 'boolean'
    ? Object.freeze({
        locationId,
        orderId,
        admissionOverride,
        status,
        version,
        replayed,
      })
    : null;
};

export const captureChangeAdmissionOutcome = async (
  execute: (command: ChangeAdmissionCommand) => Promise<unknown>,
  input: ChangeAdmissionCommand,
): Promise<CanonicalChangeAdmissionOutcome> => {
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
        code: 'invalid_change_admission_result',
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
  outcomes: readonly CanonicalChangeAdmissionOutcome[],
): readonly CanonicalChangeAdmissionOutcome[] =>
  Object.freeze(
    [...outcomes].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  );

export const runChangeAdmissionScenario = async (
  execute: (command: ChangeAdmissionCommand) => Promise<unknown>,
  scenario: ChangeAdmissionScenario,
): Promise<readonly CanonicalChangeAdmissionOutcome[]> => {
  if (scenario.executionMode === 'concurrent')
    return sortOutcomes(
      await Promise.all(
        scenario.commands.map((input) =>
          captureChangeAdmissionOutcome(execute, input),
        ),
      ),
    );

  const outcomes: CanonicalChangeAdmissionOutcome[] = [];
  for (const input of scenario.commands)
    outcomes.push(await captureChangeAdmissionOutcome(execute, input));
  return Object.freeze(outcomes);
};
