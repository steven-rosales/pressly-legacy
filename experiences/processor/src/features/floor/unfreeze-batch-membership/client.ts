import {
  productionBatchMembershipMutationResultSchema,
  type ProductionBatchMembershipMutationResult,
} from "@pressly/production-system/contracts/floor/unfreeze-batch-membership"
import type {
  UnfreezeBatchMembershipClient,
  UnfreezeBatchMembershipClientOperation,
  UnfreezeBatchMembershipRequest,
} from "./types.ts"

type UnfreezeBatchMembershipRequestBody = Pick<
  UnfreezeBatchMembershipRequest,
  "expectedQueueVersion" | "expectedBatchVersion" | "idempotencyKey"
>

export type UnfreezeBatchMembershipRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: UnfreezeBatchMembershipRequestBody
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

export const makeUnfreezeBatchMembershipClient =
  (input: {
    operation: UnfreezeBatchMembershipClientOperation
    request: UnfreezeBatchMembershipRequestTransport
  }): UnfreezeBatchMembershipClient =>
  async ({ locationId, productionRunId, productionBatchId, ...body }) =>
    input.request(
      {
        method: input.operation.http.unfreeze.method,
        path: renderPath(input.operation.http.unfreeze.path, {
          locationId,
          productionRunId,
          productionBatchId,
        }),
        body,
      },
      productionBatchMembershipMutationResultSchema
    )
