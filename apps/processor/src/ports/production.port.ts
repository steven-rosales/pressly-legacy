import type {
  AcceptScheduleResult,
  AdvanceProductionStageResult,
  AutomaticProductionOrderPlacementResult,
  CompleteStageCommand,
  ChangeProductionAdmissionResult,
  ChangeProductionOrderResolutionCommand,
  ChangeProductionOrderResolutionResult,
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
  CommitProductionOrderRouteRequest,
  CommitProductionOrderRouteResult,
  ListProductionHistoryActivityQuery,
  ProcessorListProductionHistoryActivityResult,
  ListProductionHistoryPlansQuery,
  ListProductionHistoryPlansResult,
  ListProductionHistoryRunsQuery,
  ListProductionHistoryRunsResult,
  ListProductionOrderControlQuery,
  ListProcessorOrderControlResult,
  ListProductionLocationsResult,
  ListProductionOrdersResult,
  ProcessorProductionHistoryRunDetail,
  ProcessorProductionOrderBacklogPreview,
  ProcessorProductionBoard,
  ProcessorProductionWorkspace,
  ProcessorRemainingDayForecast,
  PreviewProductionOrderBacklogCommand,
  ProductionBatchMembershipMutationResult,
  ProductionBatchProgressReconciliationResult,
  ProductionMutationResult,
  PreviewProductionOrderRouteRequest,
  ProductionOrderRouteProposal,
  RecordOrderIntakeResult,
  ReplaceProductionShiftSelectionResult,
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
  ) => Promise<ProcessorProductionWorkspace>
  loadRemainingDayForecast: (input: {
    locationId: string
    serviceDay: string
    signal?: AbortSignal
  }) => Promise<ProcessorRemainingDayForecast>
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
  }) => Promise<ListProcessorOrderControlResult>
  previewOrderBacklog: (input: {
    locationId: string
    request: Omit<PreviewProductionOrderBacklogCommand, "locationId">
  }) => Promise<ProcessorProductionOrderBacklogPreview>
  commitOrderBacklog: (input: {
    locationId: string
    request: Omit<CommitProductionOrderBacklogCommand, "locationId">
  }) => Promise<ProductionOrderBacklogCommitResult>
  changeOrderResolution: (input: {
    locationId: string
    productionOrderId: string
    request: Omit<
      ChangeProductionOrderResolutionCommand,
      "locationId" | "orderId"
    >
  }) => Promise<ChangeProductionOrderResolutionResult>
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
  }) => Promise<ProcessorListProductionHistoryActivityResult>
  listHistoryPlans: (input: {
    locationId: string
    query: ListProductionHistoryPlansQuery
    signal?: AbortSignal
  }) => Promise<ListProductionHistoryPlansResult>
  loadHistoryRun: (
    locationId: string,
    productionRunId: string,
    signal?: AbortSignal
  ) => Promise<ProcessorProductionHistoryRunDetail>
  recordIntake: (input: {
    locationId: string
    productionOrderId: string
    bagCount: number
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<RecordOrderIntakeResult>
  changeAdmission: (input: {
    locationId: string
    productionOrderId: string
    target: "released" | "source"
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ChangeProductionAdmissionResult>
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
  replaceShiftSelection: (input: {
    locationId: string
    productionShiftId: string
    selectedOrderIds: readonly string[]
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ReplaceProductionShiftSelectionResult>
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
  ) => Promise<ProcessorProductionBoard>
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
