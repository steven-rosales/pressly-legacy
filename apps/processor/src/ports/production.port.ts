import type {
  AcceptScheduleResult,
  ListProductionLocationsResult,
  ListProductionOrdersResult,
  ProductionBoard,
  ProductionMutationResult,
  ProductionWorkspace,
  RecordOrderIntakeResult,
  ProductionShift,
  ScheduleProposal,
  SchedulerConfig,
} from "@pressly/contracts"

export type ProductionPort = Readonly<{
  listLocations: () => Promise<ListProductionLocationsResult>
  loadWorkspace: (locationId: string) => Promise<ProductionWorkspace>
  listOrders: (input: {
    locationId: string
    cursor?: string
    limit?: number
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
  createSchedule: (input: {
    locationId: string
    productionShiftId: string
    schedulerConfigId: string
    horizonEnd: string
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
  loadBoard: (
    locationId: string,
    productionShiftId: string
  ) => Promise<ProductionBoard>
  setPriority: (input: {
    locationId: string
    productionOrderId: string
    priority: boolean
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
  startRun: (input: {
    locationId: string
    productionRunId: string
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
  advanceStage: (input: {
    locationId: string
    stageRunId: string
    transition: "start" | "complete"
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
  assignStageMachines: (input: {
    locationId: string
    stageRunId: string
    machineIds: readonly string[]
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
}>
