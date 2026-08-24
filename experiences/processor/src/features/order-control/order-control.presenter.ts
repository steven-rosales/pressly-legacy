import type { ProcessorOrderControlItem } from "../../contracts/production-order-control.ts"
import type {
  ProductionOrderRouteCommandDenialCode,
  ProductionOrderRouteProposal,
  ProductionQueuedMoveTargetDenialCode,
} from "@pressly/production-system/contracts/read-models/production-order-control"
import type { TFunction } from "i18next"
import type {
  OrderActionPreview,
  OrderControlFilters,
  OrderControlOrder,
  OrderMoveTarget,
} from "./order-control.model"

export const orderControlStages = [
  "sorting",
  "washing",
  "drying",
  "folding_packaging",
] as const
export type OrderControlStage = (typeof orderControlStages)[number]

export const emptyOrderControlFilters: OrderControlFilters = {
  query: "",
  status: "all",
  due: "all",
  stage: "all",
  priority: "all",
}

export const localeForOrderControlLanguage = (
  language: string | undefined
): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

export const labelForOrderControlValue = (
  value: string,
  t: TFunction
): string => {
  if (value === "release_pending") return t("orderControl.forecastOnly")
  if (value === "intake_pending") return t("orderControl.intakeNeeded")
  if (value === "eligible") return t("orderControl.eligible")
  if (value === "ineligible") return t("orderControl.notEligible")
  if (value === "scheduled") return t("orderControl.inProduction")
  if (value === "finished") return t("orderControl.finished")
  if (value === "overdue") return t("common.due.overdue")
  if (value === "today") return t("common.due.today")
  if (value === "tomorrow") return t("common.due.tomorrow")
  if (value === "later") return t("common.due.later")
  if (value === "queued") return t("common.queued")
  if (value === "sorting") return t("common.stage.sorting")
  if (value === "washing") return t("common.stage.washing")
  if (value === "drying") return t("common.stage.drying")
  if (value === "folding_packaging") return t("common.stage.foldingPackaging")
  if (value === "automatic") return t("orderControl.automaticPlacement")
  if (value === "initial_schedule") return t("orderControl.initialSchedule")
  if (value === "manager_exact") return t("orderControl.managerPlacement")
  if (value === "manual_rebatch") return t("orderControl.manualMove")
  if (value === "exception_route") return t("orderControl.exceptionRoute")
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export const formatOrderControlDate = (
  value: string,
  timezone: string,
  locale: string
): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

export const stageForOrder = (
  item: ProcessorOrderControlItem
): OrderControlStage => {
  if (item.currentPlacement === null) return item.nextRequiredStage ?? "sorting"
  const status = item.currentPlacement.batchStatus
  return orderControlStages.includes(status as OrderControlStage)
    ? (status as OrderControlStage)
    : (item.nextRequiredStage ?? "sorting")
}

const attentionFor = (
  item: ProcessorOrderControlItem,
  t: TFunction
): OrderControlOrder["attention"] => {
  if (item.attention === null) return null
  const copy =
    item.attention.reason === "intake_required"
      ? {
          label: t("orderControl.attentionIntake"),
          detail: t("orderControl.attentionIntakeDetail"),
        }
      : item.attention.reason === "placement_pending"
        ? {
            label: t("orderControl.attentionPlacementPending"),
            detail: t("orderControl.attentionPlacementPendingDetail"),
          }
        : item.attention.reason === "placement_conflict"
          ? {
              label: t("orderControl.attentionPlacementConflict"),
              detail: t("orderControl.attentionPlacementConflictDetail"),
            }
          : {
              label: t("orderControl.attentionRouteBlocked"),
              detail: t("orderControl.attentionRouteBlockedDetail"),
            }
  return {
    ...copy,
    tone:
      item.attention.reason === "placement_conflict" ||
      item.attention.reason === "route_blocked"
        ? "critical"
        : "warning",
  }
}

const resolutionReasonLabel = (reason: string, t: TFunction): string => {
  if (reason === "intake_recorded") return t("orderControl.archiveReviewIntake")
  if (reason === "manual_admission")
    return t("orderControl.archiveReviewAdmission")
  if (reason === "priority") return t("orderControl.archiveReviewPriority")
  if (reason === "pending_placement")
    return t("orderControl.archiveReviewPlacement")
  if (reason === "execution_committed")
    return t("orderControl.archiveBlockedExecution")
  if (reason === "selected_for_shift")
    return t("orderControl.archiveBlockedSelection")
  if (reason === "batch_membership_exists")
    return t("orderControl.archiveBlockedBatch")
  if (reason === "stage_attempt_exists")
    return t("orderControl.archiveBlockedStage")
  if (reason === "route_exists") return t("orderControl.archiveBlockedRoute")
  return t("orderControl.archiveBlockedState")
}

const commandDenialLabel = (
  code: ProductionOrderRouteCommandDenialCode,
  t: TFunction
): string => {
  switch (code) {
    case "PRODUCTION_ORDER_ROUTE_NOT_FOUND":
      return t("orderControl.commandDenied.orderNotFound")
    case "PRODUCTION_RUN_NOT_STARTED":
      return t("orderControl.commandDenied.runNotStarted")
    case "PRODUCTION_ORDER_RESOLVED":
      return t("orderControl.commandDenied.orderResolved")
    case "PRODUCTION_ORDER_RESOLUTION_STATE_INVALID":
      return t("orderControl.commandDenied.resolutionStateInvalid")
    case "PRODUCTION_ORDER_EXECUTION_STATE_INVALID":
      return t("orderControl.commandDenied.executionStateInvalid")
    case "PRODUCTION_ORDER_NOT_SCHEDULED":
      return t("orderControl.commandDenied.orderNotScheduled")
    case "SOURCE_BATCH_WOULD_BE_EMPTY":
      return t("orderControl.commandDenied.sourceBatchWouldBeEmpty")
    case "ORDER_WEIGHT_INVALID":
      return t("orderControl.commandDenied.orderWeightInvalid")
    case "SOURCE_BATCH_INVALID":
      return t("orderControl.commandDenied.sourceBatchInvalid")
    case "QUEUED_REBATCH_SOURCE_NOT_QUEUED":
      return t("orderControl.commandDenied.sourceNotQueued")
    case "QUEUED_REBATCH_SOURCE_FROZEN":
      return t("orderControl.commandDenied.sourceFrozen")
    case "EXCEPTION_SOURCE_NOT_IN_FLIGHT":
      return t("orderControl.commandDenied.sourceNotInFlight")
    case "SOURCE_CURRENT_STAGE_MISMATCH":
      return t("orderControl.commandDenied.sourceStageMismatch")
    case "RESTART_STAGE_SKIPS_REQUIRED_WORK":
      return t("orderControl.commandDenied.restartSkipsWork")
    case "TARGET_STAGE_GRAPH_INVALID":
      return t("orderControl.commandDenied.targetStageGraphInvalid")
    case "NO_LATER_TARGET":
      return t("orderControl.commandDenied.noLaterTarget")
    case "NO_FEASIBLE_TARGET":
      return t("orderControl.commandDenied.noFeasibleTarget")
    case "HARD_CAPACITY_EXCEEDED":
      return t("orderControl.commandDenied.hardCapacityExceeded")
  }
}

const moveTargetDenialLabel = (
  code: ProductionQueuedMoveTargetDenialCode,
  t: TFunction
): string => {
  switch (code) {
    case "TARGET_IS_SOURCE_BATCH":
      return t("orderControl.targetDenied.currentBatch")
    case "TARGET_NOT_QUEUED":
      return t("orderControl.targetDenied.notQueued")
    case "TARGET_MEMBERSHIP_FROZEN":
      return t("orderControl.targetDenied.membershipFrozen")
    case "TARGET_STAGE_GRAPH_INVALID":
      return t("orderControl.targetDenied.stageGraphInvalid")
    case "TARGET_STAGE_NOT_PLANNED":
      return t("orderControl.targetDenied.stageNotPlanned")
    case "HARD_CAPACITY_EXCEEDED":
      return t("orderControl.targetDenied.hardCapacityExceeded")
  }
}

const auditOutcomeLabel = (
  kind: "source_observation" | "order_command" | "production_command",
  t: TFunction
): string => {
  if (kind === "order_command") return t("orderControl.auditOrderCommand")
  if (kind === "production_command")
    return t("orderControl.auditProductionCommand")
  return t("orderControl.auditSourceEvidence")
}

export const presentOrderControlOrder = (
  item: ProcessorOrderControlItem,
  timezone: string,
  asOf: string,
  locale: string,
  t: TFunction
): OrderControlOrder => {
  const placement = item.currentPlacement
  const positionState =
    placement === null
      ? item.order.status === "finished"
        ? ("finished" as const)
        : ("unassigned" as const)
      : placement.batchStatus === "queued"
        ? ("queued" as const)
        : placement.batchStatus === "finished"
          ? ("finished" as const)
          : ("in_progress" as const)
  const stage = item.nextRequiredStage
  const canonical = item.canonical
  const customerLabel =
    item.identity.customerDisplayName === null
      ? t("orderControl.customerUnavailable")
      : item.identity.customerDisplayName
  const commercialStateLabel =
    canonical === null
      ? t("orderControl.canonicalUnavailable")
      : canonical.commercialState === "completed"
        ? t("orderControl.commercialCompleted")
        : canonical.commercialState === "canceled"
          ? t("orderControl.commercialCanceled")
          : t("orderControl.commercialOpen")
  const admissionStateLabel =
    canonical === null
      ? t("orderControl.canonicalUnavailable")
      : canonical.admissionState === "released"
        ? t("orderControl.releasedToProduction")
        : canonical.admissionState === "withdrawn"
          ? t("orderControl.withdrawnFromProduction")
          : t("orderControl.forecastOnly")
  const resolution = item.resolutionAction
  const audit =
    canonical?.audit.map((entry, index) => ({
      key: `${entry.kind}:${entry.occurredAt}:${entry.code}:${index}`,
      label:
        entry.kind === "source_observation"
          ? t("orderControl.auditSourceObservation", {
              source: entry.actor,
            })
          : labelForOrderControlValue(entry.code, t),
      detail: t("orderControl.auditDetail", {
        outcome: auditOutcomeLabel(entry.kind, t),
        date: formatOrderControlDate(entry.occurredAt, timezone, locale),
      }),
    })) ?? []
  return {
    id: item.order.id,
    identity: item.identity,
    externalOrderId: item.identity.displayNumber,
    secondaryLabel: customerLabel,
    customerLabel,
    phoneLabel: canonical?.customer.phone ?? t("orderControl.phoneUnavailable"),
    commercialStateLabel,
    admissionStateLabel,
    statusLabel: labelForOrderControlValue(item.order.status, t),
    dueLabel:
      item.order.status === "finished"
        ? t("orderControl.finished")
        : labelForOrderControlValue(item.order.dueBucket, t),
    dueDetail: formatOrderControlDate(item.order.dueAt, timezone, locale),
    weightLabel: t("common.pounds", { value: item.order.derivedWeightLbs }),
    bagLabel:
      item.order.bagCount === null
        ? t("orderControl.bagsNotCounted")
        : t("common.bags", { count: item.order.bagCount }),
    priority: item.order.priority,
    attention: attentionFor(item, t),
    audit,
    position: {
      label:
        placement === null
          ? item.order.status === "finished"
            ? t("orderControl.productionComplete")
            : t("orderControl.notAssigned")
          : t("orderControl.batch", { number: placement.batchSequence + 1 }),
      detail:
        placement === null
          ? t("orderControl.unassignedDetail")
          : t("orderControl.positionDetail", {
              status: labelForOrderControlValue(placement.batchStatus, t),
              next:
                stage === null
                  ? ""
                  : t("orderControl.nextStage", {
                      stage: labelForOrderControlValue(stage, t),
                    }),
            }),
      state: positionState,
      batchId: placement?.productionBatchId ?? null,
      batchLabel:
        placement === null
          ? null
          : t("orderControl.batch", { number: placement.batchSequence + 1 }),
      stageLabel: stage === null ? null : labelForOrderControlValue(stage, t),
      membership:
        placement === null
          ? null
          : placement.membershipFrozen
            ? "frozen"
            : "mutable",
    },
    placement:
      placement === null
        ? null
        : {
            label: labelForOrderControlValue(placement.placementProvenance, t),
            detail: placement.membershipFrozen
              ? t("orderControl.membershipFrozen")
              : t("orderControl.membershipMutable"),
            pinned: placement.pinnedAt !== null,
          },
    lastUpdatedLabel: formatOrderControlDate(asOf, timezone, locale),
    move: {
      available: item.commands.queuedMove.status === "allowed",
      reason:
        item.commands.queuedMove.status === "allowed"
          ? null
          : commandDenialLabel(item.commands.queuedMove.code, t),
    },
    leaveBehind: {
      available: item.commands.routeException.status === "allowed",
      reason:
        item.commands.routeException.status === "allowed"
          ? null
          : commandDenialLabel(item.commands.routeException.code, t),
    },
    rework: {
      available: item.commands.routeException.status === "allowed",
      reason:
        item.commands.routeException.status === "allowed"
          ? null
          : commandDenialLabel(item.commands.routeException.code, t),
    },
    archive:
      resolution.status === "blocked"
        ? {
            available: false,
            reason: resolution.reasons
              .map((reason) => resolutionReasonLabel(reason, t))
              .join(" "),
            expectedVersion: null,
            requiresExplicitReview: false,
            reviewReasons: [],
          }
        : {
            available: true,
            reason: null,
            expectedVersion: resolution.expectedVersion,
            requiresExplicitReview: resolution.requiresExplicitReview,
            reviewReasons: resolution.reviewReasons.map((reason) =>
              resolutionReasonLabel(reason, t)
            ),
          },
  }
}

export const presentOrderRoutePreview = (
  proposal: ProductionOrderRouteProposal,
  t: TFunction
): OrderActionPreview => ({
  title:
    proposal.kind === "queued_move"
      ? t("orderControl.queuedMoveValid")
      : t("orderControl.floorRouteValid"),
  destinationLabel: t("orderControl.batch", {
    number: proposal.targetBatchSequence + 1,
  }),
  destinationDetail: t("orderControl.destinationDetail", {
    weight: proposal.targetWeightLbs,
    capacity: proposal.targetCapacityLbs,
  }),
  effects: [
    t("orderControl.releaseWork", {
      stages: proposal.releasedStages
        .map((stage) => labelForOrderControlValue(stage, t))
        .join(", "),
      batch: proposal.sourceBatchSequence + 1,
    }),
    t("orderControl.assignWork", {
      stages: proposal.assignedStages
        .map((stage) => labelForOrderControlValue(stage, t))
        .join(", "),
      batch: proposal.targetBatchSequence + 1,
    }),
    t("orderControl.keepTogether"),
  ],
  warnings:
    proposal.kind === "exception" ? [t("orderControl.irreversible")] : [],
  confirmationLabel:
    proposal.kind === "queued_move"
      ? t("orderControl.moveWholeOrder")
      : t("orderControl.confirmFloorRoute"),
})

export const presentOrderMoveTargets = (
  item: ProcessorOrderControlItem | null,
  locale: string,
  t: TFunction
): readonly OrderMoveTarget[] => {
  if (item === null) return []
  const capability = item.commands.queuedMove
  return capability.targets.map((target) => {
    const disabled = target.feasibility.status === "blocked"
    return {
      batchId: target.productionBatchId,
      label: t("orderControl.batch", { number: target.batchSequence + 1 }),
      detail: t("orderControl.moveTargetCapacity", {
        current: target.currentWeightLbs.toLocaleString(locale),
        projected: target.projectedWeightLbs.toLocaleString(locale),
        capacity: target.capacityLbs.toLocaleString(locale),
      }),
      disabled,
      disabledReason:
        target.feasibility.status === "blocked"
          ? moveTargetDenialLabel(target.feasibility.code, t)
          : null,
    }
  })
}
