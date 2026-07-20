import type { TFunction } from "i18next"
import type { ProductionOrderListItem } from "@pressly/contracts"

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
