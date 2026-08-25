import {
  IconAlertTriangle,
  IconCalendarClock,
  IconClock,
  IconScale,
  IconStack2,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../browser/components/ui/alert"
import { Badge } from "../../browser/components/ui/badge"
import { Button } from "../../browser/components/ui/button"
import { Card, CardContent } from "../../browser/components/ui/card"
import { ScrollArea } from "../../browser/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../browser/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../browser/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../browser/components/ui/tabs"
import { cn } from "../../browser/components/ui/class-names"
import { OperationalOrderIdentity } from "../../browser/components/orders/operational-order-identity"
import type {
  HistoryActivityItem,
  HistoryCallbacks,
  HistoryRunDetail,
} from "./history.model"

function RunFact({
  label,
  value,
  icon: Icon,
}: Readonly<{
  label: string
  value: string
  icon: typeof IconClock
}>) {
  return (
    <Card className="gap-2 bg-background py-3">
      <CardContent className="px-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </p>
        <p className="mt-2 text-sm font-medium">{value}</p>
      </CardContent>
    </Card>
  )
}

function ActivityTimeline({
  items,
}: Readonly<{ items: readonly HistoryActivityItem[] }>) {
  const { t } = useTranslation()
  if (items.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("history.noActivity")}
      </p>
    )
  return (
    <ol className="relative ml-2 border-l">
      {items.map((item) => (
        <li key={item.id} className="relative pb-5 pl-5 last:pb-0">
          <span
            className={cn(
              "absolute top-1.5 -left-1.5 size-3 rounded-full border-2 border-background bg-muted-foreground",
              item.tone === "warning" && "bg-warning-foreground",
              item.tone === "critical" && "bg-destructive"
            )}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-medium">{item.title}</p>
            <span className="text-xs text-muted-foreground">
              {item.occurredAtLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.actorLabel} · {item.entityLabel}
          </p>
        </li>
      ))}
    </ol>
  )
}

export function RunHistoryDetailSheet({
  run,
  callbacks,
  isMobile,
}: Readonly<{
  run: HistoryRunDetail | null
  callbacks: Pick<HistoryCallbacks, "onCloseRun">
  isMobile: boolean
}>) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={run !== null}
      onOpenChange={(open) => {
        if (!open) callbacks.onCloseRun()
      }}
    >
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        size="workspace"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b px-5 py-4 pe-16">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{run?.title ?? t("history.productionRun")}</SheetTitle>
            {run !== null && (
              <Badge variant="secondary">{run.statusLabel}</Badge>
            )}
          </div>
          <SheetDescription>
            {run?.shiftLabel ?? t("history.readOnly")}
          </SheetDescription>
        </SheetHeader>

        {run !== null && (
          <Tabs
            defaultValue="overview"
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-w-0 border-b px-3 py-3 sm:px-5">
              <TabsList className="grid h-11 w-full grid-cols-5">
                <TabsTrigger
                  value="overview"
                  className="min-w-0 px-1 text-xs sm:text-sm"
                >
                  {t("history.overview")}
                </TabsTrigger>
                <TabsTrigger
                  value="batches"
                  className="min-w-0 px-1 text-xs sm:text-sm"
                >
                  {t("history.batches")}
                </TabsTrigger>
                <TabsTrigger
                  value="orders"
                  className="min-w-0 px-1 text-xs sm:text-sm"
                >
                  {t("history.orders")}
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="min-w-0 px-1 text-xs sm:text-sm"
                >
                  {t("history.activity")}
                </TabsTrigger>
                <TabsTrigger
                  value="plans"
                  className="min-w-0 px-1 text-xs sm:text-sm"
                >
                  {t("history.plans")}
                </TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-5">
              <TabsContent value="overview" className="py-4">
                <div className="grid grid-cols-2 gap-2">
                  <RunFact
                    label={t("history.demand")}
                    value={run.demandLabel}
                    icon={IconScale}
                  />
                  <RunFact
                    label={t("history.batches")}
                    value={run.batchCountLabel}
                    icon={IconStack2}
                  />
                  <RunFact
                    label={t("history.planned")}
                    value={run.plannedTimingLabel}
                    icon={IconCalendarClock}
                  />
                  <RunFact
                    label={t("history.actual")}
                    value={run.actualTimingLabel}
                    icon={IconClock}
                  />
                </div>
                {run.exceptionLabel !== t("common.none") && (
                  <Alert className="mt-4 border-warning-foreground/20 bg-warning text-warning-foreground">
                    <IconAlertTriangle />
                    <AlertTitle>{t("history.recordedExceptions")}</AlertTitle>
                    <AlertDescription>{run.exceptionLabel}</AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="batches" className="py-4">
                <div className="divide-y rounded-xl border">
                  {run.batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{batch.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {batch.demandLabel} · {batch.timingLabel}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {batch.exceptionLabel !== null && (
                          <Badge variant="outline">
                            {batch.exceptionLabel}
                          </Badge>
                        )}
                        <Badge variant="secondary">{batch.statusLabel}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="orders" className="py-4">
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="px-3">
                          {t("history.order")}
                        </TableHead>
                        <TableHead>{t("history.status")}</TableHead>
                        <TableHead>{t("history.batches")}</TableHead>
                        <TableHead>{t("history.demand")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {run.orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="px-3">
                            <OperationalOrderIdentity
                              identity={order.identity}
                            />
                          </TableCell>
                          <TableCell>{order.statusLabel}</TableCell>
                          <TableCell>{order.batchLabel}</TableCell>
                          <TableCell>{order.demandLabel}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="py-4">
                <ActivityTimeline items={run.activity} />
              </TabsContent>

              <TabsContent value="plans" className="py-4">
                <div className="divide-y rounded-xl border">
                  {run.plans.map((plan) => (
                    <div key={plan.id} className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {plan.revisionLabel}
                        </p>
                        <Badge variant="secondary">{plan.statusLabel}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("history.computedAt", {
                          date: plan.computedAtLabel,
                        })}
                        {plan.acceptedAtLabel === null
                          ? ""
                          : ` · ${t("history.acceptedAt", {
                              date: plan.acceptedAtLabel,
                            })}`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {plan.warningsLabel}
                      </p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}

        <SheetFooter className="border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={callbacks.onCloseRun}
          >
            {t("history.closeHistory")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
