import {
  changeProductionOrderResolutionResultSchema,
  type ChangeProductionOrderResolutionCommand,
  type ChangeProductionOrderResolutionResult,
} from "@pressly/production-system/contracts/demand/change-order-resolution"
import type {
  ChangeOrderResolutionClient,
  ChangeOrderResolutionClientOperation,
} from "./types.ts"

type ChangeOrderResolutionRequestBody = Omit<
  ChangeProductionOrderResolutionCommand,
  "locationId" | "orderId"
>

export type ChangeOrderResolutionRequestTransport = (
  input: Readonly<{
    method: "PUT"
    path: string
    body: ChangeOrderResolutionRequestBody
  }>,
  outputSchema: typeof changeProductionOrderResolutionResultSchema
) => Promise<ChangeProductionOrderResolutionResult>

const renderPath = (
  template: string,
  parameters: Readonly<{
    locationId: string
    productionOrderId: string
  }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeChangeOrderResolutionClient =
  (input: {
    operation: ChangeOrderResolutionClientOperation
    request: ChangeOrderResolutionRequestTransport
  }): ChangeOrderResolutionClient =>
  async ({ locationId, productionOrderId, request }) =>
    input.request(
      {
        method: input.operation.http.resolution.method,
        path: renderPath(input.operation.http.resolution.path, {
          locationId,
          productionOrderId,
        }),
        body: request,
      },
      changeProductionOrderResolutionResultSchema
    )
