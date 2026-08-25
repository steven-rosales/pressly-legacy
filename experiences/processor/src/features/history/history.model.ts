import type { ProcessorOperationalOrderIdentity } from "../../contracts/operational-order.ts"
import type { ChangeProductionOrderResolutionCommand } from "@pressly/production-system/contracts/demand/change-order-resolution"

type RestoreProductionOrderCommand = Extract<
  ChangeProductionOrderResolutionCommand,
  { action: "restore" }
>

export type HistoryRestoreReason = RestoreProductionOrderCommand["reason"]

export type HistoryCursorPageViewModel = Readonly<{
  rangeLabel: string
  previousCursor: string | null
  nextCursor: string | null
}>

export type HistoryTab = "runs" | "activity" | "plans"

export type HistoryFilters = Readonly<{
  query: string
  dateWindow: string
  status: string
}>

export type HistoryFilterOption = Readonly<{
  value: string
  label: string
}>

export type HistoryRunSummary = Readonly<{
  id: string
  title: string
  shiftLabel: string
  statusLabel: string
  status: "started" | "completed" | "other"
  demandLabel: string
  batchesLabel: string
  timingLabel: string
  exceptionLabel: string | null
  overtimeLabel: string | null
}>

export type HistoryActivityItem = Readonly<{
  id: string
  identity: ProcessorOperationalOrderIdentity | null
  title: string
  detail: string
  occurredAtLabel: string
  actorLabel: string
  entityLabel: string
  tone: "default" | "warning" | "critical"
  restoreAction: Readonly<{
    productionOrderId: string
    expectedVersion: number
  }> | null
}>

export type HistoryPlanSummary = Readonly<{
  id: string
  revisionLabel: string
  shiftLabel: string
  statusLabel: string
  status: "accepted" | "superseded" | "draft" | "other"
  computedAtLabel: string
  acceptedAtLabel: string | null
  warningsLabel: string
  productionRunId: string | null
}>

export type HistoryRunBatch = Readonly<{
  id: string
  label: string
  statusLabel: string
  demandLabel: string
  timingLabel: string
  exceptionLabel: string | null
}>

export type HistoryRunOrder = Readonly<{
  id: string
  identity: ProcessorOperationalOrderIdentity
  externalOrderId: string
  statusLabel: string
  demandLabel: string
  batchLabel: string
}>

export type HistoryRunDetail = Readonly<{
  id: string
  title: string
  shiftLabel: string
  statusLabel: string
  demandLabel: string
  batchCountLabel: string
  plannedTimingLabel: string
  actualTimingLabel: string
  exceptionLabel: string
  batches: readonly HistoryRunBatch[]
  orders: readonly HistoryRunOrder[]
  activity: readonly HistoryActivityItem[]
  plans: readonly HistoryPlanSummary[]
}>

export type HistoryViewModel = Readonly<{
  tab: HistoryTab
  filters: HistoryFilters
  dateOptions: readonly HistoryFilterOption[]
  statusOptions: readonly HistoryFilterOption[]
  runs: readonly HistoryRunSummary[]
  activity: readonly HistoryActivityItem[]
  plans: readonly HistoryPlanSummary[]
  page: HistoryCursorPageViewModel
  asOfLabel: string
  selectedRun: HistoryRunDetail | null
  loading: boolean
  refreshing: boolean
  error: string | null
  canManage: boolean
  restoringOrderId: string | null
  restoreError: string | null
  restoreNotice: string | null
}>

export type HistoryCallbacks = Readonly<{
  onTabChange: (tab: HistoryTab) => void
  onFiltersChange: (filters: HistoryFilters) => void
  onClearFilters: () => void
  onPreviousPage: (cursor: string) => void
  onNextPage: (cursor: string) => void
  onOpenRun: (runId: string) => void
  onCloseRun: () => void
  onRestoreOrder: (input: {
    productionOrderId: string
    expectedVersion: number
    reason: HistoryRestoreReason
    note: string | null
  }) => void
}>
