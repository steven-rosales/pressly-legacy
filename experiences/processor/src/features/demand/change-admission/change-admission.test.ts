import {
  changeProductionAdmissionResultSchema,
  type ChangeProductionAdmissionResult,
} from "@pressly/production-system/contracts/demand/change-admission"
import { describe, expect, it, vi } from "vitest"
import {
  makeChangeAdmissionClient,
  type ChangeAdmissionRequestTransport,
} from "./client.ts"
import type { ChangeAdmissionClientOperation } from "./types.ts"

const operation: ChangeAdmissionClientOperation = {
  operationId: "production.change-admission.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    admission: {
      method: "PUT",
      path: "/production/locations/:locationId/orders/:productionOrderId/admission",
    },
  },
}

const result: ChangeProductionAdmissionResult = {
  locationId: "location/one",
  orderId: "order two",
  admissionOverride: "released",
  status: "eligible",
  version: 4,
  replayed: false,
}

describe("Processor change-admission experience", () => {
  it("maps the unchanged command body through generated metadata", async () => {
    const request = vi
      .fn<ChangeAdmissionRequestTransport>()
      .mockResolvedValue(result)
    const changeAdmission = makeChangeAdmissionClient({ operation, request })

    await expect(
      changeAdmission({
        locationId: "location/one",
        productionOrderId: "order two",
        target: "released",
        expectedVersion: 3,
        idempotencyKey: "change-admission-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "PUT",
        path: "/production/locations/location%2Fone/orders/order%20two/admission",
        body: {
          target: "released",
          expectedVersion: 3,
          idempotencyKey: "change-admission-key",
        },
      },
      changeProductionAdmissionResultSchema
    )
  })
})
