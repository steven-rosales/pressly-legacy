export type SchedulingInventoryHttpBoundary = Readonly<{
  method: 'GET' | 'PATCH' | 'POST' | 'PUT';
  path: string;
  authentication: 'required';
  authorization:
    | 'production:accept'
    | 'production:override'
    | 'production:read'
    | 'production:schedule'
    | 'production:start';
  boundaryOrder: readonly (
    | 'authentication'
    | 'body'
    | 'params'
    | 'authorization'
  )[];
  paramsContract: string;
  requestContract: string | null;
  resultContract: string;
  successStatus: 200 | 201;
}>;

export type SchedulingInventorySourceAnchor = Readonly<{
  file: string;
  contains: readonly string[];
}>;

export type SchedulingInventoryEntry = Readonly<{
  operationId: `production.${string}.v1`;
  kind: 'command' | 'query' | 'reaction';
  runtime: 'composition' | 'http';
  http: SchedulingInventoryHttpBoundary | null;
  contracts: readonly string[];
  policies: readonly string[];
  repositoryCapabilities: readonly string[];
  transaction: 'none' | 'required';
  locks: readonly string[];
  optimisticVersions: readonly string[];
  idempotency: Readonly<{
    required: boolean;
    replayChecks: readonly ('before_lock' | 'after_lock')[];
    receipt: 'none' | 'work_event';
    branchSemantics?: readonly string[];
  }>;
  workEvents: readonly string[];
  signals: readonly string[];
  sqlSemantics: readonly string[];
  cursor: string;
  processorOwnership: Readonly<{
    httpOwner: 'none' | 'production-system';
    consumer: 'processor' | 'production-composition';
    client: 'generated' | 'handwritten' | 'none';
    consumerAnchor: SchedulingInventorySourceAnchor | null;
  }>;
  complexity: Readonly<{
    score: 1 | 2 | 3 | 4 | 5 | 6;
    reasons: readonly string[];
  }>;
  evidence: readonly string[];
  sourceAnchors: readonly SchedulingInventorySourceAnchor[];
}>;

const bodyThenParams = [
  'authentication',
  'body',
  'params',
  'authorization',
] as const;

const noIdempotency = {
  required: false,
  replayChecks: [],
  receipt: 'none',
} as const;

const oneReplayCheck = {
  required: true,
  replayChecks: ['before_lock'],
  receipt: 'work_event',
} as const;

const twoReplayChecks = {
  required: true,
  replayChecks: ['before_lock', 'after_lock'],
  receipt: 'work_event',
} as const;

const processorHttp = (adapterMember: string) =>
  ({
    httpOwner: 'production-system',
    consumer: 'processor',
    client: 'generated',
    consumerAnchor: {
      file: 'topology/runtime/browser/processor.ts',
      contains: [`const ${adapterMember} =`, `${adapterMember},`],
    },
  }) as const;

