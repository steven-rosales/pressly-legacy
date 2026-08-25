import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, desc, eq, inArray, lte, sql } from '@pressly/postgres/query';

import {
  listRecentProductionOrderActivityV1CapabilityContract,
  type ListRecentProductionOrderActivityV1Capability,
} from '../contracts/list-recent-order-activity-v1.ts';
import type { ProductionSchema } from '../schema/production-schema.ts';

export const makeListRecentProductionOrderActivityV1Capability = (
  input: Readonly<{
    database: PostgresDatabase;
    schema: ProductionSchema;
  }>,
): ListRecentProductionOrderActivityV1Capability =>
  Object.freeze({
    contract: listRecentProductionOrderActivityV1CapabilityContract,
    list: async ({ productionOrderIds }) => {
      if (productionOrderIds.length === 0) return [];

      const ranked = input.database
        .select({
          productionOrderId: input.schema.workEvents.entityId,
          code: input.schema.workEvents.eventType,
          actorId: input.schema.workEvents.actorId,
          occurredAt: input.schema.workEvents.createdAt,
          id: input.schema.workEvents.id,
          partitionRank: sql<number>`row_number() over (
            partition by ${input.schema.workEvents.entityId}
            order by ${input.schema.workEvents.createdAt} desc,
              ${input.schema.workEvents.id} desc
          )`.as('partition_rank'),
        })
        .from(input.schema.workEvents)
        .where(
          and(
            eq(input.schema.workEvents.entityType, 'production_order'),
            inArray(input.schema.workEvents.entityId, [
              ...new Set(productionOrderIds),
            ]),
          ),
        )
        .as('ranked_production_order_activity_v1');

      return input.database
        .select({
          productionOrderId: ranked.productionOrderId,
          code: ranked.code,
          actorId: ranked.actorId,
          occurredAt: ranked.occurredAt,
        })
        .from(ranked)
        .where(
          lte(
            ranked.partitionRank,
            listRecentProductionOrderActivityV1CapabilityContract.maximumPerOrder,
          ),
        )
        .orderBy(desc(ranked.occurredAt), desc(ranked.id));
    },
  });
