import {
  productionBatchMembershipMutationResultSchema,
  type ProductionBatchMembershipMutationResult,
} from "@pressly/production-system/contracts/floor/freeze-batch-membership"
import type {
  FreezeBatchMembershipClient,
  FreezeBatchMembershipClientOperation,
  FreezeBatchMembershipRequest,
} from "./types.ts"

type FreezeBatchMembershipRequestBody = Pick<
  FreezeBatchMembershipRequest,
  "expectedQueueVersion" | "expectedBatchVersion" | "idempotencyKey"
>

export type FreezeBatchMembershipRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: FreezeBatchMembershipRequestBody
  }>,
  outputSchema: typeof productionBatchMembershipMutationResultSchema
) => Promise<ProductionBatchMembershipMutationResult>

const renderPath = (
  template: string,
  parameters: Readonly<{
    locationId: string
    productionRunId: string
    productionBatchId: string
  }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeFreezeBatchMembershipClient =
  (input: {
    operation: FreezeBatchMembershipClientOperation
    request: FreezeBatchMembershipRequestTransport
  }): FreezeBatchMembershipClient =>
  async ({ locationId, productionRunId, productionBatchId, ...body }) =>
    input.request(
      {
        method: input.operation.http.freeze.method,
        path: renderPath(input.operation.http.freeze.path, {
          locationId,
          productionRunId,
          productionBatchId,
        }),
        body,
      },
      productionBatchMembershipMutationResultSchema
    )
