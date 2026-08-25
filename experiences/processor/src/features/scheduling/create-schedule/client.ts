import {
  scheduleProposalSchema,
  type ScheduleProposal,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import { type CreateScheduleCommand } from "@pressly/production-system/contracts/scheduling/create-schedule"
import type {
  CreateScheduleClient,
  CreateScheduleClientOperation,
} from "./types.ts"

type CreateScheduleRequestBody = Omit<CreateScheduleCommand, "locationId">

export type CreateScheduleRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: CreateScheduleRequestBody
  }>,
  outputSchema: typeof scheduleProposalSchema
) => Promise<ScheduleProposal>

export const makeCreateScheduleClient = (input: {
  operation: CreateScheduleClientOperation
  request: CreateScheduleRequestTransport
}): CreateScheduleClient => {
  const surface = input.operation.http.schedules
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
      scheduleProposalSchema
    )
}