/** Current scheduling conformance inventory for Production-owned operations. */
export const productionSchedulingInventory = Object.freeze([
  {
    operationId: 'production.publish-scheduler-config.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/scheduler-configs',
      authentication: 'required',
      authorization: 'production:schedule',
      boundaryOrder: bodyThenParams,
      paramsContract: 'productionLocationParamsSchema',
      requestContract: 'publishSchedulerConfigRequestSchema',
      resultContract: 'schedulerConfigSchema',
      successStatus: 201,
    },
    contracts: ['PublishSchedulerConfigCommand', 'SchedulerConfig'],
    policies: [
      'positive pulseMinutes and foldLbsPerFolderMinute',
      'fixed-pulse-ffd-v2 algorithm identity',
      'all three stage-fit assertions must be true at the wire boundary',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'lockLocationScheduling',
      'nextSchedulerConfigVersion',
      'saveSchedulerConfig',
      'appendWorkEvent',
    ],
    transaction: 'required',
    locks: ['location scheduling advisory lock'],
    optimisticVersions: [
      'next version is latest location version plus one inside the location lock',
      'database unique location/version constraint remains the final integrity backstop',
    ],
    idempotency: twoReplayChecks,
    workEvents: ['scheduler_config_published'],
    signals: [],
    sqlSemantics: [
      'latest scheduler config version ordered DESC and limited to one',
      'scheduler config and work-event receipt commit atomically',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const publishConfig = makePublishSchedulerConfigClient',
          'operation: input.operations.publishSchedulerConfig',
          'publishConfig,',
        ],
      },
    },
    complexity: {
      score: 2,
      reasons: [
        'single config insert plus serialized monotonic version',
        'location lock coordinates plan and config writers',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/publish-scheduler-config/contract.spec.ts',
      'systems/production/src/cells/scheduling/publish-scheduler-config/execute.spec.ts',
      'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.int.spec.ts',
      'verification/scheduling/test/publish-scheduler-config.conformance.int.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/publish-scheduler-config/http.ts',
        contains: [
          "'/production/locations/:locationId/scheduler-configs'",
          'const body = publishSchedulerConfigRequestSchema.safeParse(request.body)',
          'const params = productionLocationParamsSchema.safeParse',
          'decodeAuthorizationScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/publish-scheduler-config/execute.ts',
        contains: [
          'await repo.lockLocationScheduling(command.locationId)',
          'const lockedReplay =',
          'version: await repo.nextSchedulerConfigVersion(command.locationId)',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.ts',
        contains: [
          "pg_advisory_xact_lock(hashtext('production-scheduling')",
          'desc(schema.schedulerConfigs.version)',
          '.insert(schema.schedulerConfigs)',
        ],
      },
    ],
  },
  {
    operationId: 'production.create-shift.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/shifts',
      authentication: 'required',
      authorization: 'production:schedule',
      boundaryOrder: bodyThenParams,
      paramsContract: 'productionLocationParamsSchema',
      requestContract: 'createProductionShiftRequestSchema',
      resultContract: 'productionShiftSchema',
      successStatus: 201,
    },
    contracts: ['CreateProductionShiftCommand', 'ProductionShift'],
    policies: [
      'shift end is strictly after shift start',
      'initialProductionShiftState',
    ],
    repositoryCapabilities: ['findWorkEvent', 'saveShift', 'appendWorkEvent'],
    transaction: 'required',
    locks: [],
    optimisticVersions: ['new shift begins at version 1'],
    idempotency: oneReplayCheck,
    workEvents: ['production_shift_created'],
    signals: [],
    sqlSemantics: [
      'single production_shifts insert',
      'shift insert and work-event receipt commit atomically',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const createShift = makeCreateShiftClient',
          'operation: input.operations.createShift',
          'createShift,',
        ],
      },
    },
    complexity: {
      score: 1,
      reasons: [
        'one pure window decision',
        'one aggregate insert',
        'no lock or caller version',
      ],
    },
    evidence: [
      'verification/topology/contract-schema-compatibility.test.ts',
      'systems/production/src/cells/scheduling/create-shift/contract.spec.ts',
      'systems/production/src/cells/scheduling/create-shift/execute.spec.ts',
      'systems/production/src/cells/scheduling/create-shift/postgres.int.spec.ts',
      'verification/scheduling/test/create-shift.conformance.int.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/create-shift/http.ts',
        contains: [
          "'/production/locations/:locationId/shifts'",
          'const body = createProductionShiftRequestSchema.safeParse(request.body)',
          'const params = productionLocationParamsSchema.safeParse',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/create-shift/decide.ts',
        contains: ['decideCreateShift', 'initialProductionShiftState'],
      },
      {
        file: 'systems/production/src/cells/scheduling/create-shift/postgres.ts',
        contains: [
          'defineResultUnitOfWork',
          '.insert(schema.productionShifts)',
          'appendCreateShiftWorkEvent',
        ],
      },
    ],
  },
  {
    operationId: 'production.update-shift.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'PATCH',
      path: '/production/locations/:locationId/shifts/:productionShiftId',
      authentication: 'required',
      authorization: 'production:schedule',
      boundaryOrder: bodyThenParams,
      paramsContract: 'productionShiftParamsSchema',
      requestContract: 'updateProductionShiftRequestSchema',
      resultContract: 'updateProductionShiftResultSchema',
      successStatus: 200,
    },
    contracts: ['UpdateProductionShiftCommand', 'UpdateProductionShiftResult'],
    policies: [
      'shift window validity',
      'changedProductionShiftFields',
      'evaluateScheduleRevisionTransition supersede',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'lockLocationScheduling',
      'lockShift',
      'productionRunExists',
      'updateShift',
      'lockCurrentSchedule',
      'supersedeCurrentSchedule',
      'appendWorkEvent',
    ],
    transaction: 'required',
    locks: [
      'location scheduling advisory lock',
      'production shift row FOR UPDATE',
      'current draft/accepted schedule row FOR UPDATE',
    ],
    optimisticVersions: [
      'expectedVersion matches locked shift',
      'conditional shift update increments version',
      'current schedule lifecycle from-state guards supersession',
    ],
    idempotency: twoReplayChecks,
    workEvents: ['production_shift_updated'],
    signals: ['planSuperseded after commit, never on replay or no-op'],
    sqlSemantics: [
      'production run existence freezes updates',
      'changed shift invalidates the current draft or accepted schedule',
      'unchanged request still records an idempotent audit event',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const updateShift = makeUpdateShiftClient',
          'operation: input.operations.updateShift',
          'updateShift,',
        ],
      },
    },
    complexity: {
      score: 4,
      reasons: [
        'optimistic aggregate update',
        'conditional schedule supersession',
        'post-commit signal',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/update-shift/contract.spec.ts',
      'systems/production/src/cells/scheduling/update-shift/execute.spec.ts',
      'systems/production/src/cells/scheduling/update-shift/postgres.int.spec.ts',
      'verification/scheduling/test/update-shift.contract-conformance.test.ts',
      'verification/scheduling/test/update-shift.conformance.int.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/update-shift/http.ts',
        contains: [
          "'/production/locations/:locationId/shifts/:productionShiftId'",
          'validatedRequest(request)',
          'http.validatedPathScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/update-shift/execute.ts',
        contains: [
          'await repo.lockLocationScheduling(command.locationId)',
          'decideUpdateShiftEligibility',
          'deps.signals?.planSuperseded()',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/update-shift/postgres.ts',
        contains: [
          "pg_advisory_xact_lock(hashtext('production-scheduling')",
          ".for('update')",
          'eq(schema.productionShifts.version, command.expectedVersion)',
        ],
      },
    ],
  },
  {
    operationId: 'production.replace-shift-selection.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'PUT',
      path: '/production/locations/:locationId/shifts/:productionShiftId/selection',
      authentication: 'required',
      authorization: 'production:schedule',
      boundaryOrder: bodyThenParams,
      paramsContract: 'productionShiftParamsSchema',
      requestContract: 'replaceProductionShiftSelectionRequestSchema',
      resultContract: 'replaceProductionShiftSelectionResultSchema',
      successStatus: 200,
    },
    contracts: ['ReplaceShiftSelectionCommand', 'ReplaceShiftSelectionResult'],
    policies: [
      'sort and de-duplicate selected order IDs at the wire boundary',
      'selected orders must remain open, eligible, and intake-ready',
      'evaluateScheduleRevisionTransition supersede',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'lockLocationScheduling',
      'lockSelection',
      'selectedOrdersAreReady',
      'replaceSelection',
      'appendWorkEvent',
    ],
    transaction: 'required',
    locks: [
      'location scheduling advisory lock',
      'production shift row FOR UPDATE',
      'selection row FOR UPDATE',
      'current draft/accepted schedule row FOR UPDATE',
      'selected production order rows FOR UPDATE',
    ],
    optimisticVersions: [
      'expectedVersion, where zero creates the selection',
      'selection update increments version',
      'current schedule from-state guards supersession',
    ],
    idempotency: twoReplayChecks,
    workEvents: ['production_shift_selection_replaced'],
    signals: ['planSuperseded after commit when selection changes a plan'],
    sqlSemantics: [
      'selected IDs read and persisted in UUID order',
      'replace is delete-all then insert selected IDs in one transaction',
      'identical selections preserve version but still append the receipt',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const replaceShiftSelection = makeReplaceShiftSelectionClient',
          'operation: input.operations.replaceShiftSelection',
          'replaceShiftSelection,',
        ],
      },
    },
    complexity: {
      score: 4,
      reasons: [
        'multi-row selection replacement',
        'readiness validation',
        'conditional plan supersession',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/replace-shift-selection/contract.spec.ts',
      'systems/production/src/cells/scheduling/replace-shift-selection/execute.spec.ts',
      'systems/production/src/cells/scheduling/replace-shift-selection/postgres.int.spec.ts',
      'verification/scheduling/test/replace-shift-selection.conformance.int.test.ts',
      'systems/production/src/cells/scheduling/replace-shift-selection/http.spec.ts',
      'experiences/processor/src/features/scheduling/replace-shift-selection/replace-shift-selection.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/replace-shift-selection/cell.ts',
        contains: [
          'id: replaceShiftSelectionOperationId',
          "capability: 'production:schedule'",
          "timing: 'after-input'",
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/replace-shift-selection/http.ts',
        contains: [
          "path: '/production/locations/:locationId/shifts/:productionShiftId/selection'",
          'validateRequest: (request)',
          'http.validatedPathScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/replace-shift-selection/postgres.ts',
        contains: [
          'schema.productionShiftSelections.version',
          '.delete(schema.productionShiftSelectedOrders)',
          'asc(schema.productionOrders.id)',
          ".for('update')",
        ],
      },
    ],
  },
  {
    operationId: 'production.create-schedule.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules',
      authentication: 'required',
      authorization: 'production:schedule',
      boundaryOrder: bodyThenParams,
      paramsContract: 'productionLocationParamsSchema',
      requestContract: 'createScheduleRequestSchema',
      resultContract: 'scheduleProposalSchema',
      successStatus: 201,
    },
    contracts: ['CreateScheduleCommand', 'ScheduleProposal'],
    policies: [
      'evaluateShiftPlanningWindow compute',
      'approved production scheduler propose',
      'initialScheduleRevisionState',
      'evaluateScheduleRevisionTransition supersede',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'lockLocationScheduling',
      'lockShiftForPlanning',
      'loadSchedulingInput',
      'loadCurrentPlan',
      'saveSchedule',
      'appendWorkEvent',
    ],
    transaction: 'required',
    locks: [
      'location scheduling advisory lock',
      'production shift row FOR UPDATE',
      'current draft/accepted schedule row FOR UPDATE',
    ],
    optimisticVersions: [
      'selected shift/config/order versions are hashed into input snapshot',
      'current schedule lifecycle from-state guards supersession',
    ],
    idempotency: twoReplayChecks,
    workEvents: ['schedule_computed'],
    signals: ['planSuperseded after commit when replacing current plan'],
    sqlSemantics: [
      'selected orders ordered by production-order UUID',
      'machines ordered by UUID',
      'schedule input and deterministic output persisted as JSON snapshots',
      'current plan supersession and new draft insert are atomic',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const createSchedule = makeCreateScheduleClient',
          'operation: input.operations.createSchedule',
          'createSchedule,',
        ],
      },
    },
    complexity: {
      score: 5,
      reasons: [
        'algorithm invocation',
        'multi-source snapshot',
        'deterministic hashes',
        'revision supersession',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/create-schedule/contract.spec.ts',
      'systems/production/src/cells/scheduling/create-schedule/execute.spec.ts',
      'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
      'verification/scheduling/test/create-schedule.conformance.int.test.ts',
      'experiences/processor/src/features/scheduling/create-schedule/create-schedule.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/create-schedule/cell.ts',
        contains: [
          'id: createScheduleOperationId',
          "capability: 'production:schedule'",
          "timing: 'after-input'",
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/create-schedule/http.ts',
        contains: [
          "path: '/production/locations/:locationId/schedules'",
          'validateRequest: (request)',
          'http.validatedPathScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/create-schedule/postgres.ts',
        contains: [
          'asc(schema.productionOrders.id)',
          'asc(schema.machines.id)',
          'writeProductionSchedulingInput(schedulingInput)',
          'readProductionSchedulingOutput(row.outputPlan)',
        ],
      },
    ],
  },
  {
    operationId: 'production.load-schedule.v1',
    kind: 'query',
    runtime: 'http',
    http: {
      method: 'GET',
      path: '/production/locations/:locationId/schedules/:scheduleRunId',
      authentication: 'required',
      authorization: 'production:read',
      boundaryOrder: ['authentication', 'params', 'authorization'],
      paramsContract: 'productionScheduleParamsSchema',
      requestContract: null,
      resultContract: 'scheduleProposalSchema',
      successStatus: 200,
    },
    contracts: ['LoadScheduleCommand', 'ScheduleProposal'],
    policies: ['map persisted schedule JSON to the canonical proposal'],
    repositoryCapabilities: ['load'],
    transaction: 'none',
    locks: [],
    optimisticVersions: [],
    idempotency: noIdempotency,
    workEvents: [],
    signals: [],
    sqlSemantics: [
      'location and schedule-run UUID equality',
      'limit one without a transaction or row lock',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const loadSchedule = makeLoadScheduleClient',
          'operation: input.operations.loadSchedule',
          'loadSchedule,',
        ],
      },
    },
    complexity: {
      score: 1,
      reasons: ['single-row read', 'no clock, lock, cursor, or mutation'],
    },
    evidence: [
      'systems/production/src/cells/scheduling/load-schedule/load-schedule.spec.ts',
      'systems/production/src/cells/scheduling/load-schedule/postgres.int.spec.ts',
      'verification/scheduling/test/load-schedule.conformance.int.test.ts',
      'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
      'experiences/processor/src/features/scheduling/load-schedule/load-schedule.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/load-schedule/cell.ts',
        contains: [
          'id: loadScheduleOperationId',
          "capability: 'production:read'",
          "timing: 'after-input'",
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/load-schedule/http.ts',
        contains: [
          "path: '/production/locations/:locationId/schedules/:scheduleRunId'",
          'validatedParams(request)',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/load-schedule/postgres.ts',
        contains: [
          'eq(schema.scheduleRuns.locationId, locationId)',
          'eq(schema.scheduleRuns.id, scheduleRunId)',
          '.limit(1)',
        ],
      },
    ],
  },
  {
    operationId: 'production.accept-schedule.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules/:scheduleRunId/accept',
      authentication: 'required',
      authorization: 'production:accept',
      boundaryOrder: bodyThenParams,
      paramsContract: 'productionScheduleParamsSchema',
      requestContract: 'acceptScheduleRequestSchema',
      resultContract: 'acceptScheduleResultSchema',
      successStatus: 201,
    },
    contracts: ['AcceptScheduleCommand', 'AcceptScheduleResult'],
    policies: [
      'evaluateShiftPlanningWindow accept',
      'evaluateScheduleRevisionTransition accept',
      'evaluateScheduleAcceptance hashes/warnings/capacity',
      'evaluateCurrentPlanAcceptance',
      'scheduleCoversInputExactly',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'lockLocationScheduling',
      'loadSchedule',
      'lockAndValidateScheduleInput',
      'productionRunExists',
      'acceptSchedule',
    ],
    transaction: 'required',
    locks: [
      'location scheduling advisory lock',
      'schedule row FOR UPDATE',
      'selected production order rows FOR UPDATE in UUID order',
    ],
    optimisticVersions: [
      'expectedOutputPlanHash',
      'complete selected-order snapshot versions and values',
      'draft schedule lifecycle from-state',
    ],
    idempotency: twoReplayChecks,
    workEvents: ['schedule_accepted'],
    signals: [],
    sqlSemantics: [
      'selected IDs and order rows compared in UUID order',
      'accepted warning codes sorted before persistence',
      'schedule update and receipt append are atomic',
    ],
    cursor: 'none',
    processorOwnership: processorHttp('acceptSchedule'),
    complexity: {
      score: 5,
      reasons: [
        'hash and warning acknowledgement decision',
        'locked snapshot revalidation',
        'schedule lifecycle transition',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/accept-schedule/contract.spec.ts',
      'systems/production/src/cells/scheduling/accept-schedule/execute.spec.ts',
      'systems/production/src/cells/scheduling/accept-schedule/postgres.int.spec.ts',
      'verification/scheduling/test/accept-schedule.conformance.int.test.ts',
      'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
      'experiences/processor/src/features/scheduling/accept-schedule/accept-schedule.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/accept-schedule/execute.ts',
        contains: [
          'lockAndValidateScheduleInput',
          'beforeLockReplay',
          'afterLockReplay',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/accept-schedule/decide.ts',
        contains: [
          'evaluateScheduleAcceptance',
          'evaluateCurrentPlanAcceptance',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/accept-schedule/postgres.ts',
        contains: [
          'asc(schema.productionOrders.id)',
          ".for('update')",
          'appendAcceptScheduleWorkEvent',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/accept-schedule/work-event.postgres.ts',
        contains: ["eventType: 'schedule_accepted'"],
      },
    ],
  },
  {
    operationId: 'production.start-schedule.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules/:scheduleRunId/start',
      authentication: 'required',
      authorization: 'production:start',
      boundaryOrder: bodyThenParams,
      paramsContract: 'productionScheduleParamsSchema',
      requestContract: 'startScheduleRequestSchema',
      resultContract: 'startScheduleResultSchema',
      successStatus: 201,
    },
    contracts: ['StartScheduleCommand', 'StartScheduleResult'],
    policies: [
      'evaluateShiftPlanningWindow start',
      'evaluateScheduleStart',
      'resolve and transition every order execution state',
      'initial run/batch/stage/attempt states',
      'scheduleCoversInputExactly',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'lockLocationScheduling',
      'loadSchedule',
      'lockShiftForStart',
      'lockAndLoadStartOrders',
      'productionRunExists',
      'startSchedule',
    ],
    transaction: 'required',
    locks: [
      'location scheduling advisory lock',
      'schedule row FOR UPDATE',
      'shift row FOR UPDATE',
      'selected production orders FOR UPDATE in UUID order',
    ],
    optimisticVersions: [
      'expectedOutputPlanHash',
      'complete selected-order snapshot versions and values',
      'each order version during scheduled transition',
    ],
    idempotency: twoReplayChecks,
    workEvents: ['production_run_started'],
    signals: ['runStarted after commit only and never on replay'],
    sqlSemantics: [
      'atomically creates run, batches, memberships, stages, assignments, attempts',
      'updates every selected order to scheduled using its snapshot version',
      'preserves schedule batch/stage/order order when allocating IDs',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const startSchedule = makeStartScheduleClient',
          'operation: input.operations.startSchedule',
          'startSchedule,',
        ],
      },
    },
    complexity: {
      score: 6,
      reasons: [
        'largest scheduling aggregate materialization',
        'multi-row optimistic transition',
        'post-commit signal',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/start-schedule/contract.spec.ts',
      'systems/production/src/cells/scheduling/start-schedule/execute.spec.ts',
      'systems/production/src/cells/scheduling/start-schedule/postgres.int.spec.ts',
      'verification/scheduling/test/start-schedule.conformance.int.test.ts',
      'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
      'experiences/processor/src/features/scheduling/start-schedule/start-schedule.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/start-schedule/cell.ts',
        contains: [
          'id: startScheduleOperationId',
          "capability: 'production:start'",
          "timing: 'after-input'",
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/start-schedule/http.ts',
        contains: [
          "path: '/production/locations/:locationId/schedules/:scheduleRunId/start'",
          'validateRequest: (request)',
          'http.validatedPathScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/start-schedule/execute.ts',
        contains: [
          'await repo.findWorkEvent(command.idempotencyKey)',
          'await repo.lockLocationScheduling(command.locationId)',
          'deps.signals?.runStarted()',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/start-schedule/postgres.ts',
        contains: [
          '.insert(schema.productionRuns)',
          '.insert(schema.productionBatches)',
          '.insert(schema.productionOrderStageAttempts)',
        ],
      },
    ],
  },
  {
    operationId: 'production.attempt-automatic-placement.v1',
    kind: 'command',
    runtime: 'composition',
    http: null,
    contracts: [
      'AutomaticPlacementAttemptCommand',
      'AutomaticProductionOrderPlacementResult | null',
    ],
    policies: [
      'authorizedAction is command-carried production:queue or production:override; no route middleware exists',
      'zero runs records awaiting_run',
      'multiple runs records sorted ambiguous_run candidates',
      'one run delegates automatic placement using current queue version',
    ],
    repositoryCapabilities: [
      'lockLocationScheduling',
      'findStartedRuns',
      'recordPendingRunResolution',
      'shared placement operations',
    ],
    transaction: 'required',
    locks: [
      'location scheduling advisory lock',
      'shared placement lock graph when exactly one run exists',
    ],
    optimisticVersions: [
      'started run queue version is adopted inside the advisory lock',
    ],
    idempotency: {
      required: true,
      replayChecks: [],
      receipt: 'work_event',
      branchSemantics: [
        'zero or multiple runs write pending resolution without a replay precheck',
        'exactly one run delegates to placement with before-lock and after-lock replay checks',
      ],
    },
    workEvents: [
      'production_order_placement_pending',
      'shared placement outcome event when one run exists',
    ],
    signals: [],
    sqlSemantics: [
      'started runs ordered by UUID',
      'pending placement update and receipt are atomic',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'none',
      consumer: 'production-composition',
      client: 'none',
      consumerAnchor: null,
    },
    complexity: {
      score: 5,
      reasons: [
        'run cardinality branch',
        'delegates the complete placement transaction',
        'no current non-test caller or reaction trigger was found, so this remains a headless command',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/attempt-automatic-placement/decide.spec.ts',
      'systems/production/src/cells/scheduling/attempt-automatic-placement/execute.spec.ts',
      'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.int.spec.ts',
      'verification/scheduling/test/placement-bundle.conformance.int.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/attempt-automatic-placement/execute.ts',
        contains: [
          'await repository.lockLocationScheduling(command.locationId)',
          'decideAutomaticPlacementRun',
          'return repository.placeAutomatically',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.ts',
        contains: [
          'orderBy(asc(schema.productionRuns.id))',
          "eventType: 'production_order_placement_pending'",
        ],
      },
    ],
  },
  {
    operationId: 'production.place-order-automatically.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
      authentication: 'required',
      authorization: 'production:override',
      boundaryOrder: bodyThenParams,
      paramsContract: 'runOrderParamsSchema',
      requestContract: 'placeProductionOrderAutomaticallyRequestSchema',
      resultContract: 'automaticProductionOrderPlacementResultSchema',
      successStatus: 200,
    },
    contracts: [
      'PlaceProductionOrderAutomaticallyCommand',
      'AutomaticProductionOrderPlacementResult',
    ],
    policies: [
      'approved proposeOnlinePlacement automatic mode',
      'evaluatePlacementCommit',
      'production order execution schedule_or_place transition',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'loadContext',
      'recordOutcome',
      'commitPlacement',
    ],
    transaction: 'required',
    locks: [
      'production run row FOR UPDATE',
      'production order row FOR UPDATE',
      'all run batch rows FOR UPDATE in sequence order',
    ],
    optimisticVersions: [
      'expectedQueueVersion',
      'derived production order version',
      'proposal placementPlanHash when overtime is required',
    ],
    idempotency: twoReplayChecks,
    workEvents: [
      'production_order_placement_overtime_required',
      'production_order_placement_resolved',
    ],
    signals: [
      'placementOutcome after transaction and never on replay',
      'queueConflict after not_placed queue_conflict',
    ],
    sqlSemantics: [
      'context includes schedule JSON, ordered batches/stages, memberships and assignments',
      'not-placed and confirmation-required outcomes persist pending placement',
      'placed outcome atomically rewrites affected batches and order membership',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const retryAutomaticPlacement = makePlaceOrderAutomaticallyClient',
          'operation: input.operations.placeOrderAutomatically',
          'retryAutomaticPlacement,',
        ],
      },
    },
    complexity: {
      score: 6,
      reasons: [
        'online placement algorithm',
        'three success-state variants',
        'large mutation graph',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/place-order-automatically/http.spec.ts',
      'systems/production/src/cells/scheduling/place-order-automatically/postgres.int.spec.ts',
      'verification/scheduling/test/placement-bundle.conformance.int.test.ts',
      'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
      'experiences/processor/src/features/scheduling/place-order-automatically/place-order-automatically.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/place-order-automatically/http.ts',
        contains: [
          '/runs/:productionRunId/orders/:productionOrderId/place',
          "bodyLimit: '64kb'",
          'decodeAuthorizationScope: http.validatedPathScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/place-order-automatically/execute.ts',
        contains: [
          'makeExecutePlaceOrderAutomaticallyInTransaction',
          'const replayBefore',
          'const replayAfter',
        ],
      },
    ],
  },
  {
    operationId: 'production.place-order-exactly.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
      authentication: 'required',
      authorization: 'production:override',
      boundaryOrder: bodyThenParams,
      paramsContract: 'runBatchOrderParamsSchema',
      requestContract: 'placeProductionOrderExactlyRequestSchema',
      resultContract: 'exactProductionOrderPlacementResultSchema',
      successStatus: 200,
    },
    contracts: [
      'PlaceProductionOrderExactlyCommand',
      'ExactProductionOrderPlacementResult',
    ],
    policies: [
      'approved proposeOnlinePlacement manager_exact mode',
      'evaluatePlacementCommit requires production:override',
      'production order execution schedule_or_place transition',
    ],
    repositoryCapabilities: [
      'findWorkEvent',
      'loadContext',
      'recordOutcome',
      'commitPlacement',
    ],
    transaction: 'required',
    locks: [
      'production run row FOR UPDATE',
      'production order row FOR UPDATE',
      'all run batch rows FOR UPDATE in sequence order',
    ],
    optimisticVersions: [
      'expectedQueueVersion',
      'expectedBatchVersion for exact target',
      'derived production order version',
    ],
    idempotency: twoReplayChecks,
    workEvents: [
      'production_order_placement_overtime_required',
      'production_order_placement_resolved',
    ],
    signals: [
      'placementOutcome after transaction and never on replay',
      'queueConflict after not_placed queue_conflict',
    ],
    sqlSemantics: [
      'same placement context and mutation graph as automatic mode',
      'target batch identity/version is bound into the idempotency command',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const placeOrderExactly = makePlaceOrderExactlyClient',
          'operation: input.operations.placeOrderExactly',
          'placeOrderExactly,',
        ],
      },
    },
    complexity: {
      score: 6,
      reasons: [
        'online placement algorithm',
        'exact target concurrency',
        'large mutation graph',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/place-order-exactly/http.spec.ts',
      'systems/production/src/cells/scheduling/place-order-exactly/postgres.int.spec.ts',
      'verification/scheduling/test/placement-bundle.conformance.int.test.ts',
      'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
      'experiences/processor/src/features/scheduling/place-order-exactly/place-order-exactly.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/place-order-exactly/http.ts',
        contains: [
          '/batches/:productionBatchId/orders/:productionOrderId/place',
          "bodyLimit: '64kb'",
          'decodeAuthorizationScope: http.validatedPathScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/place-order-exactly/execute.ts',
        contains: [
          'const before = replayOutcome',
          'const after = replayOutcome',
          'decidePlaceOrderExactly',
        ],
      },
    ],
  },
  {
    operationId: 'production.confirm-order-overtime.v1',
    kind: 'command',
    runtime: 'http',
    http: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
      authentication: 'required',
      authorization: 'production:override',
      boundaryOrder: bodyThenParams,
      paramsContract: 'runOrderParamsSchema',
      requestContract: 'confirmProductionOrderOvertimeRequestSchema',
      resultContract: 'confirmProductionOrderOvertimeResultSchema',
      successStatus: 200,
    },
    contracts: [
      'ConfirmProductionOrderOvertimeCommand',
      'ConfirmProductionOrderOvertimeResult',
    ],
    policies: [
      'recover stored overtime mode/target by proposal hash',
      'recompute proposeOnlinePlacement',
      'evaluatePlacementCommit with exact confirmation hash and queue version',
    ],
    repositoryCapabilities: [
      'findOvertimeProposal',
      'findWorkEvent',
      'loadContext',
      'recordOutcome',
      'commitPlacement',
    ],
    transaction: 'required',
    locks: [
      'unlocked prior overtime work-event read in a first transaction',
      'placement run/order/batch lock graph in a second transaction',
    ],
    optimisticVersions: [
      'expectedQueueVersion',
      'proposalHash matches stored and recomputed proposal',
      'stored manager-exact target identity when applicable',
    ],
    idempotency: twoReplayChecks,
    workEvents: ['production_order_placement_resolved'],
    signals: [
      'placementOutcome after transaction and never on replay',
      'queueConflict after not_placed queue_conflict',
      'overtimeConfirmed after committed placed result only',
    ],
    sqlSemantics: [
      'prior overtime-required events ordered createdAt DESC',
      'confirmation recomputes rather than trusting stored placement bytes',
      'confirmation-required after confirmation is an invariant violation',
    ],
    cursor: 'none',
    processorOwnership: {
      httpOwner: 'production-system',
      consumer: 'processor',
      client: 'generated',
      consumerAnchor: {
        file: 'topology/runtime/browser/processor.ts',
        contains: [
          'const confirmPlacementOvertime = makeConfirmOrderOvertimeClient',
          'operation: input.operations.confirmOrderOvertime',
          'confirmPlacementOvertime,',
        ],
      },
    },
    complexity: {
      score: 6,
      reasons: [
        'two transaction scopes',
        'historical proposal lookup',
        'recomputed hash-bound mutation',
      ],
    },
    evidence: [
      'systems/production/src/cells/scheduling/confirm-order-overtime/http.spec.ts',
      'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
      'verification/scheduling/test/placement-bundle.conformance.int.test.ts',
      'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
      'experiences/processor/src/features/scheduling/confirm-order-overtime/confirm-order-overtime.test.ts',
    ],
    sourceAnchors: [
      {
        file: 'systems/production/src/cells/scheduling/confirm-order-overtime/http.ts',
        contains: [
          '/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
          "bodyLimit: '64kb'",
          'decodeAuthorizationScope: http.validatedPathScope',
        ],
      },
      {
        file: 'systems/production/src/cells/scheduling/confirm-order-overtime/execute.ts',
        contains: [
          'const storedOvertime = await deps.repo.findOvertimeProposal',
          'const replayAfter = deps.idempotency.resolveReplay',
          'signals?.overtimeConfirmed()',
        ],
      },
    ],
  },
]) satisfies readonly SchedulingInventoryEntry[];
