export type ProductionCommandScenario =
  | 'success'
  | 'expected_rejection'
  | 'unexpected_rollback'
  | 'replay'
  | 'idempotency_conflict'
  | 'same_key_concurrency'
  | 'concurrent_version'
  | 'deterministic_preview'
  | 'signal_after_commit'
  | 'no_signal_on_replay';

export type ProductionCommandInventoryEntry = Readonly<{
  operationId: `production.${string}.v1`;
  cellKind: 'command' | 'query' | 'reaction';
  cellPath: `systems/production/src/cells/${string}`;
  runtime: 'http' | 'job' | 'composition' | 'cli';
  http: Readonly<{
    method: 'PATCH' | 'POST' | 'PUT';
    path: string;
    authorization: `production:${string}`;
    paramsContract: string;
    requestContract: string;
    resultContract: string;
  }> | null;
  contract: readonly string[];
  policyCapabilities: readonly string[];
  repositoryCapabilities: readonly string[];
  lockOrder: readonly string[];
  optimisticVersions: readonly string[];
  idempotency: Readonly<{
    required: boolean;
    replayChecks: readonly ('before_lock' | 'after_lock')[];
    receipt: 'work_event' | 'delegated_work_event' | 'none';
    branchSemantics?: readonly string[];
  }>;
  workEvents: readonly string[];
  signals: readonly string[];
  scenarios: readonly ProductionCommandScenario[];
}>;

const writeScenarios = [
  'success',
  'expected_rejection',
  'unexpected_rollback',
  'replay',
  'idempotency_conflict',
] as const;

/**
 * Permanent target-cell conformance inventory, not runtime registration.
 * Every entry anchors one deployed operation to its sole surviving owner.
 */
