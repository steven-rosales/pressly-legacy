import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  ListProductionOrderControlQuery,
  ProcessorOrderControlItem,
  ProductionBoard,
  ProductionOrderRouteProposal,
  ProductionOrderRouteReason,
} from "@pressly/contracts"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import { presentOrderControlError } from "./order-control.error.presenter"
import type {
  OrderControlCallbacks,
  OrderControlFilters,
  OrderControlViewModel,
  OrderDetailAction,
  OrderExceptionDraft,
  OrderExceptionKind,
} from "./order-control.model"
import {
  emptyOrderControlFilters,
  formatOrderControlDate,
  labelForOrderControlValue,
  localeForOrderControlLanguage,
  orderControlStages,
  presentOrderControlOrder,
  presentOrderMoveTargets,
  presentOrderRoutePreview,
  stageForOrder,
  type OrderControlStage,
} from "./order-control.presenter"

export type OrderControlWorkspaceModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  timezone: string
  board: ProductionBoard | null
  revision: string
  onMutated: () => Promise<void>
}>

export const useOrderControlWorkspaceModel = (
  input: OrderControlWorkspaceModelInput
): Readonly<{
  model: OrderControlViewModel
  callbacks: OrderControlCallbacks
}> => {
  const { production, idempotency, locationId, timezone, board, revision } =
    input
  const { t, i18n } = useTranslation()
  const locale = localeForOrderControlLanguage(i18n.resolvedLanguage)
  const [tab, setTab] =
    useState<OrderControlViewModel["tab"]>("needs_attention")
  const [filters, setFilters] = useState<OrderControlFilters>(
    emptyOrderControlFilters
  )
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([])
  const [items, setItems] = useState<readonly ProcessorOrderControlItem[]>([])
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
      ...(filters.stage === "all"
        ? {}
        : { stage: filters.stage as OrderControlStage }),
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
    () =>
      items.map((item) =>
        presentOrderControlOrder(item, timezone, asOf, locale, t)
      ),
    [asOf, items, locale, t, timezone]
  )
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null

  const resetPaging = useCallback(() => {
    setCursor(undefined)
    setCursorHistory([])
  }, [])

  const startException = useCallback(
    (item: ProcessorOrderControlItem, kind: OrderExceptionKind) => {
      const current = stageForOrder(item)
      const currentIndex = orderControlStages.indexOf(current)
      const restartStage =
        kind === "rework" &&
        currentIndex >= orderControlStages.indexOf("washing")
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
        restartStageOptions: orderControlStages
          .slice(0, currentIndex + 1)
          .map((stage) => ({
            value: stage,
            label: labelForOrderControlValue(stage, t),
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
        const targets = presentOrderMoveTargets(item, routeBoard, locale, t)
        const first = targets.find((target) => !target.disabled)?.batchId ?? ""
        setAction({
          kind: "move",
          selectedBatchId: first,
          targets,
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
                  restartStage: action.draft.restartStage as OrderControlStage,
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
            : {
                ...current,
                preview: presentOrderRoutePreview(next, t),
                busy: false,
              }
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
                restartStage: action.draft.restartStage as OrderControlStage,
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
      await Promise.all([load(), input.onMutated()])
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
    input,
    load,
    locationId,
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
      setFilters(emptyOrderControlFilters)
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
        { value: "release_pending", label: t("orderControl.forecastOnly") },
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
        ...orderControlStages.map((stage) => ({
          value: stage,
          label: labelForOrderControlValue(stage, t),
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
      date: formatOrderControlDate(asOf, timezone, locale),
    }),
    selectedOrder,
    detailAction: action,
    loading: loading && !hasLoaded,
    refreshing: loading && hasLoaded,
    error,
  }

  return { model, callbacks }
}
