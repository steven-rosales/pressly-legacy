export type OrderControlTab = "needs_attention" | "active" | "all"

export type OrderControlFilterOption<TValue extends string = string> =
  Readonly<{
    value: TValue
    label: string
  }>

export type OrderControlDueFilter =
  | "all"
  | "overdue"
  | "today"
  | "tomorrow"
  | "later"

export type OrderControlFilters = Readonly<{
  query: string
  status: string
  due: OrderControlDueFilter
  stage: string
  priority: string
}>

export type OrderControlFilterOptions = Readonly<{
  statuses: readonly OrderControlFilterOption[]
  dueWindows: readonly OrderControlFilterOption<OrderControlDueFilter>[]
  stages: readonly OrderControlFilterOption[]
  priorities: readonly OrderControlFilterOption[]
}>

export type OrderControlAttention = Readonly<{
  label: string
  detail: string
  tone: "warning" | "critical"
}>

export type OrderControlPlacement = Readonly<{
  label: string
  detail: string
  pinned: boolean
}>

export type OrderControlPosition = Readonly<{
  label: string
  detail: string
  state: "unassigned" | "queued" | "in_progress" | "finished"
  batchId: string | null
  batchLabel: string | null
  stageLabel: string | null
  membership: "mutable" | "frozen" | null
}>

export type OrderControlActionAvailability = Readonly<{
  available: boolean
  reason: string | null
}>

export type OrderControlOrder = Readonly<{
  id: string
  identity: ProcessorOperationalOrderIdentity
  externalOrderId: string
  secondaryLabel: string | null
  customerLabel: string
  phoneLabel: string
  commercialStateLabel: string
  admissionStateLabel: string
  sourceStateLabel: string
  statusLabel: string
  dueLabel: string
  dueDetail: string
  weightLabel: string
  bagLabel: string
  priority: boolean
  attention: OrderControlAttention | null
  position: OrderControlPosition
  placement: OrderControlPlacement | null
  lastUpdatedLabel: string
  move: OrderControlActionAvailability
  leaveBehind: OrderControlActionAvailability
  rework: OrderControlActionAvailability
}>

export type OrderControlCounts = Readonly<{
  needsAttention: number
  active: number
  all: number
}>

export type CursorPageViewModel = Readonly<{
  rangeLabel: string
  previousCursor: string | null
  nextCursor: string | null
}>

export type OrderMoveTarget = Readonly<{
  batchId: string
  label: string
  detail: string
  disabled: boolean
  disabledReason: string | null
}>

export type OrderActionPreview = Readonly<{
  title: string
  destinationLabel: string
  destinationDetail: string
  effects: readonly string[]
  warnings: readonly string[]
  confirmationLabel: string
}>

export type OrderMoveAction = Readonly<{
  kind: "move"
  selectedBatchId: string
  targets: readonly OrderMoveTarget[]
  preview: OrderActionPreview | null
  busy: boolean
  error: string | null
}>

export type OrderExceptionKind = "leave_behind" | "rework"

export type OrderExceptionDraft = Readonly<{
  reason: string
  restartStage: string
  note: string
}>

export type OrderExceptionAction = Readonly<{
  kind: OrderExceptionKind
  draft: OrderExceptionDraft
  reasonOptions: readonly OrderControlFilterOption[]
  restartStageOptions: readonly OrderControlFilterOption[]
  preview: OrderActionPreview | null
  busy: boolean
  error: string | null
}>

export type OrderDetailAction =
  | Readonly<{ kind: "none" }>
  | OrderMoveAction
  | OrderExceptionAction

export type OrderControlViewModel = Readonly<{
  tab: OrderControlTab
  counts: OrderControlCounts
  filters: OrderControlFilters
  filterOptions: OrderControlFilterOptions
  orders: readonly OrderControlOrder[]
  page: CursorPageViewModel
  asOfLabel: string
  selectedOrder: OrderControlOrder | null
  detailAction: OrderDetailAction
  loading: boolean
  refreshing: boolean
  error: string | null
}>

export type OrderControlCallbacks = Readonly<{
  onTabChange: (tab: OrderControlTab) => void
  onFiltersChange: (filters: OrderControlFilters) => void
  onClearFilters: () => void
  onPreviousPage: (cursor: string) => void
  onNextPage: (cursor: string) => void
  onOpenOrder: (orderId: string) => void
  onCloseOrder: () => void
  onStartMove: (orderId: string) => void
  onMoveTargetChange: (batchId: string) => void
  onReviewMove: () => void
  onConfirmMove: () => void
  onStartException: (orderId: string, kind: OrderExceptionKind) => void
  onExceptionDraftChange: (draft: OrderExceptionDraft) => void
  onReviewException: () => void
  onConfirmException: () => void
  onChangeActionDetails: () => void
  onCancelAction: () => void
}>
import type { ProcessorOperationalOrderIdentity } from "@pressly/contracts"
