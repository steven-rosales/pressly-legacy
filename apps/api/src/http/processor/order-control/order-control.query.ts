import {
  type ListProcessorOrderControlResult,
  type ListProductionOrderControlResult,
  type ProcessorOrderAuditEntry,
  type ProcessorOrderContext,
} from '@pressly/contracts';
import {
  and,
  desc,
  eq,
  inArray,
  laundryProduction,
  lte,
  orders,
  sql,
  type Database,
} from '@pressly/db';
import type { ProcessorOperationalOrderIdentityResolver } from '../operational-order-identity/operational-order-identity.query.ts';

const auditSort = (
  left: ProcessorOrderAuditEntry,
  right: ProcessorOrderAuditEntry,
): number => {
  const occurredAt = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  if (occurredAt !== 0) return occurredAt;
  return [left.kind, left.code, left.actor, left.outcome ?? '']
    .join('\u0000')
    .localeCompare(
      [right.kind, right.code, right.actor, right.outcome ?? ''].join('\u0000'),
    );
};

const RECENT_AUDIT_LIMIT = 8;

export const recentOrderAuditFor = (
  ...groups: readonly (readonly ProcessorOrderAuditEntry[])[]
): ProcessorOrderAuditEntry[] =>
  groups.flat().sort(auditSort).slice(0, RECENT_AUDIT_LIMIT);

