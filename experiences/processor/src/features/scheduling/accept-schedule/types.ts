import type {
  AcceptScheduleCommand,
  AcceptScheduleResult,
} from "@pressly/production-system/contracts/scheduling/accept-schedule"

export type AcceptScheduleClientOperation = Readonly<{
  operationId: "production.accept-schedule.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    accept: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type AcceptScheduleClient = (
  request: AcceptScheduleCommand
) => Promise<AcceptScheduleResult>
