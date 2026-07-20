import type {
  ProductionBoard,
  ProductionLocation,
  ProductionOrderListItem,
  ProductionOrderSummary,
  ProductionShift,
  ProductionWorkspace,
  ScheduleProposal,
  SchedulerConfig,
} from "@pressly/contracts"
import type { ProductionPort } from "@/ports/production.port"
import type { IdempotencyPort } from "@/ports/idempotency.port"

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`

export const testIdempotency: IdempotencyPort = {
  key: async ({ operation, payload }) =>
    `test:${operation}:${JSON.stringify(payload)}`.slice(0, 200),
}

export const testLocation: ProductionLocation = {
  id: "plant-east",
  name: "East Plant",
  timezone: "America/Chicago",
  isActive: true,
}

export const testShift: ProductionShift = {
  id: id(1),
  locationId: testLocation.id,
  startsAt: "2026-08-01T14:00:00.000Z",
  endsAt: "2026-08-01T20:00:00.000Z",
  timezone: testLocation.timezone,
  effectiveFolderCount: 2,
  status: "open",
  version: 1,
}

export const testConfig: SchedulerConfig = {
  id: id(2),
  pulseMinutes: 50,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: "fixed-pulse-ffd-v2",
  version: 3,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: id(90),
    assertedAt: "2026-08-01T13:00:00.000Z",
  },
  publishedAt: "2026-08-01T13:00:00.000Z",
}

export const testOrders: readonly ProductionOrderSummary[] = [
  {
    id: id(10),
    externalOrderId: "C-1001",
    dueAt: "2026-08-01T22:00:00.000Z",
    dueBucket: "today",
    priority: false,
    derivedWeightLbs: 120,
    bagCount: 3,
    version: 1,
  },
  {
    id: id(11),
    externalOrderId: "C-1002",
    dueAt: "2026-08-02T22:00:00.000Z",
    dueBucket: "tomorrow",
    priority: false,
    derivedWeightLbs: 80,
    bagCount: 2,
    version: 1,
  },
]

export const testShiftSelection = {
  productionShiftId: testShift.id,
  version: 1,
  selectedOrderIds: testOrders.map((order) => order.id),
}

export const testOrderItems: readonly ProductionOrderListItem[] = [
  ...testOrders.map((order) => ({
    ...order,
    locationId: testLocation.id,
    status: "eligible" as const,
    bagCountProvenance: "external_source" as const,
    intakeVersion: 1,
  })),
  {
    id: id(12),
    locationId: testLocation.id,
    externalOrderId: "C-1003",
    dueAt: "2026-08-01T23:00:00.000Z",
    dueBucket: "today",
    priority: false,
    status: "intake_pending",
    derivedWeightLbs: 60,
    bagCount: null,
    bagCountProvenance: null,
    intakeVersion: null,
    version: 2,
  },
]

export const testSchedule: ScheduleProposal = {
  scheduleRunId: id(20),
  productionShiftId: testShift.id,
  schedulerConfigId: testConfig.id,
  status: "draft",
  inputSnapshotHash: "a".repeat(64),
  outputPlanHash: "b".repeat(64),
  algorithmVersion: "fixed-pulse-ffd-v2",
  pulseMinutes: 50,
  pulseCapacityLbs: 200,
  batchCount: 1,
  makespanMinutes: 200,
  plannedCompletionAt: "2026-08-01T17:20:00.000Z",
  batches: [
    {
      sequence: 0,
      orderIds: testOrders.map((order) => order.id),
      derivedWeightLbs: 200,
      bagCount: 5,
      stages: ["sorting", "washing", "drying", "folding_packaging"].map(
        (stage, index) => ({
          stage: stage as
            | "sorting"
            | "washing"
            | "drying"
            | "folding_packaging",
          startsAt: new Date(
            Date.parse(testShift.startsAt) + index * 50 * 60_000
          ).toISOString(),
          endsAt: new Date(
            Date.parse(testShift.startsAt) + (index + 1) * 50 * 60_000
          ).toISOString(),
          machineIds:
            stage === "washing" ? [id(31)] : stage === "drying" ? [id(32)] : [],
        })
      ),
    },
  ],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: "2026-08-01T13:30:00.000Z",
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
}

const stageRuns = testSchedule.batches[0]!.stages.map((stage, index) => ({
  id: id(40 + index),
  productionBatchId: id(30),
  stage: stage.stage,
  status: "planned" as const,
  plannedStartAt: stage.startsAt,
  plannedEndAt: stage.endsAt,
  actualStartAt: null,
  actualEndAt: null,
  actualStartProvenance: "not_recorded" as const,
  actualEndProvenance: "not_recorded" as const,
  machineIds: stage.machineIds,
  nextAction:
    index === 0
      ? ({ state: "available", action: "start" } as const)
      : ({
          state: "blocked",
          action: "start",
          code: "PREVIOUS_STAGE_INCOMPLETE",
          message: "The previous stage must be completed first.",
          availableAt: null,
        } as const),
  allowedActions:
    index === 0
      ? (["start"] satisfies ("start" | "complete")[])
      : ([] satisfies ("start" | "complete")[]),
  version: 1,
}))

export const testBoard: ProductionBoard = {
  productionShift: testShift,
  productionRun: {
    id: id(21),
    productionShiftId: testShift.id,
    status: "started",
    queueVersion: 1,
    plannedCompletionAt: testSchedule.plannedCompletionAt,
    overtimeAcknowledgement: null,
    version: 1,
  },
  batches: [
    {
      id: id(30),
      sequence: 0,
      status: "queued",
      derivedWeightLbs: 200,
      pulseCapacityLbs: 200,
      pulseMinutes: 50,
      membership: { state: "mutable" },
      orders: testOrders.map((order) => ({
        ...order,
        placementProvenance: "initial_schedule" as const,
        pinnedAt: null,
        pinnedBy: null,
      })),
      stages: stageRuns,
      version: 1,
    },
  ],
  eligibleOrders: [],
  asOf: "2026-08-01T14:00:00.000Z",
}

export const testWorkspace: ProductionWorkspace = {
  location: testLocation,
  currentShift: testShift,
  shiftSelection: testShiftSelection,
  candidateShifts: [
    {
      productionShiftId: testShift.id,
      startsAt: testShift.startsAt,
      endsAt: testShift.endsAt,
      reason: "started_run",
      productionRunId: testBoard.productionRun.id,
      scheduleRunId: testSchedule.scheduleRunId,
    },
  ],
  currentSchedulerConfig: testConfig,
  currentScheduleProposal: testSchedule,
  activeRuns: [testBoard.productionRun],
  orders: [...testOrderItems],
  pendingEligibleOrders: [],
  demandOutlook: null,
  board: testBoard,
  stations: [],
  machines: [
    {
      id: id(31),
      stationKind: "washing",
      label: "Washer 1",
      effectiveCapacityLbs: 100,
      active: true,
    },
    {
      id: id(32),
      stationKind: "drying",
      label: "Dryer 1",
      effectiveCapacityLbs: 100,
      active: true,
    },
  ],
  asOf: "2026-08-01T14:00:00.000Z",
}

export const makeTestProductionPort = (
  overrides: Partial<ProductionPort> = {}
): ProductionPort => ({
  listLocations: async () => ({
    items: [testLocation],
    asOf: testWorkspace.asOf,
  }),
  loadWorkspace: async () => structuredClone(testWorkspace),
  listOrders: async () => ({
    items: [...structuredClone(testOrderItems)],
    nextCursor: null,
    asOf: testWorkspace.asOf,
  }),
  listOrderControl: async () => ({
    items: [],
    counts: { attention: 0, active: 0, all: 0 },
    nextCursor: null,
    asOf: testWorkspace.asOf,
  }),
  previewOrderRoute: async () => {
    throw new Error("No order-route preview is configured for this test.")
  },
  commitOrderRoute: async () => {
    throw new Error("No order-route commit is configured for this test.")
  },
  listHistoryRuns: async () => ({
    items: [],
    nextCursor: null,
    asOf: testWorkspace.asOf,
  }),
  listHistoryActivity: async () => ({
    items: [],
    nextCursor: null,
    asOf: testWorkspace.asOf,
  }),
  listHistoryPlans: async () => ({
    items: [],
    nextCursor: null,
    asOf: testWorkspace.asOf,
  }),
  loadHistoryRun: async () => {
    throw new Error("No production-run history is configured for this test.")
  },
  recordIntake: async (input) => ({
    locationId: input.locationId,
    orderId: input.productionOrderId,
    bagCount: input.bagCount,
    bagCountProvenance: "operator_intake",
    intakeVersion: 1,
    version: input.expectedVersion + 1,
    replayed: false,
  }),
  publishConfig: async () => structuredClone(testConfig),
  createShift: async () => structuredClone(testShift),
  updateShift: async (input) => ({
    productionShift: {
      ...structuredClone(testShift),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      effectiveFolderCount: input.effectiveFolderCount,
      version: input.expectedVersion + 1,
    },
    supersededScheduleRunId: testSchedule.scheduleRunId,
    replayed: false,
  }),
  replaceShiftSelection: async (input) => ({
    selection: {
      productionShiftId: input.productionShiftId,
      version: input.expectedVersion + 1,
      selectedOrderIds: [...input.selectedOrderIds].sort(),
    },
    supersededScheduleRunId: testSchedule.scheduleRunId,
    replayed: false,
  }),
  createSchedule: async () => structuredClone(testSchedule),
  loadSchedule: async () => structuredClone(testSchedule),
  acceptSchedule: async () => ({
    scheduleRunId: testSchedule.scheduleRunId,
    productionShiftId: testShift.id,
    acceptedAt: "2026-08-01T13:45:00.000Z",
    replayed: false,
  }),
  startSchedule: async () => ({
    scheduleRunId: testSchedule.scheduleRunId,
    productionRunId: testBoard.productionRun.id,
    productionBatchIds: testBoard.batches.map((batch) => batch.id),
    queueVersion: 1,
    startedAt: "2026-08-01T14:00:00.000Z",
    replayed: false,
  }),
  loadBoard: async () => structuredClone(testBoard),
  setPriority: async (input) => ({
    entityId: input.productionOrderId,
    version: input.expectedVersion + 1,
    replayed: false,
  }),
  freezeBatch: async (input) => ({
    productionRunId: input.productionRunId,
    productionBatchId: input.productionBatchId,
    queueVersion: input.expectedQueueVersion + 1,
    batchVersion: input.expectedBatchVersion + 1,
    membership: {
      state: "frozen",
      frozenAt: "2026-08-01T14:05:00.000Z",
      frozenBy: id(90),
    },
    replayed: false,
  }),
  unfreezeBatch: async (input) => ({
    productionRunId: input.productionRunId,
    productionBatchId: input.productionBatchId,
    queueVersion: input.expectedQueueVersion + 1,
    batchVersion: input.expectedBatchVersion + 1,
    membership: { state: "mutable" },
    replayed: false,
  }),
  retryAutomaticPlacement: async (input) => ({
    status: "not_placed",
    mode: "automatic",
    productionRunId: input.productionRunId,
    productionOrderId: input.productionOrderId,
    reason: "no_mutable_position",
    message: "No mutable position is available.",
    queueVersion: input.expectedQueueVersion,
    replayed: false,
  }),
  placeOrderExactly: async (input) => ({
    status: "not_placed",
    mode: "manager_exact",
    productionRunId: input.productionRunId,
    productionOrderId: input.productionOrderId,
    reason: "no_mutable_position",
    message: "No mutable position is available.",
    queueVersion: input.expectedQueueVersion,
    replayed: false,
  }),
  confirmPlacementOvertime: async (input) => ({
    status: "not_placed",
    mode: "automatic",
    productionRunId: input.productionRunId,
    productionOrderId: input.productionOrderId,
    reason: "proposal_stale",
    message: "The proposal is stale.",
    queueVersion: input.expectedQueueVersion,
    replayed: false,
  }),
  reconcileBatchProgress: async (input) => ({
    status: "confirmation_required",
    productionRunId: input.productionRunId,
    productionBatchId: input.productionBatchId,
    currentMilestone: "waiting_to_sort",
    targetMilestone: input.target,
    queueVersion: input.expectedQueueVersion,
    batchVersion: input.expectedBatchVersion,
    stageVersions: input.expectedStageVersions,
    confirmation: { proposalHash: "e".repeat(64) },
    effects: {
      completedStages: [],
      activeStage: null,
      finishesBatch: false,
      finishesRun: false,
      closesShift: false,
    },
    replayed: false,
  }),
  advanceStage: async (input) => ({
    entityId: input.stageRunId,
    version: input.expectedVersion + 1,
    replayed: false,
  }),
  assignStageMachines: async (input) => ({
    entityId: input.stageRunId,
    version: input.expectedVersion + 1,
    replayed: false,
  }),
  ...overrides,
})
