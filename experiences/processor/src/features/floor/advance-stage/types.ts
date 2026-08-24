import type {
  CompleteStageCommand,
  StartStageCommand,
} from "@pressly/production-system/contracts/floor/advance-stage"

export type AdvanceStageRequest = Readonly<{
  locationId: string
  stageRunId: string
  transition: "start" | "complete"
  expectedVersion: number
  idempotencyKey: string
  confirmation?: NonNullable<
    CompleteStageCommand["confirmation"] | StartStageCommand["confirmation"]
  >
}>

export type AdvanceStageClientOperation = Readonly<{
  operationId: "production.advance-stage.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    start: Readonly<{ method: "POST"; path: string }>
    complete: Readonly<{ method: "POST"; path: string }>
  }>
}>

type AdvanceStageWorkflowScope = Readonly<{
  locationId: string
  stageRunId: string
  transition: "start" | "complete"
  expectedVersion: number
}>

export type AdvanceStageWorkflowIntent =
  | (AdvanceStageWorkflowScope & Readonly<{ kind: "attempt" }>)
  | (AdvanceStageWorkflowScope &
      Readonly<{
        kind: "confirmation"
        confirmation: NonNullable<AdvanceStageRequest["confirmation"]>
      }>)
