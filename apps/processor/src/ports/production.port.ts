import type {
  AcceptScheduleResult,
  AdvanceProductionStageResult,
  AutomaticProductionOrderPlacementResult,
  CompleteStageCommand,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
  CommitProductionOrderRouteRequest,
  CommitProductionOrderRouteResult,
  ListProductionHistoryActivityQuery,
  ListProductionHistoryActivityResult,
  ListProductionHistoryPlansQuery,
  ListProductionHistoryPlansResult,
  ListProductionHistoryRunsQuery,
  ListProductionHistoryRunsResult,
  ListProductionOrderControlQuery,
  ListProductionOrderControlResult,
  ListProductionLocationsResult,
  ListProductionOrdersResult,
  ProductionBoard,
  ProductionBatchMembershipMutationResult,
  ProductionBatchProgressReconciliationResult,
  ProductionMutationResult,
  ProductionHistoryRunDetail,
  PreviewProductionOrderRouteRequest,
  ProductionOrderRouteProposal,
  ProductionWorkspace,
  RecordOrderIntakeResult,
  ReconcileProductionBatchProgressCommand,
  ProductionShift,
  ScheduleProposal,
  SchedulerConfig,
  StartScheduleResult,
  StartStageCommand,
  UpdateProductionShiftResult,
} from "@pressly/contracts"

export type ProductionPort = Readonly<{
  listLocations: () => Promise<ListProductionLocationsResult>
  loadWorkspace: (
    locationId: string,
    shiftId?: string,
    signal?: AbortSignal
  ) => Promise<ProductionWorkspace>
  listOrders: (input: {
    locationId: string
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }) => Promise<ListProductionOrdersResult>
  listOrderControl: (input: {
    locationId: string
    query: ListProductionOrderControlQuery
    signal?: AbortSignal
  }) => Promise<ListProductionOrderControlResult>
  previewOrderRoute: (input: {
    locationId: string
    productionRunId: string
    productionOrderId: string
    request: PreviewProductionOrderRouteRequest
  }) => Promise<ProductionOrderRouteProposal>
  commitOrderRoute: (input: {
    locationId: string
    productionRunId: string
    productionOrderId: string
    request: CommitProductionOrderRouteRequest
  }) => Promise<CommitProductionOrderRouteResult>
  listHistoryRuns: (input: {
    locationId: string
    query: ListProductionHistoryRunsQuery
    signal?: AbortSignal
  }) => Promise<ListProductionHistoryRunsResult>
  listHistoryActivity: (input: {
    locationId: string
    query: ListProductionHistoryActivityQuery
    signal?: AbortSignal
  }) => Promise<ListProductionHistoryActivityResult>
  listHistoryPlans: (input: {
    locationId: string
    query: ListProductionHistoryPlansQuery
    signal?: AbortSignal
  }) => Promise<ListProductionHistoryPlansResult>
  loadHistoryRun: (
    locationId: string,
    productionRunId: string,
    signal?: AbortSignal
  ) => Promise<ProductionHistoryRunDetail>
  recordIntake: (input: {
    locationId: string
    productionOrderId: string
    bagCount: number
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<RecordOrderIntakeResult>
  publishConfig: (input: {
    locationId: string
    pulseMinutes: number
    foldLbsPerFolderMinute: number
    stageFitAssertion: {
      sortingFits: true
      washingFits: true
      dryingFits: true
    }
    idempotencyKey: string
  }) => Promise<SchedulerConfig>
  createShift: (input: {
    locationId: string
    startsAt: string
    endsAt: string
    timezone: string
    effectiveFolderCount: number
    idempotencyKey: string
  }) => Promise<ProductionShift>
  updateShift: (input: {
    locationId: string
    productionShiftId: string
    startsAt: string
    endsAt: string
    effectiveFolderCount: number
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<UpdateProductionShiftResult>
  createSchedule: (input: {
    locationId: string
    productionShiftId: string
    schedulerConfigId: string
    idempotencyKey: string
  }) => Promise<ScheduleProposal>
  loadSchedule: (
    locationId: string,
    scheduleRunId: string
  ) => Promise<ScheduleProposal>
  acceptSchedule: (input: {
    locationId: string
    scheduleRunId: string
    expectedOutputPlanHash: string
    acknowledgedWarningCodes: string[]
    idempotencyKey: string
  }) => Promise<AcceptScheduleResult>
  startSchedule: (input: {
    locationId: string
    scheduleRunId: string
    expectedOutputPlanHash: string
    idempotencyKey: string
  }) => Promise<StartScheduleResult>
  loadBoard: (
    locationId: string,
    productionRunId: string,
    signal?: AbortSignal
  ) => Promise<ProductionBoard>
  setPriority: (input: {
    locationId: string
    productionOrderId: string
    priority: boolean
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
  freezeBatch: (input: {
    locationId: string
    productionRunId: string
    productionBatchId: string
    expectedQueueVersion: number
    expectedBatchVersion: number
    idempotencyKey: string
  }) => Promise<ProductionBatchMembershipMutationResult>
  unfreezeBatch: (input: {
    locationId: string
    productionRunId: string
    productionBatchId: string
    expectedQueueVersion: number
    expectedBatchVersion: number
    idempotencyKey: string
  }) => Promise<ProductionBatchMembershipMutationResult>
  retryAutomaticPlacement: (input: {
    locationId: string
    productionRunId: string
    productionOrderId: string
    expectedQueueVersion: number
    idempotencyKey: string
  }) => Promise<AutomaticProductionOrderPlacementResult>
  placeOrderExactly: (input: {
    locationId: string
    productionRunId: string
    productionOrderId: string
    productionBatchId: string
    expectedQueueVersion: number
    expectedBatchVersion: number
    idempotencyKey: string
  }) => Promise<ExactProductionOrderPlacementResult>
  confirmPlacementOvertime: (input: {
    locationId: string
    productionRunId: string
    productionOrderId: string
    expectedQueueVersion: number
    proposalHash: string
    idempotencyKey: string
  }) => Promise<ConfirmProductionOrderOvertimeResult>
  reconcileBatchProgress: (
    input: ReconcileProductionBatchProgressCommand
  ) => Promise<ProductionBatchProgressReconciliationResult>
  advanceStage: (input: {
    locationId: string
    stageRunId: string
    transition: "start" | "complete"
    expectedVersion: number
    idempotencyKey: string
    confirmation?: NonNullable<
      CompleteStageCommand["confirmation"] | StartStageCommand["confirmation"]
    >
  }) => Promise<AdvanceProductionStageResult>
  assignStageMachines: (input: {
    locationId: string
    stageRunId: string
    machineIds: readonly string[]
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
}>
