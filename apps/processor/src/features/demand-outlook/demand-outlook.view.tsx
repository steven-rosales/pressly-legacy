import {
  IconAlertTriangle,
  IconChartHistogram,
  IconClock,
  IconPackages,
} from "@tabler/icons-react"
import type { ProductionDemandOutlook } from "@pressly/contracts"
import { useTranslation } from "react-i18next"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type DemandOutlookVariant = "compact" | "detailed"

const localeForLanguage = (language: string | undefined): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

type SourceStatusTranslationKey =
  | "demandOutlook.sourceStatus.SUBMITTED"
  | "demandOutlook.sourceStatus.READY_FOR_PICKUP"
  | "demandOutlook.sourceStatus.PICKED_UP"
  | "demandOutlook.sourceStatus.IN_PROGRESS"
  | "demandOutlook.sourceStatus.READY_FOR_RETURN"
  | "demandOutlook.sourceStatus.OUT_FOR_DELIVERY"
  | "demandOutlook.sourceStatus.COMPLETED"
  | "demandOutlook.sourceStatus.CANCELED"
  | "demandOutlook.sourceStatus.LEGACY_IN_PROGRESS"
  | "demandOutlook.sourceStatus.LEGACY_UNKNOWN"

const sourceStatusTranslationKey = (
  status: string
): SourceStatusTranslationKey | null => {
  switch (status) {
    case "SUBMITTED":
    case "READY_FOR_PICKUP":
    case "PICKED_UP":
    case "IN_PROGRESS":
    case "READY_FOR_RETURN":
    case "OUT_FOR_DELIVERY":
    case "COMPLETED":
    case "CANCELED":
    case "LEGACY_IN_PROGRESS":
    case "LEGACY_UNKNOWN":
      return `demandOutlook.sourceStatus.${status}`
    default:
      return null
  }
}

const formatCutoff = (
  value: string,
  timezone: string,
  locale: string
): string =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value))

const formatClock = (value: string, timezone: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value))

