import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowsMove,
  IconCheck,
  IconLock,
  IconPackageExport,
  IconRefresh,
  IconStack2,
} from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/components/ui/class-names"
import type {
  OrderActionPreview,
  OrderControlCallbacks,
  OrderControlOrder,
  OrderDetailAction,
  OrderExceptionAction,
  OrderMoveAction,
} from "./order-control.model"

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
    </div>
  )
}

function PreviewCard({ preview }: { preview: OrderActionPreview }) {
  return (
    <Card className="gap-3 bg-muted/35 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconCheck className="size-4" />
          {preview.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div>
          <p className="text-sm font-medium">{preview.destinationLabel}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {preview.destinationDetail}
          </p>
        </div>
        {preview.effects.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {preview.effects.map((effect) => (
              <li key={effect} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span>{effect}</span>
              </li>
            ))}
          </ul>
        )}
        {preview.warnings.length > 0 && (
          <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
            <IconAlertTriangle />
            <AlertTitle>Review before confirming</AlertTitle>
            <AlertDescription>{preview.warnings.join(" ")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function ActionError({ error }: { error: string | null }) {
  if (error === null) return null
  return (
    <Alert variant="destructive" role="alert">
      <IconAlertTriangle />
      <AlertTitle>Order action not ready</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

function MoveActionView({
  action,
  callbacks,
}: Readonly<{
  action: OrderMoveAction
  callbacks: OrderControlCallbacks
}>) {
  const selectedTarget = action.targets.find(
    (target) => target.batchId === action.selectedBatchId
  )
  const canReview =
    selectedTarget !== undefined && !selectedTarget.disabled && !action.busy
  const locked = action.preview !== null || action.busy

  return (
    <>
      <ScrollArea className="min-h-0 flex-1 px-5">
        <div className="flex flex-col gap-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-fit px-0 hover:bg-transparent"
            disabled={action.busy}
            onClick={callbacks.onCancelAction}
          >
            <IconArrowLeft data-icon="inline-start" />
            Back to order
          </Button>
          <Alert>
            <IconArrowsMove />
            <AlertTitle>Queued work only</AlertTitle>
            <AlertDescription>
              LPMS will keep the order whole, enforce hard pulse capacity, and
              record the manual placement. In-flight batches are not normal move
              targets.
            </AlertDescription>
          </Alert>
          <Field>
            <FieldLabel htmlFor="order-move-target">
              Destination batch
            </FieldLabel>
            <NativeSelect
              id="order-move-target"
              className="w-full [&_[data-slot=native-select]]:h-11"
              value={action.selectedBatchId}
              disabled={locked}
              onChange={(event) =>
                callbacks.onMoveTargetChange(event.target.value)
              }
            >
              <NativeSelectOption value="" disabled>
                Choose a mutable queued batch
              </NativeSelectOption>
              {action.targets.map((target) => (
                <NativeSelectOption
                  key={target.batchId}
                  value={target.batchId}
                  disabled={target.disabled}
                >
                  {target.label} · {target.detail}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {selectedTarget?.disabledReason !== null &&
              selectedTarget?.disabledReason !== undefined && (
                <FieldDescription>
                  {selectedTarget.disabledReason}
                </FieldDescription>
              )}
          </Field>
          {action.preview !== null && <PreviewCard preview={action.preview} />}
          <ActionError error={action.error} />
        </div>
      </ScrollArea>
      <SheetFooter className="border-t px-5 py-4">
        {action.preview !== null && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={action.busy}
            onClick={callbacks.onChangeActionDetails}
          >
            Change destination
          </Button>
        )}
        <Button
          type="button"
          className="h-11"
          disabled={action.preview === null ? !canReview : action.busy}
          aria-busy={action.busy}
          onClick={
            action.preview === null
              ? callbacks.onReviewMove
              : callbacks.onConfirmMove
          }
        >
          {action.busy && <Spinner data-icon="inline-start" />}
          {action.preview === null
            ? "Review move"
            : action.preview.confirmationLabel}
        </Button>
      </SheetFooter>
    </>
  )
}

const exceptionCopy = {
  leave_behind: {
    title: "Leave this order behind",
    description:
      "Record that this order cannot continue with its current batch and choose where production must resume.",
    icon: IconPackageExport,
  },
  rework: {
    title: "Send this order to rework",
    description:
      "Record the repeated production stage and review the later batch that can safely carry the work.",
    icon: IconRefresh,
  },
} as const

function ExceptionActionView({
  action,
  callbacks,
}: Readonly<{
  action: OrderExceptionAction
  callbacks: OrderControlCallbacks
}>) {
  const copy = exceptionCopy[action.kind]
  const Icon = copy.icon
  const locked = action.preview !== null || action.busy
  const missingOtherNote =
    action.draft.reason === "other" && action.draft.note.trim().length === 0
  const canReview =
    action.draft.reason.length > 0 &&
    action.draft.restartStage.length > 0 &&
    !missingOtherNote &&
    !action.busy

  return (
    <>
      <ScrollArea className="min-h-0 flex-1 px-5">
        <div className="flex flex-col gap-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-fit px-0 hover:bg-transparent"
            disabled={action.busy}
            onClick={callbacks.onCancelAction}
          >
            <IconArrowLeft data-icon="inline-start" />
            Back to order
          </Button>
          <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
            <Icon />
            <AlertTitle>{copy.title}</AlertTitle>
            <AlertDescription>{copy.description}</AlertDescription>
          </Alert>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="order-exception-reason">Reason</FieldLabel>
              <NativeSelect
                id="order-exception-reason"
                className="w-full [&_[data-slot=native-select]]:h-11"
                value={action.draft.reason}
                disabled={locked}
                onChange={(event) =>
                  callbacks.onExceptionDraftChange({
                    ...action.draft,
                    reason: event.target.value,
                  })
                }
              >
                <NativeSelectOption value="" disabled>
                  Choose what happened
                </NativeSelectOption>
                {action.reasonOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="order-exception-stage">
                Resume production at
              </FieldLabel>
              <NativeSelect
                id="order-exception-stage"
                className="w-full [&_[data-slot=native-select]]:h-11"
                value={action.draft.restartStage}
                disabled={locked}
                onChange={(event) =>
                  callbacks.onExceptionDraftChange({
                    ...action.draft,
                    restartStage: event.target.value,
                  })
                }
              >
                <NativeSelectOption value="" disabled>
                  Choose the next required stage
                </NativeSelectOption>
                {action.restartStageOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Choose physical truth, not the stage LPMS currently expects.
              </FieldDescription>
            </Field>
            <Alert>
              <IconStack2 />
              <AlertTitle>Next compatible batch</AlertTitle>
              <AlertDescription>
                LPMS will preview the earliest later batch that can carry the
                whole order through every required stage without exceeding hard
                capacity.
              </AlertDescription>
            </Alert>
            <Field>
              <FieldLabel htmlFor="order-exception-note">
                Floor note{action.draft.reason === "other" ? "" : " (optional)"}
              </FieldLabel>
              <Textarea
                id="order-exception-note"
                value={action.draft.note}
                disabled={locked}
                maxLength={500}
                placeholder="What should the next employee know?"
                onChange={(event) =>
                  callbacks.onExceptionDraftChange({
                    ...action.draft,
                    note: event.target.value,
                  })
                }
              />
              {missingOtherNote && (
                <FieldDescription>
                  Add a short floor note when the reason is Other.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
          {action.preview !== null && <PreviewCard preview={action.preview} />}
          <ActionError error={action.error} />
        </div>
      </ScrollArea>
      <SheetFooter className="border-t px-5 py-4">
        {action.preview !== null && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={action.busy}
            onClick={callbacks.onChangeActionDetails}
          >
            Change details
          </Button>
        )}
        <Button
          type="button"
          className="h-11"
          disabled={action.preview === null ? !canReview : action.busy}
          aria-busy={action.busy}
          onClick={
            action.preview === null
              ? callbacks.onReviewException
              : callbacks.onConfirmException
          }
        >
          {action.busy && <Spinner data-icon="inline-start" />}
          {action.preview === null
            ? "Review floor change"
            : action.preview.confirmationLabel}
        </Button>
      </SheetFooter>
    </>
  )
}

function ActionReason({ children }: { children: string | null }) {
  if (children === null) return null
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function OrderOverview({
  order,
  callbacks,
}: Readonly<{
  order: OrderControlOrder
  callbacks: OrderControlCallbacks
}>) {
  return (
    <>
      <ScrollArea className="min-h-0 flex-1 px-5">
        <div className="flex flex-col gap-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{order.statusLabel}</Badge>
            {order.priority && <Badge>Priority</Badge>}
            {order.position.membership === "frozen" && (
              <Badge variant="outline">
                <IconLock data-icon="inline-start" /> Frozen
              </Badge>
            )}
          </div>

          {order.attention !== null && (
            <Alert
              variant={
                order.attention.tone === "critical" ? "destructive" : "default"
              }
              className={cn(
                order.attention.tone === "warning" &&
                  "border-warning-foreground/20 bg-warning text-warning-foreground"
              )}
            >
              <IconAlertTriangle />
              <AlertTitle>{order.attention.label}</AlertTitle>
              <AlertDescription>{order.attention.detail}</AlertDescription>
            </Alert>
          )}

          <section aria-labelledby="order-position-heading">
            <div className="flex items-center gap-2">
              <IconStack2 className="size-4 text-muted-foreground" />
              <h3 id="order-position-heading" className="text-sm font-medium">
                Floor position
              </h3>
            </div>
            <Card className="mt-2 gap-2 bg-muted/35 py-4">
              <CardContent className="px-4">
                <p className="font-medium">{order.position.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {order.position.detail}
                </p>
              </CardContent>
            </Card>
          </section>

          <dl className="grid grid-cols-2 gap-2">
            <Fact label="Due" value={order.dueLabel} />
            <Fact label="Demand" value={order.weightLabel} />
            <Fact label="Bags" value={order.bagLabel} />
            <Fact label="Updated" value={order.lastUpdatedLabel} />
          </dl>

          {order.placement !== null && (
            <section aria-labelledby="order-placement-heading">
              <h3 id="order-placement-heading" className="text-sm font-medium">
                Placement
              </h3>
              <div className="mt-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{order.placement.label}</p>
                  {order.placement.pinned && (
                    <Badge variant="outline">Pinned</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {order.placement.detail}
                </p>
              </div>
            </section>
          )}

          <Separator />
          <section aria-labelledby="order-actions-heading">
            <h3 id="order-actions-heading" className="text-sm font-medium">
              Order actions
            </h3>
            <div className="mt-3 grid gap-3">
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start"
                  disabled={!order.move.available}
                  onClick={() => callbacks.onStartMove(order.id)}
                >
                  <IconArrowsMove data-icon="inline-start" />
                  Move to queued batch
                </Button>
                <ActionReason>{order.move.reason}</ActionReason>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start"
                  disabled={!order.leaveBehind.available}
                  onClick={() =>
                    callbacks.onStartException(order.id, "leave_behind")
                  }
                >
                  <IconPackageExport data-icon="inline-start" />
                  Leave behind
                </Button>
                <ActionReason>{order.leaveBehind.reason}</ActionReason>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start"
                  disabled={!order.rework.available}
                  onClick={() => callbacks.onStartException(order.id, "rework")}
                >
                  <IconRefresh data-icon="inline-start" />
                  Send to rework
                </Button>
                <ActionReason>{order.rework.reason}</ActionReason>
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
      <SheetFooter className="border-t px-5 py-4">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={callbacks.onCloseOrder}
        >
          Close
        </Button>
      </SheetFooter>
    </>
  )
}

export function OrderDetailSheet({
  order,
  action,
  callbacks,
  isMobile,
}: Readonly<{
  order: OrderControlOrder | null
  action: OrderDetailAction
  callbacks: OrderControlCallbacks
  isMobile: boolean
}>) {
  const title =
    action.kind === "move"
      ? "Move queued order"
      : action.kind === "leave_behind"
        ? "Leave order behind"
        : action.kind === "rework"
          ? "Record order rework"
          : order === null
            ? "Order details"
            : `Order ${order.externalOrderId}`

  return (
    <Sheet
      open={order !== null}
      onOpenChange={(open) => {
        if (!open) callbacks.onCloseOrder()
      }}
    >
      <SheetContent side={isMobile ? "bottom" : "right"} size="workspace">
        <SheetHeader className="border-b px-5 py-4 pe-16">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {order === null
              ? "Review the current production record."
              : `${order.secondaryLabel ?? order.statusLabel} · ${order.dueDetail}`}
          </SheetDescription>
        </SheetHeader>
        {order !== null && action.kind === "none" && (
          <OrderOverview order={order} callbacks={callbacks} />
        )}
        {order !== null && action.kind === "move" && (
          <MoveActionView action={action} callbacks={callbacks} />
        )}
        {order !== null &&
          (action.kind === "leave_behind" || action.kind === "rework") && (
            <ExceptionActionView action={action} callbacks={callbacks} />
          )}
      </SheetContent>
    </Sheet>
  )
}
