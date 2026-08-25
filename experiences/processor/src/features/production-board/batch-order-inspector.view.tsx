import type { ProcessorProductionBatch } from "../../contracts/production-board.ts"
import type { TFunction } from "i18next"
import { useEffect, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { IconX } from "@tabler/icons-react"
import { OperationalOrderIdentity } from "../../browser/components/orders/operational-order-identity"
import { Badge } from "../../browser/components/ui/badge"
import { Button } from "../../browser/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../../browser/components/ui/drawer"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
} from "../../browser/components/ui/item"
import { ScrollArea } from "../../browser/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../browser/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../browser/components/ui/select"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../browser/components/ui/table"

const dueLabel = (
  bucket: ProcessorProductionBatch["orders"][number]["dueBucket"],
  t: TFunction
) =>
  t(
    bucket === "overdue"
      ? "common.due.overdue"
      : bucket === "today"
        ? "common.due.today"
        : bucket === "tomorrow"
          ? "common.due.tomorrow"
          : "common.due.later"
  )

const batchStatusLabel = (
  status: ProcessorProductionBatch["status"],
  t: TFunction
) => {
  const labels: Record<ProcessorProductionBatch["status"], string> = {
    finished: t("production.completed"),
    queued: t("common.queued"),
    sorting: t("common.stage.sorting"),
    washing: t("common.stage.washing"),
    drying: t("common.stage.drying"),
    folding_packaging: t("common.stage.foldingPackaging"),
  }
  return labels[status]
}

