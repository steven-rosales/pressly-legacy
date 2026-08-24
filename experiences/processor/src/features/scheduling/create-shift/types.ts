import type { ProductionShift } from "@pressly/production-system/contracts/read-models/production-schedule"

export type CreateShiftRequest = Readonly<{
  locationId: string
  startsAt: string
  endsAt: string
  timezone: string
  effectiveFolderCount: number
  idempotencyKey: string
}>

export type CreateShiftClientOperation = Readonly<{
  operationId: "production.create-shift.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    shifts: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type CreateShiftClient = (
  request: CreateShiftRequest
) => Promise<ProductionShift>
