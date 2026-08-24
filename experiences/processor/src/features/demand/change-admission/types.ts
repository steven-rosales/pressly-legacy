import type { ChangeProductionAdmissionResult } from "@pressly/production-system/contracts/demand/change-admission"

export type ChangeAdmissionRequest = Readonly<{
  locationId: string
  productionOrderId: string
  target: "released" | "source"
  expectedVersion: number
  idempotencyKey: string
}>

export type ChangeAdmissionClientOperation = Readonly<{
  operationId: "production.change-admission.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    admission: Readonly<{ method: "PUT"; path: string }>
  }>
}>

export type ChangeAdmissionClient = (
  request: ChangeAdmissionRequest
) => Promise<ChangeProductionAdmissionResult>
