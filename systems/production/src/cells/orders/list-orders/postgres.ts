import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq, gt, lt, ne } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { decodeOrderCursor, encodeOrderCursor } from './cursor.ts';
import { projectProductionOrder } from './project.ts';
import type { ListOrdersRepository } from './types.ts';

export const makeListOrdersPostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): ListOrdersRepository => ({
  list: (input, asOf) =>
    database.transaction(
      async (transaction) => {
        const cursorOrderId =
          input.cursor === undefined
            ? undefined
            : decodeOrderCursor(input.cursor);
        if (cursorOrderId === null) return { kind: 'invalid_cursor' };

        const location = await productionScopeReconciliationV1.load({
          locationId: input.locationId,
        });
        if (location?.isActive !== true) return { kind: 'location_not_found' };

        const rows = await transaction
          .select({
            id: schema.productionOrders.id,
            locationId: schema.productionOrders.locationId,
            externalOrderId: schema.orderDemands.displayReference,
            dueAt: schema.productionOrders.dueAt,
            priority: schema.productionOrders.priority,
            status: schema.productionOrders.operationalStatus,
            derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
            bagCount: schema.productionOrders.bagCount,
            bagCountSource: schema.productionOrders.bagCountSource,
            intakeVersion: schema.productionOrders.intakeVersion,
            version: schema.productionOrders.version,
          })
          .from(schema.productionOrders)
          .innerJoin(
            schema.orderDemands,
            and(
              eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
              eq(
                schema.orderDemands.locationId,
                schema.productionOrders.locationId,
              ),
            ),
          )
          .where(
            and(
              eq(schema.productionOrders.locationId, input.locationId),
              eq(schema.productionOrders.resolutionState, 'open'),
              ne(schema.productionOrders.executionStatus, 'finished'),
              input.status === undefined
                ? undefined
                : eq(schema.productionOrders.operationalStatus, input.status),
              input.dueAfter === undefined
                ? undefined
                : gt(schema.productionOrders.dueAt, input.dueAfter),
              input.dueBefore === undefined
                ? undefined
                : lt(schema.productionOrders.dueAt, input.dueBefore),
              cursorOrderId === undefined
                ? undefined
                : gt(schema.productionOrders.id, cursorOrderId),
            ),
          )
          .orderBy(asc(schema.productionOrders.id))
          .limit(input.limit + 1);

        const hasNextPage = rows.length > input.limit;
        const pageRows = rows.slice(0, input.limit);
        const last = pageRows.at(-1);
        return {
          kind: 'found',
          page: {
            items: pageRows.map((row) =>
              projectProductionOrder(row, asOf, location.timezone),
            ),
            nextCursor:
              hasNextPage && last !== undefined
                ? encodeOrderCursor(last.id)
                : null,
            asOf,
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ),
});
