import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type {
  ProcessorListProductionHistoryActivityResult,
  ProcessorProductionHistoryActivityEntry,
  ProcessorProductionHistoryRunDetail,
} from "../../contracts/production-history.ts"
import type {
  ListProductionHistoryPlansResult,
  ListProductionHistoryRunsResult,
  ProductionHistoryPlanSummary,
  ProductionHistoryRunSummary,
} from "@pressly/production-system/contracts/read-models/production-history"
import { useIsMobile } from "../../browser/components/ui/use-mobile"
import { useProcessorBrowserCapabilities } from "../../browser/browser-capabilities.tsx"
import type { IdempotencyPort } from "../../capabilities/idempotency.port"
import type { ProductionPort } from "../../capabilities/production.port"
import { presentHistoryError } from "./history.error.presenter"
import { HistoryWorkspace } from "./history.view"
import type {
  HistoryCallbacks,
  HistoryFilters,
  HistoryRunDetail,
  HistoryViewModel,
  HistoryActivityItem,
  HistoryPlanSummary as HistoryPlanViewModel,
  HistoryRestoreReason,
  HistoryRunSummary as HistoryRunViewModel,
  HistoryTab,
} from "./history.model"

const localeForLanguage = (language: string | undefined): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

const emptyFilters: HistoryFilters = {
  query: "",
  dateWindow: "all",
  status: "all",
}

