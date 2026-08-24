import {
  startScheduleResultSchema,
  type StartScheduleCommand,
  type StartScheduleResult,
} from "@pressly/production-system/contracts/scheduling/start-schedule"
import type {
  StartScheduleClient,
  StartScheduleClientOperation,
} from "./types.ts"

type StartScheduleRequestBody = Omit<
  StartScheduleCommand,
  "locationId" | "scheduleRunId"
>

export type StartScheduleRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: StartScheduleRequestBody
  }>,
  outputSchema: typeof startScheduleResultSchema
) => Promise<StartScheduleResult>

export const makeStartScheduleClient = (input: {
  operation: StartScheduleClientOperation
  request: StartScheduleRequestTransport
}): StartScheduleClient => {
  const surface = input.operation.http.start
  return async ({ locationId, scheduleRunId, ...body }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path
          .replace(":locationId", encodeURIComponent(locationId))
          .replace(":scheduleRunId", encodeURIComponent(scheduleRunId)),
        body,
      },
      startScheduleResultSchema
    )
}
