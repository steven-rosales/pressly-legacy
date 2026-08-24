import type { ProductionMutationResult } from "@pressly/production-system/contracts/floor/assign-stage-machines"

export type AssignStageMachinesRequest = Readonly<{
  locationId: string
  stageRunId: string
  machineIds: readonly string[]
  expectedVersion: number
  idempotencyKey: string
}>

export type AssignStageMachinesClientOperation = Readonly<{
  operationId: "production.assign-stage-machines.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    machines: Readonly<{ method: "PUT"; path: string }>
  }>
}>

export type AssignStageMachinesClient = (
  request: AssignStageMachinesRequest
) => Promise<ProductionMutationResult>

export type AssignStageMachinesWorkflowIntent = Omit<
  AssignStageMachinesRequest,
  "idempotencyKey"
>