export function DemandOutlookView({
  outlook,
  timezone,
  variant,
}: {
  outlook: ProductionDemandOutlook
  timezone: string
  variant: DemandOutlookVariant
}) {
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const presentSourceStatus = (status: string): string => {
    const key = sourceStatusTranslationKey(status)
    return key === null ? status : t(key)
  }
  const cutoff = formatCutoff(outlook.horizonCutoffAt, timezone, locale)
  const forecastFinish =
    outlook.forecast === null
      ? null
      : formatClock(outlook.forecast.completesAt, timezone, locale)
  const metrics = [
    {
      label: t("demandOutlook.knownDemand"),
      value: t("common.pounds", { value: outlook.totalEstimatedWeightLbs }),
      detail: t("demandOutlook.knownDemandDetail", {
        count: outlook.totalOrderCount,
      }),
    },
    {
      label: t("demandOutlook.expectedDemand"),
      value: t("common.pounds", {
        value: outlook.expectedEstimatedWeightLbs,
      }),
      detail: t("demandOutlook.expectedDemandDetail", {
        count: outlook.expectedOrderCount,
      }),
    },
    {
      label: t("demandOutlook.readyDemand"),
      value: t("common.pounds", { value: outlook.readyEstimatedWeightLbs }),
      detail: t("demandOutlook.readyDemandDetail", {
        count: outlook.readyOrderCount,
      }),
    },
    {
      label: t("demandOutlook.forecastFinish"),
      value: forecastFinish ?? "—",
      detail:
        outlook.forecast === null
          ? t("demandOutlook.forecastUnavailable")
          : t("demandOutlook.forecastDetail", {
              count: outlook.forecast.batchCount,
            }),
    },
  ]

  return (
    <Card className="min-w-0 bg-background" data-testid="demand-outlook">
      <CardHeader className="gap-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground [&_svg]:size-4"
              aria-hidden="true"
            >
              <IconChartHistogram />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{t("demandOutlook.title")}</CardTitle>
                <Badge variant="outline">{t("demandOutlook.advisory")}</Badge>
                {outlook.reconciliationCount > 0 && (
                  <Badge variant="secondary">
                    {t("demandOutlook.reviewCount", {
                      count: outlook.reconciliationCount,
                    })}
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1 max-w-3xl">
                {t("demandOutlook.description", { cutoff })}
              </CardDescription>
            </div>
          </div>
        </div>
        {outlook.estimateMissingOrderCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("demandOutlook.missingEstimate", {
              count: outlook.estimateMissingOrderCount,
            })}
          </p>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <dl className="grid grid-cols-2 gap-px border-y bg-border lg:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 bg-background p-4">
              <dt className="text-sm text-muted-foreground">{metric.label}</dt>
              <dd>
                <p className="mt-2 text-2xl font-medium tracking-tight tabular-nums">
                  {metric.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {metric.detail}
                </p>
              </dd>
            </div>
          ))}
        </dl>

        {outlook.reconciliationCount > 0 && (
          <div className="p-4 pb-0">
            <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
              <IconAlertTriangle />
              <AlertTitle>{t("demandOutlook.reconciliationTitle")}</AlertTitle>
              <AlertDescription>
                {t("demandOutlook.reconciliationDescription", {
                  count: outlook.reconciliationCount,
                })}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {variant === "compact" ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t("demandOutlook.compactGuidance")}
          </p>
        ) : (
          <Tabs defaultValue="forecast" className="p-4">
            <TabsList variant="line">
              <TabsTrigger value="forecast">
                {t("demandOutlook.forecastTab")}
              </TabsTrigger>
              <TabsTrigger value="orders">
                {t(
                  outlook.reconciliationCount > 0
                    ? "demandOutlook.ordersAndReviewTab"
                    : "demandOutlook.ordersTab",
                  {
                    count: outlook.items.length,
                  }
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="forecast" className="pt-4">
              {outlook.forecast === null ? (
                <Empty className="min-h-52 border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconClock />
                    </EmptyMedia>
                    <EmptyTitle>{t("demandOutlook.noForecast")}</EmptyTitle>
                    <EmptyDescription>
                      {t("demandOutlook.noForecastDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : outlook.forecast.batches.length === 0 ? (
                <Empty className="min-h-52 border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconPackages />
                    </EmptyMedia>
                    <EmptyTitle>{t("demandOutlook.noBatches")}</EmptyTitle>
                    <EmptyDescription>
                      {t("demandOutlook.noBatchesDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ItemGroup className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {outlook.forecast.batches.map((batch) => (
                    <Item key={batch.sequence} variant="outline">
                      <ItemMedia variant="icon">
                        <IconPackages />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>
                          {t("demandOutlook.batch", {
                            number: batch.sequence + 1,
                          })}
                          <Badge variant="outline">
                            {t("common.pounds", {
                              value: batch.estimatedWeightLbs,
                            })}
                          </Badge>
                        </ItemTitle>
                        <ItemDescription>
                          {t("demandOutlook.batchDetail", {
                            expected: batch.expectedOrderCount,
                            ready: batch.readyOrderCount,
                          })}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
              {outlook.forecast !== null &&
                outlook.forecast.unplacedDemandIds.length > 0 && (
                  <Alert className="mt-3">
                    <IconAlertTriangle />
                    <AlertTitle>{t("demandOutlook.unplacedTitle")}</AlertTitle>
                    <AlertDescription>
                      {t("demandOutlook.unplacedDescription", {
                        count: outlook.forecast.unplacedDemandIds.length,
                      })}
                    </AlertDescription>
                  </Alert>
                )}
            </TabsContent>

            <TabsContent value="orders" className="pt-4">
              {outlook.items.length === 0 ? (
                <Empty className="min-h-52 border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconPackages />
                    </EmptyMedia>
                    <EmptyTitle>{t("demandOutlook.noDemand")}</EmptyTitle>
                    <EmptyDescription>
                      {t("demandOutlook.noDemandDescription", { cutoff })}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ItemGroup className="gap-1">
                  {outlook.items.map((item) => (
                    <Item key={item.orderDemandId}>
                      <ItemContent>
                        <ItemTitle>
                          {t("demandOutlook.order", {
                            orderId: item.externalOrderId,
                          })}
                          <Badge
                            variant={
                              item.reconciliation === "none"
                                ? "outline"
                                : "secondary"
                            }
                          >
                            {item.reconciliation === "none"
                              ? t(`demandOutlook.phase.${item.phase}`)
                              : t("demandOutlook.review")}
                          </Badge>
                        </ItemTitle>
                        <ItemDescription>
                          {item.reconciliation === "none"
                            ? t("demandOutlook.orderDetail", {
                                status: presentSourceStatus(
                                  item.sourceStatusCode
                                ),
                                weight:
                                  item.estimatedWeightLbs === null
                                    ? t("common.notAvailable")
                                    : t("common.pounds", {
                                        value: item.estimatedWeightLbs,
                                      }),
                                readiness: t(
                                  `demandOutlook.readiness.${item.readiness}`
                                ),
                              })
                            : t(
                                `demandOutlook.reconciliation.${item.reconciliation}`
                              )}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
