import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ListProductionHistoryActivityResult,
  ListProductionHistoryPlansResult,
  ListProductionHistoryRunsResult,
  ProductionHistoryActivityEntry,
  ProductionHistoryPlanSummary,
  ProductionHistoryRunDetail,
  ProductionHistoryRunSummary,
} from "@pressly/contracts"
import { useIsMobile } from "@/components/ui/use-mobile"
import type { ProductionPort } from "@/ports/production.port"
import {
  HistoryWorkspace,
  type HistoryCallbacks,
  type HistoryFilters,
  type HistoryRunDetail,
  type HistoryViewModel,
} from "./history.view"
import type {
  HistoryActivityItem,
  HistoryPlanSummary as HistoryPlanViewModel,
  HistoryRunSummary as HistoryRunViewModel,
  HistoryTab,
} from "./history.model"

const emptyFilters: HistoryFilters = {
  query: "",
  dateWindow: "all",
  status: "all",
}

const messageFor = (cause: unknown): string =>
  cause instanceof Error ? cause.message : "History could not be loaded."

const labelFor = (value: string): string =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

const formatDate = (value: string, timezone: string): string =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

const durationLabel = (start: string, end: string | null): string => {
  if (end === null) return "In progress"
  const minutes = Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(start)) / 60_000)
  )
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours === 0 ? `${minutes}m` : `${hours}h ${remainder}m`
}

const presentRun = (
  run: ProductionHistoryRunSummary,
  timezone: string
): HistoryRunViewModel => ({
  id: run.productionRunId,
  title: `Run ${run.productionRunId.slice(0, 8)}`,
  shiftLabel: `${formatDate(run.shiftStartsAt, timezone)} – ${formatDate(run.shiftEndsAt, timezone)}`,
  statusLabel: labelFor(run.status),
  status: run.status,
  demandLabel: `${run.orderCount} orders · ${run.totalWeightLbs.toLocaleString()} lb`,
  batchesLabel: `${run.completedBatchCount} of ${run.batchCount} batches finished`,
  timingLabel:
    run.status === "completed"
      ? durationLabel(run.startedAt, run.completedAt)
      : `Planned through ${formatDate(run.plannedCompletionAt, timezone)}`,
  exceptionLabel: null,
  overtimeLabel: run.overtimeAcknowledged ? "Overtime accepted" : null,
})

const activityDetail = (activity: ProductionHistoryActivityEntry): string => {
  const details = activity.details
  switch (details.kind) {
    case "order":
      return (
        [
          details.outcome,
          details.routeReason === null ? null : labelFor(details.routeReason),
          details.sourceBatchId === null || details.targetBatchId === null
            ? null
            : `${details.sourceBatchId.slice(0, 8)} → ${details.targetBatchId.slice(0, 8)}`,
          details.restartStage === null
            ? null
            : `resume ${labelFor(details.restartStage)}`,
          details.queueVersion === null
            ? null
            : `queue v${details.queueVersion}`,
        ]
          .filter(Boolean)
          .join(" · ") || "Order state changed."
      )
    case "batch":
      return [details.action, details.reason, details.targetMilestone]
        .filter(Boolean)
        .map(String)
        .map(labelFor)
        .join(" · ")
    case "stage":
      return `${labelFor(details.action)}${details.timingConfirmationRecorded ? " · timing confirmed" : ""}`
    case "schedule":
      return details.productionShiftId === null
        ? "Schedule revision recorded."
        : `Shift ${details.productionShiftId.slice(0, 8)}`
    case "run":
      return `${details.batchCount ?? 0} batches · queue v${details.queueVersion ?? 1}`
    case "shift":
      return details.changedFields.length === 0
        ? "Shift lifecycle changed."
        : `Changed ${details.changedFields.join(", ")}`
    case "configuration":
      return details.version === null
        ? "Configuration changed."
        : `Version ${details.version}`
    case "demand":
      return details.outcome ?? "Demand synchronized."
  }
}

const presentActivity = (
  activity: ProductionHistoryActivityEntry,
  timezone: string
): HistoryActivityItem => ({
  id: activity.id,
  title: activity.summary,
  detail: activityDetail(activity),
  occurredAtLabel: formatDate(activity.occurredAt, timezone),
  actorLabel: activity.actor.displayName ?? labelFor(activity.actor.kind),
  entityLabel: `${labelFor(activity.entityType)} ${activity.entityId.slice(0, 8)}`,
  tone:
    activity.eventType === "production_order_route_exception_recorded" ||
    activity.eventType === "production_order_placement_overtime_required"
      ? "warning"
      : "default",
})

