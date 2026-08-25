import type { PostgresDatabase } from '@pressly/postgres/client';
import { desc, eq, inArray, lte, sql } from '@pressly/postgres/query';
import {
  listRecentOrderAuditV1CapabilityContract,
  type ListRecentOrderAuditV1Capability,
} from '../contracts/list-recent-order-audit-v1.ts';
import type { OrdersSchema } from '../schema/orders.ts';

const recentAuditLimit = listRecentOrderAuditV1CapabilityContract.perOrderLimit;

export const makeListRecentOrderAuditV1Capability = (
  db: PostgresDatabase,
  ordersSchema: Pick<
    OrdersSchema,
    'orderCommandReceipts' | 'orderSourceLinks' | 'orderSourceSnapshots'
  >,
): ListRecentOrderAuditV1Capability =>
  Object.freeze({
    contract: listRecentOrderAuditV1CapabilityContract,
    execute: async ({ canonicalOrderIds }) => {
      const rankedSources =
        canonicalOrderIds.length === 0
          ? null
          : db
              .select({
                canonicalOrderId: ordersSchema.orderSourceLinks.orderId,
                name: ordersSchema.orderSourceLinks.source,
                observedAt: ordersSchema.orderSourceSnapshots.observedAt,
                sourceLinkId: ordersSchema.orderSourceLinks.id,
                partitionRank: sql<number>`row_number() over (
                  partition by ${ordersSchema.orderSourceLinks.orderId}
                  order by ${ordersSchema.orderSourceSnapshots.observedAt} desc,
                    ${ordersSchema.orderSourceLinks.id} desc
                )`.as('partition_rank'),
              })
              .from(ordersSchema.orderSourceLinks)
              .innerJoin(
                ordersSchema.orderSourceSnapshots,
                eq(
                  ordersSchema.orderSourceSnapshots.sourceLinkId,
                  ordersSchema.orderSourceLinks.id,
                ),
              )
              .where(
                inArray(
                  ordersSchema.orderSourceLinks.orderId,
                  canonicalOrderIds,
                ),
              )
              .as('ranked_order_audit_sources_v1');
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
              .where(lte(rankedSources.partitionRank, recentAuditLimit))
              .orderBy(
                desc(rankedSources.observedAt),
                desc(rankedSources.sourceLinkId),
              );

      const rankedCommands =
        canonicalOrderIds.length === 0
          ? null
          : db
              .select({
                canonicalOrderId: ordersSchema.orderCommandReceipts.orderId,
                code: ordersSchema.orderCommandReceipts.reasonCode,
                actorId: ordersSchema.orderCommandReceipts.actorId,
                occurredAt: ordersSchema.orderCommandReceipts.createdAt,
                idempotencyKey:
                  ordersSchema.orderCommandReceipts.idempotencyKey,
                partitionRank: sql<number>`row_number() over (
                  partition by ${ordersSchema.orderCommandReceipts.orderId}
                  order by ${ordersSchema.orderCommandReceipts.createdAt} desc,
                    ${ordersSchema.orderCommandReceipts.idempotencyKey} desc
                )`.as('partition_rank'),
              })
              .from(ordersSchema.orderCommandReceipts)
              .where(
                inArray(
                  ordersSchema.orderCommandReceipts.orderId,
                  canonicalOrderIds,
                ),
              )
              .as('ranked_order_audit_commands_v1');
      const commands =
        rankedCommands === null
          ? []
          : (
              await db
                .select({
                  canonicalOrderId: rankedCommands.canonicalOrderId,
                  code: rankedCommands.code,
                  actorId: rankedCommands.actorId,
                  occurredAt: rankedCommands.occurredAt,
                })
                .from(rankedCommands)
                .where(lte(rankedCommands.partitionRank, recentAuditLimit))
                .orderBy(
                  desc(rankedCommands.occurredAt),
                  desc(rankedCommands.idempotencyKey),
                )
            ).map((row) => ({
              ...row,
              code: row.code ?? 'order_command',
            }));

      return { sources, commands };
    },
  });