function BatchInspectorControls({
  batches,
  selectedBatch,
  onSelectedBatchChange,
}: Readonly<{
  batches: readonly ProcessorProductionBatch[]
  selectedBatch: ProcessorProductionBatch
  onSelectedBatchChange: (batchId: string) => void
}>) {
  const { t } = useTranslation()

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select value={selectedBatch.id} onValueChange={onSelectedBatchChange}>
        <SelectTrigger
          className="h-11 min-w-48"
          aria-label={t("production.chooseBatch")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {batches.map((batch) => (
              <SelectItem key={batch.id} value={batch.id}>
                {t("production.batchOption", {
                  number: batch.sequence + 1,
                  orders: t("common.orders", {
                    count: batch.orders.length,
                  }),
                })}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Badge variant="secondary">
        {batchStatusLabel(selectedBatch.status, t)}
      </Badge>
      <Badge variant="outline">
        {selectedBatch.membership.state === "frozen"
          ? t("production.membershipFrozen")
          : t("production.membershipMutable")}
      </Badge>
    </div>
  )
}

function MobileBatchOrderList({
  batch,
}: Readonly<{
  batch: ProcessorProductionBatch
}>) {
  const { t } = useTranslation()

  return (
    <ScrollArea key={batch.id} className="min-h-0 flex-1 px-4 py-4 sm:px-6">
      <section
        aria-labelledby={`batch-${batch.id}-orders-mobile`}
        className="mx-auto w-full max-w-5xl"
      >
        <h3
          id={`batch-${batch.id}-orders-mobile`}
          className="mb-3 text-sm font-semibold"
        >
          {t("production.ordersInBatch")}
        </h3>
        <ItemGroup role="list" className="gap-2">
          {batch.orders.map((order) => (
            <Item
              key={order.id}
              role="listitem"
              variant="outline"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 py-3"
            >
              <ItemContent className="min-w-0">
                <OperationalOrderIdentity identity={order.identity} />
                <p className="text-sm text-muted-foreground">
                  {t("production.orderManifestFacts", {
                    weight: t("common.pounds", {
                      value: order.derivedWeightLbs,
                    }),
                    bags: t("common.bags", {
                      count: order.bagCount,
                    }),
                  })}
                </p>
              </ItemContent>
              <ItemActions className="ms-auto flex-col items-end">
                <Badge
                  variant={
                    order.dueBucket === "overdue" ? "destructive" : "outline"
                  }
                >
                  {dueLabel(order.dueBucket, t)}
                </Badge>
                {order.priority && <Badge>{t("production.priority")}</Badge>}
                {order.pinnedAt !== null && (
                  <Badge variant="outline">
                    {t("production.pinnedPlacement")}
                  </Badge>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </section>
    </ScrollArea>
  )
}

function DesktopBatchOrderTable({
  batch,
}: Readonly<{
  batch: ProcessorProductionBatch
}>) {
  const { t } = useTranslation()

  return (
    <section
      key={batch.id}
      className="min-h-0 flex-1 overflow-auto px-6 pt-4 pb-6 [&>[data-slot=table-container]]:overflow-visible"
    >
      <Table className="min-w-[760px] table-fixed">
        <TableCaption className="sr-only">
          {t("production.ordersInBatch")}
        </TableCaption>
        <TableHeader className="sticky top-0 bg-popover">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[46%] px-4">
              {t("production.orderCustomerColumn")}
            </TableHead>
            <TableHead className="w-[10%] text-end">
              {t("production.bagsColumn")}
            </TableHead>
            <TableHead className="w-[12%] text-end">
              {t("production.weightColumn")}
            </TableHead>
            <TableHead className="w-[14%] px-4">
              {t("production.dueColumn")}
            </TableHead>
            <TableHead className="w-[18%] px-4">
              {t("production.handlingColumn")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batch.orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="px-4 py-3 whitespace-normal">
                <OperationalOrderIdentity identity={order.identity} />
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {order.bagCount}
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {t("common.pounds", { value: order.derivedWeightLbs })}
              </TableCell>
              <TableCell className="px-4">
                <Badge
                  variant={
                    order.dueBucket === "overdue" ? "destructive" : "outline"
                  }
                >
                  {dueLabel(order.dueBucket, t)}
                </Badge>
              </TableCell>
              <TableCell className="px-4 whitespace-normal">
                <div className="flex flex-wrap gap-1.5">
                  {order.priority && <Badge>{t("production.priority")}</Badge>}
                  {order.pinnedAt !== null && (
                    <Badge variant="outline">
                      {t("production.pinnedPlacement")}
                    </Badge>
                  )}
                  {!order.priority && order.pinnedAt === null && (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">
                        {t("production.noSpecialHandling")}
                      </span>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

export function BatchOrderInspector({
  open,
  batches,
  selectedBatchId,
  isMobile,
  returnFocusRef,
  onOpenChange,
  onSelectedBatchChange,
}: Readonly<{
  open: boolean
  batches: readonly ProcessorProductionBatch[]
  selectedBatchId: string | null
  isMobile: boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  onSelectedBatchChange: (batchId: string) => void
}>) {
  const { t } = useTranslation()
  const selectedBatch =
    batches.find((batch) => batch.id === selectedBatchId) ?? null
  const orderCount = selectedBatch?.orders.length ?? 0
  const bagCount =
    selectedBatch?.orders.reduce((sum, order) => sum + order.bagCount, 0) ?? 0

  useEffect(() => {
    if (open && selectedBatch === null) onOpenChange(false)
  }, [onOpenChange, open, selectedBatch])

  const restoreFocus = (event: Event) => {
    const trigger = returnFocusRef.current
    returnFocusRef.current = null
    if (trigger?.isConnected !== true) return
    event.preventDefault()
    trigger.focus({ preventScroll: true })
  }

  if (selectedBatch === null) return null

  const summary = t("production.batchManifestSummary", {
    orders: t("common.orders", { count: orderCount }),
    bags: t("common.bags", { count: bagCount }),
    weight: t("common.pounds", {
      value: selectedBatch.derivedWeightLbs,
    }),
  })

  if (!isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          size="workspace"
          className="h-[90dvh] max-h-[90dvh] min-h-0 gap-0 overflow-hidden rounded-t-xl data-[side=bottom]:h-[90dvh] data-[side=bottom]:max-h-[90dvh]"
          closeLabel={t("production.closeBatchOrders")}
          onCloseAutoFocus={restoreFocus}
        >
          <SheetHeader className="border-b px-6 pe-16 pt-5 pb-4">
            <SheetTitle>
              {t("production.batchOrdersTitle", {
                number: selectedBatch.sequence + 1,
              })}
            </SheetTitle>
            <SheetDescription>{summary}</SheetDescription>
            <BatchInspectorControls
              batches={batches}
              selectedBatch={selectedBatch}
              onSelectedBatchChange={onSelectedBatchChange}
            />
          </SheetHeader>
          <DesktopBatchOrderTable batch={selectedBatch} />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent
        className="h-[90dvh] max-h-[90dvh] min-h-0 gap-0 overflow-hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:h-[90dvh] data-[vaul-drawer-direction=bottom]:max-h-[90dvh]"
        onCloseAutoFocus={restoreFocus}
      >
        <DrawerHeader className="shrink-0 border-b px-4 pt-2 pb-4 text-start sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DrawerTitle>
                {t("production.batchOrdersTitle", {
                  number: selectedBatch.sequence + 1,
                })}
              </DrawerTitle>
              <DrawerDescription className="mt-1">{summary}</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label={t("production.closeBatchOrders")}
              >
                <IconX />
              </Button>
            </DrawerClose>
          </div>
          <BatchInspectorControls
            batches={batches}
            selectedBatch={selectedBatch}
            onSelectedBatchChange={onSelectedBatchChange}
          />
        </DrawerHeader>
        <MobileBatchOrderList batch={selectedBatch} />
      </DrawerContent>
    </Drawer>
  )
}
