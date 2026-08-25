import {
  scheduleProposalSchema,
  type ScheduleProposal,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import type {
  LoadScheduleClient,
  LoadScheduleClientOperation,
} from "./types.ts"

export type LoadScheduleRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
  }>,
  outputSchema: typeof scheduleProposalSchema
) => Promise<ScheduleProposal>

const renderPath = (
  template: string,
  parameters: Readonly<{
    locationId: string
    scheduleRunId: string
  }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeLoadScheduleClient =
  (input: {
    operation: LoadScheduleClientOperation
    request: LoadScheduleRequestTransport
  }): LoadScheduleClient =>
  async (locationId, scheduleRunId) =>
    input.request(
      {
        method: input.operation.http.request.method,
        path: renderPath(input.operation.http.request.path, {
          locationId,
          scheduleRunId,
        }),
      },
      scheduleProposalSchema
    )
