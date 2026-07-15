import type {
  AcceptScheduleResult,
  AdvanceProductionStageResult,
  AutomaticProductionOrderPlacementResult,
  CompleteStageCommand,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
  ListProductionLocationsResult,
  ListProductionOrdersResult,
  ProductionBoard,
  ProductionBatchMembershipMutationResult,
  ProductionMutationResult,
  ProductionWorkspace,
  RecordOrderIntakeResult,
  ProductionShift,
  ScheduleProposal,
  SchedulerConfig,
  StartScheduleResult,
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
  advanceStage: (input: {
    locationId: string
    stageRunId: string
    transition: "start" | "complete"
    expectedVersion: number
    idempotencyKey: string
    confirmation?: NonNullable<CompleteStageCommand["confirmation"]>
  }) => Promise<AdvanceProductionStageResult>
  assignStageMachines: (input: {
    locationId: string
    stageRunId: string
    machineIds: readonly string[]
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
}>
