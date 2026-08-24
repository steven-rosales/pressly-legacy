import type {
  ListProductionHistoryActivityResult,
  ProductionHistoryRunDetail,
} from "@pressly/production-system/contracts/read-models/production-history"
import type { ListProductionOrderControlResult } from "@pressly/production-system/contracts/read-models/production-order-control"
import type {
  ProductionBoard,
  ProductionWorkspace,
} from "@pressly/production-system/contracts/read-models/production-board"
import type { ProductionOrderBacklogPreview } from "@pressly/production-system/contracts/read-models/production-order-backlog"
import type { ProductionRemainingDayForecast } from "@pressly/production-system/contracts/queries/load-remaining-day-forecast"

const id = (suffix: number): string =>
  `89000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`

export const serverFixtureIds = Object.freeze({
  actor: id(1),
  shift: id(2),
  schedule: id(3),
  config: id(4),
  run: id(5),
  batch: id(6),
  order: id(7),
  demand: id(8),
  membership: id(9),
  event: id(10),
  stage: id(11),
  canonicalOrder: id(12),
  fulfillment: id(13),
})

export const serverFixtureLocationId = "processor-server-location"
export const serverFixtureNow = "2026-08-22T16:00:00.000Z"

const orderSummary = {
  id: serverFixtureIds.order,
  externalOrderId: "ORDER-FALLBACK",
  dueAt: "2026-08-22T20:00:00.000Z",
  dueBucket: "today" as const,
  priority: true,
  derivedWeightLbs: 20,
  bagCount: 1,
  version: 2,
}

const orderListItem = {
  ...orderSummary,
  locationId: serverFixtureLocationId,
  status: "scheduled" as const,
  bagCountProvenance: "operator_intake" as const,
  intakeVersion: 1,
}

const shift = {
  id: serverFixtureIds.shift,
  locationId: serverFixtureLocationId,
  startsAt: "2026-08-22T12:00:00.000Z",
  endsAt: "2026-08-22T22:00:00.000Z",
  timezone: "America/New_York",
  effectiveFolderCount: 2,
  status: "open" as const,
  version: 1,
}

const run = {
  id: serverFixtureIds.run,
  productionShiftId: serverFixtureIds.shift,
  status: "started" as const,
  queueVersion: 1,
  plannedCompletionAt: "2026-08-22T20:00:00.000Z",
  overtimeAcknowledgement: null,
  version: 1,
}

const stages = (
  ["sorting", "washing", "drying", "folding_packaging"] as const
).map((stage, index) => ({
  id: id(100 + index),
  productionBatchId: serverFixtureIds.batch,
  stage,
  status: "planned" as const,
  plannedStartAt: `2026-08-22T${String(12 + index).padStart(2, "0")}:00:00.000Z`,
  plannedEndAt: `2026-08-22T${String(13 + index).padStart(2, "0")}:00:00.000Z`,
  actualStartAt: null,
  actualEndAt: null,
  actualStartProvenance: "not_recorded" as const,
  actualEndProvenance: "not_recorded" as const,
  machineIds: [],
  nextAction: {
    state: "blocked" as const,
    action: "start" as const,
    code: "PREVIOUS_STAGE_INCOMPLETE" as const,
    message: "The previous stage is incomplete.",
    availableAt: null,
  },
  version: 1,
}))

export const productionBoardFixture = (): ProductionBoard => ({
  productionShift: { ...shift },
  productionRun: { ...run },
  batches: [
    {
      id: serverFixtureIds.batch,
      sequence: 0,
      status: "queued",
      derivedWeightLbs: 20,
      pulseCapacityLbs: 100,
      pulseMinutes: 60,
      membership: { state: "mutable" },
      orders: [
        {
          ...orderSummary,
          placementProvenance: "initial_schedule",
          pinnedAt: null,
          pinnedBy: null,
        },
      ],
      stages,
      version: 1,
    },
  ],
  eligibleOrders: [],
  asOf: serverFixtureNow,
})

export const productionWorkspaceFixture = (): ProductionWorkspace => ({
  location: {
    id: serverFixtureLocationId,
    name: "Processor Server Facility",
    timezone: "America/New_York",
    isActive: true,
  },
  currentShift: { ...shift },
  shiftSelection: null,
  candidateShifts: [],
  currentSchedulerConfig: null,
  currentScheduleProposal: null,
  activeRuns: [{ ...run }],
  orders: [{ ...orderListItem }],
  pendingEligibleOrders: [
    {
      ...orderSummary,
      placement: {
        status: "awaiting_run",
        reason: "automatic_placement_not_attempted",
        message: "Automatic placement has not been attempted.",
      },
    },
  ],
  liveRunChanges: null,
  demandOutlook: null,
  board: null,
  stations: [],
  machines: [],
  asOf: serverFixtureNow,
})

