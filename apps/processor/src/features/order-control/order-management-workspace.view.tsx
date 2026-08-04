import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { OrderManagementPort } from "@/ports/order-management.port"
import { IncomingOrdersWorkspace } from "./incoming-orders.view"

export function OrderManagementWorkspace({
  orderManagement,
  idempotency,
  locationId,
  timezone,
  revision,
  onMutated,
  currentOrders,
}: Readonly<{
  orderManagement: OrderManagementPort
  idempotency: IdempotencyPort
  locationId: string
  timezone: string
  revision: string
  onMutated: () => Promise<void>
  currentOrders: ReactNode
}>) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue="incoming" className="min-w-0 gap-6">
      <TabsList
        aria-label={t("orderControl.manageOrders.tabsLabel")}
        className="grid h-11 w-full grid-cols-2 sm:w-80"
      >
        <TabsTrigger value="incoming">
          {t("orderControl.manageOrders.incoming")}
        </TabsTrigger>
        <TabsTrigger value="active">
          {t("orderControl.manageOrders.active")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="incoming" className="min-w-0">
        <IncomingOrdersWorkspace
          key={locationId}
          orderManagement={orderManagement}
          idempotency={idempotency}
          locationId={locationId}
          timezone={timezone}
          revision={revision}
          onMutated={onMutated}
        />
      </TabsContent>

      <TabsContent value="active" className="min-w-0">
        {currentOrders}
      </TabsContent>
    </Tabs>
  )
}