export const productionCommandInventory = [
  {
    operationId: 'production.apply-fulfillment-demand.v1',
    cellKind: 'reaction',
    cellPath: 'systems/production/src/cells/demand/apply-fulfillment-demand',
    runtime: 'job',
    http: null,
    contract: ['ApplyFulfillmentDemandCommand', 'ApplyFulfillmentDemandResult'],
    policyCapabilities: [
      'evaluateDemandLifecycle',
      'initialProductionOrderExecutionState',
      'resolveProductionOrderExecutionState',
      'deriveProductionOrderOperationalStatus',
    ],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'locationIsActive',
      'lockLocationScheduling',
      'lockFulfillment',
      'loadDemand',
      'applyDemand',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production-scheduling advisory lock by location',
      'fulfillment-demand advisory lock by fulfillment',
      'existing production order row for update when present',
    ],
    optimisticVersions: ['fulfillmentVersion plus projectionHash'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['fulfillment_demand_applied'],
    signals: [],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'same_key_concurrency',
    ],
  },
  {
    operationId: 'production.change-admission.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/demand/change-admission',
    runtime: 'http',
    http: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/admission',
      authorization: 'production:admission',
      paramsContract: 'productionOrderParamsSchema',
      requestContract: 'changeProductionAdmissionRequestSchema',
      resultContract: 'changeProductionAdmissionResultSchema',
    },
    contract: [
      'ChangeProductionAdmissionCommand',
      'ChangeProductionAdmissionResult',
    ],
    policyCapabilities: [
      'evaluateProductionOrderOperationalAccess',
      'evaluateProductionAdmission',
      'resolveProductionOrderExecutionState',
      'deriveProductionOrderOperationalStatus',
    ],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'lockLocationScheduling',
      'lockOrder',
      'changeAdmission',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production-scheduling advisory lock by location',
      'production order row for update',
    ],
    optimisticVersions: ['expectedVersion'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['production_admission_changed'],
    signals: [],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'same_key_concurrency',
    ],
  },
  {
    operationId: 'production.change-order-resolution.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/demand/change-order-resolution',
    runtime: 'http',
    http: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/resolution',
      authorization: 'production:override',
      paramsContract: 'productionOrderParamsSchema',
      requestContract: 'changeProductionOrderResolutionRequestSchema',
      resultContract: 'changeProductionOrderResolutionResultSchema',
    },
    contract: [
      'ChangeProductionOrderResolutionCommand',
      'ChangeProductionOrderResolutionResult',
    ],
    policyCapabilities: [
      'evaluateProductionOrderResolutionTransition',
      'resolveProductionOrderExecutionState',
      'evaluateProductionOrderResolutionGuard',
      'deriveProductionOrderOperationalStatus',
    ],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'lockLocationScheduling',
      'lockOrder',
      'changeResolution',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production-scheduling advisory lock by location',
      'production order row for update',
    ],
    optimisticVersions: ['expectedVersion'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: [
      'production_order_resolved_without_production',
      'production_order_restored',
    ],
    signals: [],
    scenarios: [...writeScenarios, 'concurrent_version'],
  },
  {
    operationId: 'production.resolve-source-closed-fulfillment.v1',
    cellKind: 'command',
    cellPath:
      'systems/production/src/cells/demand/resolve-source-closed-fulfillment',
    runtime: 'composition',
    http: null,
    contract: [
      'ResolveSourceClosedFulfillmentCommand',
      'ResolveSourceClosedFulfillmentResult',
    ],
    policyCapabilities: ['classifySourceClosedFulfillment'],
    repositoryCapabilities: [
      'findCandidate',
      'changeOrderResolution capability',
    ],
    lockOrder: [
      'unlocked location-scoped candidate read',
      'delegated change-order-resolution lock order',
    ],
    optimisticVersions: [
      'candidate productionVersion delegated as expectedVersion',
    ],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'delegated_work_event',
      branchSemantics: [
        'resolved writes replay through the delegated change-order-resolution receipt',
        'not-found, review-required, and historical already-resolved no-ops remain read-only reevaluations without an outer receipt',
      ],
    },
    workEvents: ['production_order_resolved_without_production (delegated)'],
    signals: [],
    scenarios: [...writeScenarios, 'concurrent_version'],
  },
  {
    operationId: 'production.record-order-intake.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/demand/record-order-intake',
    runtime: 'http',
    http: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/intake',
      authorization: 'production:intake',
      paramsContract: 'productionOrderParamsSchema',
      requestContract: 'recordOrderIntakeRequestSchema',
      resultContract: 'recordOrderIntakeResultSchema',
    },
    contract: ['RecordOrderIntakeCommand', 'RecordOrderIntakeResult'],
    policyCapabilities: [
      'evaluateProductionOrderOperationalAccess',
      'evaluateIntakeAdmission',
      'resolveProductionOrderExecutionState',
      'deriveProductionOrderOperationalStatus',
    ],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'lockLocationScheduling',
      'lockOrder',
      'recordIntake',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production-scheduling advisory lock by location',
      'production order row for update',
    ],
    optimisticVersions: [
      'expectedVersion only; current intakeVersion determines the next value but is not an independent SQL compare-and-swap predicate',
    ],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['production_order_intake_recorded'],
    signals: [],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'same_key_concurrency',
    ],
  },
  {
    operationId: 'production.commit-order-backlog.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/demand/commit-order-backlog',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/order-backlog',
      authorization: 'production:override',
      paramsContract: 'productionLocationParamsSchema',
      requestContract: 'commitProductionOrderBacklogRequestSchema',
      resultContract: 'productionOrderBacklogCommitResultSchema',
    },
    contract: [
      'CommitProductionOrderBacklogCommand',
      'ProductionOrderBacklogCommitResult',
    ],
    policyCapabilities: [
      'resolveProductionOrderExecutionState',
      'evaluateProductionOrderResolutionTransition',
      'evaluateProductionOrderResolutionGuard',
      'ProductionOrderBacklogCursorCodec',
    ],
    repositoryCapabilities: [
      'resultTransaction',
      'findWorkEvent',
      'lockLocationScheduling',
      'loadSnapshotForUpdate',
      'resolveOrder',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production-scheduling advisory lock by location',
      'bounded due-order snapshot rows for update in dueAt/id order',
    ],
    optimisticVersions: ['each candidate productionVersion', 'previewHash'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: [
      'production_order_bulk_resolved_without_production per changed order',
      'production_order_backlog_bulk_resolution_committed',
    ],
    signals: [],
    scenarios: [...writeScenarios, 'concurrent_version'],
  },
  {
    operationId: 'production.set-order-priority.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/demand/set-order-priority',
    runtime: 'http',
    http: {
      method: 'PATCH',
      path: '/production/locations/:locationId/orders/:productionOrderId/priority',
      authorization: 'production:priority',
      paramsContract: 'productionOrderParamsSchema',
      requestContract: 'setProductionOrderPriorityRequestSchema',
      resultContract: 'productionMutationResultSchema',
    },
    contract: ['SetProductionOrderPriorityCommand', 'ProductionMutationResult'],
    policyCapabilities: ['evaluateProductionOrderOperationalAccess'],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'lockLocationScheduling',
      'lockPriorityOrder',
      'setOrderPriority',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production-scheduling advisory lock by location',
      'production order row for update',
    ],
    optimisticVersions: ['expectedVersion'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['production_order_priority_changed'],
    signals: [],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'same_key_concurrency',
    ],
  },
  {
    operationId: 'production.assign-stage-machines.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/floor/assign-stage-machines',
    runtime: 'http',
    http: {
      method: 'PUT',
      path: '/production/locations/:locationId/stages/:stageRunId/machines',
      authorization: 'production:stage',
      paramsContract: 'productionStageParamsSchema',
      requestContract: 'assignStageMachinesRequestSchema',
      resultContract: 'productionMutationResultSchema',
    },
    contract: ['AssignStageMachinesCommand', 'ProductionMutationResult'],
    policyCapabilities: ['evaluateMachineAssignment'],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'loadStageTransitionContext',
      'assignStageMachines',
      'appendWorkEvent',
    ],
    lockOrder: [
      'identity read without lock',
      'production run row for update',
      'production batch row for update',
      'stage row for update',
      'stage attempts for update',
      'active batch memberships for update',
      'active production orders for update',
      'machines for update in id order',
    ],
    optimisticVersions: ['expectedVersion'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['machine_assigned'],
    signals: [],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'same_key_concurrency',
    ],
  },
  {
    operationId: 'production.freeze-batch-membership.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/floor/freeze-batch-membership',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
      authorization: 'production:queue',
      paramsContract: 'productionBatchParamsSchema',
      requestContract: 'freezeProductionBatchRequestSchema',
      resultContract: 'productionBatchMembershipMutationResultSchema',
    },
    contract: [
      'FreezeProductionBatchCommand',
      'ProductionBatchMembershipMutationResult',
    ],
    policyCapabilities: ['evaluateBatchMembershipTransition'],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'lockBatchMembershipContext',
      'changeBatchMembership',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production run row for update',
      'production batch row for update',
    ],
    optimisticVersions: ['expectedQueueVersion', 'expectedBatchVersion'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['batch_membership_frozen'],
    signals: [
      'batchFrozen after commit only',
      'queueConflict on queue conflict',
    ],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'signal_after_commit',
      'no_signal_on_replay',
    ],
  },
  {
    operationId: 'production.unfreeze-batch-membership.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/floor/unfreeze-batch-membership',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
      authorization: 'production:override',
      paramsContract: 'productionBatchParamsSchema',
      requestContract: 'unfreezeProductionBatchRequestSchema',
      resultContract: 'productionBatchMembershipMutationResultSchema',
    },
    contract: [
      'UnfreezeProductionBatchCommand',
      'ProductionBatchMembershipMutationResult',
    ],
    policyCapabilities: ['evaluateBatchMembershipTransition'],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'lockBatchMembershipContext',
      'changeBatchMembership',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production run row for update',
      'production batch row for update',
    ],
    optimisticVersions: ['expectedQueueVersion', 'expectedBatchVersion'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['batch_membership_unfrozen'],
    signals: ['queueConflict on queue conflict'],
    scenarios: [...writeScenarios, 'concurrent_version'],
  },
  {
    operationId: 'production.reconcile-batch-progress.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/floor/reconcile-batch-progress',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
      authorization: 'production:stage',
      paramsContract: 'productionBatchProgressReconciliationParamsSchema',
      requestContract: 'reconcileProductionBatchProgressRequestSchema',
      resultContract: 'productionBatchProgressReconciliationResultSchema',
    },
    contract: [
      'ReconcileProductionBatchProgressCommand',
      'ProductionBatchProgressReconciliationResult',
    ],
    policyCapabilities: [
      'evaluateProductionOrderOperationalAccess',
      'evaluateMachineAssignment',
      'evaluateFloorProgressReconciliation',
      'evaluateStageTransition',
      'evaluateProductionOrderStageAttemptTransition',
      'evaluateProductionBatchTransition',
      'resolveProductionOrderExecutionState',
      'evaluateProductionOrderExecutionTransition',
      'evaluateProductionRunTransition',
      'evaluateProductionShiftTransition',
    ],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'loadContext',
      'reconcile',
      'appendWorkEvent',
    ],
    lockOrder: [
      'production run row for update',
      'production batch row for update',
      'stage rows for update in planned-start order',
      'stage attempts for update',
      'active batch memberships for update',
      'active production orders for update',
    ],
    optimisticVersions: [
      'expectedQueueVersion',
      'expectedBatchVersion',
      'exact four expectedStageVersions',
      'confirmation proposalHash',
    ],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: ['batch_progress_reconciled'],
    signals: ['progressReconciled after committed reconciliation only'],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'signal_after_commit',
      'no_signal_on_replay',
    ],
  },
  {
    operationId: 'production.preview-order-route.v1',
    cellKind: 'query',
    cellPath: 'systems/production/src/cells/orders/preview-order-route',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
      authorization: 'production:stage',
      paramsContract: 'productionOrderRoutingParamsSchema',
      requestContract: 'previewProductionOrderRouteRequestSchema',
      resultContract: 'productionOrderRouteProposalSchema',
    },
    contract: [
      'PreviewProductionOrderRouteCommand',
      'ProductionOrderRouteProposal',
    ],
    policyCapabilities: [
      'evaluateProductionOrderOperationalAccess',
      'resolveProductionOrderExecutionState',
      'deriveOrderRoutingCurrentStage',
      'evaluateOrderRouting',
    ],
    repositoryCapabilities: ['transaction', 'loadContext unlocked snapshot'],
    lockOrder: [],
    optimisticVersions: [
      'expectedQueueVersion',
      'expectedOrderVersion',
      'expectedSourceBatchVersion',
    ],
    idempotency: { required: false, replayChecks: [], receipt: 'none' },
    workEvents: [],
    signals: ['orderRouteOutcome for proposed/rejected/conflict/failed'],
    scenarios: ['deterministic_preview', 'expected_rejection'],
  },
  {
    operationId: 'production.commit-order-route.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/orders/commit-order-route',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route',
      authorization: 'production:stage',
      paramsContract: 'productionOrderRoutingParamsSchema',
      requestContract: 'commitProductionOrderRouteRequestSchema',
      resultContract: 'commitProductionOrderRouteResultSchema',
    },
    contract: [
      'CommitProductionOrderRouteCommand',
      'CommitProductionOrderRouteResult',
    ],
    policyCapabilities: [
      'evaluateProductionOrderOperationalAccess',
      'resolveProductionOrderExecutionState',
      'deriveOrderRoutingCurrentStage',
      'evaluateOrderRouting',
      'evaluateProductionOrderStageAttemptTransition',
      'initialProductionOrderStageAttemptState',
    ],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent',
      'loadContext locked snapshot',
      'commit',
    ],
    lockOrder: [
      'production run row for update',
      'production order row for update',
      'active source membership row for update',
      'all run batch rows for update in sequence order',
      'all run stage rows for update in planned-start order',
      'planned machine assignment and machine rows for update in id order',
    ],
    optimisticVersions: [
      'expectedQueueVersion',
      'expectedOrderVersion',
      'expectedSourceBatchVersion',
      'recomputed proposalHash',
      'derived expectedTargetBatchVersion',
    ],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
    },
    workEvents: [
      'production_order_rebatched',
      'production_order_route_exception_recorded',
    ],
    signals: [
      'orderRouteOutcome for committed/replayed/rejected/conflict/failed',
      'queueConflict on queue conflict',
    ],
    scenarios: [
      ...writeScenarios,
      'concurrent_version',
      'signal_after_commit',
      'no_signal_on_replay',
    ],
  },
  {
    operationId: 'production.manage-resources.v1',
    cellKind: 'command',
    cellPath: 'systems/production/src/cells/resources/manage-resources',
    runtime: 'cli',
    http: null,
    contract: ['ProductionBootstrapCommand', 'ProductionBootstrapResult'],
    policyCapabilities: [
      'hashProductionBootstrapManifest',
      'cell-local compareResources',
    ],
    repositoryCapabilities: [
      'transaction',
      'findWorkEvent for apply only',
      'lockLocationScheduling',
      'loadResources',
      'applyResources',
    ],
    lockOrder: [
      'production-scheduling advisory lock by location',
      'location/station/machine/config unique-key upserts in one transaction',
    ],
    optimisticVersions: ['configurationHash'],
    idempotency: {
      required: true,
      replayChecks: ['before_lock', 'after_lock'],
      receipt: 'work_event',
      branchSemantics: [
        'dry-run bypasses receipt reads and writes but remains serialized by the location scheduling lock',
        'apply rechecks the receipt after acquiring the location scheduling lock',
      ],
    },
    workEvents: ['production_resources_bootstrapped on converged apply'],
    signals: [],
    scenarios: [...writeScenarios, 'same_key_concurrency'],
  },
] as const satisfies readonly ProductionCommandInventoryEntry[];
