import type {
  ProcessorOperationalOrderIdentity,
  ProcessorOrderContext,
} from "../../contracts/operational-order.ts"
import { invariantViolationError } from "@pressly/errors/factories"

export type OperationalOrderReference = Readonly<{
  referenceId: string
  productionOrderId: string | null
  orderDemandId: string | null
  fallbackDisplayNumber: string
}>

export type OperationalOrderCanonical = Omit<
  ProcessorOrderContext,
  "audit" | "source"
>

export type ResolveOperationalOrderCanonical = (
  references: readonly OperationalOrderReference[]
) => Promise<ReadonlyMap<string, OperationalOrderCanonical | null>>

export type OperationalOrderResolution = Readonly<{
  identity: ProcessorOperationalOrderIdentity
  canonical: OperationalOrderCanonical | null
}>

const cleanNamePart = (value: string | null): string | null => {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? ""
  return normalized.length === 0 ? null : normalized
}

export const canonicalCustomerDisplayName = (
  customer: OperationalOrderCanonical["customer"]
): string | null => {
  const businessName = cleanNamePart(customer.businessName)
  if (businessName !== null) return businessName
  const personalName = [customer.firstName, customer.lastName]
    .map(cleanNamePart)
    .filter((part): part is string => part !== null)
    .join(" ")
  return personalName.length === 0 ? null : personalName
}

export const productionOrderReferenceId = (productionOrderId: string): string =>
  `production:${productionOrderId}`

export const orderDemandReferenceId = (orderDemandId: string): string =>
  `demand:${orderDemandId}`

export const uniqueOperationalOrderReferences = (
  references: readonly OperationalOrderReference[]
): readonly OperationalOrderReference[] => [
  ...new Map(
    references.map((reference) => [reference.referenceId, reference])
  ).values(),
]

export const resolveOperationalOrders = async (
  resolve: ResolveOperationalOrderCanonical,
  input: readonly OperationalOrderReference[]
): Promise<ReadonlyMap<string, OperationalOrderResolution>> => {
  const references = uniqueOperationalOrderReferences(input)
  if (references.length === 0) return new Map()
  const canonicalByReference = await resolve(references)
  return new Map(
    references.map((reference) => {
      if (!canonicalByReference.has(reference.referenceId))
        throw invariantViolationError({
          code: "processor_order_identity_unresolved",
          message: `Processor order identity was not resolved for ${reference.referenceId}.`,
        })
      const canonical = canonicalByReference.get(reference.referenceId) ?? null
      const displayNumber = canonical?.displayNumber?.trim() || null
      return [
        reference.referenceId,
        {
          identity: {
            displayNumber: displayNumber ?? reference.fallbackDisplayNumber,
            customerDisplayName:
              canonical === null
                ? null
                : canonicalCustomerDisplayName(canonical.customer),
          },
          canonical,
        },
      ] as const
    })
  )
}

export const requireOperationalOrder = (
  resolutions: ReadonlyMap<string, OperationalOrderResolution>,
  referenceId: string
): OperationalOrderResolution => {
  const resolved = resolutions.get(referenceId)
  if (resolved === undefined)
    throw invariantViolationError({
      code: "processor_order_identity_unresolved",
      message: `Processor order identity was not resolved for ${referenceId}.`,
    })
  return resolved
}
