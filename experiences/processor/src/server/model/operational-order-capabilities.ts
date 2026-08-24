import type { ListRecentOrderAuditV1Capability } from "@pressly/orders-system/capabilities/list-recent-order-audit-v1"
import type { ResolveCanonicalOrdersByFulfillmentV1Capability } from "@pressly/orders-system/capabilities/resolve-canonical-orders-by-fulfillment-v1"
import { invariantViolationError } from "@pressly/errors/factories"
import type { ListRecentProductionOrderActivityV1Capability } from "@pressly/production-system/capabilities/list-recent-order-activity-v1"
import type { ResolveProductionFulfillmentReferencesV1Capability } from "@pressly/production-system/capabilities/resolve-fulfillment-references-v1"

import type {
  LoadOperationalOrderAudit,
  OperationalOrderAuditFacts,
} from "./operational-order-audit.ts"
import type {
  OperationalOrderCanonical,
  ResolveOperationalOrderCanonical,
} from "./operational-order.ts"

export type ProcessorOperationalOrderCapabilityDependencies = Readonly<{
  production: Readonly<{
    resolveFulfillmentReferencesV1: ResolveProductionFulfillmentReferencesV1Capability
    listRecentOrderActivityV1: ListRecentProductionOrderActivityV1Capability
  }>
  orders: Readonly<{
    resolveCanonicalOrdersByFulfillmentV1: ResolveCanonicalOrdersByFulfillmentV1Capability
    listRecentOrderAuditV1: ListRecentOrderAuditV1Capability
  }>
}>

const unresolvedCapabilityReference = (
  owner: "Orders" | "Production",
  referenceId: string
): never => {
  throw invariantViolationError({
    code: "processor_operational_order_capability_incomplete",
    message: `${owner} did not resolve Processor operational-order reference ${referenceId}.`,
  })
}

export const makeResolveOperationalOrderCanonical =
  (
    dependencies: ProcessorOperationalOrderCapabilityDependencies
  ): ResolveOperationalOrderCanonical =>
  async (references) => {
    const productionByReference =
      await dependencies.production.resolveFulfillmentReferencesV1.resolve(
        references.map((reference) => ({
          referenceId: reference.referenceId,
          productionOrderId: reference.productionOrderId,
          orderDemandId: reference.orderDemandId,
        }))
      )

    const canonicalReferences = references.flatMap((reference) => {
      if (!productionByReference.has(reference.referenceId))
        return unresolvedCapabilityReference(
          "Production",
          reference.referenceId
        )
      const production =
        productionByReference.get(reference.referenceId) ?? null
      return production === null
        ? []
        : [
            {
              referenceId: reference.referenceId,
              fulfillmentId: production.fulfillmentId,
            },
          ]
    })
    const canonicalByReference =
      await dependencies.orders.resolveCanonicalOrdersByFulfillmentV1.execute(
        canonicalReferences
      )

    return new Map(
      references.map((reference) => {
        const production =
          productionByReference.get(reference.referenceId) ?? null
        if (production === null) return [reference.referenceId, null] as const
        if (!canonicalByReference.has(reference.referenceId))
          return unresolvedCapabilityReference("Orders", reference.referenceId)
        return [
          reference.referenceId,
          (canonicalByReference.get(reference.referenceId) ??
            null) satisfies OperationalOrderCanonical | null,
        ] as const
      })
    )
  }

export const makeLoadOperationalOrderAudit =
  (
    dependencies: ProcessorOperationalOrderCapabilityDependencies
  ): LoadOperationalOrderAudit =>
  async (input): Promise<OperationalOrderAuditFacts> => {
    const [orders, productionCommands] = await Promise.all([
      dependencies.orders.listRecentOrderAuditV1.execute({
        canonicalOrderIds: input.canonicalOrderIds,
      }),
      dependencies.production.listRecentOrderActivityV1.list({
        productionOrderIds: input.productionOrderIds,
      }),
    ])

    return {
      sources: orders.sources,
      orderCommands: orders.commands,
      productionCommands,
    }
  }

export const makeProcessorOperationalOrderCapabilities = (
  dependencies: ProcessorOperationalOrderCapabilityDependencies
) =>
  Object.freeze({
    resolveOrderCanonical: makeResolveOperationalOrderCanonical(dependencies),
    loadOrderAudit: makeLoadOperationalOrderAudit(dependencies),
  })
