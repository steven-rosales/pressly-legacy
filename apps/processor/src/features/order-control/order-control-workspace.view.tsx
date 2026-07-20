import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
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
import { presentOrderControlError } from "./order-control.error.presenter"
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

const localeForLanguage = (language: string | undefined): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

const emptyFilters: OrderControlFilters = {
  query: "",
  status: "all",
  due: "all",
  stage: "all",
  priority: "all",
}

const labelFor = (value: string, t: TFunction): string => {
  if (value === "release_pending") return t("orderControl.awaitingCentsRelease")
  if (value === "intake_pending") return t("orderControl.intakeNeeded")
  if (value === "eligible") return t("orderControl.eligible")
  if (value === "ineligible") return t("orderControl.notEligible")
  if (value === "scheduled") return t("orderControl.inProduction")
  if (value === "finished") return t("orderControl.finished")
  if (value === "overdue") return t("common.due.overdue")
  if (value === "today") return t("common.due.today")
  if (value === "tomorrow") return t("common.due.tomorrow")
  if (value === "later") return t("common.due.later")
  if (value === "queued") return t("common.queued")
  if (value === "sorting") return t("common.stage.sorting")
  if (value === "washing") return t("common.stage.washing")
  if (value === "drying") return t("common.stage.drying")
  if (value === "folding_packaging") return t("common.stage.foldingPackaging")
  if (value === "automatic") return t("orderControl.automaticPlacement")
  if (value === "initial_schedule") return t("orderControl.initialSchedule")
  if (value === "manager_exact") return t("orderControl.managerPlacement")
  if (value === "manual_rebatch") return t("orderControl.manualMove")
  if (value === "exception_route") return t("orderControl.exceptionRoute")
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

const formatDate = (value: string, timezone: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

const stageFor = (item: ProductionOrderControlItem): Stage => {
  if (item.currentPlacement === null) return item.nextRequiredStage ?? "sorting"
  const status = item.currentPlacement.batchStatus
  return stages.includes(status as Stage)
    ? (status as Stage)
    : (item.nextRequiredStage ?? "sorting")
}

const attentionFor = (
  item: ProductionOrderControlItem,
  t: TFunction
): OrderControlOrder["attention"] => {
  if (item.attention === null) return null
  const copy =
    item.attention.reason === "intake_required"
      ? {
          label: t("orderControl.attentionIntake"),
          detail: t("orderControl.attentionIntakeDetail"),
        }
      : item.attention.reason === "placement_pending"
        ? {
            label: t("orderControl.attentionPlacementPending"),
            detail: t("orderControl.attentionPlacementPendingDetail"),
          }
        : item.attention.reason === "placement_conflict"
          ? {
              label: t("orderControl.attentionPlacementConflict"),
              detail: t("orderControl.attentionPlacementConflictDetail"),
            }
          : {
              label: t("orderControl.attentionRouteBlocked"),
              detail: t("orderControl.attentionRouteBlockedDetail"),
            }
  return {
    ...copy,
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
  asOf: string,
  locale: string,
  t: TFunction
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
    statusLabel: labelFor(item.order.status, t),
    dueLabel:
      item.order.status === "finished"
        ? t("orderControl.finished")
        : labelFor(item.order.dueBucket, t),
    dueDetail: formatDate(item.order.dueAt, timezone, locale),
    weightLabel: t("common.pounds", { value: item.order.derivedWeightLbs }),
    bagLabel:
      item.order.bagCount === null
        ? t("orderControl.bagsNotCounted")
        : t("common.bags", { count: item.order.bagCount }),
    priority: item.order.priority,
    attention: attentionFor(item, t),
    position: {
      label:
        placement === null
          ? item.order.status === "finished"
            ? t("orderControl.productionComplete")
            : t("orderControl.notAssigned")
          : t("orderControl.batch", {
              number: placement.batchSequence + 1,
            }),
      detail:
        placement === null
          ? t("orderControl.unassignedDetail")
          : t("orderControl.positionDetail", {
              status: labelFor(placement.batchStatus, t),
              next:
                stage === null
                  ? ""
                  : t("orderControl.nextStage", {
                      stage: labelFor(stage, t),
                    }),
            }),
      state: positionState,
      batchId: placement?.productionBatchId ?? null,
      batchLabel:
        placement === null
          ? null
          : t("orderControl.batch", {
              number: placement.batchSequence + 1,
            }),
      stageLabel: stage === null ? null : labelFor(stage, t),
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
            label: labelFor(placement.placementProvenance, t),
            detail: placement.membershipFrozen
              ? t("orderControl.membershipFrozen")
              : t("orderControl.membershipMutable"),
            pinned: placement.pinnedAt !== null,
          },
    lastUpdatedLabel: formatDate(asOf, timezone, locale),
    move: {
      available: item.canMoveQueued,
      reason: item.canMoveQueued ? null : t("orderControl.moveUnavailable"),
    },
    leaveBehind: {
      available: item.canRouteException,
      reason: item.canRouteException
        ? null
        : t("orderControl.leaveUnavailable"),
    },
    rework: {
      available: item.canRouteException,
      reason: item.canRouteException
        ? null
        : t("orderControl.reworkUnavailable"),
    },
  }
}

const previewPresentation = (
  proposal: ProductionOrderRouteProposal,
  t: TFunction
): OrderActionPreview => ({
  title:
    proposal.kind === "queued_move"
      ? t("orderControl.queuedMoveValid")
      : t("orderControl.floorRouteValid"),
  destinationLabel: t("orderControl.batch", {
    number: proposal.targetBatchSequence + 1,
  }),
  destinationDetail: t("orderControl.destinationDetail", {
    weight: proposal.targetWeightLbs,
    capacity: proposal.targetCapacityLbs,
  }),
  effects: [
    t("orderControl.releaseWork", {
      stages: proposal.releasedStages
        .map((stage) => labelFor(stage, t))
        .join(", "),
      batch: proposal.sourceBatchSequence + 1,
    }),
    t("orderControl.assignWork", {
      stages: proposal.assignedStages
        .map((stage) => labelFor(stage, t))
        .join(", "),
      batch: proposal.targetBatchSequence + 1,
    }),
    t("orderControl.keepTogether"),
  ],
  warnings:
    proposal.kind === "exception" ? [t("orderControl.irreversible")] : [],
  confirmationLabel:
    proposal.kind === "queued_move"
      ? t("orderControl.moveWholeOrder")
      : t("orderControl.confirmFloorRoute"),
})

const targetOptions = (
  item: ProductionOrderControlItem | null,
  board: ProductionBoard | null,
  locale: string,
  t: TFunction
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
      label: t("orderControl.batch", { number: batch.sequence + 1 }),
      detail: `${batch.derivedWeightLbs.toLocaleString(locale)} / ${batch.pulseCapacityLbs.toLocaleString(locale)} lb`,
      disabled,
      disabledReason: isSource
        ? t("orderControl.currentBatch")
        : !mutable
          ? t("orderControl.batchImmutable")
          : !fits
            ? t("orderControl.exceedsCapacity")
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
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
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
      ...(filters.due === "all" ? {} : { dueBucket: filters.due }),
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
      if (sequence === refreshSequence.current)
        setError(presentOrderControlError(cause, "load", t))
    } finally {
      if (sequence === refreshSequence.current) {
        setHasLoaded(true)
        setLoading(false)
      }
    }
  }, [locationId, production, query, t])

  useEffect(() => {
    void load()
  }, [load, revision])

  const selectedItem =
    items.find((item) => item.order.id === selectedOrderId) ?? null
  const orders = useMemo(
    () => items.map((item) => presentOrder(item, timezone, asOf, locale, t)),
    [asOf, items, locale, t, timezone]
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
          {
            value: "needs_more_drying",
            label: t("orderControl.needsMoreDrying"),
          },
          { value: "rewash_required", label: t("orderControl.rewashRequired") },
          {
            value: "sorting_incomplete",
            label: t("orderControl.sortingIncomplete"),
          },
          {
            value: "stage_incomplete",
            label: t("orderControl.stageIncomplete"),
          },
          { value: "other", label: t("orderControl.otherFloorReason") },
        ],
        restartStageOptions: stages.slice(0, currentIndex + 1).map((stage) => ({
          value: stage,
          label: labelFor(stage, t),
        })),
        preview: null,
        busy: false,
        error: null,
      })
    },
    [t]
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
        const nextTargets = targetOptions(item, routeBoard, locale, t)
        const first =
          nextTargets.find((target) => !target.disabled)?.batchId ?? ""
        setAction({
          kind: "move",
          selectedBatchId: first,
          targets: nextTargets,
          preview: null,
          busy: false,
          error: first.length === 0 ? t("orderControl.noTarget") : null,
        })
      } catch (cause) {
        setAction({
          kind: "move",
          selectedBatchId: "",
          targets: [],
          preview: null,
          busy: false,
          error: presentOrderControlError(cause, "load_targets", t),
        })
      }
    },
    [board, items, locale, locationId, production, t]
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
            : { ...current, preview: previewPresentation(next, t), busy: false }
        )
      } catch (cause) {
        setAction((current) =>
          current.kind === "none"
            ? current
            : {
                ...current,
                busy: false,
                error: presentOrderControlError(cause, "preview", t),
              }
        )
      }
    },
    [action, locationId, production, selectedItem, t]
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
          : {
              ...current,
              busy: false,
              error: presentOrderControlError(cause, "commit", t),
            }
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
    t,
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
        { value: "all", label: t("orderControl.allStatuses") },
        {
          value: "release_pending",
          label: t("orderControl.awaitingCentsRelease"),
        },
        { value: "intake_pending", label: t("orderControl.intakeNeeded") },
        { value: "eligible", label: t("orderControl.eligible") },
        { value: "scheduled", label: t("orderControl.inProduction") },
        { value: "finished", label: t("orderControl.finished") },
      ],
      dueWindows: [
        { value: "all", label: t("orderControl.anyDueDate") },
        { value: "overdue", label: t("orderControl.pastDue") },
        { value: "today", label: t("orderControl.dueToday") },
        { value: "tomorrow", label: t("orderControl.dueTomorrow") },
        { value: "later", label: t("orderControl.dueLater") },
      ],
      stages: [
        { value: "all", label: t("orderControl.anyStage") },
        ...stages.map((stage) => ({
          value: stage,
          label: labelFor(stage, t),
        })),
      ],
      priorities: [
        { value: "all", label: t("orderControl.anyPriority") },
        { value: "priority", label: t("orderControl.priorityOnly") },
        { value: "standard", label: t("orderControl.standardOnly") },
      ],
    },
    orders,
    page: {
      rangeLabel: t("orderControl.showing", {
        orders: t("common.orders", { count: orders.length }),
      }),
      previousCursor:
        cursorHistory.length === 0
          ? null
          : (cursorHistory[cursorHistory.length - 1] ?? "first"),
      nextCursor,
    },
    asOfLabel: t("orderControl.updated", {
      date: formatDate(asOf, timezone, locale),
    }),
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
