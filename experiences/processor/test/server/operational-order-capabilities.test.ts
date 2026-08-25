import {
  listRecentOrderAuditV1CapabilityContract,
  type ListRecentOrderAuditV1Capability,
} from "@pressly/orders-system/capabilities/list-recent-order-audit-v1"
import {
  resolveCanonicalOrdersByFulfillmentV1CapabilityContract,
  type ResolveCanonicalOrdersByFulfillmentV1Capability,
} from "@pressly/orders-system/capabilities/resolve-canonical-orders-by-fulfillment-v1"
import {
  listRecentProductionOrderActivityV1CapabilityContract,
  type ListRecentProductionOrderActivityV1Capability,
} from "@pressly/production-system/capabilities/list-recent-order-activity-v1"
import {
  resolveProductionFulfillmentReferencesV1CapabilityContract,
  type ResolveProductionFulfillmentReferencesV1Capability,
} from "@pressly/production-system/capabilities/resolve-fulfillment-references-v1"
import { describe, expect, it } from "vitest"

import { makeProcessorOperationalOrderCapabilities } from "../../src/server/model/operational-order-capabilities.ts"

const productionOrderId = "10000000-0000-4000-8000-000000000001"
const fulfillmentId = "20000000-0000-4000-8000-000000000001"
const canonicalOrderId = "30000000-0000-4000-8000-000000000001"

const production = {
  resolveFulfillmentReferencesV1: {
    contract: resolveProductionFulfillmentReferencesV1CapabilityContract,
    resolve: async (references) =>
      new Map(
        references.map((reference) => [
          reference.referenceId,
          reference.productionOrderId === productionOrderId
            ? { fulfillmentId }
            : null,
        ])
      ),
  } satisfies ResolveProductionFulfillmentReferencesV1Capability,
  listRecentOrderActivityV1: {
    contract: listRecentProductionOrderActivityV1CapabilityContract,
    list: async () => [
      {
        productionOrderId,
        code: "production_order_priority_changed",
        actorId: "operator",
        occurredAt: new Date("2026-08-22T12:03:00.000Z"),
      },
    ],
  } satisfies ListRecentProductionOrderActivityV1Capability,
}

const orders = {
  resolveCanonicalOrdersByFulfillmentV1: {
    contract: resolveCanonicalOrdersByFulfillmentV1CapabilityContract,
    execute: async (references) =>
      new Map(
        references.map((reference) => [
          reference.referenceId,
          {
            canonicalOrderId,
            canonicalFulfillmentId: reference.fulfillmentId,
            displayNumber: "ORD-42",
            customer: {
              resolution: "resolved" as const,
              userId: "40000000-0000-4000-8000-000000000001",
              firstName: "Ada",
              lastName: "Lovelace",
              businessName: null,
              phone: "555-0100",
            },
            commercialState: "open" as const,
            admissionState: "released" as const,
            versions: { order: 3, fulfillment: 4 },
          },
        ])
      ),
  } satisfies ResolveCanonicalOrdersByFulfillmentV1Capability,
  listRecentOrderAuditV1: {
    contract: listRecentOrderAuditV1CapabilityContract,
    execute: async () => ({
      sources: [
        {
          canonicalOrderId,
          name: "cents",
          observedAt: new Date("2026-08-22T12:01:00.000Z"),
        },
      ],
      commands: [
        {
          canonicalOrderId,
          code: "order_created",
          actorId: "manager",
          occurredAt: new Date("2026-08-22T12:02:00.000Z"),
        },
      ],
    }),
  } satisfies ListRecentOrderAuditV1Capability,
}

describe("Processor operational-order capability composition", () => {
  it("composes Production fulfillment identity with canonical Orders facts", async () => {
    const capabilities = makeProcessorOperationalOrderCapabilities({
      production,
      orders,
    })

    await expect(
      capabilities.resolveOrderCanonical([
        {
          referenceId: `production:${productionOrderId}`,
          productionOrderId,
          orderDemandId: null,
          fallbackDisplayNumber: "fallback",
        },
        {
          referenceId: "demand:missing",
          productionOrderId: null,
          orderDemandId: "50000000-0000-4000-8000-000000000001",
          fallbackDisplayNumber: "missing",
        },
      ])
    ).resolves.toEqual(
      new Map([
        [
          `production:${productionOrderId}`,
          expect.objectContaining({
            canonicalOrderId,
            canonicalFulfillmentId: fulfillmentId,
            displayNumber: "ORD-42",
          }),
        ],
        ["demand:missing", null],
      ])
    )
  })

  it("merges owner-specific audit without a multi-schema adapter", async () => {
    const capabilities = makeProcessorOperationalOrderCapabilities({
      production,
      orders,
    })

    await expect(
      capabilities.loadOrderAudit({
        canonicalOrderIds: [canonicalOrderId],
        productionOrderIds: [productionOrderId],
      })
    ).resolves.toEqual({
      sources: [expect.objectContaining({ canonicalOrderId, name: "cents" })],
      orderCommands: [
        expect.objectContaining({ canonicalOrderId, code: "order_created" }),
      ],
      productionCommands: [
        expect.objectContaining({
          productionOrderId,
          code: "production_order_priority_changed",
        }),
      ],
    })
  })
})
