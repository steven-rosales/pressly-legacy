import {
  recordOrderIntakeResultSchema,
  type RecordOrderIntakeResult,
} from "@pressly/production-system/contracts/demand/record-order-intake"
import type {
  RecordOrderIntakeClient,
  RecordOrderIntakeClientOperation,
  RecordOrderIntakeRequest,
} from "./types.ts"

type RecordOrderIntakeRequestBody = Pick<
  RecordOrderIntakeRequest,
  "bagCount" | "expectedVersion" | "idempotencyKey"
>

export type RecordOrderIntakeRequestTransport = (
  input: Readonly<{
    method: "PUT"
    path: string
    body: RecordOrderIntakeRequestBody
  }>,
  outputSchema: typeof recordOrderIntakeResultSchema
) => Promise<RecordOrderIntakeResult>

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

export const makeRecordOrderIntakeClient =
  (input: {
    operation: RecordOrderIntakeClientOperation
    request: RecordOrderIntakeRequestTransport
  }): RecordOrderIntakeClient =>
  async ({ locationId, productionOrderId, ...body }) =>
    input.request(
      {
        method: input.operation.http.intake.method,
        path: renderPath(input.operation.http.intake.path, {
          locationId,
          productionOrderId,
        }),
        body,
      },
      recordOrderIntakeResultSchema
    )
