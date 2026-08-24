import type { ResolveSourceClosedFulfillmentCommand } from '@pressly/production-system/operations/demand/resolve-source-closed-fulfillment/types';

export type ResolveSourceClosedFulfillmentConformanceExecution =
  | 'after_lock_concurrent'
  | 'concurrent'
  | 'sequential';

export type ResolveSourceClosedFulfillmentConformanceFixture = Readonly<{
  includeProjection?: boolean;
  resolutionState?: string;
  admissionState?: 'released' | 'unreleased' | 'withdrawn';
  commercialState?: 'canceled' | 'completed' | 'open';
  hasIntake?: boolean;
  hasCurrentSelection?: boolean;
  storedReceipt?: 'divergent' | 'exact';
  fault?:
    | 'candidate_query'
    | 'event_append'
    | 'invalid_admission_state'
    | 'late_cas';
}>;

export type ResolveSourceClosedFulfillmentConformanceScenario = Readonly<{
  name: string;
  execution: ResolveSourceClosedFulfillmentConformanceExecution;
  fixture: ResolveSourceClosedFulfillmentConformanceFixture;
  commands: readonly ResolveSourceClosedFulfillmentCommand[];
  normalizeOutcomeOrder?: boolean;
  normalizeWinningIdempotencyKey?: boolean;
}>;

export const resolveSourceClosedFulfillmentConformanceIds = Object.freeze({
  actor: '79000000-0000-4000-8000-000000000001',
  business: '79000000-0000-4000-8000-000000000002',
  fulfillment: '79000000-0000-4000-8000-000000000004',
  demand: '79000000-0000-4000-8000-000000000005',
  productionOrder: '79000000-0000-4000-8000-000000000006',
  shift: '79000000-0000-4000-8000-000000000007',
  receiptEvent: '79000000-0000-4000-8000-000000000008',
  workEvent: '79000000-0000-4000-8000-000000000009',
});

export const resolveSourceClosedFulfillmentConformanceLocationId =
  'resolve-source-closed-fulfillment-conformance';
export const resolveSourceClosedFulfillmentConformanceInitialTime = new Date(
  '2026-08-22T12:00:00.000Z',
);
export const resolveSourceClosedFulfillmentConformanceNow = new Date(
  '2026-08-22T16:00:00.000Z',
);
export const resolveSourceClosedFulfillmentConformanceDueAt = new Date(
  '2026-08-23T20:00:00.000Z',
);

const command = (
  idempotencyKey: string,
  overrides: Partial<ResolveSourceClosedFulfillmentCommand> = {},
): ResolveSourceClosedFulfillmentCommand => ({
  locationId: resolveSourceClosedFulfillmentConformanceLocationId,
  fulfillmentId: resolveSourceClosedFulfillmentConformanceIds.fulfillment,
  actorId: resolveSourceClosedFulfillmentConformanceIds.actor,
  idempotencyKey,
  ...overrides,
});

const scenario = (
  value: ResolveSourceClosedFulfillmentConformanceScenario,
): ResolveSourceClosedFulfillmentConformanceScenario => Object.freeze(value);

export const resolveSourceClosedFulfillmentConformanceScenarios: readonly ResolveSourceClosedFulfillmentConformanceScenario[] =
  Object.freeze([
    scenario({
      name: 'missing canonical fulfillment is a read-only not-found outcome',
      execution: 'sequential',
      fixture: { includeProjection: false },
      commands: [command('source-close-missing')],
    }),
    scenario({
      name: 'the lookup is location scoped even for an existing fulfillment',
      execution: 'sequential',
      fixture: {},
      commands: [
        command('source-close-wrong-location', {
          locationId: 'resolve-source-closed-other-location',
        }),
      ],
    }),
    scenario({
      name: 'the lookup accepts the canonical fulfillment identity only',
      execution: 'sequential',
      fixture: {},
      commands: [
        command('source-close-demand-id-is-not-fulfillment-id', {
          fulfillmentId: resolveSourceClosedFulfillmentConformanceIds.demand,
        }),
      ],
    }),
    scenario({
      name: 'resolved work is retained as an already-resolved no-op',
      execution: 'sequential',
      fixture: { resolutionState: 'resolved_without_production' },
      commands: [command('source-close-already-resolved')],
    }),
    scenario({
      name: 'unknown resolution lifecycle state requires review',
      execution: 'sequential',
      fixture: { resolutionState: 'invalid' },
      commands: [command('source-close-invalid-resolution')],
    }),
    ...(['completed', 'canceled'] as const).map((commercialState) =>
      scenario({
        name: `${commercialState} canonical order requires review`,
        execution: 'sequential',
        fixture: { commercialState },
        commands: [command(`source-close-commercial-${commercialState}`)],
      }),
    ),
    ...(['released', 'withdrawn'] as const).map((admissionState) =>
      scenario({
        name: `${admissionState} canonical fulfillment requires review`,
        execution: 'sequential',
        fixture: { admissionState },
        commands: [command(`source-close-admission-${admissionState}`)],
      }),
    ),
    scenario({
      name: 'untouched unreleased work resolves through the exact nested command',
      execution: 'sequential',
      fixture: {},
      commands: [command('source-close-resolve')],
    }),
    scenario({
      name: 'recorded intake maps the nested review failure without mutation',
      execution: 'sequential',
      fixture: { hasIntake: true },
      commands: [command('source-close-intake-review')],
    }),
    scenario({
      name: 'shift participation maps the nested blocked failure without mutation',
      execution: 'sequential',
      fixture: { hasCurrentSelection: true },
      commands: [command('source-close-participation-review')],
    }),
    scenario({
      name: 'an exact durable nested receipt replays without a second mutation',
      execution: 'sequential',
      fixture: { storedReceipt: 'exact' },
      commands: [command('source-close-stored-replay')],
    }),
    scenario({
      name: 'divergent durable receipt reuse maps to concurrent review',
      execution: 'sequential',
      fixture: { storedReceipt: 'divergent' },
      commands: [command('source-close-stored-divergence')],
    }),
    scenario({
      name: 'same-key concurrency reaches the nested after-lock replay',
      execution: 'after_lock_concurrent',
      fixture: {},
      commands: [
        command('source-close-same-key-race'),
        command('source-close-same-key-race'),
      ],
      normalizeOutcomeOrder: true,
    }),
    scenario({
      name: 'distinct-key same-version concurrency commits exactly once',
      execution: 'after_lock_concurrent',
      fixture: {},
      commands: [
        command('source-close-distinct-race-a'),
        command('source-close-distinct-race-b'),
      ],
      normalizeOutcomeOrder: true,
      normalizeWinningIdempotencyKey: true,
    }),
    scenario({
      name: 'a real late compare-and-swap miss maps to concurrent review',
      execution: 'sequential',
      fixture: { fault: 'late_cas' },
      commands: [command('source-close-late-cas')],
    }),
    scenario({
      name: 'work-event append failure rolls the nested transaction back',
      execution: 'sequential',
      fixture: { fault: 'event_append' },
      commands: [command('source-close-event-rollback')],
    }),
    scenario({
      name: 'candidate query failure maps unknown database faults at the outer edge',
      execution: 'sequential',
      fixture: { fault: 'candidate_query' },
      commands: [command('source-close-candidate-query-fault')],
    }),
    scenario({
      name: 'owned candidate-state AppError is preserved without remapping',
      execution: 'sequential',
      fixture: { fault: 'invalid_admission_state' },
      commands: [command('source-close-invalid-admission')],
    }),
  ]);
