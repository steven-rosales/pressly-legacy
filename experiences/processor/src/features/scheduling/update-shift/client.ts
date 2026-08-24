import {
  updateProductionShiftResultSchema,
  type UpdateProductionShiftResult,
} from "@pressly/production-system/contracts/scheduling/update-shift"
import type {
  UpdateShiftClient,
  UpdateShiftClientOperation,
  UpdateShiftRequest,
} from "./types.ts"

type UpdateShiftRequestBody = Omit<
  UpdateShiftRequest,
  "locationId" | "productionShiftId"
>

export type UpdateShiftRequestTransport = (
  input: Readonly<{
    method: "PATCH"
    path: string
    body: UpdateShiftRequestBody
  }>,
  outputSchema: typeof updateProductionShiftResultSchema
) => Promise<UpdateProductionShiftResult>

export const makeUpdateShiftClient = (input: {
  operation: UpdateShiftClientOperation
  request: UpdateShiftRequestTransport
}): UpdateShiftClient => {
  const surface = input.operation.http.request
  return async ({ locationId, productionShiftId, ...body }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path
          .replace(":locationId", encodeURIComponent(locationId))
          .replace(":productionShiftId", encodeURIComponent(productionShiftId)),
        body,
      },
      updateProductionShiftResultSchema
    )
}
