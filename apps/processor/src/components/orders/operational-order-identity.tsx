import type { ProcessorOperationalOrderIdentity } from "@pressly/contracts/processor"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/class-names"

export function OperationalOrderIdentity({
  identity,
  className,
  primaryClassName,
  secondaryClassName,
  onPrimaryClick,
}: Readonly<{
  identity: ProcessorOperationalOrderIdentity
  className?: string
  primaryClassName?: string
  secondaryClassName?: string
  onPrimaryClick?: () => void
}>) {
  const { t } = useTranslation()
  const orderLabel = t("common.orderNumber", {
    orderNumber: identity.displayNumber,
  })
  const customerLabel =
    identity.customerDisplayName ?? t("common.customerUnavailable")

  return (
    <span
      className={cn("block min-w-0 text-start", className)}
      title={t("common.orderIdentityLabel", {
        orderNumber: identity.displayNumber,
        customer: customerLabel,
      })}
      data-order-identity={identity.displayNumber}
    >
      {onPrimaryClick === undefined ? (
        <span
          className={cn("block truncate font-medium", primaryClassName)}
          title={orderLabel}
        >
          {orderLabel}
        </span>
      ) : (
        <Button
          type="button"
          variant="link"
          className={cn(
            "h-auto max-w-full justify-start truncate p-0 text-foreground",
            primaryClassName
          )}
          title={orderLabel}
          onClick={onPrimaryClick}
        >
          {orderLabel}
        </Button>
      )}
      <span
        className={cn(
          "mt-0.5 block truncate text-xs text-muted-foreground",
          secondaryClassName
        )}
        title={customerLabel}
      >
        {customerLabel}
      </span>
    </span>
  )
}
