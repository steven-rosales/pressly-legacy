import {
  schedulerConfigSchema,
  type SchedulerConfig,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import type {
  PublishSchedulerConfigClient,
  PublishSchedulerConfigClientOperation,
  PublishSchedulerConfigRequest,
} from "./types.ts"

type PublishSchedulerConfigRequestBody = Omit<
  PublishSchedulerConfigRequest,
  "locationId"
>

export type PublishSchedulerConfigRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: PublishSchedulerConfigRequestBody
  }>,
  outputSchema: typeof schedulerConfigSchema
) => Promise<SchedulerConfig>

export const makePublishSchedulerConfigClient = (input: {
  operation: PublishSchedulerConfigClientOperation
  request: PublishSchedulerConfigRequestTransport
}): PublishSchedulerConfigClient => {
  const surface = input.operation.http["scheduler-configs"]
  return async ({ locationId, ...body }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path.replace(
          ":locationId",
          encodeURIComponent(locationId)
        ),
        body,
      },
      schedulerConfigSchema
    )
}
