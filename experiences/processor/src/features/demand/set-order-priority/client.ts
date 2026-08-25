import {
  productionMutationResultSchema,
  type ProductionMutationResult,
} from "@pressly/production-system/contracts/demand/set-order-priority"
import type {
  SetOrderPriorityClient,
  SetOrderPriorityClientOperation,
  SetOrderPriorityRequest,
} from "./types.ts"

type SetOrderPriorityRequestBody = Pick<
  SetOrderPriorityRequest,
  "expectedVersion" | "idempotencyKey" | "priority"
>

export type SetOrderPriorityRequestTransport = (
  input: Readonly<{
    method: "PATCH"
    path: string
    body: SetOrderPriorityRequestBody
  }>,
  outputSchema: typeof productionMutationResultSchema
) => Promise<ProductionMutationResult>

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

export const makeSetOrderPriorityClient =
  (input: {
    operation: SetOrderPriorityClientOperation
    request: SetOrderPriorityRequestTransport
  }): SetOrderPriorityClient =>
  async ({ locationId, productionOrderId, ...body }) =>
    input.request(
      {
        method: input.operation.http.priority.method,
        path: renderPath(input.operation.http.priority.path, {
          locationId,
          productionOrderId,
        }),
        body,
      },
      productionMutationResultSchema
    )
