import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ListProductionOrderControlQuery,
  ProductionBoard,
  ProductionOrderControlItem,
  ProductionOrderRouteProposal,
  ProductionOrderRouteReason,
} from "@pressly/contracts"
import { useIsMobile } from "@/components/ui/use-mobile"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import {
  OrderControlWorkspace,
  type OrderControlCallbacks,
  type OrderControlFilters,
  type OrderControlOrder,
  type OrderControlViewModel,
} from "./order-control.view"
import type {
  OrderActionPreview,
  OrderDetailAction,
  OrderExceptionDraft,
  OrderExceptionKind,
  OrderMoveTarget,
} from "./order-control.model"

const stages = ["sorting", "washing", "drying", "folding_packaging"] as const
type Stage = (typeof stages)[number]

const emptyFilters: OrderControlFilters = {
  query: "",
  status: "all",
  due: "all",
  stage: "all",
  priority: "all",
}

const labels: Readonly<Record<string, string>> = {
  intake_pending: "Intake needed",
  eligible: "Eligible",
  ineligible: "Not eligible",
  scheduled: "In production",
  finished: "Finished",
  queued: "Queued",
  sorting: "Sorting",
  washing: "Washing",
  drying: "Drying",
  folding_packaging: "Folding & packaging",
  automatic: "Automatic placement",
  initial_schedule: "Initial schedule",
  manager_exact: "Manager placement",
  manual_rebatch: "Manual queued move",
  exception_route: "Floor exception route",
}

const labelFor = (value: string): string =>
  labels[value] ??
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

const messageFor = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : "The server could not complete this request."

const formatDate = (value: string, timezone: string): string =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

const dueQuery = (
  due: string,
  now: Date
): Pick<ListProductionOrderControlQuery, "dueAfter" | "dueBefore"> => {
  if (due === "all") return {}
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)
  const startTomorrow = new Date(startToday)
  startTomorrow.setDate(startTomorrow.getDate() + 1)
  const startLater = new Date(startTomorrow)
  startLater.setDate(startLater.getDate() + 1)
  if (due === "today") return { dueBefore: startTomorrow.toISOString() }
  if (due === "tomorrow")
    return {
      dueAfter: startTomorrow.toISOString(),
      dueBefore: startLater.toISOString(),
    }
  return { dueAfter: startLater.toISOString() }
}

const stageFor = (item: ProductionOrderControlItem): Stage => {
  if (item.currentPlacement === null) return item.nextRequiredStage ?? "sorting"
  const status = item.currentPlacement.batchStatus
  return stages.includes(status as Stage)
    ? (status as Stage)
    : (item.nextRequiredStage ?? "sorting")
}

const attentionFor = (
  item: ProductionOrderControlItem
): OrderControlOrder["attention"] => {
  if (item.attention === null) return null
  return {
    label: labelFor(item.attention.reason),
    detail: item.attention.message,
    tone:
      item.attention.reason === "placement_conflict" ||
      item.attention.reason === "route_blocked"
        ? "critical"
        : "warning",
  }
}

