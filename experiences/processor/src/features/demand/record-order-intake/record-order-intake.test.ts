import {
  recordOrderIntakeResultSchema,
  type RecordOrderIntakeResult,
} from "@pressly/production-system/contracts/demand/record-order-intake"
import { describe, expect, it, vi } from "vitest"
import {
  makeRecordOrderIntakeClient,
  type RecordOrderIntakeRequestTransport,
} from "./client.ts"
import type { RecordOrderIntakeClientOperation } from "./types.ts"

const operation: RecordOrderIntakeClientOperation = {
  operationId: "production.record-order-intake.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    intake: {
      method: "PUT",
      path: "/production/locations/:locationId/orders/:productionOrderId/intake",
    },
  },
}

const result: RecordOrderIntakeResult = {
  locationId: "location/one",
  orderId: "order two",
  bagCount: 3,
  bagCountProvenance: "operator_intake",
  intakeVersion: 2,
  version: 4,
  replayed: false,
}

describe("Processor record-order-intake experience", () => {
  it("maps the unchanged command body through declared metadata", async () => {
    const request = vi
      .fn<RecordOrderIntakeRequestTransport>()
      .mockResolvedValue(result)
    const recordIntake = makeRecordOrderIntakeClient({ operation, request })

    await expect(
      recordIntake({
        locationId: "location/one",
        productionOrderId: "order two",
        bagCount: 3,
        expectedVersion: 3,
        idempotencyKey: "record-intake-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "PUT",
        path: "/production/locations/location%2Fone/orders/order%20two/intake",
        body: {
          bagCount: 3,
          expectedVersion: 3,
          idempotencyKey: "record-intake-key",
        },
      },
      recordOrderIntakeResultSchema
    )
  })
})
