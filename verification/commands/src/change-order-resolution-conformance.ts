import type { ChangeOrderResolutionCommand } from '@pressly/production-system/operations/demand/change-order-resolution/types';

// Permanent target-only scenarios retained after the legacy writer deletion.

export type ChangeOrderResolutionExecutionMode =
  | 'after_lock_replay'
  | 'concurrent'
  | 'sequential';

export type ChangeOrderResolutionParticipation =
  | 'batch_membership'
  | 'current_selection'
  | 'route_event'
  | 'schedule_snapshot'
  | 'selection_event'
  | 'stage_attempt';

export type ChangeOrderResolutionFixture = Readonly<{
  includeOrder?: boolean;
  version?: number;
  resolutionState?: string;
  executionStatus?: string;
  operationalStatus?:
    | 'eligible'
    | 'finished'
    | 'ineligible'
    | 'intake_pending'
    | 'release_pending'
    | 'scheduled';
  sourceAdmissionState?: 'released' | 'unreleased' | 'withdrawn';
  sourceCommercialState?: 'canceled' | 'completed' | 'open';
  demandPhase?:
    | 'expected'
    | 'inbound'
    | 'post_production'
    | 'production_released'
    | 'withdrawn';
  sourceDueAt?: Date;
  sourceEstimatedWeightLbs?: number | null;
  sourceEstimatedWeightSource?: string | null;
  admissionOverride?: 'released' | null;
  bagCount?: number | null;
  hasIntake?: boolean;
  priority?: boolean;
  pendingPlacement?: boolean;
  participation?: ChangeOrderResolutionParticipation;
  forceLateCas?: boolean;
  forceWorkEventAppendFailure?: boolean;
  malformedReceipt?: boolean;
}>;

export type ChangeOrderResolutionScenario = Readonly<{
  name: string;
  executionMode: ChangeOrderResolutionExecutionMode;
  fixture: ChangeOrderResolutionFixture;
  commands: readonly ChangeOrderResolutionCommand[];
  normalizeOutcomeOrder?: boolean;
  normalizeWinningIdempotencyKey?: boolean;
}>;

export type CanonicalChangeOrderResolutionFailure = Readonly<{
  kind: string;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalChangeOrderResolutionResult = Readonly<{
  locationId: string;
  orderId: string;
  action: 'resolve_without_production' | 'restore';
  resolutionState: 'open' | 'resolved_without_production';
  transitionedAt: string;
  version: number;
  replayed: boolean;
}>;

export type CanonicalChangeOrderResolutionOutcome =
  | Readonly<{
      kind: 'success';
      value: CanonicalChangeOrderResolutionResult;
    }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalChangeOrderResolutionFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalChangeOrderResolutionFailure;
    }>;

export type ChangeOrderResolutionState = Readonly<{
  resolutionState: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionReason: string | null;
  resolutionNote: string | null;
  dueAt: string;
  derivedWeightLbs: number;
  derivedWeightSource: string;
  operationalStatus: string;
  eligibleAt: string | null;
  admissionOverride: string | null;
  admissionOverrideAt: string | null;
  admissionOverrideBy: string | null;
  pendingPlacement: unknown | null;
  version: number;
  updatedAt: string;
}> | null;

export type ChangeOrderResolutionAuditEvent = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: unknown;
}>;

export type ChangeOrderResolutionObservation = Readonly<{
  outcome: readonly CanonicalChangeOrderResolutionOutcome[];
  stateDelta: Readonly<{
    before: ChangeOrderResolutionState;
    after: ChangeOrderResolutionState;
  }>;
  workEvents: readonly ChangeOrderResolutionAuditEvent[];
  idempotencyReceipt: unknown | null;
  liveRevision: Readonly<{ before: number; after: number }>;
  signals: readonly unknown[];
}>;

export const changeOrderResolutionFixtureIds = Object.freeze({
  actor: '65000000-0000-4000-8000-000000000001',
  business: '65000000-0000-4000-8000-000000000002',
  fulfillment: '65000000-0000-4000-8000-000000000004',
  demand: '65000000-0000-4000-8000-000000000005',
  productionOrder: '65000000-0000-4000-8000-000000000006',
  missingProductionOrder: '65000000-0000-4000-8000-000000000007',
  shift: '65000000-0000-4000-8000-000000000008',
  schedulerConfig: '65000000-0000-4000-8000-000000000009',
  schedule: '65000000-0000-4000-8000-000000000010',
  run: '65000000-0000-4000-8000-000000000011',
  batch: '65000000-0000-4000-8000-000000000012',
  station: '65000000-0000-4000-8000-000000000013',
  stage: '65000000-0000-4000-8000-000000000014',
  membership: '65000000-0000-4000-8000-000000000015',
  attempt: '65000000-0000-4000-8000-000000000016',
  evidenceEvent: '65000000-0000-4000-8000-000000000017',
  workEvent: '65000000-0000-4000-8000-000000000018',
  collision: '65000000-0000-4000-8000-000000000019',
});