export const remainingDayForecastFixture =
  (): ProductionRemainingDayForecast => {
    const emptySummary = {
      orderCount: 0,
      knownWeightLbs: 0,
      missingEstimateOrderCount: 0,
    }
    return {
      locationId: serverFixtureLocationId,
      serviceDay: "2026-08-22",
      timezone: "America/New_York",
      window: {
        startsAt: "2026-08-22T04:00:00.000Z",
        endsAt: "2026-08-23T04:00:00.000Z",
      },
      asOf: serverFixtureNow,
      assumptions: {
        algorithmVersion: "online-stable-insertion-v1",
        overdueUnfinishedIncluded: true,
        physicalIntakeRequired: true,
        wholeOrderPlacement: true,
        expectedWeightsAdvisory: true,
        missingEstimatesExcludedFromWeightTotals: true,
        placementRevalidatedOnCommit: true,
        preciseFinishForecasted: false,
      },
      shifts: [],
      totals: {
        all: { orderCount: 1, knownWeightLbs: 0, missingEstimateOrderCount: 1 },
        inProduction: emptySummary,
        readyToPlace: emptySummary,
        expectedLater: {
          orderCount: 1,
          knownWeightLbs: 0,
          missingEstimateOrderCount: 1,
        },
        needsShift: emptySummary,
      },
      capacityRisk: {
        level: "attention",
        reasons: ["no_ready_work", "expected_later", "missing_estimates"],
        pulseCapacityLbs: null,
      },
      groups: {
        inProduction: [],
        readyToPlace: [],
        expectedLater: [
          {
            orderDemandId: serverFixtureIds.demand,
            productionOrderId: null,
            externalOrderId: "DEMAND-FALLBACK",
            dueAt: "2026-08-22T19:00:00.000Z",
            priority: false,
            estimatedWeightLbs: null,
            bagCount: null,
            readiness: "not_admitted",
            actionability: {
              action: "monitor",
              state: "informational",
              reason: "missing_estimate",
            },
          },
        ],
        needsShift: [],
      },
    }
  }

export const orderBacklogPreviewFixture =
  (): ProductionOrderBacklogPreview => ({
    locationId: serverFixtureLocationId,
    filter: "all_due_before_cutoff",
    cutoff: "2026-08-01T00:00:00.000Z",
    reason: "processor_not_in_use",
    maxOrders: 250,
    candidateCount: 1,
    hasMore: false,
    cursor: null,
    nextCursor: null,
    previewHash: "a".repeat(64),
    generatedAt: serverFixtureNow,
    groups: {
      readyToArchive: [
        {
          orderId: serverFixtureIds.order,
          displayReference: "ORDER-FALLBACK",
          dueAt: "2026-07-01T00:00:00.000Z",
          category: "ready_to_archive",
          reasons: ["no_operator_owned_facts"],
          expectedVersion: 2,
          expectedResolutionState: "open",
        },
      ],
      reviewIndividually: [],
      keptForSafety: [],
      alreadyHistorical: [],
    },
  })

const activityEntry = {
  id: serverFixtureIds.event,
  eventType: "production_order_priority_changed" as const,
  entityType: "production_order" as const,
  entityId: serverFixtureIds.order,
  actor: {
    id: serverFixtureIds.actor,
    kind: "user" as const,
    displayName: "Operator",
  },
  expectedVersion: 2,
  productionRunId: null,
  resolutionAction: null,
  summary: "Production order priority changed",
  details: {
    kind: "order" as const,
    productionRunId: null,
    sourceBatchId: null,
    targetBatchId: null,
    outcome: null,
    bagCount: null,
    priority: true,
    queueVersion: null,
    version: 2,
    resolutionState: null,
    resolutionReason: null,
    routeReason: null,
    restartStage: null,
    releasedStages: [],
    assignedStages: [],
  },
  occurredAt: serverFixtureNow,
}

export const historyActivityFixture =
  (): ListProductionHistoryActivityResult => ({
    items: [
      activityEntry,
      {
        ...activityEntry,
        id: id(20),
        eventType: "production_run_started",
        entityType: "production_run",
        entityId: serverFixtureIds.run,
        summary: "Production run started",
        details: {
          kind: "run",
          scheduleRunId: serverFixtureIds.schedule,
          batchCount: 1,
          queueVersion: 1,
        },
      },
    ],
    nextCursor: null,
    asOf: serverFixtureNow,
  })