const presentOrder = (
  item: ProductionOrderControlItem,
  timezone: string,
  asOf: string
): OrderControlOrder => {
  const placement = item.currentPlacement
  const positionState =
    placement === null
      ? item.order.status === "finished"
        ? ("finished" as const)
        : ("unassigned" as const)
      : placement.batchStatus === "queued"
        ? ("queued" as const)
        : placement.batchStatus === "finished"
          ? ("finished" as const)
          : ("in_progress" as const)
  const stage = item.nextRequiredStage
  return {
    id: item.order.id,
    externalOrderId: item.order.externalOrderId,
    secondaryLabel: null,
    statusLabel: labelFor(item.order.status),
    dueLabel: labelFor(item.order.dueBucket),
    dueDetail: formatDate(item.order.dueAt, timezone),
    weightLabel: `${item.order.derivedWeightLbs.toLocaleString()} lb`,
    bagLabel:
      item.order.bagCount === null
        ? "Bags not counted"
        : `${item.order.bagCount} ${item.order.bagCount === 1 ? "bag" : "bags"}`,
    priority: item.order.priority,
    attention: attentionFor(item),
    position: {
      label:
        placement === null
          ? item.order.status === "finished"
            ? "Production complete"
            : "Not assigned"
          : `Batch ${placement.batchSequence + 1}`,
      detail:
        placement === null
          ? "This order is not currently assigned to a production batch."
          : `${labelFor(placement.batchStatus)}${stage === null ? "" : ` · next: ${labelFor(stage)}`}`,
      state: positionState,
      batchId: placement?.productionBatchId ?? null,
      batchLabel:
        placement === null ? null : `Batch ${placement.batchSequence + 1}`,
      stageLabel: stage === null ? null : labelFor(stage),
      membership:
        placement === null
          ? null
          : placement.membershipFrozen
            ? "frozen"
            : "mutable",
    },
    placement:
      placement === null
        ? null
        : {
            label: labelFor(placement.placementProvenance),
            detail: placement.membershipFrozen
              ? "Membership is frozen against normal queue changes."
              : "Membership is still mutable while this batch remains queued.",
            pinned: placement.pinnedAt !== null,
          },
    lastUpdatedLabel: formatDate(asOf, timezone),
    move: {
      available: item.canMoveQueued,
      reason: item.canMoveQueued
        ? null
        : "Normal moves require a mutable queued source batch.",
    },
    leaveBehind: {
      available: item.canRouteException,
      reason: item.canRouteException
        ? null
        : "Leave-behind is available after the source batch starts.",
    },
    rework: {
      available: item.canRouteException,
      reason: item.canRouteException
        ? null
        : "Rework is available after the source batch starts.",
    },
  }
}

const previewPresentation = (
  proposal: ProductionOrderRouteProposal
): OrderActionPreview => ({
  title:
    proposal.kind === "queued_move"
      ? "Queued move is valid"
      : "Floor route is valid",
  destinationLabel: `Batch ${proposal.targetBatchSequence + 1}`,
  destinationDetail: `${proposal.targetWeightLbs.toLocaleString()} of ${proposal.targetCapacityLbs.toLocaleString()} lb after this whole order moves.`,
  effects: [
    `Release unfinished ${proposal.releasedStages.map(labelFor).join(", ")} work from Batch ${proposal.sourceBatchSequence + 1}.`,
    `Assign ${proposal.assignedStages.map(labelFor).join(", ")} to Batch ${proposal.targetBatchSequence + 1}.`,
    "Keep every bag in the customer order together and retain completed attempt history.",
  ],
  warnings:
    proposal.kind === "exception"
      ? ["This records physical floor truth and cannot be silently undone."]
      : [],
  confirmationLabel:
    proposal.kind === "queued_move"
      ? "Move whole order"
      : "Confirm floor route",
})

const targetOptions = (
  item: ProductionOrderControlItem | null,
  board: ProductionBoard | null
): readonly OrderMoveTarget[] => {
  if (
    item?.currentPlacement === null ||
    item?.currentPlacement === undefined ||
    board === null ||
    board.productionRun.id !== item.currentPlacement.productionRunId
  )
    return []
  return board.batches.map((batch) => {
    const isSource = batch.id === item.currentPlacement!.productionBatchId
    const mutable =
      batch.status === "queued" && batch.membership.state === "mutable"
    const fits =
      batch.derivedWeightLbs + item.order.derivedWeightLbs <=
      batch.pulseCapacityLbs
    const disabled = isSource || !mutable || !fits
    return {
      batchId: batch.id,
      label: `Batch ${batch.sequence + 1}`,
      detail: `${batch.derivedWeightLbs.toLocaleString()} / ${batch.pulseCapacityLbs.toLocaleString()} lb`,
      disabled,
      disabledReason: isSource
        ? "This is the current batch."
        : !mutable
          ? "This batch has started or its membership is frozen."
          : !fits
            ? "The whole order would exceed hard pulse capacity."
            : null,
    }
  })
}

