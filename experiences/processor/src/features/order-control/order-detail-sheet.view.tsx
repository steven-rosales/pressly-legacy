import {
  IconAlertTriangle,
  IconArchive,
  IconArrowLeft,
  IconArrowsMove,
  IconCheck,
  IconLock,
  IconPackageExport,
  IconRefresh,
  IconStack2,
  IconUser,
} from "@tabler/icons-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../browser/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../browser/components/ui/alert-dialog"
import { Badge } from "../../browser/components/ui/badge"
import { Button } from "../../browser/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../browser/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../browser/components/ui/field"
import { Checkbox } from "../../browser/components/ui/checkbox"
import {
  NativeSelect,
  NativeSelectOption,
} from "../../browser/components/ui/native-select"
import { ScrollArea } from "../../browser/components/ui/scroll-area"
import { Separator } from "../../browser/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../browser/components/ui/sheet"
import { Spinner } from "../../browser/components/ui/spinner"
import { Textarea } from "../../browser/components/ui/textarea"
import { cn } from "../../browser/components/ui/class-names"
import type {
  OrderActionPreview,
  OrderArchiveAction,
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
      <dd className="mt-1 text-sm font-medium break-words">{value}</dd>
    </div>
  )
}

function PreviewCard({ preview }: { preview: OrderActionPreview }) {
  const { t } = useTranslation()
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
            <AlertTitle>{t("orderControl.reviewBeforeConfirming")}</AlertTitle>
            <AlertDescription>{preview.warnings.join(" ")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function ActionError({ error }: { error: string | null }) {
  const { t } = useTranslation()
  if (error === null) return null
  return (
    <Alert variant="destructive" role="alert">
      <IconAlertTriangle />
      <AlertTitle>{t("orderControl.actionNotReady")}</AlertTitle>
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
  const { t } = useTranslation()
  const selectedTarget = action.targets.find(
    (target) => target.batchId === action.selectedBatchId
  )
  const canReview =
    selectedTarget !== undefined && !selectedTarget.disabled && !action.busy
  const locked = action.preview !== null || action.busy

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-5 px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-fit px-0 hover:bg-transparent"
            disabled={action.busy}
            onClick={callbacks.onCancelAction}
          >
            <IconArrowLeft data-icon="inline-start" />
            {t("orderControl.backToOrder")}
          </Button>
          <Alert>
            <IconArrowsMove />
            <AlertTitle>{t("orderControl.queuedOnly")}</AlertTitle>
            <AlertDescription>
              {t("orderControl.queuedOnlyDescription")}
            </AlertDescription>
          </Alert>
          <Field>
            <FieldLabel htmlFor="order-move-target">
              {t("orderControl.destinationBatch")}
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
                {t("orderControl.chooseQueuedBatch")}
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
      <SheetFooter className="border-t px-5 py-4 sm:px-6">
        {action.preview !== null && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={action.busy}
            onClick={callbacks.onChangeActionDetails}
          >
            {t("orderControl.changeDestination")}
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
            ? t("orderControl.reviewMove")
            : action.preview.confirmationLabel}
        </Button>
      </SheetFooter>
    </>
  )
}

const exceptionCopy = {
  leave_behind: {
    titleKey: "orderControl.leaveTitle",
    descriptionKey: "orderControl.leaveDescription",
    icon: IconPackageExport,
  },
  rework: {
    titleKey: "orderControl.reworkTitle",
    descriptionKey: "orderControl.reworkDescription",
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
  const { t } = useTranslation()
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-5 px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-fit px-0 hover:bg-transparent"
            disabled={action.busy}
            onClick={callbacks.onCancelAction}
          >
            <IconArrowLeft data-icon="inline-start" />
            {t("orderControl.backToOrder")}
          </Button>
          <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
            <Icon />
            <AlertTitle>{t(copy.titleKey)}</AlertTitle>
            <AlertDescription>{t(copy.descriptionKey)}</AlertDescription>
          </Alert>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="order-exception-reason">
                {t("orderControl.reason")}
              </FieldLabel>
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
                  {t("orderControl.chooseWhatHappened")}
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
                {t("orderControl.resumeAt")}
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
                  {t("orderControl.chooseNextStage")}
                </NativeSelectOption>
                {action.restartStageOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                {t("orderControl.physicalTruth")}
              </FieldDescription>
            </Field>
            <Alert>
              <IconStack2 />
              <AlertTitle>{t("orderControl.nextCompatibleBatch")}</AlertTitle>
              <AlertDescription>
                {t("orderControl.nextCompatibleDescription")}
              </AlertDescription>
            </Alert>
            <Field>
              <FieldLabel htmlFor="order-exception-note">
                {t("orderControl.floorNote")}
                {action.draft.reason === "other"
                  ? ""
                  : ` (${t("orderControl.optional")})`}
              </FieldLabel>
              <Textarea
                id="order-exception-note"
                value={action.draft.note}
                disabled={locked}
                maxLength={500}
                placeholder={t("orderControl.notePlaceholder")}
                onChange={(event) =>
                  callbacks.onExceptionDraftChange({
                    ...action.draft,
                    note: event.target.value,
                  })
                }
              />
              {missingOtherNote && (
                <FieldDescription>
                  {t("orderControl.otherNoteRequired")}
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
          {action.preview !== null && <PreviewCard preview={action.preview} />}
          <ActionError error={action.error} />
        </div>
      </ScrollArea>
      <SheetFooter className="border-t px-5 py-4 sm:px-6">
        {action.preview !== null && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={action.busy}
            onClick={callbacks.onChangeActionDetails}
          >
            {t("orderControl.changeDetails")}
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
            ? t("orderControl.reviewFloorChange")
            : action.preview.confirmationLabel}
        </Button>
      </SheetFooter>
    </>
  )
}

function ArchiveActionView({
  order,
  action,
  callbacks,
}: Readonly<{
  order: OrderControlOrder
  action: OrderArchiveAction
  callbacks: OrderControlCallbacks
}>) {
  const { t } = useTranslation()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const missingOtherNote =
    action.draft.reason === "other" && action.draft.note.trim().length === 0
  const needsFactConfirmation =
    action.requiresExplicitReview && !action.draft.confirmedFacts
  const canConfirm =
    action.draft.reason.length > 0 &&
    !missingOtherNote &&
    !needsFactConfirmation &&
    !action.busy

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-5 px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-fit px-0 hover:bg-transparent"
            disabled={action.busy}
            onClick={callbacks.onCancelAction}
          >
            <IconArrowLeft data-icon="inline-start" />
            {t("orderControl.backToOrder")}
          </Button>

          <Alert>
            <IconArchive />
            <AlertTitle>{t("orderControl.archiveKeepsHistory")}</AlertTitle>
            <AlertDescription>
              {t("orderControl.archiveKeepsHistoryDetail")}
            </AlertDescription>
          </Alert>

          <Card className="gap-1 bg-muted/35 py-4">
            <CardContent className="px-4">
              <p className="text-sm font-medium">
                {t("orderControl.orderNumber", {
                  orderId: order.externalOrderId,
                })}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {order.customerLabel}
              </p>
            </CardContent>
          </Card>

          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="order-archive-reason">
                {t("orderControl.archiveReason")}
              </FieldLabel>
              <NativeSelect
                id="order-archive-reason"
                className="w-full [&_[data-slot=native-select]]:h-11"
                value={action.draft.reason}
                disabled={action.busy}
                onChange={(event) =>
                  callbacks.onArchiveDraftChange({
                    ...action.draft,
                    reason: event.target.value,
                  })
                }
              >
                {action.reasonOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="order-archive-note">
                {t("orderControl.archiveNote")}
                {action.draft.reason === "other"
                  ? ""
                  : ` (${t("orderControl.optional")})`}
              </FieldLabel>
              <Textarea
                id="order-archive-note"
                value={action.draft.note}
                disabled={action.busy}
                maxLength={500}
                placeholder={t("orderControl.archiveNotePlaceholder")}
                onChange={(event) =>
                  callbacks.onArchiveDraftChange({
                    ...action.draft,
                    note: event.target.value,
                  })
                }
              />
              {missingOtherNote && (
                <FieldDescription>
                  {t("orderControl.otherNoteRequired")}
                </FieldDescription>
              )}
            </Field>

            {action.requiresExplicitReview && (
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">
                  {t("orderControl.archiveReviewFacts")}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {action.reviewReasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <span aria-hidden="true">·</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={action.draft.confirmedFacts}
                    disabled={action.busy}
                    onCheckedChange={(checked) =>
                      callbacks.onArchiveDraftChange({
                        ...action.draft,
                        confirmedFacts: checked === true,
                      })
                    }
                  />
                  <span>{t("orderControl.archiveFactsConfirmed")}</span>
                </label>
              </div>
            )}
          </FieldGroup>
          <ActionError error={action.error} />
        </div>
      </ScrollArea>
      <SheetFooter className="border-t px-5 py-4 sm:px-6">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={action.busy}
          onClick={callbacks.onCancelAction}
        >
          {t("common.cancel")}
        </Button>
        <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <Button
            type="button"
            className="h-11"
            disabled={!canConfirm}
            onClick={() => setConfirmationOpen(true)}
          >
            <IconArchive data-icon="inline-start" />
            {t("orderControl.reviewArchive")}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("orderControl.confirmArchiveTitle", {
                  order: order.externalOrderId,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("orderControl.confirmArchiveDetail", {
                  customer: order.customerLabel,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={action.busy}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="default"
                disabled={action.busy}
                onClick={callbacks.onConfirmArchive}
              >
                {action.busy && <Spinner data-icon="inline-start" />}
                {t("orderControl.archiveFromActive")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
  const { t } = useTranslation()
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-5 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{order.statusLabel}</Badge>
            {order.priority && <Badge>{t("orderControl.priority")}</Badge>}
            {order.position.membership === "frozen" && (
              <Badge variant="outline">
                <IconLock data-icon="inline-start" /> {t("orderControl.frozen")}
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
                {t("orderControl.floorPosition")}
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
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact
                label={t("orderControl.commercialState")}
                value={order.commercialStateLabel}
              />
              <Fact
                label={t("orderControl.productionAdmission")}
                value={order.admissionStateLabel}
              />
              <Fact label={t("orderControl.due")} value={order.dueLabel} />
              <Fact
                label={t("orderControl.demand")}
                value={order.weightLabel}
              />
              <Fact label={t("orderControl.bags")} value={order.bagLabel} />
              <Fact
                label={t("orderControl.updatedLabel")}
                value={order.lastUpdatedLabel}
              />
            </dl>
          </section>

          {order.placement !== null && (
            <section aria-labelledby="order-placement-heading">
              <h3 id="order-placement-heading" className="text-sm font-medium">
                {t("orderControl.placement")}
              </h3>
              <div className="mt-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{order.placement.label}</p>
                  {order.placement.pinned && (
                    <Badge variant="outline">{t("orderControl.pinned")}</Badge>
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
              {t("orderControl.orderActions")}
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
                  {t("orderControl.moveToQueued")}
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
                  {t("orderControl.leaveBehind")}
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
                  {t("orderControl.sendToRework")}
                </Button>
                <ActionReason>{order.rework.reason}</ActionReason>
              </div>
              <Separator className="my-1" />
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start"
                  disabled={!order.archive.available}
                  onClick={() => callbacks.onStartArchive(order.id)}
                >
                  <IconArchive data-icon="inline-start" />
                  {t("orderControl.archiveFromActive")}
                </Button>
                <ActionReason>{order.archive.reason}</ActionReason>
              </div>
            </div>
          </section>

          <section aria-labelledby="order-customer-heading">
            <div className="flex items-center gap-2">
              <IconUser className="size-4 text-muted-foreground" />
              <h3 id="order-customer-heading" className="text-sm font-medium">
                {t("orderControl.customerAndOrder")}
              </h3>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact
                label={t("orderControl.customer")}
                value={order.customerLabel}
              />
              <Fact label={t("orderControl.phone")} value={order.phoneLabel} />
            </dl>
          </section>

          {order.audit.length > 0 && (
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                {t("orderControl.recentOrderActivity")}
              </summary>
              <ul className="divide-y border-t">
                {order.audit.map((entry) => (
                  <li key={entry.key} className="px-4 py-2.5">
                    <p className="text-sm font-medium">{entry.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </ScrollArea>
      <SheetFooter className="border-t px-5 py-4 sm:px-6">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={callbacks.onCloseOrder}
        >
          {t("common.close")}
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
  const { t } = useTranslation()
  const title =
    action.kind === "archive"
      ? t("orderControl.archiveTitle")
      : action.kind === "move"
        ? t("orderControl.moveTitle")
        : action.kind === "leave_behind"
          ? t("orderControl.leaveOrderTitle")
          : action.kind === "rework"
            ? t("orderControl.recordReworkTitle")
            : order === null
              ? t("orderControl.detailsTitle")
              : t("orderControl.orderNumber", {
                  orderId: order.externalOrderId,
                })

  return (
    <Sheet
      open={order !== null}
      onOpenChange={(open) => {
        if (!open) callbacks.onCloseOrder()
      }}
    >
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        size="workspace"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b px-5 py-4 pe-16 sm:px-6 sm:pe-16">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {order === null
              ? t("orderControl.reviewRecord")
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
        {order !== null && action.kind === "archive" && (
          <ArchiveActionView
            order={order}
            action={action}
            callbacks={callbacks}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