const historyOverview = {
  productionRunId: serverFixtureIds.run,
  productionShiftId: serverFixtureIds.shift,
  scheduleRunId: serverFixtureIds.schedule,
  status: "started" as const,
  shiftStartsAt: shift.startsAt,
  shiftEndsAt: shift.endsAt,
  timezone: shift.timezone,
  startedAt: shift.startsAt,
  completedAt: null,
  plannedCompletionAt: run.plannedCompletionAt,
  batchCount: 1,
  completedBatchCount: 0,
  orderCount: 1,
  priorityOrderCount: 1,
  totalWeightLbs: 20,
  queueVersion: 1,
  overtimeAcknowledged: false,
  createdAt: "2026-08-22T11:50:00.000Z",
}

export const historyRunFixture = (): ProductionHistoryRunDetail => ({
  overview: historyOverview,
  batches: [
    {
      productionBatchId: serverFixtureIds.batch,
      sequence: 0,
      status: "queued",
      derivedWeightLbs: 20,
      pulseCapacityLbs: 100,
      currentOrderCount: 1,
      historicalOrderCount: 1,
      startedAt: null,
      finishedAt: null,
    },
  ],
  orderMemberships: [
    {
      membershipId: serverFixtureIds.membership,
      productionOrderId: serverFixtureIds.order,
      externalOrderId: "ORDER-FALLBACK",
      orderStatus: "scheduled",
      derivedWeightLbs: 20,
      bagCount: 1,
      productionBatchId: serverFixtureIds.batch,
      batchSequence: 0,
      placementProvenance: "initial_schedule",
      placement: {
        state: "current",
        placedAt: shift.startsAt,
        placedBy: serverFixtureIds.actor,
      },
    },
    {
      membershipId: id(30),
      productionOrderId: serverFixtureIds.order,
      externalOrderId: "ORDER-FALLBACK",
      orderStatus: "scheduled",
      derivedWeightLbs: 20,
      bagCount: 1,
      productionBatchId: serverFixtureIds.batch,
      batchSequence: 0,
      placementProvenance: "manual_rebatch",
      placement: {
        state: "released",
        placedAt: shift.startsAt,
        placedBy: serverFixtureIds.actor,
        releasedAt: "2026-08-22T13:00:00.000Z",
        releasedBy: serverFixtureIds.actor,
        reason: "manual_rebatch",
      },
    },
  ],
  stageProgress: { planned: 0, started: 0, completed: 0, items: [] },
  scheduleLineage: {
    executionScheduleRunId: serverFixtureIds.schedule,
    revisions: [
      {
        scheduleRunId: serverFixtureIds.schedule,
        productionShiftId: serverFixtureIds.shift,
        linkedProductionRunId: serverFixtureIds.run,
        status: "accepted",
        shiftStartsAt: shift.startsAt,
        shiftEndsAt: shift.endsAt,
        algorithmVersion: "fixed-pulse-ffd-v2",
        schedulerConfigId: serverFixtureIds.config,
        inputSnapshotHash: "b".repeat(64),
        outputPlanHash: "c".repeat(64),
        pulseCapacityLbs: 100,
        batchCount: 1,
        makespanMinutes: 240,
        plannedCompletionAt: run.plannedCompletionAt,
        warningCount: 0,
        acknowledgedWarningCount: 0,
        createdAt: "2026-08-22T11:00:00.000Z",
        acceptedAt: "2026-08-22T11:30:00.000Z",
        acceptedBy: serverFixtureIds.actor,
        supersededAt: null,
      },
    ],
  },
  activity: { items: [], hasMore: false },
  asOf: serverFixtureNow,
})

export const orderControlFixture = (): ListProductionOrderControlResult => ({
  items: [
    {
      order: { ...orderListItem },
      admission: {
        sourceState: "released",
        override: null,
        effectiveState: "released",
        allowedActions: [],
      },
      attention: null,
      currentPlacement: {
        productionRunId: serverFixtureIds.run,
        productionBatchId: serverFixtureIds.batch,
        batchSequence: 0,
        batchStatus: "queued",
        batchVersion: 1,
        queueVersion: 1,
        membershipFrozen: false,
        placementProvenance: "initial_schedule",
        pinnedAt: null,
        pinnedBy: null,
      },
      nextRequiredStage: "sorting",
      routeAttempts: [],
      commands: {
        queuedMove: {
          status: "blocked",
          code: "SOURCE_BATCH_WOULD_BE_EMPTY",
          targets: [],
        },
        routeException: {
          status: "blocked",
          code: "SOURCE_BATCH_WOULD_BE_EMPTY",
        },
      },
      resolutionAction: {
        status: "blocked",
        reasons: ["execution_committed"],
      },
    },
  ],
  counts: { attention: 0, active: 1, all: 1 },
  nextCursor: null,
  asOf: serverFixtureNow,
})
