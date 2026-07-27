import type {
  ProcessorOrderControlItem,
  ProductionBoard,
  ProductionOrderRouteProposal,
} from "@pressly/contracts"
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
  return {
    id: item.order.id,
    identity: item.identity,
    externalOrderId: item.identity.displayNumber,
    secondaryLabel: customerLabel,
    customerLabel,
    phoneLabel: canonical?.customer.phone ?? t("orderControl.phoneUnavailable"),
    commercialStateLabel,
    admissionStateLabel,
    sourceStateLabel:
      canonical?.source === null || canonical?.source === undefined
        ? t("orderControl.sourceUnavailable")
        : canonical.source.status === null
          ? canonical.source.name
          : `${canonical.source.name} · ${canonical.source.status}`,
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
      available: item.canMoveQueued,
      reason: item.canMoveQueued ? null : t("orderControl.moveUnavailable"),
    },
    leaveBehind: {
      available: item.canRouteException,
      reason: item.canRouteException
        ? null
        : t("orderControl.leaveUnavailable"),
    },
    rework: {
      available: item.canRouteException,
      reason: item.canRouteException
        ? null
        : t("orderControl.reworkUnavailable"),
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
  board: ProductionBoard | null,
  locale: string,
  t: TFunction
): readonly OrderMoveTarget[] => {
  if (
    item?.currentPlacement === null ||
    item?.currentPlacement === undefined ||
    board === null ||
    board.productionRun.id !== item.currentPlacement.productionRunId
  )
    return []
  return board.batches.map((batch) => {
    const isSource = batch.id === item.currentPlacement!.productionBatchId
    const mutable =
      batch.status === "queued" && batch.membership.state === "mutable"
    const fits =
      batch.derivedWeightLbs + item.order.derivedWeightLbs <=
      batch.pulseCapacityLbs
    const disabled = isSource || !mutable || !fits
    return {
      batchId: batch.id,
      label: t("orderControl.batch", { number: batch.sequence + 1 }),
      detail: `${batch.derivedWeightLbs.toLocaleString(locale)} / ${batch.pulseCapacityLbs.toLocaleString(locale)} lb`,
      disabled,
      disabledReason: isSource
        ? t("orderControl.currentBatch")
        : !mutable
          ? t("orderControl.batchImmutable")
          : !fits
            ? t("orderControl.exceedsCapacity")
            : null,
    }
  })
}
