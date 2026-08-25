import { isAppError } from "@pressly/errors/app-error"
import { describe, expect, it, vi } from "vitest"
import {
  canonicalCustomerDisplayName,
  resolveOperationalOrders,
  uniqueOperationalOrderReferences,
  type OperationalOrderCanonical,
  type OperationalOrderReference,
} from "../../src/server.ts"
import { serverFixtureIds as ids, serverFixtureLocationId } from "./fixtures.ts"

const canonical = (): OperationalOrderCanonical => ({
  canonicalOrderId: ids.canonicalOrder,
  canonicalFulfillmentId: ids.fulfillment,
  displayNumber: "  ",
  customer: {
    resolution: "resolved",
    userId: null,
    firstName: "  Avery ",
    lastName: "  Press  ",
    businessName: null,
    phone: null,
  },
  commercialState: "open",
  admissionState: "released",
  versions: { order: 2, fulfillment: 3 },
})

describe("Processor operational-order identity model", () => {
  it("deduplicates by reference using the last value and owns fallback identity", async () => {
    const first: OperationalOrderReference = {
      referenceId: `production:${ids.order}`,
      productionOrderId: ids.order,
      orderDemandId: null,
      fallbackDisplayNumber: "FIRST",
    }
    const last = { ...first, fallbackDisplayNumber: "LAST" }
    expect(uniqueOperationalOrderReferences([first, last])).toEqual([last])

    const resolve = vi.fn(
      async (references: readonly OperationalOrderReference[]) =>
        new Map(references.map((reference) => [reference.referenceId, null]))
    )
    const resolutions = await resolveOperationalOrders(resolve, [first, last])
    expect(resolve).toHaveBeenCalledWith([last])
    expect(resolutions.get(last.referenceId)).toEqual({
      identity: { displayNumber: "LAST", customerDisplayName: null },
      canonical: null,
    })
  })

  it("derives canonical display identity without inventing missing names", async () => {
    const reference: OperationalOrderReference = {
      referenceId: `production:${ids.order}`,
      productionOrderId: ids.order,
      orderDemandId: null,
      fallbackDisplayNumber: "FALLBACK",
    }
    const value = canonical()
    const resolutions = await resolveOperationalOrders(
      async () => new Map([[reference.referenceId, value]]),
      [reference]
    )
    expect(resolutions.get(reference.referenceId)).toEqual({
      identity: {
        displayNumber: "FALLBACK",
        customerDisplayName: "Avery Press",
      },
      canonical: value,
    })
    expect(
      canonicalCustomerDisplayName({
        ...value.customer,
        businessName: "  Pressly   Laundry ",
      })
    ).toBe("Pressly Laundry")
  })

  it("fails closed when the injected identity port omits a requested reference", async () => {
    const reference: OperationalOrderReference = {
      referenceId: `production:${ids.order}`,
      productionOrderId: ids.order,
      orderDemandId: null,
      fallbackDisplayNumber: serverFixtureLocationId,
    }
    try {
      await resolveOperationalOrders(async () => new Map(), [reference])
      expect.unreachable("missing identity should fail")
    } catch (error) {
      expect(isAppError(error)).toBe(true)
      if (isAppError(error))
        expect(error.code).toBe("processor_order_identity_unresolved")
    }
  })
})
