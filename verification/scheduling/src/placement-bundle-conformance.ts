export type PlacementOperation = 'attempt' | 'automatic' | 'exact' | 'confirm';

export type PlacementFixture = Readonly<{
  runCount?: 0 | 1 | 2;
  mutableBatch?: 'mutable' | 'frozen' | 'full';
  arrivingWeightLbs?: number;
  shiftEnd?: 'normal' | 'overtime';
  command?: 'current' | 'stale_queue' | 'stale_batch';
  fault?: 'stage_cas' | 'order_cas' | 'run_cas' | 'event_append';
  signalFault?: boolean;
}>;

export type PlacementFlow =
  | 'attempt_once'
  | 'attempt_twice'
  | 'attempt_divergent_same_key'
  | 'automatic_once'
  | 'automatic_replay_divergence'
  | 'automatic_confirmation_replay'
  | 'automatic_same_key_race'
  | 'automatic_different_key_race'
  | 'exact_once'
  | 'exact_replay_divergence'
  | 'exact_same_key_race'
  | 'exact_different_key_race'
  | 'automatic_overtime_confirm'
  | 'automatic_overtime_confirm_replay'
  | 'automatic_overtime_stale'
  | 'exact_overtime_confirm';

export type PlacementConformanceScenario = Readonly<{
  name: string;
  fixture: PlacementFixture;
  flow: PlacementFlow;
  expectedOutcomeCodes: readonly string[];
  expectedNewEventCount: number;
  expectedClockReads: number;
  normalizeOutcomeOrder?: boolean;
}>;

const uuid = (suffix: number, prefix = 75000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const placementConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  otherActor: uuid(3),
  shiftA: uuid(4),
  shiftB: uuid(5),
  configA: uuid(6),
  configB: uuid(7),
  scheduleA: uuid(8),
  scheduleB: uuid(9),
  runA: uuid(10),
  runB: uuid(11),
  frozenBatch: uuid(12),
  mutableBatch: uuid(13),
  fulfillmentFrozen: uuid(18),
  fulfillmentQueued: uuid(19),
  fulfillmentA: uuid(20),
  fulfillmentB: uuid(21),
  demandFrozen: uuid(22),
  demandQueued: uuid(23),
  demandA: uuid(24),
  demandB: uuid(25),
  orderFrozen: uuid(26),
  orderQueued: uuid(27),
  orderA: uuid(28),
  orderB: uuid(29),
  sortingStation: uuid(30),
  washingStation: uuid(31),
  dryingStation: uuid(32),
  foldingStation: uuid(33),
  washer: uuid(34),
  dryer: uuid(35),
  frozenSorting: uuid(36),
  mutableSorting: uuid(37),
  mutableWashing: uuid(38),
  mutableDrying: uuid(39),
  mutableFolding: uuid(40),
  mutableWashingAssignment: uuid(41),
  mutableDryingAssignment: uuid(42),
});

export const placementConformanceLocationId = 'placement-conformance-location';
export const placementConformanceNow = new Date('2026-08-22T15:00:00.000Z');
export const placementConformanceStartsAt = new Date(
  '2026-08-22T13:00:00.000Z',
);
export const placementConformanceNormalEnd = new Date(
  '2026-08-22T22:00:00.000Z',
);
export const placementConformanceOvertimeEnd = new Date(
  '2026-08-22T16:00:00.000Z',
);

export type AttemptPlacementCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  actorId: string;
  authorizedAction: 'production:queue' | 'production:override';
  idempotencyKey: string;
}>;

export type AutomaticPlacementCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  expectedQueueVersion: number;
  actorId: string;
  authorizedAction: 'production:override';
  idempotencyKey: string;
}>;

export type ExactPlacementCommand = AutomaticPlacementCommand &
  Readonly<{
    productionBatchId: string;
    expectedBatchVersion: number;
  }>;

export type ConfirmOvertimeCommand = AutomaticPlacementCommand &
  Readonly<{ proposalHash: string }>;

export const makeAttemptPlacementCommand = (
  overrides: Partial<AttemptPlacementCommand> = {},
): AttemptPlacementCommand => ({
  locationId: placementConformanceLocationId,
  productionOrderId: placementConformanceIds.orderA,
  actorId: placementConformanceIds.actor,
  authorizedAction: 'production:queue',
  idempotencyKey: 'placement-attempt-1',
  ...overrides,
});

export const makeAutomaticPlacementCommand = (
  overrides: Partial<AutomaticPlacementCommand> = {},
): AutomaticPlacementCommand => ({
  locationId: placementConformanceLocationId,
  productionRunId: placementConformanceIds.runA,
  productionOrderId: placementConformanceIds.orderA,
  expectedQueueVersion: 1,
  actorId: placementConformanceIds.actor,
  authorizedAction: 'production:override',
  idempotencyKey: 'placement-automatic-1',
  ...overrides,
});

