import {
  confirmProductionOrderOvertimeResultSchema,
  type ConfirmProductionOrderOvertimeCommand,
  type ConfirmProductionOrderOvertimeResult,
} from "@pressly/production-system/contracts/read-models/production-order-placement"
import type {
  ConfirmOrderOvertimeClient,
  ConfirmOrderOvertimeClientOperation,
} from "./types.ts"

type ConfirmOrderOvertimeRequestBody = Omit<
  ConfirmProductionOrderOvertimeCommand,
  "locationId" | "productionRunId" | "productionOrderId"
>

export type ConfirmOrderOvertimeRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: ConfirmOrderOvertimeRequestBody
  }>,
  outputSchema: typeof confirmProductionOrderOvertimeResultSchema
) => Promise<ConfirmProductionOrderOvertimeResult>

export const makeConfirmOrderOvertimeClient = (input: {
  operation: ConfirmOrderOvertimeClientOperation
  request: ConfirmOrderOvertimeRequestTransport
}): ConfirmOrderOvertimeClient => {
  const surface = input.operation.http["confirm-overtime"]
  return async ({ locationId, productionRunId, productionOrderId, ...body }) =>
    input.request(
      {
        method: surface.method,
        path: surface.path
          .replace(":locationId", encodeURIComponent(locationId))
          .replace(":productionRunId", encodeURIComponent(productionRunId))
          .replace(":productionOrderId", encodeURIComponent(productionOrderId)),
        body,
      },
      confirmProductionOrderOvertimeResultSchema
    )
}
