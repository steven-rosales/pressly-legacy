import type {
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
} from "@pressly/production-system/contracts/read-models/production-order-placement"

export type ConfirmOrderOvertimeClientOperation = Readonly<{
  operationId: "production.confirm-order-overtime.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    "confirm-overtime": Readonly<{ method: "POST"; path: string }>
  }>
}>

export type ConfirmOrderOvertimeClient = (
  request: ConfirmProductionOrderOvertimeCommand
) => Promise<ConfirmProductionOrderOvertimeResult>
