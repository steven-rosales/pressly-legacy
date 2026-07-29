import { useState } from "react"
import { useTranslation } from "react-i18next"
import { IconArchive } from "@tabler/icons-react"
import type { TFunction } from "i18next"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import { RequestFailure } from "@/ports/request.error"
import {
  defaultOrderResolutionCutoffDate,
  orderResolutionCutoffIso,
} from "./order-resolution-cutoff.presenter"
import { toOrderResolutionPreviewRequest } from "./order-resolution-review.presenter"
import { OrderResolutionReviewSheet } from "./order-resolution-review-sheet.view"
import type {
  OrderResolutionIndividualRequest,
  OrderResolutionPreviewRequest,
  OrderResolutionReviewCopy,
  OrderResolutionReviewModel,
  OrderResolutionReviewScope,
} from "./order-resolution-review.model"

const localeForLanguage = (language: string | undefined): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

const initialScope = (
  timezone: string,
  now: Date
): OrderResolutionReviewScope => {
  const cutoffDate = defaultOrderResolutionCutoffDate(timezone, now)
  return {
    filter: "all_due_before_cutoff",
    cutoffDate,
    cutoff: orderResolutionCutoffIso(cutoffDate, timezone) ?? "",
    reason: "",
    note: "",
    maxOrders: 250,
  }
}

