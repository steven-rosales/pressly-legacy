import type { TFunction } from "i18next"
import type { ProcessorOrderControlItem } from "@pressly/contracts/processor"
import type { ProductionOrderListItem } from "@pressly/contracts/production"

export type IntakeSourcePresentation = Readonly<{
  label: string
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

  return {
    label: t("intake.reportedBy", { source: sourceName }),
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
