import type { CommitOrderRouteCommand } from '@pressly/production-system/operations/orders/commit-order-route/types';

export type CommitOrderRouteConformanceFixture =
  | 'completed_run'
  | 'disabled_capacity'
  | 'hard_capacity'
  | 'in_flight'
  | 'queued'
  | 'resolved_order'
  | 'sole_source_order';

export type CommitOrderRouteConformanceMutation =
  | 'none'
  | 'receipt_id_collision'
  | 'target_version';

export type CommitOrderRouteConformanceExecution = 'concurrent' | 'sequential';

export type CommitOrderRouteConformanceExpectedOutcome = Readonly<{
  kind: 'failure' | 'success' | 'unexpected';
  code?: string;
  replayed?: boolean;
}>;

export type CommitOrderRouteConformanceScenario = Readonly<{
  name: string;
  fixture: CommitOrderRouteConformanceFixture;
  mutation: CommitOrderRouteConformanceMutation;
  execution: CommitOrderRouteConformanceExecution;
  commands: (proposalHash: string) => readonly CommitOrderRouteCommand[];
  expectedOutcomes: readonly CommitOrderRouteConformanceExpectedOutcome[];
  normalizeOutcomeOrder?: boolean;
  normalizeWinningActor?: boolean;
  normalizeWinningIdempotencyKey?: boolean;
}>;

export const commitOrderRouteConformanceLocationId = 'commit-route-conformance';
export const commitOrderRouteConformanceOtherLocationId =
  'commit-route-other-location';
export const commitOrderRouteConformanceNow = new Date(
  '2026-08-21T15:00:00.000Z',
);

