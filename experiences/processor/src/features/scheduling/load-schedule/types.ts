import type { ScheduleProposal } from "@pressly/production-system/contracts/read-models/production-schedule"

export type LoadScheduleClientOperation = Readonly<{
  operationId: "production.load-schedule.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    request: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type LoadScheduleClient = (
  locationId: string,
  scheduleRunId: string
) => Promise<ScheduleProposal>