const copyFor = (t: TFunction): OrderResolutionReviewCopy => ({
  trigger: t("orderResolution.trigger"),
  sheetTitle: t("orderResolution.sheetTitle"),
  sheetDescription: t("orderResolution.sheetDescription"),
  archiveExplanationTitle: t("orderResolution.archiveExplanationTitle"),
  archiveExplanation: t("orderResolution.archiveExplanation"),
  scopeTitle: t("orderResolution.scopeTitle"),
  cutoffLabel: t("orderResolution.cutoffLabel"),
  cutoffPlaceholder: t("orderResolution.cutoffPlaceholder"),
  cutoffPopoverTitle: t("orderResolution.cutoffPopoverTitle"),
  cutoffPopoverDescription: t("orderResolution.cutoffPopoverDescription"),
  reasonLabel: t("orderResolution.reasonLabel"),
  reasonPlaceholder: t("orderResolution.reasonPlaceholder"),
  reasonOptions: {
    completed_outside_pressly: t(
      "orderResolution.reasonOptions.completed_outside_pressly"
    ),
    processor_not_in_use: t(
      "orderResolution.reasonOptions.processor_not_in_use"
    ),
    duplicate_or_test: t("orderResolution.reasonOptions.duplicate_or_test"),
    order_will_not_be_produced: t(
      "orderResolution.reasonOptions.order_will_not_be_produced"
    ),
    other: t("orderResolution.reasonOptions.other"),
  },
  noteLabel: t("orderResolution.noteLabel"),
  noteDescription: t("orderResolution.noteDescription"),
  notePlaceholder: t("orderResolution.notePlaceholder"),
  otherNoteRequired: t("orderResolution.otherNoteRequired"),
  reviewOrders: t("orderResolution.reviewOrders"),
  refreshPreview: t("orderResolution.refreshPreview"),
  close: t("orderResolution.close"),
  cancel: t("orderResolution.cancel"),
  loading: t("orderResolution.loading"),
  previewErrorTitle: t("orderResolution.previewErrorTitle"),
  retry: t("orderResolution.retry"),
  driftTitle: t("orderResolution.driftTitle"),
  driftDescription: t("orderResolution.driftDescription"),
  candidateSummary: (count) => t("orderResolution.candidateSummary", { count }),
  previewGenerated: (formattedDate) =>
    t("orderResolution.previewGenerated", { formattedDate }),
  previewLimitedTitle: t("orderResolution.previewLimitedTitle"),
  previewLimitedDescription: (maximum) =>
    t("orderResolution.previewLimitedDescription", { maximum }),
  groups: {
    ready_to_archive: {
      title: t("orderResolution.groups.ready_to_archive.title"),
      description: t("orderResolution.groups.ready_to_archive.description"),
    },
    review_individually: {
      title: t("orderResolution.groups.review_individually.title"),
      description: t("orderResolution.groups.review_individually.description"),
    },
    kept_for_safety: {
      title: t("orderResolution.groups.kept_for_safety.title"),
      description: t("orderResolution.groups.kept_for_safety.description"),
    },
    already_historical: {
      title: t("orderResolution.groups.already_historical.title"),
      description: t("orderResolution.groups.already_historical.description"),
    },
  },
  groupCount: (count) => t("orderResolution.groupCount", { count }),
  orderDue: (formattedDate) => t("orderResolution.orderDue", { formattedDate }),
  classificationReasons: {
    resolved_without_production: t(
      "orderResolution.classificationReasons.resolved_without_production"
    ),
    execution_finished: t(
      "orderResolution.classificationReasons.execution_finished"
    ),
    execution_state_invalid: t(
      "orderResolution.classificationReasons.execution_state_invalid"
    ),
    resolution_transition_invalid: t(
      "orderResolution.classificationReasons.resolution_transition_invalid"
    ),
    execution_committed: t(
      "orderResolution.classificationReasons.execution_committed"
    ),
    selected_for_shift: t(
      "orderResolution.classificationReasons.selected_for_shift"
    ),
    batch_membership_exists: t(
      "orderResolution.classificationReasons.batch_membership_exists"
    ),
    stage_attempt_exists: t(
      "orderResolution.classificationReasons.stage_attempt_exists"
    ),
    route_exists: t("orderResolution.classificationReasons.route_exists"),
    intake_recorded: t("orderResolution.classificationReasons.intake_recorded"),
    manual_admission: t(
      "orderResolution.classificationReasons.manual_admission"
    ),
    priority: t("orderResolution.classificationReasons.priority"),
    pending_placement: t(
      "orderResolution.classificationReasons.pending_placement"
    ),
    no_operator_owned_facts: t(
      "orderResolution.classificationReasons.no_operator_owned_facts"
    ),
  },
  reviewOrder: (displayReference) =>
    t("orderResolution.reviewOrder", { displayReference }),
  openInHistory: (displayReference) =>
    t("orderResolution.openInHistory", { displayReference }),
  individualConfirmTitle: (displayReference) =>
    t("orderResolution.individualConfirmTitle", { displayReference }),
  individualConfirmDescription: t(
    "orderResolution.individualConfirmDescription"
  ),
  individualAcknowledgement: t("orderResolution.individualAcknowledgement"),
  individualErrorTitle: t("orderResolution.individualErrorTitle"),
  archiveReady: (count) => t("orderResolution.archiveReady", { count }),
  bulkConfirmTitle: (count) => t("orderResolution.bulkConfirmTitle", { count }),
  bulkConfirmDescription: t("orderResolution.bulkConfirmDescription"),
  bulkConfirmScope: (count, formattedCutoff) =>
    t("orderResolution.bulkConfirmScope", { count, formattedCutoff }),
  bulkConfirmAction: t("orderResolution.bulkConfirmAction"),
  emptyTitle: t("orderResolution.emptyTitle"),
  emptyDescription: t("orderResolution.emptyDescription"),
  successTitle: t("orderResolution.successTitle"),
  successNextPageTitle: t("orderResolution.successNextPageTitle"),
  successDescription: (count) =>
    t("orderResolution.successDescription", { count }),
  successNextPageDescription: (count) =>
    t("orderResolution.successNextPageDescription", { count }),
  replayed: t("orderResolution.replayed"),
  replayDescription: t("orderResolution.replayDescription"),
  openHistory: t("orderResolution.openHistory"),
  reviewNextPage: t("orderResolution.reviewNextPage"),
  reviewAnotherCutoff: t("orderResolution.reviewAnotherCutoff"),
})

const messageForFailure = (cause: unknown, t: TFunction): string => {
  if (!(cause instanceof RequestFailure))
    return t("orderResolution.previewErrorTitle")
  if (cause.kind === "forbidden") return t("history.errors.forbidden")
  if (cause.kind === "unauthorized") return t("history.errors.unauthorized")
  if (cause.kind === "unavailable") return t("history.errors.unavailable")
  return t("orderResolution.previewErrorTitle")
}

type OrderResolutionReviewContainerProps = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  timezone: string
  canManage: boolean
  now: () => Date
  onMutated: () => Promise<void>
  onOpenHistory: (productionOrderId?: string) => void
}>

