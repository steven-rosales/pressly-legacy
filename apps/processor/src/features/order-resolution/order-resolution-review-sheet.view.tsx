import { useId, useState } from "react"
import { enUS, es } from "date-fns/locale"
import {
  IconAlertTriangle,
  IconArchive,
  IconArrowRight,
  IconCalendarEvent,
  IconCheck,
  IconHistory,
  IconRefresh,
  IconShieldLock,
} from "@tabler/icons-react"
import type {
  ProcessorProductionOrderBacklogPreview,
  ProcessorProductionOrderBacklogPreviewItem,
  ProductionOrderBacklogCategory,
} from "@pressly/contracts"
import { OperationalOrderIdentity } from "@/components/orders/operational-order-identity"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { DelayedLoadingRows } from "@/components/ui/delayed-loading-rows"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useIsMobile } from "@/components/ui/use-mobile"
import type {
  OrderResolutionReviewCopy,
  OrderResolutionReviewModel,
  OrderResolutionReviewScope,
  OrderResolutionReviewSheetProps,
} from "./order-resolution-review.model"
import {
  toOrderResolutionCommitRequest,
  toOrderResolutionPreviewRequest,
  validateOrderResolutionReviewScope,
} from "./order-resolution-review.presenter"

const groupOrder = [
  "ready_to_archive",
  "review_individually",
  "kept_for_safety",
  "already_historical",
] as const satisfies readonly ProductionOrderBacklogCategory[]

const groupItems = (
  preview: ProcessorProductionOrderBacklogPreview,
  category: ProductionOrderBacklogCategory
) => {
  switch (category) {
    case "ready_to_archive":
      return preview.groups.readyToArchive
    case "review_individually":
      return preview.groups.reviewIndividually
    case "kept_for_safety":
      return preview.groups.keptForSafety
    case "already_historical":
      return preview.groups.alreadyHistorical
  }
}

const formatDate = (
  date: Date | string,
  locale: string,
  timezone: string,
  includeTime: boolean
) => {
  const parsed = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(parsed.valueOf())) return String(date)

  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(parsed)
}

