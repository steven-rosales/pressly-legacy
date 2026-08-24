import type { SchedulerConfig } from "@pressly/production-system/contracts/read-models/production-schedule"

export type PublishSchedulerConfigRequest = Readonly<{
  locationId: string
  pulseMinutes: number
  foldLbsPerFolderMinute: number
  stageFitAssertion: Readonly<{
    sortingFits: true
    washingFits: true
    dryingFits: true
  }>
  idempotencyKey: string
}>

export type PublishSchedulerConfigClientOperation = Readonly<{
  operationId: "production.publish-scheduler-config.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    "scheduler-configs": Readonly<{ method: "POST"; path: string }>
  }>
}>

export type PublishSchedulerConfigClient = (
  request: PublishSchedulerConfigRequest
) => Promise<SchedulerConfig>
