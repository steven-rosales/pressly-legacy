import type {
  ProcessorOrderAuditEntry,
  ProcessorOrderContext,
} from "../../contracts/operational-order.ts"
import { invariantViolationError } from "@pressly/errors/factories"
import {
  resolveOperationalOrders,
  type OperationalOrderReference,
  type ResolveOperationalOrderCanonical,
} from "./operational-order.ts"

export type OperationalOrderAuditFacts = Readonly<{
  sources: readonly Readonly<{
    canonicalOrderId: string
    name: string
    observedAt: Date
  }>[]
  orderCommands: readonly Readonly<{
    canonicalOrderId: string
    code: string
    actorId: string
    occurredAt: Date
  }>[]
  productionCommands: readonly Readonly<{
    productionOrderId: string
    code: string
    actorId: string
    occurredAt: Date
  }>[]
}>

export type LoadOperationalOrderAudit = (input: {
  canonicalOrderIds: readonly string[]
  productionOrderIds: readonly string[]
}) => Promise<OperationalOrderAuditFacts>

export type OperationalOrderContextResolution = Readonly<{
  identity: Readonly<{
    displayNumber: string
    customerDisplayName: string | null
  }>
  canonical: ProcessorOrderContext | null
}>

export const requireOperationalOrderContext = (
  contexts: ReadonlyMap<string, OperationalOrderContextResolution>,
  referenceId: string
): OperationalOrderContextResolution => {
  const context = contexts.get(referenceId)
  if (context === undefined)
    throw invariantViolationError({
      code: "processor_order_context_unresolved",
      message: `Processor order context was not resolved for ${referenceId}.`,
    })
  return context
}

const append = <Value>(
  map: Map<string, Value[]>,
  key: string,
  value: Value
): void => {
  map.set(key, [...(map.get(key) ?? []), value])
}

const auditSort = (
  left: ProcessorOrderAuditEntry,
  right: ProcessorOrderAuditEntry
): number => {
  const occurredAt = Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
  if (occurredAt !== 0) return occurredAt
  return [left.kind, left.code, left.actor, left.outcome ?? ""]
    .join("\u0000")
    .localeCompare(
      [right.kind, right.code, right.actor, right.outcome ?? ""].join("\u0000")
    )
}

export const recentOperationalOrderAudit = (
  ...groups: readonly (readonly ProcessorOrderAuditEntry[])[]
): ProcessorOrderAuditEntry[] =>
  groups
    .flatMap((group) => [...group])
    .sort(auditSort)
    .slice(0, 8)

export const loadOperationalOrderContexts = async (input: {
  references: readonly OperationalOrderReference[]
  resolve: ResolveOperationalOrderCanonical
  loadAudit: LoadOperationalOrderAudit
}): Promise<ReadonlyMap<string, OperationalOrderContextResolution>> => {
  const resolutions = await resolveOperationalOrders(
    input.resolve,
    input.references
  )
  if (resolutions.size === 0) return new Map()
  const referencesById = new Map(
    input.references.map((reference) => [reference.referenceId, reference])
  )
  const canonicalOrderIds = [
    ...new Set(
      [...resolutions.values()].flatMap(({ canonical }) =>
        canonical === null ? [] : [canonical.canonicalOrderId]
      )
    ),
  ]
  const productionOrderIds = [
    ...new Set(
      [...resolutions.keys()].flatMap((referenceId) => {
        const productionOrderId =
          referencesById.get(referenceId)?.productionOrderId ?? null
        return productionOrderId === null ? [] : [productionOrderId]
      })
    ),
  ]
  const facts = await input.loadAudit({
    canonicalOrderIds,
    productionOrderIds,
  })
  const sourceByCanonicalOrder = new Map<string, Readonly<{ name: string }>>()
  const auditByCanonicalOrder = new Map<string, ProcessorOrderAuditEntry[]>()
  const auditByProductionOrder = new Map<string, ProcessorOrderAuditEntry[]>()
  for (const source of facts.sources) {
    if (!sourceByCanonicalOrder.has(source.canonicalOrderId))
      sourceByCanonicalOrder.set(source.canonicalOrderId, {
        name: source.name,
      })
    append(auditByCanonicalOrder, source.canonicalOrderId, {
      kind: "source_observation",
      code: "source_observation",
      occurredAt: source.observedAt.toISOString(),
      actor: source.name,
      outcome: null,
    })
  }
  for (const command of facts.orderCommands)
    append(auditByCanonicalOrder, command.canonicalOrderId, {
      kind: "order_command",
      code: command.code,
      occurredAt: command.occurredAt.toISOString(),
      actor: command.actorId,
      outcome: null,
    })
  for (const command of facts.productionCommands)
    append(auditByProductionOrder, command.productionOrderId, {
      kind: "production_command",
      code: command.code,
      occurredAt: command.occurredAt.toISOString(),
      actor: command.actorId,
      outcome: null,
    })

  const contexts = new Map<string, OperationalOrderContextResolution>()
  for (const [referenceId, resolved] of resolutions) {
    if (resolved.canonical === null) {
      contexts.set(referenceId, {
        identity: resolved.identity,
        canonical: null,
      })
      continue
    }
    const productionOrderId =
      referencesById.get(referenceId)?.productionOrderId ?? null
    contexts.set(referenceId, {
      identity: resolved.identity,
      canonical: {
        ...resolved.canonical,
        source:
          sourceByCanonicalOrder.get(resolved.canonical.canonicalOrderId) ??
          null,
        audit: recentOperationalOrderAudit(
          auditByCanonicalOrder.get(resolved.canonical.canonicalOrderId) ?? [],
          productionOrderId === null
            ? []
            : (auditByProductionOrder.get(productionOrderId) ?? [])
        ),
      },
    })
  }
  return contexts
}