export const makeProcessorOrderControlReadModel = (input: {
  db: Database;
  identities: ProcessorOperationalOrderIdentityResolver;
}) => ({
  compose: async (
    base: ListProductionOrderControlResult,
  ): Promise<ListProcessorOrderControlResult> => {
    if (base.items.length === 0)
      return { ...base, items: [] } satisfies ListProcessorOrderControlResult;

    const identityByOrder = await input.identities.resolve(
      base.items.map((item) => ({
        referenceId: item.order.id,
        productionOrderId: item.order.id,
        orderDemandId: null,
        fallbackDisplayNumber: item.order.externalOrderId,
      })),
    );
    const orderIds = [
      ...new Set(
        [...identityByOrder.values()].flatMap((resolved) =>
          resolved.canonical === null
            ? []
            : [resolved.canonical.canonicalOrderId],
        ),
      ),
    ];
    const productionOrderIds = base.items.map((item) => item.order.id);
    const sourceRows =
      orderIds.length === 0
        ? []
        : await input.db
            .select({
              orderId: orders.orderSourceLinks.orderId,
              source: orders.orderSourceLinks.source,
              observedAt: orders.orderSourceSnapshots.observedAt,
            })
            .from(orders.orderSourceLinks)
            .innerJoin(
              orders.orderSourceSnapshots,
              eq(
                orders.orderSourceSnapshots.sourceLinkId,
                orders.orderSourceLinks.id,
              ),
            )
            .where(inArray(orders.orderSourceLinks.orderId, orderIds))
            .orderBy(
              desc(orders.orderSourceSnapshots.observedAt),
              desc(orders.orderSourceLinks.id),
            );

    const rankedOrderCommands =
      orderIds.length === 0
        ? null
        : input.db
            .select({
              orderId: orders.orderCommandReceipts.orderId,
              reasonCode: orders.orderCommandReceipts.reasonCode,
              actorId: orders.orderCommandReceipts.actorId,
              createdAt: orders.orderCommandReceipts.createdAt,
              idempotencyKey: orders.orderCommandReceipts.idempotencyKey,
              partitionRank: sql<number>`row_number() over (
                partition by ${orders.orderCommandReceipts.orderId}
                order by ${orders.orderCommandReceipts.createdAt} desc,
                  ${orders.orderCommandReceipts.idempotencyKey} desc
              )`.as('partition_rank'),
            })
            .from(orders.orderCommandReceipts)
            .where(inArray(orders.orderCommandReceipts.orderId, orderIds))
            .as('ranked_order_commands');
    const orderCommandRows =
      rankedOrderCommands === null
        ? []
        : await input.db
            .select({
              orderId: rankedOrderCommands.orderId,
              reasonCode: rankedOrderCommands.reasonCode,
              actorId: rankedOrderCommands.actorId,
              createdAt: rankedOrderCommands.createdAt,
            })
            .from(rankedOrderCommands)
            .where(lte(rankedOrderCommands.partitionRank, RECENT_AUDIT_LIMIT))
            .orderBy(
              desc(rankedOrderCommands.createdAt),
              desc(rankedOrderCommands.idempotencyKey),
            );
    const rankedProductionCommands =
      productionOrderIds.length === 0
        ? null
        : input.db
            .select({
              productionOrderId: laundryProduction.workEvents.entityId,
              eventType: laundryProduction.workEvents.eventType,
              actorId: laundryProduction.workEvents.actorId,
              createdAt: laundryProduction.workEvents.createdAt,
              id: laundryProduction.workEvents.id,
              partitionRank: sql<number>`row_number() over (
                partition by ${laundryProduction.workEvents.entityId}
                order by ${laundryProduction.workEvents.createdAt} desc,
                  ${laundryProduction.workEvents.id} desc
              )`.as('partition_rank'),
            })
            .from(laundryProduction.workEvents)
            .where(
              and(
                eq(laundryProduction.workEvents.entityType, 'production_order'),
                inArray(
                  laundryProduction.workEvents.entityId,
                  productionOrderIds,
                ),
              ),
            )
            .as('ranked_production_order_commands');
    const productionCommandRows =
      rankedProductionCommands === null
        ? []
        : await input.db
            .select({
              productionOrderId: rankedProductionCommands.productionOrderId,
              eventType: rankedProductionCommands.eventType,
              actorId: rankedProductionCommands.actorId,
              createdAt: rankedProductionCommands.createdAt,
            })
            .from(rankedProductionCommands)
            .where(
              lte(rankedProductionCommands.partitionRank, RECENT_AUDIT_LIMIT),
            )
            .orderBy(
              desc(rankedProductionCommands.createdAt),
              desc(rankedProductionCommands.id),
            );

    type SelectedSource = Readonly<{
      name: string;
    }>;
    const sourceByOrder = new Map<string, SelectedSource>();
    for (const source of sourceRows) {
      if (sourceByOrder.has(source.orderId)) continue;
      sourceByOrder.set(source.orderId, {
        name: source.source,
      });
    }

    const auditByCanonicalOrder = new Map<string, ProcessorOrderAuditEntry[]>();
    const appendCanonicalAudit = (
      orderId: string,
      entry: ProcessorOrderAuditEntry,
    ): void => {
      auditByCanonicalOrder.set(orderId, [
        ...(auditByCanonicalOrder.get(orderId) ?? []),
        entry,
      ]);
    };
    for (const row of sourceRows)
      appendCanonicalAudit(row.orderId, {
        kind: 'source_observation',
        code: 'source_observation',
        occurredAt: row.observedAt.toISOString(),
        actor: row.source,
        outcome: null,
      });
    for (const row of orderCommandRows)
      appendCanonicalAudit(row.orderId, {
        kind: 'order_command',
        code: row.reasonCode ?? 'order_command',
        occurredAt: row.createdAt.toISOString(),
        actor: row.actorId,
        outcome: null,
      });

    const productionAuditByOrder = new Map<
      string,
      ProcessorOrderAuditEntry[]
    >();
    for (const row of productionCommandRows)
      productionAuditByOrder.set(row.productionOrderId, [
        ...(productionAuditByOrder.get(row.productionOrderId) ?? []),
        {
          kind: 'production_command',
          code: row.eventType,
          occurredAt: row.createdAt.toISOString(),
          actor: row.actorId,
          outcome: null,
        },
      ]);

    return {
      ...base,
      items: base.items.map((item) => {
        const resolved = identityByOrder.get(item.order.id);
        if (resolved === undefined)
          throw new Error(
            `Processor order identity was not resolved for ${item.order.id}.`,
          );
        const context: ProcessorOrderContext | null = (() => {
          if (resolved.canonical === null) return null;
          const selectedSource =
            sourceByOrder.get(resolved.canonical.canonicalOrderId) ?? null;
          const source =
            selectedSource === null
              ? null
              : {
                  name: selectedSource.name,
                };
          return {
            ...resolved.canonical,
            source,
            audit: recentOrderAuditFor(
              auditByCanonicalOrder.get(resolved.canonical.canonicalOrderId) ??
                [],
              productionAuditByOrder.get(item.order.id) ?? [],
            ),
          };
        })();
        return {
          ...item,
          identity: resolved.identity,
          canonical: context,
        };
      }),
    };
  },
});

export type ProcessorOrderControlReadModel = ReturnType<
  typeof makeProcessorOrderControlReadModel
>;
