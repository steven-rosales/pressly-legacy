import type { SetOrderPriorityCommand } from '@pressly/production-system/operations/demand/set-order-priority/types';

// These scenarios remain authoritative after legacy deletion; the runner is
// target-only and the expected observations characterize the public behavior.

export type SetOrderPriorityExecutionMode = 'concurrent' | 'sequential';

export type SetOrderPriorityFixture = Readonly<{
  forceWorkEventAppendFailure?: boolean;
  resolutionState?: 'open' | 'resolved_without_production';
}>;

export type SetOrderPriorityScenario = Readonly<{
  name: string;
  executionMode: SetOrderPriorityExecutionMode;
  fixture: SetOrderPriorityFixture;
  commands: readonly SetOrderPriorityCommand[];
  normalizeWinningIdempotencyKey?: boolean;
}>;

export type CanonicalSetOrderPriorityFailure = Readonly<{
  kind: string;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalSetOrderPriorityResult = Readonly<{
  entityId: string;
  version: number;
  replayed: boolean;
}>;

export type CanonicalSetOrderPriorityOutcome =
  | Readonly<{
      kind: 'success';
      value: CanonicalSetOrderPriorityResult;
    }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalSetOrderPriorityFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalSetOrderPriorityFailure;
    }>;

export type SetOrderPriorityState = Readonly<{
  priority: boolean;
  version: number;
  updatedAt: string;
}>;

export type SetOrderPriorityAuditEvent = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: unknown;
}>;

export type SetOrderPriorityObservation = Readonly<{
  outcome: readonly CanonicalSetOrderPriorityOutcome[];
  stateDelta: Readonly<{
    before: SetOrderPriorityState;
    after: SetOrderPriorityState;
  }>;
  workEvents: readonly SetOrderPriorityAuditEvent[];
  idempotencyReceipt: unknown | null;
  liveRevision: Readonly<{ before: number; after: number }>;
  signals: readonly unknown[];
}>;

export const setOrderPriorityFixtureIds = Object.freeze({
  actor: '10000000-0000-4000-8000-000000000001',
  fulfillment: '10000000-0000-4000-8000-000000000003',
  demand: '10000000-0000-4000-8000-000000000004',
  productionOrder: '10000000-0000-4000-8000-000000000005',
  missingProductionOrder: '10000000-0000-4000-8000-000000000099',
  workEvent: '10000000-0000-4000-8000-000000000006',
});

export const setOrderPriorityLocationId = 'location-conformance';
export const setOrderPriorityNow = new Date('2026-08-21T15:00:00.000Z');

const command = (
  idempotencyKey: string,
  input: Partial<
    Pick<
      SetOrderPriorityCommand,
      'expectedVersion' | 'priority' | 'productionOrderId'
    >
  > = {},
): SetOrderPriorityCommand => ({
  locationId: setOrderPriorityLocationId,
  productionOrderId:
    input.productionOrderId ?? setOrderPriorityFixtureIds.productionOrder,
  actorId: setOrderPriorityFixtureIds.actor,
  priority: input.priority ?? true,
  expectedVersion: input.expectedVersion ?? 2,
  idempotencyKey,
});

const exactReplay = command('priority-conformance-replay');

export const setOrderPriorityScenarios: readonly SetOrderPriorityScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'canonical success commits the complete observable envelope',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([command('priority-conformance-success')]),
    }),
    Object.freeze({
      name: 'missing order returns the same expected rejection',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('priority-conformance-missing', {
          productionOrderId: setOrderPriorityFixtureIds.missingProductionOrder,
        }),
      ]),
    }),
    Object.freeze({
      name: 'stale expected version returns an ordinary conflict',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('priority-conformance-stale', { expectedVersion: 1 }),
      ]),
    }),
    Object.freeze({
      name: 'archived order is rejected by operational access policy',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        resolutionState: 'resolved_without_production' as const,
      }),
      commands: Object.freeze([command('priority-conformance-archived')]),
    }),
    Object.freeze({
      name: 'same version race commits exactly one command',
      executionMode: 'concurrent' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('priority-conformance-race-a'),
        command('priority-conformance-race-b'),
      ]),
      normalizeWinningIdempotencyKey: true,
    }),
    Object.freeze({
      name: 'same key and same payload returns the stored receipt',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([exactReplay, exactReplay]),
    }),
    Object.freeze({
      name: 'same key and different payload is an idempotency conflict',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({}),
      commands: Object.freeze([
        command('priority-conformance-divergent'),
        command('priority-conformance-divergent', { priority: false }),
      ]),
    }),
    Object.freeze({
      name: 'late work event failure rolls the whole transaction back',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ forceWorkEventAppendFailure: true }),
      commands: Object.freeze([command('priority-conformance-rollback')]),
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

const failure = (value: unknown): CanonicalSetOrderPriorityFailure => {
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

const success = (value: unknown): CanonicalSetOrderPriorityResult | null => {
  const fields = record(value);
  const entityId = fields?.['entityId'];
  const version = fields?.['version'];
  const replayed = fields?.['replayed'];
  return typeof entityId === 'string' &&
    typeof version === 'number' &&
    typeof replayed === 'boolean'
    ? Object.freeze({ entityId, version, replayed })
    : null;
};

export const captureSetOrderPriorityOutcome = async (
  execute: (command: SetOrderPriorityCommand) => Promise<unknown>,
  input: SetOrderPriorityCommand,
): Promise<CanonicalSetOrderPriorityOutcome> => {
  try {
    const raw = await execute(input);
    const result = record(raw);
    if (result?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: failure(result['error']),
      });
    if (result?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: failure(result['failure']),
      });

    const value =
      result?.['tag'] === 'ok' || result?.['kind'] === 'success'
        ? result['value']
        : raw;
    const canonical = success(value);
    if (canonical !== null)
      return Object.freeze({ kind: 'success', value: canonical });

    return Object.freeze({
      kind: 'unexpected',
      error: failure({
        kind: 'invalid_result',
        code: 'invalid_set_order_priority_result',
        message: JSON.stringify(raw),
      }),
    });
  } catch (error) {
    return Object.freeze({ kind: 'unexpected', error: failure(error) });
  }
};

const sortOutcomes = (
  outcomes: readonly CanonicalSetOrderPriorityOutcome[],
): readonly CanonicalSetOrderPriorityOutcome[] =>
  Object.freeze(
    [...outcomes].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  );

export const runSetOrderPriorityScenario = async (
  execute: (command: SetOrderPriorityCommand) => Promise<unknown>,
  scenario: SetOrderPriorityScenario,
): Promise<readonly CanonicalSetOrderPriorityOutcome[]> => {
  if (scenario.executionMode === 'concurrent')
    return sortOutcomes(
      await Promise.all(
        scenario.commands.map((input) =>
          captureSetOrderPriorityOutcome(execute, input),
        ),
      ),
    );

  const outcomes: CanonicalSetOrderPriorityOutcome[] = [];
  for (const input of scenario.commands)
    outcomes.push(await captureSetOrderPriorityOutcome(execute, input));
  return Object.freeze(outcomes);
};
