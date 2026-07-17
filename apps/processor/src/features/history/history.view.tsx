import {
  IconAlertTriangle,
  IconCalendarClock,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFilter,
  IconHistory,
  IconSearch,
  IconTimeline,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { SectionHeading } from "@/components/layout/workspace-primitives"
import { DelayedLoadingRows } from "@/components/ui/delayed-loading-rows"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/components/ui/class-names"
import { RunHistoryDetailSheet } from "./run-history-detail-sheet.view"
import type {
  HistoryActivityItem,
  HistoryCallbacks,
  HistoryCursorPageViewModel,
  HistoryFilterOption,
  HistoryFilters,
  HistoryPlanSummary,
  HistoryRunSummary,
  HistoryTab,
  HistoryViewModel,
} from "./history.model"

const historyTabs: readonly Readonly<{
  value: HistoryTab
  labelKey: "history.runs" | "history.activity" | "history.plans"
  icon: typeof IconHistory
}>[] = [
  { value: "runs", labelKey: "history.runs", icon: IconHistory },
  { value: "activity", labelKey: "history.activity", icon: IconTimeline },
  { value: "plans", labelKey: "history.plans", icon: IconCalendarClock },
]

const defaultFilter = (value: string) =>
  value === "" || value === "all" || value === "any"

const activeFilterCount = (filters: HistoryFilters) =>
  [filters.dateWindow, filters.status].filter((value) => !defaultFilter(value))
    .length + (filters.query.trim().length > 0 ? 1 : 0)

function HistoryFilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: Readonly<{
  id: string
  label: string
  value: string
  options: readonly HistoryFilterOption[]
  onChange: (value: string) => void
}>) {
  return (
    <NativeSelect
      id={id}
      aria-label={label}
      className="min-w-40 flex-1 sm:flex-none [&_[data-slot=native-select]]:h-11"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

function RunStatusBadge({ run }: { run: HistoryRunSummary }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        run.status === "completed" && "bg-success text-success-foreground",
        run.status === "started" && "bg-foreground text-background"
      )}
    >
      {run.statusLabel}
    </Badge>
  )
}

function RunsView({
  runs,
  onOpenRun,
}: Readonly<{
  runs: readonly HistoryRunSummary[]
  onOpenRun: (runId: string) => void
}>) {
  const { t } = useTranslation()
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-background md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[26%] px-4">
                {t("history.productionRun")}
              </TableHead>
              <TableHead>{t("history.status")}</TableHead>
              <TableHead>{t("history.demand")}</TableHead>
              <TableHead>{t("history.timing")}</TableHead>
              <TableHead>{t("history.exceptions")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("history.openRunShort")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="px-4 py-3 whitespace-normal">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto justify-start p-0 text-foreground"
                    onClick={() => onOpenRun(run.id)}
                  >
                    {run.title}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.shiftLabel}
                  </p>
                </TableCell>
                <TableCell className="py-3">
                  <RunStatusBadge run={run} />
                </TableCell>
                <TableCell className="py-3">
                  <p className="text-sm font-medium">{run.demandLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {run.batchesLabel}
                  </p>
                </TableCell>
                <TableCell className="py-3 whitespace-normal">
                  <p className="max-w-64 text-sm text-muted-foreground">
                    {run.timingLabel}
                  </p>
                  {run.overtimeLabel !== null && (
                    <p className="mt-1 text-xs text-warning-foreground">
                      {run.overtimeLabel}
                    </p>
                  )}
                </TableCell>
                <TableCell className="py-3 whitespace-normal">
                  {run.exceptionLabel === null ? (
                    <span className="text-sm text-muted-foreground">
                      {t("common.none")}
                    </span>
                  ) : (
                    <Badge variant="outline">{run.exceptionLabel}</Badge>
                  )}
                </TableCell>
                <TableCell className="py-3 text-right">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-11"
                    aria-label={t("history.openRun", { title: run.title })}
                    onClick={() => onOpenRun(run.id)}
                  >
                    <IconChevronRight />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-2 md:hidden">
        {runs.map((run) => (
          <Card key={run.id} className="gap-3 bg-background py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{run.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {run.shiftLabel}
                  </p>
                </div>
                <RunStatusBadge run={run} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("history.demand")}
                  </p>
                  <p className="mt-1 font-medium">{run.demandLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("history.batches")}
                  </p>
                  <p className="mt-1 font-medium">{run.batchesLabel}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{run.timingLabel}</p>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() => onOpenRun(run.id)}
              >
                {t("history.openRunHistory")}
                <IconChevronRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function ActivityView({ items }: { items: readonly HistoryActivityItem[] }) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-background">
      {items.map((item) => (
        <article key={item.id} className="flex gap-3 p-4">
          <span
            className={cn(
              "mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground",
              item.tone === "warning" && "bg-warning-foreground",
              item.tone === "critical" && "bg-destructive"
            )}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="text-sm font-medium">{item.title}</h3>
              <time className="shrink-0 text-xs text-muted-foreground">
                {item.occurredAtLabel}
              </time>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {item.actorLabel} · {item.entityLabel}
            </p>
          </div>
        </article>
      ))}
    </div>
  )
}

function PlanStatusBadge({ plan }: { plan: HistoryPlanSummary }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        plan.status === "accepted" && "bg-success text-success-foreground"
      )}
    >
      {plan.statusLabel}
    </Badge>
  )
}

