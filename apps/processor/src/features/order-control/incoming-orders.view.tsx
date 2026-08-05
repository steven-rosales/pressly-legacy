import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCircleCheck,
  IconInbox,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { WorkspaceSectionHeading as SectionHeading } from "@/components/layout/workspace-section-heading"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { DelayedLoadingRows } from "@/components/ui/delayed-loading-rows"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { IncomingOrderProposal } from "@/ports/order-management.port"
import {
  useIncomingOrdersModel,
  type IncomingOrderAction,
  type IncomingOrdersModelInput,
} from "./incoming-orders.model"

const localeForLanguage = (language: string | undefined): string =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

const formatDate = (value: string, timezone: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

const sourceLabel = (source: string): string => {
  const normalized = source.trim().toLocaleLowerCase().replaceAll("_", " ")
  if (normalized.length === 0) return source
  return normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1)
}

function IncomingOrderIdentity({
  proposal,
}: Readonly<{ proposal: IncomingOrderProposal }>) {
  const { t } = useTranslation()
  const detail = [proposal.customer?.phone, proposal.customer?.email]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(" · ")

  return (
    <div className="min-w-0">
      <p className="truncate font-medium">
        {t("orderControl.manageOrders.order", {
          order: proposal.displayNumber ?? proposal.externalOrderId,
        })}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {proposal.customer?.displayName ??
          t("orderControl.manageOrders.customerUnavailable")}
        {detail.length === 0 ? "" : ` · ${detail}`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("orderControl.manageOrders.reportedBy", {
          source: sourceLabel(proposal.source),
        })}
      </p>
      {proposal.sourceClosure != null && (
        <div className="mt-2 space-y-1">
          <Badge variant="secondary">
            {t("orderControl.manageOrders.sourceClosedBadge", {
              source: sourceLabel(proposal.source),
            })}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {t(
              proposal.sourceClosure.kind === "completed"
                ? "orderControl.manageOrders.sourceClosedCompleted"
                : "orderControl.manageOrders.sourceClosedCanceled",
              { source: sourceLabel(proposal.source) }
            )}
          </p>
        </div>
      )}
    </div>
  )
}