export function OrderControlWorkspaceContainer({
  production,
  idempotency,
  locationId,
  timezone,
  board,
  revision,
  onMutated,
}: Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  timezone: string
  board: ProductionBoard | null
  revision: string
  onMutated: () => Promise<void>
}>) {
  const isMobile = useIsMobile()
  const [tab, setTab] =
    useState<OrderControlViewModel["tab"]>("needs_attention")
  const [filters, setFilters] = useState<OrderControlFilters>(emptyFilters)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([])
  const [items, setItems] = useState<readonly ProductionOrderControlItem[]>([])
  const [counts, setCounts] = useState({ attention: 0, active: 0, all: 0 })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [asOf, setAsOf] = useState(revision)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const selectedOrderIdRef = useRef<string | null>(null)
  const [action, setAction] = useState<OrderDetailAction>({ kind: "none" })
  const [proposal, setProposal] = useState<ProductionOrderRouteProposal | null>(
    null
  )
  const refreshSequence = useRef(0)

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId
  }, [selectedOrderId])

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(filters.query.trim()),
      220
    )
    return () => window.clearTimeout(timeout)
  }, [filters.query])

  const query = useMemo<ListProductionOrderControlQuery>(() => {
    const now = new Date()
    return {
      view:
        tab === "needs_attention"
          ? "attention"
          : tab === "active"
            ? "active"
            : "all",
      limit: 25,
      ...(debouncedSearch.length === 0 ? {} : { search: debouncedSearch }),
      ...(filters.status === "all" ? {} : { status: filters.status as never }),
      ...(filters.stage === "all" ? {} : { stage: filters.stage as Stage }),
      ...(filters.priority === "all"
        ? {}
        : { priority: filters.priority === "priority" }),
      ...dueQuery(filters.due, now),
      ...(cursor === undefined ? {} : { cursor }),
    }
  }, [cursor, debouncedSearch, filters, tab])

  const load = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setLoading(true)
    setError(null)
    try {
      const result = await production.listOrderControl({ locationId, query })
      if (sequence !== refreshSequence.current) return
      setItems(result.items)
      setCounts(result.counts)
      setNextCursor(result.nextCursor)
      setAsOf(result.asOf)
      const selectedId = selectedOrderIdRef.current
      if (
        selectedId !== null &&
        !result.items.some((item) => item.order.id === selectedId)
      ) {
        setSelectedOrderId(null)
        setAction({ kind: "none" })
      }
    } catch (cause) {
      if (sequence === refreshSequence.current) setError(messageFor(cause))
    } finally {
      if (sequence === refreshSequence.current) {
        setHasLoaded(true)
        setLoading(false)
      }
    }
  }, [locationId, production, query])

  useEffect(() => {
    void load()
  }, [load, revision])

  const selectedItem =
    items.find((item) => item.order.id === selectedOrderId) ?? null
  const orders = useMemo(
    () => items.map((item) => presentOrder(item, timezone, asOf)),
    [asOf, items, timezone]
  )
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null

  const resetPaging = useCallback(() => {
    setCursor(undefined)
    setCursorHistory([])
  }, [])

  const startException = useCallback(
    (item: ProductionOrderControlItem, kind: OrderExceptionKind) => {
      const current = stageFor(item)
      const currentIndex = stages.indexOf(current)
      const restartStage =
        kind === "rework" && currentIndex >= stages.indexOf("washing")
          ? "washing"
          : current
      setProposal(null)
      setAction({
        kind,
        draft: {
          reason:
            kind === "rework"
              ? "rewash_required"
              : current === "drying"
                ? "needs_more_drying"
                : "stage_incomplete",
          restartStage,
          note: "",
        },
        reasonOptions: [
          { value: "needs_more_drying", label: "Needs more drying" },
          { value: "rewash_required", label: "Rewash required" },
          { value: "sorting_incomplete", label: "Sorting incomplete" },
          { value: "stage_incomplete", label: "Stage incomplete" },
          { value: "other", label: "Other floor reason" },
        ],
        restartStageOptions: stages.slice(0, currentIndex + 1).map((stage) => ({
          value: stage,
          label: labelFor(stage),
        })),
        preview: null,
        busy: false,
        error: null,
      })
    },
    []
  )

  const startMove = useCallback(
    async (orderId: string) => {
      const item = items.find((candidate) => candidate.order.id === orderId)
      if (item?.currentPlacement === null || item === undefined) return
      setSelectedOrderId(orderId)
      setProposal(null)
      setAction({
        kind: "move",
        selectedBatchId: "",
        targets: [],
        preview: null,
        busy: true,
        error: null,
      })
      try {
        const runId = item.currentPlacement.productionRunId
        const routeBoard =
          board?.productionRun.id === runId
            ? board
            : await production.loadBoard(locationId, runId)
        const nextTargets = targetOptions(item, routeBoard)
        const first =
          nextTargets.find((target) => !target.disabled)?.batchId ?? ""
        setAction({
          kind: "move",
          selectedBatchId: first,
          targets: nextTargets,
          preview: null,
          busy: false,
          error:
            first.length === 0
              ? "No mutable queued batch can receive this whole order."
              : null,
        })
      } catch (cause) {
        setAction({
          kind: "move",
          selectedBatchId: "",
          targets: [],
          preview: null,
          busy: false,
          error: messageFor(cause),
        })
      }
    },
    [board, items, locationId, production]
  )

  const previewRoute = useCallback(
    async (kind: "move" | "exception") => {
      if (selectedItem?.currentPlacement === null || selectedItem === null)
        return
      setAction((current) =>
        current.kind === "none"
          ? current
          : { ...current, busy: true, error: null }
      )
      try {
        const placement = selectedItem.currentPlacement
        const request =
          kind === "move" && action.kind === "move"
            ? ({
                kind: "queued_move" as const,
                reason: "manual_rebatch" as const,
                targetProductionBatchId: action.selectedBatchId,
                restartStage: "sorting" as const,
                expectedQueueVersion: placement.queueVersion,
                expectedOrderVersion: selectedItem.order.version,
                expectedSourceBatchVersion: placement.batchVersion,
              } as const)
            : action.kind === "leave_behind" || action.kind === "rework"
              ? ({
                  kind: "exception" as const,
                  reason: action.draft.reason as Exclude<
                    ProductionOrderRouteReason,
                    "manual_rebatch"
                  >,
                  restartStage: action.draft.restartStage as Stage,
                  ...(action.draft.note.trim().length === 0
                    ? {}
                    : { note: action.draft.note.trim() }),
                  expectedQueueVersion: placement.queueVersion,
                  expectedOrderVersion: selectedItem.order.version,
                  expectedSourceBatchVersion: placement.batchVersion,
                } as const)
              : null
        if (request === null) return
        const next = await production.previewOrderRoute({
          locationId,
          productionRunId: placement.productionRunId,
          productionOrderId: selectedItem.order.id,
          request,
        })
        setProposal(next)
        setAction((current) =>
          current.kind === "none"
            ? current
            : { ...current, preview: previewPresentation(next), busy: false }
        )
      } catch (cause) {
        setAction((current) =>
          current.kind === "none"
            ? current
            : { ...current, busy: false, error: messageFor(cause) }
        )
      }
    },
    [action, locationId, production, selectedItem]
  )

  const commitRoute = useCallback(async () => {
    if (
      selectedItem?.currentPlacement === null ||
      selectedItem === null ||
      proposal === null ||
      action.kind === "none"
    )
      return
    setAction((current) => ({ ...current, busy: true, error: null }))
    try {
      const placement = selectedItem.currentPlacement
      const operation =
        proposal.kind === "queued_move"
          ? "move-queued-order"
          : "route-order-exception"
      const idempotencyKey = await idempotency.key({
        operation,
        payload: {
          orderId: selectedItem.order.id,
          proposalHash: proposal.proposalHash,
        },
      })
      const request =
        proposal.kind === "queued_move" && action.kind === "move"
          ? ({
              kind: "queued_move" as const,
              reason: "manual_rebatch" as const,
              targetProductionBatchId: action.selectedBatchId,
              restartStage: "sorting" as const,
              expectedQueueVersion: placement.queueVersion,
              expectedOrderVersion: selectedItem.order.version,
              expectedSourceBatchVersion: placement.batchVersion,
              proposalHash: proposal.proposalHash,
              idempotencyKey,
            } as const)
          : action.kind === "leave_behind" || action.kind === "rework"
            ? ({
                kind: "exception" as const,
                reason: action.draft.reason as Exclude<
                  ProductionOrderRouteReason,
                  "manual_rebatch"
                >,
                restartStage: action.draft.restartStage as Stage,
                ...(action.draft.note.trim().length === 0
                  ? {}
                  : { note: action.draft.note.trim() }),
                expectedQueueVersion: placement.queueVersion,
                expectedOrderVersion: selectedItem.order.version,
                expectedSourceBatchVersion: placement.batchVersion,
                proposalHash: proposal.proposalHash,
                idempotencyKey,
              } as const)
            : null
      if (request === null) return
      await production.commitOrderRoute({
        locationId,
        productionRunId: placement.productionRunId,
        productionOrderId: selectedItem.order.id,
        request,
      })
      setSelectedOrderId(null)
      setAction({ kind: "none" })
      setProposal(null)
      await Promise.all([load(), onMutated()])
    } catch (cause) {
      setAction((current) =>
        current.kind === "none"
          ? current
          : { ...current, busy: false, error: messageFor(cause) }
      )
    }
  }, [
    action,
    idempotency,
    load,
    locationId,
    onMutated,
    production,
    proposal,
    selectedItem,
  ])

  const callbacks: OrderControlCallbacks = {
    onTabChange: (next) => {
      setTab(next)
      resetPaging()
    },
    onFiltersChange: (next) => {
      setFilters(next)
      resetPaging()
    },
    onClearFilters: () => {
      setFilters(emptyFilters)
      resetPaging()
    },
    onPreviousPage: (previous) => {
      const history = cursorHistory.slice(0, -1)
      setCursor(previous === "first" ? undefined : previous)
      setCursorHistory(history)
    },
    onNextPage: (next) => {
      setCursorHistory((history) => [...history, cursor])
      setCursor(next)
    },
    onOpenOrder: (orderId) => {
      setSelectedOrderId(orderId)
      setAction({ kind: "none" })
      setProposal(null)
    },
    onCloseOrder: () => {
      setSelectedOrderId(null)
      setAction({ kind: "none" })
      setProposal(null)
    },
    onStartMove: (orderId) => void startMove(orderId),
    onMoveTargetChange: (batchId) => {
      setProposal(null)
      setAction((current) =>
        current.kind === "move"
          ? { ...current, selectedBatchId: batchId, preview: null, error: null }
          : current
      )
    },
    onReviewMove: () => void previewRoute("move"),
    onConfirmMove: () => void commitRoute(),
    onStartException: (orderId, kind) => {
      const item = items.find((candidate) => candidate.order.id === orderId)
      if (item === undefined) return
      setSelectedOrderId(orderId)
      startException(item, kind)
    },
    onExceptionDraftChange: (draft: OrderExceptionDraft) => {
      setProposal(null)
      setAction((current) =>
        current.kind === "leave_behind" || current.kind === "rework"
          ? { ...current, draft, preview: null, error: null }
          : current
      )
    },
    onReviewException: () => void previewRoute("exception"),
    onConfirmException: () => void commitRoute(),
    onChangeActionDetails: () => {
      setProposal(null)
      setAction((current) =>
        current.kind === "none"
          ? current
          : { ...current, preview: null, error: null }
      )
    },
    onCancelAction: () => {
      setProposal(null)
      setAction({ kind: "none" })
    },
  }

  const model: OrderControlViewModel = {
    tab,
    counts: {
      needsAttention: counts.attention,
      active: counts.active,
      all: counts.all,
    },
    filters,
    filterOptions: {
      statuses: [
        { value: "all", label: "All statuses" },
        { value: "intake_pending", label: "Intake needed" },
        { value: "eligible", label: "Eligible" },
        { value: "scheduled", label: "In production" },
        { value: "finished", label: "Finished" },
      ],
      dueWindows: [
        { value: "all", label: "Any due date" },
        { value: "today", label: "Due today" },
        { value: "tomorrow", label: "Due tomorrow" },
        { value: "later", label: "Due later" },
      ],
      stages: [
        { value: "all", label: "Any stage" },
        ...stages.map((stage) => ({ value: stage, label: labelFor(stage) })),
      ],
      priorities: [
        { value: "all", label: "Any priority" },
        { value: "priority", label: "Priority only" },
        { value: "standard", label: "Standard only" },
      ],
    },
    orders,
    page: {
      rangeLabel: `Showing ${orders.length} ${orders.length === 1 ? "order" : "orders"}`,
      previousCursor:
        cursorHistory.length === 0
          ? null
          : (cursorHistory[cursorHistory.length - 1] ?? "first"),
      nextCursor,
    },
    asOfLabel: `Updated ${formatDate(asOf, timezone)}`,
    selectedOrder,
    detailAction: action,
    loading: loading && !hasLoaded,
    refreshing: loading && hasLoaded,
    error,
  }

  return (
    <OrderControlWorkspace
      model={model}
      callbacks={callbacks}
      isMobile={isMobile}
    />
  )
}
