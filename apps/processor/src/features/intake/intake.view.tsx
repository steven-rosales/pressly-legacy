import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconPackageImport,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import type { ProcessorOrderControlItem } from "@pressly/contracts"
import { SectionHeading } from "@/components/layout/workspace-primitives"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DelayedLoadingRows } from "@/components/ui/delayed-loading-rows"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useIntakeModel,
  type IntakeModelInput,
  type IntakeTab,
} from "./intake.model"
import { presentIntakeDueBucket } from "./intake.presenter"

const customerLabel = (
  item: ProcessorOrderControlItem,
  fallback: string
): string => {
  const customer = item.canonical?.customer
  if (customer === undefined) return fallback
  if (customer.businessName !== null) return customer.businessName
  const name = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" ")
  return name.length > 0 ? name : (customer.phone ?? fallback)
}

const tabItems: readonly Readonly<{
  value: IntakeTab
  labelKey: "intake.forecastOnly" | "intake.needsIntake" | "intake.ready"
  count: (model: ReturnType<typeof useIntakeModel>) => number
}>[] = [
  {
    value: "forecast_only",
    labelKey: "intake.forecastOnly",
    count: (model) => model.counts.forecastOnly,
  },
  {
    value: "needs_intake",
    labelKey: "intake.needsIntake",
    count: (model) => model.counts.needsIntake,
  },
  {
    value: "ready",
    labelKey: "intake.ready",
    count: (model) => model.counts.ready,
  },
]

export function IntakeWorkspace(input: IntakeModelInput) {
  const { t } = useTranslation()
  const model = useIntakeModel(input)

  return (
    <div className="flex flex-col gap-6" aria-busy={model.loading}>
      <SectionHeading
        title={t("intake.title")}
        description={t("intake.description")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={model.loading}
            onClick={() => void model.refresh()}
          >
            <IconRefresh data-icon="inline-start" />
            {t("common.refresh")}
          </Button>
        }
      />

      <Alert>
        <IconSparkles />
        <AlertTitle>{t("intake.presslyDecisionTitle")}</AlertTitle>
        <AlertDescription>
          {t("intake.presslyDecisionDescription")}
        </AlertDescription>
      </Alert>

      {model.error !== null && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>{t("intake.attention")}</AlertTitle>
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={model.tab}
        onValueChange={(value) => model.setTab(value as IntakeTab)}
      >
        <TabsList className="grid h-11 w-full grid-cols-3 sm:w-fit sm:min-w-lg">
          {tabItems.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              {t(tab.labelKey)}
              <Badge variant="secondary" className="min-w-5 px-1">
                {tab.count(model)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {model.loading ? (
        <DelayedLoadingRows label={t("intake.loading")} />
      ) : model.items.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconPackageImport />
            </EmptyMedia>
            <EmptyTitle>{t("intake.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("intake.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-background">
          {model.items.map((item) => {
            const order = item.order
            const value =
              model.bagCounts[order.id] ?? order.bagCount?.toString() ?? ""
            const priority = model.priorities[order.id] ?? item.order.priority
            const invalid =
              value.length > 0 &&
              (!Number.isInteger(Number(value)) || Number(value) < 0)
            const canRelease = item.admission.allowedActions.includes("release")
            const canReturn =
              item.admission.allowedActions.includes("return_to_source")
            const canRecord =
              order.status === "release_pending" ||
              order.status === "intake_pending"
            const busy = model.busyOrderId === order.id
            const sourceStatus =
              item.canonical?.source?.status ?? t("intake.sourceStatusUnknown")

            return (
              <article
                key={order.id}
                className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(15rem,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">
                      {t("intake.order", { orderId: order.externalOrderId })}
                    </p>
                    {order.priority && <Badge>{t("intake.priority")}</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {customerLabel(item, t("intake.customerUnknown"))}
                    {item.canonical?.customer.phone === null ||
                    item.canonical?.customer.phone === undefined
                      ? ""
                      : ` · ${item.canonical.customer.phone}`}
                  </p>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">
                      {item.canonical?.source?.name ?? t("intake.source")}
                    </Badge>
                    <Badge
                      variant={
                        item.admission.override === "released"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {sourceStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.admission.override === "released"
                      ? t("intake.manualReleaseActive")
                      : t("intake.sourceStateObserved")}
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  {canRecord ? (
                    <>
                      <Field className="w-24" data-invalid={invalid}>
                        <FieldLabel htmlFor={`bags-${order.id}`}>
                          {t("intake.bags")}
                        </FieldLabel>
                        <Input
                          id={`bags-${order.id}`}
                          className="h-10"
                          type="number"
                          min={0}
                          step={1}
                          value={value}
                          onChange={(event) =>
                            model.setBagCount(order.id, event.target.value)
                          }
                          aria-invalid={invalid}
                        />
                      </Field>
                      <Field orientation="horizontal" className="min-h-10">
                        <Switch
                          id={`priority-${order.id}`}
                          checked={priority}
                          onCheckedChange={(checked) =>
                            model.setPriority(order.id, checked)
                          }
                        />
                        <FieldLabel htmlFor={`priority-${order.id}`}>
                          {t("intake.priority")}
                        </FieldLabel>
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        disabled={
                          model.busyOrderId !== null ||
                          value.length === 0 ||
                          invalid
                        }
                        onClick={() => void model.record(item)}
                      >
                        {busy && <Spinner data-icon="inline-start" />}
                        {t("intake.record")}
                      </Button>
                    </>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">
                        {t("common.bags", { count: order.bagCount ?? 0 })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("intake.intakeRecorded")}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-stretch gap-2 lg:items-end">
                  <p className="text-sm text-muted-foreground">
                    {t("intake.orderDetail", {
                      weight: order.derivedWeightLbs,
                      due: presentIntakeDueBucket(order.dueBucket, t),
                    })}
                  </p>
                  {canRelease && (
                    <Button
                      type="button"
                      className="h-10"
                      disabled={model.busyOrderId !== null}
                      onClick={() =>
                        model.setDecision({ item, target: "released" })
                      }
                    >
                      <IconPackageImport data-icon="inline-start" />
                      {t("intake.release")}
                    </Button>
                  )}
                  {canReturn && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      disabled={model.busyOrderId !== null}
                      onClick={() =>
                        model.setDecision({ item, target: "source" })
                      }
                    >
                      <IconArrowBackUp data-icon="inline-start" />
                      {t("intake.returnToForecast")}
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <AlertDialog
        open={model.decision !== null}
        onOpenChange={(open) => {
          if (!open) model.setDecision(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              {model.decision?.target === "released" ? (
                <IconPackageImport />
              ) : (
                <IconArrowBackUp />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {model.decision?.target === "released"
                ? t("intake.releaseTitle")
                : t("intake.returnTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {model.decision?.target === "released"
                ? t("intake.releaseDescription")
                : t("intake.returnDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={model.busyOrderId !== null}
              onClick={(event) => {
                event.preventDefault()
                void model.confirmAdmission()
              }}
            >
              {model.busyOrderId !== null && (
                <Spinner data-icon="inline-start" />
              )}
              {model.decision?.target === "released"
                ? t("intake.confirmRelease")
                : t("intake.confirmReturn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
