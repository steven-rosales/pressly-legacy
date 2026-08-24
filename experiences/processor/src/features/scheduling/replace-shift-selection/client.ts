import {
  replaceProductionShiftSelectionResultSchema,
  type ReplaceProductionShiftSelectionCommand,
  type ReplaceProductionShiftSelectionResult,
} from "@pressly/production-system/contracts/scheduling/replace-shift-selection"
import type {
  ReplaceShiftSelectionClient,
  ReplaceShiftSelectionClientOperation,
} from "./types.ts"

type ReplaceShiftSelectionRequestBody = Omit<
  ReplaceProductionShiftSelectionCommand,
  "locationId" | "productionShiftId"
>

export type ReplaceShiftSelectionRequestTransport = (
  input: Readonly<{
    method: "PUT"
    path: string
    body: ReplaceShiftSelectionRequestBody
  }>,
  outputSchema: typeof replaceProductionShiftSelectionResultSchema
) => Promise<ReplaceProductionShiftSelectionResult>

export const makeReplaceShiftSelectionClient = (input: {
  operation: ReplaceShiftSelectionClientOperation
  request: ReplaceShiftSelectionRequestTransport
}): ReplaceShiftSelectionClient => {
  const surface = input.operation.http.selection
  return async ({ locationId, productionShiftId, ...body }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path
          .replace(":locationId", encodeURIComponent(locationId))
          .replace(":productionShiftId", encodeURIComponent(productionShiftId)),
        body,
      },
      replaceProductionShiftSelectionResultSchema
    )
}