export const changeOrderResolutionLocationId =
  'location-change-order-resolution-conformance';
export const changeOrderResolutionNow = new Date('2026-08-21T15:00:00.000Z');
export const changeOrderResolutionInitialTime = new Date(
  '2026-08-21T12:00:00.000Z',
);
export const changeOrderResolutionDueAt = new Date('2026-08-22T20:00:00.000Z');
export const changeOrderResolutionRestoredDueAt = new Date(
  '2026-08-23T18:00:00.000Z',
);

const resolve = (
  idempotencyKey: string,
  input: Partial<
    Pick<
      Extract<
        ChangeOrderResolutionCommand,
        { action: 'resolve_without_production' }
      >,
      | 'confirmReviewedFacts'
      | 'expectedVersion'
      | 'note'
      | 'productionOrderId'
      | 'reason'
      | 'sourceStatePrecondition'
    >
  > = {},
): ChangeOrderResolutionCommand => ({
  locationId: changeOrderResolutionLocationId,
  productionOrderId:
    input.productionOrderId ?? changeOrderResolutionFixtureIds.productionOrder,
  actorId: changeOrderResolutionFixtureIds.actor,
  action: 'resolve_without_production',
  reason: input.reason ?? 'processor_not_in_use',
  note: input.note ?? null,
  confirmReviewedFacts: input.confirmReviewedFacts ?? false,
  expectedVersion: input.expectedVersion ?? 4,
  idempotencyKey,
  ...(input.sourceStatePrecondition === undefined
    ? {}
    : { sourceStatePrecondition: input.sourceStatePrecondition }),
});

const restore = (
  idempotencyKey: string,
  input: Partial<
    Pick<
      Extract<ChangeOrderResolutionCommand, { action: 'restore' }>,
      'expectedVersion' | 'note' | 'reason'
    >
  > = {},
): ChangeOrderResolutionCommand => ({
  locationId: changeOrderResolutionLocationId,
  productionOrderId: changeOrderResolutionFixtureIds.productionOrder,
  actorId: changeOrderResolutionFixtureIds.actor,
  action: 'restore',
  reason: input.reason ?? 'work_should_be_produced',
  note: input.note ?? null,
  expectedVersion: input.expectedVersion ?? 4,
  idempotencyKey,
});

const participationScenario = (
  name: string,
  participation: ChangeOrderResolutionParticipation,
): ChangeOrderResolutionScenario => ({
  name: `${name} participation blocks resolution`,
  executionMode: 'sequential',
  fixture: { participation },
  commands: [resolve(`resolution-${participation}`)],
});

const reviewScenario = (
  name: string,
  fixture: ChangeOrderResolutionFixture,
): ChangeOrderResolutionScenario => ({
  name: `${name} requires explicit review`,
  executionMode: 'sequential',
  fixture,
  commands: [resolve(`resolution-review-${name.replaceAll(' ', '-')}`)],
});

const replay = resolve('resolution-conformance-replay');

