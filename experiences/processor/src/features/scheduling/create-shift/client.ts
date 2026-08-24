import {
  productionShiftSchema,
  type ProductionShift,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import type {
  CreateShiftClient,
  CreateShiftClientOperation,
  CreateShiftRequest,
} from "./types.ts"

type CreateShiftRequestBody = Omit<CreateShiftRequest, "locationId">

export type CreateShiftRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: CreateShiftRequestBody
  }>,
  outputSchema: typeof productionShiftSchema
) => Promise<ProductionShift>

export const makeCreateShiftClient =
  (input: {
    operation: CreateShiftClientOperation
    request: CreateShiftRequestTransport
  }): CreateShiftClient =>
  async ({ locationId, ...body }) =>
    input.request(
      {
        method: input.operation.http.shifts.method,
        path: input.operation.http.shifts.path.replace(
          ":locationId",
          encodeURIComponent(locationId)
        ),
        body,
      },
      productionShiftSchema
    )
