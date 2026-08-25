import type { CreateScheduleCommand } from "@pressly/production-system/contracts/scheduling/create-schedule"
import type { ScheduleProposal } from "@pressly/production-system/contracts/read-models/production-schedule"

export type CreateScheduleClientOperation = Readonly<{
  operationId: "production.create-schedule.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    schedules: Readonly<{ method: "POST"; path: string }>
  }>
}>

export type CreateScheduleClient = (
  request: CreateScheduleCommand
) => Promise<ScheduleProposal>
