import {
  changeProductionAdmissionResultSchema,
  type ChangeProductionAdmissionResult,
} from "@pressly/production-system/contracts/demand/change-admission"
import type {
  ChangeAdmissionClient,
  ChangeAdmissionClientOperation,
  ChangeAdmissionRequest,
} from "./types.ts"

type ChangeAdmissionRequestBody = Pick<
  ChangeAdmissionRequest,
  "expectedVersion" | "idempotencyKey" | "target"
>

export type ChangeAdmissionRequestTransport = (
  input: Readonly<{
    method: "PUT"
    path: string
    body: ChangeAdmissionRequestBody
  }>,
  outputSchema: typeof changeProductionAdmissionResultSchema
) => Promise<ChangeProductionAdmissionResult>

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

export const makeChangeAdmissionClient =
  (input: {
    operation: ChangeAdmissionClientOperation
    request: ChangeAdmissionRequestTransport
  }): ChangeAdmissionClient =>
  async ({ locationId, productionOrderId, ...body }) =>
    input.request(
      {
        method: input.operation.http.admission.method,
        path: renderPath(input.operation.http.admission.path, {
          locationId,
          productionOrderId,
        }),
        body,
      },
      changeProductionAdmissionResultSchema
    )