export const changeOrderResolutionScenarios: readonly ChangeOrderResolutionScenario[] =
  Object.freeze([
    {
      name: 'resolve success commits the complete observable envelope',
      executionMode: 'sequential',
      fixture: {},
      commands: [resolve('resolution-conformance-resolve')],
    },
    {
      name: 'restore success projects current source demand exactly',
      executionMode: 'sequential',
      fixture: {
        resolutionState: 'resolved_without_production',
        sourceAdmissionState: 'released',
        demandPhase: 'production_released',
        sourceDueAt: changeOrderResolutionRestoredDueAt,
        sourceEstimatedWeightLbs: 48,
        sourceEstimatedWeightSource: 'current_source',
        admissionOverride: 'released',
        bagCount: 2,
      },
      commands: [restore('resolution-conformance-restore')],
    },
    {
      name: 'missing order returns not found',
      executionMode: 'sequential',
      fixture: {},
      commands: [
        resolve('resolution-conformance-missing', {
          productionOrderId:
            changeOrderResolutionFixtureIds.missingProductionOrder,
        }),
      ],
    },
    {
      name: 'stale production version returns the review conflict',
      executionMode: 'sequential',
      fixture: {},
      commands: [
        resolve('resolution-conformance-stale', { expectedVersion: 3 }),
      ],
    },
    {
      name: 'source precondition is rechecked under the scheduling lock',
      executionMode: 'sequential',
      fixture: { sourceAdmissionState: 'released' },
      commands: [
        resolve('resolution-conformance-source-precondition', {
          sourceStatePrecondition: {
            commercialState: 'open',
            admissionState: 'unreleased',
          },
        }),
      ],
    },
    {
      name: 'scheduled execution blocks resolution',
      executionMode: 'sequential',
      fixture: { executionStatus: 'scheduled', operationalStatus: 'scheduled' },
      commands: [resolve('resolution-conformance-scheduled')],
    },
    {
      name: 'finished operational fallback blocks resolution',
      executionMode: 'sequential',
      fixture: { executionStatus: 'unassigned', operationalStatus: 'finished' },
      commands: [resolve('resolution-conformance-finished')],
    },
    participationScenario('current shift selection', 'current_selection'),
    participationScenario('schedule snapshot history', 'schedule_snapshot'),
    participationScenario('selection event history', 'selection_event'),
    participationScenario('batch membership history', 'batch_membership'),
    participationScenario('stage attempt history', 'stage_attempt'),
    participationScenario('route event history', 'route_event'),
    reviewScenario('recorded intake', { hasIntake: true, bagCount: 2 }),
    reviewScenario('manual admission', { admissionOverride: 'released' }),
    reviewScenario('priority', { priority: true }),
    reviewScenario('pending placement', { pendingPlacement: true }),
    {
      name: 'confirmed review clears only pending placement with exact reasons',
      executionMode: 'sequential',
      fixture: {
        hasIntake: true,
        bagCount: 2,
        admissionOverride: 'released',
        priority: true,
        pendingPlacement: true,
      },
      commands: [
        resolve('resolution-conformance-reviewed', {
          confirmReviewedFacts: true,
        }),
      ],
    },
    {
      name: 'invalid persisted execution state is rejected',
      executionMode: 'sequential',
      fixture: { executionStatus: 'invalid' },
      commands: [resolve('resolution-conformance-invalid-execution')],
    },
    {
      name: 'invalid persisted resolution state is rejected',
      executionMode: 'sequential',
      fixture: { resolutionState: 'invalid' },
      commands: [resolve('resolution-conformance-invalid-resolution')],
    },
    {
      name: 'restore with missing current estimate is rejected',
      executionMode: 'sequential',
      fixture: {
        resolutionState: 'resolved_without_production',
        sourceEstimatedWeightLbs: null,
        sourceEstimatedWeightSource: null,
      },
      commands: [restore('resolution-conformance-restore-demand')],
    },
    {
      name: 'restore with committed execution is rejected',
      executionMode: 'sequential',
      fixture: {
        resolutionState: 'resolved_without_production',
        executionStatus: 'scheduled',
        operationalStatus: 'scheduled',
      },
      commands: [restore('resolution-conformance-restore-committed')],
    },
    {
      name: 'restore from open state is rejected by the graph',
      executionMode: 'sequential',
      fixture: {},
      commands: [restore('resolution-conformance-restore-state')],
    },
    {
      name: 'exact replay and divergent reuse preserve one receipt',
      executionMode: 'sequential',
      fixture: {},
      commands: [
        replay,
        replay,
        resolve('resolution-conformance-replay', {
          reason: 'other',
          note: 'Different',
        }),
      ],
    },
    {
      name: 'same key race replays after the location lock',
      executionMode: 'after_lock_replay',
      fixture: {},
      commands: [
        resolve('resolution-conformance-after-lock'),
        resolve('resolution-conformance-after-lock'),
      ],
      normalizeOutcomeOrder: true,
    },
    {
      name: 'same production version race commits exactly one command',
      executionMode: 'concurrent',
      fixture: {},
      commands: [
        resolve('resolution-conformance-race-a'),
        resolve('resolution-conformance-race-b'),
      ],
      normalizeOutcomeOrder: true,
      normalizeWinningIdempotencyKey: true,
    },
    {
      name: 'malformed historical receipt fails closed as an idempotency conflict',
      executionMode: 'sequential',
      fixture: { malformedReceipt: true },
      commands: [resolve('resolution-conformance-malformed-receipt')],
    },
    {
      name: 'real late CAS returns the try-again conflict',
      executionMode: 'sequential',
      fixture: { forceLateCas: true },
      commands: [resolve('resolution-conformance-late-cas')],
    },
    {
      name: 'late event failure rolls the whole transaction back',
      executionMode: 'sequential',
      fixture: { forceWorkEventAppendFailure: true },
      commands: [resolve('resolution-conformance-rollback')],
    },
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
): CanonicalChangeOrderResolutionFailure => {
  const fields = record(value);
  return {
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
  };
};

const canonicalSuccess = (
  value: unknown,
): CanonicalChangeOrderResolutionResult | null => {
  const fields = record(value);
  return typeof fields?.['locationId'] === 'string' &&
    typeof fields['orderId'] === 'string' &&
    (fields['action'] === 'resolve_without_production' ||
      fields['action'] === 'restore') &&
    (fields['resolutionState'] === 'open' ||
      fields['resolutionState'] === 'resolved_without_production') &&
    typeof fields['transitionedAt'] === 'string' &&
    typeof fields['version'] === 'number' &&
    typeof fields['replayed'] === 'boolean'
    ? {
        locationId: fields['locationId'],
        orderId: fields['orderId'],
        action: fields['action'],
        resolutionState: fields['resolutionState'],
        transitionedAt: fields['transitionedAt'],
        version: fields['version'],
        replayed: fields['replayed'],
      }
    : null;
};

export const captureChangeOrderResolutionOutcome = async (
  execute: (command: ChangeOrderResolutionCommand) => Promise<unknown>,
  command: ChangeOrderResolutionCommand,
): Promise<CanonicalChangeOrderResolutionOutcome> => {
  try {
    const raw = await execute(command);
    const wrapper = record(raw);
    if (wrapper?.['tag'] === 'err')
      return { kind: 'failure', failure: canonicalFailure(wrapper['error']) };
    if (wrapper?.['kind'] === 'failure')
      return {
        kind: 'failure',
        failure: canonicalFailure(wrapper['failure']),
      };
    const value =
      wrapper?.['tag'] === 'ok' || wrapper?.['kind'] === 'success'
        ? wrapper['value']
        : raw;
    const result = canonicalSuccess(value);
    return result === null
      ? {
          kind: 'unexpected',
          error: {
            kind: 'invalid_result',
            code: 'invalid_change_order_resolution_result',
            message: 'The change-order-resolution result is invalid.',
            safeMessage: null,
            status: null,
          },
        }
      : { kind: 'success', value: result };
  } catch (error) {
    return { kind: 'unexpected', error: canonicalFailure(error) };
  }
};

const sortOutcomes = (
  outcomes: readonly CanonicalChangeOrderResolutionOutcome[],
): readonly CanonicalChangeOrderResolutionOutcome[] =>
  [...outcomes].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

const missingAfterLockRunner = (): CanonicalChangeOrderResolutionOutcome => ({
  kind: 'unexpected',
  error: {
    kind: 'runner_configuration',
    code: 'after_lock_runner_missing',
    message: 'The after-lock scenario runner is missing.',
    safeMessage: null,
    status: null,
  },
});

export const runChangeOrderResolutionScenario = async (input: {
  execute: (command: ChangeOrderResolutionCommand) => Promise<unknown>;
  executeAfterLock?: (
    commands: readonly ChangeOrderResolutionCommand[],
  ) => Promise<readonly CanonicalChangeOrderResolutionOutcome[]>;
  scenario: ChangeOrderResolutionScenario;
}): Promise<readonly CanonicalChangeOrderResolutionOutcome[]> => {
  const outcomes =
    input.scenario.executionMode === 'sequential'
      ? await input.scenario.commands.reduce<
          Promise<CanonicalChangeOrderResolutionOutcome[]>
        >(
          async (pending, command) => [
            ...(await pending),
            await captureChangeOrderResolutionOutcome(input.execute, command),
          ],
          Promise.resolve([]),
        )
      : input.scenario.executionMode === 'after_lock_replay'
        ? ((await input.executeAfterLock?.(input.scenario.commands)) ?? [
            missingAfterLockRunner(),
          ])
        : await Promise.all(
            input.scenario.commands.map((command) =>
              captureChangeOrderResolutionOutcome(input.execute, command),
            ),
          );
  return input.scenario.normalizeOutcomeOrder === true
    ? sortOutcomes(outcomes)
    : outcomes;
};
