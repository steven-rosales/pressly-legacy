import {
  IconAlertTriangle,
  IconArrowRight,
  IconClock,
  IconLayoutBoard,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { useRef, type ReactNode, type RefObject } from "react"
import type { TFunction } from "i18next"
import type {
  ProcessorProductionLiveRunChangeOrder,
  ProcessorProductionLiveRunChanges,
  ProductionRunSummary,
  ProductionShift,
} from "@pressly/contracts"
import {
  MetricStrip,
  SectionHeading,
} from "@/components/layout/workspace-primitives"
import { OperationalOrderIdentity } from "@/components/orders/operational-order-identity"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import {
  useLiveRunChangesModel,
  type LiveRunChangesModelInput,
} from "./live-run-changes.model"
import {
  formatLiveRunMoment,
  presentLivePlacementFailure,
  presentLivePlacementTarget,
  type LivePlacementProjection,
} from "./live-run-changes.presenter"
import {
  localeForLanguage,
  presentSchedulingDueBucket,
} from "./scheduling.presenter"

type LiveRunChangesViewProps = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  timezone: string
  shift: ProductionShift
  productionRun: ProductionRunSummary
  changes: ProcessorProductionLiveRunChanges | null
  canManage: boolean
  online: boolean
  updatesState: "inactive" | "connecting" | "open" | "reconnecting"
  remainingDayContext?: ReactNode
  onMutated: () => Promise<void>
  onOpenProduction: () => void
  onOpenForecast: () => void
}>

const projectionConsequence = (
  placement: LivePlacementProjection,
  timezone: string,
  locale: string,
  t: TFunction
) =>
  placement.overtime.required
    ? t("liveRunChanges.addsOvertime", {
        minutes: placement.overtime.minutes,
      })
    : t("liveRunChanges.withinShift", {
        finish: formatLiveRunMoment(
          placement.projectedCompletionAt,
          timezone,
          locale
        ),
      })

function PlacementSummary({
  placement,
  timezone,
  locale,
}: Readonly<{
  placement: LivePlacementProjection
  timezone: string
  locale: string
}>) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {presentLivePlacementTarget(placement, t)}
        </span>
        {placement.overtime.required && (
          <Badge
            variant="outline"
            className="border-warning-foreground/20 bg-warning text-warning-foreground"
          >
            {t("liveRunChanges.addsOvertime", {
              minutes: placement.overtime.minutes,
            })}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        {t("liveRunChanges.capacity", {
          before: placement.capacity.beforeLbs,
          after: placement.capacity.afterLbs,
          limit: placement.capacity.limitLbs,
        })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("liveRunChanges.projectedFinish", {
          finish: formatLiveRunMoment(
            placement.projectedCompletionAt,
            timezone,
            locale
          ),
        })}
      </p>
    </div>
  )
}

function OrderIdentity({
  order,
}: Readonly<{ order: ProcessorProductionLiveRunChangeOrder }>) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <OperationalOrderIdentity
          identity={order.identity}
          className="me-auto"
        />
        {order.priority && <Badge>{t("liveRunChanges.priority")}</Badge>}
        <Badge variant="outline">
          {presentSchedulingDueBucket(order.dueBucket, t)}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("liveRunChanges.orderDetail", {
          weight: order.derivedWeightLbs,
          bags: t("common.bags", { count: order.bagCount }),
        })}
      </p>
    </div>
  )
}

