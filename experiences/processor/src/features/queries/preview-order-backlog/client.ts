import {
  processorProductionOrderBacklogPreviewSchema,
  type ProcessorProductionOrderBacklogPreview,
} from "../../../contracts/production-order-backlog.ts"
import type {
  PreviewProductionOrderBacklogClient,
  PreviewProductionOrderBacklogClientOperation,
  PreviewProductionOrderBacklogRequest,
} from "./types.ts"

export type PreviewProductionOrderBacklogRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: PreviewProductionOrderBacklogRequest
  }>,
  outputSchema: typeof processorProductionOrderBacklogPreviewSchema
) => Promise<ProcessorProductionOrderBacklogPreview>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makePreviewProductionOrderBacklogClient =
  (input: {
    operation: PreviewProductionOrderBacklogClientOperation
    request: PreviewProductionOrderBacklogRequestTransport
  }): PreviewProductionOrderBacklogClient =>
  async ({ locationId, request: body }) =>
    input.request(
      {
        method: input.operation.http.preview.method,
        path: renderPath(input.operation.http.preview.path, { locationId }),
        body,
      },
      processorProductionOrderBacklogPreviewSchema
    )
