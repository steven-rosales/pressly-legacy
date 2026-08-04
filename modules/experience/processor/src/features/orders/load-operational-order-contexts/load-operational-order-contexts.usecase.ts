import { invariantViolationError } from '@pressly/errors/factories';
import type {
  OperationalOrderAuditEntry,
  OperationalOrderContextResolution,
  OperationalOrderIdentityReference,
} from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  recentOperationalOrderAudit,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import type { OperationalOrderAuditPort } from '../../../foundations/ports/operational-order-audit/operational-order-audit.port.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
import type { OperationalOrderControlContextSource } from './load-operational-order-contexts.model.ts';

export type LoadOperationalOrderContexts = (
  references: readonly OperationalOrderIdentityReference[],
) => Promise<ReadonlyMap<string, OperationalOrderContextResolution>>;

export type LoadOperationalOrderControlContexts = (
  items: readonly OperationalOrderControlContextSource[],
) => Promise<ReadonlyMap<string, OperationalOrderContextResolution>>;

const append = <Value>(
  map: Map<string, Value[]>,
  key: string,
  value: Value,
): void => {
  map.set(key, [...(map.get(key) ?? []), value]);
};

export const makeLoadOperationalOrderContexts =
  (deps: {
    identities: OperationalOrderIdentityPort;
    audit: OperationalOrderAuditPort;
  }): LoadOperationalOrderContexts =>
  async (inputReferences) => {
    const references = uniqueOperationalOrderReferences(inputReferences);
    if (references.length === 0) return new Map();

    const identities = await deps.identities.resolve(references);
    const canonicalOrderIds = [
      ...new Set(
        [...identities.values()].flatMap(({ canonical }) =>
          canonical === null ? [] : [canonical.canonicalOrderId],
        ),
      ),
    ];
    const productionOrderIds = [
      ...new Set(
        references.flatMap(({ productionOrderId }) =>
          productionOrderId === null ? [] : [productionOrderId],
        ),
      ),
    ];
    const facts = await deps.audit.load({
      canonicalOrderIds,
      productionOrderIds,
    });

    const sourceByCanonicalOrder = new Map<
      string,
      Readonly<{ name: string }>
    >();
    const auditByCanonicalOrder = new Map<
      string,
      OperationalOrderAuditEntry[]
    >();
    const auditByProductionOrder = new Map<
      string,
      OperationalOrderAuditEntry[]
    >();

    for (const source of facts.sources) {
      if (!sourceByCanonicalOrder.has(source.canonicalOrderId))
        sourceByCanonicalOrder.set(source.canonicalOrderId, {
          name: source.name,
        });
      append(auditByCanonicalOrder, source.canonicalOrderId, {
        kind: 'source_observation',
        code: 'source_observation',
        occurredAt: source.observedAt.toISOString(),
        actor: source.name,
        outcome: null,
      });
    }
    for (const command of facts.orderCommands)
      append(auditByCanonicalOrder, command.canonicalOrderId, {
        kind: 'order_command',
        code: command.code,
        occurredAt: command.occurredAt.toISOString(),
        actor: command.actorId,
        outcome: null,
      });
    for (const command of facts.productionCommands)
      append(auditByProductionOrder, command.productionOrderId, {
        kind: 'production_command',
        code: command.code,
        occurredAt: command.occurredAt.toISOString(),
        actor: command.actorId,
        outcome: null,
      });

    return new Map(
      references.map((reference) => {
        const resolved = identities.get(reference.referenceId);
        if (resolved === undefined)
          throw invariantViolationError({
            code: 'processor_order_identity_unresolved',
            message: `Processor order identity was not resolved for ${reference.referenceId}.`,
          });
        if (resolved.canonical === null)
          return [reference.referenceId, resolved] as const;

        return [
          reference.referenceId,
          {
            identity: resolved.identity,
            canonical: {
              ...resolved.canonical,
              source:
                sourceByCanonicalOrder.get(
                  resolved.canonical.canonicalOrderId,
                ) ?? null,
              audit: recentOperationalOrderAudit(
                auditByCanonicalOrder.get(
                  resolved.canonical.canonicalOrderId,
                ) ?? [],
                reference.productionOrderId === null
                  ? []
                  : (auditByProductionOrder.get(reference.productionOrderId) ??
                      []),
              ),
            },
          },
        ] as const;
      }),
    );
  };

export const makeLoadOperationalOrderControlContexts = (deps: {
  identities: OperationalOrderIdentityPort;
  audit: OperationalOrderAuditPort;
}): LoadOperationalOrderControlContexts => {
  const loadContexts = makeLoadOperationalOrderContexts(deps);
  return (items) =>
    loadContexts(
      items.map((item) => ({
        referenceId: item.order.id,
        productionOrderId: item.order.id,
        orderDemandId: null,
        fallbackDisplayNumber: item.order.externalOrderId,
      })),
    );
};