function ScopeFields({
  scope,
  copy,
  locale,
  timezone,
  disabled,
  onScopeChange,
}: Readonly<{
  scope: OrderResolutionReviewScope
  copy: OrderResolutionReviewCopy
  locale: string
  timezone: string
  disabled: boolean
  onScopeChange: (scope: OrderResolutionReviewScope) => void
}>) {
  const generatedId = useId()
  const cutoffId = `${generatedId}-cutoff`
  const reasonId = `${generatedId}-reason`
  const noteId = `${generatedId}-note`
  const validation = validateOrderResolutionReviewScope(scope)
  const cutoffLabel =
    scope.cutoffDate === undefined
      ? copy.cutoffPlaceholder
      : formatDate(scope.cutoffDate, locale, timezone, false)

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby={`${generatedId}-scope-title`}
    >
      <h3 id={`${generatedId}-scope-title`} className="text-sm font-medium">
        {copy.scopeTitle}
      </h3>
      <FieldGroup>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor={cutoffId}>{copy.cutoffLabel}</FieldLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id={cutoffId}
                type="button"
                variant="outline"
                className="h-11 w-full justify-start px-3 font-normal"
                disabled={disabled}
                aria-label={`${copy.cutoffLabel}: ${cutoffLabel}`}
              >
                <IconCalendarEvent data-icon="inline-start" />
                <span className="truncate">{cutoffLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              collisionPadding={8}
              className="w-[calc(100vw-1rem)] max-w-[22rem] p-3"
            >
              <PopoverHeader>
                <PopoverTitle>{copy.cutoffPopoverTitle}</PopoverTitle>
                <PopoverDescription>
                  {copy.cutoffPopoverDescription}
                </PopoverDescription>
              </PopoverHeader>
              <Calendar
                mode="single"
                locale={locale.startsWith("es") ? es : enUS}
                selected={scope.cutoffDate}
                defaultMonth={scope.cutoffDate}
                onSelect={(cutoffDate) => {
                  if (cutoffDate !== undefined)
                    onScopeChange({
                      ...scope,
                      cutoff: "",
                      cutoffDate,
                    })
                }}
                className="mx-auto w-fit max-w-full p-0 [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(11)]"
                classNames={{
                  month: "flex w-full flex-col gap-2",
                  week: "mt-1 flex w-full",
                }}
              />
            </PopoverContent>
          </Popover>
        </Field>

        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor={reasonId}>{copy.reasonLabel}</FieldLabel>
          <Select
            value={scope.reason}
            disabled={disabled}
            onValueChange={(reason) =>
              onScopeChange({
                ...scope,
                reason: reason as OrderResolutionReviewScope["reason"],
              })
            }
          >
            <SelectTrigger
              id={reasonId}
              className="h-11 w-full"
              aria-required="true"
            >
              <SelectValue placeholder={copy.reasonPlaceholder} />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {Object.entries(copy.reasonOptions).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="h-11">
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field
          data-disabled={disabled || undefined}
          data-invalid={validation.otherNoteMissing || undefined}
        >
          <FieldLabel htmlFor={noteId}>{copy.noteLabel}</FieldLabel>
          <Textarea
            id={noteId}
            value={scope.note}
            maxLength={500}
            rows={3}
            disabled={disabled}
            required={scope.reason === "other"}
            aria-invalid={validation.otherNoteMissing || undefined}
            placeholder={copy.notePlaceholder}
            onChange={(event) =>
              onScopeChange({ ...scope, note: event.target.value })
            }
          />
          <FieldDescription>{copy.noteDescription}</FieldDescription>
          {validation.otherNoteMissing && (
            <FieldError>{copy.otherNoteRequired}</FieldError>
          )}
        </Field>
      </FieldGroup>
    </section>
  )
}

function CandidateItem({
  item,
  category,
  copy,
  locale,
  timezone,
  actionsEnabled,
  individualBusy,
  onReview,
  onOpenHistory,
}: Readonly<{
  item: ProcessorProductionOrderBacklogPreviewItem
  category: ProductionOrderBacklogCategory
  copy: OrderResolutionReviewCopy
  locale: string
  timezone: string
  actionsEnabled: boolean
  individualBusy: boolean
  onReview: (item: ProcessorProductionOrderBacklogPreviewItem) => void
  onOpenHistory: (orderId: string) => void
}>) {
  return (
    <Item
      variant="outline"
      role="listitem"
      className="grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none break-words">
          <OperationalOrderIdentity
            identity={item.identity}
            className="max-w-full"
          />
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {copy.orderDue(formatDate(item.dueAt, locale, timezone, true))}
        </ItemDescription>
        <div
          className="flex min-w-0 flex-wrap gap-1.5"
          aria-label={copy.groups[category].description}
        >
          {item.reasons.map((reason) => (
            <Badge key={reason} variant="secondary" className="h-auto">
              <span className="whitespace-normal">
                {copy.classificationReasons[reason]}
              </span>
            </Badge>
          ))}
        </div>
      </ItemContent>
      {category === "review_individually" && (
        <ItemActions className="w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={!actionsEnabled || individualBusy}
            aria-busy={individualBusy}
            aria-label={copy.reviewOrder(item.displayReference)}
            onClick={() => onReview(item)}
          >
            {individualBusy && <Spinner data-icon="inline-start" />}
            {copy.reviewOrder(item.displayReference)}
          </Button>
        </ItemActions>
      )}
      {category === "already_historical" && (
        <ItemActions className="w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={!actionsEnabled}
            aria-label={copy.openInHistory(item.displayReference)}
            onClick={() => onOpenHistory(item.orderId)}
          >
            <IconHistory data-icon="inline-start" />
            {copy.openInHistory(item.displayReference)}
          </Button>
        </ItemActions>
      )}
    </Item>
  )
}

function PreviewGroups({
  model,
  preview,
  copy,
  locale,
  timezone,
  actionsEnabled,
  onReview,
  onOpenHistory,
}: Readonly<{
  model: OrderResolutionReviewModel
  preview: ProcessorProductionOrderBacklogPreview
  copy: OrderResolutionReviewCopy
  locale: string
  timezone: string
  actionsEnabled: boolean
  onReview: (item: ProcessorProductionOrderBacklogPreviewItem) => void
  onOpenHistory: (orderId: string) => void
}>) {
  return (
    <section className="flex flex-col gap-3" aria-label={copy.sheetTitle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">
            {copy.candidateSummary(preview.candidateCount)}
          </h3>
          <p className="text-xs text-muted-foreground">
            {copy.previewGenerated(
              formatDate(preview.generatedAt, locale, timezone, true)
            )}
          </p>
        </div>
        <Badge variant="secondary">
          {copy.groupCount(preview.candidateCount)}
        </Badge>
      </div>

      {preview.hasMore && (
        <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
          <IconAlertTriangle />
          <AlertTitle>{copy.previewLimitedTitle}</AlertTitle>
          <AlertDescription>
            {copy.previewLimitedDescription(preview.maxOrders)}
          </AlertDescription>
        </Alert>
      )}

      <Accordion
        type="multiple"
        defaultValue={["ready_to_archive", "review_individually"]}
        className="rounded-xl border px-3"
      >
        {groupOrder.map((category) => {
          const items = groupItems(preview, category)
          return (
            <AccordionItem key={category} value={category}>
              <AccordionTrigger className="min-h-11 no-underline hover:no-underline">
                <span className="flex min-w-0 items-start gap-2 pe-2">
                  <span className="min-w-0">
                    <span className="block">{copy.groups[category].title}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {copy.groups[category].description}
                    </span>
                  </span>
                  <Badge variant="secondary">
                    {copy.groupCount(items.length)}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {items.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    {copy.groupCount(0)}
                  </p>
                ) : (
                  <ItemGroup className="gap-2 pb-1">
                    {items.map((item) => (
                      <CandidateItem
                        key={item.orderId}
                        item={item}
                        category={category}
                        copy={copy}
                        locale={locale}
                        timezone={timezone}
                        actionsEnabled={actionsEnabled}
                        individualBusy={
                          model.status === "preview" &&
                          model.individual.status === "submitting" &&
                          model.individual.orderId === item.orderId
                        }
                        onReview={onReview}
                        onOpenHistory={onOpenHistory}
                      />
                    ))}
                  </ItemGroup>
                )}
                {category === "review_individually" &&
                  model.status === "preview" &&
                  model.individual.status === "error" && (
                    <Alert variant="destructive" role="alert" className="mt-2">
                      <IconAlertTriangle />
                      <AlertTitle>{copy.individualErrorTitle}</AlertTitle>
                      <AlertDescription>
                        {model.individual.message}
                      </AlertDescription>
                    </Alert>
                  )}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </section>
  )
}

function ReviewSuccess({
  model,
  copy,
  onOpenHistory,
  onReviewAnother,
}: Readonly<{
  model: Extract<OrderResolutionReviewModel, { status: "success" }>
  copy: OrderResolutionReviewCopy
  onOpenHistory: () => void
  onReviewAnother: () => void
}>) {
  const hasNextPage = model.result.nextCursor !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 items-center px-5 py-8">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconCheck />
            </EmptyMedia>
            <EmptyTitle>
              {hasNextPage ? copy.successNextPageTitle : copy.successTitle}
            </EmptyTitle>
            <EmptyDescription>
              {hasNextPage
                ? copy.successNextPageDescription(model.result.resolvedCount)
                : copy.successDescription(model.result.resolvedCount)}
            </EmptyDescription>
          </EmptyHeader>
          {model.result.replayed && (
            <EmptyContent>
              <Badge variant="secondary">{copy.replayed}</Badge>
              <p className="text-sm text-muted-foreground">
                {copy.replayDescription}
              </p>
            </EmptyContent>
          )}
        </Empty>
      </div>
      <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={onReviewAnother}
        >
          <IconRefresh data-icon="inline-start" />
          {hasNextPage ? copy.reviewNextPage : copy.reviewAnotherCutoff}
        </Button>
        <Button type="button" className="h-11" onClick={onOpenHistory}>
          <IconHistory data-icon="inline-start" />
          {copy.openHistory}
        </Button>
      </SheetFooter>
    </div>
  )
}

export function OrderResolutionReviewSheet({
  canManage,
  open,
  locale,
  timezone,
  scope,
  model,
  copy,
  callbacks,
}: OrderResolutionReviewSheetProps) {
  const isMobile = useIsMobile()
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [individualCandidate, setIndividualCandidate] =
    useState<ProcessorProductionOrderBacklogPreviewItem | null>(null)
  const [individualAcknowledged, setIndividualAcknowledged] = useState(false)
  const validation = validateOrderResolutionReviewScope(scope)
  const preview =
    model.status === "preview" ||
    model.status === "committing" ||
    model.status === "drift"
      ? model.preview
      : model.status === "error"
        ? model.preview
        : null
  const readyCount = preview?.groups.readyToArchive.length ?? 0
  const nextPreviewCursor = preview?.nextCursor ?? null
  const actionsEnabled = model.status === "preview"
  const busy = model.status === "loading" || model.status === "committing"

  if (!canManage) return null

  const requestPreview = () => {
    const request = toOrderResolutionPreviewRequest(scope)
    if (request !== null) callbacks.onPreview(request)
  }

  const requestCommit = () => {
    if (preview === null) return
    const request = toOrderResolutionCommitRequest(
      scope,
      preview.previewHash,
      preview.cursor
    )
    if (request !== null) callbacks.onCommit(request)
  }

  const setOpen = (nextOpen: boolean) => {
    if (busy && !nextOpen) return
    if (!nextOpen) {
      setBulkConfirmOpen(false)
      setIndividualCandidate(null)
      setIndividualAcknowledged(false)
    }
    callbacks.onOpenChange(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-11">
          <IconArchive data-icon="inline-start" />
          {copy.trigger}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        size="workspace"
        closeLabel={copy.close}
        className="overflow-x-hidden"
      >
        <SheetHeader className="border-b px-5 py-4 pe-16">
          <SheetTitle>{copy.sheetTitle}</SheetTitle>
          <SheetDescription>{copy.sheetDescription}</SheetDescription>
        </SheetHeader>

        {model.status === "success" ? (
          <ReviewSuccess
            model={model}
            copy={copy}
            onOpenHistory={() => callbacks.onOpenHistory()}
            onReviewAnother={callbacks.onReviewAnother}
          />
        ) : (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex min-w-0 flex-col gap-5 px-5 py-4">
                <Alert>
                  <IconShieldLock />
                  <AlertTitle>{copy.archiveExplanationTitle}</AlertTitle>
                  <AlertDescription>{copy.archiveExplanation}</AlertDescription>
                </Alert>

                <ScopeFields
                  scope={scope}
                  copy={copy}
                  locale={locale}
                  timezone={timezone}
                  disabled={busy}
                  onScopeChange={callbacks.onScopeChange}
                />

                {model.status === "loading" && (
                  <DelayedLoadingRows label={copy.loading} count={4} />
                )}

                {model.status === "drift" && (
                  <Alert
                    className="border-warning-foreground/20 bg-warning text-warning-foreground"
                    role="alert"
                  >
                    <IconRefresh />
                    <AlertTitle>{copy.driftTitle}</AlertTitle>
                    <AlertDescription>
                      {model.message} {copy.driftDescription}
                    </AlertDescription>
                  </Alert>
                )}

                {model.status === "error" && (
                  <Alert variant="destructive" role="alert">
                    <IconAlertTriangle />
                    <AlertTitle>{copy.previewErrorTitle}</AlertTitle>
                    <AlertDescription>{model.message}</AlertDescription>
                  </Alert>
                )}

                {preview !== null &&
                  (preview.candidateCount === 0 ? (
                    <Empty className="min-h-52 border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <IconCheck />
                        </EmptyMedia>
                        <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
                        <EmptyDescription>
                          {copy.emptyDescription}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <PreviewGroups
                      model={model}
                      preview={preview}
                      copy={copy}
                      locale={locale}
                      timezone={timezone}
                      actionsEnabled={actionsEnabled}
                      onReview={(item) => {
                        setIndividualCandidate(item)
                        setIndividualAcknowledged(false)
                      }}
                      onOpenHistory={(orderId) =>
                        callbacks.onOpenHistory(orderId)
                      }
                    />
                  ))}
              </div>
            </ScrollArea>

            <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end">
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={busy}
                >
                  {copy.cancel}
                </Button>
              </SheetClose>

              {(model.status === "drift" || model.status === "error") && (
                <Button
                  type="button"
                  className="h-11"
                  disabled={!validation.valid || busy}
                  onClick={requestPreview}
                >
                  <IconRefresh data-icon="inline-start" />
                  {model.status === "drift" ? copy.refreshPreview : copy.retry}
                </Button>
              )}

              {(model.status === "idle" || model.status === "loading") && (
                <Button
                  type="button"
                  className="h-11"
                  disabled={!validation.valid || busy}
                  aria-busy={model.status === "loading"}
                  onClick={requestPreview}
                >
                  {model.status === "loading" && (
                    <Spinner data-icon="inline-start" />
                  )}
                  {copy.reviewOrders}
                </Button>
              )}

              {(model.status === "preview" ||
                model.status === "committing") && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={busy}
                    onClick={requestPreview}
                  >
                    <IconRefresh data-icon="inline-start" />
                    {copy.refreshPreview}
                  </Button>
                  {nextPreviewCursor !== null && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={busy}
                      onClick={() => callbacks.onPreviewNext(nextPreviewCursor)}
                    >
                      {copy.reviewNextPage}
                      <IconArrowRight data-icon="inline-end" />
                    </Button>
                  )}
                  {readyCount > 0 && (
                    <Button
                      type="button"
                      className="h-11"
                      disabled={!actionsEnabled || busy}
                      aria-busy={model.status === "committing"}
                      onClick={() => setBulkConfirmOpen(true)}
                    >
                      {model.status === "committing" && (
                        <Spinner data-icon="inline-start" />
                      )}
                      {copy.archiveReady(readyCount)}
                    </Button>
                  )}
                </>
              )}
            </SheetFooter>
          </>
        )}

        <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <IconArchive />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {copy.bulkConfirmTitle(readyCount)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {copy.bulkConfirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="text-sm text-muted-foreground">
              {copy.bulkConfirmScope(
                readyCount,
                scope.cutoffDate === undefined
                  ? copy.cutoffPlaceholder
                  : formatDate(scope.cutoffDate, locale, timezone, false)
              )}
            </p>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">
                {copy.cancel}
              </AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={requestCommit}>
                {copy.bulkConfirmAction}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={individualCandidate !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setIndividualCandidate(null)
              setIndividualAcknowledged(false)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <IconShieldLock />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {individualCandidate === null
                  ? copy.sheetTitle
                  : copy.individualConfirmTitle(
                      individualCandidate.displayReference
                    )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {copy.individualConfirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {individualCandidate !== null && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {individualCandidate.reasons.map((reason) => (
                    <Badge key={reason} variant="secondary" className="h-auto">
                      <span className="whitespace-normal">
                        {copy.classificationReasons[reason]}
                      </span>
                    </Badge>
                  ))}
                </div>
                <Field orientation="horizontal">
                  <Checkbox
                    id="confirm-reviewed-order-facts"
                    checked={individualAcknowledged}
                    onCheckedChange={(checked) =>
                      setIndividualAcknowledged(checked === true)
                    }
                  />
                  <FieldLabel htmlFor="confirm-reviewed-order-facts">
                    {copy.individualAcknowledgement}
                  </FieldLabel>
                </Field>
              </>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">
                {copy.cancel}
              </AlertDialogCancel>
              <AlertDialogAction
                className="h-11"
                disabled={
                  individualCandidate === null ||
                  !individualAcknowledged ||
                  scope.reason === ""
                }
                onClick={() => {
                  if (
                    individualCandidate === null ||
                    !individualAcknowledged ||
                    scope.reason === ""
                  )
                    return
                  callbacks.onResolveIndividually({
                    item: individualCandidate,
                    command: {
                      action: "resolve_without_production",
                      reason: scope.reason,
                      note:
                        scope.note.trim().length === 0
                          ? null
                          : scope.note.trim(),
                      confirmReviewedFacts: true,
                    },
                  })
                }}
              >
                {copy.bulkConfirmAction}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}
