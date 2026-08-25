import type { UpdateProductionShiftResult } from "@pressly/production-system/contracts/scheduling/update-shift"

export type UpdateShiftRequest = Readonly<{
  locationId: string
  productionShiftId: string
  startsAt: string
  endsAt: string
  effectiveFolderCount: number
  expectedVersion: number
  idempotencyKey: string
}>

export type UpdateShiftClientOperation = Readonly<{
  operationId: "production.update-shift.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    request: Readonly<{ method: "PATCH"; path: string }>
  }>
}>

export type UpdateShiftClient = (
  request: UpdateShiftRequest
) => Promise<UpdateProductionShiftResult>