function PlansView({
  plans,
  onOpenRun,
}: Readonly<{
  plans: readonly HistoryPlanSummary[]
  onOpenRun: (runId: string) => void
}>) {
  const { t } = useTranslation()
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4">{t("history.revision")}</TableHead>
            <TableHead>{t("history.shift")}</TableHead>
            <TableHead>{t("history.status")}</TableHead>
            <TableHead>{t("history.timing")}</TableHead>
            <TableHead>{t("history.warnings")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("history.productionRun")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.id}>
              <TableCell className="px-4 py-3 font-medium">
                {plan.revisionLabel}
              </TableCell>
              <TableCell className="py-3">{plan.shiftLabel}</TableCell>
              <TableCell className="py-3">
                <PlanStatusBadge plan={plan} />
              </TableCell>
              <TableCell className="py-3 whitespace-normal">
                <p className="text-sm">
                  {t("history.computedAt", { date: plan.computedAtLabel })}
                </p>
                {plan.acceptedAtLabel !== null && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("history.acceptedAt", { date: plan.acceptedAtLabel })}
                  </p>
                )}
              </TableCell>
              <TableCell className="py-3">{plan.warningsLabel}</TableCell>
              <TableCell className="py-3 text-right">
                {plan.productionRunId !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    onClick={() => onOpenRun(plan.productionRunId!)}
                  >
                    {t("history.openRunShort")}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function HistoryPagination({
  page,
  callbacks,
}: Readonly<{
  page: HistoryCursorPageViewModel
  callbacks: Pick<HistoryCallbacks, "onPreviousPage" | "onNextPage">
}>) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t("history.pages")}
      className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-muted-foreground">{page.rangeLabel}</p>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={page.previousCursor === null}
          onClick={() => {
            if (page.previousCursor !== null)
              callbacks.onPreviousPage(page.previousCursor)
          }}
        >
          <IconChevronLeft data-icon="inline-start" />
          {t("common.previous")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={page.nextCursor === null}
          onClick={() => {
            if (page.nextCursor !== null) callbacks.onNextPage(page.nextCursor)
          }}
        >
          {t("common.next")}
          <IconChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  )
}

export function HistoryWorkspace({
  model,
  callbacks,
  isMobile,
}: Readonly<{
  model: HistoryViewModel
  callbacks: HistoryCallbacks
  isMobile: boolean
}>) {
  const { t } = useTranslation()
  const filterCount = activeFilterCount(model.filters)
  const updateFilter = <TKey extends keyof HistoryFilters>(
    key: TKey,
    value: HistoryFilters[TKey]
  ) => callbacks.onFiltersChange({ ...model.filters, [key]: value })
  const itemCount =
    model.tab === "runs"
      ? model.runs.length
      : model.tab === "activity"
        ? model.activity.length
        : model.plans.length

  return (
    <div
      className="flex flex-col gap-6"
      aria-busy={model.loading || model.refreshing}
    >
      <SectionHeading
        title={t("history.title")}
        description={t("history.description", { asOf: model.asOfLabel })}
        action={
          model.refreshing ? (
            <div
              role="status"
              className="flex h-8 items-center gap-2 text-xs text-muted-foreground"
            >
              <Spinner className="size-3.5" aria-hidden="true" />
              {t("history.updating")}
            </div>
          ) : undefined
        }
      />

      {model.error !== null && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>{t("history.unavailable")}</AlertTitle>
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={model.tab}
        onValueChange={(value) => callbacks.onTabChange(value as HistoryTab)}
      >
        <TabsList className="grid h-11 w-full grid-cols-3 sm:w-fit sm:min-w-sm">
          {historyTabs.map(({ value, labelKey, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-w-0 gap-1 px-1 sm:px-2"
            >
              <Icon />
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="gap-4 bg-background py-4">
        <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center">
          <InputGroup className="h-11 min-w-0 flex-1 sm:max-w-md">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={t("history.search")}
              placeholder={
                model.tab === "activity"
                  ? t("history.searchActivity")
                  : model.tab === "plans"
                    ? t("history.searchPlans")
                    : t("history.searchRuns")
              }
              value={model.filters.query}
              onChange={(event) => updateFilter("query", event.target.value)}
            />
          </InputGroup>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <HistoryFilterSelect
              id="history-date-filter"
              label={t("history.date")}
              value={model.filters.dateWindow}
              options={model.dateOptions}
              onChange={(value) => updateFilter("dateWindow", value)}
            />
            {model.statusOptions.length > 1 && (
              <HistoryFilterSelect
                id="history-status-filter"
                label={t("history.status")}
                value={model.filters.status}
                options={model.statusOptions}
                onChange={(value) => updateFilter("status", value)}
              />
            )}
            {filterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={callbacks.onClearFilters}
              >
                <IconFilter data-icon="inline-start" />
                {t("history.clearFilters", { count: filterCount })}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {model.loading ? (
        <DelayedLoadingRows label={t("history.loading")} />
      ) : itemCount === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {model.tab === "activity" ? <IconClock /> : <IconHistory />}
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={2}>
              {t("history.emptyTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {filterCount > 0
                ? t("history.emptyFiltered")
                : t("history.empty")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {model.tab === "runs" && (
            <RunsView runs={model.runs} onOpenRun={callbacks.onOpenRun} />
          )}
          {model.tab === "activity" && <ActivityView items={model.activity} />}
          {model.tab === "plans" && (
            <PlansView plans={model.plans} onOpenRun={callbacks.onOpenRun} />
          )}
          <HistoryPagination page={model.page} callbacks={callbacks} />
        </>
      )}

      <RunHistoryDetailSheet
        run={model.selectedRun}
        callbacks={callbacks}
        isMobile={isMobile}
      />
    </div>
  )
}

export type {
  HistoryCallbacks,
  HistoryFilters,
  HistoryRunDetail,
  HistoryViewModel,
} from "./history.model"