const uuid = (suffix: number): string =>
  `71000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const commitOrderRouteConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  alternateActor: uuid(3),
  shift: uuid(4),
  schedulerConfig: uuid(5),
  scheduleRun: uuid(6),
  productionRun: uuid(7),
  sourceBatch: uuid(8),
  earlyTargetBatch: uuid(9),
  lateTargetBatch: uuid(10),
  sourceOrder: uuid(11),
  sourceAnchorOrder: uuid(12),
  earlyTargetOrder: uuid(13),
  lateTargetOrder: uuid(14),
  missingOrder: uuid(15),
  externalOrders: Object.freeze([uuid(20), uuid(21), uuid(22), uuid(23)]),
  fulfillments: Object.freeze([uuid(30), uuid(31), uuid(32), uuid(33)]),
  demands: Object.freeze([uuid(40), uuid(41), uuid(42), uuid(43)]),
  stations: Object.freeze({
    sorting: uuid(50),
    washing: uuid(51),
    drying: uuid(52),
    folding_packaging: uuid(53),
  }),
  washer: uuid(54),
  dryer: uuid(55),
  sourceStages: Object.freeze({
    sorting: uuid(60),
    washing: uuid(61),
    drying: uuid(62),
    folding_packaging: uuid(63),
  }),
  earlyTargetStages: Object.freeze({
    sorting: uuid(70),
    washing: uuid(71),
    drying: uuid(72),
    folding_packaging: uuid(73),
  }),
  lateTargetStages: Object.freeze({
    sorting: uuid(80),
    washing: uuid(81),
    drying: uuid(82),
    folding_packaging: uuid(83),
  }),
  routedMembership: uuid(90),
  routedAttempts: Object.freeze([uuid(91), uuid(92), uuid(93), uuid(94)]),
  routedEvent: uuid(95),
});

const queued = (
  proposalHash: string,
  idempotencyKey: string,
  input: Partial<
    Pick<
      Extract<CommitOrderRouteCommand, { kind: 'queued_move' }>,
      | 'actorId'
      | 'expectedOrderVersion'
      | 'expectedQueueVersion'
      | 'expectedSourceBatchVersion'
      | 'locationId'
      | 'productionOrderId'
      | 'proposalHash'
    >
  > = {},
): CommitOrderRouteCommand => ({
  locationId: input.locationId ?? commitOrderRouteConformanceLocationId,
  productionRunId: commitOrderRouteConformanceIds.productionRun,
  productionOrderId:
    input.productionOrderId ?? commitOrderRouteConformanceIds.sourceOrder,
  actorId: input.actorId ?? commitOrderRouteConformanceIds.actor,
  authorizedAction: 'production:stage',
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: commitOrderRouteConformanceIds.lateTargetBatch,
  restartStage: 'sorting',
  expectedQueueVersion: input.expectedQueueVersion ?? 4,
  expectedOrderVersion: input.expectedOrderVersion ?? 3,
  expectedSourceBatchVersion: input.expectedSourceBatchVersion ?? 2,
  proposalHash: input.proposalHash ?? proposalHash,
  idempotencyKey,
});

const inFlight = (
  proposalHash: string,
  idempotencyKey: string,
): CommitOrderRouteCommand => ({
  locationId: commitOrderRouteConformanceLocationId,
  productionRunId: commitOrderRouteConformanceIds.productionRun,
  productionOrderId: commitOrderRouteConformanceIds.sourceOrder,
  actorId: commitOrderRouteConformanceIds.actor,
  authorizedAction: 'production:stage',
  kind: 'exception',
  reason: 'rewash_required',
  restartStage: 'washing',
  note: '  Rewash verified.  ',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
  proposalHash,
  idempotencyKey,
});

const one = (
  name: string,
  input: Omit<CommitOrderRouteConformanceScenario, 'commands' | 'name'> &
    Readonly<{
      command: (proposalHash: string) => CommitOrderRouteCommand;
    }>,
): CommitOrderRouteConformanceScenario => ({
  name,
  fixture: input.fixture,
  mutation: input.mutation,
  execution: input.execution,
  commands: (proposalHash) => [input.command(proposalHash)],
  expectedOutcomes: input.expectedOutcomes,
  ...(input.normalizeOutcomeOrder === undefined
    ? {}
    : { normalizeOutcomeOrder: input.normalizeOutcomeOrder }),
  ...(input.normalizeWinningActor === undefined
    ? {}
    : { normalizeWinningActor: input.normalizeWinningActor }),
  ...(input.normalizeWinningIdempotencyKey === undefined
    ? {}
    : {
        normalizeWinningIdempotencyKey: input.normalizeWinningIdempotencyKey,
      }),
});

const success = Object.freeze({ kind: 'success', replayed: false } as const);
const replay = Object.freeze({ kind: 'success', replayed: true } as const);
const failure = (code: string): CommitOrderRouteConformanceExpectedOutcome => ({
  kind: 'failure',
  code,
});
const unexpected = Object.freeze({
  kind: 'unexpected',
  code: 'production_order_route_failed',
} as const);

const exactReplayCommands = (proposalHash: string) => {
  const command = queued(proposalHash, 'commit-route-conformance-exact-replay');
  return [command, command] as const;
};

export const commitOrderRouteConformanceScenarios: readonly CommitOrderRouteConformanceScenario[] =
  Object.freeze([
    one('queued move commits the complete whole-order graph', {
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) => queued(hash, 'commit-route-conformance-queued'),
      expectedOutcomes: [success],
    }),
    one('in-flight rework preserves completed work and assigns the suffix', {
      fixture: 'in_flight',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) => inFlight(hash, 'commit-route-conformance-in-flight'),
      expectedOutcomes: [success],
    }),
    one('missing route identity is concealed as not found', {
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-missing', {
          productionOrderId: commitOrderRouteConformanceIds.missingOrder,
        }),
      expectedOutcomes: [failure('production_order_route_not_found')],
    }),
    one('cross-location route identity is concealed as not found', {
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-cross-location', {
          locationId: commitOrderRouteConformanceOtherLocationId,
        }),
      expectedOutcomes: [failure('production_order_route_not_found')],
    }),
    one('completed runs reject routing before mutation', {
      fixture: 'completed_run',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) => queued(hash, 'commit-route-conformance-run-state'),
      expectedOutcomes: [failure('production_run_not_started')],
    }),
    one('resolved orders reject operational routing', {
      fixture: 'resolved_order',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) => queued(hash, 'commit-route-conformance-resolved'),
      expectedOutcomes: [failure('production_order_resolved')],
    }),
    one('routing cannot empty the source batch', {
      fixture: 'sole_source_order',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) => queued(hash, 'commit-route-conformance-empty-source'),
      expectedOutcomes: [failure('source_batch_would_be_empty')],
    }),
    one('stale queue version has first conflict precedence', {
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-stale-queue', {
          expectedQueueVersion: 3,
        }),
      expectedOutcomes: [failure('production_queue_version_conflict')],
    }),
    one('stale order version follows the queue fence', {
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-stale-order', {
          expectedOrderVersion: 2,
        }),
      expectedOutcomes: [failure('production_order_version_conflict')],
    }),
    one('stale source batch version follows the order fence', {
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-stale-source', {
          expectedSourceBatchVersion: 1,
        }),
      expectedOutcomes: [failure('production_batch_version_conflict')],
    }),
    one('stale proposal hash rejects the recomputed route', {
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-stale-hash', {
          proposalHash: 'f'.repeat(64),
        }),
      expectedOutcomes: [failure('production_order_route_proposal_stale')],
    }),
    one('target version drift is transitively fenced by the proposal hash', {
      fixture: 'queued',
      mutation: 'target_version',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-target-version'),
      expectedOutcomes: [failure('production_order_route_proposal_stale')],
    }),
    one('hard target capacity is a semantic rejection', {
      fixture: 'hard_capacity',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) => queued(hash, 'commit-route-conformance-capacity'),
      expectedOutcomes: [failure('hard_capacity_exceeded')],
    }),
    one('disabled machine capacity invalidates the target graph', {
      fixture: 'disabled_capacity',
      mutation: 'none',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-disabled-capacity'),
      expectedOutcomes: [failure('target_stage_graph_invalid')],
    }),
    {
      name: 'same key and payload replays the exact durable receipt',
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      commands: exactReplayCommands,
      expectedOutcomes: [success, replay],
    },
    {
      name: 'same key and different actor is an idempotency conflict',
      fixture: 'queued',
      mutation: 'none',
      execution: 'sequential',
      commands: (hash) => [
        queued(hash, 'commit-route-conformance-divergent'),
        queued(hash, 'commit-route-conformance-divergent', {
          actorId: commitOrderRouteConformanceIds.alternateActor,
        }),
      ],
      expectedOutcomes: [success, failure('production_idempotency_conflict')],
    },
    {
      name: 'identical concurrent retries commit once and replay once',
      fixture: 'queued',
      mutation: 'none',
      execution: 'concurrent',
      commands: exactReplayCommands,
      expectedOutcomes: [success, replay],
      normalizeOutcomeOrder: true,
    },
    {
      name: 'divergent same-key concurrent retries commit once and conflict once',
      fixture: 'queued',
      mutation: 'none',
      execution: 'concurrent',
      commands: (hash) => [
        queued(hash, 'commit-route-conformance-divergent-race'),
        queued(hash, 'commit-route-conformance-divergent-race', {
          actorId: commitOrderRouteConformanceIds.alternateActor,
        }),
      ],
      expectedOutcomes: [success, failure('production_idempotency_conflict')],
      normalizeOutcomeOrder: true,
      normalizeWinningActor: true,
    },
    {
      name: 'different-key same-version race commits exactly one route',
      fixture: 'queued',
      mutation: 'none',
      execution: 'concurrent',
      commands: (hash) => [
        queued(hash, 'commit-route-conformance-race-a'),
        queued(hash, 'commit-route-conformance-race-b'),
      ],
      expectedOutcomes: [success, failure('production_queue_version_conflict')],
      normalizeOutcomeOrder: true,
      normalizeWinningIdempotencyKey: true,
    },
    one('late receipt collision rolls back the complete graph', {
      fixture: 'queued',
      mutation: 'receipt_id_collision',
      execution: 'sequential',
      command: (hash) =>
        queued(hash, 'commit-route-conformance-receipt-collision'),
      expectedOutcomes: [unexpected],
    }),
  ]);
