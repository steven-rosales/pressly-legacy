import type {
  ProductionBatch,
  ProductionFloorMilestone,
  ProductionFloorProgressReason,
  ProductionFloorProgressTarget,
} from "@pressly/contracts/production"
import type { TFunction } from "i18next"
import {
  productionStageLabels,
  productionStages,
  type ProductionStageKind,
} from "./production-board.presenter"

export const floorProgressMilestones = [
  "waiting_to_sort",
  "sorting_started",
  "sorting_completed",
  "washing_started",
  "washing_completed",
  "drying_started",
  "drying_completed",
  "folding_packaging_started",
  "finished",
] as const satisfies readonly ProductionFloorMilestone[]

export type FloorProgressDraft = Readonly<{
  productionBatchId: string
  target: ProductionFloorProgressTarget
  reason: ProductionFloorProgressReason
  note: string | null
  machineIds: readonly string[]
}>

export const floorProgressReasonLabels: Record<
  ProductionFloorProgressReason,
  string
> = {
  lpms_unavailable: "LPMS was unavailable",
  updates_missed: "Updates were missed",
  other: "Something else",
}

export const floorProgressMilestoneLabels: Record<
  ProductionFloorMilestone,
  string
> = {
  waiting_to_sort: "Waiting to sort",
  sorting_started: "Sorting",
  sorting_completed: "Waiting to wash",
  washing_started: "Washing",
  washing_completed: "Waiting to dry",
  drying_started: "Drying",
  drying_completed: "Waiting to fold & package",
  folding_packaging_started: "Folding & packaging",
  finished: "Finished",
}

const statusRank = { planned: 0, started: 1, completed: 2 } as const

export const targetForMilestone = (
  milestone: ProductionFloorMilestone
): ProductionFloorProgressTarget | null =>
  milestone === "waiting_to_sort" ? null : milestone

export const milestoneForBatch = (
  batch: ProductionBatch
): ProductionFloorMilestone => {
  const stages = productionStages.map((kind) =>
    batch.stages.find((stage) => stage.stage === kind)
  )
  if (stages.every((stage) => stage?.status === "completed")) return "finished"

  const firstIncompleteIndex = stages.findIndex(
    (stage) => stage?.status !== "completed"
  )
  const firstIncomplete = stages[firstIncompleteIndex]
  if (firstIncomplete?.status === "started")
    return `${firstIncomplete.stage}_started` as ProductionFloorProgressTarget

  return (
    [
      "waiting_to_sort",
      "sorting_completed",
      "washing_completed",
      "drying_completed",
    ] as const
  )[Math.max(0, firstIncompleteIndex)]
}

export const forwardMilestones = (
  batch: ProductionBatch
): readonly ProductionFloorProgressTarget[] => {
  const currentRank = floorProgressMilestones.indexOf(milestoneForBatch(batch))
  return floorProgressMilestones.slice(
    currentRank + 1
  ) as readonly ProductionFloorProgressTarget[]
}

const splitTarget = (
  target: ProductionFloorProgressTarget
): readonly [ProductionStageKind, "started" | "completed"] => {
  if (target === "finished") return ["folding_packaging", "completed"]
  const suffix = target.endsWith("_started") ? "started" : "completed"
  return [target.slice(0, -`_${suffix}`.length) as ProductionStageKind, suffix]
}

const targetStatusForStage = (
  target: ProductionFloorProgressTarget,
  stage: ProductionStageKind
): "planned" | "started" | "completed" => {
  const [targetStage, targetStatus] = splitTarget(target)
  const stageIndex = productionStages.indexOf(stage)
  const targetIndex = productionStages.indexOf(targetStage)
  if (stageIndex < targetIndex) return "completed"
  if (stageIndex > targetIndex) return "planned"
  return targetStatus
}

const joinEffects = (effects: readonly string[], t?: TFunction): string => {
  if (effects.length === 0)
    return (
      t?.("floorProgress.noChanges") ?? "No stage changes will be recorded."
    )
  if (effects.length === 1)
    return (
      t?.("floorProgress.markOne", { first: effects[0] }) ??
      `This will mark ${effects[0]}.`
    )
  if (effects.length === 2)
    return (
      t?.("floorProgress.markTwo", {
        first: effects[0],
        second: effects[1],
      }) ?? `This will mark ${effects[0]}, then ${effects[1]}.`
    )
  return (
    t?.("floorProgress.markMany", {
      earlier: effects.slice(0, -1).join(", "),
      last: effects.at(-1) ?? "",
    }) ??
    `This will mark ${effects.slice(0, -1).join(", ")}, then ${effects.at(-1)}.`
  )
}

export const describeFloorProgressChange = (
  batch: ProductionBatch,
  target: ProductionFloorProgressTarget,
  t?: TFunction
): string => {
  const effects = productionStages.flatMap((kind) => {
    const stage = batch.stages.find((candidate) => candidate.stage === kind)
    if (stage === undefined) return []
    const targetStatus = targetStatusForStage(target, kind)
    if (statusRank[targetStatus] <= statusRank[stage.status]) return []
    return [
      t?.(
        targetStatus === "started"
          ? "floorProgress.stageStarted"
          : "floorProgress.stageCompleted",
        {
          stage: t(
            kind === "sorting"
              ? "common.stage.sorting"
              : kind === "washing"
                ? "common.stage.washing"
                : kind === "drying"
                  ? "common.stage.drying"
                  : "common.stage.foldingPackaging"
          ),
        }
      ) ??
        `${productionStageLabels[kind]} ${targetStatus === "started" ? "started" : "completed"}`,
    ]
  })
  return joinEffects(effects, t)
}

export const targetRequiresMachines = (
  target: ProductionFloorProgressTarget
): boolean => target === "washing_started" || target === "drying_started"

export const activeStageForTarget = (
  target: ProductionFloorProgressTarget
): ProductionStageKind | null => {
  const [stage, status] = splitTarget(target)
  return status === "started" ? stage : null
}

export const describeFinishedConsequences = (
  batch: ProductionBatch,
  batches: readonly ProductionBatch[],
  t?: TFunction
): string => {
  const orderCount = batch.orders.length
  const bagCount = batch.orders.reduce((sum, order) => sum + order.bagCount, 0)
  const closesRun = batches.every(
    (candidate) =>
      candidate.id === batch.id || milestoneForBatch(candidate) === "finished"
  )
  const base =
    t?.("floorProgress.finishConsequences", {
      orders: t("common.orders", { count: orderCount }),
      bags: t("common.bags", { count: bagCount }),
    }) ??
    `This finishes ${orderCount} ${orderCount === 1 ? "order" : "orders"} and ${bagCount} ${bagCount === 1 ? "bag" : "bags"}.`
  return closesRun
    ? `${base} ${t?.("floorProgress.closeRun") ?? "Because this is the last unfinished batch, the production run and shift will close."}`
    : base
}
