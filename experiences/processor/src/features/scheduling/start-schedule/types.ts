import type {
  StartScheduleCommand,
  StartScheduleResult,
} from "@pressly/production-system/contracts/scheduling/start-schedule"

export type StartScheduleClientOperation = Readonly<{
  operationId: "production.start-schedule.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    start: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type StartScheduleClient = (
  request: StartScheduleCommand
) => Promise<StartScheduleResult>