function PlacementRow({
  order,
  model,
  timezone,
  locale,
  canManage,
  mutationsDisabled,
  onOpenForecast,
  batchChoiceTriggerRef,
}: Readonly<{
  order: ProcessorProductionLiveRunChangeOrder
  model: ReturnType<typeof useLiveRunChangesModel>
  timezone: string
  locale: string
  canManage: boolean
  mutationsDisabled: boolean
  onOpenForecast: () => void
  batchChoiceTriggerRef: RefObject<HTMLButtonElement | null>
}>) {
  const { t } = useTranslation()
  const confirmation = model.confirmations.get(order.id)
  const recommended =
    order.recommendedPlacement.status === "available"
      ? order.recommendedPlacement.placement
      : null
  const primaryDisabled =
    mutationsDisabled ||
    !canManage ||
    recommended?.allowedActions[0] !== "place_automatically"

  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(13rem,1.1fr)_minmax(14rem,1fr)_auto] lg:items-center">
      <OrderIdentity order={order} />

      {confirmation !== undefined ? (
        <PlacementSummary
          placement={confirmation}
          timezone={timezone}
          locale={locale}
        />
      ) : recommended !== null ? (
        <PlacementSummary
          placement={recommended}
          timezone={timezone}
          locale={locale}
        />
      ) : (
        <div className="min-w-0">
          <Badge variant="outline">{t("liveRunChanges.doesNotFit")}</Badge>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {presentLivePlacementFailure(
              order.recommendedPlacement.status === "unavailable"
                ? order.recommendedPlacement.reason
                : "no_mutable_position",
              t
            )}
          </p>
        </div>
      )}

      <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
        {confirmation !== undefined ? (
          <Button
            type="button"
            className="h-11 w-full sm:w-auto"
            disabled={mutationsDisabled || !canManage}
            aria-label={t("liveRunChanges.confirmOvertimeAria", {
              orderId: order.identity.displayNumber,
              target: presentLivePlacementTarget(confirmation, t),
            })}
            onClick={() => void model.confirmOvertime(order)}
          >
            {t("liveRunChanges.confirmOvertime")}
          </Button>
        ) : recommended !== null ? (
          <Button
            type="button"
            className="h-11 w-full sm:w-auto"
            disabled={primaryDisabled}
            aria-label={t("liveRunChanges.addBestFitAria", {
              orderId: order.identity.displayNumber,
            })}
            onClick={() => void model.addAtBestFit(order)}
          >
            <IconSparkles data-icon="inline-start" />
            {t("liveRunChanges.addBestFit")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={onOpenForecast}
          >
            {t("liveRunChanges.reviewForecast")}
            <IconArrowRight data-icon="inline-end" />
          </Button>
        )}
        {order.exactBatchTargets.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={mutationsDisabled || !canManage}
            aria-label={t("liveRunChanges.chooseBatchAria", {
              orderId: order.identity.displayNumber,
            })}
            onClick={(event) => {
              batchChoiceTriggerRef.current = event.currentTarget
              model.openBatchChoice(order)
            }}
          >
            {t("liveRunChanges.chooseBatch")}
          </Button>
        )}
        {!canManage && (
          <span className="self-center text-xs text-muted-foreground">
            {t("liveRunChanges.managerRequired")}
          </span>
        )}
      </div>
    </div>
  )
}