function OrderResolutionReviewWorkspace({
  production,
  idempotency,
  locationId,
  timezone,
  canManage,
  now,
  onMutated,
  onOpenHistory,
}: OrderResolutionReviewContainerProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState(() => initialScope(timezone, now()))
  const [model, setModel] = useState<OrderResolutionReviewModel>({
    status: "idle",
  })

  const normalizeScope = (
    next: OrderResolutionReviewScope
  ): OrderResolutionReviewScope => ({
    ...next,
    cutoff:
      next.cutoffDate === undefined
        ? ""
        : (orderResolutionCutoffIso(next.cutoffDate, timezone) ?? ""),
  })

  const preview = async (request: OrderResolutionPreviewRequest) => {
    setModel({ status: "loading" })
    try {
      const value = await production.previewOrderBacklog({
        locationId,
        request,
      })
      setModel({
        status: "preview",
        preview: value,
        individual: { status: "idle" },
      })
    } catch (cause) {
      setModel({
        status: "error",
        preview: null,
        message: messageForFailure(cause, t),
      })
    }
  }

  const resolveIndividually = async (
    request: OrderResolutionIndividualRequest
  ) => {
    if (model.status !== "preview") return
    const currentPreview = model.preview
    setModel({
      status: "preview",
      preview: currentPreview,
      individual: {
        status: "submitting",
        orderId: request.item.orderId,
      },
    })
    try {
      await production.changeOrderResolution({
        locationId,
        productionOrderId: request.item.orderId,
        request: {
          ...request.command,
          expectedVersion: request.item.expectedVersion,
          idempotencyKey: await idempotency.key({
            operation: "resolve-production-order-without-production",
            payload: {
              locationId,
              productionOrderId: request.item.orderId,
              expectedVersion: request.item.expectedVersion,
              command: request.command,
            },
          }),
        },
      })
      const nextPreview = await production.previewOrderBacklog({
        locationId,
        request: {
          filter: currentPreview.filter,
          cutoff: currentPreview.cutoff,
          reason: currentPreview.reason,
          cursor: currentPreview.cursor,
          maxOrders: currentPreview.maxOrders,
        },
      })
      setModel({
        status: "preview",
        preview: nextPreview,
        individual: { status: "idle" },
      })
      await onMutated()
    } catch (cause) {
      setModel({
        status: "preview",
        preview: currentPreview,
        individual: {
          status: "error",
          orderId: request.item.orderId,
          message: messageForFailure(cause, t),
        },
      })
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
          <IconArchive className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">
            {t("orderResolution.archiveExplanationTitle")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("orderResolution.archiveExplanation")}
          </p>
        </div>
      </div>
      <OrderResolutionReviewSheet
        canManage={canManage}
        open={open}
        locale={localeForLanguage(i18n.resolvedLanguage)}
        timezone={timezone}
        scope={scope}
        model={model}
        copy={copyFor(t)}
        callbacks={{
          onOpenChange: setOpen,
          onScopeChange: (next) => {
            setScope(normalizeScope(next))
            setModel({ status: "idle" })
          },
          onPreview: (request) => void preview(request),
          onPreviewNext: (cursor) => {
            const request = toOrderResolutionPreviewRequest(scope)
            if (request !== null)
              void preview({
                ...request,
                cursor,
              })
          },
          onCommit: (request) => {
            if (model.status !== "preview") return
            const currentPreview = model.preview
            setModel({ status: "committing", preview: currentPreview })
            void (async () => {
              try {
                const result = await production.commitOrderBacklog({
                  locationId,
                  request: {
                    ...request,
                    idempotencyKey: await idempotency.key({
                      operation: "commit-production-order-backlog",
                      payload: { locationId, ...request },
                    }),
                  },
                })
                setModel({ status: "success", result })
                await onMutated()
              } catch (cause) {
                const message = messageForFailure(cause, t)
                setModel(
                  cause instanceof RequestFailure && cause.kind === "conflict"
                    ? {
                        status: "drift",
                        preview: currentPreview,
                        message,
                      }
                    : {
                        status: "error",
                        preview: currentPreview,
                        message,
                      }
                )
              }
            })()
          },
          onResolveIndividually: (request) => void resolveIndividually(request),
          onOpenHistory: (productionOrderId) => {
            setOpen(false)
            onOpenHistory(productionOrderId)
          },
          onReviewAnother: () => {
            if (
              model.status === "success" &&
              model.result.nextCursor !== null
            ) {
              const request = toOrderResolutionPreviewRequest(scope)
              if (request !== null) {
                void preview({
                  ...request,
                  cursor: model.result.nextCursor,
                })
                return
              }
            }
            setModel({ status: "idle" })
          },
        }}
      />
    </section>
  )
}

export function OrderResolutionReviewContainer(
  props: OrderResolutionReviewContainerProps
) {
  if (!props.canManage) return null

  return (
    <OrderResolutionReviewWorkspace
      key={`${props.locationId}:${props.timezone}`}
      {...props}
    />
  )
}