const presentPlan = (
  plan: ProductionHistoryPlanSummary,
  timezone: string
): HistoryPlanViewModel => ({
  id: plan.scheduleRunId,
  revisionLabel: `Plan ${plan.scheduleRunId.slice(0, 8)}`,
  shiftLabel: `${formatDate(plan.shiftStartsAt, timezone)} – ${formatDate(plan.shiftEndsAt, timezone)}`,
  statusLabel: labelFor(plan.status),
  status: plan.status === "rejected" ? "other" : plan.status,
  computedAtLabel: formatDate(plan.createdAt, timezone),
  acceptedAtLabel:
    plan.acceptedAt === null ? null : formatDate(plan.acceptedAt, timezone),
  warningsLabel: `${plan.acknowledgedWarningCount} of ${plan.warningCount} warnings acknowledged`,
  productionRunId: plan.linkedProductionRunId,
})

const presentDetail = (
  value: ProductionHistoryRunDetail,
  timezone: string
): HistoryRunDetail => {
  const detail = value
  const run = presentRun(detail.overview, timezone)
  const activity = detail.activity.items.map((item) =>
    presentActivity(item, timezone)
  )
  const exceptionCount = activity.filter(
    (item) => item.tone !== "default"
  ).length
  return {
    id: run.id,
    title: run.title,
    shiftLabel: run.shiftLabel,
    statusLabel: run.statusLabel,
    demandLabel: run.demandLabel,
    batchCountLabel: `${detail.overview.completedBatchCount} / ${detail.overview.batchCount} complete`,
    plannedTimingLabel: `Through ${formatDate(detail.overview.plannedCompletionAt, timezone)}`,
    actualTimingLabel: durationLabel(
      detail.overview.startedAt,
      detail.overview.completedAt
    ),
    exceptionLabel:
      exceptionCount === 0
        ? "None"
        : `${exceptionCount} floor ${exceptionCount === 1 ? "exception" : "exceptions"}`,
    batches: detail.batches.map((batch) => ({
      id: batch.productionBatchId,
      label: `Batch ${batch.sequence + 1}`,
      statusLabel: labelFor(batch.status),
      demandLabel: `${batch.derivedWeightLbs.toLocaleString()} / ${batch.pulseCapacityLbs.toLocaleString()} lb`,
      timingLabel:
        batch.startedAt === null
          ? "Not started"
          : durationLabel(batch.startedAt, batch.finishedAt),
      exceptionLabel:
        batch.historicalOrderCount === batch.currentOrderCount
          ? null
          : `${batch.historicalOrderCount - batch.currentOrderCount} moved`,
    })),
    orders: detail.orderMemberships.map((order) => ({
      id: order.productionOrderId,
      externalOrderId: order.externalOrderId,
      statusLabel: labelFor(order.orderStatus),
      demandLabel: `${order.derivedWeightLbs.toLocaleString()} lb · ${order.bagCount ?? "—"} bags`,
      batchLabel: `Batch ${order.batchSequence + 1}${order.placement.state === "current" ? "" : " · historical"}`,
    })),
    activity,
    plans: detail.scheduleLineage.revisions.map((plan) =>
      presentPlan(plan, timezone)
    ),
  }
}

const historyAfter = (window: string, anchor: Date): string | undefined => {
  if (window === "all") return undefined
  const days = window === "7d" ? 7 : window === "30d" ? 30 : 90
  return new Date(anchor.getTime() - days * 86_400_000).toISOString()
}

