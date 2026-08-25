import type { ProductionMutationResult } from "@pressly/production-system/contracts/demand/set-order-priority"
import type { AdvanceProductionStageResult } from "@pressly/production-system/contracts/floor/advance-stage"
import type {
  AutomaticProductionOrderPlacementResult,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
} from "@pressly/production-system/contracts/read-models/production-order-placement"
import type {
  ListProductionHistoryPlansQuery,
  ListProductionHistoryPlansResult,
} from "@pressly/production-system/contracts/read-models/production-history"
import type {
  ScheduleProposal,
  SchedulerConfig,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import type { AcceptScheduleClient } from "../features/scheduling/accept-schedule/types.ts"
import type { AdvanceStageRequest } from "../features/floor/advance-stage/types.ts"
import type { AssignStageMachinesClient } from "../features/floor/assign-stage-machines/types.ts"
import type { ChangeAdmissionClient } from "../features/demand/change-admission/types.ts"
import type { ChangeOrderResolutionClient } from "../features/demand/change-order-resolution/types.ts"
import type { CommitOrderBacklogClient } from "../features/demand/commit-order-backlog/types.ts"
import type { CommitOrderRouteClient } from "../features/orders/commit-order-route/types.ts"
import type { CreateScheduleClient } from "../features/scheduling/create-schedule/types.ts"
import type { CreateShiftClient } from "../features/scheduling/create-shift/types.ts"
import type { FreezeBatchMembershipClient } from "../features/floor/freeze-batch-membership/types.ts"
import type { ListHistoryRunsClient } from "../features/history/list-runs/types.ts"
import type { ListLocationsClient } from "../features/resources/list-locations/types.ts"
import type { ListOrdersClient } from "../features/orders/list-orders/types.ts"
import type { ListProductionHistoryActivityClient } from "../features/history/list-activity/types.ts"
import type { ListProductionOrderControlClient } from "../features/orders/list-order-control/types.ts"
import type { LoadProductionBoardClient } from "../features/queries/load-board/types.ts"
import type { LoadProductionHistoryRunClient } from "../features/history/load-run/types.ts"
import type { LoadProductionWorkspaceClient } from "../features/queries/load-workspace/types.ts"
import type { LoadRemainingDayForecastClient } from "../features/queries/load-remaining-day-forecast/types.ts"
import type { PreviewOrderRouteClient } from "../features/orders/preview-order-route/types.ts"
import type { PreviewProductionOrderBacklogClient } from "../features/queries/preview-order-backlog/types.ts"
import type { RecordOrderIntakeClient } from "../features/demand/record-order-intake/types.ts"
import type { ReconcileBatchProgressClient } from "../features/floor/reconcile-batch-progress/types.ts"
import type { ReplaceShiftSelectionClient } from "../features/scheduling/replace-shift-selection/types.ts"
import type { StartScheduleClient } from "../features/scheduling/start-schedule/types.ts"
import type { UnfreezeBatchMembershipClient } from "../features/floor/unfreeze-batch-membership/types.ts"
import type { UpdateShiftClient } from "../features/scheduling/update-shift/types.ts"

export type ProductionPort = Readonly<{
  listLocations: ListLocationsClient
  loadWorkspace: LoadProductionWorkspaceClient
  loadRemainingDayForecast: LoadRemainingDayForecastClient
  listOrders: ListOrdersClient
  listOrderControl: ListProductionOrderControlClient
  previewOrderBacklog: PreviewProductionOrderBacklogClient
  commitOrderBacklog: CommitOrderBacklogClient
  changeOrderResolution: ChangeOrderResolutionClient
  previewOrderRoute: PreviewOrderRouteClient
  commitOrderRoute: CommitOrderRouteClient
  listHistoryRuns: ListHistoryRunsClient
  listHistoryActivity: ListProductionHistoryActivityClient
  listHistoryPlans: (input: {
    locationId: string
    query: ListProductionHistoryPlansQuery
    signal?: AbortSignal
  }) => Promise<ListProductionHistoryPlansResult>
  loadHistoryRun: LoadProductionHistoryRunClient
  recordIntake: RecordOrderIntakeClient
  changeAdmission: ChangeAdmissionClient
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
  createShift: CreateShiftClient
  updateShift: UpdateShiftClient
  replaceShiftSelection: ReplaceShiftSelectionClient
  createSchedule: CreateScheduleClient
  loadSchedule: (
    locationId: string,
    scheduleRunId: string
  ) => Promise<ScheduleProposal>
  acceptSchedule: AcceptScheduleClient
  startSchedule: StartScheduleClient
  loadBoard: LoadProductionBoardClient
  setPriority: (input: {
    locationId: string
    productionOrderId: string
    priority: boolean
    expectedVersion: number
    idempotencyKey: string
  }) => Promise<ProductionMutationResult>
  freezeBatch: FreezeBatchMembershipClient
  unfreezeBatch: UnfreezeBatchMembershipClient
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
  reconcileBatchProgress: ReconcileBatchProgressClient
  advanceStage: (
    input: AdvanceStageRequest
  ) => Promise<AdvanceProductionStageResult>
  assignStageMachines: AssignStageMachinesClient
}>
