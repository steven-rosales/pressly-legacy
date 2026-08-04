import type { Database } from '@pressly/db/client';
import { and, desc, eq, inArray, lte, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import * as orders from '@pressly/db/schema/orders';
import type { OperationalOrderAuditPort } from '../../../ports/operational-order-audit/operational-order-audit.port.ts';

const RECENT_AUDIT_LIMIT = 8;

export const makePostgresOperationalOrderAudit = (
  db: Database,
): OperationalOrderAuditPort => ({
  load: async ({ canonicalOrderIds, productionOrderIds }) => {
    const rankedSources =
      canonicalOrderIds.length === 0
        ? null
        : db
            .select({
              canonicalOrderId: orders.orderSourceLinks.orderId,
              name: orders.orderSourceLinks.source,
              observedAt: orders.orderSourceSnapshots.observedAt,
              sourceLinkId: orders.orderSourceLinks.id,
              partitionRank: sql<number>`row_number() over (
                partition by ${orders.orderSourceLinks.orderId}
                order by ${orders.orderSourceSnapshots.observedAt} desc,
                  ${orders.orderSourceLinks.id} desc
              )`.as('partition_rank'),
            })
            .from(orders.orderSourceLinks)
            .innerJoin(
              orders.orderSourceSnapshots,
              eq(
                orders.orderSourceSnapshots.sourceLinkId,
                orders.orderSourceLinks.id,
              ),
            )
            .where(inArray(orders.orderSourceLinks.orderId, canonicalOrderIds))
            .as('ranked_processor_order_sources');
    const sources =
      rankedSources === null
        ? []
        : await db
            .select({
              canonicalOrderId: rankedSources.canonicalOrderId,
              name: rankedSources.name,
              observedAt: rankedSources.observedAt,
            })
            .from(rankedSources)
            .where(lte(rankedSources.partitionRank, RECENT_AUDIT_LIMIT))
            .orderBy(
              desc(rankedSources.observedAt),
              desc(rankedSources.sourceLinkId),
            );

    const rankedOrderCommands =
      canonicalOrderIds.length === 0
        ? null
        : db
            .select({
              canonicalOrderId: orders.orderCommandReceipts.orderId,
              code: orders.orderCommandReceipts.reasonCode,
              actorId: orders.orderCommandReceipts.actorId,
              occurredAt: orders.orderCommandReceipts.createdAt,
              idempotencyKey: orders.orderCommandReceipts.idempotencyKey,
              partitionRank: sql<number>`row_number() over (
                partition by ${orders.orderCommandReceipts.orderId}
                order by ${orders.orderCommandReceipts.createdAt} desc,
                  ${orders.orderCommandReceipts.idempotencyKey} desc
              )`.as('partition_rank'),
            })
            .from(orders.orderCommandReceipts)
            .where(
              inArray(orders.orderCommandReceipts.orderId, canonicalOrderIds),
            )
            .as('ranked_processor_order_commands');
    const orderCommands =
      rankedOrderCommands === null
        ? []
        : (
            await db
              .select({
                canonicalOrderId: rankedOrderCommands.canonicalOrderId,
                code: rankedOrderCommands.code,
                actorId: rankedOrderCommands.actorId,
                occurredAt: rankedOrderCommands.occurredAt,
              })
              .from(rankedOrderCommands)
              .where(lte(rankedOrderCommands.partitionRank, RECENT_AUDIT_LIMIT))
              .orderBy(
                desc(rankedOrderCommands.occurredAt),
                desc(rankedOrderCommands.idempotencyKey),
              )
          ).map((row) => ({
            ...row,
            code: row.code ?? 'order_command',
          }));

    const rankedProductionCommands =
      productionOrderIds.length === 0
        ? null
        : db
            .select({
              productionOrderId: laundryProduction.workEvents.entityId,
              code: laundryProduction.workEvents.eventType,
              actorId: laundryProduction.workEvents.actorId,
              occurredAt: laundryProduction.workEvents.createdAt,
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
            .as('ranked_processor_production_order_commands');
    const productionCommands =
      rankedProductionCommands === null
        ? []
        : await db
            .select({
              productionOrderId: rankedProductionCommands.productionOrderId,
              code: rankedProductionCommands.code,
              actorId: rankedProductionCommands.actorId,
              occurredAt: rankedProductionCommands.occurredAt,
            })
            .from(rankedProductionCommands)
            .where(
              lte(rankedProductionCommands.partitionRank, RECENT_AUDIT_LIMIT),
            )
            .orderBy(
              desc(rankedProductionCommands.occurredAt),
              desc(rankedProductionCommands.id),
            );

    return { sources, orderCommands, productionCommands };
  },
});