function IncomingOrderActions({
  proposal,
  busyAction,
  onAccept,
  onReject,
  onRestore,
}: Readonly<{
  proposal: IncomingOrderProposal
  busyAction: IncomingOrderAction | null
  onAccept: (trigger: HTMLButtonElement) => void
  onReject: (trigger: HTMLButtonElement) => void
  onRestore: (trigger: HTMLButtonElement) => void
}>) {
  const { t } = useTranslation()
  const busy = busyAction !== null
  const order = proposal.displayNumber ?? proposal.externalOrderId
  const canAccept = proposal.availableActions.includes("accept")
  const canReject = proposal.availableActions.includes("reject")
  const canRestore = proposal.availableActions.includes("restore")

  return (
    <div className="flex flex-col gap-2">
      {proposal.acceptBlockedReason === "exact_order_exists" && (
        <p className="text-xs text-muted-foreground sm:text-end">
          {t("orderControl.manageOrders.acceptBlocked.exactOrderExists")}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {canRestore && (
          <Button
            type="button"
            className="h-11"
            disabled={busy}
            aria-label={t("orderControl.manageOrders.restoreOrder", { order })}
            onClick={(event) => onRestore(event.currentTarget)}
          >
            {busyAction === "restore" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconArrowBackUp data-icon="inline-start" />
            )}
            {t("orderControl.manageOrders.restore")}
          </Button>
        )}
        {!canRestore && (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy || !canReject}
              aria-label={t("orderControl.manageOrders.rejectOrder", { order })}
              onClick={(event) => onReject(event.currentTarget)}
            >
              {busyAction === "reject" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconX data-icon="inline-start" />
              )}
              {t("orderControl.manageOrders.reject")}
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={busy || !canAccept}
              aria-label={t("orderControl.manageOrders.acceptOrder", { order })}
              onClick={(event) => onAccept(event.currentTarget)}
            >
              {busyAction === "accept" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconCircleCheck data-icon="inline-start" />
              )}
              {t("orderControl.manageOrders.accept")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function IncomingOrdersTable({
  proposals,
  timezone,
  locale,
  busy,
  onAccept,
  onReject,
  onRestore,
}: Readonly<{
  proposals: readonly IncomingOrderProposal[]
  timezone: string
  locale: string
  busy: Readonly<{
    proposalId: string
    action: IncomingOrderAction
  }> | null
  onAccept: (
    proposal: IncomingOrderProposal,
    trigger: HTMLButtonElement
  ) => void
  onReject: (
    proposal: IncomingOrderProposal,
    trigger: HTMLButtonElement
  ) => void
  onRestore: (
    proposal: IncomingOrderProposal,
    trigger: HTMLButtonElement
  ) => void
}>) {
  const { t } = useTranslation()
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-background lg:block">
        <Table>
          <TableCaption className="sr-only">
            {t("orderControl.manageOrders.tableLabel")}
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-72 px-4">
                {t("orderControl.manageOrders.columns.order")}
              </TableHead>
              <TableHead className="min-w-40">
                {t("orderControl.manageOrders.columns.reported")}
              </TableHead>
              <TableHead className="min-w-40">
                {t("orderControl.manageOrders.columns.due")}
              </TableHead>
              <TableHead className="min-w-28">
                {t("orderControl.manageOrders.columns.demand")}
              </TableHead>
              <TableHead className="min-w-80 px-4 text-end">
                {t("orderControl.manageOrders.columns.action")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposals.map((proposal) => {
              const busyAction =
                busy !== null && busy.proposalId === proposal.id
                  ? busy.action
                  : null
              return (
                <TableRow key={proposal.id} className="hover:bg-transparent">
                  <TableCell className="px-4 py-4 whitespace-normal">
                    <IncomingOrderIdentity proposal={proposal} />
                  </TableCell>
                  <TableCell className="py-4 whitespace-normal">
                    {formatDate(proposal.sourceReportedAt, timezone, locale)}
                  </TableCell>
                  <TableCell className="py-4 whitespace-normal">
                    {formatDate(proposal.dueAt, timezone, locale)}
                  </TableCell>
                  <TableCell className="py-4 whitespace-normal tabular-nums">
                    {proposal.estimatedWeightLbs === null
                      ? t("orderControl.manageOrders.demandUnavailable")
                      : t("common.pounds", {
                          value: proposal.estimatedWeightLbs,
                        })}
                  </TableCell>
                  <TableCell className="px-4 py-4 whitespace-normal">
                    <IncomingOrderActions
                      proposal={proposal}
                      busyAction={busyAction}
                      onAccept={(trigger) => onAccept(proposal, trigger)}
                      onReject={(trigger) => onReject(proposal, trigger)}
                      onRestore={(trigger) => onRestore(proposal, trigger)}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {proposals.map((proposal) => {
          const busyAction =
            busy !== null && busy.proposalId === proposal.id
              ? busy.action
              : null
          return (
            <Card key={proposal.id} className="gap-4 bg-background py-4">
              <CardHeader className="px-4">
                <IncomingOrderIdentity proposal={proposal} />
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-4">
                <dl className="grid grid-cols-2 gap-3 border-y py-4 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {t("orderControl.manageOrders.columns.reported")}
                    </dt>
                    <dd className="mt-1">
                      {formatDate(proposal.sourceReportedAt, timezone, locale)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {t("orderControl.manageOrders.columns.due")}
                    </dt>
                    <dd className="mt-1">
                      {formatDate(proposal.dueAt, timezone, locale)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {t("orderControl.manageOrders.columns.demand")}
                    </dt>
                    <dd className="mt-1 tabular-nums">
                      {proposal.estimatedWeightLbs === null
                        ? t("orderControl.manageOrders.demandUnavailable")
                        : t("common.pounds", {
                            value: proposal.estimatedWeightLbs,
                          })}
                    </dd>
                  </div>
                </dl>
                <IncomingOrderActions
                  proposal={proposal}
                  busyAction={busyAction}
                  onAccept={(trigger) => onAccept(proposal, trigger)}
                  onReject={(trigger) => onReject(proposal, trigger)}
                  onRestore={(trigger) => onRestore(proposal, trigger)}
                />
              </CardContent>
            </Card>
          )
        })}
      </div>
    </>
  )
}

export function IncomingOrdersWorkspace(
  input: IncomingOrdersModelInput & Readonly<{ timezone: string }>
) {
  const { t, i18n } = useTranslation()
  const model = useIncomingOrdersModel(input)
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const decisionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const decisionOrder =
    model.decision?.proposal.displayNumber ??
    model.decision?.proposal.externalOrderId ??
    t("orderControl.manageOrders.unknownOrder")

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-labelledby="incoming-orders-heading"
      aria-busy={model.loading || model.refreshing}
    >
      <SectionHeading
        titleId="incoming-orders-heading"
        title={t("orderControl.manageOrders.incomingTitle")}
        description={t("orderControl.manageOrders.incomingDescription")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={model.loading || model.refreshing}
            onClick={() => void model.refresh()}
          >
            {model.refreshing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconRefresh data-icon="inline-start" />
            )}
            {t("common.refresh")}
          </Button>
        }
      />

      <Tabs
        value={model.view}
        onValueChange={(value) =>
          model.changeView(value as "needs_review" | "source_closed")
        }
      >
        <TabsList
          aria-label={t("orderControl.manageOrders.incomingViewsLabel")}
          className="grid h-11 w-full grid-cols-2 sm:w-96"
        >
          <TabsTrigger value="needs_review">
            {t("orderControl.manageOrders.needsReview")}
          </TabsTrigger>
          <TabsTrigger value="source_closed">
            {t("orderControl.manageOrders.sourceClosed")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {model.notice !== null && (
        <Alert role="status">
          {model.notice.kind === "changed" ? (
            <IconAlertTriangle />
          ) : (
            <IconCircleCheck />
          )}
          <AlertTitle>
            {t(
              model.notice.kind === "changed"
                ? "orderControl.manageOrders.changedTitle"
                : "orderControl.manageOrders.updatedTitle"
            )}
          </AlertTitle>
          <AlertDescription>{model.notice.message}</AlertDescription>
        </Alert>
      )}

      {model.error !== null && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>{t("orderControl.manageOrders.errors.title")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{model.error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void model.refresh()}
            >
              <IconRefresh data-icon="inline-start" />
              {t("common.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {model.loading && !model.hasLoaded ? (
        <DelayedLoadingRows
          label={t("orderControl.manageOrders.loading")}
          count={4}
        />
      ) : model.items.length === 0 && model.error === null ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconInbox />
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={3}>
              {t(
                model.view === "source_closed"
                  ? "orderControl.manageOrders.sourceClosedEmptyTitle"
                  : "orderControl.manageOrders.emptyTitle"
              )}
            </EmptyTitle>
            <EmptyDescription>
              {t(
                model.view === "source_closed"
                  ? "orderControl.manageOrders.sourceClosedEmptyDescription"
                  : "orderControl.manageOrders.emptyDescription"
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : model.items.length > 0 ? (
        <>
          <IncomingOrdersTable
            proposals={model.items}
            timezone={input.timezone}
            locale={locale}
            busy={model.busy}
            onAccept={(proposal, trigger) => {
              decisionTriggerRef.current = trigger
              model.openDecision({ kind: "accept", proposal })
            }}
            onReject={(proposal, trigger) => {
              decisionTriggerRef.current = trigger
              model.openDecision({ kind: "reject", proposal })
            }}
            onRestore={(proposal, trigger) => {
              decisionTriggerRef.current = trigger
              model.openDecision({ kind: "restore", proposal })
            }}
          />
          {(model.canGoPrevious || model.canGoNext) && (
            <nav
              className="flex items-center justify-end gap-2 border-t pt-4"
              aria-label={t("orderControl.manageOrders.pages")}
            >
              <span className="me-auto text-sm text-muted-foreground">
                {t("orderControl.manageOrders.page", {
                  page: model.pageNumber,
                })}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={
                  !model.canGoPrevious || model.loading || model.refreshing
                }
                onClick={model.previousPage}
              >
                {t("common.previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={!model.canGoNext || model.loading || model.refreshing}
                onClick={model.nextPage}
              >
                {t("common.next")}
              </Button>
            </nav>
          )}
        </>
      ) : null}

      <AlertDialog
        open={model.decision !== null}
        onOpenChange={(open) => {
          if (!open) model.closeDecision()
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            const trigger = decisionTriggerRef.current
            decisionTriggerRef.current = null
            if (trigger?.isConnected !== true) return
            event.preventDefault()
            trigger.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogMedia>
              {model.decision?.kind === "reject" ? (
                <IconX />
              ) : model.decision?.kind === "restore" ? (
                <IconArrowBackUp />
              ) : (
                <IconCircleCheck />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t(
                model.decision?.kind === "reject"
                  ? "orderControl.manageOrders.rejectTitle"
                  : model.decision?.kind === "restore"
                    ? "orderControl.manageOrders.restoreTitle"
                    : "orderControl.manageOrders.acceptTitle",
                { order: decisionOrder }
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                model.decision?.kind === "reject"
                  ? "orderControl.manageOrders.rejectDescription"
                  : model.decision?.kind === "restore"
                    ? "orderControl.manageOrders.restoreDescription"
                    : "orderControl.manageOrders.acceptDescription"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {model.decision?.kind === "reject" && (
            <FieldGroup>
              <Field data-invalid={model.rejectReasonError !== null}>
                <FieldLabel htmlFor="incoming-order-reject-reason">
                  {t("orderControl.manageOrders.rejectReason")}
                </FieldLabel>
                <NativeSelect
                  id="incoming-order-reject-reason"
                  className="w-full [&_[data-slot=native-select]]:h-11"
                  value={model.rejectReason}
                  disabled={model.busy !== null}
                  aria-invalid={model.rejectReasonError !== null}
                  onChange={(event) =>
                    model.changeRejectReason(
                      event.target.value as typeof model.rejectReason
                    )
                  }
                >
                  <NativeSelectOption value="">
                    {t("orderControl.manageOrders.chooseRejectReason")}
                  </NativeSelectOption>
                  <NativeSelectOption value="already_handled">
                    {t(
                      "orderControl.manageOrders.rejectReasons.alreadyHandled"
                    )}
                  </NativeSelectOption>
                  <NativeSelectOption value="duplicate_order">
                    {t("orderControl.manageOrders.rejectReasons.duplicate")}
                  </NativeSelectOption>
                  <NativeSelectOption value="not_pressly_work">
                    {t("orderControl.manageOrders.rejectReasons.notPressly")}
                  </NativeSelectOption>
                  <NativeSelectOption value="manager_rejected">
                    {t("orderControl.manageOrders.rejectReasons.manager")}
                  </NativeSelectOption>
                </NativeSelect>
                <FieldError>{model.rejectReasonError}</FieldError>
              </Field>
            </FieldGroup>
          )}

          {model.decisionError !== null && (
            <Alert variant="destructive" role="alert">
              <IconAlertTriangle />
              <AlertDescription>{model.decisionError}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={model.busy !== null}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={
                model.decision?.kind === "reject" ? "destructive" : "default"
              }
              disabled={model.busy !== null}
              onClick={(event) => {
                event.preventDefault()
                void model.confirmDecision()
              }}
            >
              {model.busy !== null && <Spinner data-icon="inline-start" />}
              {t(
                model.decision?.kind === "reject"
                  ? "orderControl.manageOrders.confirmReject"
                  : model.decision?.kind === "restore"
                    ? "orderControl.manageOrders.confirmRestore"
                    : "orderControl.manageOrders.confirmAccept"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