function ExactBatchSheet({
  model,
  timezone,
  locale,
  mutationsDisabled,
  returnFocusRef,
}: Readonly<{
  model: ReturnType<typeof useLiveRunChangesModel>
  timezone: string
  locale: string
  mutationsDisabled: boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>
}>) {
  const { t } = useTranslation()
  const order = model.detailOrder
  const target = model.selectedTarget

  return (
    <Sheet
      open={order !== null}
      onOpenChange={(open) => {
        if (!open) model.closeBatchChoice()
      }}
    >
      <SheetContent
        side="right"
        size="workspace"
        closeLabel={t("liveRunChanges.close")}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef.current?.isConnected !== true) return
          event.preventDefault()
          returnFocusRef.current.focus()
        }}
      >
        <SheetHeader className="border-b px-5 py-4 pe-16">
          <SheetTitle>{t("liveRunChanges.exactTitle")}</SheetTitle>
          <SheetDescription>
            {order === null
              ? t("liveRunChanges.readyDescription")
              : t("liveRunChanges.exactDescription", {
                  orderId: order.identity.displayNumber,
                })}
          </SheetDescription>
        </SheetHeader>
        {order !== null && (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-5 p-5">
                <OrderIdentity order={order} />
                <Separator />
                <Field>
                  <FieldLabel htmlFor="live-run-batch-target">
                    {t("liveRunChanges.batchField")}
                  </FieldLabel>
                  <Select
                    value={target?.target.productionBatchId ?? ""}
                    onValueChange={model.selectTarget}
                    disabled={mutationsDisabled}
                  >
                    <SelectTrigger
                      id="live-run-batch-target"
                      className="h-11 w-full"
                    >
                      <SelectValue
                        placeholder={t("liveRunChanges.chooseBatchPlaceholder")}
                      />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectGroup>
                        {order.exactBatchTargets.map((candidate) => (
                          <SelectItem
                            key={candidate.target.productionBatchId}
                            value={candidate.target.productionBatchId}
                          >
                            {t("liveRunChanges.batchOption", {
                              number: candidate.target.sequence + 1,
                              before: candidate.capacity.beforeLbs,
                              after: candidate.capacity.afterLbs,
                            })}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {target !== null && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("liveRunChanges.selectedCapacity")}
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {t("liveRunChanges.capacity", {
                            before: target.capacity.beforeLbs,
                            after: target.capacity.afterLbs,
                            limit: target.capacity.limitLbs,
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t("liveRunChanges.selectedFinish")}
                        </dt>
                        <dd className="mt-1 font-medium">
                          {formatLiveRunMoment(
                            target.projectedCompletionAt,
                            timezone,
                            locale
                          )}
                        </dd>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {projectionConsequence(target, timezone, locale, t)}
                        </p>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            </ScrollArea>
            <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                className="h-11 w-full sm:w-auto"
                disabled={mutationsDisabled || target === null}
                onClick={() => {
                  if (target?.allowedActions[0] === "confirm_overtime")
                    void model.confirmOvertime(order)
                  else void model.addToSelectedBatch()
                }}
              >
                {target?.allowedActions[0] === "confirm_overtime"
                  ? t("liveRunChanges.confirmOvertime")
                  : target === null
                    ? t("liveRunChanges.addToSelectedBatch")
                    : t("liveRunChanges.addToBatch", {
                        number: target.target.sequence + 1,
                      })}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function LiveRunChangesWorkspace(input: LiveRunChangesViewProps) {
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const modelInput: LiveRunChangesModelInput = {
    production: input.production,
    idempotency: input.idempotency,
    locationId: input.locationId,
    changes: input.changes,
    onMutated: input.onMutated,
  }
  const model = useLiveRunChangesModel(modelInput)
  const batchChoiceTriggerRef = useRef<HTMLButtonElement | null>(null)
  const updatesCurrent = input.online && input.updatesState === "open"
  const mutationsDisabled = model.busyId !== null || !updatesCurrent
  const orderCount = input.changes?.orders.length ?? 0

  return (
    <div className="flex flex-col gap-5" data-testid="live-run-changes">
      <span aria-live="polite" className="sr-only">
        {model.announcement}
      </span>
      <SectionHeading
        title={t("liveRunChanges.title")}
        description={t("liveRunChanges.description")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={input.onOpenProduction}
            >
              <IconLayoutBoard data-icon="inline-start" />
              {t("liveRunChanges.openProduction")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!input.online || model.busyId !== null}
              onClick={() => void model.refresh()}
            >
              <IconRefresh data-icon="inline-start" />
              {t("liveRunChanges.refresh")}
            </Button>
          </div>
        }
      />

      <MetricStrip
        label={t("liveRunChanges.summary")}
        metrics={[
          {
            label: t("liveRunChanges.runStatus"),
            value: t("liveRunChanges.started"),
            detail: t("liveRunChanges.shiftWindow", {
              start: formatLiveRunMoment(
                input.shift.startsAt,
                input.timezone,
                locale
              ),
              end: formatLiveRunMoment(
                input.shift.endsAt,
                input.timezone,
                locale
              ),
            }),
          },
          {
            label: t("liveRunChanges.readyOrders"),
            value: t("liveRunChanges.count", { count: orderCount }),
            detail: t("liveRunChanges.acceptedPlan"),
          },
          {
            label: t("liveRunChanges.pulseCapacity"),
            value:
              input.changes === null
                ? "—"
                : t("common.pounds", {
                    value: input.changes.pulseCapacityLbs,
                  }),
            detail: t("liveRunChanges.perBatch"),
          },
          {
            label: t("liveRunChanges.plannedFinish"),
            value: formatLiveRunMoment(
              input.productionRun.plannedCompletionAt,
              input.timezone,
              locale
            ),
            detail: t("liveRunChanges.beforeNewWork"),
          },
        ]}
      />

      {input.remainingDayContext}

      {!updatesCurrent && (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>{t("liveRunChanges.updatesPaused")}</AlertTitle>
        </Alert>
      )}
      {model.error !== null && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>{t("liveRunChanges.actionFailed")}</AlertTitle>
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}

      {input.changes === null ? (
        <Card className="bg-background">
          <CardHeader>
            <CardTitle>{t("liveRunChanges.projectionUnavailable")}</CardTitle>
            <CardDescription>
              {t("liveRunChanges.projectionUnavailableDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="gap-0 bg-background py-0">
          <CardHeader className="border-b py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{t("liveRunChanges.readyTitle")}</CardTitle>
                <CardDescription className="mt-1">
                  {t("liveRunChanges.readyDescription")}
                </CardDescription>
              </div>
              <Badge variant="secondary">
                {t("liveRunChanges.count", { count: orderCount })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {orderCount === 0 ? (
              <Empty className="min-h-56 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconClock />
                  </EmptyMedia>
                  <EmptyTitle>{t("liveRunChanges.noOrders")}</EmptyTitle>
                  <EmptyDescription>
                    {t("liveRunChanges.noOrdersDescription")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="divide-y">
                {input.changes.orders.map((order) => (
                  <PlacementRow
                    key={order.id}
                    order={order}
                    model={model}
                    timezone={input.timezone}
                    locale={locale}
                    canManage={input.canManage}
                    mutationsDisabled={mutationsDisabled}
                    onOpenForecast={input.onOpenForecast}
                    batchChoiceTriggerRef={batchChoiceTriggerRef}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ExactBatchSheet
        model={model}
        timezone={input.timezone}
        locale={locale}
        mutationsDisabled={mutationsDisabled}
        returnFocusRef={batchChoiceTriggerRef}
      />
    </div>
  )
}
