import type { TFunction } from "i18next"
import type {
  ProcessorOrderControlItem,
  ProductionOrderListItem,
} from "@pressly/contracts"

export type IntakeSourcePresentation = Readonly<{
  name: string
  status: string
  notice: Readonly<{
    label: string
    tone: "muted" | "warning"
  }> | null
}>

export const localeForIntakeLanguage = (
  language: string | undefined
): "en-US" | "es-US" => (language?.startsWith("es") ? "es-US" : "en-US")

export const formatIntakeDate = (
  value: string,
  timezone: string,
  locale: string
): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

const humanizeSourceValue = (value: string): string => {
  const normalized = value.trim().toLocaleLowerCase().replaceAll("_", " ")
  if (normalized.length === 0) return value
  return normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1)
}

export const presentIntakeSourceStatus = (
  status: string,
  t: TFunction
): string => {
  switch (status.toLocaleUpperCase()) {
    case "SUBMITTED":
      return t("intake.sourceStatuses.submitted")
    case "IN_PROGRESS":
      return t("intake.sourceStatuses.inProgress")
    case "PICKED_UP":
      return t("intake.sourceStatuses.pickedUp")
    case "READY_FOR_PICKUP":
      return t("intake.sourceStatuses.readyForPickup")
    case "COMPLETED":
      return t("intake.sourceStatuses.completed")
    case "CANCELED":
    case "CANCELLED":
      return t("intake.sourceStatuses.canceled")
    default:
      return humanizeSourceValue(status)
  }
}

export const presentIntakeOrderNumber = (
  item: ProcessorOrderControlItem
): string => item.canonical?.displayNumber ?? item.order.externalOrderId

export const presentIntakeCustomer = (
  item: ProcessorOrderControlItem,
  t: TFunction
): Readonly<{
  name: string
  phone: string | null
}> => {
  const customer = item.canonical?.customer
  if (customer === undefined || customer === null)
    return { name: t("intake.customerUnknown"), phone: null }
  if (customer.businessName !== null)
    return { name: customer.businessName, phone: customer.phone }
  const name = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" ")
  return {
    name:
      name.length > 0 ? name : (customer.phone ?? t("intake.customerUnknown")),
    phone: customer.phone,
  }
}

export const presentIntakeSource = (
  item: ProcessorOrderControlItem,
  t: TFunction
): IntakeSourcePresentation => {
  const sourceName = humanizeSourceValue(
    item.canonical?.source?.name ?? t("intake.source")
  )
  const sourceStatus = item.canonical?.source?.status
  const notice =
    item.admission.override === "released"
      ? {
          label: t("intake.manualReleaseActive"),
          tone: "muted" as const,
        }
      : null

  return {
    name: sourceName,
    status:
      sourceStatus == null
        ? t("intake.sourceStatusUnknown")
        : presentIntakeSourceStatus(sourceStatus, t),
    notice,
  }
}

export const presentIntakeDueBucket = (
  bucket: ProductionOrderListItem["dueBucket"],
  t: TFunction
): string => {
  switch (bucket) {
    case "overdue":
      return t("common.due.overdue")
    case "today":
      return t("common.due.today")
    case "tomorrow":
      return t("common.due.tomorrow")
    case "later":
      return t("common.due.later")
  }
}
