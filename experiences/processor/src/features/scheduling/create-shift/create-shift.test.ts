import {
  productionShiftSchema,
  type ProductionShift,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import { describe, expect, it, vi } from "vitest"
import {
  makeCreateShiftClient,
  type CreateShiftRequestTransport,
} from "./client.ts"
import type { CreateShiftClientOperation } from "./types.ts"

const operation: CreateShiftClientOperation = {
  operationId: "production.create-shift.v1",
  contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
  http: {
    shifts: {
      method: "POST",
      path: "/production/locations/:locationId/shifts",
    },
  },
}

const result: ProductionShift = {
  id: "10000000-0000-4000-8000-000000000001",
  locationId: "location/one",
  startsAt: "2026-08-22T13:00:00.000Z",
  endsAt: "2026-08-22T21:00:00.000Z",
  timezone: "America/New_York",
  effectiveFolderCount: 4,
  status: "open",
  version: 1,
}

describe("Processor create-shift experience", () => {
  it("maps the unchanged command body through generated metadata", async () => {
    const request = vi
      .fn<CreateShiftRequestTransport>()
      .mockResolvedValue(result)
    const createShift = makeCreateShiftClient({ operation, request })

    await expect(
      createShift({
        locationId: "location/one",
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        timezone: result.timezone,
        effectiveFolderCount: result.effectiveFolderCount,
        idempotencyKey: "create-shift-key",
      })
    ).resolves.toEqual(result)

    expect(request).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/production/locations/location%2Fone/shifts",
        body: {
          startsAt: result.startsAt,
          endsAt: result.endsAt,
          timezone: result.timezone,
          effectiveFolderCount: result.effectiveFolderCount,
          idempotencyKey: "create-shift-key",
        },
      },
      productionShiftSchema
    )
  })
})
