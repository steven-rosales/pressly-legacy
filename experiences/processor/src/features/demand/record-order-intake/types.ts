import type { RecordOrderIntakeResult } from "@pressly/production-system/contracts/demand/record-order-intake"

export type RecordOrderIntakeRequest = Readonly<{
  locationId: string
  productionOrderId: string
  bagCount: number
  expectedVersion: number
  idempotencyKey: string
}>

export type RecordOrderIntakeClientOperation = Readonly<{
  operationId: "production.record-order-intake.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    intake: Readonly<{ method: "PUT"; path: string }>
  }>
}>

export type RecordOrderIntakeClient = (
  request: RecordOrderIntakeRequest
) => Promise<RecordOrderIntakeResult>