export const makeExactPlacementCommand = (
  overrides: Partial<ExactPlacementCommand> = {},
): ExactPlacementCommand => ({
  ...makeAutomaticPlacementCommand(),
  productionBatchId: placementConformanceIds.mutableBatch,
  expectedBatchVersion: 1,
  idempotencyKey: 'placement-exact-1',
  ...overrides,
});

export const makeConfirmOvertimeCommand = (
  proposalHash: string,
  overrides: Partial<ConfirmOvertimeCommand> = {},
): ConfirmOvertimeCommand => ({
  ...makeAutomaticPlacementCommand(),
  proposalHash,
  idempotencyKey: 'placement-confirm-1',
  ...overrides,
});

export type CanonicalPlacementFailure = Readonly<{
  kind: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalPlacementOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: CanonicalPlacementFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalPlacementFailure }>;

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const canonicalFailure = (value: unknown): CanonicalPlacementFailure => {
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

export const capturePlacementOutcome = async (
  execute: () => Promise<unknown>,
): Promise<CanonicalPlacementOutcome> => {
  try {
    const outcome = record(await execute());
    if (outcome?.['tag'] === 'ok' || outcome?.['kind'] === 'success')
      return { kind: 'success', value: outcome['value'] ?? null };
    if (outcome?.['tag'] === 'err' || outcome?.['kind'] === 'failure')
      return {
        kind: 'failure',
        failure: canonicalFailure(outcome['error'] ?? outcome['failure']),
      };
    return { kind: 'unexpected', error: canonicalFailure(outcome) };
  } catch (error) {
    return { kind: 'unexpected', error: canonicalFailure(error) };
  }
};

export const placementOutcomeCode = (
  outcome: CanonicalPlacementOutcome,
): string => {
  if (outcome.kind === 'failure') return `failure:${outcome.failure.code}`;
  if (outcome.kind === 'unexpected') return `unexpected:${outcome.error.code}`;
  if (outcome.value === null) return 'success:null';
  const value = record(outcome.value);
  const status = value?.['status'];
  const replayed = value?.['replayed'];
  if (typeof status !== 'string') return 'success:unknown';
  if (status === 'placed')
    return `success:placed:${replayed === true ? 'replay' : 'fresh'}`;
  if (status === 'confirmation_required')
    return `success:confirmation_required:${replayed === true ? 'replay' : 'fresh'}`;
  if (status === 'not_placed')
    return `success:not_placed:${String(value?.['reason'] ?? 'unknown')}:${replayed === true ? 'replay' : 'fresh'}`;
  return `success:${status}`;
};

export const placementConformanceScenarios: readonly PlacementConformanceScenario[] =
  Object.freeze([
    {
      name: 'headless attempt records no-started-run pending state',
      fixture: { runCount: 0 },
      flow: 'attempt_once',
      expectedOutcomeCodes: ['success:null'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'headless attempt records sorted ambiguous-run pending state',
      fixture: { runCount: 2 },
      flow: 'attempt_once',
      expectedOutcomeCodes: ['success:null'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'headless attempt delegates the sole run and binds replay to the discovered queue version',
      fixture: {},
      flow: 'attempt_twice',
      expectedOutcomeCodes: [
        'success:placed:fresh',
        'failure:production_idempotency_conflict',
      ],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'headless ambiguous branch rejects divergent same-key reuse',
      fixture: { runCount: 2 },
      flow: 'attempt_divergent_same_key',
      expectedOutcomeCodes: [
        'success:null',
        'failure:production_idempotency_conflict',
      ],
      expectedNewEventCount: 1,
      expectedClockReads: 2,
    },
    {
      name: 'automatic placement commits into an existing mutable batch',
      fixture: {},
      flow: 'automatic_once',
      expectedOutcomeCodes: ['success:placed:fresh'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'automatic placement appends a new batch without moving existing orders',
      fixture: { mutableBatch: 'frozen' },
      flow: 'automatic_once',
      expectedOutcomeCodes: ['success:placed:fresh'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'automatic placement durably records an oversized-order rejection',
      fixture: { arrivingWeightLbs: 120 },
      flow: 'automatic_once',
      expectedOutcomeCodes: ['success:not_placed:hard_capacity_exceeded:fresh'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'automatic placement records a queue-version rejection',
      fixture: { command: 'stale_queue' },
      flow: 'automatic_once',
      expectedOutcomeCodes: ['success:not_placed:queue_conflict:fresh'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'automatic placement replays then rejects divergent same-key reuse',
      fixture: {},
      flow: 'automatic_replay_divergence',
      expectedOutcomeCodes: [
        'success:placed:fresh',
        'success:placed:replay',
        'failure:production_idempotency_conflict',
      ],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'automatic overtime replay preserves the presentation-invalid confirmation quirk',
      fixture: { shiftEnd: 'overtime' },
      flow: 'automatic_confirmation_replay',
      expectedOutcomeCodes: [
        'success:confirmation_required:fresh',
        'success:confirmation_required:replay',
      ],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'same-key automatic contenders resolve as one commit and one second-check replay',
      fixture: {},
      flow: 'automatic_same_key_race',
      expectedOutcomeCodes: ['success:placed:fresh', 'success:placed:replay'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
      normalizeOutcomeOrder: true,
    },
    {
      name: 'different-key automatic contenders serialize on the queue version',
      fixture: {},
      flow: 'automatic_different_key_race',
      expectedOutcomeCodes: [
        'success:placed:fresh',
        'success:not_placed:queue_conflict:fresh',
      ],
      expectedNewEventCount: 2,
      expectedClockReads: 2,
      normalizeOutcomeOrder: true,
    },
    {
      name: 'exact placement commits the manager pin into the selected batch',
      fixture: {},
      flow: 'exact_once',
      expectedOutcomeCodes: ['success:placed:fresh'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'exact placement audits a stale target batch version before proposal',
      fixture: { command: 'stale_batch' },
      flow: 'exact_once',
      expectedOutcomeCodes: ['success:not_placed:queue_conflict:fresh'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'exact placement records immutable-target rejection',
      fixture: { mutableBatch: 'frozen' },
      flow: 'exact_once',
      expectedOutcomeCodes: ['success:not_placed:no_mutable_position:fresh'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'exact placement replays then rejects divergent target identity',
      fixture: {},
      flow: 'exact_replay_divergence',
      expectedOutcomeCodes: [
        'success:placed:fresh',
        'success:placed:replay',
        'failure:production_idempotency_conflict',
      ],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
    {
      name: 'same-key exact contenders resolve as one commit and one second-check replay',
      fixture: {},
      flow: 'exact_same_key_race',
      expectedOutcomeCodes: ['success:placed:fresh', 'success:placed:replay'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
      normalizeOutcomeOrder: true,
    },
    {
      name: 'different-key exact contenders serialize on the queue version',
      fixture: {},
      flow: 'exact_different_key_race',
      expectedOutcomeCodes: [
        'success:placed:fresh',
        'success:not_placed:queue_conflict:fresh',
      ],
      expectedNewEventCount: 2,
      expectedClockReads: 2,
      normalizeOutcomeOrder: true,
    },
    {
      name: 'automatic overtime confirmation recomputes and commits the stored proposal',
      fixture: { shiftEnd: 'overtime' },
      flow: 'automatic_overtime_confirm',
      expectedOutcomeCodes: [
        'success:confirmation_required:fresh',
        'success:placed:fresh',
      ],
      expectedNewEventCount: 2,
      expectedClockReads: 2,
    },
    {
      name: 'automatic overtime confirmation replays only after stored-proposal and lock reads',
      fixture: { shiftEnd: 'overtime' },
      flow: 'automatic_overtime_confirm_replay',
      expectedOutcomeCodes: [
        'success:confirmation_required:fresh',
        'success:placed:fresh',
        'success:placed:replay',
      ],
      expectedNewEventCount: 2,
      expectedClockReads: 2,
    },
    {
      name: 'automatic overtime confirmation records stale proposal after queue drift',
      fixture: { shiftEnd: 'overtime' },
      flow: 'automatic_overtime_stale',
      expectedOutcomeCodes: [
        'success:confirmation_required:fresh',
        'success:not_placed:proposal_stale:fresh',
      ],
      expectedNewEventCount: 2,
      expectedClockReads: 2,
    },
    {
      name: 'manager-exact overtime confirmation recovers and commits the pinned mode',
      fixture: { shiftEnd: 'overtime' },
      flow: 'exact_overtime_confirm',
      expectedOutcomeCodes: [
        'success:confirmation_required:fresh',
        'success:placed:fresh',
      ],
      expectedNewEventCount: 2,
      expectedClockReads: 2,
    },
    ...(
      [
        ['stage_cas', 'production_placement_stage_version_conflict'],
        ['order_cas', 'production_placement_order_version_conflict'],
        ['run_cas', 'production_placement_queue_version_conflict'],
      ] as const
    ).map(
      ([fault, code]): PlacementConformanceScenario => ({
        name: `${fault} rolls back the complete automatic placement graph`,
        fixture: { fault },
        flow: 'automatic_once',
        expectedOutcomeCodes: [`failure:${code}`],
        expectedNewEventCount: 0,
        expectedClockReads: 1,
      }),
    ),
    {
      name: 'late event append failure rolls back every placement mutation',
      fixture: { fault: 'event_append' },
      flow: 'automatic_once',
      expectedOutcomeCodes: ['unexpected:production_order_placement_failed'],
      expectedNewEventCount: 0,
      expectedClockReads: 1,
    },
    {
      name: 'post-commit placement signal failure cannot roll back durable state',
      fixture: { signalFault: true },
      flow: 'automatic_once',
      expectedOutcomeCodes: ['unexpected:unknown_error'],
      expectedNewEventCount: 1,
      expectedClockReads: 1,
    },
  ]);
