import {
  acceptScheduleResultSchema,
  type AcceptScheduleCommand,
  type AcceptScheduleResult,
} from "@pressly/production-system/contracts/scheduling/accept-schedule"
import type {
  AcceptScheduleClient,
  AcceptScheduleClientOperation,
} from "./types.ts"

type AcceptScheduleRequestBody = Omit<
  AcceptScheduleCommand,
  "locationId" | "scheduleRunId"
>

export type AcceptScheduleRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: AcceptScheduleRequestBody
  }>,
  outputSchema: typeof acceptScheduleResultSchema
) => Promise<AcceptScheduleResult>

export const makeAcceptScheduleClient = (input: {
  operation: AcceptScheduleClientOperation
  request: AcceptScheduleRequestTransport
}): AcceptScheduleClient => {
  const surface = input.operation.http.accept
  return async ({ locationId, scheduleRunId, ...body }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path
          .replace(":locationId", encodeURIComponent(locationId))
          .replace(":scheduleRunId", encodeURIComponent(scheduleRunId)),
        body,
      },
      acceptScheduleResultSchema
    )
}