export function HistoryWorkspaceContainer({
  production,
  locationId,
  timezone,
  revision,
}: Readonly<{
  production: ProductionPort
  locationId: string
  timezone: string
  revision: string
}>) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<HistoryTab>("runs")
  const [filters, setFilters] = useState<HistoryFilters>(emptyFilters)
  const [dateAnchor, setDateAnchor] = useState(() => new Date())
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([])
  const [runsResult, setRunsResult] =
    useState<ListProductionHistoryRunsResult | null>(null)
  const [activityResult, setActivityResult] =
    useState<ListProductionHistoryActivityResult | null>(null)
  const [plansResult, setPlansResult] =
    useState<ListProductionHistoryPlansResult | null>(null)
  const [selectedRun, setSelectedRun] = useState<HistoryRunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(filters.query.trim()),
      220
    )
    return () => window.clearTimeout(timeout)
  }, [filters.query])

  const load = useCallback(async () => {
    const requestSequence = ++sequence.current
    setLoading(true)
    setError(null)
    try {
      const createdAfter = historyAfter(filters.dateWindow, dateAnchor)
      const search = debouncedSearch.length === 0 ? undefined : debouncedSearch
      if (tab === "runs") {
        const value = await production.listHistoryRuns({
          locationId,
          query: {
            limit: 50,
            ...(cursor === undefined ? {} : { cursor }),
            ...(search === undefined ? {} : { search }),
            ...(createdAfter === undefined ? {} : { createdAfter }),
            ...(filters.status === "started" || filters.status === "completed"
              ? { status: filters.status }
              : {}),
          },
        })
        if (requestSequence === sequence.current) setRunsResult(value)
      } else if (tab === "activity") {
        const value = await production.listHistoryActivity({
          locationId,
          query: {
            limit: 50,
            ...(cursor === undefined ? {} : { cursor }),
            ...(search === undefined ? {} : { search }),
            ...(createdAfter === undefined
              ? {}
              : { occurredAfter: createdAfter }),
          },
        })
        if (requestSequence === sequence.current) setActivityResult(value)
      } else {
        const value = await production.listHistoryPlans({
          locationId,
          query: {
            limit: 50,
            ...(cursor === undefined ? {} : { cursor }),
            ...(search === undefined ? {} : { search }),
            ...(createdAfter === undefined ? {} : { createdAfter }),
            ...(filters.status === "draft" ||
            filters.status === "accepted" ||
            filters.status === "superseded" ||
            filters.status === "rejected"
              ? { status: filters.status }
              : {}),
          },
        })
        if (requestSequence === sequence.current) setPlansResult(value)
      }
    } catch (cause) {
      if (requestSequence === sequence.current) setError(messageFor(cause))
    } finally {
      if (requestSequence === sequence.current) setLoading(false)
    }
  }, [
    cursor,
    dateAnchor,
    debouncedSearch,
    filters.dateWindow,
    filters.status,
    locationId,
    production,
    tab,
  ])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load, revision])

  const resetPaging = () => {
    setCursor(undefined)
    setCursorHistory([])
  }
  const runs = (runsResult?.items ?? []).map((run) => presentRun(run, timezone))
  const activity = (activityResult?.items ?? []).map((item) =>
    presentActivity(item, timezone)
  )
  const plans = (plansResult?.items ?? []).map((plan) =>
    presentPlan(plan, timezone)
  )
  const currentResult =
    tab === "runs"
      ? runsResult
      : tab === "activity"
        ? activityResult
        : plansResult
  const itemCount =
    tab === "runs"
      ? runs.length
      : tab === "activity"
        ? activity.length
        : plans.length

  const callbacks: HistoryCallbacks = {
    onTabChange: (next) => {
      setTab(next)
      setFilters((current) => ({ ...current, status: "all" }))
      resetPaging()
      setSelectedRun(null)
    },
    onFiltersChange: (next) => {
      if (next.dateWindow !== filters.dateWindow) setDateAnchor(new Date())
      setFilters(next)
      resetPaging()
    },
    onClearFilters: () => {
      setDateAnchor(new Date())
      setFilters(emptyFilters)
      resetPaging()
    },
    onPreviousPage: (previous) => {
      setCursor(previous === "first" ? undefined : previous)
      setCursorHistory((history) => history.slice(0, -1))
    },
    onNextPage: (next) => {
      setCursorHistory((history) => [...history, cursor])
      setCursor(next)
    },
    onOpenRun: (runId) => {
      setError(null)
      void production
        .loadHistoryRun(locationId, runId)
        .then((detail) => setSelectedRun(presentDetail(detail, timezone)))
        .catch((cause) => setError(messageFor(cause)))
    },
    onCloseRun: () => setSelectedRun(null),
  }

  const model: HistoryViewModel = {
    tab,
    filters,
    dateOptions: [
      { value: "all", label: "Any date" },
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" },
      { value: "90d", label: "Last 90 days" },
    ],
    statusOptions: [
      { value: "all", label: "Any status" },
      ...(tab === "plans"
        ? [
            { value: "accepted", label: "Accepted" },
            { value: "superseded", label: "Superseded" },
            { value: "draft", label: "Draft" },
            { value: "rejected", label: "Rejected" },
          ]
        : tab === "runs"
          ? [
              { value: "started", label: "Started" },
              { value: "completed", label: "Completed" },
            ]
          : []),
    ],
    runs,
    activity,
    plans,
    page: {
      rangeLabel: `Showing ${itemCount} ${tab}`,
      previousCursor:
        cursorHistory.length === 0
          ? null
          : (cursorHistory[cursorHistory.length - 1] ?? "first"),
      nextCursor: currentResult?.nextCursor ?? null,
    },
    asOfLabel:
      currentResult === null
        ? ""
        : `Updated ${formatDate(currentResult.asOf, timezone)}`,
    selectedRun,
    loading: loading && currentResult === null,
    refreshing: loading && currentResult !== null,
    error,
  }

  return (
    <HistoryWorkspace model={model} callbacks={callbacks} isMobile={isMobile} />
  )
}
