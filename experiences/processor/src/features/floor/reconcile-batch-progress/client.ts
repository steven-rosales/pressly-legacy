import {
  productionBatchProgressReconciliationResultSchema,
  type ProductionBatchProgressReconciliationResult,
} from "@pressly/production-system/contracts/floor/reconcile-batch-progress"
import type {
  ReconcileBatchProgressClient,
  ReconcileBatchProgressClientOperation,
  ReconcileBatchProgressRequest,
} from "./types.ts"

type ReconcileBatchProgressRequestBody = Omit<
  ReconcileBatchProgressRequest,
  "locationId" | "productionRunId" | "productionBatchId"
>

export type ReconcileBatchProgressRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: ReconcileBatchProgressRequestBody
  }>,
  outputSchema: typeof productionBatchProgressReconciliationResultSchema
) => Promise<ProductionBatchProgressReconciliationResult>

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

export const makeReconcileBatchProgressClient =
  (input: {
    operation: ReconcileBatchProgressClientOperation
    request: ReconcileBatchProgressRequestTransport
  }): ReconcileBatchProgressClient =>
  async ({ locationId, productionRunId, productionBatchId, ...body }) => {
    const surface = input.operation.http["progress-reconciliation"]
    return input.request(
      {
        method: surface.method,
        path: renderPath(surface.path, {
          locationId,
          productionRunId,
          productionBatchId,
        }),
        body,
      },
      productionBatchProgressReconciliationResultSchema
    )
  }