const labelFor = (value: string, t: TFunction): string => {
  if (value === "accepted") return t("history.accepted")
  if (value === "superseded") return t("history.superseded")
  if (value === "draft") return t("history.draft")
  if (value === "rejected") return t("history.rejected")
  if (value === "started") return t("history.started")
  if (value === "completed") return t("history.completed")
  if (value === "sorting") return t("common.stage.sorting")
  if (value === "washing") return t("common.stage.washing")
  if (value === "drying") return t("common.stage.drying")
  if (value === "folding_packaging") return t("common.stage.foldingPackaging")
  if (value === "completed_outside_pressly")
    return t("orderResolution.reasonOptions.completed_outside_pressly")
  if (value === "processor_not_in_use")
    return t("orderResolution.reasonOptions.processor_not_in_use")
  if (value === "duplicate_or_test")
    return t("orderResolution.reasonOptions.duplicate_or_test")
  if (value === "order_will_not_be_produced")
    return t("orderResolution.reasonOptions.order_will_not_be_produced")
  if (value === "manager_correction")
    return t("orderResolution.history.restore.reasonOptions.manager_correction")
  if (value === "work_should_be_produced")
    return t(
      "orderResolution.history.restore.reasonOptions.work_should_be_produced"
    )
  if (value === "other") return t("orderResolution.reasonOptions.other")
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
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

const durationLabel = (
  start: string,
  end: string | null,
  t: TFunction
): string => {
  if (end === null) return t("history.inProgress")
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
  timezone: string,
  locale: string,
  t: TFunction
): HistoryRunViewModel => ({
  id: run.productionRunId,
  title: t("history.runTitle"),
  shiftLabel: `${formatDate(run.shiftStartsAt, timezone, locale)} – ${formatDate(run.shiftEndsAt, timezone, locale)}`,
  statusLabel: labelFor(run.status, t),
  status: run.status,
  demandLabel: t("history.ordersAndWeight", {
    orders: t("common.orders", { count: run.orderCount }),
    weight: run.totalWeightLbs,
  }),
  batchesLabel: t("history.batchesFinished", {
    completed: run.completedBatchCount,
    total: run.batchCount,
  }),
  timingLabel:
    run.status === "completed"
      ? durationLabel(run.startedAt, run.completedAt, t)
      : t("history.plannedThrough", {
          date: formatDate(run.plannedCompletionAt, timezone, locale),
        }),
  exceptionLabel: null,
  overtimeLabel: run.overtimeAcknowledged
    ? t("history.overtimeAccepted")
    : null,
})

const activityDetail = (
  activity: ProcessorProductionHistoryActivityEntry,
  t: TFunction
): string => {
  const details = activity.details
  switch (details.kind) {
    case "order":
      return (
        [
          details.outcome,
          details.resolutionState === null
            ? null
            : labelFor(details.resolutionState, t),
          details.resolutionReason === null
            ? null
            : labelFor(details.resolutionReason, t),
          details.routeReason === null
            ? null
            : labelFor(details.routeReason, t),
          details.sourceBatchId === null || details.targetBatchId === null
            ? null
            : t("history.movedBetweenBatches"),
          details.restartStage === null
            ? null
            : t("history.resumeStage", {
                stage: labelFor(details.restartStage, t),
              }),
          details.queueVersion === null
            ? null
            : t("history.queueVersion", { version: details.queueVersion }),
        ]
          .filter(Boolean)
          .join(" · ") || t("history.orderStateChanged")
      )
    case "batch":
      return [details.action, details.reason, details.targetMilestone]
        .filter(Boolean)
        .map(String)
        .map((value) => labelFor(value, t))
        .join(" · ")
    case "stage":
      return `${labelFor(details.action, t)}${
        details.timingConfirmationRecorded
          ? ` · ${t("history.timingConfirmed")}`
          : ""
      }`
    case "schedule":
      return details.productionShiftId === null
        ? t("history.scheduleRevision")
        : t("history.shiftRecord")
    case "run":
      return t("history.batchesAndQueue", {
        count: details.batchCount ?? 0,
        version: details.queueVersion ?? 1,
      })
    case "shift":
      return details.changedFields.length === 0
        ? t("history.shiftLifecycle")
        : t("history.changedFields", {
            fields: details.changedFields.join(", "),
          })
    case "configuration":
      return details.version === null
        ? t("history.configurationChanged")
        : t("history.version", { version: details.version })
    case "demand":
      return details.outcome ?? t("history.demandSynchronized")
  }
}

const presentActivity = (
  activity: ProcessorProductionHistoryActivityEntry,
  timezone: string,
  locale: string,
  t: TFunction
): HistoryActivityItem => ({
  id: activity.id,
  identity: activity.identity,
  title:
    activity.eventType === "production_order_restored"
      ? t("orderResolution.history.activity.restored")
      : activity.eventType === "production_order_resolved_without_production" ||
          activity.eventType ===
            "production_order_bulk_resolved_without_production"
        ? t("orderResolution.history.activity.archived")
        : activity.summary,
  detail: activityDetail(activity, t),
  occurredAtLabel: formatDate(activity.occurredAt, timezone, locale),
  actorLabel: activity.actor.displayName ?? labelFor(activity.actor.kind, t),
  entityLabel: labelFor(activity.entityType, t),
  tone:
    activity.eventType === "production_order_route_exception_recorded" ||
    activity.eventType === "production_order_placement_overtime_required"
      ? "warning"
      : "default",
  restoreAction:
    activity.resolutionAction === null
      ? null
      : {
          productionOrderId: activity.entityId,
          expectedVersion: activity.resolutionAction.expectedVersion,
        },
})

const presentPlan = (
  plan: ProductionHistoryPlanSummary,
  timezone: string,
  locale: string,
  t: TFunction
): HistoryPlanViewModel => ({
  id: plan.scheduleRunId,
  revisionLabel: t("history.planTitle"),
  shiftLabel: `${formatDate(plan.shiftStartsAt, timezone, locale)} – ${formatDate(plan.shiftEndsAt, timezone, locale)}`,
  statusLabel: labelFor(plan.status, t),
  status: plan.status === "rejected" ? "other" : plan.status,
  computedAtLabel: formatDate(plan.createdAt, timezone, locale),
  acceptedAtLabel:
    plan.acceptedAt === null
      ? null
      : formatDate(plan.acceptedAt, timezone, locale),
  warningsLabel: t("history.warningsAcknowledged", {
    acknowledged: plan.acknowledgedWarningCount,
    total: plan.warningCount,
  }),
  productionRunId: plan.linkedProductionRunId,
})

const presentDetail = (
  value: ProcessorProductionHistoryRunDetail,
  timezone: string,
  locale: string,
  t: TFunction
): HistoryRunDetail => {
  const detail = value
  const run = presentRun(detail.overview, timezone, locale, t)
  const activity = detail.activity.items.map((item) =>
    presentActivity({ ...item, identity: null }, timezone, locale, t)
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
    batchCountLabel: t("history.completeCount", {
      completed: detail.overview.completedBatchCount,
      total: detail.overview.batchCount,
    }),
    plannedTimingLabel: t("history.through", {
      date: formatDate(detail.overview.plannedCompletionAt, timezone, locale),
    }),
    actualTimingLabel: durationLabel(
      detail.overview.startedAt,
      detail.overview.completedAt,
      t
    ),
    exceptionLabel:
      exceptionCount === 0
        ? t("common.none")
        : t("history.floorExceptions", { count: exceptionCount }),
    batches: detail.batches.map((batch) => ({
      id: batch.productionBatchId,
      label: t("history.batch", { number: batch.sequence + 1 }),
      statusLabel: labelFor(batch.status, t),
      demandLabel: `${batch.derivedWeightLbs.toLocaleString(locale)} / ${batch.pulseCapacityLbs.toLocaleString(locale)} lb`,
      timingLabel:
        batch.startedAt === null
          ? t("history.notStarted")
          : durationLabel(batch.startedAt, batch.finishedAt, t),
      exceptionLabel:
        batch.historicalOrderCount === batch.currentOrderCount
          ? null
          : t("history.moved", {
              count: batch.historicalOrderCount - batch.currentOrderCount,
            }),
    })),
    orders: detail.orderMemberships.map((order) => ({
      id: order.productionOrderId,
      identity: order.identity,
      externalOrderId: order.identity.displayNumber,
      statusLabel: labelFor(order.orderStatus, t),
      demandLabel: `${order.derivedWeightLbs.toLocaleString(locale)} lb · ${
        order.bagCount === null
          ? "—"
          : t("common.bags", { count: order.bagCount })
      }`,
      batchLabel: `${t("history.batch", {
        number: order.batchSequence + 1,
      })}${
        order.placement.state === "current"
          ? ""
          : ` · ${t("history.historical")}`
      }`,
    })),
    activity,
    plans: detail.scheduleLineage.revisions.map((plan) =>
      presentPlan(plan, timezone, locale, t)
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
  idempotency,
  locationId,
  timezone,
  revision,
  canManage,
  onMutated,
}: Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  timezone: string
  revision: string
  canManage: boolean
  onMutated: () => Promise<void>
}>) {
  const browser = useProcessorBrowserCapabilities()
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<HistoryTab>("runs")
  const [filters, setFilters] = useState<HistoryFilters>(emptyFilters)
  const [dateAnchor, setDateAnchor] = useState(browser.clock.now)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([])
  const [runsResult, setRunsResult] =
    useState<ListProductionHistoryRunsResult | null>(null)
  const [activityResult, setActivityResult] =
    useState<ProcessorListProductionHistoryActivityResult | null>(null)
  const [plansResult, setPlansResult] =
    useState<ListProductionHistoryPlansResult | null>(null)
  const [selectedRun, setSelectedRun] = useState<HistoryRunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoringOrderId, setRestoringOrderId] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const sequence = useRef(0)

  useEffect(() => {
    return browser.scheduler.schedule(
      () => setDebouncedSearch(filters.query.trim()),
      220
    )
  }, [browser.scheduler, filters.query])

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
            ...(filters.status === "archived" || filters.status === "restored"
              ? { orderResolution: filters.status }
              : {}),
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
      if (requestSequence === sequence.current)
        setError(presentHistoryError(cause, "list", t))
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
    t,
  ])

  useEffect(() => {
    return browser.scheduler.schedule(() => void load(), 0)
  }, [browser.scheduler, load, revision])

  const resetPaging = () => {
    setCursor(undefined)
    setCursorHistory([])
  }
  const runs = (runsResult?.items ?? []).map((run) =>
    presentRun(run, timezone, locale, t)
  )
  const activity = (activityResult?.items ?? []).map((item) =>
    presentActivity(item, timezone, locale, t)
  )
  const plans = (plansResult?.items ?? []).map((plan) =>
    presentPlan(plan, timezone, locale, t)
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
      if (next.dateWindow !== filters.dateWindow)
        setDateAnchor(browser.clock.now())
      setFilters(next)
      resetPaging()
    },
    onClearFilters: () => {
      setDateAnchor(browser.clock.now())
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
        .then((detail) =>
          setSelectedRun(presentDetail(detail, timezone, locale, t))
        )
        .catch((cause) => setError(presentHistoryError(cause, "detail", t)))
    },
    onCloseRun: () => setSelectedRun(null),
    onRestoreOrder: (input) => {
      if (!canManage || restoringOrderId !== null) return
      setRestoringOrderId(input.productionOrderId)
      setRestoreError(null)
      setRestoreNotice(null)
      void (async () => {
        try {
          const request = {
            action: "restore" as const,
            reason: input.reason satisfies HistoryRestoreReason,
            note: input.note,
            expectedVersion: input.expectedVersion,
            idempotencyKey: await idempotency.key({
              operation: "restore-production-order",
              payload: {
                locationId,
                productionOrderId: input.productionOrderId,
                expectedVersion: input.expectedVersion,
                reason: input.reason,
                note: input.note,
              },
            }),
          }
          await production.changeOrderResolution({
            locationId,
            productionOrderId: input.productionOrderId,
            request,
          })
          const restoredIdentity = activity.find(
            (item) =>
              item.restoreAction?.productionOrderId === input.productionOrderId
          )?.identity
          setRestoreNotice(
            t("orderResolution.history.restore.successDescription", {
              displayReference:
                restoredIdentity === null || restoredIdentity === undefined
                  ? t("history.order")
                  : `${t("history.order")} ${restoredIdentity.displayNumber}`,
            })
          )
          await Promise.all([load(), onMutated()])
        } catch (cause) {
          setRestoreError(presentHistoryError(cause, "restore", t))
        } finally {
          setRestoringOrderId(null)
        }
      })()
    },
  }

  const model: HistoryViewModel = {
    tab,
    filters,
    dateOptions: [
      { value: "all", label: t("history.anyDate") },
      { value: "7d", label: t("history.last7Days") },
      { value: "30d", label: t("history.last30Days") },
      { value: "90d", label: t("history.last90Days") },
    ],
    statusOptions: [
      { value: "all", label: t("history.anyStatus") },
      ...(tab === "plans"
        ? [
            { value: "accepted", label: t("history.accepted") },
            { value: "superseded", label: t("history.superseded") },
            { value: "draft", label: t("history.draft") },
            { value: "rejected", label: t("history.rejected") },
          ]
        : tab === "runs"
          ? [
              { value: "started", label: t("history.started") },
              { value: "completed", label: t("history.completed") },
            ]
          : [
              {
                value: "archived",
                label: t("orderResolution.history.statusFilters.archived"),
              },
              {
                value: "restored",
                label: t("orderResolution.history.statusFilters.restored"),
              },
            ]),
    ],
    runs,
    activity,
    plans,
    page: {
      rangeLabel: t("history.showing", {
        count: itemCount,
        kind:
          tab === "runs"
            ? t("history.runs").toLocaleLowerCase(locale)
            : tab === "activity"
              ? t("history.activity").toLocaleLowerCase(locale)
              : t("history.plans").toLocaleLowerCase(locale),
      }),
      previousCursor:
        cursorHistory.length === 0
          ? null
          : (cursorHistory[cursorHistory.length - 1] ?? "first"),
      nextCursor: currentResult?.nextCursor ?? null,
    },
    asOfLabel:
      currentResult === null
        ? ""
        : t("history.updated", {
            date: formatDate(currentResult.asOf, timezone, locale),
          }),
    selectedRun,
    loading: loading && currentResult === null,
    refreshing: loading && currentResult !== null,
    error,
    canManage,
    restoringOrderId,
    restoreError,
    restoreNotice,
  }

  return (
    <HistoryWorkspace model={model} callbacks={callbacks} isMobile={isMobile} />
  )
}
